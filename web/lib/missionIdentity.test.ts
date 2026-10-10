import { test } from "node:test";
import assert from "node:assert/strict";

import { nameKey, sameName, siteLabelProblem } from "./missionIdentity.ts";
import { missionNameTaken, supersessionGroup } from "./missionRecords.ts";

// [a, b, same?] -- one answer for the view, the name-taken check and supersession.
const PAIRS: [string, string, boolean][] = [
  ["north half", "north half", true],
  ["north half", "  North Half ", true],
  ["north half", "north  half", true],
  ["north half", "north\thalf", true],
  ["north half", "NORTH  HALF", true],
  ["north half", "northhalf", false],
  ["north half", "north half 2", false],
  ["orbit", "orbit (2)", false],
];

test("name pairs agree across sameName, supersessionGroup and missionNameTaken", () => {
  for (const [a, b, same] of PAIRS) {
    const ra = { site_id: "s", date: "2026-01-01", name: a };
    const rb = { site_id: "s", date: "2026-01-01", name: b };
    assert.equal(sameName(a, b), same, `${a} / ${b}`);
    assert.equal(nameKey(a) === nameKey(b), same, `${a} / ${b}`);
    assert.equal(supersessionGroup(ra) === supersessionGroup(rb), same, `${a} / ${b}`);
    const taken = missionNameTaken([{ id: "x", state: "dispatched", archived: false, ...ra }], { ...rb, id: "y" });
    assert.equal(taken !== null, same, `${a} / ${b}`);
  }
});

test("Site names: control characters and length", () => {
  assert.equal(siteLabelProblem("Rehearsal Field"), null);
  assert.match(siteLabelProblem("a\u0000b")!, /invisible/);
  assert.match(siteLabelProblem("x".repeat(61))!, /at most 60/);
});
