import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { StatusRow } from "./missions.ts";
import type { SavedMission } from "./savedMissions.ts";

// The store talks to localStorage directly, so the test gives it one. A real
// browser was used to confirm the behaviour these tests pin down (issue #125).
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const { loadSavedMissions, saveMission, deleteMission, markMissionSent, overwriteMission, savedMissionState } =
  await import("./savedMissions.ts");
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

test("sending a Mission marks it, and never removes it", () => {
  store.set(KEY, JSON.stringify([good("Sent one", "2026-09-01T00:00:00.000Z")]));

  const { missions } = markMissionSent("2026-09-01T00:00:00.000Z", "2026-09-05T12:00:00.000Z");

  assert.equal(missions.length, 1, "the local copy stays");
  assert.equal(missions[0].sent_at, "2026-09-05T12:00:00.000Z");
  assert.equal(
    loadSavedMissions().missions[0].sent_at,
    "2026-09-05T12:00:00.000Z",
    "and the mark survives a re-read",
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

// The state machine behind the overwrite rule (issue #127). Each case is a
// saved entry joined to the status rows by recorded id, and what that state
// allows. A wrong answer here is either an edit blocked that should not be,
// or an overwrite that silently desynchronises the planner from the field.
const draftRow = (id: string, dispatched_key: string | null): StatusRow => ({
  kind: "draft",
  id,
  site: "Quarry",
  date: "2026-09-01",
  state: dispatched_key ? "dispatched" : "draft",
  stamp: "2026-09-01T00:00:00.000Z",
  dispatched_key,
  collected_at: null,
  loaded_at: null,
  cards: [],
  queue: null,
  updated: "2026-09-01T00:00:00.000Z",
});

const specRow = (id: string, state: StatusRow["state"]): StatusRow => ({
  kind: "spec",
  id,
  site: "Quarry",
  date: "2026-09-01",
  state,
  stamp: "20260901T000000Z",
  dispatched_key: id,
  collected_at: null,
  loaded_at: null,
  cards: [],
  queue: null,
  updated: "2026-09-01T00:00:00.000Z",
});

const SPEC_KEY = "specs/quarry/2026-09-01/20260901T000000Z.json";
const entry = (extra: Partial<SavedMission>): SavedMission => ({
  ...DEFAULT_SPEC,
  site: "Quarry",
  saved_at: "2026-09-01T00:00:00.000Z",
  ...extra,
});

test("a Mission never sent is an ordinary draft and can be overwritten", () => {
  const s = savedMissionState(entry({}), []);
  assert.equal(s.state, "draft");
  assert.equal(s.can_overwrite, true);
  assert.equal(s.dispatched_key, null);
});

test("a Mission sent but not Dispatched can still be overwritten", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), [
    draftRow("d1", null),
  ]);
  assert.equal(s.state, "sent");
  assert.equal(s.can_overwrite, true, "nothing has been handed to the host yet");
});

test("a Dispatched Mission cannot be overwritten, and names the Spec to withdraw", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), [
    draftRow("d1", SPEC_KEY),
    specRow(SPEC_KEY, "dispatched"),
  ]);
  assert.equal(s.state, "dispatched");
  assert.equal(s.can_overwrite, false);
  assert.equal(s.dispatched_key, SPEC_KEY, "the overwrite has something to withdraw");
  assert.ok(s.why_not, "and a reason to show the operator");
});

test("a queued Mission is as untouchable as a Dispatched one", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), [
    draftRow("d1", SPEC_KEY),
    specRow(SPEC_KEY, "queued"),
  ]);
  assert.equal(s.state, "dispatched");
  assert.equal(s.can_overwrite, false);
});

test("a Loaded Mission is past the point a withdrawal can reach", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), [
    draftRow("d1", SPEC_KEY),
    specRow(SPEC_KEY, "loaded"),
  ]);
  assert.equal(s.state, "loaded");
  assert.equal(s.can_overwrite, false);
  assert.equal(s.dispatched_key, SPEC_KEY);
});

test("an already withdrawn Spec frees its saved Mission again", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), [
    draftRow("d1", SPEC_KEY),
    specRow(SPEC_KEY, "withdrawn"),
  ]);
  assert.equal(s.state, "sent");
  assert.equal(s.can_overwrite, true, "the host will not Load it, so nothing in the field depends on it");
});

test("a Mission sent before the link existed is unknown, never assumed free", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z" }), [
    draftRow("d1", SPEC_KEY),
    specRow(SPEC_KEY, "dispatched"),
  ]);
  assert.equal(s.state, "unknown");
  assert.equal(s.can_overwrite, false);
  assert.equal(s.dispatched_key, null, "there is no key to withdraw, and none is guessed");
});

test("a status read that failed never unlocks an overwrite", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), null);
  assert.equal(s.state, "unknown");
  assert.equal(s.can_overwrite, false);
});

test("a draft deleted from the store leaves its Mission unknown, not free", () => {
  const s = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "gone" }), [
    draftRow("d1", SPEC_KEY),
    specRow(SPEC_KEY, "dispatched"),
  ]);
  assert.equal(s.state, "unknown");
  assert.equal(s.can_overwrite, false);
});

test("two Missions on the same date do not borrow each other's state", () => {
  // The implicit Site-plus-date join this replaces would have called both of
  // these Dispatched. Only the one with the recorded id is.
  const rows = [draftRow("d1", SPEC_KEY), specRow(SPEC_KEY, "dispatched"), draftRow("d2", null)];
  const dispatched = savedMissionState(entry({ sent_at: "2026-09-02T00:00:00.000Z", draft_id: "d1" }), rows);
  const other = savedMissionState(
    entry({ saved_at: "2026-09-03T00:00:00.000Z", sent_at: "2026-09-03T00:00:00.000Z", draft_id: "d2" }),
    rows,
  );
  assert.equal(dispatched.can_overwrite, false);
  assert.equal(other.can_overwrite, true);
});

test("overwrite replaces the Spec in place and keeps the entry's identity", () => {
  store.set(
    KEY,
    JSON.stringify([
      { ...good("Quarry", "2026-09-01T00:00:00.000Z"), draft_id: "d1", sent_at: "2026-09-02T00:00:00.000Z" },
      good("Other", "2026-09-02T00:00:00.000Z"),
    ]),
  );

  const { missions } = overwriteMission("2026-09-01T00:00:00.000Z", {
    ...DEFAULT_SPEC,
    site: "Quarry renamed",
  });

  const hit = missions.find((m) => m.saved_at === "2026-09-01T00:00:00.000Z")!;
  assert.equal(hit.site, "Quarry renamed", "the Spec is replaced");
  assert.equal(hit.draft_id, "d1", "and the link to the store survives it");
  assert.equal(missions.length, 2, "no second entry is created");
});

test("a send records the draft id, which is the whole link", () => {
  store.set(KEY, JSON.stringify([good("Quarry", "2026-09-01T00:00:00.000Z")]));

  const { missions } = markMissionSent("2026-09-01T00:00:00.000Z", "2026-09-05T12:00:00.000Z", "d1");

  assert.equal(missions[0].draft_id, "d1");
  assert.equal(loadSavedMissions().missions[0].draft_id, "d1", "and it survives a re-read");
});
