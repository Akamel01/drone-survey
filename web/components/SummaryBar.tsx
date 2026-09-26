"use client";

import { useEffect, useState } from "react";
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import type { MissionRecord } from "@/lib/missionRecords";
import { readPassphrase, subscribePassphrase, writePassphrase } from "@/lib/passphrase";
import { describeSave, saveProblem, type SiteChoice } from "@/lib/missionView";
import { noteMissionsChanged } from "@/lib/actions";
import type { Editing } from "@/app/plan/page";
import styles from "./SummaryBar.module.css";

interface SummaryBarProps {
  spec: MissionSpec;
  preview: Preview;
  /** The stored Mission the editor is working on, and its Mission Name. */
  editing: Editing;
  /** The Mission the store wrote. It may be a different one from the one being
   *  edited: a change to a Mission already Dispatched is a new Mission, because
   *  a Spec is never edited (ADR 0021). */
  onSaved: (mission: MissionRecord) => void;
  /** The Sites already in the store, so a new Site cannot take one's name. */
  sites?: SiteChoice[];
}

// Saving is the planner's only write. Dispatch, Withdraw, Flown and Remove all
// live on the Mission's own row, where its state is: the screen that failed had
// one Mission's controls in two places under two names, and a Dispatch button
// beside an editor cannot say which Mission it means (ADR 0021).
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

export default function SummaryBar({ spec, preview, editing, onSaved, sites = [] }: SummaryBarProps) {
  const [copied, setCopied] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const hasProblems = preview.problems.length > 0;
  const isOrbit = spec.mission_type === "orbit";

  // Empty on the server (no localStorage there), filled in after mount, so the
  // server-rendered and first client-rendered HTML match. From here on this
  // field and the Missions view's own (plan decision 17) are one value: typed
  // into either, kept by `lib/passphrase.ts`, and echoed to both live.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setPassphrase(readPassphrase() ?? "");
    return subscribePassphrase(setPassphrase);
  }, []);

  function updatePassphrase(v: string) {
    // Persists (or silently no-ops where storage is unavailable) and notifies
    // the Missions view's field; that subscription is what sets `passphrase`
    // here too, so this field's own state does not need setting directly.
    writePassphrase(v);
  }

  const problem = saveProblem(spec, editing.name, sites);

  async function runSave() {
    if (problem || save.kind === "saving") return;
    setSave({ kind: "saving" });
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase },
        body: JSON.stringify({
          id: editing.id ?? undefined,
          site_id: spec.site_id,
          site: spec.site,
          name: editing.name.trim(),
          date: spec.date,
          spec,
        }),
      });
      const body = await res.json().catch(() => ({}));
      // A failed save must never look like a success, so only a 2xx carrying
      // the written record counts — anything else shows the server's own text.
      if (res.ok && body.mission) {
        // A Mission list open in another window shows this now, not at its
        // next five-minute poll.
        noteMissionsChanged();
        onSaved(body.mission as MissionRecord);
        setSave({ kind: "ok", text: describeSave(body) });
      } else {
        setSave({ kind: "error", text: body.error ?? `Not saved (HTTP ${res.status}). Nothing changed.` });
      }
    } catch (err) {
      setSave({
        kind: "error",
        text: `Not saved: ${err instanceof Error ? err.message : "the store could not be reached"}. Nothing changed.`,
      });
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
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
            label={preview.parts > 1 ? "Flights" : "Flight"}
            value={String(preview.parts)}
            warn={preview.parts > 1}
            title={
              preview.part_minutes.length > 1
                ? `Each flight returns home so the battery can be swapped: ${preview.part_minutes
                    .map((m) => `${m.toFixed(1)} min`)
                    .join(", ")}`
                : undefined
            }
          />
        </div>
        <div className={styles.actions}>
          <input
            type="password"
            className={styles.passphrase}
            placeholder="Wayfinder passphrase"
            // The secret shared with the store, typed once per browser and held
            // there — not a DJI or Wayfinder account.
            aria-label="Store passphrase"
            title="Shared secret, typed once per browser and stored only here"
            value={passphrase}
            onChange={(e) => updatePassphrase(e.target.value)}
          />
          <button
            className="primary"
            onClick={runSave}
            disabled={!!problem || save.kind === "saving"}
            title={problem ?? undefined}
          >
            {save.kind === "saving" ? "Saving…" : editing.id ? "Save Mission" : "Save new Mission"}
          </button>
          <button onClick={copy}>{copied ? "Copied" : "Copy spec"}</button>
          <button onClick={() => downloadMission(spec, editing.name)}>Download Mission Spec</button>
        </div>
      </div>
      {problem && <div className={styles.dispatchError}>Save: {problem}</div>}
      {save.kind === "ok" && <div className={styles.dispatchOk}>{save.text}</div>}
      {save.kind === "error" && <div className={styles.dispatchError}>{save.text}</div>}
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

/** A copy of the Spec on the operator's own disk. The store holds the Mission;
 *  this is the fallback for a day the store cannot be reached at all. */
function downloadMission(spec: MissionSpec, name: string) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const label = [spec.site_id, name.trim(), spec.date].filter(Boolean).join("-");
  a.download = `${label.replace(/[^a-zA-Z0-9._-]+/g, "-") || "mission"}.mission.json`;
  a.click();
  URL.revokeObjectURL(url);
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
