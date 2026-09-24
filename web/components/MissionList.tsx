"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preview } from "@/lib/mission";
import type { MissionRow } from "@/lib/missionRecords";
import {
  IDLE,
  MISSIONS_CHANGED_KEY,
  beginAction,
  endAction,
  isRunning,
  noteMissionsChanged,
  noticeShows,
  settleNotice,
  type ActionResult,
  type ActionState,
} from "@/lib/actions";
import {
  asOfStamp,
  cacheRead,
  cachedRead,
  checkedAgo,
  hostLines,
  rowView,
  unreadableLine,
  type ActionName,
  type Figures,
  type MissionListRead,
  type RowView,
} from "@/lib/missionView";
import styles from "./MissionList.module.css";

// One Mission, one row, one state -- and one of this component, rendered in
// both tabs.
//
// The screen it replaces joined three files at the rendering layer and emitted
// a row per draft AND a row per Spec, so a Dispatched Mission appeared twice,
// under two names, in two states, with two sets of buttons (ADR 0021). Two
// renderings of one list is how that happened; there is now one of each.
//
// Nothing is decided here. What a row says, which Card it names, and whether
// it may be called ready all come from `lib/missionView.ts`, where a test can
// reach them -- the old screen's rules lived inside its JSX, which is why
// nothing could assert that a mismatch withheld the affirmation.

const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

/** The tone of an answer, carried on the card's left edge rather than by
 *  tinting its text: a grey note is how a mismatch gets missed, and a whole
 *  card in red is unreadable. */
const TONE: Record<RowView["headline"]["tone"], string> = {
  go: styles.toneGo,
  stop: styles.toneStop,
  wait: styles.toneWait,
  quiet: styles.toneQuiet,
};

interface MissionListProps {
  /** Hand a Mission back to the planner for editing. The store decides what
   *  editing means from its state: in place while Planned, a new Mission that
   *  supersedes once Dispatched, refused once Loaded. */
  onEdit: (row: MissionRow) => void;
  /** Start a new Mission from this one. The original is not touched. */
  onCopy: (row: MissionRow) => void;
  /** The Mission the editor currently has open, so its row says so. */
  editingId?: string | null;
  /** Every good read, handed on. The planner needs the Sites already in the
   *  store to offer them for choosing, and taking them from this read rather
   *  than fetching again keeps one page load to one storage transaction. */
  onRead?: (read: MissionListRead) => void;
}

export default function MissionList({ onEdit, onCopy, editingId = null, onRead }: MissionListProps) {
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [read, setRead] = useState<MissionListRead | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  /** False while showing the last cached read instead of a live one. */
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [action, setAction] = useState<ActionState>(IDLE);
  // The clock the age is measured against, advanced on a timer rather than
  // read during render: a render is not an event, and a screen that re-reads
  // the clock whenever React happens to re-run it cannot be trusted to say
  // how old what it shows is.
  const [now, setNow] = useState(0);
  const inFlight = useRef(false);
  // Held in a ref so a caller that passes a fresh closure each render does not
  // restart the poll -- restarting it is how a five-minute poll becomes a
  // per-render one, which is the failure this budget exists to prevent.
  const reportRead = useRef(onRead);
  useEffect(() => {
    reportRead.current = onRead;
  });

  const load = useCallback(async (key: string): Promise<MissionListRead | null> => {
    setLoading(true);
    try {
      // Always the whole list: `archived_count` and the archived rows come in
      // one call, so the filter costs nothing and the count cannot disagree
      // with what the filter reveals.
      const res = await fetch("/api/missions?archived=1", { headers: { "x-wayfinder-key": key } });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body.missions)) {
        const fresh = body as MissionListRead;
        const at = Date.now();
        setRead(fresh);
        setReadAt(at);
        setNow(at);
        setLive(true);
        setError(null);
        cacheRead(localStorage, fresh, at);
        reportRead.current?.(fresh);
        return fresh;
      } else {
        fallBackToCache(body.error ?? `The Mission list could not be read (HTTP ${res.status}).`);
      }
    } catch (err) {
      fallBackToCache(
        `The store could not be reached: ${err instanceof Error ? err.message : "unknown"}.`,
      );
    } finally {
      setLoading(false);
    }
    return null;

    // Standing next to the aircraft with no signal, the last answer is worth
    // more than an empty screen -- but only if it can never be mistaken for
    // the live one, which is what the stamp on it is for.
    function fallBackToCache(why: string) {
      setError(why);
      const cached = cachedRead(localStorage);
      if (cached) {
        setRead(cached.read);
        setReadAt(cached.read_at);
        setLive(false);
      } else {
        setLive(true);
      }
    }
  }, []);

  useEffect(() => {
    const key = localStorage.getItem(PASSPHRASE_KEY) ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setPassphrase(key);
    if (!key) return;
    void load(key);

    // Every poll costs a Class C transaction on the storage account, and this
    // page is left open for hours. Five minutes is fresh enough for a pipeline
    // whose steps are minutes apart, and a hidden tab costs nothing at all. A
    // 30-second poll once spent 2,880 of the day's transaction cap: do not
    // shorten this, and do not remove this note.
    const refresh = () => {
      if (document.hidden) return;
      setAction((s) => ({ ...s, notice: null }));
      void load(key);
    };
    document.addEventListener("visibilitychange", refresh);
    // A write from another window of this planner: react to the write instead
    // of waiting out the interval. `storage` fires only in the *other*
    // windows, so this costs a transaction only when something changed.
    const onWrite = (e: StorageEvent) => {
      if (e.key === MISSIONS_CHANGED_KEY) void load(key);
    };
    window.addEventListener("storage", onWrite);
    const poll = setInterval(refresh, 300000);
    // Ageing the "checked N min ago" label is not a poll and asks the store
    // for nothing; it only keeps the screen from claiming to be fresher than
    // it is while the operator reads it.
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onWrite);
    };
  }, [load]);

  // The five-minute poll is far too slow to be an action's feedback, so every
  // action reports its own outcome on the row it was pressed on and re-reads
  // the store the moment it finishes.
  const act = useCallback(
    async (label: string, on: string, fn: () => Promise<Response>) => {
      if (!passphrase || inFlight.current) return;
      inFlight.current = true;
      setAction((s) => beginAction(s, label, on));
      let result: ActionResult;
      try {
        const res = await fn();
        const body = await res.json().catch(() => ({}));
        result = res.ok ? { ok: true, body } : { ok: false, status: res.status, body };
        if (res.ok) noteMissionsChanged();
      } catch (err) {
        result = { ok: false, threw: err instanceof Error ? err.message : "unknown" };
      }
      inFlight.current = false;
      setAction((s) => endAction(s, label, on, result));
      const fresh = await load(passphrase);
      setAction((s) => settleNotice(s, fresh?.missions.find((m) => m.id === on)?.state));
    },
    [passphrase, load],
  );

  const post = useCallback(
    (path: string, body: unknown) =>
      fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase ?? "" },
        body: JSON.stringify(body),
      }),
    [passphrase],
  );

  const runAction = useCallback(
    (name: ActionName, row: MissionRow) => {
      switch (name) {
        case "Dispatch":
          return act(name, row.id, () => post("/api/missions/dispatch", { id: row.id }));
        case "Withdraw":
          return act(name, row.id, () => post("/api/missions/withdraw", { id: row.id }));
        case "Mark Flown":
          return act(name, row.id, () => post("/api/missions/flown", { id: row.id, flown: true }));
        case "Unmark Flown":
          return act(name, row.id, () => post("/api/missions/flown", { id: row.id, flown: false }));
        case "Remove":
          if (!window.confirm(`Remove “${row.name}”? It is archived, not deleted — nothing is lost.`)) {
            return;
          }
          return act(name, row.id, () =>
            fetch(`/api/missions?id=${encodeURIComponent(row.id)}`, {
              method: "DELETE",
              headers: { "x-wayfinder-key": passphrase ?? "" },
            }),
          );
        case "Edit":
          return onEdit(row);
        case "Copy":
          return onCopy(row);
      }
    },
    [act, post, passphrase, onEdit, onCopy],
  );

  const all = useMemo(() => read?.missions ?? [], [read]);
  // The planner's own figures, derived from each Mission's Spec. They are one
  // half of the mismatch check, so they must come from the Spec the row
  // carries and not from a summary file the host also writes into.
  const figures = useMemo(() => {
    const m = new Map<string, Figures>();
    for (const row of all) {
      const p = preview(row.spec);
      m.set(row.id, { photo_count: p.photo_count, path_length_m: p.path_length_m, parts: p.parts });
    }
    return m;
  }, [all]);

  const visible = showArchived ? all : all.filter((r) => !r.archived);
  const archivedCount = read?.archived_count ?? 0;

  if (passphrase === null) return <p className={styles.quiet}>Reading the Mission list…</p>;
  if (passphrase === "") {
    return (
      <p className={styles.quiet}>
        {/* Named by where it is, not by which tab is open: this component is
            rendered in both, and only one of them has the map. */}
        The Missions in the store appear here once the Wayfinder passphrase is typed into the bar
        along the bottom of the Plan tab. It is typed once per browser and kept only there.
      </p>
    );
  }

  const notice = action.notice;
  const orphanNotice = notice && !visible.some((r) => r.id === notice.on);

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        {/* The operator is never left waiting on a timer with no way to ask. */}
        <span className={styles.age} role="status" aria-live="polite">
          {readAt === null ? "not read yet" : checkedAgo(readAt, Math.max(now, readAt))}
          {!live && readAt !== null && <span className={styles.stale}> · {asOfStamp(readAt)}</span>}
        </span>
        <button
          onClick={() => {
            if (!passphrase) return;
            setAction((s) => ({ ...s, notice: null }));
            void load(passphrase);
          }}
          disabled={loading}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
        {archivedCount > 0 && (
          <label className={styles.filter}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {/* Withdrawn, Superseded and Flown are archived, never deleted, so
                they are behind a filter rather than absent (ADR 0021). */}
            Show {archivedCount} archived (Withdrawn, Superseded, Flown)
          </label>
        )}
      </div>

      {error && (
        <p className={styles.stop}>
          {error.replace(/\.?$/, ".")}
          {!live && read
            ? " What is below is the last read that worked. It is not live — do not act on it without refreshing."
            : ""}
        </p>
      )}

      {unreadableLine(read?.unreadable) && <p className={styles.stop}>{unreadableLine(read?.unreadable)}</p>}

      {hostLines(read?.host).map((line) => (
        // A refused Load is about the Controller, not one row, so it is said
        // above them all -- and it stays until a Load succeeds (#162).
        <p key={line} className={styles.stop} role="alert">
          {line}
        </p>
      ))}

      {orphanNotice && (
        <p className={notice.failed ? styles.stop : styles.done} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}

      {visible.length === 0 && !error && (
        <p className={styles.quiet}>
          {all.length === 0
            ? "No Missions in the store yet. Plan one, name it, and it appears here."
            : "Every Mission here is archived. Tick the filter above to see them."}
        </p>
      )}

      {visible.map((row) => (
        <MissionCard
          key={row.id}
          row={row}
          view={rowView(row, figures.get(row.id) ?? null, read?.stale_cards ?? [], read?.host?.notice ?? null)}
          editing={row.id === editingId}
          busy={action.running !== null}
          running={(name) => isRunning(action, name, row.id)}
          notice={notice?.on === row.id && noticeShows(notice, row.state) ? notice : null}
          onAction={(name) => runAction(name, row)}
        />
      ))}
    </div>
  );
}

/** One Mission: its state and its next action first, everything else beneath.
 *  A card rather than a dense line, because this is read at the desk before
 *  leaving and again with the Controller in hand (ADR 0021). */
function MissionCard({
  row,
  view,
  editing,
  busy,
  running,
  notice,
  onAction,
}: {
  row: MissionRow;
  view: RowView;
  editing: boolean;
  busy: boolean;
  running: (name: ActionName) => boolean;
  notice: { text: string; failed: boolean } | null;
  onAction: (name: ActionName) => void;
}) {
  return (
    <article className={`${styles.card} ${TONE[view.headline.tone]} ${editing ? styles.editing : ""}`}>
      <header className={styles.head}>
        <h3 className={styles.title}>
          {row.name}
          <span className={styles.site}>
            {row.site} · {row.date}
          </span>
        </h3>
        <span className={`mono ${styles.state}`}>{view.stateLabel}</span>
      </header>

      {/* The answer first: this screen exists to say whether the Mission will
          fly correctly and which Card to open. */}
      <p className={styles.headline}>{view.headline.text}</p>
      <p className={styles.detail}>{view.headline.detail}</p>

      {view.blockers.slice(1).map((why) => (
        <p key={why} className={styles.stop}>
          {why}
        </p>
      ))}

      {view.disagreement && (
        // Both answers, never the difference resolved silently (ADR 0021).
        <p className={styles.note}>
          {view.disagreement} Both answers are kept; yours is the one that decides.
        </p>
      )}

      {view.flights.length > 0 && (
        <ul className={styles.flights}>
          {view.flights.map((f) => (
            <li key={f.flight} className={f.written ? styles.written : undefined}>
              {f.label}
              {!f.written
                ? " — reserved, not written yet"
                : f.points !== null && view.state === "loaded"
                  ? // Only while it is there: once Flown the Card is free and
                    // may hold the next Mission, so the count would mislead.
                    ` — shows ${f.points} points inside`
                  : ""}
            </li>
          ))}
        </ul>
      )}
      {view.reason && <p className={styles.reason}>{view.reason}</p>}

      <div className={styles.actions}>
        {view.actions.map((name) => (
          <button
            key={name}
            onClick={() => onAction(name)}
            disabled={busy && name !== "Edit" && name !== "Copy"}
            className={name === "Dispatch" ? "primary" : undefined}
          >
            {running(name) ? `${name}…` : name}
          </button>
        ))}
        {editing && <span className={styles.editingNote}>open in the editor</span>}
      </div>

      {notice && (
        <p className={notice.failed ? styles.stop : styles.done} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}

      <details className={styles.more}>
        <summary>Details</summary>
        <div className={`${styles.detail} mono`}>{row.spec_key ?? row.id}</div>
        {row.collected_at && <div className={styles.detail}>Collected {row.collected_at}</div>}
        {row.loaded_at && <div className={styles.detail}>Loaded {row.loaded_at}</div>}
        {row.flown_evidence_at && (
          <div className={styles.detail}>Imagery arrived {row.flown_evidence_at}</div>
        )}
        {row.superseded_by && (
          <div className={styles.detail}>Superseded by the Mission saved after it.</div>
        )}
        {row.edit === "guarded" && (
          <div className={styles.detail}>
            Editing is guarded: a file for this Mission is already on the Controller, and withdrawing
            cannot reach it.
          </div>
        )}
      </details>
    </article>
  );
}
