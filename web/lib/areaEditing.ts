// Area editing: everything a pointer on the map can do to an area, behind one
// pure step function. MapPane is its adapter; it owns MapLibre and React, this
// module owns the rules.
//
// The rules are transcribed from the map's former handler block, oddities and
// all: circle handles are idle-only while corner handles are live in every
// mode; a touch tap on a midpoint selects the corner the insert would have
// made; a circle drag clamps at one metre where an orbit clamp is five; a
// press on a handle never adds a corner, but a rectangle or circle first click
// ignores handles completely. Those are pinned by the named tests in
// areaEditing.test.ts and listed in the PR as preserved, not fixed.
//
// Placement modes (`set-home`, `set-poi`) are not drawing rules and stay in
// the adapter, which is why `set-poi` is not a branch here: the adapter turns
// that click into the page's placement callback directly.

import { circlePolygon, geodesicM } from "./mission";
import type { CircleShape, MissionType } from "./spec";

export type LL = [number, number];

/** The modes a map click can be in, as the planner names them. */
export type DrawMode =
  | "idle"
  | "draw-polygon"
  | "draw-rectangle"
  | "draw-circle"
  | "append-polygon"
  | "set-home"
  | "set-poi";

/** A mode in which a click on the map places part of a shape, rather than editing one. */
export const isDrawing = (m: DrawMode) =>
  m === "draw-polygon" || m === "draw-rectangle" || m === "draw-circle" || m === "append-polygon";

/** Screen pixels, for the one rule that is about fingers, not geography. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** What a MapLibre query found under the pointer, before any rule applies. */
export type HandleTarget =
  | { kind: "vertex"; index: number }
  | { kind: "midpoint"; edgeIndex: number }
  | { kind: "circle"; part: "center" | "radius" };

export type PressTarget = HandleTarget | { kind: "fill" };

/** The plan facts the rules read, passed fresh on every event. */
export interface EditContext {
  mode: DrawMode;
  aoi: LL[]; // the committed ring, [lat, lon], not closed
  shape: CircleShape | null; // the circle editing hint
  missionType: MissionType;
  orbitCenter: LL | null; // the orbit's subject, if placed
}

/** Everything the module needs to say about one operator action. */
export type EditEvent =
  /** A completed click: a mouse click, or the click a tap becomes. `target`
   *  comes from the visible handle layers only, as the click veto does today. */
  | { type: "click"; at: LL; target: HandleTarget | null }
  /** A press that may arm a drag. `point` is where the pointer went down. */
  | { type: "press"; at: LL; target: PressTarget; pointer: "mouse" | "touch"; point: ScreenPoint }
  /** Pointer movement. `pointer` decides the tap gate and the rubber band. */
  | { type: "move"; at: LL; pointer: "mouse" | "touch"; point: ScreenPoint }
  /** Mouse-up, or touch-end. */
  | { type: "release" }
  /** The browser cancelled the touch. */
  | { type: "touchcancel" }
  /** A double-click, which finishes a polygon draw. */
  | { type: "dblclick" }
  /** Escape or the Cancel button. */
  | { type: "cancel" }
  /** Enter or the Finish area button. */
  | { type: "finish" }
  /** The Remove corner button, or a right-click on a vertex. */
  | { type: "remove-corner"; index: number };

/** Gesture scratch: what is armed, not what is planned. */
export interface EditSession {
  drag:
    | { kind: "vertex"; index: number }
    | { kind: "circle"; part: "center" | "radius" }
    | { kind: "shape"; start: LL; aoi: LL[]; shape: CircleShape | null }
    | null;
  /** A first circle click's centre, until the radius click. */
  circleCenter: LL | null;
  /** Where a touch landed and what it armed, so release can tell tap from drag. */
  touch: { x: number; y: number; index: number; kind: "vertex" | "midpoint" | "circle" | "fill" } | null;
  touchMoved: boolean;
  /** A touch gesture in flight: a second finger cannot arm another drag. */
  dragLock: boolean;
  /** A rubber-band ring is painted into the source; the plan is not written. */
  previewing: boolean;
}

export const newSession = (): EditSession => ({
  drag: null,
  circleCenter: null,
  touch: null,
  touchMoved: false,
  dragLock: false,
  previewing: false,
});

/** What the adapter must do. One event emits zero or more, in order. */
export type EditEffect =
  | { kind: "area"; aoi: LL[]; shape: CircleShape | null } // onAoiChange
  | { kind: "poi"; center: LL } // onPoiChange
  | { kind: "orbit-radius"; radiusM: number } // onOrbitRadiusChange, already clamped
  | { kind: "hint"; text: string | null } // setDrawHint
  | { kind: "note"; text: string | null } // setDrawNote
  | { kind: "mode"; mode: DrawMode } // the adapter's changeMode
  | { kind: "select"; index: number | null } // onSelectedCornerChange
  | { kind: "preview"; aoi: LL[] }; // paint into the "aoi" source now

// ---------------------------------------------------------------------------
// The five ring edits and the tap threshold, absorbed with the module. An index
// that no longer matches the ring — a handle pressed while a render was in
// flight — leaves the area alone rather than punching a hole in it.
// ---------------------------------------------------------------------------

const inRing = (aoi: LL[], i: number) => Number.isInteger(i) && i >= 0 && i < aoi.length;

/** Move corner `i` to `p`. */
function moveCorner(aoi: LL[], i: number, p: LL): LL[] {
  if (!inRing(aoi, i)) return aoi;
  const next = aoi.slice();
  next[i] = p;
  return next;
}

/** Add a corner at `p` on the edge that runs from corner `edgeIndex` to the next. */
function insertCorner(aoi: LL[], edgeIndex: number, p: LL): LL[] {
  if (!inRing(aoi, edgeIndex)) return aoi;
  const next = aoi.slice();
  next.splice(edgeIndex + 1, 0, p);
  return next;
}

/** Remove corner `i`, unless that would leave fewer than the three a polygon needs. */
function removeCorner(aoi: LL[], i: number): LL[] {
  if (!inRing(aoi, i) || aoi.length <= 3) return aoi;
  return aoi.filter((_, j) => j !== i);
}

/**
 * Drop the stray corners a double-click leaves behind.
 *
 * A double-click delivers two ordinary click events before `dblclick` fires,
 * so the last one or two corners of a polygon finished that way were never
 * meant as corners: they are the double-click itself. Below four there is
 * nothing safe to trim, and the caller has to refuse the finish rather than
 * commit a shape that is not one.
 */
function trimDoubleClick(aoi: LL[]): LL[] {
  if (aoi.length >= 5) return aoi.slice(0, -2);
  if (aoi.length === 4) return aoi.slice(0, -1);
  return aoi;
}

const TAP_PX = 8;

/** Whether a touch gesture is a tap: Euclidean displacement within TAP_PX. */
function isTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= TAP_PX;
}

// ---------------------------------------------------------------------------
// The panel's own reads
// ---------------------------------------------------------------------------

/** Whether the Finish area button has a ring it can commit. */
export const canFinish = (aoi: LL[]): boolean => aoi.length >= 3;

/** Whether the Remove corner button has a corner it can drop. */
export const canRemoveCorner = (aoi: LL[], i: number | null): boolean =>
  i !== null && Number.isInteger(i) && i >= 0 && i < aoi.length && aoi.length > 3;

/** The panel's title for the mode it is showing. */
export function drawModeLabel(m: DrawMode): string {
  if (m === "draw-polygon") return "Drawing a polygon";
  if (m === "append-polygon") return "Adding corners to the area";
  if (m === "draw-rectangle") return "Drawing a rectangle";
  if (m === "draw-circle") return "Drawing a circle";
  return "";
}

/** What a click on the map does while the panel is up, in the operator's words. */
export function clickMeaning(mode: DrawMode, corners: number, hint: string | null): string {
  if (mode === "draw-polygon" || mode === "append-polygon") {
    return `Each click adds a corner — ${corners} so far, three needed.`;
  }
  if (mode === "draw-rectangle") {
    return corners === 0 ? "Click one corner." : (hint ?? "Click the opposite corner.");
  }
  return hint ?? "Click the centre, then drag out the radius.";
}

// ---------------------------------------------------------------------------
// The step function
// ---------------------------------------------------------------------------

/**
 * One operator action in, the next session and the effects to apply out.
 *
 * `session` and `context` are never mutated; refusals return the session as
 * it was, so nothing downstream can move on a gesture the rules rejected.
 * Effects are ordered the way the map's handlers applied them, so the
 * adapter can apply them blindly.
 */
export function step(
  session: EditSession,
  context: EditContext,
  event: EditEvent,
): { session: EditSession; effects: EditEffect[] } {
  const effects: EditEffect[] = [];
  const next: EditSession = { ...session };

  if (event.type === "press") {
    // A touch gesture in flight owns the map: a second finger is refused
    // outright, before it can arm anything.
    if (event.pointer === "touch" && session.dragLock) return { session, effects };
    const target = event.target;
    if (target.kind === "vertex") {
      next.drag = { kind: "vertex", index: target.index };
    } else if (target.kind === "midpoint") {
      // The insert happens on the press; the drag then owns the corner it
      // made, even when the stale edge meant no corner was made at all.
      effects.push({
        kind: "area",
        aoi: insertCorner(context.aoi, target.edgeIndex, event.at),
        shape: context.shape,
      });
      next.drag = { kind: "vertex", index: target.edgeIndex + 1 };
    } else if (target.kind === "circle") {
      if (context.mode !== "idle") return { session, effects };
      next.drag = { kind: "circle", part: target.part };
    } else {
      if (context.mode !== "idle" || context.missionType === "orbit" || context.aoi.length < 3) {
        return { session, effects };
      }
      next.drag = { kind: "shape", start: event.at, aoi: context.aoi, shape: context.shape };
    }
    if (event.pointer === "touch") {
      next.dragLock = true;
      next.touchMoved = false;
      next.touch =
        target.kind === "vertex"
          ? { x: event.point.x, y: event.point.y, index: target.index, kind: "vertex" }
          : target.kind === "midpoint"
            ? { x: event.point.x, y: event.point.y, index: target.edgeIndex + 1, kind: "midpoint" }
            : { x: event.point.x, y: event.point.y, index: -1, kind: target.kind };
    }
    return { session: next, effects };
  }

  if (event.type === "move") {
    // A finger that has barely moved is a tap: hold the corner still so
    // release can select it rather than shift it by a pixel.
    if (event.pointer === "touch" && session.touch && !session.touchMoved) {
      if (isTap(event.point.x - session.touch.x, event.point.y - session.touch.y)) {
        return { session, effects };
      }
      next.touchMoved = true;
    }

    // Rubber-bands, mouse only: a touch never paints one. Nothing is
    // committed here; the adapter paints the preview straight into the source
    // and leaves the committed ring alone.
    if (event.pointer === "mouse" && context.mode === "draw-rectangle" && context.aoi.length === 1) {
      const a = context.aoi[0];
      const rect: LL[] = [[a[0], a[1]], [a[0], event.at[1]], [event.at[0], event.at[1]], [event.at[0], a[1]]];
      next.previewing = true;
      effects.push(
        { kind: "preview", aoi: rect },
        {
          kind: "hint",
          text: `${Math.round(geodesicM(rect[0], rect[1]))} × ${Math.round(geodesicM(rect[1], rect[2]))} m — click to finish`,
        },
      );
      return { session: next, effects };
    }
    if (event.pointer === "mouse" && context.mode === "draw-circle" && session.circleCenter) {
      const r = Math.max(1, geodesicM(session.circleCenter, event.at));
      next.previewing = true;
      effects.push(
        { kind: "preview", aoi: circlePolygon(session.circleCenter, r) },
        { kind: "hint", text: `Radius ${Math.round(r)} m — click to finish` },
      );
      return { session: next, effects };
    }

    const drag = session.drag;
    if (!drag) return { session: next, effects };
    if (drag.kind === "circle") {
      if (context.missionType === "orbit" && context.orbitCenter) {
        if (drag.part === "center") effects.push({ kind: "poi", center: event.at });
        else {
          effects.push({
            kind: "orbit-radius",
            radiusM: Math.max(5, Math.round(geodesicM(context.orbitCenter, event.at))),
          });
        }
      } else if (context.shape) {
        const s = context.shape;
        if (drag.part === "center") {
          effects.push({ kind: "area", aoi: circlePolygon(event.at, s.radius_m), shape: { ...s, center: event.at } });
        } else {
          const radius_m = Math.max(1, geodesicM(s.center, event.at));
          effects.push({ kind: "area", aoi: circlePolygon(s.center, radius_m), shape: { ...s, radius_m } });
        }
      }
      return { session: next, effects };
    }
    if (drag.kind === "shape") {
      // The whole shape moves by the delta from where the press landed, not
      // cumulatively — the snapshot is what keeps a long drag from drifting.
      const dLat = event.at[0] - drag.start[0];
      const dLon = event.at[1] - drag.start[1];
      const moved = drag.aoi.map(([la, lo]) => [la + dLat, lo + dLon] as LL);
      effects.push({
        kind: "area",
        aoi: moved,
        shape: drag.shape
          ? { ...drag.shape, center: [drag.shape.center[0] + dLat, drag.shape.center[1] + dLon] }
          : null,
      });
      return { session: next, effects };
    }
    const moved = moveCorner(context.aoi, drag.index, event.at);
    if (moved !== context.aoi) effects.push({ kind: "area", aoi: moved, shape: context.shape });
    return { session: next, effects };
  }

  if (event.type === "release") {
    // The re-entry lock always clears, even when nothing was armed: a touch
    // refused up front must not lock touch out afterwards.
    next.dragLock = false;
    const touch = session.touch;
    if (touch && !session.touchMoved && (touch.kind === "vertex" || touch.kind === "midpoint")) {
      next.touch = null;
      next.touchMoved = false;
      next.drag = null;
      // Selecting is an edit-mode act: while drawing, a tap stays a no-op so
      // it can never arm the Remove button mid-draw.
      if (context.mode === "idle") effects.push({ kind: "select", index: touch.index });
      return { session: next, effects };
    }
    next.touch = null;
    next.touchMoved = false;
    next.drag = null;
    return { session: next, effects };
  }

  if (event.type === "touchcancel") {
    next.dragLock = false;
    next.touch = null;
    next.touchMoved = false;
    next.drag = null;
    return { session: next, effects };
  }

  if (event.type === "click") {
    if (context.mode === "draw-polygon" || context.mode === "append-polygon") {
      // A press on a handle is an edit of a corner that exists, never a new
      // one: without this a click on a handle drops a second corner on top.
      if (event.target) return { session, effects };
      effects.push(
        { kind: "note", text: null }, // the operator is acting on the refusal; stop repeating it
        { kind: "area", aoi: [...context.aoi, event.at], shape: null },
      );
      return { session, effects };
    }
    if (context.mode === "draw-rectangle") {
      if (context.aoi.length === 0) {
        effects.push(
          { kind: "area", aoi: [event.at], shape: null },
          { kind: "hint", text: "Drag out the opposite corner" },
        );
      } else {
        const [a] = context.aoi;
        next.previewing = false;
        effects.push(
          { kind: "hint", text: null },
          {
            kind: "area",
            aoi: [[a[0], a[1]], [a[0], event.at[1]], [event.at[0], event.at[1]], [event.at[0], a[1]]],
            shape: null,
          },
          { kind: "mode", mode: "idle" },
        );
      }
      return { session: next, effects };
    }
    if (context.mode === "draw-circle") {
      if (!session.circleCenter) {
        next.circleCenter = event.at;
        effects.push({ kind: "hint", text: "Drag out the radius" });
      } else {
        const center = session.circleCenter;
        const radius_m = Math.max(1, geodesicM(center, event.at));
        next.circleCenter = null;
        next.previewing = false;
        effects.push(
          { kind: "hint", text: null },
          { kind: "area", aoi: circlePolygon(center, radius_m), shape: { kind: "circle", center, radius_m } },
          { kind: "mode", mode: "idle" },
        );
      }
      return { session: next, effects };
    }
    // idle, set-home and set-poi do nothing here: placement is the adapter's.
    return { session, effects };
  }

  if (event.type === "dblclick") {
    if (context.mode !== "draw-polygon" && context.mode !== "append-polygon") return { session, effects };
    const pts = trimDoubleClick(context.aoi);
    if (pts.length < 3) {
      effects.push({ kind: "note", text: `An area needs three corners — ${3 - pts.length} to go.` });
      return { session, effects };
    }
    effects.push({ kind: "area", aoi: pts, shape: null }, { kind: "mode", mode: "idle" });
    return { session, effects };
  }

  if (event.type === "finish") {
    if (context.mode !== "draw-polygon" && context.mode !== "append-polygon") return { session, effects };
    if (context.aoi.length < 3) {
      effects.push({ kind: "note", text: `An area needs three corners — ${3 - context.aoi.length} to go.` });
      return { session, effects };
    }
    effects.push(
      { kind: "area", aoi: context.aoi, shape: context.shape },
      { kind: "mode", mode: "idle" },
    );
    return { session, effects };
  }

  if (event.type === "cancel") {
    // A shape mode cleared the area on the way in, so there is nothing to
    // keep; a corner-adding mode found an area already there, so it keeps it.
    if (
      (context.mode === "draw-polygon" || context.mode === "draw-rectangle" || context.mode === "draw-circle") &&
      context.aoi.length
    ) {
      effects.push({ kind: "area", aoi: [], shape: null });
    }
    // Always: the adapter's changeMode is what clears hint, note and
    // selection, and Escape in idle must reach it too.
    effects.push({ kind: "mode", mode: "idle" });
    return { session, effects };
  }

  // remove-corner: a circle removes by dragging its handles, not by corner.
  if (context.shape) return { session, effects };
  const nextAoi = removeCorner(context.aoi, event.index);
  if (nextAoi !== context.aoi) effects.push({ kind: "area", aoi: nextAoi, shape: context.shape });
  effects.push({ kind: "select", index: null });
  return { session, effects };
}
