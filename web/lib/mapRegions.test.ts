import { test } from "node:test";
import assert from "node:assert/strict";

import { CATALOGUE, cutRequestFor, parseManifest, regionFor, tileCentre, validRegionId, type Region } from "./mapRegions.ts";

// PWA-2 (#315): which archive covers a Site, and what the developer can add.

const region = (id: string, bbox: Region["bbox"]): Region => ({
  id, name: id, bbox, maxzoom: 15, key: `specs/_maps/${id}-20261003.pmtiles`, bytes: 1, cut_at: "2026-10-03T00:00:00Z", build: "20261003",
});

test("the smallest region holding the point wins, so a province beats its country", () => {
  const m = { regions: [region("canada", [-141, 41.7, -52.6, 83.1]), region("bc", [-139, 48.3, -114, 60])] };
  assert.equal(regionFor(m, -122.8, 49.2)?.id, "bc");
  assert.equal(regionFor(m, -79.4, 43.7)?.id, "canada");
  assert.equal(regionFor(m, 2.3, 48.9), null);
  assert.equal(regionFor({ regions: [] }, 0, 0), null);
});

test("a tile belongs to the region its centre is in", () => {
  // z15 5243/12662 is the Quarry Road tile of siteMap.test.ts.
  const [lon, lat] = tileCentre(15, 5243, 12662);
  assert.ok(Math.abs(lon + 122.395) < 0.01 && Math.abs(lat - 37.805) < 0.01);
});

test("the manifest reads, and anything that is not one reads as empty", () => {
  const r = region("bc", [-139, 48.3, -114, 60]);
  assert.deepEqual(parseManifest(JSON.stringify({ regions: [r] })).regions, [r]);
  assert.deepEqual(parseManifest(null).regions, []);
  assert.deepEqual(parseManifest("not json").regions, []);
  assert.deepEqual(parseManifest(JSON.stringify({ regions: [{ ...r, key: "elsewhere/x.pmtiles" }, { ...r, id: "../x" }, { ...r, bbox: [1, 2, 0, 3] }] })).regions, []);
});

test("every catalogue entry has a safe id and a box inside the world", () => {
  assert.equal(new Set(CATALOGUE.map((c) => c.id)).size, CATALOGUE.length);
  for (const c of CATALOGUE) {
    assert.ok(validRegionId(c.id), c.id);
    assert.ok(c.bbox[0] < c.bbox[2] && c.bbox[1] < c.bbox[3] && c.bbox[0] >= -180 && c.bbox[2] <= 180 && c.bbox[1] >= -90 && c.bbox[3] <= 90, c.id);
  }
  // Every province and territory is there.
  assert.equal(CATALOGUE.filter((c) => c.group === "Canada").length, 13);
});

test("British Columbia covers Surrey and Vancouver Island but not Edmonton", () => {
  const bc = CATALOGUE.find((c) => c.id === "bc")!.bbox;
  const inside = (lon: number, lat: number) => lon >= bc[0] && lon <= bc[2] && lat >= bc[1] && lat <= bc[3];
  assert.ok(inside(-122.84, 49.19));
  assert.ok(inside(-125.3, 49.2));
  assert.ok(!inside(-113.5, 53.55));
});

test("a cut request is made only for a catalogue id", () => {
  const req = cutRequestFor("bc", "owner@example.com", new Date("2026-10-03T12:00:00Z"))!;
  assert.deepEqual([req.id, req.status, req.maxzoom, req.requested_at], ["bc", "queued", 15, "2026-10-03T12:00:00.000Z"]);
  assert.equal(cutRequestFor("atlantis", "x"), null);
  assert.equal(cutRequestFor("../bc", "x"), null);
});
