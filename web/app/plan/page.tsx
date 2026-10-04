"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SPEC, type CircleShape, type MissionSpec } from "@/lib/spec";
import { preview, areaHectares } from "@/lib/mission";
import type { MissionRow } from "@/lib/missionRecords";
import { copyOf, localDate, sitesFrom, type MissionListRead } from "@/lib/missionView";
import { firstRunDestination, type FirstRunStep } from "@/lib/firstRun";
import MapPane, { type DrawMode } from "@/components/MapPane";
import MapToolbar from "@/components/MapToolbar";
import HeroScene from "@/components/HeroScene";
import MissionList from "@/components/MissionList";
import LoadSheet from "@/components/LoadSheet";
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
  /** The `updated_at` of the stored Mission when it was opened (or last saved
   *  or sent from here): what an edit made with no signal is guarded by. */
  base?: string;
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

/** Accounts waiting for Approval, as a visual pill. Meaning lives on the host
 *  control's accessible name; the pill itself is decoration (MapPane precedent).
 *  Display caps at 9+; the name keeps the true number. Unmounted at zero. */
function PendingBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={className ? `${styles.pendingBadge} ${className}` : styles.pendingBadge}
      aria-hidden="true"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** "1 Account waiting" vs "N Accounts waiting" (CONTEXT.md language). */
const waitingName = (n: number) => (n === 1 ? "1 Account waiting" : `${n} Accounts waiting`);

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
  // The map shows the Site's offline map (PWA-2) instead of the basemap: it
  // has a surface, so the fallback below stays away.
  const [offlineMap, setOfflineMap] = useState(false);
  const down = offline || mapFailed;
  const noNetwork = down && !offlineMap;
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
  // The Missions in the store, as the list last read them. The Sites to choose
  // from and the state of the Mission being edited both come from this read, so
  // one page load is one storage transaction rather than two.
  const [missions, setMissions] = useState<MissionRow[]>([]);
  // The Load view (PWA-4): a sheet, so it opens from the app shell the worker keeps for offline starts.
  const [loadOpen, setLoadOpen] = useState(false);
  const closeLoad = useCallback(() => setLoadOpen(false), []);
  const sites = useMemo(() => sitesFrom(missions), [missions]);
  const edited = editing.id ? (missions.find((m) => m.id === editing.id) ?? null) : null;
  // The single reporting path for action results (M2 seam): one slot owned
  // here, fed by children via onNotice (wired in M3/M4), rendered once below.
  const [notice, setNotice] = useState<NoticePayload | null>(null);
  const noticeKey = useRef(0);
  const showNotice = useCallback((p: Omit<NoticePayload, "key">) => {
    noticeKey.current += 1;
    setNotice({ ...p, key: noticeKey.current });
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  // Accounts waiting for Approval (admin-only: only the admin-gated
  // AccountsSection ever reports a nonzero count). Badge unmounts at 0.
  const [pendingCount, setPendingCount] = useState(0);

  const collapseMissions = useRef<HTMLButtonElement>(null);
  const collapseSettings = useRef<HTMLButtonElement>(null);
  const expandMissions = useRef<HTMLButtonElement>(null);
  const expandSettings = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // The control a fold is about to create, focused once it is on screen. Null
  // on first mount: the page must not steal focus on load.
  const foldFocus = useRef<FoldFocus | null>(null);
  // The first-run step whose anchor focus the page still owes, and a counter
  // that reruns the focus effect even when the destination changed nothing
  // else (a wide screen with Settings already open). Null on first mount: the
  // page must not steal focus on load.
  const firstRunFocus = useRef<FirstRunStep | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

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
    // preventScroll: at unfold the collapse button still sits inside the
    // translated panel for one frame; letting the browser scroll it into view
    // would scroll the clipping `.top` container and drag the whole map with
    // the fold (the harness samples consumer rects to catch exactly that).
    el[target]?.focus({ preventScroll: true });
  }, [missionsOpen, settingsOpen]);

  // Focus follows a first-run step once its destination is on screen: the map
  // canvas for the draw step (the surface drawing input lands on), the Site
  // select and the Mission Name input in Settings. preventScroll for the same
  // reason as a fold: while the view switch is still sliding, letting the
  // browser scroll the anchor into view would drag the clipping column with
  // it instead of letting it settle.
  useEffect(() => {
    if (focusNonce === 0) return;
    const step = firstRunFocus.current;
    firstRunFocus.current = null;
    if (!step) return;
    const root = pageRef.current;
    if (!root) return;
    const anchor =
      step === "draw"
        ? root.querySelector<HTMLElement>("#map-draw-surface canvas")
        : root.querySelector<HTMLElement>(step === "site" ? "#site-select" : "#mission-name");
    anchor?.focus({ preventScroll: true });
    // A focused anchor can sit below its panel's own fold (Settings is tall).
    // Bring it into view within that scrollport directly: the native
    // scrollIntoView also scrolls the clipping column, dragging a wide
    // screen's unfold with it (measured: .top scrollLeft 0 -> 323 mid-slide).
    const scroller = anchor?.closest<HTMLElement>("[data-panel-scroll]");
    if (anchor && scroller) {
      const box = anchor.getBoundingClientRect();
      const port = scroller.getBoundingClientRect();
      if (box.bottom > port.bottom) scroller.scrollTop += box.bottom - port.bottom + 8;
      else if (box.top < port.top) scroller.scrollTop -= port.top - box.top + 8;
    }
  }, [focusNonce]);

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

  // A first-run step: switch the narrow view or unfold the wide panel, then
  // hand focus to the step's anchor once it is on screen (spec §10). The list
  // reports which step; firstRunDestination holds where it lands.
  const navigateFirstRun = (step: FirstRunStep) => {
    const dest = firstRunDestination(step, !wide);
    if (dest.view) setView(dest.view);
    // Unfolded directly, not through foldSettings: that path hands focus to
    // the collapse button, and the step's anchor is where focus belongs.
    if (wide && step !== "draw") setSettingsOpen(true);
    firstRunFocus.current = dest.focus;
    setFocusNonce((n) => n + 1);
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

  // A pick from the map toolbar. The corner tapped for Remove corner belongs to
  // the shape the tool is about to act on or replace, so it does not survive.
  const pickTool = (m: DrawMode) => {
    setSelectedCorner(null);
    selectMode(m);
  };
  const clearSubject = () => setSpecState((s) => ({ ...s, orbit: { ...s.orbit, center: null } }));

  const preview_ = useMemo(() => preview(spec), [spec]);
  const areaHa = useMemo(() => areaHectares(spec.aoi), [spec.aoi]);

  // Editing a stored Mission loads its Spec and its Name. What the edit then
  // means is the store's decision, not the planner's: in place while Planned,
  // a new Mission that supersedes once Dispatched, refused once Loaded.
  // On a narrow screen, opening a Mission moves to the map, where it is.
  const editMission = (row: MissionRow) => {
    setSpecState(row.spec);
    setEditing({ id: row.id, name: row.name, base: row.updated_at });
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

  const onListRead = (read: MissionListRead) => setMissions(read.missions);
  // Edits that waited offline have reached the store: the Mission in the editor
  // is now at the version they wrote.
  const onSent = (sent: { id: string; updated_at?: string }[]) =>
    setEditing((e) => {
      const done = sent.findLast((s) => s.id === e.id);
      return done?.updated_at ? { ...e, base: done.updated_at } : e;
    });

  return (
    <main
      ref={pageRef}
      className={styles.page}
      data-view={view}
      data-network={noNetwork ? "offline" : "online"}
      data-missions={missionsOpen ? "open" : "closed"}
      data-settings={settingsOpen ? "open" : "closed"}
    >
      {/* The page's one top-level heading; the panels carry the h2s (UI-12 audit). */}
      <h1 className="visually-hidden">Mission Control</h1>
      <Notice key={notice?.key ?? "empty"} payload={notice} onDismiss={dismissNotice} />
      <div className={styles.top}>
        <div className={styles.heroLayer} aria-hidden="true">
          <HeroScene playing={view === "missions"} />
          <div className={styles.heroStill}>
            <HeroScene variant="still" playing={false} />
          </div>
        </div>
        <section id="missions-panel" className={`${styles.missions} glass-smoke`} aria-label="Missions" inert={wide ? !missionsOpen : view !== "missions"}>
          <div className={styles.panelHead}>
            <h2 className={styles.viewTitle}>Missions</h2>
            <button type="button" className={`primary ${styles.loadButton}`} onClick={() => setLoadOpen(true)}>
              Load
            </button>
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
          <MissionList onEdit={editMission} onCopy={copyMission} editingId={editing.id} onRead={onListRead} onSent={onSent} onNotice={showNotice} onFirstRunNavigate={navigateFirstRun} />
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
          noNetwork={down}
          onOfflineMap={setOfflineMap}
          />
          <MapToolbar
            spec={spec}
            mode={mode}
            areaHa={areaHa}
            onTool={pickTool}
            onClearArea={() => setAoi([], null)}
            onClearSubject={clearSubject}
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
        <section id="settings-panel" className={`${styles.settings} glass-smoke`} aria-label="Settings" inert={wide ? !settingsOpen : view !== "settings"}>
          <div className={styles.panelHead}>
            <h2 className={styles.heading}>
              Settings
              {pendingCount > 0 && <PendingBadge count={pendingCount} />}
            </h2>
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
          preview={preview_}
          sites={sites}
          editing={editing}
          missions={missions}
          offline={down}
          onNameChange={(name) => setEditing((e) => ({ ...e, name }))}
          onNotice={showNotice}
          onPendingCount={setPendingCount}
          />
        </section>
      </div>
      {/* The network switch is otherwise silent to assistive tech. */}
      <p className={styles.srOnly} role="status">
        {noNetwork ? "The map needs a connection." : ""}
      </p>
      <LoadSheet open={loadOpen} onClose={closeLoad} missions={missions} onNotice={showNotice} />
      <div ref={summaryRef} className={`glass-smoke ${styles.summary}`}>
        <SummaryBar
          spec={spec}
          preview={preview_}
          editing={editing}
          onSaved={(row) => {
            setEditing({ id: row.id, name: row.name, base: row.updated_at || undefined });
            // The Sheet may have changed the Site; the editor now shows what was saved.
            setSpecState((s) => ({ ...s, site: row.site, site_id: row.site_id }));
          }}
          onNotice={showNotice}
          sites={sites}
          edited={edited}
          countKey={openToken}
        />
      </div>
      <button
        ref={expandMissions}
        type="button"
        className={`glass-smoke ${styles.edgeTab} ${styles.edgeTabLeft}`}
        aria-expanded={false}
        aria-controls="missions-panel"
        aria-label="Expand Missions"
        onClick={() => foldMissions(true)}
        inert={missionsOpen}
      >
        ›
      </button>
      <button
        ref={expandSettings}
        type="button"
        className={`glass-smoke ${styles.edgeTab} ${styles.edgeTabRight}`}
        aria-expanded={false}
        aria-controls="settings-panel"
        aria-label={pendingCount > 0 ? `Expand Settings, ${waitingName(pendingCount)}` : "Expand Settings"}
        onClick={() => foldSettings(true)}
        inert={settingsOpen}
      >
        ‹
        {pendingCount > 0 && <PendingBadge count={pendingCount} className={styles.edgeBadge} />}
      </button>
      <nav className={styles.views} aria-label="Show">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? "active" : undefined}
            aria-pressed={view === v.id}
            aria-label={
              v.id === "settings" && pendingCount > 0 ? `Settings, ${waitingName(pendingCount)}` : undefined
            }
            onClick={() => setView(v.id)}
          >
            <ViewIcon view={v.id} />
            <span>{v.label}</span>
            {v.id === "settings" && pendingCount > 0 && (
              <PendingBadge count={pendingCount} className={styles.tabBadge} />
            )}
          </button>
        ))}
      </nav>
    </main>
  );
}
