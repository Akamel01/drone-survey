// The planner's one place that decides whether a Mission's change is sent, kept
// on this device, or refused (#348), over a Map standing in for the browser's
// storage, a recorded transport, and an injected `online` probe.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  NEEDS_NETWORK,
  WAITING_FIRST,
  createRepository,
  type ListView,
  type SaveOutcome,
  type Transport,
} from "./missionRepository.ts";
import type { MissionAction, MissionDraft } from "./missionClient.ts";
import type { MissionRecord, MissionRow } from "./missionRecords.ts";
import type { BoardCard } from "./board.ts";
import { CACHE_KEY } from "./missionView.ts";
import type { KeyValue, MissionListRead } from "./missionView.ts";
import { OUTBOX_KEY, enqueue, readOutbox, unshown, type Entry, type Sent } from "./outbox.ts";
import { DEFAULT_SPEC } from "./spec.ts";

const realFetch = globalThis.fetch;
const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let fetchCalls: { url: string; init?: RequestInit }[] = [];
let answer: (url: string, init?: RequestInit) => Response | Promise<Response>;

beforeEach(() => {
  fetchCalls = [];
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return answer(String(input), init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realStorage) Object.defineProperty(globalThis, "localStorage", realStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

// --- fakes -----------------------------------------------------------------

function storage(seed?: Record<string, string>): KeyValue & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const RECORD: MissionRecord = {
  id: "m1",
  site_id: "s1",
  site: "Site",
  name: "north half",
  date: "2026-09-26",
  created_at: "t0",
  updated_at: "t1",
  spec: DEFAULT_SPEC,
  dispatched_key: "specs/m1",
};
const ROW = { id: "m1", name: "north half", site: "Site", date: "2026-09-26", state: "dispatched", spec: DEFAULT_SPEC } as MissionRow;
const READ: MissionListRead = { missions: [ROW], archived_count: 0 } as unknown as MissionListRead;

interface Recorder extends Transport {
  ran: { action: MissionAction; id: string }[];
  saved: MissionDraft[];
  marked: { id: string; cards: BoardCard[] }[];
  sent: Entry[];
  listed: number;
}

function recorder(over: Partial<Transport> = {}): Recorder {
  const rec: Recorder = {
    ran: [],
    saved: [],
    marked: [],
    sent: [],
    listed: 0,
    list: async () => {
      rec.listed += 1;
      return { ok: true, read: READ };
    },
    run: async (action, id) => {
      rec.ran.push({ action, id });
      return { ok: true, text: `${action} done` };
    },
    save: async (draft) => {
      rec.saved.push(draft);
      return { ok: true, mission: RECORD, text: "Saved." };
    },
    markLoaded: async (id, cards) => {
      rec.marked.push({ id, cards });
      return { ok: true };
    },
    send: async (entry) => {
      rec.sent.push(entry);
      return { ok: true } satisfies Sent;
    },
    signedOut: () => false,
    ...over,
  };
  return rec;
}

const draft = (over: Partial<MissionDraft> = {}): MissionDraft => ({
  id: "m1",
  site_id: "s1",
  site: "Site",
  name: "north half",
  date: "2026-09-26",
  spec: DEFAULT_SPEC,
  ...over,
});

const CARDS: BoardCard[] = [{ card: "way finder 4", mission: "Site A 2026-09-30", waypoints: 125 }];

// --- the cases -------------------------------------------------------------

test("act: an online action waits behind this Mission's older queued save, instead of overtaking it", async () => {
  const store = storage();
  // A replacement of a Dispatched Mission: no row of its own, so the list used
  // to leave its buttons enabled and act() used to send over it (the hole).
  enqueue(store, "save", "m1", draft({ base_updated_at: "t1" }));
  assert.deepEqual(
    unshown([ROW], readOutbox(store)).map((e) => e.op),
    ["save"],
    "the seed is the apart/unshown case",
  );

  const transport = recorder();
  const repo = createRepository({ store, online: () => true, transport });

  const done = await repo.act("Withdraw", "m1");

  assert.deepEqual(transport.ran, [], "nothing went to the store");
  assert.deepEqual(done, {
    text: "Withdraw kept on this device, waiting to sync. It is sent to the store when the network is back.",
    queued: true,
  });
  assert.deepEqual(
    readOutbox(store).map((e) => [e.seq, e.op]),
    [
      [1, "save"],
      [2, "withdraw"],
    ],
    "the newer action sits behind the older save",
  );
});

test("act: Dispatch is refused behind a queued change online, and for want of network offline", async () => {
  const store = storage();
  enqueue(store, "save", "m1", draft({ base_updated_at: "t1" }));

  const online = recorder();
  const waiting = await createRepository({ store, online: () => true, transport: online }).act("Dispatch", "m1");
  assert.equal(waiting.text, `Dispatch failed: ${WAITING_FIRST}`);
  assert.equal(waiting.queued, false);
  assert.deepEqual(online.ran, []);

  // With no network the reason is the network, not the queue (offline-sync).
  const offline = recorder();
  const dark = await createRepository({ store, online: () => false, transport: offline }).act("Dispatch", "m1");
  assert.equal(dark.text, `Dispatch failed: ${NEEDS_NETWORK}`);
  assert.deepEqual(offline.ran, []);
  assert.deepEqual(readOutbox(store).map((e) => e.op), ["save"], "Dispatch is never kept for later (ADR 0022)");
});

test("act: with nothing waiting it goes to the store; with no room to keep it, the browser says so", async () => {
  const store = storage();
  const transport = recorder();
  assert.deepEqual(await createRepository({ store, online: () => true, transport }).act("Mark Flown", "m1"), {
    text: "Mark Flown done",
    queued: false,
  });
  assert.deepEqual(transport.ran, [{ action: "Mark Flown", id: "m1" }]);

  const full = storage();
  full.setItem = () => {
    throw new DOMException("full", "QuotaExceededError");
  };
  const dark = recorder();
  const kept = await createRepository({ store: full, online: () => false, transport: dark }).act("Remove", "m1");
  assert.equal(kept.text, "Remove failed: this browser has no room to keep it for later. Nothing changed.");
  assert.equal(kept.queued, false);
});

test("save: behind this Mission's waiting changes it is kept and coalesced, never sent", async () => {
  const store = storage();
  enqueue(store, "save", "m1", draft({ name: "First", base_updated_at: "t1" }));
  const transport = recorder();
  const repo = createRepository({ store, online: () => true, transport });

  const outcome: SaveOutcome = await repo.save(draft({ name: "Second" }), undefined, "t9");

  assert.deepEqual(transport.saved, [], "nothing went to the store");
  assert.ok("kept" in outcome, "it is on this device, not in the store");
  assert.equal(
    outcome.text,
    "Kept on this device, waiting to sync. “Second” is sent to the store when the network is back.",
  );
  const entries = readOutbox(store);
  assert.equal(entries.length, 1, "two saves of one Mission are one");
  assert.equal(entries[0].draft?.name, "Second");
  assert.equal(entries[0].draft?.base_updated_at, "t1", "made against the first one's version");
  assert.equal(outcome.mission.name, "Second");
});

test("save: with nothing waiting it is sent, and the store's own sentence is passed through", async () => {
  const store = storage();
  const transport = recorder();
  const sent = await createRepository({ store, online: () => true, transport }).save(draft());
  assert.ok("ok" in sent && sent.ok);
  assert.equal(sent.mission.id, "m1");
  assert.deepEqual(transport.saved.map((d) => d.name), ["north half"]);
});

test("reportLoaded: it waits behind this Mission's changes, keeps when there is no network, and is refused only by a store that says no", async () => {
  const store = storage();
  enqueue(store, "save", "m1", draft({ base_updated_at: "t1" }));
  const transport = recorder();
  assert.equal(await createRepository({ store, online: () => true, transport }).reportLoaded("m1", CARDS), "waiting");
  assert.deepEqual(transport.marked, [], "the store was not told over the queued save");
  assert.deepEqual(readOutbox(store).map((e) => e.op), ["save", "loaded"]);

  const dark = recorder();
  assert.equal(await createRepository({ store, online: () => false, transport: dark }).reportLoaded("m2", CARDS), "waiting");
  assert.deepEqual(dark.marked, []);

  const refused = recorder({ markLoaded: async () => ({ ok: false as const, status: 409, text: "This Mission is withdrawn" }) });
  assert.equal(await createRepository({ store: storage(), online: () => true, transport: refused }).reportLoaded("m1", CARDS), "refused");
});

test("load: a session that ended is signed out and never falls back to the cache; 403 never falls back either", async () => {
  const answer = (body: unknown, status: number) => () => Response.json(body, { status });
  let now = () => 1000;

  const signedOut = await createRepository({
    store: storage(),
    online: () => true,
    transport: recorder({ list: async () => ({ ok: false as const, status: 401, text: "Sign in to continue" }) }),
    now,
  }).load();
  assert.equal(signedOut.signedOut, true);
  assert.equal(signedOut.blocked, true);
  assert.equal(signedOut.read, null);

  const stale = await createRepository({
    store: storage({ [CACHE_KEY]: JSON.stringify({ read_at: 7, read: READ }) }),
    online: () => true,
    transport: recorder({ list: async () => ({ ok: false as const, status: 401, text: "Sign in to continue" }) }),
    now,
  }).load();
  assert.equal(stale.read, null, "the cached list may be another Account's");
  assert.equal(now(), 1000, "and no read was taken to cache");

  const forbidden = await createRepository({
    store: storage({ [CACHE_KEY]: JSON.stringify({ read_at: 7, read: READ }) }),
    online: () => true,
    transport: recorder({ list: async () => ({ ok: false as const, status: 403, text: "Sign in to continue" }) }),
    now,
  }).load();
  assert.equal(forbidden.blocked, true);
  assert.equal(forbidden.signedOut, false);
  assert.equal(forbidden.read, null);
});

test("load: a good read is cached and live; anything else falls back to the last one, marked as such", async () => {
  const store = storage();
  const live: ListView = await createRepository({ store, online: () => true, transport: recorder(), now: () => 4242 }).load();
  assert.equal(live.live, true);
  assert.equal(live.error, null);
  assert.deepEqual(JSON.parse(store.getItem(CACHE_KEY)!), { read_at: 4242, read: READ });

  const cached = storage({ [CACHE_KEY]: JSON.stringify({ read_at: 7, read: READ }) });
  const stale = await createRepository({
    store: cached,
    online: () => true,
    transport: recorder({ list: async () => ({ ok: false as const, status: 500, text: "The store had a fault." }) }),
  }).load();
  assert.deepEqual([stale.live, stale.readAt, stale.error], [false, 7, "The store had a fault."]);

  const offline = await createRepository({
    store: cached,
    online: () => false,
    transport: recorder({ list: async () => ({ ok: false as const, text: "The store could not be reached: boom." }) }),
  }).load();
  assert.deepEqual([offline.live, offline.readAt, offline.error], [false, 7, "You are offline"]);

  const broken = await createRepository({
    store: storage({ [CACHE_KEY]: "{not json" }),
    online: () => false,
    transport: recorder({ list: async () => ({ ok: false as const, text: "The store could not be reached: boom." }) }),
  }).load();
  assert.deepEqual([broken.read, broken.readAt], [null, null], "a cache that does not parse is no cache");
});

test("sync: entries go in the order they were made, a refusal holds that Mission's later ones, and the Notice says what happened", async () => {
  const store = storage();
  enqueue(store, "save", "m1", draft({ base_updated_at: "t1" }));
  enqueue(store, "withdraw", "m1");
  enqueue(store, "flown", "m2");
  const answers = new Map<string, Sent>([
    ["save", { ok: false, problem: { text: "This Mission is archived" } }],
    ["withdraw", { ok: true }],
    ["flown", { ok: true, updated_at: "t5" }],
  ]);
  const transport = recorder({
    send: async (entry) => {
      transport.sent.push(entry);
      return answers.get(entry.op)!;
    },
  });
  const notices: { title: string; body: string; failed: boolean }[] = [];
  const repo = createRepository({
    store,
    online: () => true,
    transport,
    rows: () => [ROW],
    onNotice: (p) => notices.push(p),
  });

  const report = await repo.sync();

  assert.deepEqual(transport.sent.map((e) => e.op), ["save", "flown"], "the refusal holds m1's later entry, not m2's");
  assert.deepEqual(report?.refused.map((e) => e.op), ["save"]);
  assert.deepEqual(report?.sent.map((s) => s.id), ["m2"]);
  assert.equal(notices.length, 1);
  assert.equal(
    notices[0].body,
    "“north half” could not be sent: This Mission is archived 1 change made offline is now in the store.",
  );
  assert.equal(notices[0].title, "“north half” could not be sent: This Mission is archived");
  assert.equal(notices[0].failed, true);

  // Nothing left to send is nothing said.
  notices.length = 0;
  assert.equal(await createRepository({ store, online: () => true, transport, onNotice: (p) => notices.push(p) }).sync(), null);
  assert.deepEqual(notices, []);
});

test("waitingFor: the whole of a Mission's set, including the saves the list shows apart", async () => {
  const store = storage();
  enqueue(store, "save", "m1", draft({ base_updated_at: "t1" }));
  enqueue(store, "withdraw", "m2");
  const repo = createRepository({ store, online: () => true, transport: recorder() });
  assert.deepEqual(repo.waitingFor("m1").map((e) => e.op), ["save"]);
  assert.deepEqual(repo.waitingFor("m2").map((e) => e.op), ["withdraw"]);
  assert.deepEqual(repo.waitingFor("m3"), []);
});

test("the transport is the client itself: same-origin fetch, the session cookie, and no secret of its own", async () => {
  answer = () => Response.json({ mission: RECORD });
  const repo = createRepository();
  await repo.save(draft());
  assert.deepEqual(fetchCalls.map((c) => c.url), ["/api/missions"]);
  assert.deepEqual(Object.keys(fetchCalls[0].init!.headers as Record<string, string>), ["Content-Type"]);
  assert.equal(
    JSON.stringify(fetchCalls[0].init?.headers).includes(RECORD.id),
    false,
    "nothing but the body carries the Mission",
  );
  assert.deepEqual(kept_keys(), [], "no credential was written anywhere");
});

/** Everything the default repository wrote to storage while sending that save. */
function kept_keys(): string[] {
  const ls = globalThis.localStorage as unknown as Storage;
  return [OUTBOX_KEY, CACHE_KEY].filter((k) => ls.getItem(k) !== null);
}
