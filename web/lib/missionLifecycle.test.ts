// The Mission lifecycle driven through its own interface (#259).
//
// The module is exercised whole -- every check order, write order and refusal
// -- with the store replaced by the in-memory adapter. Partial failures are
// arranged with `failNext`; write orders are read off the adapter's `calls`
// log. The route-level suite that used to reach past this seam was
// `lifecycle.test.ts`; its case classes are replaced here, in
// `missionStore.test.ts` and in `missionRoutes.test.ts`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { MISSIONS_PREFIX } from "./keys.ts";
import { memoryMissionStore, type MemoryMissionStore, type MemorySeed } from "./memoryMissionStore.ts";
import {
  StoreNotConfigured,
  createMissionLifecycle,
  type MissionLifecycle,
  type Outcome,
  type Refusal,
} from "./missionLifecycle.ts";
import { refusalStatus } from "./missionRoute.ts";
import type { CardLedger } from "./model.ts";
import type { MissionRow } from "./missionRecords.ts";
import { actionsFor } from "./missionView.ts";
import { DEFAULT_SPEC, type MissionSpec } from "./spec.ts";

const caller = { kind: "passphrase" } as const;

/** A small rectangle that plans as one flight on one battery. */
const ONE_FLIGHT: [number, number][] = [
  [49.18946, -122.84085],
  [49.18795, -122.84085],
  [49.18795, -122.83938],
  [49.18944, -122.83934],
];
/** A block large enough to need several batteries, so several Cards. */
const THREE_FLIGHTS: [number, number][] = [
  [49.1902, -122.843],
  [49.186, -122.843],
  [49.186, -122.837],
  [49.1902, -122.837],
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

const POOL3: CardLedger = { pool: ["way finder 1", "way finder 2", "way finder 3"], holdings: {} };

interface Harness {
  store: MemoryMissionStore;
  lc: MissionLifecycle;
}

function fresh(seed: MemorySeed = {}): Harness {
  const store = memoryMissionStore({ ledger: POOL3, ...seed });
  return { store, lc: createMissionLifecycle(store) };
}

function expectOk<T>(r: Outcome<T>): T {
  if (!r.ok) assert.fail(JSON.stringify(r));
  return r.body;
}

function expectRefusal<T>(r: Outcome<T>): Refusal {
  if (r.ok) assert.fail(`expected a refusal, got ${JSON.stringify(r.body)}`);
  return r;
}

async function saveMission(lc: MissionLifecycle, over: Record<string, unknown> = {}) {
  const s = (over.spec as MissionSpec) ?? spec();
  return lc.save(caller, { site_id: s.site_id, site: s.site, name: "Ortho", date: s.date, spec: s, ...over });
}

async function saved(lc: MissionLifecycle, over: Record<string, unknown> = {}): Promise<string> {
  const r = expectOk(await saveMission(lc, over));
  return r.mission.id;
}

const dispatch = (lc: MissionLifecycle, id: string) => lc.dispatch(caller, { id });
const withdraw = (lc: MissionLifecycle, id: string) => lc.withdraw(caller, { id });
const markFlown = (lc: MissionLifecycle, id: string, flown = true) => lc.setFlown(caller, { id, flown });
const remove = (lc: MissionLifecycle, id: string) => lc.remove(caller, { id });
const list = (lc: MissionLifecycle, archived = true) => lc.list(caller, { archived });

async function rowOf(lc: MissionLifecycle, id: string): Promise<MissionRow> {
  const r = expectOk(await list(lc));
  const found = r.missions.find((m) => m.id === id);
  assert.ok(found, `Mission ${id} is not in the list`);
  return found;
}

/** Cards the Ledger still holds unflown, in name order. */
function held(store: MemoryMissionStore): string[] {
  return Object.values(store.ledger().holdings)
    .filter((h) => !h.flown_at)
    .map((h) => h.card)
    .sort();
}

/** What the host does when it Collects a Spec, written the way it writes it. */
function hostCollects(store: MemoryMissionStore, key: string): void {
  store.putManifest({ ...store.manifest(), [key]: { collected_at: "2026-09-24T08:00:00Z" } });
}

/** What the host does when it Loads a Spec, written the way it writes it. */
function hostLoads(store: MemoryMissionStore, key: string, waypoints = 184): void {
  const l = store.ledger();
  const cards = Object.values(l.holdings).filter((h) => h.spec_key === key);
  for (const h of cards) l.holdings[h.card] = { ...h, written_at: "2026-09-24T08:05:00Z", written_md5: "md5" };
  store.putLedger(l);
  store.putManifest({
    ...store.manifest(),
    [key]: {
      collected_at: "2026-09-24T08:00:00Z",
      loaded_at: "2026-09-24T08:05:00Z",
      parts: cards.length,
      cards: cards.map((h) => ({ card: h.card, name: "x", waypoints })),
    },
  });
}

// ---------------------------------------------------------------------------
// The Card pool
// ---------------------------------------------------------------------------

test("card pool: reserve, release, stale -- a full pool refuses at Dispatch, naming what is in the way", async () => {
  const { store, lc } = fresh({ ledger: { pool: ["way finder 1"], holdings: {} } });
  const first = await saved(lc, { name: "Ortho" });
  expectOk(await dispatch(lc, first));
  const second = await saved(lc, { name: "Facade" });
  const r = expectRefusal(await dispatch(lc, second));
  assert.equal(r.kind, "refused");
  assert.match(r.message, /way finder 1/);
  assert.match(r.message, /Mark a Mission Flown, or withdraw one/);
  assert.equal((await rowOf(lc, second)).state, "planned", "a refusal leaves it Planned");
  assert.equal(store.specs().size, 1, "a refused Dispatch leaves no Spec for the host to Collect");
});

test("card pool: a Mission needing several Cards when fewer are free takes none of them", async () => {
  const { store, lc } = fresh({ ledger: { pool: ["way finder 1", "way finder 2"], holdings: {} } });
  const big = await saved(lc, { spec: spec(THREE_FLIGHTS), name: "Block" });
  const r = expectRefusal(await dispatch(lc, big));
  assert.equal(r.kind, "refused");
  assert.ok((r.extras?.needed as number) > 2, `needed ${r.extras?.needed}`);
  assert.deepEqual(store.ledger().holdings, {}, "nothing is half-reserved");
});

test("card pool: Flown, Withdraw and supersession each free exactly the Cards they held", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc, { name: "A" });
  const b = await saved(lc, { name: "B" });
  const c = await saved(lc, { name: "C" });
  for (const id of [a, b, c]) expectOk(await dispatch(lc, id));
  assert.deepEqual(held(store), ["way finder 1", "way finder 2", "way finder 3"]);

  expectOk(await withdraw(lc, a));
  assert.deepEqual(held(store), ["way finder 2", "way finder 3"], "Withdraw frees its own Card only");

  const bKey = (await rowOf(lc, b)).spec_key as string;
  hostLoads(store, bKey);
  expectOk(await markFlown(lc, b));
  assert.deepEqual(held(store), ["way finder 3"], "Flown frees its own Card only");

  // Edit a Dispatched Mission: the fork supersedes it at Dispatch.
  const fork = expectOk(await saveMission(lc, { id: c, name: "C" }));
  assert.notEqual(fork.mission.id, c);
  expectOk(await dispatch(lc, fork.mission.id));
  assert.equal((await rowOf(lc, c)).state, "superseded");
  assert.deepEqual(held(store), ["way finder 1"], "the fork holds one Card, the superseded one none");
  assert.ok(store.calls.includes(`addSkipped:${(await rowOf(lc, c)).spec_key}`), "the host is told to skip it");
});

test("card pool: a withdrawn Mission's Card is reusable immediately", async () => {
  const { lc } = fresh({ ledger: { pool: ["way finder 1"], holdings: {} } });
  const a = await saved(lc, { name: "A" });
  expectOk(await dispatch(lc, a));
  expectOk(await withdraw(lc, a));
  const b = await saved(lc, { name: "B" });
  const r = expectOk(await dispatch(lc, b));
  assert.deepEqual(r.cards, ["way finder 1"]);
});

test("card pool: Cards calibrated after Missions were reserved join the pool without disturbing them", async () => {
  const { store, lc } = fresh({ ledger: { pool: ["way finder 1"], holdings: {} } });
  const a = await saved(lc, { name: "A" });
  expectOk(await dispatch(lc, a));
  const l = store.ledger();
  store.putLedger({ ...l, pool: [...l.pool, "way finder 2"] });
  const b = await saved(lc, { name: "B" });
  const r = expectOk(await dispatch(lc, b));
  assert.deepEqual(r.cards, ["way finder 2"]);
  assert.equal((await rowOf(lc, a)).cards[0].card, "way finder 1");
});

test("card pool: a reservation lives in the store, so any browser sees it", async () => {
  const { lc } = fresh();
  const a = await saved(lc);
  expectOk(await dispatch(lc, a));
  const row = await rowOf(lc, a);
  assert.equal(row.cards[0].card, "way finder 1");
  assert.equal(row.state, "dispatched");
});

// ---------------------------------------------------------------------------
// Missions and identity
// ---------------------------------------------------------------------------

test("save identity and name rules", async () => {
  const { lc } = fresh();
  await saved(lc, { name: "Ortho" });

  const caseSpacing = expectRefusal(await saveMission(lc, { name: " ortho  " }));
  assert.equal(caseSpacing.kind, "refused");
  assert.match(caseSpacing.message, /already exists/);

  const other = spec();
  const site = expectRefusal(
    await saveMission(lc, {
      spec: { ...other, site_id: "georgetown2-zzz" },
      site_id: "georgetown2-zzz",
      site: "georgetown2",
    }),
  );
  assert.equal(site.kind, "refused");
  assert.match(site.message, /already a Site called/);
  assert.deepEqual(site.extras?.site, { site_id: "g-z2m4tx", site: "GeorgeTown2" });

  for (const bad of ["Georgetown\u0001", "North\u0000field", "a\u001bb"]) {
    const r = expectRefusal(await saveMission(lc, { site: bad, spec: { ...spec(), site: bad } }));
    assert.equal(r.kind, "invalid", JSON.stringify(bad));
  }
  const control = expectRefusal(await saveMission(lc, { name: "Or\u0007tho" }));
  assert.equal(control.kind, "invalid");

  const long = "G".repeat(500);
  const longSite = expectRefusal(await saveMission(lc, { site: long, spec: { ...spec(), site: long } }));
  assert.equal(longSite.kind, "invalid");
  assert.match(longSite.message, /characters/);

  const bidi = expectRefusal(await saveMission(lc, { site: "North\u202Edleif", spec: { ...spec(), site: "North\u202Edleif" } }));
  assert.equal(bidi.kind, "invalid");
});

test("save check order: Site-name clash outranks a bad id, and Mission-problem outranks the draft", async () => {
  const { store, lc } = fresh();
  await saved(lc, { name: "Ortho" });

  // A taken Site is decided before the id is even looked at.
  const taken = expectRefusal(
    await saveMission(lc, {
      id: "../ledger",
      spec: { ...spec(), site_id: "other-1" },
      site_id: "other-1",
      site: "georgetown2",
    }),
  );
  assert.equal(taken.kind, "refused");
  assert.ok(taken.extras?.site, "the Site refusal, not the id one");

  // Mission-problem is checked before the draft, and both before the store.
  store.calls.length = 0;
  const badName = expectRefusal(await saveMission(lc, { name: "" }));
  assert.equal(badName.kind, "invalid");
  assert.match(badName.message, /short name/);
  const badSpec = expectRefusal(await saveMission(lc, { spec: { ...spec(), version: 2 } }));
  assert.equal(badSpec.kind, "invalid");
  assert.match(badSpec.message, /This Mission cannot be saved: Draft has no version\./);
  assert.deepEqual(store.calls, [], "validation never reaches the store");
});

test("identity: a Mission withdrawn after the host Collected it is withdrawn, and the host is told", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc);
  expectOk(await dispatch(lc, a));
  const key = (await rowOf(lc, a)).spec_key as string;
  hostCollects(store, key);
  assert.equal((await rowOf(lc, a)).state, "collected");
  const r = expectOk(await withdraw(lc, a));
  assert.equal(r.key, key);
  assert.deepEqual(held(store), []);
  assert.ok(store.calls.includes(`addSkipped:${key}`), "the host is told to skip it");
});

test("identity: a Loaded Mission cannot be withdrawn or edited, and says why", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc);
  expectOk(await dispatch(lc, a));
  hostLoads(store, (await rowOf(lc, a)).spec_key as string);

  const w = expectRefusal(await withdraw(lc, a));
  assert.equal(w.kind, "refused");
  assert.match(w.message, /already Loaded/);
  const e = expectRefusal(await saveMission(lc, { id: a }));
  assert.equal(e.kind, "refused");
  assert.match(e.message, /already Loaded/);
});

test("identity: an area that is not flyable is refused at Dispatch, saying what is wrong", async () => {
  const cases: [string, unknown, RegExp][] = [
    ["no area", [], /at least three corners/],
    ["two corners", ONE_FLIGHT.slice(0, 2), /at least three corners/],
    ["a corner off the globe", [[91, 0], [0, 0], [0, 1]], /not a position on Earth/],
    ["coordinates as strings", [["49.1", "-122.8"], [49.2, -122.8], [49.2, -122.7]], /not a position on Earth/],
  ];
  for (const [label, aoi, why] of cases) {
    const { store, lc } = fresh();
    const id = await saved(lc, { spec: { ...spec(), aoi } });
    const r = expectRefusal(await dispatch(lc, id));
    assert.equal(r.kind, "invalid", label);
    assert.match(r.message, why, label);
    assert.deepEqual(held(store), [], label);
  }
});

test("identity: bad ids, bad bodies and missing Missions are refused in the route's words", async () => {
  const { lc } = fresh();
  for (const id of ["../ledger", "a/b", "", 42, null]) {
    const r = expectRefusal(await dispatch(lc, id as string));
    assert.equal(r.kind, "invalid");
    assert.equal(r.message, "That is not a Mission id. Reload the Mission list.");
  }
  const noSpec = expectRefusal(
    await lc.save(caller, { site: "x", site_id: "x-1", name: "n", date: "2026-09-24" }),
  );
  assert.equal(noSpec.message, "This Mission cannot be saved: Draft is not an object.");
  const flownShape = expectRefusal(await lc.setFlown(caller, { id: "abc", flown: "yes" }));
  assert.equal(flownShape.message, "Say whether this Mission was Flown: send { flown: true } or { flown: false }.");

  const notThere = expectRefusal(await dispatch(lc, "nope"));
  assert.equal(notThere.kind, "not_found");
  assert.equal(notThere.message, "That Mission is no longer in the store. Reload the Mission list.");
  const saveThere = expectRefusal(await saveMission(lc, { id: "nope" }));
  assert.equal(saveThere.kind, "not_found");
  assert.equal(saveThere.message, "That Mission is no longer in the store. Reload the Mission list and save it again.");
  const removeThere = expectRefusal(await remove(lc, "nope"));
  assert.equal(removeThere.kind, "not_found");
  assert.equal(removeThere.message, "That Mission is not in the store.");
});

test("the same Mission edited in two windows keeps the later edit, whole", async () => {
  const { lc } = fresh();
  const id = await saved(lc);
  await Promise.all([saveMission(lc, { id, name: "Window one" }), saveMission(lc, { id, name: "Window two" })]);
  const name = (await rowOf(lc, id)).name;
  assert.ok(name === "Window one" || name === "Window two", name);
});

// ---------------------------------------------------------------------------
// Time and keys
// ---------------------------------------------------------------------------

test("dispatch key shape", async () => {
  const { lc } = fresh();
  const safe = await saved(lc, { site: "../../etc/passwd", spec: { ...spec(), site: "../../etc/passwd" } });
  const r = expectOk(await dispatch(lc, safe));
  assert.match(r.key, /^specs\/g-z2m4tx\/2026-09-24\/[^/]+\.json$/, "the key uses the Site id, never its name");

  for (const date of ["2019-01-01", "2031-12-31"]) {
    const id = await saved(lc, { date, spec: { ...spec(), date } });
    const d = expectOk(await dispatch(lc, id));
    assert.match(d.key, new RegExp(`/${date}/`), date);
  }
});

test("time: two Dispatches in the same second never share a Spec key", async () => {
  const { lc } = fresh();
  const a = await saved(lc, { name: "A" });
  const b = await saved(lc, { name: "B" });
  const RealDate = Date;
  const RealNow = Date.now;
  const pinned = RealDate.parse("2026-09-24T08:00:00.100Z");
  Date.now = () => pinned;
  globalThis.Date = class extends RealDate {
    constructor(...args: []) {
      super(...(args.length ? args : [RealDate.parse("2026-09-24T08:00:00.100Z")] as unknown as []));
    }
    static now() {
      return RealDate.parse("2026-09-24T08:00:00.100Z");
    }
  } as DateConstructor;
  try {
    const ra = expectOk(await dispatch(lc, a));
    const rb = expectOk(await dispatch(lc, b));
    assert.notEqual(ra.key, rb.key, "a shared key would overwrite one Spec with the other");
  } finally {
    globalThis.Date = RealDate;
    Date.now = RealNow;
  }
});

// ---------------------------------------------------------------------------
// Store faults
// ---------------------------------------------------------------------------

test("StoreNotConfigured → 503 not_configured", async () => {
  const { store, lc } = fresh();
  store.failNext("readLedger", new StoreNotConfigured());
  const r = expectRefusal(await list(lc));
  assert.equal(r.kind, "not_configured");
  assert.equal(refusalStatus(r.kind), 503);
  assert.equal(r.message, "Storage is not configured. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET.");
});

test("the store unreachable at Dispatch changes nothing and says to try again", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc);
  store.failNext("readMissions", new Error("offline"));
  const r = expectRefusal(await dispatch(lc, a));
  assert.equal(r.kind, "unreachable");
  assert.equal(refusalStatus(r.kind), 502);
  assert.match(r.message, /Nothing was changed; try again/);
  assert.deepEqual(held(store), []);
});

test("list failed: 403 → 503 cap message", async () => {
  const { store, lc } = fresh();
  store.failNext("readMissions", new Error("list failed: 403"));
  const r = expectRefusal(await list(lc));
  assert.equal(r.kind, "store_refused");
  assert.equal(refusalStatus(r.kind), 503);
  assert.match(r.message, /free transaction limit/);
  assert.match(r.message, /00:00 UTC/);
});

test("writeSpec failure releases the reservation and returns unreachable", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc);
  store.failNext("writeSpec", new Error("upload failed: 500"));
  const r = expectRefusal(await dispatch(lc, a));
  assert.equal(r.kind, "unreachable");
  assert.deepEqual(held(store), [], "no Card held for a Spec that never landed");
  assert.equal((await rowOf(lc, a)).state, "planned");
});

test("broken record is reported unreadable (putRecords)", async () => {
  const { store, lc } = fresh();
  await saved(lc, { name: "Good" });
  store.putRecords([{ id: "broken" }]);
  const r = expectOk(await list(lc));
  assert.deepEqual(r.unreadable, [`${MISSIONS_PREFIX}broken.json`]);
  assert.ok(r.missions.some((m) => m.name === "Good"), "the good Mission is still listed");
});

test("future fields survive an in-place edit", async () => {
  const { store, lc } = fresh();
  const id = await saved(lc);
  const stored = store.records().find((r) => r.id === id);
  assert.ok(stored);
  store.putRecords([{ ...stored, future_field: { kept: true } }]);
  expectOk(await saveMission(lc, { id, name: "Ortho renamed" }));
  const after = store.records().find((r) => r.id === id) as unknown as Record<string, unknown>;
  assert.deepEqual(after.future_field, { kept: true });
});

// ---------------------------------------------------------------------------
// Write orders and responses
// ---------------------------------------------------------------------------

const WRITE_SHAPE = (store: MemoryMissionStore): string[] =>
  store.calls.filter((c) => !c.startsWith("read")).map((c) => c.split(":")[0]);

test("write order: Dispatch addSkipped, updateLedger, writeSpec, updateSummaries, writeMission", async () => {
  const { store, lc } = fresh();
  const id = await saved(lc, { name: "Ortho" });
  expectOk(await dispatch(lc, id));
  const fork = expectOk(await saveMission(lc, { id, name: "Ortho" }));
  store.calls.length = 0;
  expectOk(await dispatch(lc, fork.mission.id));
  assert.deepEqual(WRITE_SHAPE(store), [
    "addSkipped",
    "updateLedger",
    "writeSpec",
    "updateSummaries",
    "writeMission",
  ]);
});

test("write order: Withdraw addSkipped, updateLedger, writeMission", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc);
  expectOk(await dispatch(lc, a));
  store.calls.length = 0;
  expectOk(await withdraw(lc, a));
  assert.deepEqual(WRITE_SHAPE(store), ["addSkipped", "updateLedger", "writeMission"]);
});

test("write order: Flown updateLedger, writeMission", async () => {
  const { store, lc } = fresh();
  const a = await saved(lc);
  expectOk(await dispatch(lc, a));
  hostLoads(store, (await rowOf(lc, a)).spec_key as string);
  store.calls.length = 0;
  expectOk(await markFlown(lc, a));
  assert.deepEqual(WRITE_SHAPE(store), ["updateLedger", "writeMission"]);
});

test("Flown response re-derives {id, mission, cards}", async () => {
  const { store, lc } = fresh();
  const id = await saved(lc);
  expectOk(await dispatch(lc, id));
  hostLoads(store, (await rowOf(lc, id)).spec_key as string);
  const r = expectOk(await markFlown(lc, id, true));
  assert.deepEqual(Object.keys(r).sort(), ["cards", "id", "mission"]);
  assert.equal(r.id, id);
  assert.equal(r.mission?.state, "flown");
  // The row carries the holding with its flown_at mark, as the route did.
  assert.deepEqual(r.cards.map((c) => c.card), ["way finder 1"]);
  assert.ok(r.cards[0].flown_at);
  const back = expectOk(await markFlown(lc, id, false));
  assert.deepEqual(back.cards.map((c) => c.card), ["way finder 1"]);
  assert.equal(back.cards[0].flown_at, undefined);
});

test("GET body key set", async () => {
  const { lc } = fresh();
  const a = await saved(lc, { name: "A" });
  expectOk(await dispatch(lc, a));
  const b = await saved(lc, { name: "B" });
  expectOk(await remove(lc, b));

  const shown = expectOk(await list(lc, false));
  assert.deepEqual(
    Object.keys(shown).sort(),
    ["archived_count", "host", "ledger", "missions", "now", "stale_cards", "unreadable"].sort(),
  );
  assert.equal(typeof shown.now, "number");
  assert.deepEqual(shown.host, { notice: null, drift: null });
  assert.equal(shown.missions.length, 1);

  const all = expectOk(await list(lc, true));
  assert.equal(all.missions.length, 2);
  assert.equal(all.archived_count, 1);
});

test("withdraw idempotent branch: a repeat is 200 {id, withdrawn_at, cards_released: []}", async () => {
  const { lc } = fresh();
  const id = await saved(lc);
  expectOk(await dispatch(lc, id));
  const first = expectOk(await withdraw(lc, id));
  assert.deepEqual(first.cards_released, ["way finder 1"]);
  const again = expectOk(await withdraw(lc, id));
  // deepStrictEqual: the repeat carries no `key` at all, exactly as before.
  assert.deepEqual(again, { id, withdrawn_at: first.withdrawn_at, cards_released: [] });
});

test("flown repeats write the mark again", async () => {
  const { store, lc } = fresh();
  const id = await saved(lc);
  expectOk(await dispatch(lc, id));
  hostLoads(store, (await rowOf(lc, id)).spec_key as string);
  expectOk(await markFlown(lc, id, true));
  store.calls.length = 0;
  const again = expectOk(await markFlown(lc, id, true));
  assert.equal(again.mission?.state, "flown");
  assert.ok(store.calls.includes("updateLedger"), "the repeat writes the mark again");
  const unmark = expectOk(await markFlown(lc, id, false));
  assert.deepEqual(unmark.cards.map((c) => c.card), ["way finder 1"]);
  const repeatUnmark = expectOk(await markFlown(lc, id, false));
  assert.equal(repeatUnmark.mission?.state, "loaded");
});

test("unmarking after another Mission took the Card is refused by name", async () => {
  const { store, lc } = fresh({ ledger: { pool: ["way finder 1"], holdings: {} } });
  const a = await saved(lc, { name: "A" });
  expectOk(await dispatch(lc, a));
  hostLoads(store, (await rowOf(lc, a)).spec_key as string);
  expectOk(await markFlown(lc, a));
  const b = await saved(lc, { name: "B" });
  expectOk(await dispatch(lc, b));

  const r = expectRefusal(await markFlown(lc, a, false));
  assert.equal(r.kind, "refused");
  assert.equal(r.extras, undefined);
  assert.equal(
    r.message,
    "way finder 1 now holds another Mission, so unmarking this one would claim a Card that is not free. " +
      "Withdraw that Mission first if it is the wrong one.",
  );
});

// ---------------------------------------------------------------------------
// Partial-failure tails (criterion [2])
// ---------------------------------------------------------------------------

test("dispatch partial tail: writeMission fails → 502 partial with {key, cards}", async () => {
  const { store, lc } = fresh();
  const id = await saved(lc);
  store.failNext("writeMission", new Error("upload failed: 500"));
  const r = expectRefusal(await dispatch(lc, id));
  assert.equal(r.kind, "partial");
  assert.equal(refusalStatus(r.kind), 502);
  const key = r.extras?.key as string;
  assert.deepEqual(r.extras, { key, cards: ["way finder 1"] });
  assert.equal(
    r.message,
    `The Spec was Dispatched as ${key} and its Cards are reserved, but this Mission could not be ` +
      "stamped with it (upload failed: 500), so the list will still show it as Planned. " +
      "Do not Dispatch it again -- reload the list, and if it still reads Planned, withdraw " +
      `${key} from the store by hand.`,
  );
  assert.ok(store.specs().has(key), "the Spec is in the store for the join");
  assert.deepEqual(held(store), ["way finder 1"], "the Card stays reserved");
});

test("withdraw partial tail: writeMission fails → 502 partial, cards_released listed", async () => {
  const { store, lc } = fresh();
  const id = await saved(lc);
  expectOk(await dispatch(lc, id));
  store.failNext("writeMission", new Error("upload failed: 500"));
  const r = expectRefusal(await withdraw(lc, id));
  assert.equal(r.kind, "partial");
  assert.equal(refusalStatus(r.kind), 502);
  assert.equal(r.extras, undefined);
  assert.equal(
    r.message,
    "way finder 1 were released, but this Mission could not be marked Withdrawn (upload failed: 500), " +
      "so the list will still show it as Dispatched. Reload the list and withdraw it again.",
  );
  assert.deepEqual(held(store), [], "the Card was released before the mark failed");
  assert.equal(store.records()[0].withdrawn_at, undefined);
});

test('flown partial tail: writeMission fails → 502 partial "Ledger was updated but this Mission\'s mark was not saved"', async () => {
  const { store, lc } = fresh();
  const id = await saved(lc);
  expectOk(await dispatch(lc, id));
  hostLoads(store, (await rowOf(lc, id)).spec_key as string);
  store.failNext("writeMission", new Error("upload failed: 500"));
  const r = expectRefusal(await markFlown(lc, id, true));
  assert.equal(r.kind, "partial");
  assert.equal(refusalStatus(r.kind), 502);
  assert.equal(r.extras, undefined);
  assert.equal(
    r.message,
    "The Card Ledger was updated but this Mission's mark was not saved (upload failed: 500), so the list " +
      "and the Ledger now disagree. Reload the Mission list and set it again.",
  );
  assert.ok(store.ledger().holdings["way finder 1"].flown_at, "the Ledger write stands");
});

// ---------------------------------------------------------------------------
// One rule for the buttons and the module (#102)
// ---------------------------------------------------------------------------

/** A Mission brought to `state` through the module and the host's reports. */
async function missionIn(lc: MissionLifecycle, store: MemoryMissionStore, state: MissionRow["state"]): Promise<string> {
  const id = await saved(lc, { name: `M-${state}` });
  if (state === "planned") return id;
  expectOk(await dispatch(lc, id));
  const key = async () => (await rowOf(lc, id)).spec_key as string;
  if (state === "dispatched") return id;
  if (state === "withdrawn") {
    expectOk(await withdraw(lc, id));
    return id;
  }
  if (state === "superseded") {
    const fork = expectOk(await saveMission(lc, { id, name: `M-${state}` }));
    expectOk(await dispatch(lc, fork.mission.id));
    return id;
  }
  hostCollects(store, await key());
  if (state === "collected") return id;
  hostLoads(store, await key());
  if (state === "loaded") return id;
  expectOk(await markFlown(lc, id));
  return id;
}

test("state × action matrix matches actionsFor", async () => {
  const states: MissionRow["state"][] = [
    "planned",
    "dispatched",
    "collected",
    "loaded",
    "flown",
    "withdrawn",
    "superseded",
  ];
  for (const state of states) {
    for (const action of ["Dispatch", "Withdraw", "Mark Flown", "Unmark Flown", "Edit", "Remove"] as const) {
      const { store, lc } = fresh();
      const id = await missionIn(lc, store, state);
      const row = await rowOf(lc, id);
      assert.equal(row.state, state, `setting up ${state}`);
      const act = {
        Dispatch: () => dispatch(lc, id),
        Withdraw: () => withdraw(lc, id),
        "Mark Flown": () => markFlown(lc, id, true),
        "Unmark Flown": () => markFlown(lc, id, false),
        Edit: async () => saveMission(lc, { id, name: (await rowOf(lc, id)).name }),
        Remove: () => remove(lc, id),
      }[action];
      const offered = actionsFor(row).includes(action);
      const r = await act();
      // Pressing Mark Flown on a Flown row, Unmark on a Loaded one or Withdraw
      // on a Withdrawn one is a harmless repeat: the module accepts it without
      // the row offering it, and nothing changes.
      const repeat =
        (action === "Mark Flown" && state === "flown") ||
        (action === "Unmark Flown" && state === "loaded") ||
        (action === "Withdraw" && state === "withdrawn");
      if (offered) {
        assert.equal(r.ok, true, `${state}: ${action} is offered but refused: ${JSON.stringify(r)}`);
      } else if (!repeat) {
        assert.equal(r.ok, false, `${state}: ${action} is not offered but accepted`);
        if (!r.ok) {
          assert.equal(r.kind, "refused", `${state}: ${action}`);
          assert.ok(r.message.length > 20, `${state}: ${action} refused without saying why`);
        }
      } else {
        assert.equal(r.ok, true, `${state}: ${action} is a repeat and must be accepted`);
      }
    }
  }
});
