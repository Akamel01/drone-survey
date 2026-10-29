// PWA-2 (#315): what the browser keeps for a Site's map -- the bounded tile
// set and its size, persistent storage, removal, and an update that fails.

import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { listSiteMaps, persistence, removeSiteMap, saveSiteMap, siteMapTile } from "./offlineMap.ts";
import { MAX_TILES, siteBounds, tilesFor } from "./siteMap.ts";

const SITE = { siteId: "quarry", name: "Quarry Road" };
const QUARRY: [number, number][] = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];

const pathOf = (key: string | Request) => (typeof key === "string" ? key : new URL(key.url).pathname);

class FakeCache {
  entries = new Map<string, Response>();
  failPuts = false;
  async match(key: string | Request) {
    return this.entries.get(pathOf(key))?.clone();
  }
  async put(key: string | Request, value: Response) {
    if (this.failPuts) throw new Error("QuotaExceededError");
    this.entries.set(pathOf(key), value);
  }
  async delete(key: string | Request) {
    return this.entries.delete(pathOf(key));
  }
  async keys() {
    return [...this.entries.keys()].map((path) => new Request(`http://planner.test${path}`));
  }
}

class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    let cache = this.caches.get(name);
    if (!cache) this.caches.set(name, (cache = new FakeCache()));
    return cache;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
}

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const realFetch = globalThis.fetch;
let store: FakeCaches;

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { persisted: async () => false, persist: async () => true } },
  });
  store = new FakeCaches();
  globalThis.caches = store as unknown as CacheStorage;
});

afterEach(() => {
  delete (globalThis as { caches?: CacheStorage }).caches;
  globalThis.fetch = realFetch;
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
});

test("a keep stores only the bounded tiles, and says how big they are", async () => {
  const kept = tilesFor(siteBounds(QUARRY)!);
  assert.ok(kept);
  globalThis.fetch = async () => new Response(new Uint8Array(10));

  const saved = await saveSiteMap(SITE, QUARRY);
  if (!saved.ok) throw new Error(saved.text);
  assert.equal(saved.map.tiles, kept.tiles.length);
  assert.ok(saved.map.tiles <= MAX_TILES);
  assert.equal(saved.map.bytes, kept.tiles.length * 10);
  assert.equal(saved.persistence, "granted");

  const cache = await caches.open("site-map-quarry");
  assert.equal((await cache.keys()).length, kept.tiles.length + 1, "every tile and the manifest");
  assert.deepEqual(await listSiteMaps(), [saved.map]);

  const [z, x, y] = kept.tiles[0];
  const tile = await siteMapTile({ url: `sitemap://quarry/${z}/${x}/${y}` });
  assert.equal(tile.data.byteLength, 10);
});

test("an update that cannot read the map leaves the Site's earlier map as it was", async () => {
  globalThis.fetch = async () => new Response(new Uint8Array(10));
  const first = await saveSiteMap(SITE, QUARRY);
  if (!first.ok) throw new Error(first.text);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: "This Site has no map region yet." }), { status: 404 });
  const again = await saveSiteMap(SITE, QUARRY);
  assert.deepEqual(again, { ok: false, text: "This Site has no map region yet." });

  assert.deepEqual(await listSiteMaps(), [first.map], "the earlier map is still listed");
  const cache = await caches.open("site-map-quarry");
  assert.equal((await cache.keys()).length, first.map.tiles + 1, "its tiles and manifest are untouched");
});

test("an update keeps exactly the new tile set, with no stale tiles", async () => {
  globalThis.fetch = async () => new Response(new Uint8Array(10));
  const wide = await saveSiteMap(SITE, QUARRY);
  if (!wide.ok) throw new Error(wide.text);

  const narrow: [number, number][] = [
    [37.803, -122.397],
    [37.807, -122.393],
  ];
  const kept = tilesFor(siteBounds(narrow)!);
  assert.ok(kept);
  const update = await saveSiteMap(SITE, narrow);
  if (!update.ok) throw new Error(update.text);

  const cache = await caches.open("site-map-quarry");
  assert.equal((await cache.keys()).length, kept.tiles.length + 1);
  assert.equal(update.map.tiles, kept.tiles.length);
  assert.notEqual(update.map.tiles, wide.map.tiles);
});

test("a storage write that fails says so and keeps the earlier map", async () => {
  globalThis.fetch = async () => new Response(new Uint8Array(10));
  const first = await saveSiteMap(SITE, QUARRY);
  if (!first.ok) throw new Error(first.text);

  (await store.open("site-map-quarry")).failPuts = true;
  const again = await saveSiteMap(SITE, QUARRY);
  if (again.ok) throw new Error("a failed write must not report success");
  assert.match(again.text, /^The map could not be stored: QuotaExceededError\.$/);

  assert.deepEqual(await listSiteMaps(), [first.map], "the earlier map is still listed");
});

test("removing a Site frees its cache", async () => {
  globalThis.fetch = async () => new Response(new Uint8Array(4));
  const saved = await saveSiteMap(SITE, QUARRY);
  assert.ok(saved.ok);

  await removeSiteMap(SITE.siteId);
  assert.deepEqual(await caches.keys(), []);
  assert.deepEqual(await listSiteMaps(), []);
});

test("the browser's answer on persistent storage is shown, granted or not", async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { persisted: async () => false, persist: async () => false } },
  });
  globalThis.fetch = async () => new Response(new Uint8Array(1));

  const saved = await saveSiteMap(SITE, QUARRY);
  if (!saved.ok) throw new Error(saved.text);
  assert.equal(saved.persistence, "not granted");
  assert.equal(await persistence(false), "not granted");
});
