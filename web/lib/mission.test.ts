import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { orbitTilt } from "./mission.ts";

// fixtures/orbit-tilt.json is frozen output of the real writer: produced once by
// importing scripts/mission/make_mission.py and calling orbit_rings() on each
// case, taking the ring's pitch (make_mission.py:313-314). The test never spawns
// Python; it pins the TS mirror to those values. V8 and CPython may differ in the
// last ULP, so deg is compared with tolerance and clamped strictly.
const cases = JSON.parse(
  readFileSync(new URL("../../fixtures/orbit-tilt.json", import.meta.url), "utf8"),
) as { ring_m: number; target_m: number; radius_m: number; deg: number; clamped: boolean }[];

test("the orbit tilt matches the writer, including the clamp", () => {
  assert.ok(cases.length >= 5, `fixture has ${cases.length} cases`);
  assert.ok(cases.some((c) => c.clamped), "fixture has at least one clamped case");
  for (const c of cases) {
    const got = orbitTilt(c.ring_m, c.target_m, c.radius_m);
    assert.equal(got.clamped, c.clamped, `clamped for ${c.ring_m}/${c.target_m}/${c.radius_m}`);
    assert.ok(
      Math.abs(got.deg - c.deg) < 1e-9,
      `deg for ${c.ring_m}/${c.target_m}/${c.radius_m}: got ${got.deg}, want ${c.deg}`,
    );
  }
});
