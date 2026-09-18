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
  /**
   * A stable identifier for the Site, assigned once by the planner and kept
   * for its life — renaming `site` never changes this (issue #39, ADR 0017).
   * Optional so a Spec or saved Mission from before this field existed keeps
   * working: `dispatchProblem`'s caller falls back to slugging `site` when
   * this is absent.
   */
  site_id?: string;
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
    /**
     * Usable flying minutes on one battery, which decides how a Site is split.
     *
     * Resuming a waypoint mission after a battery change is not available on
     * this aircraft (ADR 0016), so a Site bigger than one battery is flown as
     * several Missions rather than one interrupted Mission. Each part finishes
     * by returning home; the operator swaps the battery and selects the next
     * part by hand. Consecutive parts share a waypoint, so nothing is missed
     * where one battery ends and the next begins.
     */
    battery_minutes: number;
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

/** One description of the Mission Spec envelope, in two stages. A draft may be
 *  an unfinished plan — no area drawn yet; Dispatch requires a flyable one. The
 *  field rules that are the same at both stages live here once, so the two gates
 *  cannot drift apart about them. What differs is only what a stage requires. */
export type Gate = "draft" | "dispatch";

export function specProblem(spec: unknown, gate: Gate): string | null {
  if (!spec || typeof spec !== "object") return "not an object";
  const s = spec as MissionSpec;
  if (s.version !== 1) return "wrong Spec version";
  if (!s.site?.trim()) return "no Site named";
  if (s.site_id != null && !isValidSiteId(s.site_id)) return "Site id is not a safe identifier";
  if (!s.date?.trim()) return "no date";
  if (gate === "draft") return null;

  if (typeof s.flight?.altitude_m !== "number" || !Number.isFinite(s.flight.altitude_m)) {
    return "no flight altitude";
  }
  if (s.mission_type === "orbit") {
    if (!isLatLon(s.orbit?.center)) return "an orbit needs a subject";
  } else if (!Array.isArray(s.aoi) || s.aoi.length < 3) {
    return "an area needs at least three corners";
  } else if (!s.aoi.every(isLatLon)) {
    // Too few corners and a corner off the globe are different mistakes, and
    // telling someone to add corners they already drew sends them the wrong way.
    return "a corner is not a position on Earth";
  }
  return null;
}

/** May this be saved as a draft? Shape only: an unfinished plan is allowed. */
export function draftProblem(spec: unknown): string | null {
  return specProblem(spec, "draft");
}

/** A [lat, lon] pair, not just a 2-element array — the writer reads these by
 *  index, so an out-of-range or non-finite value builds a KMZ silently wrong
 *  rather than failing loudly. */
function isLatLon(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    v[0] >= -90 &&
    v[0] <= 90 &&
    v[1] >= -180 &&
    v[1] <= 180
  );
}

// A single safe storage-path segment: no `/`, no `.`/`..`, no empty string.
// Matches what `newSiteId` generates, but this is also the server's trust
// boundary (issue #39) — a client-supplied id must be checked against it
// before it ever reaches a B2 key, not just produced by it.
const SITE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function isValidSiteId(id: unknown): id is string {
  return typeof id === "string" && SITE_ID_RE.test(id);
}

/** The one rule for turning a Site's name into a path segment: lowercase, runs
 *  of anything else collapsed to a single "-", no leading or trailing "-", and
 *  never longer than asked. Every Site-shaped string in the app comes from here
 *  so a name can never produce a key the server would reject. */
export function slugSegment(name: string, maxLength: number): string {
  const collapsed = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Cutting to length can leave the dash it cut through.
  return collapsed.slice(0, maxLength).replace(/-+$/, "");
}

/** A short, readable Site id: the first word of its name plus a random
 *  suffix, so two Sites sharing a first word do not collide. Chosen over a
 *  UUID to keep storage keys legible (issue #39). */
export function newSiteId(name: string): string {
  const base = slugSegment(name.trim().split(/\s+/)[0] ?? "", 20);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "site"}-${suffix}`;
}

/** Assigns a Site id the first time a Site gets a name, and never again — a
 *  renamed Site keeps the id it already has (issue #39, ADR 0017). */
export function ensureSiteId(spec: MissionSpec): MissionSpec {
  if (spec.site_id || !spec.site.trim()) return spec;
  return { ...spec, site_id: newSiteId(spec.site) };
}

/** What must hold before a Spec is worth Dispatching. Shared by the API route
 *  (so the store never accumulates junk the Collector has to skip) and the
 *  planner (so an operator is told locally instead of by a 400). */
export function dispatchProblem(spec: MissionSpec): string | null {
  return specProblem(spec, "dispatch");
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
    // The Mini 5 Pro's standard battery, kept conservative: the figure that
    // matters is time in the air on a Site, not the headline endurance.
    battery_minutes: 16,
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
