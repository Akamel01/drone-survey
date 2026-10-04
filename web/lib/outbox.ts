// Edits made with no signal, kept on this device until the network is back
// (PWA-3, #316; the decision is #278).
//
// The store stays the only place a Mission lives (ADR 0021). The outbox is the
// operator's own verbs -- save, Withdraw, Mark Flown, Unmark Flown, Remove --
// in the order they were made, each sent to the route that already owns it when
// the network returns. Nothing here changes a Mission locally: the list shows
// the store's last read, and what waits is shown beside it. Dispatch never
// comes here, because it reserves Cards and a refusal has to reach the operator
// while they can still act (ADR 0022).
//
// A save of a stored Mission carries the version it was made against
// (`base_updated_at`); the route refuses it if the store has moved on, and the
// entry then waits for the operator's choice instead of being sent again.
//
// It lives in the page's own storage, like the last read, not in the service
// worker: the worker never sees /api (lib/serviceWorker.ts), and the credential
// is the page's.

import { LOCAL_ID_PREFIX } from "./keys.ts";
import { areaHectares, preview } from "./mission.ts";
import type { MissionDraft } from "./missionClient.ts";
import type { MissionRecord, MissionRow } from "./missionRecords.ts";
import { formatArea, orbitAreaHectares, type KeyValue } from "./missionView.ts";
import type { MissionSpec } from "./spec.ts";

export const OUTBOX_KEY = "drone-planner.outbox";

export type OutboxOp = "save" | "withdraw" | "flown" | "unflown" | "remove";

/** Why an entry is not being sent: the store's own sentence, and for a changed
 *  Mission both versions. `conflict` is the store's record, `state` its state. */
export interface Problem {
  text: string;
  conflict?: MissionRecord;
  state?: string;
}

export interface Entry {
  /** Order of making. Unique within the outbox, not across emptyings of it. */
  seq: number;
  op: OutboxOp;
  mission_id: string;
  /** A save's Mission, with `base_updated_at` when it edits a stored one. */
  draft?: MissionDraft;
  problem?: Problem;
}

/** What sending one entry came to. `later` is "the store could not be reached":
 *  it stops the replay and the entry stays as it is. */
export type Sent =
  | { ok: true; updated_at?: string; id?: string }
  | { ok: false; later: true }
  | { ok: false; later?: false; problem: Problem };

export interface Report {
  sent: { id: string; updated_at?: string }[];
  /** Entries refused in this pass, now waiting for the operator. */
  refused: Entry[];
}

/** The browser's own word that there is no network. Only this sends an edit to
 *  the outbox: a call that failed on a network the browser calls up is an
 *  ordinary failure, said as one, with the sheet still open (#309). */
export function noSignal(): boolean {
  return globalThis.navigator?.onLine === false;
}

/** A name for a Mission made with no signal. Not a uuid where the browser has
 *  no `crypto.randomUUID` (an insecure origin), which is still unique enough
 *  for one operator's phone. */
export function localId(): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `${LOCAL_ID_PREFIX}${rand}`;
}

export function readOutbox(store: KeyValue): Entry[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(OUTBOX_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

/** Called when this window or another one changes the outbox. Returns the
 *  unsubscribe. */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === OUTBOX_KEY) listener();
  };
  globalThis.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

/** False when the browser would not keep it (a full quota, storage blocked):
 *  the caller must say so, never carry on as if it were kept. */
function write(store: KeyValue, entries: Entry[]): boolean {
  try {
    store.setItem(OUTBOX_KEY, JSON.stringify(entries));
  } catch {
    return false;
  }
  for (const notify of listeners) notify();
  return true;
}

/**
 * Keep one verb. Two saves of one Mission before either is sent become one --
 * the later draft over the earlier, against the first one's version -- so the
 * replay never sends a save against a version its own earlier save moved.
 * Null when the entry could not be kept.
 */
export function enqueue(store: KeyValue, op: OutboxOp, mission_id: string, draft?: MissionDraft): Entry | null {
  const entries = readOutbox(store);
  const earlier = op === "save" ? entries.find((e) => e.op === "save" && e.mission_id === mission_id) : undefined;
  let entry: Entry;
  if (earlier) {
    entry = { ...earlier, draft: { ...draft!, base_updated_at: earlier.draft?.base_updated_at } };
    entries[entries.indexOf(earlier)] = entry;
  } else {
    entry = { seq: Math.max(0, ...entries.map((e) => e.seq)) + 1, op, mission_id, ...(draft ? { draft } : {}) };
    entries.push(entry);
  }
  return write(store, entries) ? entry : null;
}

/** Drop an entry: sent, or the operator took the store's version. */
export function discard(store: KeyValue, seq: number): void {
  write(store, readOutbox(store).filter((e) => e.seq !== seq));
}

/** "Keep mine": the entry is made against the store's version now, and is sent
 *  again. */
export function keepMine(store: KeyValue, seq: number, against: string): void {
  write(
    store,
    readOutbox(store).map((e) =>
      e.seq === seq && e.draft ? { ...e, problem: undefined, draft: { ...e.draft, base_updated_at: against } } : e,
    ),
  );
}

const running = { now: false };

/**
 * Send every entry in the order it was made. A refusal stops that Mission's
 * entries (a later one may depend on it) but not the others; the store being
 * unreachable stops everything, entries kept as they were. One replay at a
 * time, across windows too where the browser has locks.
 */
export async function replay(store: KeyValue, send: (entry: Entry) => Promise<Sent>): Promise<Report> {
  const report: Report = { sent: [], refused: [] };
  const locks = globalThis.navigator?.locks;
  if (!locks && running.now) return report;
  const pass = async () => {
    running.now = true;
    try {
      const held = new Set<string>();
      for (const entry of readOutbox(store)) {
        if (entry.problem) held.add(entry.mission_id);
        if (held.has(entry.mission_id)) continue;
        const result = await send(entry);
        if (result.ok) {
          // Edited again while it was in flight: that edit stays, now against
          // the version this one wrote.
          const now = readOutbox(store).find((e) => e.seq === entry.seq);
          if (now && JSON.stringify(now) !== JSON.stringify(entry)) {
            if (result.id === entry.mission_id && result.updated_at) keepMine(store, entry.seq, result.updated_at);
          } else discard(store, entry.seq);
          report.sent.push({ id: entry.mission_id, updated_at: result.updated_at });
        } else if (result.later) {
          return;
        } else {
          held.add(entry.mission_id);
          write(store, readOutbox(store).map((e) => (e.seq === entry.seq ? { ...e, problem: result.problem } : e)));
          report.refused.push({ ...entry, problem: result.problem });
        }
      }
    } finally {
      running.now = false;
    }
  };
  if (locks) await locks.request("drone-planner-outbox", pass);
  else await pass();
  return report;
}

// ---------------------------------------------------------------------------
// What the list says about what is waiting
// ---------------------------------------------------------------------------

export function forMission(entries: Entry[], id: string): Entry[] {
  return entries.filter((e) => e.mission_id === id);
}

const WAITING: Record<OutboxOp, string> = {
  save: "Edit waiting to sync",
  withdraw: "Withdraw waiting to sync",
  flown: "Mark Flown waiting to sync",
  unflown: "Unmark Flown waiting to sync",
  remove: "Remove waiting to sync",
};

/** One line for an entry, in the operator's words: what it is, and that it has
 *  not reached the store (or why it is not being sent). */
export function waitingLabel(entry: Entry, stored: boolean): string {
  if (entry.problem?.conflict) return "Changed in the store since you edited it. Choose which version to keep.";
  if (entry.problem) return `Not sent: ${entry.problem.text}`;
  if (entry.op === "save" && !stored) return "Not in the store yet. Waiting to sync.";
  return `${WAITING[entry.op]}.`;
}

/** The facts the compare sets side by side, for either version of a Mission. */
export function compareFacts(v: { name: string; site: string; date: string; spec: MissionSpec }): [string, string][] {
  const p = preview(v.spec);
  const area = v.spec.mission_type === "orbit" ? orbitAreaHectares(v.spec.orbit.radius_m) : areaHectares(v.spec.aoi);
  return [
    ["Name", v.name],
    ["Site", v.site],
    ["Date", v.date],
    ["Area", formatArea(area)],
    ["Flight time", `${p.flight_time_min.toFixed(1)} min`],
    ["Photos", `${p.photo_count}`],
  ];
}

/** The edit made in place to a Planned Mission: shown on its own row, so the
 *  change the operator made is the one they see after a reload. Every other
 *  save (a new Mission, a replacement of a Dispatched one) has no row of its
 *  own to land on and is listed beside them (`unshown`). */
function inPlace(row: MissionRow | undefined, entry: Entry): boolean {
  return entry.op === "save" && row?.state === "planned" && !!entry.draft;
}

/** The store's rows with each waiting in-place edit laid over its row. */
export function overlay(rows: MissionRow[], entries: Entry[]): MissionRow[] {
  return rows.map((row) => {
    const edit = entries.find((e) => e.mission_id === row.id && inPlace(row, e));
    const d = edit?.draft;
    return d ? { ...row, name: d.name, site: d.site, site_id: d.site_id, date: d.date, spec: d.spec } : row;
  });
}

/** Saves with no row of their own: Missions made with no signal, and
 *  replacements of Dispatched ones. */
export function unshown(rows: MissionRow[], entries: Entry[]): Entry[] {
  return entries.filter(
    (e) => e.op === "save" && e.draft && !inPlace(rows.find((r) => r.id === e.mission_id), e),
  );
}
