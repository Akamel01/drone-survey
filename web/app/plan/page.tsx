"use client";

import { useMemo, useState } from "react";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import MapPane, { type DrawMode } from "@/components/MapPane";
import Sidebar from "@/components/Sidebar";
import SummaryBar from "@/components/SummaryBar";
import styles from "./plan.module.css";

export default function PlanPage() {
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");

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
        <Sidebar spec={spec} setSpec={setSpec} mode={mode} onModeChange={selectMode} areaHa={areaHa} preview={preview_} />
      </div>
      <SummaryBar spec={spec} preview={preview_} />
    </div>
  );
}
