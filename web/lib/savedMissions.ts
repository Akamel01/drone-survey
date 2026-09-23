// Client-side saved-missions store: a plain list of Mission Specs in localStorage.
//
// Every entry is exactly a MissionSpec plus a saved_at timestamp — no derived
// or preview values — because this file format is the master copy of a
// Mission and is consumed by scripts/mission/make_mission.py.

import { DEFAULT_SPEC, slugSegment, type MissionSpec } from "./spec.ts";

const STORAGE_KEY = "drone-planner.saved-missions";
// Where a blob that stopped parsing is kept. Without this the next save
// overwrites the only copy of every Mission in it, which is a silent,
// permanent loss (issue #125).
const UNREADABLE_KEY = `${STORAGE_KEY}.unreadable`;

export type SavedMission = MissionSpec & { saved_at: string };

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
