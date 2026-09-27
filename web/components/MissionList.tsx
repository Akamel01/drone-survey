"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { preview } from "@/lib/mission";
import type { MissionRow } from "@/lib/missionRecords";
import Sheet from "./Sheet";
import type { NoticePayload } from "./Notice";
import {
  IDLE,
  MISSIONS_CHANGED_KEY,
  beginAction,
  describeResult,
  isRunning,
  noteMissionsChanged,
  safeStorage,
  type ActionResult,
  type ActionState,
} from "@/lib/actions";
import { readPassphrase, subscribePassphrase, writePassphrase } from "@/lib/passphrase";
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

// One Mission, one row, one state.
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

/** The tone of an answer, carried on the row's left edge rather than by
 *  tinting its text: a grey note is how a mismatch gets missed, and a whole
 *  row in red is unreadable. */
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
  /** Page-owned Notice slot. The page stamps `key` itself, so this takes the
   *  payload without it. */
  onNotice?: (p: Omit<NoticePayload, "key">) => void;
}

/** The Notice's compact title: the first sentence of the verbatim result. */
function firstSentence(body: string): string {
  return body.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? body;
}

export default function MissionList({ onEdit, onCopy, editingId = null, onRead, onNotice }: MissionListProps) {
  const [passphrase, setPassphrase] = useState<string | null>(null);
  // True until the first good read, whatever is typed meanwhile: the field
  // asking for the passphrase must not vanish mid-keystroke just because the
  // value it is bound to briefly went from empty to something (plan decision
  // 17). It only steps aside once the store has actually answered.
  const [gate, setGate] = useState(true);
  const [read, setRead] = useState<MissionListRead | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  /** False while showing the last cached read instead of a live one. */
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [action, setAction] = useState<ActionState>(IDLE);
  // The row a sheet is open about, and whether it is open, held apart: the
  // row is kept through the close animation so the sheet has something to
  // show while it fades, rather than going blank a frame before it is gone.
  const [confirmRow, setConfirmRow] = useState<MissionRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState<MissionRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const removeHeadingId = useId();
  const detailsHeadingId = useId();
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
        setGate(false);
        const ls = safeStorage();
        if (ls) cacheRead(ls, fresh, at);
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
      const ls = safeStorage();
      const cached = ls ? cachedRead(ls) : null;
      if (cached) {
        setRead(cached.read);
        setReadAt(cached.read_at);
        setLive(false);
        setGate(false);
      } else {
        setLive(true);
      }
    }
  }, []);

  // True only for the passphrase already on file when this mounted, so that
  // one loads at once, the way it always did. Consumed by the first pass of
  // the effect below, whichever value that turns out to be -- so a passphrase
  // that arrives by typing, with nothing stored before it, still waits out the
  // debounce like any later edit rather than firing on its first keystroke.
  const instant = useRef(false);

  // Resolved once: what is already on file, and -- from here on -- whatever
  // any field showing the passphrase writes, wherever it was typed (shared
  // with the Summary's own field; `lib/passphrase.ts` is the mechanism).
  useEffect(() => {
    const initial = readPassphrase();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setPassphrase(initial ?? "");
    setBlocked(initial === null);
    setGate(!initial);
    instant.current = !!initial;
    return subscribePassphrase(setPassphrase);
  }, []);

  // Loads with the current passphrase and keeps the list fresh while one is
  // known. Firing this on every keystroke -- typed here or in the Summary's
  // field, now that the two agree live -- would spend a store transaction per
  // character, so a value that changes after the page has settled waits half
  // a second before it is used.
  useEffect(() => {
    if (!passphrase) return;
    const key = passphrase;
    const wait = instant.current ? 0 : 500;
    instant.current = false;
    const debounce = setTimeout(() => void load(key), wait);

    // Every poll costs a Class C transaction on the storage account, and this
    // page is left open for hours. Five minutes is fresh enough for a pipeline
    // whose steps are minutes apart, and a hidden tab costs nothing at all. A
    // 30-second poll once spent 2,880 of the day's transaction cap: do not
    // shorten this, and do not remove this note.
    const refresh = () => {
      if (document.hidden) return;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ages a label against the clock, not a fetch
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(debounce);
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onWrite);
    };
  }, [passphrase, load]);

  // The five-minute poll is far too slow to be an action's feedback, so every
  // action reports its own outcome through the page-owned Notice and re-reads
  // the store the moment it finishes. The poll and Refresh only re-read: they
  // never touch the Notice, which the page owns.
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
      setAction(IDLE);
      const fresh = await load(passphrase);
      const body = describeResult(label, result);
      onNotice?.({
        title: firstSentence(body),
        body,
        missionName: fresh?.missions.find((m) => m.id === on)?.name ?? "",
        failed: !result.ok,
      });
    },
    [passphrase, load, onNotice],
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
          // Asks in a sheet, never the browser's own confirm box (spec § 8,
          // § 14) -- the words are the same ones that box used to show.
          setConfirmRow(row);
          setConfirmOpen(true);
          return;
        case "Edit":
          return onEdit(row);
        case "Copy":
          return onCopy(row);
      }
    },
    [act, post, onEdit, onCopy],
  );

  const confirmRemove = useCallback(() => {
    if (!confirmRow) return;
    const row = confirmRow;
    setConfirmOpen(false);
    void act("Remove", row.id, () =>
      fetch(`/api/missions?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        headers: { "x-wayfinder-key": passphrase ?? "" },
      }),
    );
  }, [act, confirmRow, passphrase]);

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
  if (blocked) {
    return (
      <p className={styles.stop}>
        This browser is blocking storage for this page, so the Wayfinder passphrase cannot be kept and
        the Mission list cannot be read. Allow site data for this page (it is off in some private
        windows and strict privacy settings), then reload.
      </p>
    );
  }
  if (gate) {
    return (
      <form
        className={styles.gate}
        onSubmit={(e) => {
          e.preventDefault();
          if (passphrase) void load(passphrase);
        }}
      >
        <p className={styles.gateText}>
          Type the Wayfinder passphrase to read the Missions in the store. It is typed once per browser
          and kept only here — the same field as the one beside Save.
        </p>
        <input
          type="password"
          className={styles.gateInput}
          placeholder="Wayfinder passphrase"
          aria-label="Wayfinder passphrase"
          value={passphrase}
          onChange={(e) => writePassphrase(e.target.value)}
          autoFocus
        />
        <button type="submit" className="primary" disabled={!passphrase || loading}>
          {loading ? "Checking…" : "Show Missions"}
        </button>
        {error && <p className={styles.stop}>{error.replace(/\.?$/, ".")}</p>}
      </form>
    );
  }

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
            void load(passphrase);
          }}
          disabled={loading}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
        {archivedCount > 0 && (
          // Withdrawn, Superseded and Flown are archived, never deleted, so
          // they are behind a filter rather than absent (ADR 0021).
          <button
            type="button"
            className={`${styles.filter} ${showArchived ? "active" : ""}`}
            aria-pressed={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            Show {archivedCount} archived
          </button>
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

      {visible.length === 0 && !error && (
        <p className={styles.quiet}>
          {all.length === 0
            ? "No Missions in the store yet. Plan one, name it, and it appears here."
            : "Every Mission here is archived. Tick the filter above to see them."}
        </p>
      )}

      {visible.map((row) => (
        <Row
          key={row.id}
          row={row}
          view={rowView(row, figures.get(row.id) ?? null, read?.stale_cards ?? [], read?.host?.notice ?? null)}
          editing={row.id === editingId}
          busy={action.running !== null}
          running={(name) => isRunning(action, name, row.id)}
          onAction={(name) => runAction(name, row)}
          onDetails={() => {
            setDetailsRow(row);
            setDetailsOpen(true);
          }}
        />
      ))}

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} labelledBy={removeHeadingId}>
        {confirmRow && (
          <>
            <h3 id={removeHeadingId} className={styles.sheetTitle}>
              Remove “{confirmRow.name}”?
            </h3>
            <p className={styles.sheetText}>It is archived, not deleted — nothing is lost.</p>
            <div className={styles.sheetActions}>
              <button type="button" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmRemove}>
                Remove
              </button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} labelledBy={detailsHeadingId}>
        {detailsRow && (
          <div className={`panel-light ${styles.detailsPanel}`}>
            <h3 id={detailsHeadingId} className={styles.detailsTitle}>
              {detailsRow.name}
            </h3>
            <div className={`${styles.detailsLine} mono`}>{detailsRow.spec_key ?? detailsRow.id}</div>
            {detailsRow.collected_at && (
              <div className={styles.detailsLine}>Collected {detailsRow.collected_at}</div>
            )}
            {detailsRow.loaded_at && <div className={styles.detailsLine}>Loaded {detailsRow.loaded_at}</div>}
            {detailsRow.flown_evidence_at && (
              <div className={styles.detailsLine}>Imagery arrived {detailsRow.flown_evidence_at}</div>
            )}
            {detailsRow.superseded_by && (
              <div className={styles.detailsLine}>Superseded by the Mission saved after it.</div>
            )}
            {detailsRow.edit === "guarded" && (
              <div className={styles.detailsLine}>
                Editing is guarded: a file for this Mission is already on the Controller, and withdrawing
                cannot reach it.
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** One Mission: its state and its next action first, everything else beneath.
 *  A row rather than a dense line, because this is read at the desk before
 *  leaving and again with the Controller in hand (ADR 0021). */
function Row({
  row,
  view,
  editing,
  busy,
  running,
  onAction,
  onDetails,
}: {
  row: MissionRow;
  view: RowView;
  editing: boolean;
  busy: boolean;
  running: (name: ActionName) => boolean;
  onAction: (name: ActionName) => void;
  onDetails: () => void;
}) {
  return (
    <article className={`${styles.row} glass-smoke ${TONE[view.headline.tone]} ${editing ? styles.editing : ""}`}>
      <header className={styles.head}>
        <h3 className={styles.title}>
          {row.name}
          <span className={styles.site}>
            {row.site} · {row.date}
          </span>
        </h3>
        <span className={`mono ${styles.chip}`}>{view.stateLabel}</span>
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

      {/* The old disclosure's contents now live in a sheet, on a light panel
          (spec § 8, § 14) -- this only opens it. */}
      <button type="button" className={styles.more} onClick={onDetails}>
        Details
      </button>
    </article>
  );
}
