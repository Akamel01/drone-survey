import { test } from "node:test";
import assert from "node:assert/strict";

import {
  flickVelocity,
  isFlick,
  rubberBand,
  shouldDismissSheet,
  SHEET_DISMISS_PX,
  SHEET_FLICK_MIN_PX,
  SHEET_FLICK_VELOCITY,
  SHEET_RUBBER_LIMIT,
  SHEET_SAMPLE_CAP,
  SHEET_SETTLE_MS,
  SHEET_VELOCITY_WINDOW_MS,
} from "./sheet.ts";

// Drift guard: these values are frozen by decisions/log.md (#256) -- moving
// one without updating the harness recording is a bug, not a tune.
test("the gesture constants are frozen", () => {
  assert.equal(SHEET_DISMISS_PX, 120);
  assert.equal(SHEET_FLICK_MIN_PX, 16);
  assert.equal(SHEET_FLICK_VELOCITY, 0.5);
  assert.equal(SHEET_VELOCITY_WINDOW_MS, 100);
  assert.equal(SHEET_SAMPLE_CAP, 16);
  assert.equal(SHEET_RUBBER_LIMIT, 64);
  assert.equal(SHEET_SETTLE_MS, 400);
});

// The release velocity the flick branch uses: the last 100 ms of samples
// only (SHEET_VELOCITY_WINDOW_MS), signed px/ms, 0 when it cannot be measured.
test("flickVelocity measures the pointer's recent window", () => {
  assert.equal(flickVelocity([]), 0);
  assert.equal(flickVelocity([{ y: 0, t: 0 }]), 0);
  assert.equal(flickVelocity([{ y: 0, t: 5 }, { y: 40, t: 5 }]), 0); // dt = 0
  // A stale spike (older than the window) is discarded, leaving one sample.
  assert.equal(flickVelocity([{ y: 0, t: 0 }, { y: 500, t: 10 }, { y: 510, t: 310 }]), 0);
  // Only the last 100 ms counts: (112 - 100) / (300 - 200).
  assert.equal(flickVelocity([{ y: 0, t: 0 }, { y: 100, t: 200 }, { y: 112, t: 300 }]), 0.12);
  assert.equal(flickVelocity([{ y: 0, t: 0 }, { y: 24, t: 16 }, { y: 48, t: 32 }]), 1.5);
  assert.equal(flickVelocity([{ y: 0, t: 0 }, { y: -40, t: 20 }]), -2);
});

// Distance, flick and the guards, at the exact boundaries.
test("shouldDismissSheet: distance, flick, tap and upward guards", () => {
  assert.equal(shouldDismissSheet(119, 0), false);
  assert.equal(shouldDismissSheet(120, 0), true);
  assert.equal(shouldDismissSheet(16, 0.5), true); // exactly the flick floor
  assert.equal(shouldDismissSheet(15, 0.5), false); // under the min travel
  assert.equal(shouldDismissSheet(16, 0.49), false); // under the velocity floor
  assert.equal(shouldDismissSheet(8, 5), false); // a tap, whatever the speed
  assert.equal(shouldDismissSheet(-50, 5), false); // upward never dismisses
  // The harness's halved-threshold falsifier, restated at unit level: 64 px
  // at ~0.33 px/ms springs back at the real 0.5 threshold, dismisses at 0.25.
  assert.equal(shouldDismissSheet(64, 0.333), false);
  assert.equal(isFlick(64, 0.333, 16, 0.25), true);
});

// Upward travel is damped towards a -SHEET_RUBBER_LIMIT asymptote: strictly
// monotone, never reaching the limit, and stiffer than 1:1 (never below it).
test("rubberBand damps upward travel towards SHEET_RUBBER_LIMIT", () => {
  assert.equal(rubberBand(0), 0);
  assert.equal(rubberBand(50), 50);
  assert.equal(rubberBand(-64), -32);
  let previous = rubberBand(0);
  for (let dy = -1; dy >= -160; dy -= 1) {
    const v = rubberBand(dy);
    assert.ok(v > -SHEET_RUBBER_LIMIT, `rubberBand(${dy}) = ${v} at or below the limit`);
    assert.ok(v < previous, `not strictly monotone at dy = ${dy}`);
    previous = v;
  }
  // Approached from above: at t = 10000 the gap is 4096/(64+t) = 0.407 px.
  const asymptote = rubberBand(-10000);
  assert.ok(asymptote > -SHEET_RUBBER_LIMIT && asymptote < -SHEET_RUBBER_LIMIT + 0.5);
});

test("short of the threshold snaps back", () => {
  assert.equal(shouldDismissSheet(SHEET_DISMISS_PX - 1), false);
});

test("at or past the threshold dismisses", () => {
  assert.equal(shouldDismissSheet(SHEET_DISMISS_PX), true);
  assert.equal(shouldDismissSheet(SHEET_DISMISS_PX + 40), true);
});

test("dragging up, or not at all, never dismisses", () => {
  assert.equal(shouldDismissSheet(0), false);
  assert.equal(shouldDismissSheet(-50), false);
});
