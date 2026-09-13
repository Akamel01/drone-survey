"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import { loadSavedMissions, saveMission, deleteMission, type SavedMission } from "@/lib/savedMissions";
import MapPane, { type DrawMode } from "@/components/MapPane";
import Sidebar from "@/components/Sidebar";
import SummaryBar from "@/components/SummaryBar";
import styles from "./plan.module.css";

export default function PlanPage() {
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");
  // Empty on the server (no localStorage there); filled in after mount so the
  // server-rendered and first client-rendered HTML match, then never touched
  // by this effect again — later changes go through setSavedMissions directly.
  const [savedMissions, setSavedMissions] = useState<SavedMission[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setSavedMissions(loadSavedMissions());
    // Today's date belongs to the client, never to the build: see DEFAULT_SPEC.
    setSpecState((s) => (s.date ? s : { ...s, date: new Date().toISOString().slice(0, 10) }));
  }, []);

  const setSpec = (updater: (s: MissionSpec) => MissionSpec) => setSpecState(updater);
  const setAoi = (aoi: [number, number][]) => setSpecState((s) => ({ ...s, aoi }));
  const setHome = (home: [number, number]) => setSpecState((s) => ({ ...s, home }));

  // Entering a draw mode starts a fresh area; leaving one (idle/set-home) does not.
  const selectMode = (m: DrawMode) => {
    if (m === "draw-polygon" || m === "draw-rectangle") setAoi([]);
    setMode(m);
  };

  const preview_ = useMemo(() => preview(spec), [spec]);
  const areaHa = useMemo(() => areaHectares(spec.aoi), [spec.aoi]);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <MapPane spec={spec} preview={preview_} mode={mode} onAoiChange={setAoi} onHomeChange={setHome} onModeChange={setMode} />
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
      <SummaryBar spec={spec} preview={preview_} onSaveMission={() => setSavedMissions(saveMission(spec))} />
    </div>
  );
}
