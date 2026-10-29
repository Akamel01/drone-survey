import { test } from "node:test";
import assert from "node:assert/strict";

import { regionsAction, regionsView } from "./mapRegionsApi.ts";
import type { CutRequest, Region } from "./mapRegions.ts";
import type { MapStore } from "./mapStore.ts";

// PWA-2 (#315): the Developer section's add and remove, against a fake store.

const bc: Region = { id: "bc", name: "British Columbia", bbox: [-139, 48.3, -114, 60], maxzoom: 15, key: "specs/_maps/bc-20261003.pmtiles", bytes: 2_000_000_000, cut_at: "2026-10-03T00:00:00Z", build: "20261003" };

function fakeStore() {
  const state = { regions: [bc], requests: [] as CutRequest[], deleted: true };
  const store: MapStore = {
    manifest: async () => ({ regions: state.regions }),
    requests: async () => state.requests,
    queue: async (r) => void (state.requests = [...state.requests.filter((q) => q.id !== r.id), r]),
    remove: async (id) => {
      if (!state.regions.some((r) => r.id === id)) return null;
      state.regions = state.regions.filter((r) => r.id !== id);
      return { archiveDeleted: state.deleted };
    },
  };
  return { state, store };
}

test("the view is the regions and the cuts waiting", async () => {
  const { store } = fakeStore();
  assert.deepEqual(await regionsView(store), { regions: [bc], requests: [] });
});

test("adding a catalogue region queues one request, by that account, and asking again replaces it", async () => {
  const { store, state } = fakeStore();
  const first = await regionsAction(store, { action: "add", id: "ab" }, "owner@example.com");
  assert.equal(first.status, 200);
  await regionsAction(store, { action: "add", id: "ab" }, "owner@example.com");
  assert.equal(state.requests.length, 1);
  assert.deepEqual([state.requests[0].id, state.requests[0].status, state.requests[0].requested_by], ["ab", "queued", "owner@example.com"]);
  assert.deepEqual((first.body as { requests: CutRequest[] }).requests.map((r) => r.id), ["ab"]);
});

test("a region outside the catalogue, a bad id and an unknown action are refused", async () => {
  const { store, state } = fakeStore();
  assert.equal((await regionsAction(store, { action: "add", id: "atlantis" }, "x")).status, 400);
  assert.equal((await regionsAction(store, { action: "remove", id: "../bc" }, "x")).status, 400);
  assert.equal((await regionsAction(store, { action: "format" }, "x")).status, 400);
  assert.equal((await regionsAction(store, null, "x")).status, 400);
  assert.deepEqual(state.requests, []);
  assert.equal(state.regions.length, 1);
});

test("removing a region drops it; one that is not there is a 404", async () => {
  const { store } = fakeStore();
  const gone = await regionsAction(store, { action: "remove", id: "bc" }, "x");
  assert.equal(gone.status, 200);
  assert.deepEqual((gone.body as { regions: Region[] }).regions, []);
  assert.equal((await regionsAction(store, { action: "remove", id: "bc" }, "x")).status, 404);
});
