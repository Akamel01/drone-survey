"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SPEC, type CircleShape, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import type { MissionRow } from "@/lib/missionRecords";
import { copyOf, localDate, sitesFrom, type MissionListRead, type SiteChoice } from "@/lib/missionView";
import MapPane, { type DrawMode } from "@/components/MapPane";
import HeroScene from "@/components/HeroScene";
import MissionList from "@/components/MissionList";
import Notice, { type NoticePayload } from "@/components/Notice";
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

/** The control focus moves to when a panel folds or unfolds. */
type FoldFocus = "missions-collapse" | "missions-tab" | "settings-collapse" | "settings-tab";

const VIEWS: { id: View; label: string }[] = [
  { id: "missions", label: "Missions" },
  { id: "map", label: "Map" },
  { id: "settings", label: "Settings" },
];

/** The tab bar's line icons: list, map, sliders (spec § 8 — 24 px, 1.5 stroke,
 *  round caps, sized and stroked by the tab bar's own CSS). */
function ViewIcon({ view }: { view: View }) {
  if (view === "missions") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    );
  }
  if (view === "map") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
        <path d="M9 4v13M15 6.5v13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h9M17 8h3M4 16h4M12 16h8" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </svg>
  );
}

export default function PlanPage() {
  const [view, setView] = useState<View>("missions");
  // Wide screens: both floating panels start open, and folding one away is the
  // operator's choice. Narrow screens switch whole views from the tab bar; the
  // fold buttons are not shown there.
  const [missionsOpen, setMissionsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  // The map has no surface without its basemap. Two independent signals: the
  // browser's own, which clears when it clears; and MapPane's, which latches
  // on a tile failure and clears when tiles flow again or the browser comes
  // back (MapLibre does not always retry failed tiles on its own).
  const [offline, setOffline] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const noNetwork = offline || mapFailed;
  // The wide-screen fallback only: below 1000px it would be a hidden 0x0
  // surface, and its hero scene would still decode a video and animate.
  const [wide, setWide] = useState(false);
  const [spec, setSpecState] = useState<MissionSpec>(DEFAULT_SPEC);
  const [mode, setMode] = useState<DrawMode>("idle");
  // Off by default: the operator expects a number on every photo position to
  // crowd the map, and they are right at 400 positions.
  const [showNumbers, setShowNumbers] = useState(false);
  const [editing, setEditing] = useState<Editing>({ id: null, name: "" });
  // Bumped whenever a Mission is opened, so the Summary bar's figures count up
  // once per open (M2 seam).
  const [openToken, setOpenToken] = useState(0);
  // Corner tapped on the map, waiting on the on-map Remove corner button.
  const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
  // The Sites already in the store. Taken from the Mission list's own read, so
  // one page load is one storage transaction rather than two.
  const [sites, setSites] = useState<SiteChoice[]>([]);
  // The single reporting path for action results (M2 seam): one slot owned
  // here, fed by children via onNotice (wired in M3/M4), rendered once below.
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const noticeKey = useRef(0);
  const showNotice = useCallback((p: Omit<NoticePayload, "key">) => {
    noticeKey.current += 1;
    setNotice({ ...p, key: noticeKey.current });
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const collapseMissions = useRef<HTMLButtonElement>(null);
  const collapseSettings = useRef<HTMLButtonElement>(null);
  const expandMissions = useRef<HTMLButtonElement>(null);
  const expandSettings = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // The control a fold is about to create, focused once it is on screen. Null
  // on first mount: the page must not steal focus on load.
  const foldFocus = useRef<FoldFocus | null>(null);

  useEffect(() => {
    // Today's date belongs to the client, never to the build: see DEFAULT_SPEC.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of the clock
    setSpecState((s) => (s.date ? s : { ...s, date: localDate(new Date()) }));
  }, []);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      // The tile latch must clear too: MapLibre may not re-request on its own.
      setMapFailed(false);
    };
    if (!navigator.onLine) goOffline();
    addEventListener("offline", goOffline);
    addEventListener("online", goOnline);
    return () => {
      removeEventListener("offline", goOffline);
      removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    const mq = matchMedia("(min-width: 1000px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The Summary bar's real height, as a variable the map's own bottom
  // controls (UI-7) read to clear it -- it shares the bottom band with them
  // on a wide screen, and its height is content-driven (UI-6 is reshaping
  // that content), so a measured value is the only one that stays true.
  useEffect(() => {
    const page = pageRef.current;
    const summary = summaryRef.current;
    if (!page || !summary) return;
    const ro = new ResizeObserver(([entry]) => {
      page.style.setProperty("--summary-h", `${entry.target.getBoundingClientRect().height}px`);
    });
    ro.observe(summary);
    return () => ro.disconnect();
  }, []);

  // Folding swaps a control for its replacement; focus follows so a keyboard
  // user is not dropped at the top of the document (spec § 10).
  useEffect(() => {
    const target = foldFocus.current;
    if (!target) return;
    foldFocus.current = null;
    const el: Record<FoldFocus, HTMLButtonElement | null> = {
      "missions-collapse": collapseMissions.current,
      "missions-tab": expandMissions.current,
      "settings-collapse": collapseSettings.current,
      "settings-tab": expandSettings.current,
    };
    el[target]?.focus();
  }, [missionsOpen, settingsOpen]);

  const handleBasemapError = useCallback(() => setMapFailed(true), []);
  const handleBasemapLoaded = useCallback(() => setMapFailed(false), []);

  const foldMissions = (open: boolean) => {
    foldFocus.current = open ? "missions-collapse" : "missions-tab";
    setMissionsOpen(open);
  };

  const foldSettings = (open: boolean) => {
    foldFocus.current = open ? "settings-collapse" : "settings-tab";
    setSettingsOpen(open);
  };

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
    setOpenToken((t) => t + 1);
    setView("map");
  };

  const copyMission = (row: MissionRow) => {
    const { spec: copied, editing: e } = copyOf(row, localDate(new Date()));
    setSpecState(copied);
    setEditing(e);
    setOpenToken((t) => t + 1);
    setView("map");
  };

  const onListRead = (read: MissionListRead) => setSites(sitesFrom(read.missions));

  return (
    <div
      ref={pageRef}
      className={styles.page}
      data-view={view}
      data-network={noNetwork ? "offline" : "online"}
      data-missions={missionsOpen ? "open" : "closed"}
      data-settings={settingsOpen ? "open" : "closed"}
    >
      <Notice key={notice?.key ?? "empty"} payload={notice} onDismiss={dismissNotice} />
      <div className={styles.top}>
        <div className={styles.heroLayer} aria-hidden="true">
          <HeroScene playing={view === "missions"} />
          <div className={styles.heroStill}>
            <HeroScene variant="still" playing={false} />
          </div>
        </div>
        <section id="missions-panel" className={`${styles.missions} glass-smoke`} aria-label="Missions" inert={!wide && view !== "missions"}>
          <div className={styles.panelHead}>
            <h2 className={styles.viewTitle}>Missions</h2>
            <button
              ref={collapseMissions}
              type="button"
              className={styles.collapse}
              aria-expanded={missionsOpen}
              aria-controls="missions-panel"
              aria-label="Collapse Missions"
              onClick={() => foldMissions(false)}
            >
              ‹
            </button>
          </div>
          <MissionList onEdit={editMission} onCopy={copyMission} editingId={editing.id} onRead={onListRead} onNotice={showNotice} />
        </section>
        <section className={styles.map} aria-label="Map" inert={!wide && view !== "map"}>
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
          onBasemapError={handleBasemapError}
          onBasemapLoaded={handleBasemapLoaded}
          />
          {noNetwork && wide && (
            <div className={styles.noNetwork}>
              <HeroScene playing showOnWide />
              <div className={styles.cornerTL}>
                <span>Mission</span>
                <span>Control</span>
              </div>
              <div className={styles.cornerTR}>No network</div>
              <div className={styles.cornerBL}>Esri World Imagery</div>
              <div className={styles.cornerBR}>OpenStreetMap</div>
              <p className={`glass-smoke ${styles.offlineStatement}`}>The map needs a connection.</p>
            </div>
          )}
        </section>
        <section id="settings-panel" className={`${styles.settings} glass-smoke`} aria-label="Settings" inert={!wide && view !== "settings"}>
          <div className={styles.panelHead}>
            <h2 className={styles.heading}>Settings</h2>
            <button
              ref={collapseSettings}
              type="button"
              className={styles.collapse}
              aria-expanded={settingsOpen}
              aria-controls="settings-panel"
              aria-label="Collapse Settings"
              onClick={() => foldSettings(false)}
            >
              ›
            </button>
          </div>
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
      {/* The network switch is otherwise silent to assistive tech. */}
      <p className={styles.srOnly} role="status">
        {noNetwork ? "The map needs a connection." : ""}
      </p>
      <div ref={summaryRef} className={`glass-smoke ${styles.summary}`}>
        <SummaryBar
          spec={spec}
          preview={preview_}
          editing={editing}
          onSaved={(row) => setEditing({ id: row.id, name: row.name })}
          onNotice={showNotice}
          sites={sites}
          countKey={openToken}
        />
      </div>
      {!missionsOpen && (
        <button
          ref={expandMissions}
          type="button"
          className={`glass-smoke ${styles.edgeTab} ${styles.edgeTabLeft}`}
          aria-expanded={false}
          aria-controls="missions-panel"
          aria-label="Expand Missions"
          onClick={() => foldMissions(true)}
        >
          ›
        </button>
      )}
      {!settingsOpen && (
        <button
          ref={expandSettings}
          type="button"
          className={`glass-smoke ${styles.edgeTab} ${styles.edgeTabRight}`}
          aria-expanded={false}
          aria-controls="settings-panel"
          aria-label="Expand Settings"
          onClick={() => foldSettings(true)}
        >
          ‹
        </button>
      )}
      <nav className={styles.views} aria-label="Show">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? "active" : undefined}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            <ViewIcon view={v.id} />
            <span>{v.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
