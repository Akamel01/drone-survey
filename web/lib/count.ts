// Pure count-up easing: the CSS cubic-bezier solver the Summary figures animate
// with. No DOM here — CountUp drives the frame loop; this only maps time to a
// progress fraction.

/** Solve a CSS cubic-bezier(p1x,p1y,p2x,p2y) timing function as y = f(x).
 *  x is the elapsed fraction, clamped to [0,1]; f is the eased progress. */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): (x: number) => number {
  // Control-point polynomial (a,b are the two control values on one axis).
  const at = (a: number, b: number, t: number) =>
    3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  const slope = (a: number, b: number, t: number) =>
    3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson first; fall back to bisection when the derivative stalls.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = at(p1x, p2x, t) - x;
      if (Math.abs(err) < 1e-7) return at(p1y, p2y, t);
      const d = slope(p1x, p2x, t);
      if (Math.abs(d) < 1e-7) break;
      const next = t - err / d;
      if (next < 0 || next > 1) break;
      t = next;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = at(p1x, p2x, t);
      if (Math.abs(v - x) < 1e-9) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return at(p1y, p2y, t);
  };
}

/** Flight-time easing, matching --ease-count in globals.css:37. */
export const easeCount = cubicBezier(0.3, 0.1, 0.3, 1);

/** The figure shown at time t: from -> value, eased. */
export function countValue(value: number, t: number, from = 0): number {
  return from + (value - from) * easeCount(t);
}
