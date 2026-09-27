// The B2 adapter under fetch (#259): durability cases a store double cannot
// reproduce -- transaction cost, corrupt files, checksums, and the two
// Dispatches that race for one Ledger. `fakeStore.ts` replaces the far side of
// the network; the module and `b2.ts` run exactly as deployed.

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { FAKE_BUCKET, installFakeStore } from "./fakeStore.ts";
import { LEDGER_KEY, MISSIONS_PREFIX } from "./keys.ts";
import type { MissionLifecycle } from "./missionLifecycle.ts";
import type { CardLedger } from "./model.ts";
import { DEFAULT_SPEC, type MissionSpec } from "./spec.ts";

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

const { b2MissionStore } = await import("./missionStore.ts");
const { createMissionLifecycle } = await import("./missionLifecycle.ts");

const caller = { kind: "passphrase" } as const;

/** A small rectangle that plans as one flight on one battery. */
const ONE_FLIGHT: [number, number][] = [
  [49.18946, -122.84085],
  [49.18795, -122.84085],
  [49.18795, -122.83938],
  [49.18944, -122.83934],
];

function spec(): MissionSpec {
  return {
    ...DEFAULT_SPEC,
    site: "GeorgeTown2",
    site_id: "g-z2m4tx",
    date: "2026-09-24",
    aoi: ONE_FLIGHT,
    flight: { ...DEFAULT_SPEC.flight, altitude_m: 60, speed_ms: 2.5, margin_passes: 0.5, gimbal_pitch_deg: -90 },
  };
}

function fresh(): MissionLifecycle {
  return createMissionLifecycle(b2MissionStore());
}

async function saved(lc: MissionLifecycle, name: string): Promise<string> {
  const s = spec();
  const r = await lc.save(caller, { site_id: s.site_id, site: s.site, name, date: s.date, spec: s });
  assert.ok(r.ok, JSON.stringify(r));
  return r.body.mission.id;
}

const ledger = () => store.json(LEDGER_KEY) as CardLedger;
const held = () => Object.values(ledger().holdings).filter((h) => !h.flown_at).map((h) => h.card).sort();

function pool(n: number): void {
  store.put(LEDGER_KEY, { pool: Array.from({ length: n }, (_, i) => `way finder ${i + 1}`), holdings: {} });
}

beforeEach(() => {
  store.files.clear();
  store.beforeDownload = null;
  pool(3);
});

test("reading the list costs one listing and one download per Mission, plus two", async () => {
  const lc = fresh();
  await saved(lc, "A");
  await saved(lc, "B");
  const before = { ...store.calls };
  const r = await lc.list(caller, { archived: true });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(store.calls.C - before.C, 1, "one listing; authorize is cached");
  assert.equal(store.calls.B - before.B, 2 + 2, "two records, the manifest and the Ledger");
});

test("corrupt Ledger never reads as empty", async () => {
  const lc = fresh();
  const a = await saved(lc, "A");
  store.put(LEDGER_KEY, "{ not json");
  const r = await lc.dispatch(caller, { id: a });
  assert.ok(!r.ok);
  assert.equal(r.kind, "unreachable");
  assert.match(r.message, /not valid JSON/);
  assert.equal(String(store.files.get(LEDGER_KEY)), "{ not json", "it is not overwritten");
  const l = await lc.list(caller, { archived: true });
  assert.ok(!l.ok, "the list says it cannot read, not that there is nothing");
});

test("a corrupt download is caught by its checksum, not parsed", async () => {
  const lc = fresh();
  await saved(lc, "A");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await realFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(LEDGER_KEY)) return res;
    return new Response('{"pool":[],"holdings":{}}', { status: 200, headers: res.headers });
  }) as typeof fetch;
  try {
    const r = await lc.list(caller, { archived: true });
    assert.ok(!r.ok);
    assert.equal(r.kind, "unreachable");
    assert.match(r.message, /checksum mismatch/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Dispatch unreachable over the real adapter", async () => {
  const lc = fresh();
  const a = await saved(lc, "A");
  store.fail(/b2_list_file_names/, 503);
  const r = await lc.dispatch(caller, { id: a });
  assert.ok(!r.ok);
  assert.equal(r.kind, "unreachable");
  assert.match(r.message, /Nothing was changed; try again/);
  assert.deepEqual(held(), []);
});

test("two Dispatches racing for different Cards keep both reservations", async () => {
  const lc = fresh();
  const a = await saved(lc, "A");
  const b = await saved(lc, "B");
  const both = await Promise.all([lc.dispatch(caller, { id: a }), lc.dispatch(caller, { id: b })]);
  const ok = both.filter((r) => r.ok);
  // Either both got a Card, or the loser was refused in words -- never a
  // reservation silently lost.
  for (const r of both) if (!r.ok) assert.match(r.message, /changed|try again/i);
  assert.equal(held().length, ok.length, "every successful Dispatch still holds its Card");
});

test('second Dispatch loses: "Dispatched a moment ago"', async () => {
  const lc = fresh();
  const a = await saved(lc, "A");
  const both = await Promise.all([lc.dispatch(caller, { id: a }), lc.dispatch(caller, { id: a })]);
  const ok = both.filter((r) => r.ok);
  assert.ok(ok.length >= 1);
  assert.equal(new Set(ok.map((r) => (r.ok ? r.body.key : ""))).size, 1, "one Spec key");
  for (const r of both) if (!r.ok) assert.match(r.message, /Dispatched a moment ago|try again/);
  assert.equal(held().length, 1);
  const specs = [...store.files.keys()].filter((k) => k.startsWith("specs/g-z2m4tx/"));
  assert.equal(specs.length, 1, "one Spec, not an orphan the host would Load");
});

test("interleaved press via beforeDownload", async () => {
  const lc = fresh();
  const a = await saved(lc, "A");
  // The second press lands while the first is still finishing: its Ledger
  // write is in, its Mission record is not yet stamped.
  const summaries = "specs/_status/summaries.json";
  let second: ReturnType<MissionLifecycle["dispatch"]> | null = null;
  store.beforeDownload = (key) => {
    if (key === summaries && !second) second = lc.dispatch(caller, { id: a });
  };
  const first = await lc.dispatch(caller, { id: a });
  const r = await second!;
  assert.ok(first.ok, JSON.stringify(first));
  assert.ok(!r.ok, JSON.stringify(r));
  assert.match(r.message, /Dispatched a moment ago|only a Planned Mission/);
  assert.equal(held().length, 1);
});

test("a hand-edited record with missing fields does not take the whole list down", async () => {
  const lc = fresh();
  await saved(lc, "Good");
  store.put(`${MISSIONS_PREFIX}broken.json`, { id: "broken" });
  const r = await lc.list(caller, { archived: true });
  assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
  assert.ok(r.body.missions.some((m) => m.name === "Good"), "the good Mission is still listed");
  assert.deepEqual(r.body.unreadable, [`${MISSIONS_PREFIX}broken.json`]);
});

test("list failed: 403 → 503 cap message", async () => {
  const lc = fresh();
  await saved(lc, "A");
  store.fail(/b2_list_file_names/, 403);
  const r = await lc.list(caller, { archived: true });
  assert.ok(!r.ok);
  assert.equal(r.kind, "store_refused");
  assert.match(r.message, /free transaction limit/);
  assert.match(r.message, /00:00 UTC/);
});
