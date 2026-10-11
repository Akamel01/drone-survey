// Every send, keep and refusal about a Mission, decided in one place (#348).
//
// Three call sites used to decide this between them: Save ordered its Mission's
// changes, the five row actions sent whenever there was a signal, and the Loaded
// report did the same. So an edit that had waited for the network was overtaken
// by whatever the operator pressed next -- and the button state that says so
// lived in the JSX, apart from the code that sends. This module owns the
// decision, the guard it rests on, and the sentences it produces; the
// components render what it answers and navigate.
//
// The credential is the Account's session cookie, sent by the browser on every
// same-origin call (lib/missionClient.ts, #244). What this owns of it is the
// answer: a 401 means signed out and the cache is not shown in its place, a 403
// is not a session that ended and never falls back to the cache either.
//
// It holds no listeners, no navigation and no animation, and reads its storage
// at each call, so a test can drive the whole thing with a Map.

import { noteMissionSaved, safeStorage } from "./actions.ts";
import { firstSentence } from "./notice.ts";
import type { BoardCard } from "./board.ts";
import type { MissionAction, MissionDraft } from "./missionClient.ts";
import * as missionClient from "./missionClient.ts";
import type { MissionRecord, MissionRow } from "./missionRecords.ts";
import { cacheRead, cachedRead, type KeyValue, type MissionListRead } from "./missionView.ts";
import { enqueue, enqueueLoaded, forMission, localId, readOutbox, replay, type Entry, type OutboxOp, type Report } from "./outbox.ts";

/** How the operator is told something changed. The page owns the Notice slot and
 *  stamps its key; this builds the payload. */
export interface Notice {
  title: string;
  body: string;
  missionName: string;
  failed: boolean;
}

/** The client, as the repository needs it: transport only, never re-worded and
 *  never re-mapped (ADR-348-4 -- `missionClient` stays the one that owns the
 *  wire contract and the sentences). */
export interface Transport {
  list: typeof missionClient.list;
  run: typeof missionClient.run;
  save: typeof missionClient.save;
  markLoaded: typeof missionClient.markLoaded;
  send: typeof missionClient.send;
  signedOut: typeof missionClient.signedOut;
}

/** What one read of the list came to. `live` false is the last good read shown
 *  in the store's place, stamped as such; `blocked` is 401 or 403, where the
 *  cached list may be another Account's and must not be shown at all. */
export interface ListView {
  read: MissionListRead | null;
  readAt: number | null;
  live: boolean;
  error: string | null;
  /** A 401: the session has ended and the caller goes to the sign-in. */
  signedOut: boolean;
  /** 401 or 403: not read, and never answered from the cache. */
  blocked: boolean;
}

export interface ActOutcome {
  text: string;
  /** Kept on this device rather than sent. */
  queued: boolean;
}

/** A save that reached the store (`ok`), one that did not (`ok: false`), and
 *  one that is on this device and not in the store yet (`kept`, with the
 *  Mission the planner should hold in place of the written one). */
export type SaveOutcome =
  | { ok: true; text: string; mission: MissionRecord }
  | { ok: false; text: string }
  | { kept: true; text: string; mission: MissionRecord };

/** "sent": the store has it. "waiting": kept in the outbox, sent when the
 *  store can be reached. "refused": the store will not take it, or it could not
 *  be kept. */
export type MarkResult = "sent" | "refused" | "waiting";

/** Why Dispatch is not offered, or null. It reserves Cards, so it is never kept
 *  for later: a refusal has to reach the operator while they can still do
 *  something about it (ADR 0022). */
export const NEEDS_NETWORK =
  "Dispatch needs the network: it reserves a Card, and a refusal has to reach you while you can still act on it. Dispatch it when you are back online.";
/** ... and the other reason it is not offered: the store would Dispatch a
 *  version this phone has already superseded. */
export const WAITING_FIRST = "Dispatch waits until this Mission's changes have synced, so the store Dispatches what you see.";

/** The row actions that wait for the network when there is none. Dispatch is
 *  not among them. */
const OP_OF: Partial<Record<MissionAction, OutboxOp>> = {
  Withdraw: "withdraw",
  "Mark Flown": "flown",
  "Unmark Flown": "unflown",
  Remove: "remove",
};

const kept = (label: string) => `${label} kept on this device, waiting to sync. It is sent to the store when the network is back.`;
const noRoom = (label: string) => `${label} failed: this browser has no room to keep it for later. Nothing changed.`;

export interface RepositoryDeps {
  /** The browser's storage, or null where it would not keep anything. */
  store: KeyValue | null;
  /** The browser's own word on the network. Injected so a test reaches the
   *  keep-or-send rule without redefining a global (#348). */
  online: () => boolean;
  transport: Transport;
  /** The rows the list last read, for naming what a replay reports. */
  rows: () => MissionRow[];
  onNotice?: (n: Notice) => void;
  /** When the read was taken. Injected so the cache stamp is assertable. */
  now: () => number;
}

export interface Repository {
  load(): Promise<ListView>;
  act(action: MissionAction, id: string): Promise<ActOutcome>;
  save(draft: MissionDraft, how?: Parameters<typeof missionClient.save>[1], base?: string): Promise<SaveOutcome>;
  reportLoaded(id: string, cards: BoardCard[]): Promise<MarkResult>;
  /** Send what waited, in order, and say what came of it. Null when there was
   *  nothing to send, or nothing came of it. */
  sync(): Promise<Report | null>;
  /** Everything of this Mission's that has not reached the store: what the
   *  row offers, and what a press must not overtake. */
  waitingFor(id: string): Entry[];
}

export function createRepository(deps: Partial<RepositoryDeps> = {}): Repository {
  const store = deps.store !== undefined ? deps.store : safeStorage();
  const online = deps.online ?? (() => globalThis.navigator?.onLine !== false);
  const transport = deps.transport ?? missionClient;
  const rows = deps.rows ?? (() => []);
  const now = deps.now ?? Date.now;

  /**
   * Whether this Mission has anything of its own still to go. Deliberately the
   * whole set, including a refused entry waiting for the operator's choice:
   * that is what the replay holds (lib/outbox.ts) and what the older row
   * affordance got wrong.
   */
  const mustWait = (id: string) => !!store && forMission(readOutbox(store), id).length > 0;

  async function load(): Promise<ListView> {
    let outcome: Awaited<ReturnType<Transport["list"]>>;
    try {
      outcome = await transport.list();
    } catch (err) {
      return fallBack(`The store could not be reached: ${err instanceof Error ? err.message : "unknown"}.`);
    }
    if (outcome.ok) {
      const at = now();
      if (store) cacheRead(store, outcome.read, at);
      return { read: outcome.read, readAt: at, live: true, error: null, signedOut: false, blocked: false };
    }
    // No session, or an Account still waiting: the cached list may be another
    // Account's, so it is never shown in their place.
    if (outcome.status === 401 || outcome.status === 403) {
      return {
        read: null,
        readAt: null,
        live: false,
        error: outcome.text,
        signedOut: outcome.status === 401,
        blocked: true,
      };
    }
    return fallBack(outcome.text);
  }

  /** Standing next to the aircraft with no signal, the last answer is worth more
   *  than an empty screen -- but only if it can never be mistaken for the live
   *  one, which is what the stamp on it is for. */
  function fallBack(why: string): ListView {
    // No signal at all is said as such: it is the common case at a Site, and
    // "could not be reached" reads like a fault (PWA-1, #313).
    const cached = store ? cachedRead(store) : null;
    return {
      read: cached?.read ?? null,
      readAt: cached?.read_at ?? null,
      live: cached !== null ? false : true,
      error: online() ? why : "You are offline",
      signedOut: false,
      blocked: false,
    };
  }

  async function act(action: MissionAction, id: string): Promise<ActOutcome> {
    const op = OP_OF[action];
    // Kept on this device when there is no network to send it over, and when
    // this Mission has something older still waiting: a newer change never
    // overtakes one made before it. Dispatch is never kept -- with no network
    // it is refused, and behind a queued change it waits for one (ADR 0022).
    const keep = (): ActOutcome => {
      if (!op) return { text: `Dispatch failed: ${NEEDS_NETWORK}`, queued: false };
      if (!store || !enqueue(store, op, id)) return { text: noRoom(action), queued: false };
      return { text: kept(action), queued: true };
    };
    if (!online()) return keep();
    if (mustWait(id)) {
      return op ? keep() : { text: `Dispatch failed: ${WAITING_FIRST}`, queued: false };
    }
    return { text: (await transport.run(action, id)).text, queued: false };
  }

  async function save(draft: MissionDraft, how?: Parameters<typeof missionClient.save>[1], base?: string): Promise<SaveOutcome> {
    // With no signal the save is kept on this device and sent when the network
    // is back (PWA-3). Edits already waiting for this Mission go first, so a
    // newer one never overtakes them.
    if (!(draft.id && mustWait(draft.id)) && online()) {
      const outcome = await transport.save(draft, how);
      return outcome.ok ? { ok: true, text: outcome.text, mission: outcome.mission } : { ok: false, text: outcome.text };
    }
    const id = draft.id ?? localId();
    const entry = store && enqueue(store, "save", id, { ...draft, id, base_updated_at: draft.id ? base : undefined });
    if (!entry) return { ok: false, text: "Not saved: this browser has no room to keep it for later. Nothing changed." };
    noteMissionSaved();
    return {
      kept: true,
      // Not "saved": it is on this device and not in the store yet.
      text: `Kept on this device, waiting to sync. “${draft.name}” is sent to the store when the network is back.`,
      mission: {
        id,
        site_id: draft.site_id,
        site: draft.site,
        name: draft.name,
        date: draft.date,
        spec: entry.draft!.spec,
        created_at: "",
        updated_at: entry.draft?.base_updated_at ?? "",
        dispatched_key: null,
      },
    };
  }

  async function reportLoaded(id: string, cards: BoardCard[]): Promise<MarkResult> {
    const wait = (): MarkResult => (store && enqueueLoaded(store, id, cards) ? "waiting" : "refused");
    if (!online()) return wait();
    if (mustWait(id)) return wait();
    const done = await transport.markLoaded(id, cards);
    if (done.ok) return "sent";
    // No route reached, the store failing, or a session that ended (401): the
    // report can mend. Any other answer is the store saying no.
    return done.status === undefined || done.status >= 500 || done.status === 401 ? wait() : "refused";
  }

  async function sync(): Promise<Report | null> {
    if (!store || transport.signedOut() || !readOutbox(store).some((e) => !e.problem)) return null;
    const report = await replay(store, transport.send);
    if (report.sent.length === 0 && report.refused.length === 0) return null;
    const named = (e: Entry) =>
      `“${e.draft?.name ?? e.problem?.conflict?.name ?? rows().find((r) => r.id === e.mission_id)?.name ?? "A Mission"}”`;
    const lines = report.refused.map((e) =>
      e.problem?.conflict
        ? `${named(e)} changed in the store while you were offline. Compare the two versions on its row and choose which to keep.`
        : `${named(e)} could not be sent: ${e.problem?.text}`,
    );
    const n = report.sent.length;
    if (n > 0) lines.push(`${n} ${n === 1 ? "change" : "changes"} made offline ${n === 1 ? "is" : "are"} now in the store.`);
    deps.onNotice?.({
      title: firstSentence(lines[0]),
      body: lines.join(" "),
      missionName: "",
      failed: report.refused.length > 0,
    });
    return report;
  }

  const waitingFor = (id: string) => (store ? forMission(readOutbox(store), id) : []);

  return { load, act, save, reportLoaded, sync, waitingFor };
}
