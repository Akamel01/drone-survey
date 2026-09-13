"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEC, type CircleShape, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import { loadSavedMissions, saveMission, deleteMission, type SavedMission } from "@/lib/savedMissions";
import MapPane, { type DrawMode } from "@/components/MapPane";
import Sidebar from "@/components/Sidebar";
import SummaryBar from "@/components/SummaryBar";
import styles from "./plan.module.css";

export default function PlanPage() {
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");
  // Off by default: the operator expects a number on every photo position to
  // crowd the map, and they are right at 400 positions.
  const [showNumbers, setShowNumbers] = useState(false);
  // Empty on the server (no localStorage there); filled in after mount so the
  // server-rendered and first client-rendered HTML match.
  const [savedMissions, setSavedMissions] = useState<SavedMission[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setSavedMissions(loadSavedMissions());
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

  return (
    <div className={styles.page}>
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
          onLoadMission={setSpecState}
          onDeleteMission={(saved_at) => setSavedMissions(deleteMission(saved_at))}
        />
      </div>
      <SummaryBar
        spec={spec}
        preview={preview_}
        onSaveMission={() => setSavedMissions(saveMission(spec))}
      />
    </div>
  );
}
