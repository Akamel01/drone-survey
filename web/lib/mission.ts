// Grid geometry for the planner's preview.
//
// This mirrors scripts/mission/make_mission.py line for line, deliberately.
// The Python writer stays the single authority on the KMZ the aircraft reads;
// this exists only so the map and the figures respond to a slider without a
// round trip. The two are pinned together by scripts/mission/e2e_test.py, which
// fails the moment they disagree — a preview that lies about photo count or
// flight time is worse than no preview.

import type { MissionSpec } from "./spec";

// DJI Mini 5 Pro. The pixel count is the real 50 MP one, not the 12 MP figure
// drone-flightplan and Waypoint OS both assume.
const SENSOR_W_MM = 9.6;
const SENSOR_H_MM = 7.2;
const FOCAL_MM = 8.7;
const IMAGE_W_PX = 8192;

// Read off the Controller's own capability files, not from a library's constants.
const GIMBAL_RANGE: [number, number] = [-90, 55];
const SPEED_RANGE: [number, number] = [0.1, 15];
const MAX_WAYPOINTS = 200;
const ALTITUDE_CEILING_M = 120;

// Stopping at a photo point costs roughly one v/a of extra time per waypoint:
// decelerate to a halt, accelerate back. The figure is an estimate until the
// rehearsal measures it — both flight modes are flown and timed (ADR 0016), and
// this constant is what that measurement corrects.
const STOP_ACCEL_MS2 = 2.5;

// An orbit closer than this is inside the aircraft's own comfort zone around a
// structure, and fewer than this many photographs does not circle a subject.
const ORBIT_MIN_RADIUS_M = 5;
const ORBIT_MIN_PHOTOS = 6;

export interface Preview {
  points: [number, number][];
  lines: [number, number][][];
  gsd_cm: number;
  fwd_spacing_m: number;
  side_spacing_m: number;
  line_count: number;
  photo_count: number;
  capped_speed_ms: number;
  path_length_m: number;
  flight_time_min: number;
  parts: number;
  /** How long each part flies, so the operator can see what a battery buys. */
  part_minutes: number[];
  /** Ground covered by one photograph, for judging altitude against the view. */
  footprint_across_m: number;
  footprint_along_m: number;
  start_corner: string;
  home_distance_m: number;
  problems: string[];
}

const EMPTY: Preview = {
  points: [], lines: [], gsd_cm: 0, fwd_spacing_m: 0, side_spacing_m: 0,
  line_count: 0, photo_count: 0, capped_speed_ms: 0, path_length_m: 0,
  flight_time_min: 0, parts: 0, part_minutes: [], footprint_across_m: 0,
  footprint_along_m: 0, start_corner: "", home_distance_m: 0, problems: [],
};

type XY = [number, number];
type LL = [number, number];

/** Equirectangular metres about the centroid. Good to well under 0.1% over a Site. */
function localFrame(points: LL[]) {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const lon0 = points.reduce((a, p) => a + p[1], 0) / points.length;
  const r = Math.PI / 180;
  const mPerLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * r) + 1.175 * Math.cos(4 * lat0 * r);
  const mPerLon = 111412.84 * Math.cos(lat0 * r) - 93.5 * Math.cos(3 * lat0 * r);
  return {
    toXY: (lat: number, lon: number): XY => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat],
    toLL: (x: number, y: number): LL => [y / mPerLat + lat0, x / mPerLon + lon0],
  };
}

/** Haversine distance in metres, for verifying what we produced. */
export function geodesicM(a: LL, b: LL): number {
  const r = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

/** Ground footprint of one frame, and the ground distance one pixel covers. */
function footprint(altM: number) {
  const across = (SENSOR_W_MM / FOCAL_MM) * altM;
  const along = (SENSOR_H_MM / FOCAL_MM) * altM;
  return { across, along, gsdCm: (across / IMAGE_W_PX) * 100 };
}

function longestEdgeAngle(xy: XY[]): number {
  let best = -1;
  let ang = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d > best) { best = d; ang = Math.atan2(y2 - y1, x2 - x1); }
  }
  return ang;
}

function inside(pt: XY, poly: XY[]): boolean {
  const [x, y] = pt;
  let hit = false;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
}

/** 0 if the point is inside the polygon, otherwise the distance to its nearest edge. */
function polyDistance(pt: XY, poly: XY[]): number {
  if (inside(pt, poly)) return 0;
  const [x, y] = pt;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length2));
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

/**
 * How the writer cuts this into parts, and how long each one flies.
 *
 * The battery decides this before the 200-waypoint ceiling does. Each part
 * finishes by returning home so the battery can be swapped, and the next part
 * starts on the waypoint the last one ended at, so no coverage is lost at the
 * seam. Cuts land at the end of a flight line, never mid-line.
 */
function splitPlan(
  rows: LL[][],
  speed: number,
  stopPerPoint: number,
  batterySeconds: number,
  ceiling: number,
): { parts: number; minutes: number[] } {
  const cost = (i: number) => {
    const row = rows[i];
    let d = 0;
    for (let j = 0; j < row.length - 1; j++) d += geodesicM(row[j], row[j + 1]);
    // The leg from the end of the previous pass to the start of this one is
    // flown too, and on a long Site it is not a rounding error.
    if (i > 0) d += geodesicM(rows[i - 1][rows[i - 1].length - 1], row[0]);
    return d / speed + row.length * stopPerPoint;
  };

  const minutes: number[] = [];
  let parts = 1;
  let cur = 0;
  let curSeconds = 0;
  for (let i = 0; i < rows.length; i++) {
    const c = cost(i);
    const tooMany = cur > 0 && cur + rows[i].length > ceiling;
    const tooLong = cur > 0 && batterySeconds > 0 && curSeconds + c > batterySeconds;
    if (tooMany || tooLong) {
      minutes.push(curSeconds / 60);
      parts++;
      cur = 1; // the seam waypoint the next part starts on
      curSeconds = 0;
    }
    cur += rows[i].length;
    curSeconds += c;
  }
  minutes.push(curSeconds / 60);
  return { parts, minutes };
}

export function areaHectares(aoi: LL[]): number {
  if (aoi.length < 3) return 0;
  const { toXY } = localFrame(aoi);
  const p = aoi.map(([lat, lon]) => toXY(lat, lon));
  let twice = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2 / 10000;
}

function startCorner(first: LL, points: LL[]): string {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const lon0 = points.reduce((a, p) => a + p[1], 0) / points.length;
  return `${first[0] >= lat0 ? "north" : "south"}-${first[1] >= lon0 ? "east" : "west"}`;
}

/** A circle as a polygon, so a circular area needs no special case downstream. */
export function circlePolygon(center: LL, radiusM: number, segments = 64): LL[] {
  const { toLL } = localFrame([center]);
  const pts: LL[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push(toLL(Math.sin(a) * radiusM, Math.cos(a) * radiusM));
  }
  return pts;
}

// Looking down at the subject from this ring: negative is below horizontal.
// Mirrors make_mission.py:313-314, including the gimbal clamp.
export function orbitTilt(
  ringM: number,
  targetM: number,
  radiusM: number,
): { deg: number; clamped: boolean } {
  const raw = (-Math.atan2(ringM - targetM, radiusM) * 180) / Math.PI;
  const [lo, hi] = GIMBAL_RANGE;
  return { deg: Math.max(lo, Math.min(hi, raw)), clamped: raw < lo || raw > hi };
}

/**
 * An orbit around a subject: one ring of photo positions per altitude.
 *
 * Resolution is set by the slant range to the subject, not by altitude — the
 * camera is looking sideways and down, so a 40 m ring at 40 m up is 57 m from
 * what it is photographing. Using altitude alone would overstate the detail.
 */
function orbitPreview(spec: MissionSpec): Preview {
  const o = spec.orbit;
  const problems: string[] = [];
  if (!o.center) return { ...EMPTY, problems: ["no point of interest set"] };
  if (o.radius_m < ORBIT_MIN_RADIUS_M)
    problems.push(`radius ${o.radius_m} m is below the ${ORBIT_MIN_RADIUS_M} m minimum`);
  if (o.photos_per_ring < ORBIT_MIN_PHOTOS)
    problems.push(`${o.photos_per_ring} photos per ring is below the ${ORBIT_MIN_PHOTOS} needed to circle a subject`);
  const altitudes = o.altitudes_m.filter((a) => Number.isFinite(a));
  if (!altitudes.length) problems.push("no ring altitudes set");
  if (problems.length) return { ...EMPTY, problems };

  const { toLL } = localFrame([o.center]);
  const n = Math.round(o.photos_per_ring);
  const dir = o.clockwise ? 1 : -1;

  // Rings run from the lowest altitude up, each starting due north.
  const sorted = [...altitudes].sort((a, b) => a - b);
  const rings: LL[][] = sorted.map(() => []);
  sorted.forEach((_, r) => {
    for (let i = 0; i < n; i++) {
      const th = (dir * 2 * Math.PI * i) / n;
      rings[r].push(toLL(Math.sin(th) * o.radius_m, Math.cos(th) * o.radius_m));
    }
  });

  const arc = (2 * Math.PI * o.radius_m) / n;
  // The worst ring decides the figure we report: the one furthest from the subject.
  const slant = Math.max(...sorted.map((alt) => Math.hypot(o.radius_m, alt - o.target_height_m)));
  const across = (SENSOR_W_MM / FOCAL_MM) * slant;
  const gsdCm = (across / IMAGE_W_PX) * 100;

  const cap = spec.camera.interval_s > 0 ? arc / spec.camera.interval_s : Infinity;
  const speed = spec.flight.speed_ms > cap ? Math.round(cap * 100) / 100 : spec.flight.speed_ms;

  const [sLo, sHi] = SPEED_RANGE;
  if (speed < sLo || speed > sHi) problems.push(`speed ${speed} outside the aircraft's ${sLo}..${sHi}`);
  const highest = Math.max(...sorted);
  if (highest > ALTITUDE_CEILING_M)
    problems.push(`altitude ${highest} m is above the ${ALTITUDE_CEILING_M} m ceiling`);
  if (n > MAX_WAYPOINTS)
    problems.push(`one ring holds ${n} waypoints, more than DJI Fly's ${MAX_WAYPOINTS}`);
  // Overlap between neighbours on a ring, which is what a reconstruction needs.
  const overlap = (1 - arc / across) * 100;
  if (overlap < 60)
    problems.push(
      `only ${overlap.toFixed(0)}% overlap between neighbouring photos; ` +
        `raise photos per ring or the radius`,
    );

  const points: LL[] = rings.flat();
  let pathLength = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) pathLength += geodesicM(ring[i], ring[i + 1]);
    pathLength += geodesicM(ring[ring.length - 1], ring[0]); // closing the circle
  }
  // Climbing between rings is flown too, and it is not free.
  for (let i = 0; i < sorted.length - 1; i++) pathLength += Math.abs(sorted[i + 1] - sorted[i]);

  const stopPenalty = spec.flight.turn === "stop" ? (points.length * speed) / STOP_ACCEL_MS2 : 0;
  const stopPerPoint = spec.flight.turn === "stop" ? speed / STOP_ACCEL_MS2 : 0;
  const orbitSplit = splitPlan(
    rings, speed, stopPerPoint, spec.flight.battery_minutes * 60, MAX_WAYPOINTS,
  );

  return {
    points,
    lines: rings,
    gsd_cm: gsdCm,
    fwd_spacing_m: arc,
    side_spacing_m: sorted.length > 1 ? sorted[1] - sorted[0] : 0,
    line_count: rings.length,
    photo_count: points.length,
    capped_speed_ms: speed,
    path_length_m: pathLength,
    flight_time_min: (pathLength / speed + stopPenalty) / 60,
    parts: orbitSplit.parts,
    part_minutes: orbitSplit.minutes,
    footprint_across_m: across,
    footprint_along_m: (SENSOR_H_MM / FOCAL_MM) * slant,
    start_corner: `north, ${o.clockwise ? "clockwise" : "anticlockwise"}`,
    home_distance_m: spec.home
      ? Math.max(...points.map((p) => geodesicM(spec.home as LL, p)))
      : 0,
    problems,
  };
}

export function preview(spec: MissionSpec): Preview {
  return spec.mission_type === "orbit" ? orbitPreview(spec) : gridPreview(spec);
}

function gridPreview(spec: MissionSpec): Preview {
  const aoi = spec.aoi;
  if (aoi.length < 3) return { ...EMPTY };

  const f = spec.flight;
  const { toXY, toLL } = localFrame(aoi);
  const poly = aoi.map(([lat, lon]) => toXY(lat, lon));
  const { across, along, gsdCm } = footprint(f.altitude_m);
  const sideSpacing = across * (1 - f.side_overlap_pct / 100);
  const fwdSpacing = along * (1 - f.forward_overlap_pct / 100);

  // The camera, not the aircraft, sets the pace when a photo is due at every
  // waypoint: flying faster than spacing / interval drops photographs silently.
  const cap = spec.camera.interval_s > 0 ? fwdSpacing / spec.camera.interval_s : Infinity;
  const speed = f.speed_ms > cap ? Math.round(cap * 100) / 100 : f.speed_ms;

  const theta = longestEdgeAngle(poly);
  const c = Math.cos(-theta);
  const s = Math.sin(-theta);
  const rot: XY[] = poly.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const unrot = (x: number, y: number): XY => [
    x * Math.cos(theta) - y * Math.sin(theta),
    x * Math.sin(theta) + y * Math.cos(theta),
  ];

  const xs = rot.map((p) => p[0]);
  const ys = rot.map((p) => p[1]);
  // The grid is extended a full pass beyond the boundary: design.md section 5.
  const x0 = Math.min(...xs) - f.margin_passes * fwdSpacing;
  const x1 = Math.max(...xs) + f.margin_passes * fwdSpacing;
  const y0 = Math.min(...ys) - f.margin_passes * sideSpacing;
  const y1 = Math.max(...ys) + f.margin_passes * sideSpacing;

  // Step at exactly the intended spacing. Dividing each line into equal parts
  // instead stretches the gap between photos and quietly loses Overlap.
  const n = Math.max(2, Math.ceil((x1 - x0) / fwdSpacing) + 1);
  const rowsXY: XY[][] = [];
  let y = y0;
  let flip = false;
  // Guard against a degenerate spec producing an unbounded loop before the
  // problem list ever gets a chance to report it.
  while (y <= y1 + 1e-6 && rowsXY.length < 4000) {
    const row: XY[] = Array.from({ length: n }, (_, i) => [x0 + i * fwdSpacing, y] as XY);
    rowsXY.push(flip ? row.slice().reverse() : row);
    flip = !flip;
    y += sideSpacing;
  }

  // Keep only the positions that serve the area: inside it, or within the margin
  // of passes beyond its boundary. Without this the grid covers the area's
  // bounding box, which for any shape but a rectangle is mostly photographs of
  // somewhere else. Measured in passes, not metres, so the margin means the same
  // thing along a line as it does across one.
  const norm = (p: XY): XY => [p[0] / fwdSpacing, p[1] / sideSpacing];
  const npoly = rot.map(norm);
  const clipped = rowsXY
    .map((row) => row.filter((p) => polyDistance(norm(p), npoly) <= f.margin_passes + 1e-9))
    .filter((row) => row.length > 0);

  const rows: LL[][] = clipped.map((row) => row.map(([x, yy]) => toLL(...unrot(x, yy))));
  const points: LL[] = rows.flat();

  const problems: string[] = [];
  const [gLo, gHi] = GIMBAL_RANGE;
  if (f.gimbal_pitch_deg < gLo || f.gimbal_pitch_deg > gHi)
    problems.push(`gimbal ${f.gimbal_pitch_deg} outside the aircraft's ${gLo}..${gHi}`);
  const [sLo, sHi] = SPEED_RANGE;
  if (speed < sLo || speed > sHi)
    problems.push(`speed ${speed} outside the aircraft's ${sLo}..${sHi}`);
  if (f.altitude_m > ALTITUDE_CEILING_M)
    problems.push(`altitude ${f.altitude_m} m is above the ${ALTITUDE_CEILING_M} m ceiling`);
  const longest = rows.reduce((a, r) => Math.max(a, r.length), 0);
  if (longest > MAX_WAYPOINTS)
    problems.push(
      `one flight line holds ${longest} waypoints, more than DJI Fly's ${MAX_WAYPOINTS}; ` +
        `the area is too long to split at a line boundary`,
    );

  // Measured, not assumed: the along-line spacing as flown on the ellipsoid.
  const sameLine = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = geodesicM(points[i], points[i + 1]);
    if (d < sideSpacing * 0.9) sameLine.push(d);
  }
  sameLine.sort((a, b) => a - b);
  const measured = sameLine.length ? sameLine[Math.floor(sameLine.length / 2)] : NaN;
  const drift = (Math.abs(measured - fwdSpacing) / fwdSpacing) * 100;
  if (drift > 2)
    problems.push(
      `measured spacing ${measured.toFixed(2)} m differs from intended ` +
        `${fwdSpacing.toFixed(2)} m by ${drift.toFixed(1)}%`,
    );

  let pathLength = 0;
  for (let i = 0; i < points.length - 1; i++) pathLength += geodesicM(points[i], points[i + 1]);

  // Stopping at each point buys a still taken at rest and costs time per waypoint.
  const stopPenalty =
    f.turn === "stop" ? (points.length * speed) / STOP_ACCEL_MS2 : 0;
  const flightTime = (pathLength / speed + stopPenalty) / 60;

  // Mirrors the writer's own splitting: the battery decides this before the
  // waypoint ceiling does.
  const stopPerPoint = f.turn === "stop" ? speed / STOP_ACCEL_MS2 : 0;
  const split = rows.length
    ? splitPlan(rows, speed, stopPerPoint, f.battery_minutes * 60, MAX_WAYPOINTS)
    : { parts: 0, minutes: [] as number[] };

  let homeDistance = 0;
  if (spec.home) for (const p of points) homeDistance = Math.max(homeDistance, geodesicM(spec.home, p));

  return {
    points,
    lines: rows,
    gsd_cm: gsdCm,
    fwd_spacing_m: fwdSpacing,
    side_spacing_m: sideSpacing,
    line_count: rows.length,
    photo_count: points.length,
    capped_speed_ms: speed,
    path_length_m: pathLength,
    flight_time_min: flightTime,
    parts: split.parts,
    part_minutes: split.minutes,
    footprint_across_m: across,
    footprint_along_m: along,
    start_corner: points.length ? startCorner(points[0], points) : "",
    home_distance_m: homeDistance,
    problems,
  };
}
