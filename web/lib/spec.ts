// The Mission Spec: our own format, and the master copy of a Mission.
//
// ADR 0016 settles this — the KMZ is build output, never hand-edited, and flying
// a Site again regenerates it from the same inputs so repeat visits produce
// identical waypoints. This file is that input. It is written by the planner in
// the browser, carried to the Linux host, and turned into a KMZ by
// scripts/mission/make_mission.py, which stays the single authority on the file
// the aircraft actually reads.

export type TurnMode = "through" | "stop";

/** A nadir grid over an area, or an orbit around a subject. */
export type MissionType = "grid" | "orbit";

/**
 * An orbit around a point of interest — a tower, a building, a structure.
 *
 * This is the Capture that Gaussian Splatting actually wants: a nadir grid gives
 * almost no angular diversity, and no amount of overlap from straight above
 * substitutes for seeing a subject from around it. It is also the oblique pass
 * the capture standard requires alongside the grid (design.md section 5).
 *
 * The camera is aimed by the point of interest, not by a fixed tilt. ADR 0016
 * records why the two cannot be combined: a heading aimed at a point of interest
 * cancels the fixed gimbal angle, so `flight.gimbal_pitch_deg` is ignored for an
 * orbit and the framing follows the subject.
 */
export interface OrbitSpec {
  center: [number, number] | null; // the subject, [lat, lon]
  target_height_m: number; // how tall the subject is, above the take-off point
  radius_m: number; // horizontal distance from the subject
  altitudes_m: number[]; // one ring per altitude, so a tower is covered top to bottom
  photos_per_ring: number;
  clockwise: boolean;
}

/**
 * How a circular area was drawn, kept so the planner can offer a centre and a
 * radius to drag instead of sixty-four meaningless vertices. The `aoi` polygon
 * stays authoritative — the writer never reads this.
 */
export interface CircleShape {
  kind: "circle";
  center: [number, number];
  radius_m: number;
}

export interface MissionSpec {
  version: 1;
  mission_type: MissionType;
  site: string;
  date: string; // YYYY-MM-DD
  aoi: [number, number][]; // [lat, lon] corners, not closed. Grid missions only.
  shape?: CircleShape | null; // an editing hint, never an input to the geometry
  home: [number, number] | null; // take-off point; DJI Fly measures its distance limit from here
  flight: {
    altitude_m: number;
    forward_overlap_pct: number;
    side_overlap_pct: number;
    gimbal_pitch_deg: number; // grid only; an orbit is framed by its point of interest
    speed_ms: number;
    turn: TurnMode;
    margin_passes: number;
  };
  orbit: OrbitSpec;
  // Recorded, not flown. The mission file carries no camera settings beyond the
  // shutter action itself; these are set by hand on the Controller and kept here
  // so a Capture can be repeated under the same conditions.
  camera: {
    interval_s: number;
    shutter: string;
    iso: string;
    white_balance: string;
    white_balance_k: number | null;
    exposure_lock: boolean;
    format: string;
  };
}

export const DEFAULT_SPEC: MissionSpec = {
  version: 1,
  mission_type: "grid",
  site: "",
  // Deliberately empty, and filled in on the client after mount. Calling
  // new Date() here reads the clock when the module is evaluated, which for a
  // statically rendered page is *build* time: the server bakes the build date
  // into the HTML and the browser renders today's, so the two disagree.
  date: "",
  aoi: [],
  shape: null,
  home: null,
  flight: {
    altitude_m: 90,
    forward_overlap_pct: 85,
    side_overlap_pct: 75,
    gimbal_pitch_deg: -80,
    speed_ms: 5,
    turn: "through",
    margin_passes: 1,
  },
  orbit: {
    center: null,
    target_height_m: 0,
    radius_m: 40,
    altitudes_m: [40],
    photos_per_ring: 24,
    clockwise: true,
  },
  camera: {
    interval_s: 5,
    shutter: "1/1000",
    iso: "100",
    white_balance: "Sunny",
    white_balance_k: null,
    exposure_lock: true,
    format: "JPEG",
  },
};
