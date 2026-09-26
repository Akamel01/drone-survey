"use client";

import { useEffect, useState } from "react";
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import type { MissionRecord } from "@/lib/missionRecords";
import { safeStorage } from "@/lib/actions";
import { describeSave, flightTimeDelta, saveProblem, type SiteChoice } from "@/lib/missionView";
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

// Typed once per browser, never baked into the code: the passphrase is a
// secret the operator holds, not something the planner should ship with.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

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
  // server-rendered and first client-rendered HTML match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setPassphrase(safeStorage()?.getItem(PASSPHRASE_KEY) ?? "");
  }, []);

  function updatePassphrase(v: string) {
    setPassphrase(v);
    try {
      safeStorage()?.setItem(PASSPHRASE_KEY, v);
    } catch {
      // Unavailable (private browsing, quota, disabled storage) — persistence
      // silently no-ops, and the Mission list says it cannot read the store.
    }
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
        <div className={styles.figures}>
          {/* One number leads (spec § 8): flight time, with the per-battery
              split named in words underneath it instead of hiding in a hover
              title (#183). */}
          <div className={styles.lead}>
            <span className={styles.leadLabel}>Flight time</span>
            <div className={styles.leadRow}>
              <span className={styles.leadFigure}>{preview.flight_time_min.toFixed(1)}</span>
              <span className={styles.leadUnit}>min</span>
            </div>
            <p className={styles.leadDelta}>{flightTimeDelta(preview.parts, preview.part_minutes)}</p>
          </div>
          <div className={styles.tiles}>
            <Tile label="GSD" value={preview.gsd_cm.toFixed(2)} unit="cm/px" />
            <Tile label="Photos" value={String(preview.photo_count)} />
            {/* The same three numbers mean different things for an orbit, so
                they are named for what they are rather than left quietly
                wrong. */}
            <Tile label={isOrbit ? "Rings" : "Lines"} value={String(preview.line_count)} />
            <Tile
              label={preview.parts > 1 ? "Flights" : "Flight"}
              value={String(preview.parts)}
              warn={preview.parts > 1}
            />
          </div>
          <div className={styles.quiet}>
            <QuietStat
              label={isOrbit ? "Arc spacing" : "Fwd spacing"}
              value={preview.fwd_spacing_m.toFixed(1)}
              unit="m"
            />
            <QuietStat
              label={isOrbit ? "Ring spacing" : "Side spacing"}
              value={preview.side_spacing_m.toFixed(1)}
              unit="m"
            />
            <QuietStat
              label="Effective speed"
              value={preview.capped_speed_ms.toFixed(1)}
              unit="m/s"
              warn={preview.capped_speed_ms < spec.flight.speed_ms}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <div className={styles.passphraseWrap}>
            <input
              type="password"
              className={styles.passphrase}
              placeholder="Wayfinder passphrase"
              // The secret shared with the store, typed once per browser and
              // held there — not a DJI or Wayfinder account.
              aria-label="Store passphrase"
              aria-describedby="summary-passphrase-hint"
              value={passphrase}
              onChange={(e) => updatePassphrase(e.target.value)}
            />
            <p className={styles.passphraseHint} id="summary-passphrase-hint">
              Shared secret, typed once per browser and held only here.
            </p>
          </div>
          <button
            className="primary"
            onClick={runSave}
            disabled={!!problem || save.kind === "saving"}
            title={problem ?? undefined}
          >
            {save.kind === "saving" ? "Saving…" : editing.id ? "Save Mission" : "Save new Mission"}
          </button>
          <button className="glass-clear" onClick={copy}>
            {copied ? "Copied" : "Copy spec"}
          </button>
          <button className="glass-clear" onClick={() => downloadMission(spec, editing.name)}>
            Download Mission Spec
          </button>
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

/** One of the four boxed figures: GSD, Photos, Lines/Rings, Flights (spec's
 *  metric tile, § 8). Flight time itself leads above these instead of sitting
 *  among them (spec § 2 rule 4: one number leads). */
function Tile({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={`mono ${styles.tileValue} ${warn ? styles.warn : ""}`}>
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

/** Spacing and speed: figures the operator checks less often than the four
 *  tiles, so they read as a quieter row rather than competing with them. */
function QuietStat({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={styles.quietStat}>
      <span className={styles.quietLabel}>{label}</span>
      <span className={`mono ${styles.quietValue} ${warn ? styles.warn : ""}`}>
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
