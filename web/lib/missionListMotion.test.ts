import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ENTER_MS,
  EXIT_MS,
  arrivingIds,
  flipDeltas,
  flownHoldMs,
  holdMs,
  leavingIds,
  settleFlown,
  visibleMissions,
} from "./missionListMotion.ts";

// --- timing: spec §9.1, mirrored from the component -----------------------------

test("the dissolve is 250ms and the blur-in is 150ms", () => {
  assert.equal(EXIT_MS, 250);
  assert.equal(ENTER_MS, 150);
});

test("the hold gives reduced motion a 150ms crossfade, 250ms otherwise", () => {
  assert.equal(holdMs(true), 150);
  assert.equal(holdMs(false), 250);
});

// --- the one filter -------------------------------------------------------------

test("visibleMissions hides archived rows unless they are asked for", () => {
  const rows = [
    { id: "a", archived: false },
    { id: "b", archived: true },
    { id: "c", archived: false },
  ];
  assert.deepEqual(visibleMissions(rows, false).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(visibleMissions(rows, true).map((r) => r.id), ["a", "b", "c"]);
});

// --- leave: what the incoming read would unmount --------------------------------

test("leavingIds names the rendered rows the incoming read would not show", () => {
  // Remove, Withdraw and Mark Flown all flip `archived`; the row is gone from
  // the filtered render in one read.
  assert.deepEqual(leavingIds(["a", "b", "c"], ["a"]), ["b", "c"]);
  assert.deepEqual(leavingIds(new Set(["a"]), new Set(["a", "b"])), []);
  assert.deepEqual(leavingIds([], ["a"]), []);
});

test("an identical read leaves nothing", () => {
  assert.deepEqual(leavingIds(["a", "b"], ["b", "a"]), []);
});

// --- arrive: ids new to the committed read --------------------------------------

test("arrivingIds primes on the first read and stays quiet on an unchanged one", () => {
  assert.deepEqual(arrivingIds(null, ["a", "b"]), []);
  assert.deepEqual(arrivingIds(new Set(["a", "b"]), ["a", "b"]), []);
});

test("arrivingIds names the ids that were not in the previous committed read", () => {
  assert.deepEqual(arrivingIds(new Set(["a"]), ["a", "b", "c"]), ["b", "c"]);
  assert.deepEqual(arrivingIds(new Set(["a", "b"]), ["b"]), []);
});

// --- FLIP: where the survivors were versus where they are now --------------------

test("flipDeltas measures the displacement of rows present in both reads", () => {
  const previous = new Map([
    ["a", 100],
    ["b", 200],
  ]);
  const next = new Map([
    ["a", 100], // unmoved
    ["b", 150], // moved up 50px
  ]);
  assert.deepEqual([...flipDeltas(previous, next)], [["b", 50]]);

  const down = new Map([
    ["a", 100],
    ["b", 260], // moved down 60px
  ]);
  assert.deepEqual([...flipDeltas(previous, down)], [["b", -60]]);
});

test("flipDeltas skips sub-half-pixel movement and ids missing from either read", () => {
  const previous = new Map([
    ["a", 100],
    ["b", 200],
    ["gone", 300],
  ]);
  const next = new Map([
    ["a", 100.4], // below half a pixel: no visible jump
    ["b", 200.5], // exactly half a pixel counts
    ["new", 10], // no previous offset: it arrived, it did not move
  ]);
  assert.deepEqual([...flipDeltas(previous, next)], [["b", -0.5]]);
});

// --- settle: the operator's own Mark Flown, and nothing else --------------------

test("settleFlown stays quiet without a marker or without a departure", () => {
  assert.equal(settleFlown(null, ["a"]), false);
  assert.equal(settleFlown({ id: "a", seq: 1 }, ["b"]), false);
  assert.equal(settleFlown({ id: "a", seq: 1 }, []), false);
});

test("settleFlown matches the operator's Mark Flown id among the leaving ids", () => {
  assert.equal(settleFlown({ id: "b", seq: 1 }, ["b", "c"]), true);
});

test("settleFlown replays when the same id is marked again with a bumped seq", () => {
  assert.equal(settleFlown({ id: "b", seq: 2 }, ["b"]), true);
});

// --- flown hold: settle 150ms + 900ms reading + existing dissolve ---------------

test("flownHoldMs totals settle, reading hold and dissolve from existing tokens", () => {
  assert.equal(flownHoldMs(false), 1300); // 150 settle + 900 reading + 250 dissolve
  assert.equal(flownHoldMs(true), 1050); // reading at once + 900 hold + 150 exit
});
