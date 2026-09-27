// Whole gestures through the area-editing module's one seam: every test plays
// plain events, exactly as MapPane's adapter does, and asserts on the effects
// and the next session. No map, no DOM, no React.
//
// The load-bearing quirks the refactor must not fix are pinned here, one named
// test each: idle-only circle handles (T7) versus always-live vertex drags
// (T3); a touch midpoint tap selecting edge + 1 (T28); right-click removal
// refusing when a circle is present (T44); the orbit clamp of five versus the
// circle clamp of one (T21/T17/T19/T20); the double-click trims (T39-T41); a
// press on a handle never adding a corner (T32); selection only in idle (T29);
// and the stale circle centre a context mode change must not clear (T51).
//
// A dozen cases here are the meanings of the deleted aoi.test.ts, recast
// through this interface (the corners land where dropped, the stale index
// changes nothing, the last edge appends, the ring never drops below three,
// the trim counts, and the tap threshold's exact boundary).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canFinish,
  canRemoveCorner,
  clickMeaning,
  drawModeLabel,
  newSession,
  step,
} from "./areaEditing.ts";
import type { DrawMode, EditContext, EditEffect, EditEvent, EditSession, LL } from "./areaEditing.ts";

// 0.001 degrees of latitude, on the sphere the module measures with.
const M_PER_DEG = 6371008.8 * (Math.PI / 180);

const P0: LL = [0, 0];
const TRIANGLE: LL[] = [
  [0, 0],
  [0, 0.001],
  [0.001, 0.001],
];
const SQUARE: LL[] = [
  [0, 0],
  [0, 0.001],
  [0.001, 0.001],
  [0.001, 0],
];
const FIVE: LL[] = [...SQUARE, [0.002, 0.002]];
const CIRCLE: NonNullable<EditContext["shape"]> = { kind: "circle", center: P0, radius_m: 10 };

const context = (over: Partial<EditContext> = {}): EditContext => ({
  mode: "idle",
  aoi: [],
  shape: null,
  missionType: "grid",
  orbitCenter: null,
  ...over,
});

const north = (from: LL, m: number): LL => [from[0] + m / M_PER_DEG, from[1]];

type Press = Extract<EditEvent, { type: "press" }>;
type Click = Extract<EditEvent, { type: "click" }>;
type AreaEffect = Extract<EditEffect, { kind: "area" }>;

const press = (
  at: LL,
  target: Press["target"],
  pointer: "mouse" | "touch" = "mouse",
  x = 0,
  y = 0,
): EditEvent => ({ type: "press", at, target, pointer, point: { x, y } });
const move = (at: LL, pointer: "mouse" | "touch" = "mouse", x = 0, y = 0): EditEvent => ({
  type: "move",
  at,
  pointer,
  point: { x, y },
});
const click = (at: LL, target: Click["target"] = null): EditEvent => ({ type: "click", at, target });
const RELEASE: EditEvent = { type: "release" };

const vertex = (index: number) => ({ kind: "vertex" as const, index });
const midpoint = (edgeIndex: number) => ({ kind: "midpoint" as const, edgeIndex });
const circle = (part: "center" | "radius") => ({ kind: "circle" as const, part });

/**
 * Play a whole gesture, folding the page's own effect application back into
 * the context: an `area` effect updates the committed ring before the next
 * event, exactly as setAoi does in plan/page.tsx. The passed context is never
 * mutated.
 */
const play = (events: EditEvent[], ctx: EditContext, from: EditSession = newSession()) => {
  let session = from;
  let contextNow = ctx;
  const effects: EditEffect[] = [];
  for (const event of events) {
    const result = step(session, contextNow, event);
    session = result.session;
    for (const effect of result.effects) {
      effects.push(effect);
      if (effect.kind === "area") contextNow = { ...contextNow, aoi: effect.aoi, shape: effect.shape };
      if (effect.kind === "poi") contextNow = { ...contextNow, orbitCenter: effect.center };
    }
  }
  return { session, effects, context: contextNow };
};

const areas = (effects: EditEffect[]): AreaEffect[] =>
  effects.filter((e): e is AreaEffect => e.kind === "area");
const kinds = (effects: EditEffect[]) => effects.map((e) => e.kind);

const meanLL = (pts: LL[]): LL => [
  pts.reduce((a, p) => a + p[0], 0) / pts.length,
  pts.reduce((a, p) => a + p[1], 0) / pts.length,
];
const closeTo = (a: LL, b: LL, tol = 1e-9) =>
  Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;

/** Rough metres between two nearby points, for radius assertions. */
const distM = (a: LL, b: LL) =>
  Math.hypot(
    (a[0] - b[0]) * M_PER_DEG,
    (a[1] - b[1]) * M_PER_DEG * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180),
  );

const shifted = (ring: LL[], dLat: number, dLon: number): LL[] =>
  ring.map(([la, lo]) => [la + dLat, lo + dLon]);

// ---------------------------------------------------------------------------
// Press: which press starts which drag
// ---------------------------------------------------------------------------

test("a vertex press arms a corner drag", () => {
  const { session, effects } = step(newSession(), context({ aoi: SQUARE }), press(SQUARE[1], vertex(1)));
  assert.deepEqual(session.drag, { kind: "vertex", index: 1 });
  assert.deepEqual(effects, []);
});

test("a vertex drag moves the corner it was pressed on", () => {
  const { effects } = play(
    [press(SQUARE[1], vertex(1)), move([0.002, 0.002]), RELEASE],
    context({ aoi: SQUARE }),
  );
  assert.deepEqual(areas(effects), [
    { kind: "area", aoi: [[0, 0], [0.002, 0.002], [0.001, 0.001], [0.001, 0]], shape: null },
  ]);
});

test("a vertex drag is live in every mode", () => {
  const modes: DrawMode[] = [
    "idle",
    "draw-polygon",
    "draw-rectangle",
    "draw-circle",
    "append-polygon",
    "set-home",
    "set-poi",
  ];
  for (const mode of modes) {
    const { session } = step(newSession(), context({ mode, aoi: SQUARE }), press(SQUARE[0], vertex(0)));
    assert.deepEqual(session.drag, { kind: "vertex", index: 0 }, mode);
  }
});

test("a midpoint press inserts a corner on the pressed edge and drags edge + 1", () => {
  const at: LL = [0.0005, 0.0015];
  const pressed = step(newSession(), context({ aoi: SQUARE }), press(at, midpoint(1)));
  assert.deepEqual(areas(pressed.effects), [
    {
      kind: "area",
      aoi: [[0, 0], [0, 0.001], at, [0.001, 0.001], [0.001, 0]],
      shape: null,
    },
  ]);
  assert.deepEqual(pressed.session.drag, { kind: "vertex", index: 2 });

  const moved = step(pressed.session, context({ aoi: areas(pressed.effects)[0].aoi }), move([0.0007, 0.0017]));
  const after = areas(moved.effects);
  assert.equal(after.length, 1);
  assert.equal(after[0].aoi.length, 5);
  assert.deepEqual(after[0].aoi[2], [0.0007, 0.0017]);
});

test("a midpoint drag continues from the press-time index", () => {
  const at: LL = [0.0005, 0];
  const pressed = step(newSession(), context({ aoi: SQUARE }), press(at, midpoint(SQUARE.length - 1)));
  assert.deepEqual(areas(pressed.effects), [{ kind: "area", aoi: [...SQUARE, at], shape: null }]);
  assert.deepEqual(pressed.session.drag, { kind: "vertex", index: 4 });

  const moved = step(pressed.session, context({ aoi: [...SQUARE, at] }), move([0.0006, 0.0001]));
  const after = areas(moved.effects);
  assert.equal(after.length, 1);
  assert.deepEqual(after[0].aoi, [...SQUARE, [0.0006, 0.0001]]);
});

test("a vertex press with an index off the end of the ring changes nothing", () => {
  for (const index of [4, -1]) {
    const pressed = step(newSession(), context({ aoi: SQUARE }), press(P0, vertex(index)));
    assert.deepEqual(pressed.session.drag, { kind: "vertex", index });
    const moved = step(pressed.session, context({ aoi: SQUARE }), move([0.002, 0.002]));
    assert.deepEqual(moved.effects, []);
    const released = step(moved.session, context({ aoi: SQUARE }), RELEASE);
    assert.deepEqual(released.effects, []);
    assert.deepEqual(SQUARE, [
      [0, 0],
      [0, 0.001],
      [0.001, 0.001],
      [0.001, 0],
    ]);
  }

  // A stale midpoint edge: the insert refuses, the drag is armed on the index
  // the insert would have made, and nothing moves.
  const stale = step(newSession(), context({ aoi: SQUARE }), press(P0, midpoint(4)));
  assert.deepEqual(areas(stale.effects), [{ kind: "area", aoi: SQUARE, shape: null }]);
  const staleMove = step(stale.session, context({ aoi: SQUARE }), move([0.002, 0.002]));
  assert.deepEqual(areas(staleMove.effects), []);
  assert.deepEqual(SQUARE, [
    [0, 0],
    [0, 0.001],
    [0.001, 0.001],
    [0.001, 0],
  ]);
});

test("a circle handle press is refused unless the mode is idle", () => {
  for (const mode of ["draw-polygon", "draw-rectangle", "draw-circle", "set-poi", "append-polygon"] as DrawMode[]) {
    const { session, effects } = step(newSession(), context({ mode }), press(P0, circle("center")));
    assert.deepEqual(session, newSession(), mode);
    assert.deepEqual(effects, []);
  }
});

test("a circle handle press in idle arms a centre or radius drag", () => {
  const centre = step(newSession(), context(), press(P0, circle("center")));
  assert.deepEqual(centre.session.drag, { kind: "circle", part: "center" });
  const radius = step(newSession(), context(), press(P0, circle("radius")));
  assert.deepEqual(radius.session.drag, { kind: "circle", part: "radius" });
});

test("a fill press is refused outside idle, in an orbit, and under three corners", () => {
  const refused = [
    context({ mode: "draw-polygon", aoi: SQUARE }),
    context({ aoi: SQUARE, missionType: "orbit" }),
    context({ aoi: TRIANGLE.slice(0, 2) }),
  ];
  for (const ctx of refused) {
    const { session, effects } = step(newSession(), ctx, press(P0, { kind: "fill" }));
    assert.deepEqual(session, newSession());
    assert.deepEqual(effects, []);
  }
  const armed = step(newSession(), context({ aoi: SQUARE }), press(P0, { kind: "fill" }));
  assert.deepEqual(armed.session.drag, { kind: "shape", start: P0, aoi: SQUARE, shape: null });
});

// ---------------------------------------------------------------------------
// Whole-shape drag: the press-time snapshot, not a cumulative walk
// ---------------------------------------------------------------------------

test("a shape drag moves every corner from the press-time snapshot", () => {
  const { effects } = play(
    [press(P0, { kind: "fill" }), move([0.001, 0.001]), move([0.0005, 0.0005])],
    context({ aoi: SQUARE }),
  );
  const round = areas(effects);
  assert.equal(round.length, 2);
  assert.deepEqual(round[0].aoi, shifted(SQUARE, 0.001, 0.001));
  assert.deepEqual(round[1].aoi, shifted(SQUARE, 0.0005, 0.0005));
});

test("a shape drag moves the shape centre with its corners", () => {
  const { effects } = play(
    [press(P0, { kind: "fill" }), move([0.001, 0.001])],
    context({ aoi: SQUARE, shape: CIRCLE }),
  );
  const [area] = areas(effects);
  assert.deepEqual(area.shape, { kind: "circle", center: [0.001, 0.001], radius_m: 10 });
});

// ---------------------------------------------------------------------------
// Rectangle: two clicks plus a rubber band
// ---------------------------------------------------------------------------

test("the first rectangle click sets the corner and asks for the opposite one", () => {
  const { session, effects } = step(
    newSession(),
    context({ mode: "draw-rectangle" }),
    click(P0),
  );
  assert.deepEqual(session, newSession());
  assert.deepEqual(effects, [
    { kind: "area", aoi: [P0], shape: null },
    { kind: "hint", text: "Drag out the opposite corner" },
  ]);
});

test("a mouse move rubber-bands the rectangle and prints its size", () => {
  const { session, effects } = play(
    [click(P0), move([0.001, 0.001])],
    context({ mode: "draw-rectangle" }),
  );
  assert.deepEqual(kinds(effects), ["area", "hint", "preview", "hint"]);
  const preview = effects.find((e) => e.kind === "preview");
  assert.deepEqual(preview, {
    kind: "preview",
    aoi: [[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]],
  });
  assert.deepEqual(effects[3], { kind: "hint", text: "111 × 111 m — click to finish" });
  assert.equal(areas(effects).length, 1); // the commit did not happen
  assert.equal(session.previewing, true);
});

test("the second rectangle click commits the ring and leaves the mode", () => {
  const { session, effects } = play(
    [click(P0), click([0.001, 0.001])],
    context({ mode: "draw-rectangle" }),
  );
  assert.deepEqual(areas(effects).at(-1), {
    kind: "area",
    aoi: [[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]],
    shape: null,
  });
  assert.deepEqual(effects.slice(-3), [
    { kind: "hint", text: null },
    { kind: "area", aoi: [[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]], shape: null },
    { kind: "mode", mode: "idle" },
  ]);
  assert.equal(session.previewing, false);
});

test("a rectangle first click on a handle still sets the corner", () => {
  const { effects } = step(
    newSession(),
    context({ mode: "draw-rectangle" }),
    click(P0, vertex(0)),
  );
  assert.deepEqual(effects, [
    { kind: "area", aoi: [P0], shape: null },
    { kind: "hint", text: "Drag out the opposite corner" },
  ]);
});

// ---------------------------------------------------------------------------
// Circle: centre click, then a radius click; clamps of one metre
// ---------------------------------------------------------------------------

test("the first circle click sets the centre and asks for the radius", () => {
  const { session, effects } = step(
    newSession(),
    context({ mode: "draw-circle" }),
    click(P0, vertex(0)),
  );
  assert.deepEqual(session.circleCenter, P0);
  assert.deepEqual(effects, [{ kind: "hint", text: "Drag out the radius" }]);
});

test("a mouse move previews the radius clamped to one metre", () => {
  const first = step(newSession(), context({ mode: "draw-circle" }), click(P0));
  const { session, effects } = step(
    first.session,
    context({ mode: "draw-circle" }),
    move(north(P0, 0.4)),
  );
  assert.deepEqual(kinds(effects), ["preview", "hint"]);
  const [preview] = effects;
  assert.equal(preview.kind === "preview" && preview.aoi.length, 64);
  if (preview.kind === "preview") {
    assert.ok(closeTo(meanLL(preview.aoi), P0, 1e-9));
    for (const p of preview.aoi) {
      const d = distM(p, P0);
      assert.ok(d > 0.99 && d < 1.01, `radius ${d}`);
    }
  }
  assert.deepEqual(effects[1], { kind: "hint", text: "Radius 1 m — click to finish" });
  assert.equal(session.previewing, true);
});

test("the second circle click commits the polygon with its shape hint", () => {
  const first = step(newSession(), context({ mode: "draw-circle" }), click(P0));
  const { session, effects } = step(
    first.session,
    context({ mode: "draw-circle" }),
    click(north(P0, 50), vertex(0)),
  );
  const [area] = areas(effects);
  const shape = area.shape;
  assert.ok(shape && shape.kind === "circle");
  assert.ok(closeTo(meanLL(area.aoi), P0, 1e-9));
  assert.ok(Math.abs(shape.radius_m - 50) < 1e-6);
  for (const p of area.aoi) assert.ok(Math.abs(distM(p, P0) - 50) < 0.5);
  assert.deepEqual(kinds(effects), ["hint", "area", "mode"]);
  assert.deepEqual(effects[2], { kind: "mode", mode: "idle" });
  assert.equal(session.circleCenter, null);
  assert.equal(session.previewing, false);
});

test("a circle click-finish at the centre clamps the radius to one metre", () => {
  const first = step(newSession(), context({ mode: "draw-circle" }), click(P0));
  const { effects } = step(first.session, context({ mode: "draw-circle" }), click(P0));
  const [area] = areas(effects);
  assert.ok(area.shape && area.shape.kind === "circle");
  assert.equal(area.shape.radius_m, 1);
});

test("a circle drag on the shape clamps the radius to one metre and moves the centre", () => {
  const moved = step(
    step(newSession(), context({ aoi: SQUARE, shape: CIRCLE }), press(P0, circle("center"))).session,
    context({ aoi: SQUARE, shape: CIRCLE }),
    move(north(P0, 5)),
  );
  const [area] = areas(moved.effects);
  const centre = north(P0, 5);
  assert.deepEqual(area.shape, { kind: "circle", center: centre, radius_m: 10 });
  assert.ok(closeTo(meanLL(area.aoi), centre, 1e-9));
  for (const p of area.aoi) assert.ok(Math.abs(distM(p, centre) - 10) < 0.1);

  const resized = step(
    step(newSession(), context({ aoi: SQUARE, shape: CIRCLE }), press(P0, circle("radius"))).session,
    context({ aoi: SQUARE, shape: CIRCLE }),
    move(north(P0, 0.2)),
  );
  const [clamped] = areas(resized.effects);
  assert.ok(clamped.shape && clamped.shape.kind === "circle");
  assert.equal(clamped.shape.radius_m, 1);
  assert.deepEqual(clamped.shape.center, P0);
});

// ---------------------------------------------------------------------------
// Orbit: the subject and the five-metre clamp
// ---------------------------------------------------------------------------

test("an orbit radius drag clamps to five metres and rounds", () => {
  const orbit = context({ missionType: "orbit", orbitCenter: P0 });
  const pressed = step(newSession(), orbit, press(P0, circle("radius")));
  const clamped = step(pressed.session, orbit, move(north(P0, 2)));
  assert.deepEqual(clamped.effects, [{ kind: "orbit-radius", radiusM: 5 }]);
  const rounded = step(pressed.session, orbit, move(north(P0, 7.6)));
  assert.deepEqual(rounded.effects, [{ kind: "orbit-radius", radiusM: 8 }]);
});

test("an orbit centre drag moves the subject and leaves the area untouched", () => {
  const orbit = context({ missionType: "orbit", orbitCenter: P0, aoi: SQUARE });
  const pressed = step(newSession(), orbit, press(P0, circle("center")));
  const { effects } = step(pressed.session, orbit, move(north(P0, 5)));
  assert.deepEqual(effects, [{ kind: "poi", center: north(P0, 5) }]);
  assert.deepEqual(areas(effects), []);
});

test("an orbit radius drag with no subject placed does nothing", () => {
  const orbit = context({ missionType: "orbit", orbitCenter: null });
  const pressed = step(newSession(), orbit, press(P0, circle("radius")));
  const { effects } = step(pressed.session, orbit, move(north(P0, 5)));
  assert.deepEqual(effects, []);
});

// ---------------------------------------------------------------------------
// Touch: the drag lock, the tap gate, and tap-select
// ---------------------------------------------------------------------------

test("a touch press locks out a second press until release", () => {
  const first = step(newSession(), context({ aoi: SQUARE }), press(SQUARE[0], vertex(0), "touch", 100, 100));
  assert.equal(first.session.dragLock, true);
  const second = step(first.session, context({ aoi: SQUARE }), press(SQUARE[1], vertex(1), "touch", 120, 120));
  assert.deepEqual(second.session, first.session);
  assert.deepEqual(second.effects, []);
  const released = step(second.session, context({ aoi: SQUARE }), RELEASE);
  assert.equal(released.session.dragLock, false);
  const third = step(released.session, context({ aoi: SQUARE }), press(SQUARE[1], vertex(1), "touch", 120, 120));
  assert.deepEqual(third.session.drag, { kind: "vertex", index: 1 });
});

test("a touch move within TAP_PX holds the corner still", () => {
  for (const [dx, dy] of [[8, 0], [5.65, 5.65]]) {
    const pressed = step(newSession(), context({ aoi: SQUARE }), press(SQUARE[0], vertex(0), "touch", 100, 100));
    const held = step(pressed.session, context({ aoi: SQUARE }), move(SQUARE[1], "touch", 100 + dx, 100 + dy));
    assert.deepEqual(held.effects, [], `${dx},${dy}`);
    assert.equal(held.session.touchMoved, false, `${dx},${dy}`);
    assert.deepEqual(held.session.drag, { kind: "vertex", index: 0 }, `${dx},${dy}`);
  }
});

test("a touch move past TAP_PX moves the corner", () => {
  const pressed = step(newSession(), context({ aoi: SQUARE }), press(SQUARE[0], vertex(0), "touch", 100, 100));
  const moved = step(
    pressed.session,
    context({ aoi: SQUARE }),
    move(SQUARE[1], "touch", 108.01, 100),
  );
  assert.deepEqual(areas(moved.effects), [
    { kind: "area", aoi: [SQUARE[1], SQUARE[1], SQUARE[2], SQUARE[3]], shape: null },
  ]);
  assert.equal(moved.session.touchMoved, true);
});

test("a tap on a vertex selects it on release", () => {
  const pressed = step(newSession(), context({ aoi: SQUARE }), press(SQUARE[1], vertex(1), "touch", 100, 100));
  const { session, effects } = step(pressed.session, context({ aoi: SQUARE }), RELEASE);
  assert.deepEqual(effects, [{ kind: "select", index: 1 }]);
  assert.equal(session.drag, null);
});

test("a tap on a midpoint selects edge + 1", () => {
  const at: LL = [0.0005, 0.0015];
  const pressed = step(newSession(), context({ aoi: SQUARE }), press(at, midpoint(2), "touch", 100, 100));
  const { effects } = step(pressed.session, context({ aoi: SQUARE }), RELEASE);
  assert.deepEqual(effects, [{ kind: "select", index: 3 }]);
});

test("a tap while drawing selects nothing", () => {
  const ctx = context({ mode: "draw-polygon", aoi: SQUARE });
  const pressed = step(newSession(), ctx, press(SQUARE[1], vertex(1), "touch", 100, 100));
  const { session, effects } = step(pressed.session, ctx, RELEASE);
  assert.deepEqual(effects, []);
  assert.equal(session.drag, null);
});

test("a tap on the fill or a circle handle never selects", () => {
  const fill = step(newSession(), context({ aoi: SQUARE }), press(P0, { kind: "fill" }, "touch", 100, 100));
  assert.deepEqual(step(fill.session, context({ aoi: SQUARE }), RELEASE).effects, []);
  const handle = step(newSession(), context({ aoi: SQUARE, shape: CIRCLE }), press(P0, circle("center"), "touch", 100, 100));
  assert.deepEqual(step(handle.session, context({ aoi: SQUARE, shape: CIRCLE }), RELEASE).effects, []);
});

test("touchcancel drops the gesture without selecting", () => {
  const pressed = step(newSession(), context({ aoi: SQUARE }), press(SQUARE[0], vertex(0), "touch", 100, 100));
  const moved = step(pressed.session, context({ aoi: SQUARE }), move(SQUARE[1], "touch", 130, 100));
  const { session, effects } = step(moved.session, context({ aoi: SQUARE }), { type: "touchcancel" });
  assert.deepEqual(effects, []);
  assert.deepEqual(session, newSession());
});

// ---------------------------------------------------------------------------
// Clicks, presses on handles, and the polygon append path
// ---------------------------------------------------------------------------

test("a click on a handle adds no corner while drawing and a click on the fill does", () => {
  const ctx = context({ mode: "draw-polygon", aoi: SQUARE });
  const onHandle = step(newSession(), ctx, click(P0, vertex(0)));
  assert.deepEqual(onHandle.effects, []);
  const onFill = step(newSession(), ctx, click(P0, null));
  assert.deepEqual(onFill.effects, [
    { kind: "note", text: null },
    { kind: "area", aoi: [...SQUARE, P0], shape: null },
  ]);
});

test("Escape clears a half-drawn shape ring and returns to idle", () => {
  const half = context({ mode: "draw-polygon", aoi: TRIANGLE.slice(0, 2) });
  const cancelled = step(newSession(), half, { type: "cancel" });
  assert.deepEqual(cancelled.effects, [
    { kind: "area", aoi: [], shape: null },
    { kind: "mode", mode: "idle" },
  ]);
  // Escape in idle still emits the mode, so the adapter's changeMode clears the
  // selection: the effect must not be optimised away.
  const idle = step(newSession(), context({ aoi: TRIANGLE }), { type: "cancel" });
  assert.deepEqual(idle.effects, [{ kind: "mode", mode: "idle" }]);
});

test("Escape during append keeps the ring", () => {
  const { effects } = step(newSession(), context({ mode: "append-polygon", aoi: SQUARE }), { type: "cancel" });
  assert.deepEqual(effects, [{ kind: "mode", mode: "idle" }]);
});

test("Enter refuses under three corners with the exact note", () => {
  const { session, effects } = step(
    newSession(),
    context({ mode: "draw-polygon", aoi: TRIANGLE.slice(0, 2) }),
    { type: "finish" },
  );
  assert.deepEqual(effects, [{ kind: "note", text: "An area needs three corners — 1 to go." }]);
  assert.deepEqual(session, newSession());
});

test("Enter finishes a three-corner ring and leaves the mode", () => {
  const { effects } = step(newSession(), context({ mode: "draw-polygon", aoi: TRIANGLE }), { type: "finish" });
  assert.deepEqual(effects, [
    { kind: "area", aoi: TRIANGLE, shape: null },
    { kind: "mode", mode: "idle" },
  ]);
});

test("Enter in a rectangle or circle mode does nothing", () => {
  for (const mode of ["draw-rectangle", "draw-circle"] as DrawMode[]) {
    const { effects } = step(newSession(), context({ mode, aoi: [P0] }), { type: "finish" });
    assert.deepEqual(effects, [], mode);
  }
});

test("a click in idle does nothing", () => {
  const { session, effects } = step(newSession(), context({ aoi: SQUARE }), click(P0));
  assert.deepEqual(effects, []);
  assert.deepEqual(session, newSession());
});

// ---------------------------------------------------------------------------
// Double-click finishing: the trims
// ---------------------------------------------------------------------------

test("a double-click trims two corners from five", () => {
  const { effects } = step(newSession(), context({ mode: "draw-polygon", aoi: FIVE }), { type: "dblclick" });
  assert.deepEqual(effects, [
    { kind: "area", aoi: FIVE.slice(0, 3), shape: null },
    { kind: "mode", mode: "idle" },
  ]);
});

test("a double-click trims one corner from four", () => {
  const { effects } = step(newSession(), context({ mode: "draw-polygon", aoi: SQUARE }), { type: "dblclick" });
  assert.deepEqual(effects, [
    { kind: "area", aoi: FIVE.slice(0, 3), shape: null },
    { kind: "mode", mode: "idle" },
  ]);
});

test("a double-click under three refuses with the trimmed count", () => {
  // Three corners is exactly where trimming stops: there is nothing to give
  // back, so the ring is left untrimmed and finishes whole.
  const three = step(newSession(), context({ mode: "draw-polygon", aoi: TRIANGLE }), { type: "dblclick" });
  assert.deepEqual(three.effects, [
    { kind: "area", aoi: TRIANGLE, shape: null },
    { kind: "mode", mode: "idle" },
  ]);
  const two = step(newSession(), context({ mode: "draw-polygon", aoi: TRIANGLE.slice(0, 2) }), {
    type: "dblclick",
  });
  assert.deepEqual(two.effects, [{ kind: "note", text: "An area needs three corners — 1 to go." }]);
  assert.deepEqual(areas(two.effects), []);
  const empty = step(newSession(), context({ mode: "draw-polygon", aoi: [] }), { type: "dblclick" });
  assert.deepEqual(empty.effects, [{ kind: "note", text: "An area needs three corners — 3 to go." }]);
  assert.deepEqual(areas(empty.effects), []);
});

// ---------------------------------------------------------------------------
// Removing a corner
// ---------------------------------------------------------------------------

test("a remove-corner event drops the exact corner selected by tap and clears the selection", () => {
  const at: LL = [0.0005, 0.0015];
  const tapped = play(
    [press(at, midpoint(0), "touch", 100, 100), RELEASE],
    context({ aoi: SQUARE }),
  );
  assert.deepEqual(tapped.effects.at(-1), { kind: "select", index: 1 });
  const removed = step(tapped.session, tapped.context, { type: "remove-corner", index: 1 });
  assert.deepEqual(removed.effects, [
    { kind: "area", aoi: [[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0]], shape: null },
    { kind: "select", index: null },
  ]);
});

test("a remove-corner under three corners changes nothing", () => {
  const { effects } = step(newSession(), context({ aoi: TRIANGLE }), { type: "remove-corner", index: 0 });
  assert.deepEqual(areas(effects), []);
  assert.deepEqual(TRIANGLE, [
    [0, 0],
    [0, 0.001],
    [0.001, 0.001],
  ]);
});

test("a remove-corner with a circle shape changes nothing", () => {
  const { session, effects } = step(
    newSession(),
    context({ aoi: SQUARE, shape: CIRCLE }),
    { type: "remove-corner", index: 0 },
  );
  assert.deepEqual(effects, []);
  assert.deepEqual(session, newSession());
});

test("a context-menu removal is the same rule as the Remove corner event", () => {
  // Both entry points send the same event, and the rule emits nothing but the
  // new ring plus the selection clear: never a note, never a mode change.
  const { effects } = step(newSession(), context({ aoi: SQUARE }), { type: "remove-corner", index: 0 });
  assert.deepEqual(effects, [
    { kind: "area", aoi: [[0, 0.001], [0.001, 0.001], [0.001, 0]], shape: null },
    { kind: "select", index: null },
  ]);
});

// ---------------------------------------------------------------------------
// The panel's predicate and copy functions
// ---------------------------------------------------------------------------

test("canFinish is false under three corners and true at three", () => {
  assert.equal(canFinish([]), false);
  assert.equal(canFinish(TRIANGLE.slice(0, 2)), false);
  assert.equal(canFinish(TRIANGLE), true);
  assert.equal(canFinish(SQUARE), true);
});

test("canRemoveCorner is false under three, false for a stale index, true otherwise", () => {
  assert.equal(canRemoveCorner(SQUARE, null), false);
  assert.equal(canRemoveCorner(TRIANGLE, 0), false);
  assert.equal(canRemoveCorner(SQUARE, 4), false);
  assert.equal(canRemoveCorner(SQUARE, -1), false);
  assert.equal(canRemoveCorner(SQUARE, 0), true);
  assert.equal(canRemoveCorner(SQUARE, 3), true);
});

test("drawModeLabel returns the panel titles unchanged", () => {
  assert.equal(drawModeLabel("draw-polygon"), "Drawing a polygon");
  assert.equal(drawModeLabel("append-polygon"), "Adding corners to the area");
  assert.equal(drawModeLabel("draw-rectangle"), "Drawing a rectangle");
  assert.equal(drawModeLabel("draw-circle"), "Drawing a circle");
  assert.equal(drawModeLabel("idle"), "");
  assert.equal(drawModeLabel("set-home"), "");
  assert.equal(drawModeLabel("set-poi"), "");
});

test("clickMeaning returns the panel copy unchanged", () => {
  assert.equal(
    clickMeaning("draw-polygon", 2, null),
    "Each click adds a corner — 2 so far, three needed.",
  );
  assert.equal(
    clickMeaning("append-polygon", 0, null),
    "Each click adds a corner — 0 so far, three needed.",
  );
  assert.equal(clickMeaning("draw-rectangle", 0, null), "Click one corner.");
  assert.equal(
    clickMeaning("draw-rectangle", 1, "Drag out the opposite corner"),
    "Drag out the opposite corner",
  );
  assert.equal(clickMeaning("draw-rectangle", 1, null), "Click the opposite corner.");
  assert.equal(clickMeaning("draw-circle", 0, "Drag out the radius"), "Drag out the radius");
  assert.equal(clickMeaning("draw-circle", 0, null), "Click the centre, then drag out the radius.");
  assert.equal(clickMeaning("idle", 0, null), "Click the centre, then drag out the radius.");
});

// ---------------------------------------------------------------------------
// Purity and the stale circle centre
// ---------------------------------------------------------------------------

test("the context ring and shape are never mutated", () => {
  const ctx = context({ aoi: SQUARE.map((p) => [...p]) as LL[], shape: { ...CIRCLE } });
  const snapshot = structuredClone(ctx);
  play([press(P0, { kind: "fill" }), move([0.001, 0.001])], ctx);
  play([press(P0, midpoint(1)), move(P0)], ctx);
  play([click(P0, null), { type: "cancel" }], { ...ctx, mode: "draw-polygon" });
  step(newSession(), { ...ctx, mode: "draw-circle" }, click(P0));
  step(newSession(), ctx, { type: "remove-corner", index: 0 });
  step(newSession(), ctx, { type: "dblclick" });
  assert.deepEqual(ctx, snapshot);
});

test("a context mode change does not clear the pending circle centre", () => {
  const draw = context({ mode: "draw-circle" });
  const first = step(newSession(), draw, click(P0));
  assert.deepEqual(first.session.circleCenter, P0);
  // The mode leaves and comes back as plain context -- never as an event, the
  // way a Sidebar pick reaches the map.
  const away = { ...draw, mode: "idle" as DrawMode };
  const parked = step(first.session, away, move(north(P0, 30)));
  assert.deepEqual(parked.session.circleCenter, P0);
  const back = step(parked.session, draw, move(north(P0, 5)));
  const [preview] = back.effects;
  assert.equal(preview.kind, "preview");
  if (preview.kind === "preview") {
    assert.ok(closeTo(meanLL(preview.aoi), P0, 1e-9));
  }
  assert.deepEqual(back.effects[1], { kind: "hint", text: "Radius 5 m — click to finish" });
});
