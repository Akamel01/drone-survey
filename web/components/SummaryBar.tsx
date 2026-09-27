"use client";

import { useEffect, useState } from "react";
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import type { MissionRecord } from "@/lib/missionRecords";
import { readPassphrase, subscribePassphrase, writePassphrase } from "@/lib/passphrase";
import { flightTimeDelta, saveProblem, type SiteChoice } from "@/lib/missionView";
import * as missionClient from "@/lib/missionClient";
import { firstSentence } from "@/lib/notice";
import type { NoticePayload } from "./Notice";
import type { Editing } from "@/app/plan/page";
import CountUp from "./CountUp";
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
  /** Page-owned Notice slot (M2 seam). Accepted but ignored until M4 wires it. */
  onNotice?: (p: Omit<NoticePayload, "key">) => void;
  /** The open signal for the count-up. Changes only when a Mission opens, so a
   *  slider edit moves the figures without animating them. Omitted = no count. */
  countKey?: number;
}

// Saving is the planner's only write. Dispatch, Withdraw, Flown and Remove all
// live on the Mission's own row, where its state is: the screen that failed had
// one Mission's controls in two places under two names, and a Dispatch button
// beside an editor cannot say which Mission it means (ADR 0021).
type SaveState = { kind: "idle" } | { kind: "saving" };

export default function SummaryBar({ spec, preview, editing, onSaved, sites = [], onNotice, countKey }: SummaryBarProps) {
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
    // Save outcomes report through the page-owned Notice slot: the verbatim
    // text goes to onNotice, never to an inline div. The saveProblem guard
    // above and copy-feedback below stay where they are.
    const report = (text: string, failed: boolean) => {
      onNotice?.({ title: firstSentence(text), body: text, missionName: editing.name.trim(), failed });
      setSave({ kind: "idle" });
    };
    try {
      const outcome = await missionClient.save({
        id: editing.id ?? undefined,
        // saveProblem above refuses a Spec with no site_id, so the guard here
        // is the non-null.
        site_id: spec.site_id!,
        site: spec.site,
        name: editing.name.trim(),
        date: spec.date,
        spec,
      });
      if (outcome.ok) {
        onSaved(outcome.mission);
        report(outcome.text, false);
      } else {
        report(outcome.text, true);
      }
    } catch (err) {
      report(
        `Not saved: ${err instanceof Error ? err.message : "the store could not be reached"}. Nothing changed.`,
        true,
      );
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
              <CountUp
                value={preview.flight_time_min}
                decimals={1}
                countKey={countKey}
                className={styles.leadFigure}
              />
              <span className={styles.leadUnit}>min</span>
            </div>
            <p className={styles.leadDelta}>{flightTimeDelta(preview.parts, preview.part_minutes)}</p>
          </div>
          <div className={styles.tiles}>
            <Tile label="GSD" value={preview.gsd_cm.toFixed(2)} unit="cm/px" decimals={2} countKey={countKey} />
            <Tile label="Photos" value={String(preview.photo_count)} countKey={countKey} />
            {/* The same three numbers mean different things for an orbit, so
                they are named for what they are rather than left quietly
                wrong. */}
            <Tile
              label={isOrbit ? "Rings" : "Lines"}
              value={String(preview.line_count)}
              countKey={countKey}
            />
            <Tile
              label={preview.parts > 1 ? "Flights" : "Flight"}
              value={String(preview.parts)}
              warn={preview.parts > 1}
              countKey={countKey}
            />
          </div>
          <div className={styles.quiet}>
            <QuietStat
              label={isOrbit ? "Arc spacing" : "Fwd spacing"}
              value={preview.fwd_spacing_m.toFixed(1)}
              unit="m"
              decimals={1}
              countKey={countKey}
            />
            <QuietStat
              label={isOrbit ? "Ring spacing" : "Side spacing"}
              value={preview.side_spacing_m.toFixed(1)}
              unit="m"
              decimals={1}
              countKey={countKey}
            />
            <QuietStat
              label="Effective speed"
              value={preview.capped_speed_ms.toFixed(1)}
              unit="m/s"
              warn={preview.capped_speed_ms < spec.flight.speed_ms}
              decimals={1}
              countKey={countKey}
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
function Tile({
  label,
  value,
  unit,
  warn,
  decimals = 0,
  countKey,
}: {
  label: string;
  value: string;
  unit?: string;
  warn?: boolean;
  decimals?: number;
  countKey?: number;
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={`mono ${styles.tileValue} ${warn ? styles.warn : ""}`}>
        <CountUp value={Number(value)} decimals={decimals} countKey={countKey} />
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

/** Spacing and speed: figures the operator checks less often than the four
 *  tiles, so they read as a quieter row rather than competing with them. */
function QuietStat({
  label,
  value,
  unit,
  warn,
  decimals = 1,
  countKey,
}: {
  label: string;
  value: string;
  unit?: string;
  warn?: boolean;
  decimals?: number;
  countKey?: number;
}) {
  return (
    <div className={styles.quietStat}>
      <span className={styles.quietLabel}>{label}</span>
      <span className={`mono ${styles.quietValue} ${warn ? styles.warn : ""}`}>
        <CountUp value={Number(value)} decimals={decimals} countKey={countKey} />
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
