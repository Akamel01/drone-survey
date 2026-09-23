"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEC, type CircleShape, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import {
  loadSavedMissions,
  saveMission,
  deleteMission,
  markMissionSent,
  overwriteMission,
  savedMissionState,
  type SavedMission,
} from "@/lib/savedMissions";
import type { StatusRow } from "@/lib/missions";
import MapPane, { type DrawMode } from "@/components/MapPane";
import Sidebar from "@/components/Sidebar";
import SummaryBar from "@/components/SummaryBar";
import PlanNav from "@/components/PlanNav";
import { EDIT_HANDOFF_KEY } from "./mission_status/page";
import styles from "./plan.module.css";

// The same passphrase the Dispatch control holds; read here so the Plan tab
// can ask the store what became of a saved Mission.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

export default function PlanPage() {
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");
  // Off by default: the operator expects a number on every photo position to
  // crowd the map, and they are right at 400 positions.
  const [showNumbers, setShowNumbers] = useState(false);
  // Empty on the server (no localStorage there); filled in after mount so the
  // server-rendered and first client-rendered HTML match.
  const [savedMissions, setSavedMissions] = useState<SavedMission[]>([]);
  // How many stored entries could not be read. Kept beside the list so the
  // operator is told, instead of a short list passing for the whole list.
  const [savedSkipped, setSavedSkipped] = useState(0);
  // What the store says about the Missions that left here. Null means it was
  // not read — never "nothing is Dispatched", which is the reading that would
  // let an overwrite through (issue #127).
  const [statusRows, setStatusRows] = useState<StatusRow[] | null>(null);
  const [statusProblem, setStatusProblem] = useState<string | null>(null);
  // Which saved entry the editor is working on, so a Save has a subject.
  const [editingSavedAt, setEditingSavedAt] = useState<string | null>(null);
  const applySaved = (read: { missions: SavedMission[]; skipped: number }) => {
    setSavedMissions(read.missions);
    setSavedSkipped(read.skipped);
  };

  const refreshStatus = useCallback(async () => {
    let key = "";
    try {
      key = localStorage.getItem(PASSPHRASE_KEY) ?? "";
    } catch {
      // No storage: the passphrase is not there to be read.
    }
    if (!key.trim()) {
      setStatusRows(null);
      setStatusProblem(
        "Mission status has not been read: type the Wayfinder passphrase below and it will show whether a saved Mission has been Dispatched. Until then, a Mission that was sent cannot be saved over.",
      );
      return;
    }
    try {
      const res = await fetch("/api/status", { headers: { "x-wayfinder-key": key } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body.rows)) {
        setStatusRows(null);
        setStatusProblem(
          `Mission status could not be read (${body.error ?? `HTTP ${res.status}`}), so whether a saved Mission has been Dispatched is not known. Saving over one is refused until it is.`,
        );
        return;
      }
      setStatusRows(body.rows as StatusRow[]);
      setStatusProblem(null);
    } catch (err) {
      setStatusRows(null);
      setStatusProblem(
        `Mission status could not be reached (${err instanceof Error ? err.message : "unknown"}), so whether a saved Mission has been Dispatched is not known. Saving over one is refused until it is.`,
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of the store, which is exactly the external system this is for
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    applySaved(loadSavedMissions());
    // A draft sent over from the Mission status tab for editing.
    try {
      const handoff = localStorage.getItem(EDIT_HANDOFF_KEY);
      if (handoff) {
        localStorage.removeItem(EDIT_HANDOFF_KEY);
        setSpecState(JSON.parse(handoff) as MissionSpec);
        return;
      }
    } catch {
      // A corrupt handoff is ignored; the planner opens as usual.
    }
    // Today's date belongs to the client, never to the build: see DEFAULT_SPEC.
    setSpecState((s) => (s.date ? s : { ...s, date: new Date().toISOString().slice(0, 10) }));
  }, []);

  const setSpec = (updater: (s: MissionSpec) => MissionSpec) => setSpecState(updater);
  const setAoi = (aoi: [number, number][], shape: CircleShape | null = null) =>
    setSpecState((s) => ({ ...s, aoi, shape }));
  const setHome = (home: [number, number]) => setSpecState((s) => ({ ...s, home }));
  const setPoi = (center: [number, number]) =>
    setSpecState((s) => ({ ...s, orbit: { ...s.orbit, center } }));

  // Choosing a shape starts a fresh area; every other mode leaves it alone, so
  // "Add points" can resume an existing polygon.
  const selectMode = (m: DrawMode) => {
    if (m === "draw-polygon" || m === "draw-rectangle" || m === "draw-circle") setAoi([], null);
    setMode(m);
  };

  const preview_ = useMemo(() => preview(spec), [spec]);
  const areaHa = useMemo(() => areaHectares(spec.aoi), [spec.aoi]);

  // What the Save control is allowed to do to the entry being edited.
  const editing = useMemo(() => {
    const entry = savedMissions.find((m) => m.saved_at === editingSavedAt);
    if (!entry) return null;
    return {
      saved_at: entry.saved_at,
      name: entry.site || "Untitled",
      status: savedMissionState(entry, statusRows),
    };
  }, [savedMissions, editingSavedAt, statusRows]);

  return (
    <div className={styles.page}>
      <PlanNav />
      <div className={styles.top}>
        <MapPane
          spec={spec}
          preview={preview_}
          mode={mode}
          showNumbers={showNumbers}
          onShowNumbersChange={setShowNumbers}
          onAoiChange={setAoi}
          onHomeChange={setHome}
          onPoiChange={setPoi}
          onOrbitRadiusChange={(radius_m) =>
            setSpecState((s) => ({ ...s, orbit: { ...s.orbit, radius_m } }))
          }
          onModeChange={setMode}
        />
        <Sidebar
          spec={spec}
          setSpec={setSpec}
          mode={mode}
          onModeChange={selectMode}
          areaHa={areaHa}
          preview={preview_}
          savedMissions={savedMissions}
          savedSkipped={savedSkipped}
          statusRows={statusRows}
          statusProblem={statusProblem}
          editingSavedAt={editingSavedAt}
          onLoadMission={(loaded, saved_at) => {
            setSpecState(loaded);
            setEditingSavedAt(saved_at);
          }}
          onDeleteMission={(saved_at) => {
            applySaved(deleteMission(saved_at));
            // The editor keeps the Spec, but it is no longer editing an entry.
            setEditingSavedAt((cur) => (cur === saved_at ? null : cur));
          }}
          onMissionSent={(saved_at, draft_id) => {
            applySaved(markMissionSent(saved_at, undefined, draft_id));
            // It is a draft in the store now, and the list should say so.
            void refreshStatus();
          }}
        />
      </div>
      <SummaryBar
        spec={spec}
        preview={preview_}
        editing={editing}
        onSaveMission={() => {
          const read = saveMission(spec);
          applySaved(read);
          // Save as leaves the editor on the new Mission, which is an
          // ordinary one: editable, and Dispatchable in its own right (#127).
          setEditingSavedAt(read.missions[0]?.saved_at ?? null);
        }}
        onOverwrite={(saved_at) => {
          applySaved(overwriteMission(saved_at, spec));
          // A withdrawal may have just changed what the store says.
          void refreshStatus();
        }}
      />
    </div>
  );
}
