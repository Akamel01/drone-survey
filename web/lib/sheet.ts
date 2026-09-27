// The one custom gesture a sheet has: drag its grab handle down far enough
// and it dismisses; a fast downward flick dismisses even when it travels
// less; upward movement resists and springs back. Pure so the pointer
// handlers in Sheet.tsx, this file's tests and the harness share one
// definition (the pattern `isTap` in aoi.ts already uses for the map's
// touch handling).

export interface DragSample {
  /** clientY, px. */
  y: number;
  /** event.timeStamp, ms. */
  t: number;
}

/** Below this the sheet snaps back; at or past it, releasing dismisses
 *  (spec § 11 "drag down", docs/ui-theme/spec.md:455-456). */
export const SHEET_DISMISS_PX = 120;

/** Minimum net downward travel for the velocity branch: 2 × TAP_PX
 *  (aoi.ts) so a tap's jitter can never read as a flick. Ticket-only (#256). */
export const SHEET_FLICK_MIN_PX = 16;

/** The flick threshold, px/ms downward (500 px/s). Ticket-only (#256). */
export const SHEET_FLICK_VELOCITY = 0.5;

/** The pointer's "recent movement" at release, ms. Ticket-only (#256). */
export const SHEET_VELOCITY_WINDOW_MS = 100;

/** The drag handler keeps at most this many samples (memory guard).
 *  Ticket-only (#256). */
export const SHEET_SAMPLE_CAP = 16;

/** px asymptote of the upward damping (O4). Ticket-only (#256). */
export const SHEET_RUBBER_LIMIT = 64;

/** Settle-class cleanup backstop, ms (O5); the spring-back itself runs over
 *  --dur-base / --ease-out (spec.md:410, 413). Ticket-only (#256). */
export const SHEET_SETTLE_MS = 400;

/** The release velocity of a drag: measured over the last
 *  SHEET_VELOCITY_WINDOW_MS only, so an old yank before a slow finish does
 *  not read as a flick. Signed: positive = downward. `0` when fewer than two
 *  samples or no time passed. No `getCoalescedEvents` -- the rAF-paced
 *  samples are plenty at this granularity (D1, #256). */
export function flickVelocity(samples: DragSample[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (last.t - samples[i].t > SHEET_VELOCITY_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return (last.y - first.y) / dt;
}

/** `dy` is the pointer's downward travel from where the drag started. An
 *  upward drag (`dy < 0`) is damped towards -SHEET_RUBBER_LIMIT: it keeps
 *  following the finger, at a fraction of it, and never overshoots the limit
 *  (spec.md:380-381 "no overshoot"; the formula and the limit are
 *  ticket-only, O4, #256). */
export function rubberBand(dy: number): number {
  if (dy >= 0) return dy;
  const t = -dy;
  return -SHEET_RUBBER_LIMIT * (1 - 1 / (1 + t / SHEET_RUBBER_LIMIT));
}

/** A flick is a real downward travel (`dy >= minPx`) moving at least
 *  `minVelocity` px/ms. The thresholds are arguments only so tests and the
 *  harness can run deliberately wrong values against it; the caller passes
 *  the constants above. */
export function isFlick(dy: number, velocity: number, minPx: number, minVelocity: number): boolean {
  return dy >= minPx && velocity >= minVelocity;
}

/** Dismiss when the drag went far enough, or when it was a flick. `velocity`
 *  defaults to 0 so distance-only callers read unchanged. The 120 px
 *  threshold itself is unchanged (#256). */
export function shouldDismissSheet(dy: number, velocity = 0): boolean {
  return dy >= SHEET_DISMISS_PX || isFlick(dy, velocity, SHEET_FLICK_MIN_PX, SHEET_FLICK_VELOCITY);
}
