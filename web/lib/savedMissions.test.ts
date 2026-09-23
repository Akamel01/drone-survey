import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// The store talks to localStorage directly, so the test gives it one. A real
// browser was used to confirm the behaviour these tests pin down (issue #125).
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const { loadSavedMissions, saveMission, deleteMission } = await import("./savedMissions.ts");
const { DEFAULT_SPEC } = await import("./spec.ts");

const KEY = "drone-planner.saved-missions";
const good = (site: string, saved_at: string) => ({ ...DEFAULT_SPEC, site, saved_at });

beforeEach(() => store.clear());

test("a malformed entry costs that entry and nothing else", () => {
  store.set(
    KEY,
    JSON.stringify([
      good("First", "2026-09-01T00:00:00.000Z"),
      "this is not a Mission",
      null,
      good("Second", "2026-09-02T00:00:00.000Z"),
    ]),
  );

  const { missions, skipped } = loadSavedMissions();

  assert.deepEqual(
    missions.map((m) => m.site),
    ["Second", "First"],
    "both good entries survive, newest first",
  );
  assert.equal(skipped, 2, "the two unusable entries are counted, not invented into Missions");
});

test("an entry saved before a field existed still loads", () => {
  // No mission_type, no site_id, no shape, no orbit — a pre-#39 saved Mission.
  store.set(
    KEY,
    JSON.stringify([
      {
        version: 1,
        site: "Old Quarry",
        date: "2026-09-01",
        aoi: [[49.1, -122.8]],
        home: null,
        flight: { altitude_m: 80 },
        camera: { iso: "200" },
        saved_at: "2026-09-01T00:00:00.000Z",
      },
    ]),
  );

  const { missions, skipped } = loadSavedMissions();

  assert.equal(skipped, 0);
  assert.equal(missions[0].site, "Old Quarry");
  assert.equal(missions[0].mission_type, "grid", "a Spec saved before orbits existed is a grid");
  assert.equal(missions[0].flight.altitude_m, 80, "the field it did carry is kept");
  assert.equal(
    missions[0].orbit.photos_per_ring,
    DEFAULT_SPEC.orbit.photos_per_ring,
    "the fields it never had fall back to defaults",
  );
});

test("a save beside a malformed entry keeps the good entries", () => {
  store.set(KEY, JSON.stringify([good("Keep me", "2026-09-01T00:00:00.000Z"), 7]));

  const { missions, skipped } = saveMission({ ...DEFAULT_SPEC, site: "Brand new" });

  assert.equal(skipped, 1);
  assert.deepEqual(new Set(missions.map((m) => m.site)), new Set(["Keep me", "Brand new"]));
});

test("an unreadable blob is kept, not overwritten by the next save", () => {
  store.set(KEY, '[{"site":"Half a Mission"');

  const first = loadSavedMissions();
  assert.equal(first.missions.length, 0);
  assert.equal(first.skipped, 1, "the operator is told the list could not be read");

  saveMission({ ...DEFAULT_SPEC, site: "New one" });

  assert.equal(
    store.get(`${KEY}.unreadable`),
    '[{"site":"Half a Mission"',
    "the bytes survive the save that would otherwise have destroyed them",
  );
});


test("delete removes only the entry asked for", () => {
  store.set(
    KEY,
    JSON.stringify([good("A", "2026-09-01T00:00:00.000Z"), good("B", "2026-09-02T00:00:00.000Z")]),
  );

  const { missions } = deleteMission("2026-09-01T00:00:00.000Z");

  assert.deepEqual(
    missions.map((m) => m.site),
    ["B"],
  );
});
