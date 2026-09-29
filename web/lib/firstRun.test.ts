import { test } from "node:test";
import assert from "node:assert/strict";

import { firstRunDestination } from "./firstRun.ts";

// --- step table: plan §5 / M4 (narrow setView, wide unfold + focus) -------------

test("draw step switches to the map on narrow, stays put on wide", () => {
  assert.deepEqual(firstRunDestination("draw", true), { view: "map", focus: "draw" });
  assert.deepEqual(firstRunDestination("draw", false), { view: null, focus: "draw" });
});

test("site step switches to settings on narrow, stays put on wide", () => {
  assert.deepEqual(firstRunDestination("site", true), { view: "settings", focus: "site" });
  assert.deepEqual(firstRunDestination("site", false), { view: null, focus: "site" });
});

test("name step lands on the name field via settings on narrow, stays put on wide", () => {
  assert.deepEqual(firstRunDestination("name", true), { view: "settings", focus: "name" });
  assert.deepEqual(firstRunDestination("name", false), { view: null, focus: "name" });
});
