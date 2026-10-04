"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  UNREACHABLE_CHECKLIST,
  answerFor,
  boardAddress,
  followLoad,
  localNetworkRefused,
  missionLabel,
  readBoard,
  readBoardAddress,
  rowFor,
  saveBoardAddress,
  startLoad,
  type BoardMission,
  type BoardRead,
  type LoadAnswer,
} from "@/lib/board";
import { reportLoaded, type MarkResult } from "@/lib/loadedMark";
import type { MissionRow } from "@/lib/missionRecords";
import type { NoticePayload } from "./Notice";
import Sheet from "./Sheet";
import styles from "./LoadSheet.module.css";

// Load a Mission at the aircraft (PWA-4, #318): the phone, on its own hotspot,
// asks the board what is ready, sends the Load of one, and shows what the
// board says came of it. The board's side is scripts/board; the wording of the
// result is lib/board.ts. This renders it.
//
// The view stays mounted while the sheet is closed, so a Load already running
// goes on being followed and its result still reaches the Notice.

type Phase =
  | { name: "checking" }
  /** Nothing answered, or the board answered with a refusal of this app (`reason`). */
  | { name: "unreachable"; reason: string | null; permissionRefused: boolean }
  | { name: "ready"; read: BoardRead; refusal: string | null }
  | { name: "running"; mission: BoardMission; lost: boolean }
  | { name: "done"; title: string; answer: LoadAnswer; stored: string };

interface LoadSheetProps {
  open: boolean;
  onClose: () => void;
  /** The Missions in the store as the list last read them; names the board's
   *  entries and says which Mission to mark Loaded. */
  missions: MissionRow[];
  onNotice: (p: Omit<NoticePayload, "key">) => void;
}

/** What the store was told, for the result's last line. */
function storedLine(result: MarkResult | "unknown"): string {
  if (result === "sent") return "Marked Loaded in the store.";
  if (result === "waiting") return "The store could not be reached. It will be marked Loaded when this phone is back online.";
  if (result === "refused") return "The store did not take the Load. Refresh the Mission list.";
  return "This Mission is not in the list on this phone, so the store was not told. The board reports it when it has signal.";
}

export default function LoadSheet({ open, onClose, missions, onNotice }: LoadSheetProps) {
  const headingId = useId();
  const addressId = useId();
  const [phase, setPhase] = useState<Phase>({ name: "checking" });
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // What the closures below read when they finish, whatever has re-rendered since.
  const latest = useRef({ missions, onNotice, phase });
  const following = useRef<AbortController | null>(null);
  useEffect(() => {
    latest.current = { missions, onNotice, phase };
  });

  useEffect(() => () => following.current?.abort(), []);

  const check = useCallback(async (address = readBoardAddress(), refusal: string | null = null) => {
    setPhase({ name: "checking" });
    const reply = await readBoard(address);
    if (reply.ok) return setPhase({ name: "ready", read: reply.body, refusal });
    setPhase({
      name: "unreachable",
      reason: reply.unreachable ? null : reply.reason,
      permissionRefused: reply.unreachable ? await localNetworkRefused() : false,
    });
  }, []);

  // Opening reads the board afresh, unless a Load is being followed.
  useEffect(() => {
    if (!open || latest.current.phase.name === "running") return;
    const address = readBoardAddress();
    setTyped(address);
    void check(address);
  }, [open, check]);

  const load = async (mission: BoardMission) => {
    const address = readBoardAddress();
    setSeconds(0);
    setPhase({ name: "running", mission, lost: false });
    const started = await startLoad(address, mission.id);
    if (!started.ok) {
      // Refused to start (not plugged in, busy, no longer waiting): say why, with the list fresh.
      if (started.unreachable) return void check(address);
      return void check(address, started.reason);
    }
    const stop = (following.current = new AbortController());
    const ended = await followLoad(address, started.body.id, {
      signal: stop.signal,
      onLost: (lost) => setPhase((p) => (p.name === "running" ? { ...p, lost } : p)),
    });
    if (!ended) return;
    const { missions: rows, onNotice: notice } = latest.current;
    const row = rowFor(rows, mission.id);
    const title = row ? row.name : `${mission.site}, ${mission.date}`;
    const answer = answerFor(ended);
    // Only a Load that was written and read back is told to the store.
    const stored =
      ended.state !== "loaded" ? "" : storedLine(row ? await reportLoaded(row.id, ended.cards) : "unknown");
    setPhase({ name: "done", title, answer, stored });
    notice({
      title: answer.headline,
      body: [answer.headline, answer.detail, stored].filter(Boolean).join(" "),
      missionName: title,
      failed: answer.tone === "stop",
    });
  };

  useEffect(() => {
    if (phase.name !== "running") return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [phase.name]);

  const retry = () => {
    const address = boardAddress(typed);
    setBad(address === null);
    if (!address) return;
    saveBoardAddress(address);
    setTyped(address);
    void check(address);
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={headingId}>
      <div>
        <h3 id={headingId} className={styles.title}>
          Load a Mission
        </h3>
        <p className={styles.lead}>
          Join the board over this phone&apos;s hotspot and write a Mission to the Controller. Nothing reaches the
          Controller until you press Load.
        </p>
      </div>
      <div role="status" aria-live="polite" className={styles.status}>
        {phase.name === "checking" && <p className={styles.quiet}>Looking for the board…</p>}

        {phase.name === "unreachable" && (
          <>
            <p className={styles.failure}>
              {phase.reason ?? "The board did not answer."}
              {phase.permissionRefused && " This browser has refused the local-network permission for this app."}
            </p>
            <p className={styles.quiet}>Check, in this order:</p>
            <ol className={styles.checklist}>
              {UNREACHABLE_CHECKLIST.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <div className={styles.field}>
              <label htmlFor={addressId}>Board address</label>
              <input
                id={addressId}
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setBad(false);
                }}
              />
              {bad && <p className={styles.hint}>That is not an address. Try board.local or 192.168.43.1.</p>}
            </div>
            <div className={styles.actions}>
              <button type="button" className="primary" onClick={retry}>
                Try again
              </button>
            </div>
          </>
        )}

        {phase.name === "ready" && (
          <>
            {phase.refusal && <p className={styles.failure}>{phase.refusal}</p>}
            {!phase.read.controller && (
              <p className={styles.failure}>
                The Controller is not plugged into the board. Plug it in and unlock it, then Refresh.
              </p>
            )}
            {phase.read.missions.length === 0 ? (
              <p className={styles.quiet}>
                {phase.read.note ?? "No Mission is waiting to Load. Dispatch one in the planner and let the board Collect it."}
              </p>
            ) : (
              <ul className={styles.list}>
                {phase.read.missions.map((m) => {
                  const label = missionLabel(m, rowFor(missions, m.id));
                  return (
                    <li key={m.id} className={styles.row}>
                      <div className={styles.rowText}>
                        <div className={styles.rowTitle}>{label.title}</div>
                        <div className={styles.rowDetail}>{label.detail}</div>
                      </div>
                      <button
                        type="button"
                        className="primary"
                        disabled={!phase.read.controller || phase.read.busy !== null}
                        aria-label={`Load ${label.title}`}
                        onClick={() => void load(m)}
                      >
                        Load
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={styles.actions}>
              <button type="button" onClick={() => void check()}>
                Refresh
              </button>
            </div>
          </>
        )}

        {phase.name === "running" && (
          <>
            <p className={styles.progress}>
              Loading {missionLabel(phase.mission, rowFor(missions, phase.mission.id)).title}…
            </p>
            <p className={styles.quiet}>
              The board is writing each Card and reading it back, {seconds} s so far. Keep the Controller plugged in and
              do not touch it.
            </p>
            {phase.lost && (
              <p className={styles.failure}>
                Lost contact with the board. The Load carries on there; this keeps asking until it answers.
              </p>
            )}
          </>
        )}
      </div>

      {phase.name === "done" && (
        <>
          <div className={`panel-light ${styles.result}`}>
            <span className={styles.chip}>{phase.answer.tone === "go" ? "Loaded" : "Not Loaded"}</span>
            <h3 className={styles.resultTitle}>{phase.answer.headline}</h3>
            <div className={styles.resultSecondary}>{phase.title}</div>
            <p className={styles.resultLine}>{phase.answer.detail}</p>
            {phase.stored && <p className={styles.resultLine}>{phase.stored}</p>}
          </div>
          {phase.answer.cards.length > 0 && (
            <div className={`panel-light-alt ${styles.result}`}>
              {phase.answer.cards.map((c) => (
                <div key={c.card} className={styles.fact}>
                  <span className={styles.factLabel}>{c.card}</span>
                  <span className={styles.factValue}>{c.points} points</span>
                </div>
              ))}
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" onClick={() => void check()}>
              Load another
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
