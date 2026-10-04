// One client for the Mission routes: the list, the five row actions and Save.
//
// The components' own fetch calls, their status handling and their operator
// wording live here so the wire contract and the sentences have one home
// (#263). The credential overlay keeps the passphrase from either field --
// they are one value -- without touching storage at import: a browser set to
// block site data must not take the module down (#152).

import { readPassphrase, subscribePassphrase } from "./passphrase.ts";
import { describeResult, noteMissionSaved, noteMissionsChanged } from "./actions.ts";
import { describeSave } from "./missionView.ts";
import type { ActionResult } from "./actions.ts";
import type { BoardCard } from "./board.ts";
import type { Entry, OutboxOp, Sent } from "./outbox.ts";
import type { MissionRecord } from "./missionRecords.ts";
import type { MissionListRead } from "./missionView.ts";
import type { MissionSpec } from "./spec.ts";

/** The five row actions whose press reaches the store. Edit and Copy are local
 *  to the list and never come here. */
export type MissionAction = "Dispatch" | "Withdraw" | "Mark Flown" | "Unmark Flown" | "Remove";

/** A call that did not succeed. `text` is the final operator sentence, chosen
 *  here so callers never re-word; `status` is absent when the call never
 *  reached a route (fetch threw). */
export interface CallFailure {
  ok: false;
  status?: number;
  text: string;
  /** A save refused because the store's Mission is not the version it was
   *  made against: the store's record and its state (PWA-3). */
  conflict?: { record: MissionRecord; state?: string };
}

/** GET /api/missions?archived=1, already shape-checked (an array of Missions)
 *  and parsed into the type the cache stores. */
export type ListResult = { ok: true; read: MissionListRead } | CallFailure;

/** A row action. `text` is `describeResult(action, result)`: the success
 *  sentence on `ok`, the "<Action> failed: ..." sentence otherwise. */
export type RunResult = { ok: true; text: string } | CallFailure;

/** POST /api/missions. Success carries the written Mission -- the one the
 *  caller hands to `onSaved` -- and the `describeSave` sentence. */
export type SaveResult = { ok: true; mission: MissionRecord; text: string } | CallFailure;

/** Exactly the fields SummaryBar sends; an absent `id` is a new Mission. */
export interface MissionDraft {
  id?: string;
  site_id: string;
  site: string;
  name: string;
  date: string;
  spec: MissionSpec;
  /** The `updated_at` of the stored Mission this edit was made against, when it
   *  waited offline: the route refuses it if the store has moved on. */
  base_updated_at?: string;
}

// The credential, seeded lazily from storage and kept current by the shared
// passphrase signal. Module scope because both fields and every call cross
// here; registering a listener is not storage access, so import stays safe.
let credential: string | null = null;

subscribePassphrase((value) => {
  credential = value;
});

/** The passphrase to put on the wire. #244 replaces this one function with
 *  the Account's session; nothing else here changes. */
function key(): string {
  if (credential === null) credential = readPassphrase() ?? "";
  return credential;
}

/** The single definition of the signed-out state: the credential resolves to
 *  "". Synchronous, for callers' pre-call guards. */
export function signedOut(): boolean {
  return key() === "";
}

/** What came back from a call, or why nothing did. */
type Reply =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> }
  | { ok: false; threw: string };

/** One call, body read as the routes write it. `globalThis.fetch` is read
 *  inside the closure, so a test can swap it and a bundle cannot capture it
 *  at import. */
async function attempt(call: () => Promise<Response>, unknownThrow = "unknown"): Promise<Reply> {
  try {
    const res = await call();
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return res.ok ? { ok: true, status: res.status, body } : { ok: false, status: res.status, body };
  } catch (err) {
    return { ok: false, threw: err instanceof Error ? err.message : unknownThrow };
  }
}

function post(path: string, body: unknown): Promise<Response> {
  return globalThis.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-wayfinder-key": key() },
    body: JSON.stringify(body),
  });
}

/** The whole list, archived rows included: `archived_count` and the archived
 *  rows come in one call, so the filter costs nothing and the count cannot
 *  disagree with what the filter reveals. */
export async function list(): Promise<ListResult> {
  const reply = await attempt(() =>
    globalThis.fetch("/api/missions?archived=1", { headers: { "x-wayfinder-key": key() } }),
  );
  if (reply.ok && Array.isArray(reply.body.missions)) {
    return { ok: true, read: reply.body as unknown as MissionListRead };
  }
  if ("threw" in reply) return { ok: false, text: `The store could not be reached: ${reply.threw}.` };
  const { body, status } = reply;
  return {
    ok: false,
    status,
    text: typeof body.error === "string" ? body.error : `The Mission list could not be read (HTTP ${status}).`,
  };
}

/** One row action, to the route that owns it. */
export async function run(action: MissionAction, id: string): Promise<RunResult> {
  const reply = await attempt(() => {
    switch (action) {
      case "Dispatch":
        return post("/api/missions/dispatch", { id });
      case "Withdraw":
        return post("/api/missions/withdraw", { id });
      case "Mark Flown":
        return post("/api/missions/flown", { id, flown: true });
      case "Unmark Flown":
        return post("/api/missions/flown", { id, flown: false });
      case "Remove":
        return globalThis.fetch(`/api/missions?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-wayfinder-key": key() },
        });
    }
  });

  // `Reply` is structurally an `ActionResult`; `satisfies` keeps the two in
  // step without a cast.
  const text = describeResult(action, reply satisfies ActionResult);
  if (reply.ok) {
    // A Mission list open in another window shows this now, not at its next
    // five-minute poll. A failure signals nothing.
    noteMissionsChanged();
    return { ok: true, text };
  }
  if ("threw" in reply) return { ok: false, text };
  return { ok: false, status: reply.status, text };
}

/** Save the editor's Mission. A change to a Mission already Dispatched saves
 *  as a replacement, which is what `describeSave`'s fork sentence reports;
 *  `how` is which of the Save sheet's choices this was, so the sentence can
 *  say so. */
export async function save(draft: MissionDraft, how?: Parameters<typeof describeSave>[1]): Promise<SaveResult> {
  const reply = await attempt(
    () =>
      globalThis.fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": key() },
        body: JSON.stringify({
          id: draft.id,
          site_id: draft.site_id,
          site: draft.site,
          name: draft.name,
          date: draft.date,
          spec: draft.spec,
          base_updated_at: draft.base_updated_at,
        }),
      }),
    "the store could not be reached",
  );

  if (reply.ok && reply.body.mission) {
    // Unlike a row action, a save is followed by no read of its own: the
    // window that saved must read back at once, not at its next poll (#294).
    noteMissionSaved();
    return {
      ok: true,
      mission: reply.body.mission as MissionRecord,
      text: describeSave(
        reply.body as {
          forked_from?: string | null;
          superseded_on_dispatch?: string | null;
          mission?: { name?: string } | null;
        },
        how,
      ),
    };
  }
  if ("threw" in reply) return { ok: false, text: `Not saved: ${reply.threw}. Nothing changed.` };
  const { body, status } = reply;
  return {
    ok: false,
    status,
    text: typeof body.error === "string" ? body.error : `Not saved (HTTP ${status}). Nothing changed.`,
    ...(body.conflict ? { conflict: { record: body.conflict as MissionRecord, state: body.state as string | undefined } } : {}),
  };
}

/** Tell the store the board Loaded a Mission (PWA-4, #318): the Cards it wrote,
 *  as the Load view saw them. Repeats are harmless. */
export async function markLoaded(id: string, cards: BoardCard[]): Promise<{ ok: true } | CallFailure> {
  const reply = await attempt(() =>
    post("/api/missions/loaded", {
      id,
      cards: cards.map((c) => ({ card: c.card, name: c.mission, waypoints: c.waypoints })),
    }),
  );
  if (reply.ok) {
    noteMissionsChanged();
    return { ok: true };
  }
  if ("threw" in reply) return { ok: false, text: `Loaded report failed: ${reply.threw}` };
  const { body, status } = reply;
  return { ok: false, status, text: typeof body.error === "string" ? body.error : `Loaded report failed (HTTP ${status}).` };
}

const ACTION_OF: Record<Exclude<OutboxOp, "save" | "loaded">, MissionAction> = {
  withdraw: "Withdraw",
  flown: "Mark Flown",
  unflown: "Unmark Flown",
  remove: "Remove",
};

/** One waiting edit, to the route that owns it, for `replay`: sent, refused
 *  with the store's own sentence, or the store could not be reached. A 5xx is
 *  the store failing, not the edit being wrong, so the edit waits for the next
 *  try. */
export async function send(entry: Entry): Promise<Sent> {
  if (entry.op === "save" && entry.draft) {
    const saved = await save(entry.draft);
    return saved.ok ? { ok: true, id: saved.mission.id, updated_at: saved.mission.updated_at } : unsent(saved);
  }
  if (entry.op === "loaded") {
    const reported = await markLoaded(entry.mission_id, entry.cards ?? []);
    return reported.ok ? { ok: true } : unsent(reported);
  }
  const done = await run(ACTION_OF[entry.op as keyof typeof ACTION_OF], entry.mission_id);
  return done.ok ? { ok: true } : unsent(done);
}

function unsent(failure: CallFailure): Sent {
  if (failure.status === undefined || failure.status >= 500) return { ok: false, later: true };
  const { conflict } = failure;
  return { ok: false, problem: { text: failure.text, ...(conflict ? { conflict: conflict.record, state: conflict.state } : {}) } };
}
