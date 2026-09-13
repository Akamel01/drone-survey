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
  start_corner: string;
  home_distance_m: number;
  problems: string[];
}

const EMPTY: Preview = {
  points: [], lines: [], gsd_cm: 0, fwd_spacing_m: 0, side_spacing_m: 0,
  line_count: 0, photo_count: 0, capped_speed_ms: 0, path_length_m: 0,
  flight_time_min: 0, parts: 0, start_corner: "", home_distance_m: 0, problems: [],
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

export function preview(spec: MissionSpec): Preview {
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

  let rows: LL[][] = rowsXY.map((row) => row.map(([x, yy]) => toLL(...unrot(x, yy))));
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
  if (n > MAX_WAYPOINTS)
    problems.push(
      `one flight line holds ${n} waypoints, more than DJI Fly's ${MAX_WAYPOINTS}; ` +
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

  // Missions are cut at the end of a flight line, never mid-line, and the parts
  // are balanced rather than packed to the ceiling — so the count is not simply
  // photos over 200. This mirrors the writer's own splitting; dividing naively
  // under-reports the parts, which the end-to-end test caught.
  let linesPerPart = Math.ceil(rows.length / Math.max(1, Math.ceil(points.length / MAX_WAYPOINTS)));
  while (linesPerPart * n > MAX_WAYPOINTS && linesPerPart > 1) linesPerPart--;
  const parts = Math.ceil(rows.length / linesPerPart);

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
    parts,
    start_corner: points.length ? startCorner(points[0], points) : "",
    home_distance_m: homeDistance,
    problems,
  };
}
