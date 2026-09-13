// The Mission Spec: our own format, and the master copy of a Mission.
//
// ADR 0016 settles this — the KMZ is build output, never hand-edited, and flying
// a Site again regenerates it from the same inputs so repeat visits produce
// identical waypoints. This file is that input. It is written by the planner in
// the browser, carried to the Linux host, and turned into a KMZ by
// scripts/mission/make_mission.py, which stays the single authority on the file
// the aircraft actually reads.

export type TurnMode = "through" | "stop";

export interface MissionSpec {
  version: 1;
  site: string;
  date: string; // YYYY-MM-DD
  aoi: [number, number][]; // [lat, lon] corners, not closed
  home: [number, number] | null; // take-off point; DJI Fly measures its distance limit from here
  flight: {
    altitude_m: number;
    forward_overlap_pct: number;
    side_overlap_pct: number;
    gimbal_pitch_deg: number;
    speed_ms: number;
    turn: TurnMode;
    margin_passes: number;
  };
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
  site: "",
  // Deliberately empty, and filled in on the client after mount. Calling
  // new Date() here reads the clock when the module is evaluated, which for a
  // statically rendered page is *build* time: the server bakes the build date
  // into the HTML, the browser renders today's, React finds the text does not
  // match and hydration fails. A failed hydration leaves the whole tree
  // unhydrated, so every button and map click silently does nothing — while the
  // map still draws, because MapLibre runs outside React. That is what the
  // planner did the day after it was deployed.
  date: "",
  aoi: [],
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
