import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_TILES, MAX_ZOOM, MIN_ZOOM, formatBytes, siteBounds, tilesFor, validTile } from "./siteMap.ts";

// PWA-2 (#315): the area and zoom a Site keeps are bounded.

const QUARRY: [number, number][] = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];

test("a small Site keeps every level down to 15, within the cap", () => {
  const b = siteBounds(QUARRY)!;
  const kept = tilesFor(b)!;
  assert.equal(kept.maxZoom, MAX_ZOOM);
  assert.ok(kept.tiles.length <= MAX_TILES);
  assert.ok(kept.tiles.every(([z, x, y]) => validTile(z, x, y)));
  // The Site's own centre is in a tile at every level kept.
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) assert.ok(kept.tiles.some((t) => t[0] === z));
});

test("the tile the Site sits in is the right one (z15 at 37.805, -122.395)", () => {
  const z15 = tilesFor(siteBounds(QUARRY)!)!.tiles.filter((t) => t[0] === 15);
  assert.ok(z15.some(([, x, y]) => x === 5243 && y === 12662));
});

test("a bigger Site keeps fewer zoom levels, never more tiles", () => {
  const big = siteBounds([[37.5, -122.6], [37.9, -122.1]])!;
  const kept = tilesFor(big)!;
  assert.ok(kept.maxZoom < MAX_ZOOM);
  assert.ok(kept.tiles.length <= MAX_TILES);
});

test("a Site too big for even the widest level is refused", () => {
  assert.equal(tilesFor(siteBounds([[0, -60], [50, 60]])!), null);
  assert.equal(siteBounds([]), null);
});

test("the route reads only levels and cells the Site cache can hold", () => {
  assert.ok(validTile(15, 0, 0));
  assert.ok(!validTile(16, 0, 0));
  assert.ok(!validTile(10, 0, 0));
  assert.ok(!validTile(12, 4096, 0));
  assert.ok(!validTile(12, -1, 0));
  assert.ok(!validTile(12, 1.5, 0));
  assert.ok(!validTile(12, NaN, 0));
});

test("sizes read as KB and MB", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(820_000), "820 KB");
  assert.equal(formatBytes(1_400_000), "1.4 MB");
});
