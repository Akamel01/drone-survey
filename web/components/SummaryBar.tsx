"use client";

import { useEffect, useState } from "react";
import { dispatchProblem, siteNameProblem, type MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import { downloadMission, type SavedStatus } from "@/lib/savedMissions";
import { noteMissionsChanged } from "@/lib/actions";
import styles from "./SummaryBar.module.css";

/** The saved Mission the editor is working on, and what may be done to it. */
export interface EditingMission {
  saved_at: string;
  name: string;
  status: SavedStatus;
}

interface SummaryBarProps {
  spec: MissionSpec;
  preview: Preview;
  /** Saves the editor's Spec as a new saved Mission. */
  onSaveMission: () => void;
  editing: EditingMission | null;
  /** Replaces the edited entry in place. Only ever called once the rule in
   *  `savedMissionState` allows it, or once its Spec has been withdrawn. */
  onOverwrite: (saved_at: string) => void;
}

// Typed once per browser, never baked into the code: the passphrase is a
// secret the operator holds, not something the planner should ship with.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

type DispatchState = { kind: "idle" } | { kind: "sending" } | { kind: "ok"; key: string; parts: number } | { kind: "error"; message: string };

export default function SummaryBar({
  spec,
  preview,
  onSaveMission,
  editing,
  onOverwrite,
}: SummaryBarProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overwriting, setOverwriting] = useState(false);
  const [overwriteNote, setOverwriteNote] = useState<{ text: string; failed: boolean } | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [dispatch, setDispatch] = useState<DispatchState>({ kind: "idle" });
  const hasProblems = preview.problems.length > 0;
  const isOrbit = spec.mission_type === "orbit";

  // Empty on the server (no localStorage there), filled in after mount —
  // same reasoning as the saved-missions list on the page itself.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setPassphrase(localStorage.getItem(PASSPHRASE_KEY) ?? "");
  }, []);

  function updatePassphrase(v: string) {
    setPassphrase(v);
    try {
      localStorage.setItem(PASSPHRASE_KEY, v);
    } catch {
      // Unavailable (private browsing, quota, disabled storage) — persistence silently no-ops.
    }
  }

  const specProblem = dispatchProblem(spec);
  const saveProblem = siteNameProblem(spec.site);
  const dispatchDisabled = dispatch.kind === "sending" || !!specProblem || !passphrase.trim();

  async function runDispatch() {
    setDispatch({ kind: "sending" });
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase },
        body: JSON.stringify(spec),
      });
      const body = await res.json();
      // A failed Dispatch must never look like a success, so only a 2xx with
      // a storage key counts — anything else surfaces the server's own text.
      if (res.ok && body.key) {
        // A Mission status view open elsewhere shows this Spec now, not at its
        // next five-minute poll (issue #126).
        noteMissionsChanged();
        setDispatch({ kind: "ok", key: body.key, parts: preview.parts });
      } else {
        setDispatch({ kind: "error", message: body.error ?? `Dispatch failed (${res.status})` });
      }
    } catch (err) {
      setDispatch({ kind: "error", message: err instanceof Error ? err.message : "Dispatch failed" });
    }
  }

  function save() {
    // The server refuses a nameless Mission too (lib/spec.ts); this only says
    // so here, next to the control, instead of after a round trip.
    if (saveProblem) return;
    onSaveMission();
    setOverwriteNote(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Saving over a Mission that has already left the planner is the one write
  // here that can make the planner disagree with the field: the Spec in the
  // store is immutable, so the entry would quietly stop describing the KMZ the
  // pilot is flying. So an overwrite either changes nothing outside the
  // planner, or it withdraws the Dispatched Spec first and says so (issue
  // #127). A refused withdrawal is a refused overwrite — never a silent one.
  async function overwrite() {
    if (saveProblem || !editing || overwriting) return;
    const { status, name, saved_at } = editing;

    if (status.can_overwrite) {
      onOverwrite(saved_at);
      setOverwriteNote({ text: `“${name}” replaced with what is in the editor.`, failed: false });
      return;
    }
    if (!status.dispatched_key) {
      // Nothing to withdraw and nothing to name: the honest answer is no.
      setOverwriteNote({
        text: `“${name}” cannot be saved over. ${status.why_not ?? ""} Use Save as new.`,
        failed: true,
      });
      return;
    }
    if (!passphrase.trim()) {
      setOverwriteNote({
        text: "Withdrawing the Dispatched Spec needs the Wayfinder passphrase, so the overwrite cannot go ahead.",
        failed: true,
      });
      return;
    }

    const agreed = window.confirm(
      `Save over “${name}”?\n\n` +
        `Its Dispatched Spec\n\n    ${status.dispatched_key}\n\n` +
        "WILL BE WITHDRAWN. The host is told not to Load it, and it leaves the queue.\n\n" +
        (status.state === "loaded"
          ? "It has already been Loaded onto the Controller. A withdrawal is refused at that point, and a KMZ already on the card is not recalled by one — expect this to fail and to have to handle the card yourself.\n\n"
          : "") +
        "The saved Mission is then replaced by what is in the editor. To keep both, cancel and use Save as new.",
    );
    if (!agreed) return;

    setOverwriting(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase },
        body: JSON.stringify({ key: status.dispatched_key }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOverwriteNote({
          text: `Not saved over: the Dispatched Spec was not withdrawn (${body.error ?? `HTTP ${res.status}`}). Nothing was changed.`,
          failed: true,
        });
        return;
      }
      // Only now: the withdrawal landed, so the saved entry may follow it.
      noteMissionsChanged();
      onOverwrite(saved_at);
      setOverwriteNote({
        text: `Withdrew ${status.dispatched_key}, and replaced “${name}” with what is in the editor.`,
        failed: false,
      });
    } catch (err) {
      setOverwriteNote({
        text: `Not saved over: ${err instanceof Error ? err.message : "the withdrawal failed"}. Nothing was changed.`,
        failed: true,
      });
    } finally {
      setOverwriting(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Stat label="GSD" value={preview.gsd_cm.toFixed(2)} unit="cm/px" />
        <Stat label="Photos" value={String(preview.photo_count)} />
        {/* The same three numbers mean different things for an orbit, so they
            are named for what they are rather than left quietly wrong. */}
        <Stat label={isOrbit ? "Rings" : "Lines"} value={String(preview.line_count)} />
        <Stat
          label={isOrbit ? "Arc spacing" : "Fwd spacing"}
          value={preview.fwd_spacing_m.toFixed(1)}
          unit="m"
        />
        <Stat
          label={isOrbit ? "Ring spacing" : "Side spacing"}
          value={preview.side_spacing_m.toFixed(1)}
          unit="m"
        />
        <Stat
          label="Effective speed"
          value={preview.capped_speed_ms.toFixed(1)}
          unit="m/s"
          warn={preview.capped_speed_ms < spec.flight.speed_ms}
        />
        <Stat label="Flight time" value={preview.flight_time_min.toFixed(1)} unit="min" />
        <Stat
          label={preview.parts > 1 ? "Batteries" : "Parts"}
          value={String(preview.parts)}
          warn={preview.parts > 1}
          title={
            preview.part_minutes.length > 1
              ? `Each part returns home so the battery can be swapped: ${preview.part_minutes
                  .map((m) => `${m.toFixed(1)} min`)
                  .join(", ")}`
              : undefined
          }
        />
        <div className={styles.actions}>
          <input
            type="password"
            className={styles.passphrase}
            placeholder="Wayfinder passphrase"
            // The secret shared with the Dispatch endpoint, typed once per
            // browser and held there — not a DJI or Wayfinder account.
            aria-label="Dispatch passphrase"
            title="Shared dispatch secret, typed once per browser and stored only here"
            value={passphrase}
            onChange={(e) => updatePassphrase(e.target.value)}
          />
          <button
            className="primary"
            disabled={dispatchDisabled}
            title={specProblem ?? undefined}
            onClick={runDispatch}
          >
            {dispatch.kind === "sending" ? "Dispatching…" : "Dispatch"}
          </button>
          <button onClick={copy}>{copied ? "Copied" : "Copy spec"}</button>
          {/* A Mission that has been Dispatched offers Save as only; the
              overwrite beside it is a separate, spelled-out act (issue #127). */}
          {editing && (
            <button
              onClick={overwrite}
              disabled={!!saveProblem || overwriting}
              title={saveProblem ?? editing.status.why_not ?? undefined}
            >
              {overwriting
                ? "Withdrawing…"
                : editing.status.can_overwrite
                  ? `Save over “${editing.name}”`
                  : `Overwrite “${editing.name}”…`}
            </button>
          )}
          <button onClick={save} disabled={!!saveProblem} title={saveProblem ?? undefined}>
            {saved ? "Saved" : editing ? "Save as new mission" : "Save mission"}
          </button>
          <button className="primary" onClick={() => downloadMission(spec)}>
            Download Mission Spec
          </button>
        </div>
      </div>
      {dispatch.kind === "ok" && (
        <div className={styles.dispatchOk}>
          Dispatched: {dispatch.key} ({dispatch.parts} part{dispatch.parts === 1 ? "" : "s"}). Controller cards
          are assigned when the host Loads it and appear on the mission row once reported.
        </div>
      )}
      {dispatch.kind === "error" && <div className={styles.dispatchError}>{dispatch.message}</div>}
      {saveProblem && <div className={styles.dispatchError}>Save mission: {saveProblem}.</div>}
      {editing && !editing.status.can_overwrite && (
        <div className={styles.dispatchError}>
          “{editing.name}” has left the planner. {editing.status.why_not} Save as new, or overwrite it and
          withdraw the Dispatched Spec.
        </div>
      )}
      {overwriteNote && (
        <div className={overwriteNote.failed ? styles.dispatchError : styles.dispatchOk}>
          {overwriteNote.text}
        </div>
      )}
      {hasProblems && (
        <ul className={styles.problems}>
          {preview.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  warn,
  title,
}: {
  label: string;
  value: string;
  unit?: string;
  warn?: boolean;
  title?: string;
}) {
  return (
    <div className={styles.stat} title={title}>
      <span className={styles.label}>{label}</span>
      <span className={`mono ${styles.statValue} ${warn ? styles.warn : ""}`}>
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
