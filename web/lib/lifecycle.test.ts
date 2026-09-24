// The Mission lifecycle under stress (#152): the real route handlers, the real
// B2 client and checksums, against an in-memory store that counts transactions
// and fails on demand. Only the far side of the network is replaced.
//
// "Handled" means one of three things, and every case here asserts which:
// it cannot happen (a structure prevents it), it is refused with a next step,
// or it is absorbed and the operator is told. Silence is never an outcome.

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { FAKE_BUCKET, installFakeStore } from "./fakeStore.ts";
import { LEDGER_KEY, MISSIONS_PREFIX, SKIPPED_KEY, STATUS_KEY, SUMMARIES_KEY } from "./keys.ts";
import type { CardLedger } from "./model.ts";
import type { MissionRow } from "./missionRecords.ts";
import { DEFAULT_SPEC, type MissionSpec } from "./spec.ts";

process.env.DISPATCH_SECRET = "test-secret";
process.env.B2_KEY_ID = "key";
process.env.B2_APP_KEY = "app";
process.env.B2_BUCKET = FAKE_BUCKET;
// The real settle wait lets a racing writer's upload land before the check;
// the fake store answers instantly, so the race is decided without it.
process.env.LEDGER_SETTLE_MS = "0";
delete process.env.B2_READ_KEY_ID;
delete process.env.B2_READ_APP_KEY;

const store = installFakeStore();
after(() => store.restore());

const missions = await import("../app/api/missions/route.ts");
const dispatchRoute = await import("../app/api/missions/dispatch/route.ts");
const withdrawRoute = await import("../app/api/missions/withdraw/route.ts");
const flownRoute = await import("../app/api/missions/flown/route.ts");

// ---------------------------------------------------------------------------
// Driving it
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function request(method: string, body?: unknown, key = "test-secret", query = ""): Request {
  return new Request(`http://planner.test/api/missions${query}`, {
    method,
    headers: { "x-wayfinder-key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function answer(res: Response): Promise<{ status: number; body: Json }> {
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}

/** A small rectangle that plans as one flight on one battery. */
const ONE_FLIGHT: [number, number][] = [
  [49.18946, -122.84085],
  [49.18795, -122.84085],
  [49.18795, -122.83938],
  [49.18944, -122.83934],
];
/** A block large enough to need several batteries, so several Cards. */
const THREE_FLIGHTS: [number, number][] = [
  [49.1902, -122.8430],
  [49.1860, -122.8430],
  [49.1860, -122.8370],
  [49.1902, -122.8370],
];

function spec(aoi = ONE_FLIGHT): MissionSpec {
  return {
    ...DEFAULT_SPEC,
    site: "GeorgeTown2",
    site_id: "g-z2m4tx",
    date: "2026-09-24",
    aoi,
    flight: { ...DEFAULT_SPEC.flight, altitude_m: 60, speed_ms: 2.5, margin_passes: 0.5, gimbal_pitch_deg: -90 },
  };
}

async function save(over: Json = {}): Promise<{ status: number; body: Json }> {
  const s = (over.spec as MissionSpec) ?? spec();
  return answer(
    await missions.POST(
      request("POST", { site_id: s.site_id, site: s.site, name: "Ortho", date: s.date, spec: s, ...over }),
    ),
  );
}

async function saved(over: Json = {}): Promise<string> {
  const r = await save(over);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body.mission as { id: string }).id;
}

const dispatch = async (id: string) => answer(await dispatchRoute.POST(request("POST", { id })));
const withdraw = async (id: string) => answer(await withdrawRoute.POST(request("POST", { id })));
const markFlown = async (id: string, flown = true) => answer(await flownRoute.POST(request("POST", { id, flown })));

async function list(): Promise<{ status: number; rows: MissionRow[]; body: Json }> {
  const r = await answer(await missions.GET(request("GET", undefined, "test-secret", "?archived=1")));
  return { status: r.status, rows: (r.body.missions as MissionRow[]) ?? [], body: r.body };
}

async function rowOf(id: string): Promise<MissionRow> {
  const found = (await list()).rows.find((m) => m.id === id);
  assert.ok(found, `Mission ${id} is not in the list`);
  return found;
}

const ledger = () => store.json(LEDGER_KEY) as CardLedger;
const held = () => Object.values(ledger().holdings).filter((h) => !h.flown_at).map((h) => h.card).sort();

/** What the host does when it Collects a Spec, written the way it writes it. */
function hostCollects(key: string): void {
  const manifest = (store.json(STATUS_KEY) as Json) ?? {};
  store.put(STATUS_KEY, { ...manifest, [key]: { collected_at: "2026-09-24T08:00:00Z" } });
}

/** What the host does when it Loads a Spec, written the way it writes it. */
function hostLoads(key: string, waypoints = 184): void {
  const manifest = (store.json(STATUS_KEY) as Json) ?? {};
  const l = ledger();
  const cards = Object.values(l.holdings).filter((h) => h.spec_key === key);
  for (const h of cards) l.holdings[h.card] = { ...h, written_at: "2026-09-24T08:05:00Z", written_md5: "md5" };
  store.put(LEDGER_KEY, l);
  store.put(STATUS_KEY, {
    ...manifest,
    [key]: {
      collected_at: "2026-09-24T08:00:00Z",
      loaded_at: "2026-09-24T08:05:00Z",
      parts: cards.length,
      cards: cards.map((h) => ({ card: h.card, name: "x", waypoints })),
    },
  });
}

function pool(n: number): void {
  store.put(LEDGER_KEY, { pool: Array.from({ length: n }, (_, i) => `way finder ${i + 1}`), holdings: {} });
}

beforeEach(() => {
  store.files.clear();
  store.beforeDownload = null;
  pool(3);
});

// ---------------------------------------------------------------------------
// The Card pool
// ---------------------------------------------------------------------------

test("pool: every Card held and another Dispatched is refused at Dispatch, naming what is in the way", async () => {
  pool(1);
  const first = await saved({ name: "Ortho" });
  assert.equal((await dispatch(first)).status, 200);
  const second = await saved({ name: "Facade" });
  const r = await dispatch(second);
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /way finder 1/);
  assert.match(String(r.body.error), /Mark a Mission Flown, or withdraw one/);
  assert.equal((await rowOf(second)).state, "planned", "a refusal leaves it Planned");
  const specs = [...store.files.keys()].filter((k) => k.startsWith("specs/g-z2m4tx/"));
  assert.equal(specs.length, 1, "a refused Dispatch leaves no Spec for the host to Collect");
});

test("pool: a Mission needing several Cards when fewer are free takes none of them", async () => {
  pool(2);
  const big = await saved({ spec: spec(THREE_FLIGHTS), name: "Block" });
  const r = await dispatch(big);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.ok((r.body.needed as number) > 2, `needed ${r.body.needed}`);
  assert.deepEqual(held(), [], "nothing is half-reserved");
});

test("pool: Flown, Withdraw and supersession each free exactly the Cards they held", async () => {
  const a = await saved({ name: "A" });
  const b = await saved({ name: "B" });
  const c = await saved({ name: "C" });
  for (const id of [a, b, c]) assert.equal((await dispatch(id)).status, 200);
  assert.deepEqual(held(), ["way finder 1", "way finder 2", "way finder 3"]);

  assert.equal((await withdraw(a)).status, 200);
  assert.deepEqual(held(), ["way finder 2", "way finder 3"], "Withdraw frees its own Card only");

  const bKey = (await rowOf(b)).spec_key as string;
  hostLoads(bKey);
  assert.equal((await markFlown(b)).status, 200);
  assert.deepEqual(held(), ["way finder 3"], "Flown frees its own Card only");

  // Edit a Dispatched Mission: the fork supersedes it at Dispatch.
  const cRow = await rowOf(c);
  const fork = await save({ id: c, name: cRow.name });
  assert.equal(fork.status, 200);
  const forkId = (fork.body.mission as { id: string }).id;
  assert.notEqual(forkId, c);
  assert.equal((await dispatch(forkId)).status, 200);
  assert.equal((await rowOf(c)).state, "superseded");
  assert.equal(held().length, 1, "the fork holds one Card, the superseded one none");
  assert.ok(cRow.spec_key && (store.json(SKIPPED_KEY) as Json)[cRow.spec_key], "the host is told to skip it");
});

test("pool: a withdrawn Mission's Card is reusable immediately", async () => {
  pool(1);
  const a = await saved({ name: "A" });
  await dispatch(a);
  await withdraw(a);
  const b = await saved({ name: "B" });
  const r = await dispatch(b);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.cards, ["way finder 1"]);
});

test("pool: Cards calibrated after Missions were reserved join the pool without disturbing them", async () => {
  pool(1);
  const a = await saved({ name: "A" });
  await dispatch(a);
  const l = ledger();
  store.put(LEDGER_KEY, { ...l, pool: [...l.pool, "way finder 2"] });
  const b = await saved({ name: "B" });
  assert.deepEqual((await dispatch(b)).body.cards, ["way finder 2"]);
  assert.equal((await rowOf(a)).cards[0].card, "way finder 1");
});

test("pool: a reservation lives in the store, so any browser sees it", async () => {
  const a = await saved();
  await dispatch(a);
  // A fresh read with no client state at all -- another browser, a cleared cache.
  const { rows } = await list();
  assert.equal(rows[0].cards[0].card, "way finder 1");
  assert.equal(rows[0].state, "dispatched");
});

// ---------------------------------------------------------------------------
// Missions and identity
// ---------------------------------------------------------------------------

test("identity: two Missions of one Site and day with different names are both live", async () => {
  const a = await saved({ name: "Ortho" });
  const b = await saved({ name: "Facade" });
  assert.equal((await dispatch(a)).status, 200);
  assert.equal((await dispatch(b)).status, 200);
  assert.equal((await rowOf(a)).state, "dispatched");
  assert.equal((await rowOf(b)).state, "dispatched");
  assert.equal(held().length, 2);
});

test("identity: names differing only by case or spacing are the same name", async () => {
  await saved({ name: "Ortho" });
  const r = await save({ name: " ortho  " });
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /already exists/);
});

test("identity: a new Site cannot take an existing Site's name", async () => {
  await saved();
  const other = spec();
  const r = await save({ spec: { ...other, site_id: "georgetown2-zzz" }, site_id: "georgetown2-zzz", site: "georgetown2" });
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /already a Site called/);
});

test("identity: a Mission withdrawn after the host Collected it is withdrawn, and the host is told", async () => {
  const a = await saved();
  await dispatch(a);
  const key = (await rowOf(a)).spec_key as string;
  hostCollects(key);
  assert.equal((await rowOf(a)).state, "collected");
  const r = await withdraw(a);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok((store.json(SKIPPED_KEY) as Json)[key]);
  assert.deepEqual(held(), []);
});

test("identity: a Loaded Mission cannot be withdrawn or edited, and says why", async () => {
  const a = await saved();
  await dispatch(a);
  hostLoads((await rowOf(a)).spec_key as string);
  const w = await withdraw(a);
  assert.equal(w.status, 409);
  assert.match(String(w.body.error), /already Loaded/);
  const e = await save({ id: a });
  assert.equal(e.status, 409);
  assert.match(String(e.body.error), /already Loaded/);
});

test("identity: an area that is not flyable is refused at Dispatch, saying what is wrong", async () => {
  const cases: [string, unknown, RegExp][] = [
    ["no area", [], /at least three corners/],
    ["two corners", ONE_FLIGHT.slice(0, 2), /at least three corners/],
    ["a corner off the globe", [[91, 0], [0, 0], [0, 1]], /not a position on Earth/],
    ["coordinates as strings", [["49.1", "-122.8"], [49.2, -122.8], [49.2, -122.7]], /not a position on Earth/],
  ];
  for (const [label, aoi, why] of cases) {
    store.files.clear();
    pool(3);
    const id = await saved({ spec: { ...spec(), aoi } });
    const r = await dispatch(id);
    assert.equal(r.status, 400, label);
    assert.match(String(r.body.error), why, label);
    assert.deepEqual(held(), [], label);
  }
});

test("identity: a Site or Mission name with control characters is refused at Save", async () => {
  for (const site of ["Georgetown\u0001", "North\u0000field", "a\u001bb"]) {
    const r = await save({ site, spec: { ...spec(), site } });
    assert.equal(r.status, 400, JSON.stringify(site));
  }
  const r = await save({ name: "Or\u0007tho" });
  assert.equal(r.status, 400);
});

test("identity: a very long Site name is refused at Save, not truncated silently", async () => {
  const site = "G".repeat(500);
  const r = await save({ site, spec: { ...spec(), site } });
  assert.equal(r.status, 400);
  assert.match(String(r.body.error), /characters/);
});

test("identity: a Site name that reverses how it displays is refused", async () => {
  const site = "North\u202Edleif";
  const r = await save({ site, spec: { ...spec(), site } });
  assert.equal(r.status, 400);
});

test("identity: a Site name with path separators cannot reach a storage key", async () => {
  const site = "../../etc/passwd";
  const id = await saved({ site, spec: { ...spec(), site } });
  const r = await dispatch(id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(String(r.body.key), /^specs\/g-z2m4tx\/2026-09-24\/[^/]+\.json$/, "the key uses the Site id, never its name");
});

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

test("time: two Dispatches in the same second never share a Spec key", async () => {
  const a = await saved({ name: "A" });
  const b = await saved({ name: "B" });
  const realNow = Date.now;
  Date.now = () => Date.parse("2026-09-24T08:00:00.100Z");
  const RealDate = Date;
  // Pin the clock both routes read, so the two stamps are the same second.
  globalThis.Date = class extends RealDate {
    constructor(...args: []) {
      super(...(args.length ? args : [Date.parse("2026-09-24T08:00:00.100Z")] as unknown as []));
    }
    static now() {
      return Date.parse("2026-09-24T08:00:00.100Z");
    }
  } as DateConstructor;
  try {
    const ra = await dispatch(a);
    const rb = await dispatch(b);
    assert.equal(ra.status, 200);
    assert.equal(rb.status, 200);
    assert.notEqual(ra.body.key, rb.body.key, "a shared key would overwrite one Spec with the other");
  } finally {
    globalThis.Date = RealDate;
    Date.now = realNow;
  }
});

test("time: a Mission dated in the past or years ahead is accepted as dated", async () => {
  for (const date of ["2019-01-01", "2031-12-31"]) {
    store.files.clear();
    pool(3);
    const id = await saved({ date, spec: { ...spec(), date } });
    const r = await dispatch(id);
    assert.equal(r.status, 200, date);
    assert.match(String(r.body.key), new RegExp(`/${date}/`));
  }
});

// ---------------------------------------------------------------------------
// Storage and network
// ---------------------------------------------------------------------------

test("storage: the store unreachable at Dispatch changes nothing and says to try again", async () => {
  const a = await saved();
  store.fail(/b2_list_file_names/, 503);
  const r = await dispatch(a);
  assert.equal(r.status, 502);
  assert.match(String(r.body.error), /Nothing was changed; try again/);
  assert.deepEqual(held(), []);
});

test("storage: a Spec upload that fails gives its Cards back", async () => {
  const a = await saved();
  store.fail(/^specs\/g-z2m4tx\//, 500);
  const r = await dispatch(a);
  assert.equal(r.status, 502);
  assert.deepEqual(held(), [], "no Card held for a Spec that never landed");
  assert.equal((await rowOf(a)).state, "planned");
});

test("storage: a Ledger that stopped parsing is a failure, never an empty pool", async () => {
  const a = await saved();
  store.put(LEDGER_KEY, "{ not json");
  const r = await dispatch(a);
  assert.equal(r.status, 502);
  assert.match(String(r.body.error), /not valid JSON/);
  assert.equal(String(store.files.get(LEDGER_KEY)), "{ not json", "it is not overwritten");
  assert.equal((await list()).status, 502, "the list says it cannot read, not that there is nothing");
});

test("storage: a corrupt download is caught by its checksum, not parsed", async () => {
  await saved();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await realFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(LEDGER_KEY)) return res;
    return new Response("{\"pool\":[],\"holdings\":{}}", { status: 200, headers: res.headers });
  }) as typeof fetch;
  try {
    assert.equal((await list()).status, 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("storage: two Dispatches racing for different Cards keep both reservations", async () => {
  const a = await saved({ name: "A" });
  const b = await saved({ name: "B" });
  const both = await Promise.all([dispatch(a), dispatch(b)]);
  const ok = both.filter((r) => r.status === 200);
  // Either both got a Card, or the loser was refused in words -- never a
  // reservation silently lost.
  for (const r of both) if (r.status !== 200) assert.match(String(r.body.error), /changed|try again/i);
  assert.equal(held().length, ok.length, "every successful Dispatch still holds its Card");
});

test("storage: no credentials, or the wrong passphrase, is refused with what to do", async () => {
  const wrong = await answer(await missions.GET(request("GET", undefined, "not-it")));
  assert.equal(wrong.status, 401);
  assert.match(String(wrong.body.error), /Retype it/);
  const saved_ = process.env.B2_KEY_ID;
  delete process.env.B2_KEY_ID;
  try {
    const r = await answer(await missions.GET(request("GET")));
    assert.equal(r.status, 503);
    assert.match(String(r.body.error), /Storage is not configured/);
  } finally {
    process.env.B2_KEY_ID = saved_;
  }
});

test("storage: reading the list costs one listing and one download per Mission, plus two", async () => {
  await saved({ name: "A" });
  await saved({ name: "B" });
  const before = { ...store.calls };
  await list();
  assert.equal(store.calls.C - before.C, 1, "one listing; authorize is cached");
  assert.equal(store.calls.B - before.B, 2 + 2, "two records, the manifest and the Ledger");
});

test("storage: a record written by a newer version keeps its extra fields through an edit", async () => {
  const id = await saved();
  const key = `${MISSIONS_PREFIX}${id}.json`;
  store.put(key, { ...(store.json(key) as Json), future_field: { kept: true } });
  assert.equal((await save({ id, name: "Ortho renamed" })).status, 200);
  assert.deepEqual((store.json(key) as Json).future_field, { kept: true });
});

test("storage: a hand-edited record with missing fields does not take the whole list down", async () => {
  await saved({ name: "Good" });
  store.put(`${MISSIONS_PREFIX}broken.json`, { id: "broken" });
  const r = await list();
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.ok(r.rows.some((m) => m.name === "Good"), "the good Mission is still listed");
});

// ---------------------------------------------------------------------------
// Abuse and misuse
// ---------------------------------------------------------------------------

test("abuse: Dispatch pressed twice at once reserves one Card and writes one Spec", async () => {
  const a = await saved();
  const both = await Promise.all([dispatch(a), dispatch(a)]);
  // Either the second press is refused in words, or both resolve to the same
  // single Dispatch -- the same key and the same Card. Never two.
  const ok = both.filter((r) => r.status === 200);
  assert.ok(ok.length >= 1);
  assert.equal(new Set(ok.map((r) => r.body.key)).size, 1, "one Spec key");
  for (const r of both) if (r.status !== 200) assert.match(String(r.body.error), /Dispatched a moment ago|try again/);
  assert.equal(held().length, 1);
  const specs = [...store.files.keys()].filter((k) => k.startsWith("specs/g-z2m4tx/"));
  assert.equal(specs.length, 1, "one Spec, not an orphan the host would Load");
});

test("abuse: Dispatch after Withdraw is refused, and says how to fly it again", async () => {
  const a = await saved();
  await dispatch(a);
  await withdraw(a);
  const r = await dispatch(a);
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /only a Planned Mission is Dispatched/);
});

test("abuse: Flown marked, unmarked and marked again ends where it should", async () => {
  const a = await saved();
  await dispatch(a);
  hostLoads((await rowOf(a)).spec_key as string);
  assert.equal((await markFlown(a)).status, 200);
  assert.deepEqual(held(), []);
  assert.equal((await markFlown(a, false)).status, 200);
  assert.deepEqual(held(), ["way finder 1"]);
  assert.equal((await markFlown(a)).status, 200);
  assert.deepEqual(held(), []);
  assert.equal((await rowOf(a)).state, "flown");
});

test("abuse: unmarking Flown after the Card went to another Mission is refused by name", async () => {
  pool(1);
  const a = await saved({ name: "A" });
  await dispatch(a);
  hostLoads((await rowOf(a)).spec_key as string);
  await markFlown(a);
  const b = await saved({ name: "B" });
  assert.equal((await dispatch(b)).status, 200);
  const r = await markFlown(a, false);
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /way finder 1 now holds another Mission/);
});

test("abuse: Mark Flown on a Mission that never reached the Controller is refused", async () => {
  const a = await saved();
  await dispatch(a);
  const r = await markFlown(a);
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /cannot have been flown/);
});

test("abuse: direct calls with bad ids, bad bodies and path tricks are refused", async () => {
  for (const id of ["../ledger", "a/b", "", 42, null]) {
    const r = await answer(await dispatchRoute.POST(request("POST", { id })));
    assert.equal(r.status, 400, String(id));
  }
  const notJson = await answer(await dispatchRoute.POST(request("POST", "{nope")));
  assert.equal(notJson.status, 400);
  const noSpec = await answer(await missions.POST(request("POST", { site: "x", site_id: "x-1", name: "n", date: "2026-09-24" })));
  assert.equal(noSpec.status, 400);
});

test("abuse: the same Mission edited in two windows keeps the later edit, whole", async () => {
  const id = await saved();
  await Promise.all([save({ id, name: "Window one" }), save({ id, name: "Window two" })]);
  const name = (await rowOf(id)).name;
  assert.ok(name === "Window one" || name === "Window two", name);
});

test("abuse: a second press that arrives after the first reserved is refused by name", async () => {
  const a = await saved();
  // The second press lands while the first is still finishing: its Ledger
  // write is in, its Mission record is not yet stamped.
  let second: Promise<{ status: number; body: Json }> | null = null;
  store.beforeDownload = (key) => {
    if (key === SUMMARIES_KEY && !second) second = dispatch(a);
  };
  const first = await dispatch(a);
  const r = await second!;
  assert.equal(first.status, 200);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(String(r.body.error), /Dispatched a moment ago|only a Planned Mission/);
  assert.equal(held().length, 1);
});

test("storage: the daily transaction cap is named, with when it resets, not 'try again'", async () => {
  await saved();
  store.fail(/b2_list_file_names/, 403);
  const r = await list();
  assert.equal(r.status, 503);
  assert.match(String(r.body.error), /free transaction limit/);
  assert.match(String(r.body.error), /00:00 UTC/);
});
