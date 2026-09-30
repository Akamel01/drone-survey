"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import type { MissionRecord } from "@/lib/missionRecords";
import { safeStorage } from "@/lib/actions";
import { flightTimeDelta, specBlocker, type SiteChoice } from "@/lib/missionView";
import * as missionClient from "@/lib/missionClient";
import { firstSentence } from "@/lib/notice";
import type { NoticePayload } from "./Notice";
import type { Editing } from "@/app/plan/page";
import CountUp from "./CountUp";
import SaveSheet, { type EditedMission, type SaveRequest } from "./SaveSheet";
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
  /** The stored Mission being edited, as the list last read it. Its state is
   *  what the Save sheet offers from, so it is the list's and not the one the
   *  editor opened with: a Mission can be Loaded while it is being edited.
   *  Absent while the list has not read it yet. */
  edited?: EditedMission | null;
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

// Per-browser memory for the collapse, beside the passphrase key convention
// (`lib/passphrase.ts:14`). Read once after mount, written on every toggle.
// Where storage itself is blocked both no-op and the Summary stays collapsed.
const SUMMARY_OPEN_KEY = "drone-planner.summary-open";

type SaveState = { kind: "idle" } | { kind: "saving" };

export default function SummaryBar({ spec, preview, editing, onSaved, sites = [], edited, onNotice, countKey }: SummaryBarProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  // The Save sheet; `session` counts opens so each starts from the planner.
  const [sheet, setSheet] = useState({ open: false, session: 0 });
  const hasProblems = preview.problems.length > 0;
  const isOrbit = spec.mission_type === "orbit";
  const toggleRef = useRef<HTMLButtonElement>(null);
  const regionId = useId();

  // Collapsed on the server (no localStorage there) and on first paint, so
  // the server-rendered and first client-rendered HTML match; the stored
  // choice applies after mount. The Summary's own passphrase field is gone
  // (UI-27, #304) — the Missions view keeps its field until #244.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    if (safeStorage()?.getItem(SUMMARY_OPEN_KEY) === "1") setOpen(true);
  }, []);

  function setSummaryOpen(v: boolean) {
    setOpen(v);
    try {
      safeStorage()?.setItem(SUMMARY_OPEN_KEY, v ? "1" : "0");
    } catch {
      // Unavailable: persistence no-ops and the next load stays collapsed.
    }
  }

  // Escape inside the expanded region collapses back to the toggle and
  // returns focus to it (spec §10). On the toggle itself Escape is a no-op:
  // only the region owns this handler.
  function collapseOnEscape(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    setSummaryOpen(false);
    toggleRef.current?.focus();
  }

  // The collapsed one-liner (E1→R4): flights-count-only from `preview.parts`,
  // so the orbit's lines/rings edge never reads here; the per-battery split
  // stays exclusively under the lead.
  const trio = `${preview.parts} flight${preview.parts === 1 ? "" : "s"} · GSD ${preview.gsd_cm.toFixed(2)} cm/px · ${preview.photo_count} photos`;

  const problem = specBlocker(spec, preview.problems);
  // A Mission with an id has been stored. Until the list has read it (a save
  // just made, not yet listed) it is the Planned one that save wrote.
  const editedMission: EditedMission | null = editing.id
    ? (edited ?? { state: "planned", name: editing.name, site: spec.site, site_id: spec.site_id, date: spec.date })
    : null;

  async function runSave({ choice, name, site }: SaveRequest) {
    if (save.kind === "saving") return;
    setSave({ kind: "saving" });
    // Save outcomes report through the page-owned Notice slot: the verbatim
    // text goes to onNotice, never to an inline div. The Save sheet has
    // already closed by now, so the outcome is read on the page behind it.
    const report = (text: string, failed: boolean) => {
      onNotice?.({ title: firstSentence(text), body: text, missionName: name, failed });
      setSave({ kind: "idle" });
    };
    try {
      const outcome = await missionClient.save(
        {
          // Only a new Mission is a save with no id. Changes and a replacement
          // name the Mission, and the store decides what that means from its
          // state: in place while Planned, a fork once Dispatched.
          id: choice === "new" ? undefined : (editing.id ?? undefined),
          site_id: site.site_id,
          site: site.site,
          name,
          date: spec.date,
          // The Spec carries the Site it is saved under, as the store reads it.
          spec: { ...spec, site: site.site, site_id: site.site_id },
        },
        editedMission ? { choice, from: editedMission.name } : undefined,
      );
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
    <div className={`${styles.wrap} ${open ? styles.open : styles.collapsed}`}>
      <div className={styles.bar}>
        <div className={styles.figures}>
          <div className={styles.leadHead}>
            {/* One number leads (spec § 8): flight time, with the per-battery
                split named in words underneath it instead of hiding in a hover
                title (#183). This block is shared by both states, so its
                CountUp keeps `countKey` and never replays on toggle. */}
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
              {/* Collapsed, the one-liner below carries the flight count; the
                  per-battery split shows only when the details are open, so
                  the count never appears twice. */}
              {open && <p className={styles.leadDelta}>{flightTimeDelta(preview.parts, preview.part_minutes)}</p>}
            </div>
            {/* Dedicated toggle, never the whole bar (R1): a chevron with a
                directional name, a ≥44px target (spec §11), focus staying on
                it across expand and collapse. */}
            <button
              ref={toggleRef}
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={regionId}
              aria-label={open ? "Hide details" : "Show details"}
              onClick={() => setSummaryOpen(!open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          {!open && <p className={styles.trio}>{trio}</p>}
          {open && (
            <div id={regionId} className={styles.details} onKeyDown={collapseOnEscape}>
              <div className={styles.tiles}>
                <Tile label="GSD" value={preview.gsd_cm.toFixed(2)} unit="cm/px" decimals={2} countKey={undefined} />
                <Tile label="Photos" value={String(preview.photo_count)} countKey={undefined} />
                {/* The same three numbers mean different things for an orbit, so
                    they are named for what they are rather than left quietly
                    wrong. */}
                <Tile
                  label={isOrbit ? "Rings" : "Lines"}
                  value={String(preview.line_count)}
                  countKey={undefined}
                />
                <Tile
                  label={preview.parts > 1 ? "Flights" : "Flight"}
                  value={String(preview.parts)}
                  warn={preview.parts > 1}
                  countKey={undefined}
                />
              </div>
              <div className={styles.quiet}>
                <QuietStat
                  label={isOrbit ? "Arc spacing" : "Fwd spacing"}
                  value={preview.fwd_spacing_m.toFixed(1)}
                  unit="m"
                  decimals={1}
                  countKey={undefined}
                />
                <QuietStat
                  label={isOrbit ? "Ring spacing" : "Side spacing"}
                  value={preview.side_spacing_m.toFixed(1)}
                  unit="m"
                  decimals={1}
                  countKey={undefined}
                />
                <QuietStat
                  label="Effective speed"
                  value={preview.capped_speed_ms.toFixed(1)}
                  unit="m/s"
                  warn={preview.capped_speed_ms < spec.flight.speed_ms}
                  decimals={1}
                  countKey={undefined}
                />
              </div>
              <button className={`glass-clear ${styles.detailsCopy}`} onClick={copy}>
                {copied ? "Copied" : "Copy spec"}
              </button>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <button
            className="primary"
            onClick={() => setSheet((s) => ({ open: true, session: s.session + 1 }))}
            disabled={!!problem || save.kind === "saving"}
            // UI-22 hint: the save hint below describes the disabled Save;
            // no title (dead on disabled buttons, hover-only channel).
            aria-describedby={problem ? "save-hint" : undefined}
          >
            {save.kind === "saving" ? "Saving…" : "Save Mission"}
          </button>
          <button className="glass-clear" onClick={() => downloadMission(spec, editing.name)}>
            Download Mission Spec
          </button>
          {/* UI-22 hint: specBlocker wording verbatim, no "Save:" prefix.
              Plain <p>, conditional so no dangling describedby. After both
              buttons, so they share one row and the hint sits under it. */}
          {problem && (
            <p id="save-hint" className={styles.saveHint}>
              {problem}
            </p>
          )}
        </div>
      </div>
      {hasProblems && (
        <ul className={styles.problems}>
          {preview.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <SaveSheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        session={sheet.session}
        spec={spec}
        editing={editing}
        edited={editedMission}
        sites={sites}
        onSave={(request) => {
          setSheet((s) => ({ ...s, open: false }));
          void runSave(request);
        }}
      />
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
