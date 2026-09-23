"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEC, type CircleShape, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import type { MissionRow } from "@/lib/missionRecords";
import { sitesFrom, type MissionListRead, type SiteChoice } from "@/lib/missionView";
import MapPane, { type DrawMode } from "@/components/MapPane";
import MissionList from "@/components/MissionList";
import Sidebar from "@/components/Sidebar";
import SummaryBar from "@/components/SummaryBar";
import PlanNav from "@/components/PlanNav";
import { EDIT_HANDOFF_KEY } from "./mission_status/page";
import styles from "./plan.module.css";

// The planner, and the one Mission list beside it.
//
// Missions live in the shared store, not in browser local storage: the
// operator lost sight of their saved Missions simply by opening a different
// deployment URL, and a cleared cache would have destroyed them with no
// warning (ADR 0021). The browser holds the edit in progress and nothing else.

/** What the editor is working on, beyond the Spec: which stored Mission it
 *  came from, and the Mission Name that tells it apart from another for the
 *  same Site on the same day. */
export interface Editing {
  id: string | null;
  name: string;
}

export default function PlanPage() {
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");
  // Off by default: the operator expects a number on every photo position to
  // crowd the map, and they are right at 400 positions.
  const [showNumbers, setShowNumbers] = useState(false);
  const [editing, setEditing] = useState<Editing>({ id: null, name: "" });
  // The Sites already in the store. Taken from the Mission list's own read, so
  // one page load is one storage transaction rather than two.
  const [sites, setSites] = useState<SiteChoice[]>([]);

  useEffect(() => {
    // A Mission handed over from the Mission status tab for editing.
    try {
      const handoff = localStorage.getItem(EDIT_HANDOFF_KEY);
      if (handoff) {
        localStorage.removeItem(EDIT_HANDOFF_KEY);
        const { spec: handed, id, name } = JSON.parse(handoff) as {
          spec: MissionSpec;
          id: string;
          name: string;
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
        setSpecState(handed);
        setEditing({ id, name });
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
  //
  // Adding corners to a circle would grow `aoi` while `shape` still claimed a
  // circle — a ring the circle handles would then overwrite from a radius that
  // no longer describes it. The mode itself drops the circle, so the guard
  // holds for any caller, not only for the one button that is disabled today.
  const selectMode = (m: DrawMode) => {
    if (m === "draw-polygon" || m === "draw-rectangle" || m === "draw-circle") setAoi([], null);
    if (m === "append-polygon") setSpecState((s) => (s.shape ? { ...s, shape: null } : s));
    setMode(m);
  };

  const preview_ = useMemo(() => preview(spec), [spec]);
  const areaHa = useMemo(() => areaHectares(spec.aoi), [spec.aoi]);

  // Editing a stored Mission loads its Spec and its Name. What the edit then
  // means is the store's decision, not the planner's: in place while Planned,
  // a new Mission that supersedes once Dispatched, refused once Loaded.
  const editMission = (row: MissionRow) => {
    setSpecState(row.spec);
    setEditing({ id: row.id, name: row.name });
  };

  const onListRead = (read: MissionListRead) => setSites(sitesFrom(read.missions));

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
          sites={sites}
          editing={editing}
          onNameChange={(name) => setEditing((e) => ({ ...e, name }))}
          missionList={<MissionList onEdit={editMission} editingId={editing.id} onRead={onListRead} />}
        />
      </div>
      <SummaryBar
        spec={spec}
        preview={preview_}
        editing={editing}
        onSaved={(row) => setEditing({ id: row.id, name: row.name })}
      />
    </div>
  );
}
