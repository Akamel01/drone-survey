import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { geodesicM, mPerLon, orbitTilt, preview, type LL, type Waypoint } from "./mission.ts";
import type { MissionSpec } from "./spec.ts";

// The geometry and the split have one implementation, mission.ts, and these are
// its tests (#346). The host's writer serialises what Dispatch records from it;
// scripts/mission/e2e_test.py checks only that the KMZ holds those waypoints.

// fixtures/orbit-tilt.json is frozen output of the Python writer that laid out
// orbits before #346, kept so moving the geometry here could not change a tilt.
// V8 and CPython may differ in the last ULP, so deg is compared with tolerance.
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

function gridSpec(aoi: LL[], flight: Partial<MissionSpec["flight"]> = {}): MissionSpec {
  return {
    version: 1, mission_type: "grid", site: "Test Site", date: "2026-09-12", aoi, home: aoi[0],
    flight: {
      altitude_m: 90, forward_overlap_pct: 85, side_overlap_pct: 75, gimbal_pitch_deg: -80,
      speed_ms: 5, turn: "through", margin_passes: 1, battery_minutes: 16, ...flight,
    },
    orbit: { center: null, target_height_m: 0, radius_m: 40, altitudes_m: [40], photos_per_ring: 24, clockwise: true },
    camera: { interval_s: 5, shutter: "1/1000", iso: "100", white_balance: "Sunny",
      white_balance_k: null, exposure_lock: true, format: "JPEG" },
  };
}

function orbitSpec(orbit: Partial<MissionSpec["orbit"]> = {}): MissionSpec {
  const s = gridSpec([TOWER, [TOWER[0] - 0.001, TOWER[1]], [TOWER[0], TOWER[1] - 0.001]]);
  return { ...s, mission_type: "orbit", orbit: { ...s.orbit, center: TOWER, target_height_m: 20,
    radius_m: 40, altitudes_m: [40, 60], photos_per_ring: 24, clockwise: true, ...orbit } };
}

// The rehearsal area, as marked on the Controller: 120 x 100 m.
const SMALL: LL[] = [[49.1896507, -122.8402975], [49.1885718, -122.8402975],
  [49.1885718, -122.8389242], [49.1896507, -122.8389242]];
// Large enough that the battery forces a split.
const LARGE: LL[] = [[49.1935, -122.846], [49.188, -122.846], [49.188, -122.836], [49.1935, -122.836]];
// Before the grid was clipped to the area, this planned 102 positions with 87
// of them outside the triangle.
const TRIANGLE: LL[] = [[49.1896507, -122.8402975], [49.1885718, -122.8402975], [49.1885718, -122.8389242]];
const TOWER: LL = [49.1891, -122.8396];

/** The parts stitched back together, dropping each seam's repeated waypoint. */
const stitched = (parts: Waypoint[][]) => parts.flatMap((p, i) => (i ? p.slice(1) : p));

test("the recorded parts are every photo position, in order, and nothing else", () => {
  for (const spec of [gridSpec(SMALL), gridSpec(LARGE), gridSpec(TRIANGLE), orbitSpec()]) {
    const p = preview(spec);
    assert.deepEqual(p.problems, []);
    assert.equal(p.parts, p.plan.parts.length, "the Card count is the part count");
    const flown = stitched(p.plan.parts);
    assert.equal(flown.length, p.photo_count);
    flown.forEach((w, i) => assert.deepEqual([w[0], w[1]], p.points[i]));
  }
});

test("a Site too big for one battery is split at a line end, sharing the seam waypoint", () => {
  const spec = gridSpec(LARGE);
  const p = preview(spec);
  assert.ok(p.parts > 1, `${p.parts} parts`);
  for (let i = 0; i < p.plan.parts.length - 1; i++) {
    const a = p.plan.parts[i];
    assert.deepEqual(a[a.length - 1], p.plan.parts[i + 1][0], `seam ${i + 1}`);
  }
  for (const part of p.plan.parts) assert.ok(part.length <= 200, `${part.length} waypoints`);
  for (const m of p.part_minutes) assert.ok(m <= spec.flight.battery_minutes + 1e-9, `${m} min`);
  // A cut lands where a line ends: each part (bar its seam) is whole lines.
  const lineStarts = new Set(p.lines.map((l) => l[0].join()));
  for (const part of p.plan.parts.slice(1)) assert.ok(lineStarts.has(part[1].slice(0, 2).join()));
});

test("the small areas fly as one Mission, through or stopping", () => {
  for (const spec of [gridSpec(SMALL), gridSpec(SMALL, { turn: "stop" }), gridSpec(TRIANGLE)]) {
    assert.equal(preview(spec).parts, 1);
  }
});

test("a grid waypoint carries the requested altitude and gimbal angle, at the shutter-capped speed", () => {
  const spec = gridSpec(SMALL);
  const p = preview(spec);
  for (const w of stitched(p.plan.parts)) assert.deepEqual(w.slice(2), [90, -80]);
  assert.equal(p.plan.speed_ms, p.capped_speed_ms);
  assert.ok(p.capped_speed_ms * spec.camera.interval_s <= p.fwd_spacing_m + 0.05);
});

test("no waypoint lies further outside the area than the margin allows", () => {
  const p = preview(gridSpec(TRIANGLE));
  const allowed = Math.max(p.fwd_spacing_m, p.side_spacing_m) + 0.01;
  // Outside the triangle's bounding box by more than the margin is outside it by more.
  const lats = TRIANGLE.map((c) => c[0]);
  const lons = TRIANGLE.map((c) => c[1]);
  for (const [lat, lon] of p.points) {
    const dLat = Math.max(0, Math.min(...lats) - lat, lat - Math.max(...lats));
    const dLon = Math.max(0, Math.min(...lons) - lon, lon - Math.max(...lons));
    const out = geodesicM([lat, lon], [lat - dLat, lon - dLon]);
    assert.ok(out <= allowed, `${out} m outside`);
  }
  assert.ok(p.photo_count < 102, `${p.photo_count} positions: the bounding box, not the triangle`);
});

test("the start corner reported is where the path starts", () => {
  const p = preview(gridSpec(SMALL));
  const lat0 = p.points.reduce((a, q) => a + q[0], 0) / p.points.length;
  const lon0 = p.points.reduce((a, q) => a + q[1], 0) / p.points.length;
  const [lat, lon] = p.points[0];
  assert.equal(p.start_corner, `${lat >= lat0 ? "north" : "south"}-${lon >= lon0 ? "east" : "west"}`);
});

test("an orbit: on the circle, one ring per altitude, tilted at the subject, starting due north", () => {
  for (const spec of [orbitSpec(), orbitSpec({ altitudes_m: [30], photos_per_ring: 18, clockwise: false })]) {
    const o = spec.orbit;
    const p = preview(spec);
    assert.deepEqual(p.problems, []);
    const flown = stitched(p.plan.parts);
    for (const w of flown) {
      assert.ok(Math.abs(geodesicM(w, TOWER) - o.radius_m) < 0.2, "on the circle");
      assert.equal(w[3], orbitTilt(w[2], o.target_height_m, o.radius_m).deg);
    }
    assert.deepEqual([...new Set(flown.map((w) => w[2]))], [...o.altitudes_m].sort((a, b) => a - b));
    assert.ok(flown[0][0] > TOWER[0] && Math.abs(flown[0][1] - TOWER[1]) < 1e-6, "due north");
    // Clockwise seen from above runs east of north first.
    assert.equal(flown[1][1] > TOWER[1], o.clockwise);
  }
});

// fixtures/dispatched-spec.json is a Spec as Dispatch writes it. The host's
// load tests feed it to the real writer without running node, so it is pinned
// here to what this module computes today.
test("mPerLon at the equator", () => {
  assert.ok(Math.abs(mPerLon(0) - 111319.34) < 1e-9);
});

test("mPerLon beats the cosine-only adapter at 49N", () => {
  const cosineAt49 = 73032.49110722326;
  assert.ok(Math.abs(mPerLon(49) - cosineAt49 - 139.32421835437708) < 1e-6);
});

test("the dispatched-Spec fixture is what Dispatch would record", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../../fixtures/dispatched-spec.json", import.meta.url), "utf8"),
  ) as MissionSpec;
  const { plan, ...spec } = fixture;
  assert.deepEqual(plan, preview(spec as MissionSpec).plan);
});
