"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SPEC, type CircleShape, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import type { MissionRow } from "@/lib/missionRecords";
import { copyOf, localDate, sitesFrom, type MissionListRead, type SiteChoice } from "@/lib/missionView";
import MapPane, { type DrawMode } from "@/components/MapPane";
import HeroScene from "@/components/HeroScene";
import MissionList from "@/components/MissionList";
import Sidebar from "@/components/Sidebar";
import SummaryBar from "@/components/SummaryBar";
import styles from "./plan.module.css";

// The planner: the Missions, the map, and the settings of the Mission being
// edited, on one screen (#151).
//
// There were two tabs -- Plan and Mission status -- for a reason that went
// away when Missions moved into the store: they had been two lists of two
// different things. On a wide screen all three columns show at once. On a
// narrow one -- a phone at the aircraft, a tablet held upright -- one shows at
// a time, chosen from a bar along the bottom, and it opens on the Missions,
// because "which Card do I open?" is the question asked there. Nothing exists
// at one width only: the narrow layout hides columns, it never removes them.
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
  /** Set while the editor holds an unsaved copy of another Mission, so the
   *  operator can see that saving makes a new one. */
  copied_from?: string;
}

/** Which column a narrow screen shows. Wide screens show all three. */
type View = "missions" | "map" | "settings";

const VIEWS: { id: View; label: string }[] = [
  { id: "missions", label: "Missions" },
  { id: "map", label: "Map" },
  { id: "settings", label: "Settings" },
];

export default function PlanPage() {
  const [view, setView] = useState<View>("missions");
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");
  // Off by default: the operator expects a number on every photo position to
  // crowd the map, and they are right at 400 positions.
  const [showNumbers, setShowNumbers] = useState(false);
  const [editing, setEditing] = useState<Editing>({ id: null, name: "" });
  // Corner tapped on the map, waiting on the on-map Remove corner button.
  const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
  // The Sites already in the store. Taken from the Mission list's own read, so
  // one page load is one storage transaction rather than two.
  const [sites, setSites] = useState<SiteChoice[]>([]);

  useEffect(() => {
    // Today's date belongs to the client, never to the build: see DEFAULT_SPEC.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of the clock
    setSpecState((s) => (s.date ? s : { ...s, date: localDate(new Date()) }));
  }, []);

  const setSpec = (updater: (s: MissionSpec) => MissionSpec) => setSpecState(updater);
  const setAoi = (aoi: [number, number][], shape: CircleShape | null = null) => {
    // Any geometry change can shift corner indices, so a tap selection never
    // survives one. Selecting happens after the change, never before.
    setSelectedCorner(null);
    setSpecState((s) => ({ ...s, aoi, shape }));
  };
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
  // On a narrow screen, opening a Mission moves to the map, where it is.
  const editMission = (row: MissionRow) => {
    setSpecState(row.spec);
    setEditing({ id: row.id, name: row.name });
    setView("map");
  };

  const copyMission = (row: MissionRow) => {
    const { spec: copied, editing: e } = copyOf(row, localDate(new Date()));
    setSpecState(copied);
    setEditing(e);
    setView("map");
  };

  const onListRead = (read: MissionListRead) => setSites(sitesFrom(read.missions));

  return (
    <div className={styles.page} data-view={view}>
      <div className={styles.top}>
        <section className={styles.missions} aria-label="Missions">
          <HeroScene playing={view === "missions"} />
          <h2 className={styles.heading}>Missions</h2>
          <MissionList onEdit={editMission} onCopy={copyMission} editingId={editing.id} onRead={onListRead} />
        </section>
        <section className={styles.map} aria-label="Map">
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
          selectedCorner={selectedCorner}
          onSelectedCornerChange={setSelectedCorner}
          />
        </section>
        <section className={styles.settings} aria-label="Settings">
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
          />
        </section>
      </div>
      <div className={styles.summary}>
        <SummaryBar
          spec={spec}
          preview={preview_}
          editing={editing}
          onSaved={(row) => setEditing({ id: row.id, name: row.name })}
          sites={sites}
        />
      </div>
      <nav className={styles.views} aria-label="Show">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? "active" : undefined}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
