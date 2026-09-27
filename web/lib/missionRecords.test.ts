import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveMissions,
  liveSpecKeys,
  changeSurvived,
  missionNameProblem,
  missionNameTaken,
  missionProblem,
  siteNameTaken,
  supersessionGroup,
  type MissionRecord,
} from "./missionRecords.ts";
import { withReservation, type CardLedger } from "./model.ts";
import type { Manifest } from "./missions.ts";
import { DEFAULT_SPEC } from "./spec.ts";

const SPEC = { ...DEFAULT_SPEC, site: "Rehearsal Field", site_id: "rehearsal-1", date: "2026-09-23" };

function mission(over: Partial<MissionRecord> & { id: string }): MissionRecord {
  return {
    site_id: "rehearsal-1",
    site: "Rehearsal Field",
    name: "north half",
    date: "2026-09-23",
    // Same instant everywhere: deriveMissions breaks the tie by id, so "a" is
    // older than "bb" without every test having to invent a clock.
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z",
    dispatched_key: null,
    spec: SPEC,
    ...over,
  };
}

test("a Mission nobody has Dispatched is Planned, and editable in place", () => {
  const [row] = deriveMissions([mission({ id: "a" })]);
  assert.equal(row.state, "planned");
  assert.equal(row.edit, "in-place");
  assert.equal(row.archived, false);
  assert.deepEqual(row.cards, []);
});

test("the state walks Dispatched, Collected, Loaded from the store alone", () => {
  const key = "specs/rehearsal-1/2026-09-23/20260923T000000Z.json";
  const rec = mission({ id: "a", dispatched_key: key });
  const at = (m: Manifest) => deriveMissions([rec], m)[0].state;
  assert.equal(at({}), "dispatched");
  assert.equal(at({ [key]: { collected_at: "t" } }), "collected");
  assert.equal(at({ [key]: { collected_at: "t", loaded_at: "t" } }), "loaded");
  assert.equal(deriveMissions([rec], { [key]: { loaded_at: "t" } })[0].edit, "guarded");
});

test("a withdrawn Mission is archived, not deleted, and never becomes superseded", () => {
  const rows = deriveMissions([
    mission({ id: "a", dispatched_key: "specs/rehearsal-1/2026-09-23/1.json", withdrawn_at: "t" }),
    mission({ id: "bb", dispatched_key: "specs/rehearsal-1/2026-09-23/2.json" }),
  ]);
  const a = rows.find((r) => r.id === "a")!;
  assert.equal(a.state, "withdrawn");
  assert.equal(a.archived, true, "archived rather than gone");
  assert.equal(a.superseded_by, null);
});

test("a Dispatch that names what it replaced supersedes it", () => {
  const rows = deriveMissions([
    mission({ id: "a", dispatched_key: "specs/rehearsal-1/2026-09-23/1.json" }),
    mission({ id: "bb", dispatched_key: "specs/rehearsal-1/2026-09-23/2.json", supersedes: ["a"] }),
  ]);
  assert.equal(rows.find((r) => r.id === "a")!.state, "superseded");
  assert.equal(rows.find((r) => r.id === "a")!.superseded_by, "bb");
  assert.equal(rows.find((r) => r.id === "bb")!.state, "dispatched");
});

test("supersession is recorded, never guessed from age or from a random id", () => {
  const at = "2026-09-23T00:00:00.000Z";
  for (const [orig, fork] of [["a", "bb"], ["bb", "a"]]) {
    const rows = deriveMissions([
      mission({ id: orig, created_at: at, dispatched_key: "specs/rehearsal-1/2026-09-23/1.json" }),
      mission({ id: fork, created_at: at, dispatched_key: "specs/rehearsal-1/2026-09-23/2.json", supersedes: [orig] }),
    ]);
    assert.equal(rows.find((r) => r.id === orig)!.state, "superseded", `${orig} replaced by ${fork}`);
    assert.equal(rows.find((r) => r.id === fork)!.state, "dispatched");
  }
});

test("withdrawing the replacement does not bring back what it replaced", () => {
  // Its Cards were released and the host was told to skip it at the
  // replacement's Dispatch; showing it live again would be a lie.
  const rows = deriveMissions([
    mission({ id: "a", dispatched_key: "specs/rehearsal-1/2026-09-23/1.json" }),
    mission({ id: "bb", dispatched_key: "specs/rehearsal-1/2026-09-23/2.json", supersedes: ["a"], withdrawn_at: "t" }),
  ]);
  assert.equal(rows.find((r) => r.id === "a")!.state, "superseded");
  assert.equal(rows.find((r) => r.id === "bb")!.state, "withdrawn");
});

test("a different Mission Name on the same Site and date is not a correction", () => {
  const rows = deriveMissions([
    mission({ id: "a", name: "north half", dispatched_key: "specs/rehearsal-1/2026-09-23/1.json" }),
    mission({ id: "bb", name: "orbit", dispatched_key: "specs/rehearsal-1/2026-09-23/2.json" }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.state).sort(),
    ["dispatched", "dispatched"],
    "two deliberate flights, not one superseding the other",
  );
  assert.notEqual(supersessionGroup(mission({ id: "a" })), supersessionGroup(mission({ id: "b", name: "orbit" })));
});

test("merely saving a second Mission supersedes nothing: replacement happens at Dispatch", () => {
  const rows = deriveMissions([
    mission({ id: "a", dispatched_key: "specs/rehearsal-1/2026-09-23/1.json" }),
    mission({ id: "bb" }),
  ]);
  assert.equal(rows.find((r) => r.id === "a")!.state, "dispatched");
  assert.equal(rows.find((r) => r.id === "bb")!.state, "planned");
});

test("the operator's mark decides Flown, and overrides the imagery in both directions", () => {
  const key = "specs/rehearsal-1/2026-09-23/1.json";
  const rec = mission({ id: "a", dispatched_key: key });
  const withImagery: Manifest = { [key]: { loaded_at: "t", imagery_at: "2026-09-23T18:00:00Z" } };

  // Inferred from imagery when the operator has not answered.
  assert.equal(deriveMissions([rec], withImagery)[0].state, "flown");

  // Unmarked: their answer wins, and both are recorded.
  const unmarked = deriveMissions([{ ...rec, flown_mark: { flown: false, at: "t" } }], withImagery)[0];
  assert.equal(unmarked.state, "loaded");
  assert.equal(unmarked.flown_marked, false);
  assert.equal(unmarked.flown_evidence_at, "2026-09-23T18:00:00Z");
  assert.match(unmarked.flown_disagreement!, /imagery arrived/);

  // Marked before the imagery lands: also their answer, also both recorded.
  const early = deriveMissions([{ ...rec, flown_mark: { flown: true, at: "t" } }], { [key]: {} })[0];
  assert.equal(early.state, "flown");
  assert.equal(early.flown_evidence_at, null);
  assert.match(early.flown_disagreement!, /no imagery/);
});

test("only current Missions count as live Spec keys, so a stale Card can be spotted", () => {
  const rows = deriveMissions([
    mission({ id: "a", dispatched_key: "specs/rehearsal-1/2026-09-23/1.json" }),
    mission({ id: "bb", dispatched_key: "specs/rehearsal-1/2026-09-23/2.json", supersedes: ["a"] }),
  ]);
  assert.deepEqual([...liveSpecKeys(rows)], ["specs/rehearsal-1/2026-09-23/2.json"]);
});

// ---------------------------------------------------------------------------

test("a release survives unless the old holding came back", () => {
  const base = withReservation({ pool: ["A"], holdings: {} }, ["A"], "specs/x/y/ours.json", "t");
  const released: CardLedger = { ...base, holdings: {} };
  assert.equal(changeSurvived(base, released, released), true);
  assert.equal(changeSurvived(base, released, base), false, "a stale copy written back undid the release");
});

test("a Mission must belong to a chosen Site and carry its own short name", () => {
  const ok = { site: "Rehearsal Field", site_id: "rehearsal-1", name: "north half", date: "2026-09-23" };
  assert.equal(missionProblem(ok), null);
  assert.match(missionProblem({ ...ok, site_id: undefined })!, /Choose an existing Site/);
  assert.match(missionProblem({ ...ok, name: "  " })!, /short name/);
  assert.match(missionProblem({ ...ok, date: "" })!, /date/);
  assert.match(missionNameProblem("x".repeat(41))!, /at most 40/);
  assert.equal(missionNameProblem("orbit"), null);
});

// --- names that must not collide (#166, #167) ----------------------------------

test("a Site name is taken whatever its case or spacing, by another Site only", () => {
  const records = [mission({ id: "a", site_id: "g-1", site: "GeorgeTown2" })];
  assert.deepEqual(siteNameTaken(records, "g-2", " georgetown2 "), { site_id: "g-1", site: "GeorgeTown2" });
  assert.equal(siteNameTaken(records, "g-1", "GeorgeTown2"), null, "a Site does not collide with itself");
  assert.equal(siteNameTaken(records, "g-2", "Georgetown 3"), null);
});

test("a renamed Site is known by its latest name, not the one its old Missions carry", () => {
  const records = [
    mission({ id: "a", site_id: "g-1", site: "Old Name", updated_at: "2026-09-01T00:00:00Z" }),
    mission({ id: "b", site_id: "g-1", site: "New Name", updated_at: "2026-09-20T00:00:00Z" }),
  ];
  assert.equal(siteNameTaken(records, "g-2", "Old Name"), null, "the old name is free again");
  assert.ok(siteNameTaken(records, "g-2", "new name"));
});

test("a live Mission's Site, date and name cannot be taken by a new one", () => {
  const rows = deriveMissions([mission({ id: "a", name: "Ortho" })]);
  const fresh = { id: null, site_id: "rehearsal-1", date: "2026-09-23", name: " ortho " };
  assert.equal(missionNameTaken(rows, fresh)?.id, "a");
  assert.equal(missionNameTaken(rows, { ...fresh, name: "Facade" }), null, "a different name is a second flight");
  assert.equal(missionNameTaken(rows, { ...fresh, date: "2026-09-24" }), null);
  assert.equal(missionNameTaken(rows, { ...fresh, id: "a" }), null, "a Mission does not collide with itself");
});

test("a Mission that is history does not hold its name", () => {
  const rows = deriveMissions([mission({ id: "a", name: "Ortho", archived_at: "2026-09-23T01:00:00Z" })]);
  assert.equal(
    missionNameTaken(rows, { id: null, site_id: "rehearsal-1", date: "2026-09-23", name: "Ortho" }),
    null,
  );
});

test("a Planned fork is never superseded, even when it shares its original's creation instant", () => {
  const at = "2026-09-24T08:00:00.000Z";
  for (const ids of [["a", "b"], ["b", "a"]]) {
    const [orig, fork] = ids;
    const rows = deriveMissions([
      mission({ id: orig, name: "Ortho", created_at: at, dispatched_key: "specs/rehearsal-1/2026-09-23/k.json" }),
      mission({ id: fork, name: "Ortho", created_at: at }),
    ]);
    assert.equal(rows.find((r) => r.id === fork)?.state, "planned", `fork ${fork} after ${orig}`);
    assert.equal(rows.find((r) => r.id === orig)?.state, "dispatched");
  }
});
