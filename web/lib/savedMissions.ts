// Client-side saved-missions store: a plain list of Mission Specs in localStorage.
//
// Every entry is exactly a MissionSpec plus a saved_at timestamp — no derived
// or preview values — because this file format is the master copy of a
// Mission and is consumed by scripts/mission/make_mission.py.

import { DEFAULT_SPEC, type MissionSpec } from "./spec";

const STORAGE_KEY = "drone-planner.saved-missions";

export type SavedMission = MissionSpec & { saved_at: string };

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

function readRaw(): SavedMission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      ...normalizeSpec(entry),
      saved_at: typeof entry?.saved_at === "string" ? entry.saved_at : new Date(0).toISOString(),
    }));
  } catch {
    return [];
  }
}

function writeRaw(list: SavedMission[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Unavailable (private browsing, quota, disabled storage) — save silently no-ops.
  }
}

export function loadSavedMissions(): SavedMission[] {
  return readRaw().sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

export function saveMission(spec: MissionSpec): SavedMission[] {
  const list = readRaw();
  list.push({ ...spec, saved_at: new Date().toISOString() });
  writeRaw(list);
  return loadSavedMissions();
}

export function deleteMission(saved_at: string): SavedMission[] {
  writeRaw(readRaw().filter((m) => m.saved_at !== saved_at));
  return loadSavedMissions();
}

export function slug(s: string) {
  return (s || "site").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase();
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
