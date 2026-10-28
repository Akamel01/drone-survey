import { test } from "node:test";
import assert from "node:assert/strict";

import { eastOf, fc, footprintGeoJSON, lineGeoJSON, midpointsGeoJSON, pointsGeoJSON, polygonGeoJSON, toLngLat } from "./mapGeometry.ts";
import { mPerLon, type LL } from "./mission.ts";
import { canFinish } from "./areaEditing.ts";

test("toLngLat converts [lat,lon] to [lon,lat]", () => {
  assert.deepEqual(toLngLat([49.1891, -122.8396] as LL), [-122.8396, 49.1891]);
});

test("mPerLon series form at 49N", () => {
  assert.ok(Math.abs(mPerLon(49) - 73171.81532557764) < 1e-6);
});

test("eastOf 100m at 49N lon offset", () => {
  const r = eastOf([49, -122] as LL, 100);
  assert.equal(r[0], 49);
  const offset = r[1] - (-122);
  assert.ok(Math.abs(offset - 0.0013666464273853324) < 1e-12);
  assert.ok(Math.abs(offset * mPerLon(49) - 100) < 1e-9);
  const oldOffset = 0.0013692535813023844;
  assert.ok(Math.abs((oldOffset - offset) * mPerLon(49) - 0.1907701849438868) < 1e-9);
  assert.ok(Math.abs(oldOffset - offset) < 1e-5);
});

test("footprintGeoJSON zero across or along returns empty", () => {
  assert.equal(footprintGeoJSON([49, -122] as LL, 0, 100).features.length, 0);
  assert.equal(footprintGeoJSON([49, -122] as LL, 100, 0).features.length, 0);
});

test("polygonGeoJSON degenerate ring (<3) returns empty", () => {
  assert.equal(polygonGeoJSON([[0, 0], [0, 2]] as LL[]).features.length, 0);
  const t = polygonGeoJSON([[0, 0], [0, 2], [2, 2]] as LL[]);
  assert.equal(t.features.length, 1);
  assert.deepEqual((t.features[0].geometry as any).coordinates[0], [[0, 0], [2, 0], [2, 2], [0, 0]]);
});

test("midpointsGeoJSON requires >=3 points and no shape", () => {
  assert.equal(midpointsGeoJSON([[0, 0], [0, 2]] as LL[], null).features.length, 0);
  assert.equal(midpointsGeoJSON([[0, 0], [0, 2], [2, 2]] as LL[], {} as any).features.length, 0);
  const m = midpointsGeoJSON([[0, 0], [0, 2], [2, 2]] as LL[], null);
  assert.equal(m.features.length, 3);
  assert.deepEqual(m.features.map((f: any) => f.geometry.coordinates), [[1, 0], [2, 1], [1, 1]]);
  assert.deepEqual(m.features.map((f: any) => f.properties.edgeIndex), [0, 1, 2]);
  for (let n = 0; n <= 4; n++) {
    const ring = Array.from({ length: n }, (_, i) => [i, i] as LL);
    const out = midpointsGeoJSON(ring, null);
    assert.equal(out.features.length === 0, !canFinish(ring), `ring length ${n}`);
  }
});

test("lineGeoJSON requires >=2 points", () => {
  assert.equal(lineGeoJSON([[0, 0]] as LL[]).features.length, 0);
  const l = lineGeoJSON([[0, 0], [0, 2]] as LL[]);
  assert.equal(l.features.length, 1);
  assert.deepEqual((l.features[0].geometry as any).coordinates, [[0, 0], [2, 0]]);
});

test("pointsGeoJSON maps props", () => {
  const one = pointsGeoJSON([[49, -122]] as LL[]);
  assert.equal(one.features.length, 1);
  assert.deepEqual(one.features[0].properties, {});
  assert.deepEqual((one.features[0].geometry as any).coordinates, [-122, 49]);
  const idx = pointsGeoJSON([[49, -122], [49.1, -122.1]] as LL[], (i) => ({ index: i }));
  assert.deepEqual(idx.features.map((f: any) => f.properties), [{ index: 0 }, { index: 1 }]);
});

test("footprintGeoJSON uses the series longitude scale", () => {
  const f = footprintGeoJSON([49, -122] as LL, 100, 100);
  assert.equal(f.features.length, 1);
  const ring = (f.features[0].geometry as any).coordinates[0];
  assert.equal(ring.length, 5);
  assert.ok(Math.abs(ring[0][1] - 48.9995500845841) < 1e-12); // lat half
  // dLon = 0.0006833232136926662
  assert.ok(Math.abs(ring[0][0] - (-122.00068332321369)) < 1e-12);
});
