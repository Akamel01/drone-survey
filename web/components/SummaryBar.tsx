"use client";

import { useEffect, useState } from "react";
import { dispatchProblem, type MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import { downloadMission } from "@/lib/savedMissions";
import styles from "./SummaryBar.module.css";

interface SummaryBarProps {
  spec: MissionSpec;
  preview: Preview;
  onSaveMission: () => void;
}

// Typed once per browser, never baked into the code: the passphrase is a
// secret the operator holds, not something the planner should ship with.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

type DispatchState = { kind: "idle" } | { kind: "sending" } | { kind: "ok"; key: string; parts: number } | { kind: "error"; message: string };

export default function SummaryBar({ spec, preview, onSaveMission }: SummaryBarProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
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
        setDispatch({ kind: "ok", key: body.key, parts: preview.parts });
      } else {
        setDispatch({ kind: "error", message: body.error ?? `Dispatch failed (${res.status})` });
      }
    } catch (err) {
      setDispatch({ kind: "error", message: err instanceof Error ? err.message : "Dispatch failed" });
    }
  }

  function save() {
    onSaveMission();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
          <button onClick={save}>{saved ? "Saved" : "Save mission"}</button>
          <button className="primary" onClick={() => downloadMission(spec)}>
            Download Mission Spec
          </button>
        </div>
      </div>
      {dispatch.kind === "ok" && (
        <div className={styles.dispatchOk}>
          Dispatched: {dispatch.key}. On the Controller, open {cardsFor(dispatch.parts)} once it is Loaded.
        </div>
      )}
      {dispatch.kind === "error" && <div className={styles.dispatchError}>{dispatch.message}</div>}
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

// A Load puts part i into card WAYFINDER i (ADR 0016), so the card is known
// before the Controller is plugged in.
function cardsFor(parts: number): string {
  return parts > 1 ? `WAYFINDER 1 to WAYFINDER ${parts}, one part each, in order` : "WAYFINDER 1";
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
