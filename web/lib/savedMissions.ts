// Client-side saved-missions store: a plain list of Mission Specs in localStorage.
//
// Every entry is exactly a MissionSpec plus a saved_at timestamp — no derived
// or preview values — because this file format is the master copy of a
// Mission and is consumed by scripts/mission/make_mission.py.

import { DEFAULT_SPEC, slugSegment, type MissionSpec } from "./spec.ts";
import type { StatusRow } from "./missions.ts";

const STORAGE_KEY = "drone-planner.saved-missions";
// Where a blob that stopped parsing is kept. Without this the next save
// overwrites the only copy of every Mission in it, which is a silent,
// permanent loss (issue #125).
const UNREADABLE_KEY = `${STORAGE_KEY}.unreadable`;

export type SavedMission = MissionSpec & {
  saved_at: string;
  /** When this Mission was sent to Mission status, if it was. The local copy
   *  is kept either way — a 200 from the drafts route is the writer's own word
   *  that it landed, which ADR 0018 says is not evidence (issue #124). */
  sent_at?: string;
  /** The draft id the shared store gave this Mission when it was sent there.
   *  This is the only link between a saved entry and the Spec it was later
   *  Dispatched as: the draft record carries `dispatched_key`, so the chain is
   *  saved entry to draft id to Spec key, every step recorded, none inferred
   *  from Site name and date (issue #127). Absent on anything sent before. */
  draft_id?: string;
};

/**
 * What one read of the store found: the entries it could use, and how many it
 * could not.
 *
 * The count is reported rather than swallowed. A Mission that vanishes without
 * a word is exactly the failure issues #124 and #125 are about, and the old
 * `catch { return []; }` turned any unreadable byte into an empty list.
 */
export interface SavedMissionsRead {
  missions: SavedMission[];
  skipped: number;
}

// Tolerates a missing field (an older saved entry, or a hand-edited file) by
// falling back to DEFAULT_SPEC's value instead of crashing.
function normalizeSpec(raw: Partial<MissionSpec> | null | undefined): MissionSpec {
  const r = raw ?? {};
  return {
    version: 1,
    // A Spec saved before orbits existed has no mission_type, and is a grid.
    mission_type: r.mission_type === "orbit" ? "orbit" : "grid",
    site: r.site ?? DEFAULT_SPEC.site,
    // Absent on anything saved before issue #39 — left absent rather than
    // backfilled, so an old entry keeps falling back to slugging its name.
    site_id: typeof r.site_id === "string" ? r.site_id : undefined,
    date: r.date ?? DEFAULT_SPEC.date,
    aoi: Array.isArray(r.aoi) ? r.aoi : DEFAULT_SPEC.aoi,
    shape: r.shape ?? null,
    home: r.home ?? DEFAULT_SPEC.home,
    flight: { ...DEFAULT_SPEC.flight, ...(r.flight ?? {}) },
    orbit: { ...DEFAULT_SPEC.orbit, ...(r.orbit ?? {}) },
    camera: { ...DEFAULT_SPEC.camera, ...(r.camera ?? {}) },
  };
}

/** Strips saved_at so the object handed to a download or the live editor is a clean MissionSpec. */
export function toMissionSpec(entry: SavedMission): MissionSpec {
  return {
    version: entry.version,
    mission_type: entry.mission_type,
    site: entry.site,
    site_id: entry.site_id,
    date: entry.date,
    aoi: entry.aoi,
    shape: entry.shape ?? null,
    home: entry.home,
    flight: entry.flight,
    orbit: entry.orbit,
    camera: entry.camera,
  };
}

/** Keeps a blob that stopped parsing, so the save that follows this read
 *  cannot be the thing that destroys it. */
function preserve(raw: string) {
  try {
    localStorage.setItem(UNREADABLE_KEY, raw);
  } catch {
    // Nothing more to try; the read still reports the entry as skipped.
  }
}

function readRaw(): SavedMissionsRead {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage disabled entirely: no Missions, and none lost.
    return { missions: [], skipped: 0 };
  }
  if (!raw) return { missions: [], skipped: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    preserve(raw);
    return { missions: [], skipped: 1 };
  }
  if (!Array.isArray(parsed)) {
    preserve(raw);
    return { missions: [], skipped: 1 };
  }

  // Per entry, never per list. One malformed entry costs that entry and
  // nothing else — the same rule the drafts route already follows for a
  // hand-edited file that stopped parsing.
  const missions: SavedMission[] = [];
  let skipped = 0;
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      // A string or a null here used to normalise into a phantom Mission made
      // entirely of defaults. Counting it is honest; inventing one is not.
      skipped += 1;
      continue;
    }
    try {
      const e = entry as Partial<SavedMission>;
      missions.push({
        ...normalizeSpec(e),
        saved_at: typeof e.saved_at === "string" ? e.saved_at : new Date(0).toISOString(),
        ...(typeof e.sent_at === "string" ? { sent_at: e.sent_at } : {}),
        ...(typeof e.draft_id === "string" ? { draft_id: e.draft_id } : {}),
      });
    } catch {
      skipped += 1;
    }
  }
  return { missions, skipped };
}

function writeRaw(list: SavedMission[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Unavailable (private browsing, quota, disabled storage) — save silently no-ops.
  }
}

function sorted(read: SavedMissionsRead): SavedMissionsRead {
  return {
    missions: [...read.missions].sort((a, b) => b.saved_at.localeCompare(a.saved_at)),
    skipped: read.skipped,
  };
}

export function loadSavedMissions(): SavedMissionsRead {
  return sorted(readRaw());
}

export function saveMission(spec: MissionSpec): SavedMissionsRead {
  const read = readRaw();
  read.missions.push({ ...spec, saved_at: new Date().toISOString() });
  writeRaw(read.missions);
  return sorted(read);
}

export function deleteMission(saved_at: string): SavedMissionsRead {
  const read = readRaw();
  read.missions = read.missions.filter((m) => m.saved_at !== saved_at);
  writeRaw(read.missions);
  return sorted(read);
}

/** Records that a Mission was sent to Mission status, keeping the local copy.
 *  The saved list is the operator's own copy; a send is not a reason to take
 *  it away from them (issue #124).
 *
 *  The draft id is recorded here because this is the only moment it exists:
 *  the drafts route mints it and hands it back, and nothing else ever ties
 *  this entry to the store (issue #127). */
export function markMissionSent(
  saved_at: string,
  sent_at = new Date().toISOString(),
  draft_id?: string,
): SavedMissionsRead {
  const read = readRaw();
  read.missions = read.missions.map((m) =>
    m.saved_at === saved_at ? { ...m, sent_at, ...(draft_id ? { draft_id } : {}) } : m,
  );
  writeRaw(read.missions);
  return sorted(read);
}

/** Replaces one saved entry's Spec in place, keeping its identity (saved_at)
 *  and its link to the store. Called only once `savedMissionState` says this
 *  entry may be overwritten, or after its Dispatched Spec was withdrawn. */
export function overwriteMission(saved_at: string, spec: MissionSpec): SavedMissionsRead {
  const read = readRaw();
  read.missions = read.missions.map((m) => (m.saved_at === saved_at ? { ...m, ...spec, saved_at } : m));
  writeRaw(read.missions);
  return sorted(read);
}

/**
 * Where a saved Mission has got to, read from the store's own status rows.
 *
 * - `draft`      never sent anywhere; the planner owns it outright.
 * - `sent`       a draft exists in the shared store, nothing is Dispatched.
 * - `dispatched` a Spec exists and the host may Load it at any moment.
 * - `loaded`     the host has taken it; a KMZ may be on the Controller already.
 * - `unknown`    it left the planner, but this copy cannot be tied to what it
 *                became. Treated as strictly as `dispatched`, because the
 *                alternative is permitting an overwrite that silently
 *                desynchronises the planner from the field.
 */
export type SavedState = "draft" | "sent" | "dispatched" | "loaded" | "unknown";

export interface SavedStatus {
  state: SavedState;
  /** The Spec key an overwrite has to withdraw, when it is known. */
  dispatched_key: string | null;
  /** True when saving over this entry changes nothing outside the planner. */
  can_overwrite: boolean;
  /** Why not, in the operator's words. Null when `can_overwrite`. */
  why_not: string | null;
}

const FREE: SavedStatus = { state: "draft", dispatched_key: null, can_overwrite: true, why_not: null };

/**
 * Joins a saved entry to the status rows by recorded id, never by Site name
 * and date. Pass `rows: null` when the store was not read (not configured,
 * not authorised, offline): an entry that was sent then reads as `unknown`
 * rather than as a free draft, so a failed read can never unlock an overwrite.
 */
export function savedMissionState(m: SavedMission, rows: StatusRow[] | null): SavedStatus {
  // Never sent: nothing outside the planner can disagree with it.
  if (!m.sent_at && !m.draft_id) return FREE;

  const unknown = (why: string): SavedStatus => ({
    state: "unknown",
    dispatched_key: null,
    can_overwrite: false,
    why_not: why,
  });

  if (!m.draft_id) {
    // Sent before issue #127, so no id was kept. The Spec it became cannot be
    // named from here, and so cannot be withdrawn from here either.
    return unknown(
      "This Mission was sent to Mission status before the planner recorded which draft it became, so it cannot be told apart from what is in the store. Save it as a new Mission, and withdraw the old one from Mission status by hand if it is still waiting.",
    );
  }
  if (rows === null) {
    return unknown("Mission status could not be read, so what became of this Mission is not known.");
  }

  const draft = rows.find((r) => r.kind === "draft" && r.id === m.draft_id);
  if (!draft) {
    return unknown(
      "The draft this Mission was sent as is no longer in the store. Deleting a draft leaves its Dispatched Spec behind, so there may still be one, and it cannot be named from here.",
    );
  }
  if (!draft.dispatched_key) {
    // A draft in the store and nothing more. Nothing has been handed to the
    // host, so editing in place is honest.
    return { state: "sent", dispatched_key: null, can_overwrite: true, why_not: null };
  }

  const spec = rows.find((r) => r.kind === "spec" && r.id === draft.dispatched_key);
  if (!spec) {
    return unknown("Its Dispatched Spec is not in the status list, so its state is not known.");
  }
  if (spec.state === "withdrawn") {
    // Already withdrawn: the host will not Load it, so nothing in the field
    // depends on this entry any more.
    return { state: "sent", dispatched_key: spec.id, can_overwrite: true, why_not: null };
  }
  if (spec.state === "loaded" || spec.state === "collected") {
    return {
      state: "loaded",
      dispatched_key: spec.id,
      can_overwrite: false,
      why_not:
        "It has already been Loaded onto the Controller, which is past the point a withdrawal can reach.",
    };
  }
  return {
    state: "dispatched",
    dispatched_key: spec.id,
    can_overwrite: false,
    why_not: "It has been Dispatched, and the host may Load it at any moment.",
  };
}

export function slug(s: string) {
  return slugSegment(s || "site", 60);
}

export function downloadMission(spec: MissionSpec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(spec.site)}-${spec.date}.mission.json`;
  a.click();
  URL.revokeObjectURL(url);
}
