import { test } from "node:test";
import assert from "node:assert/strict";

import { editBehaviour, isLive } from "./model.ts";

test("editing is in place only before a Spec exists, and guarded once Loaded", () => {
  assert.equal(editBehaviour("planned"), "in-place");
  assert.equal(editBehaviour("dispatched"), "supersede");
  assert.equal(editBehaviour("collected"), "supersede");
  assert.equal(editBehaviour("loaded"), "guarded");
});

test("live states are the ones still worth acting on", () => {
  assert.equal(isLive("dispatched"), true);
  assert.equal(isLive("flown"), false);
  assert.equal(isLive("withdrawn"), false);
  assert.equal(isLive("superseded"), false);
});
