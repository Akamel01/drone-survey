"use client";

import { useEffect, useRef, useState } from "react";
import {
  addProtocol,
  Map as MaplibreMap,
  Marker,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapLayerMouseEvent,
  type MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP, BASEMAP_OSM } from "@/lib/basemap";
import { MAX_ZOOM } from "@/lib/siteMap";
import { SITE_MAP_LAYERS, listSiteMaps, siteMapStyle, siteMapTile, subscribeSiteMaps, type SiteMap } from "@/lib/offlineMap";
import {
  canFinish,
  canRemoveCorner,
  clickMeaning,
  drawModeLabel,
  isDrawing,
  newSession,
  step,
} from "@/lib/areaEditing";
import type {
  DrawMode,
  EditContext,
  EditEffect,
  EditEvent,
  EditSession,
  HandleTarget,
  PressTarget,
} from "@/lib/areaEditing";
import type { CircleShape, MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import styles from "./MapPane.module.css";

// Every drawing rule lives in `lib/areaEditing`; this component is its
// adapter: MapLibre payloads in as `EditEvent`s, `EditEffect`s back out, and
// all the map paint, cursors and chrome stay here. The two names below are
// re-exported because the page and the Sidebar import them from this file.
export type { DrawMode };
export { isDrawing };

interface MapPaneProps {
  spec: MissionSpec;
  preview: Preview;
  mode: DrawMode;
  showNumbers: boolean;
  onShowNumbersChange: (v: boolean) => void;
  onAoiChange: (aoi: [number, number][], shape?: CircleShape | null) => void;
  onHomeChange: (home: [number, number]) => void;
  onPoiChange: (center: [number, number]) => void;
  onOrbitRadiusChange: (radiusM: number) => void;
  onModeChange: (mode: DrawMode) => void;
  /** Corner selected by tapping it on touch, for the Remove corner button. */
  selectedCorner: number | null;
  onSelectedCornerChange: (i: number | null) => void;
  /** A source-level map failure — in practice the basemap tiles — so the page
   *  can fall back to the hero scene. */
  onBasemapError?: () => void;
  /** The basemap's tiles are flowing again, so the page can drop its fallback. */
  onBasemapLoaded?: () => void;
  /** The basemap cannot be reached (no signal, or its tiles are failing). When
   *  the Site has a map kept for offline, the map shows that instead. */
  noNetwork: boolean;
  /** Whether the Site's offline map is what the map is showing, so the page
   *  does not put its no-network fallback over it. */
  onOfflineMap?: (shown: boolean) => void;
}

/** The source ids the basemaps in `lib/basemap.ts` carry. Error and sourcedata
 *  events identify a source but not a layer, so this is what says the basemap
 *  itself failed — or came back. */
const isBasemap = (id?: string) => id === "esri" || id === "osm";

const START = { lat: 49.1891, lon: -122.8396, zoom: 16 };
type LL = [number, number];

// GeoJSON is [lon, lat]; the spec/contract is [lat, lon]. Convert at the edges only.
const toLngLat = (p: LL): [number, number] => [p[1], p[0]];

const mPerLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Due east of a point, used to give a circle one radius handle to drag. */
const eastOf = (center: LL, radiusM: number): LL => [center[0], center[1] + radiusM / mPerLon(center[0])];

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

function polygonGeoJSON(ring: LL[]): GeoJSON.FeatureCollection {
  if (ring.length < 3) return fc([]);
  const coords = ring.map(toLngLat);
  coords.push(coords[0]);
  return fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } }]);
}

function pointsGeoJSON(points: LL[], props: (i: number) => object = () => ({})) {
  return fc(
    points.map((p, i) => ({
      type: "Feature" as const,
      properties: props(i),
      geometry: { type: "Point" as const, coordinates: toLngLat(p) },
    })),
  );
}

/** Midpoint of every edge — the handle that inserts a vertex on that edge. */
function midpointsGeoJSON(aoi: LL[], shape: CircleShape | null | undefined) {
  // `canFinish` is the same length test the panel uses.
  if (!canFinish(aoi) || shape) return fc([]);
  return fc(
    aoi.map((p, i) => {
      const q = aoi[(i + 1) % aoi.length];
      return {
        type: "Feature" as const,
        properties: { edgeIndex: i },
        geometry: { type: "Point" as const, coordinates: toLngLat([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]) },
      };
    }),
  );
}

function lineGeoJSON(points: LL[]) {
  if (points.length < 2) return fc([]);
  return fc([
    {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: points.map(toLngLat) },
    },
  ]);
}

/** What one photograph covers on the ground, drawn where the map is looking. */
function footprintGeoJSON(center: LL, acrossM: number, alongM: number) {
  if (!acrossM || !alongM) return fc([]);
  const dLat = alongM / 2 / 111132;
  const dLon = acrossM / 2 / mPerLon(center[0]);
  return polygonGeoJSON([
    [center[0] - dLat, center[1] - dLon],
    [center[0] - dLat, center[1] + dLon],
    [center[0] + dLat, center[1] + dLon],
    [center[0] + dLat, center[1] - dLon],
  ]);
}

/**
 * An arrowhead drawn to a canvas.
 *
 * Direction has to be readable at a glance, and a symbol layer placed along a
 * line gives evenly spaced, map-rotated arrows for free. It must be an *icon*
 * rather than a text character: the basemap style carries no `glyphs` URL, so a
 * text symbol would render nothing at all, and silently.
 */
function arrowImage(): ImageData {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f2f5f7";
  ctx.strokeStyle = "#06110f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size * 0.82, size * 0.5);
  ctx.lineTo(size * 0.3, size * 0.24);
  ctx.lineTo(size * 0.42, size * 0.5);
  ctx.lineTo(size * 0.3, size * 0.76);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function addLayers(map: MaplibreMap) {
  // The icon lives on the style, not on our sources, so a style reissue (the
  // basemap retry) drops it; restore it before the source guard returns.
  if (!map.hasImage("flight-arrow")) map.addImage("flight-arrow", arrowImage());
  if (map.getSource("aoi")) return; // already added for this style

  map.addSource("aoi", { type: "geojson", data: fc([]) });
  map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": "#4fb8a8", "fill-opacity": 0.18 } });
  map.addLayer({ id: "aoi-outline", type: "line", source: "aoi", paint: { "line-color": "#4fb8a8", "line-width": 2 } });

  map.addSource("footprint", { type: "geojson", data: fc([]) });
  map.addLayer({
    id: "footprint",
    type: "line",
    source: "footprint",
    paint: { "line-color": "#e0a94f", "line-width": 1.5, "line-dasharray": [3, 2] },
  });

  // One continuous line through every photo position in flight order, so the
  // turn from the end of one pass to the start of the next is visible and can
  // be judged. Drawing each pass separately hid exactly that.
  map.addSource("flight-path", { type: "geojson", data: fc([]) });
  map.addLayer({
    id: "flight-path",
    type: "line",
    source: "flight-path",
    paint: { "line-color": "#d8dcdf", "line-width": 1.5, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "flight-arrows",
    type: "symbol",
    source: "flight-path",
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 110,
      "icon-image": "flight-arrow",
      "icon-size": 0.45,
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addSource("flight-points", { type: "geojson", data: fc([]) });
  map.addLayer({
    id: "flight-points",
    type: "circle",
    source: "flight-points",
    paint: { "circle-radius": 2.5, "circle-color": "#e0704f" },
  });

  map.addSource("aoi-vertices", { type: "geojson", data: fc([]) });
  map.addLayer({
    id: "aoi-vertices",
    type: "circle",
    source: "aoi-vertices",
    paint: { "circle-radius": 5, "circle-color": "#4fb8a8", "circle-stroke-width": 1.5, "circle-stroke-color": "#06110f" },
  });

  // Hit layer for touch input: a 44px target over the same source, invisible.
  // It shares the vertices source, so it can never drift out of sync with it.
  map.addLayer({ id: "aoi-vertices-hit", type: "circle", source: "aoi-vertices", paint: { "circle-radius": 22, "circle-color": "#00000000", "circle-opacity": 0 } });

  // Smaller, amber handles distinct from the teal vertices: click to insert.
  map.addSource("aoi-midpoints", { type: "geojson", data: fc([]) });
  map.addLayer({
    id: "aoi-midpoints",
    type: "circle",
    source: "aoi-midpoints",
    paint: {
      "circle-radius": 4,
      "circle-color": "#e0a94f",
      "circle-opacity": 0.85,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#06110f",
    },
  });
  // Hit layer for touch input on midpoints: same source, invisible 44px target.
  map.addLayer({ id: "aoi-midpoints-hit", type: "circle", source: "aoi-midpoints", paint: { "circle-radius": 22, "circle-color": "#00000000", "circle-opacity": 0 } });

  // A circle — and an orbit — is edited as a centre and a radius.
  map.addSource("circle-handles", { type: "geojson", data: fc([]) });
  map.addLayer({
    id: "circle-handles",
    type: "circle",
    source: "circle-handles",
    paint: { "circle-radius": 6, "circle-color": "#4fb8a8", "circle-stroke-width": 2, "circle-stroke-color": "#06110f" },
  });
  // Hit layer for touch input on circle handles: same source, invisible 44px target.
  map.addLayer({ id: "circle-handles-hit", type: "circle", source: "circle-handles", paint: { "circle-radius": 22, "circle-color": "#00000000", "circle-opacity": 0 } });
}

// The overlay colours (background here, plus the fixed text/border ink) are
// untouched by the theme -- they have to read on satellite imagery whatever
// the chrome around them looks like. Only the shape (a full pill, not a
// corner-rounded box) and the type follow the new system.
function labelMarker(text: string, background: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `background:${background};color:#06110f;font:600 0.6875rem/1 var(--mono, monospace);
    letter-spacing:0.04em;padding:4px 10px;border-radius:999px;border:1px solid #06110f;white-space:nowrap;
    font-variant-numeric:tabular-nums;transform:translateY(-14px);pointer-events:none`;
  return el;
}

/** The tab bar's line-style icons live in plan/page.tsx (24 px grid, 1.5 px
 *  stroke, round caps and joins); the base-map icons below match that style so
 *  the map controls read as the same system. */
function SatelliteIcon() {
  return (
    <svg
      className={styles.baseIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" />
      <path d="M8.5 15.5 6.3 17.7M15.5 8.5l2.2-2.2" />
      <rect x="2.6" y="14.6" width="4.4" height="4.4" rx="0.5" transform="rotate(45 4.8 16.8)" />
      <rect x="17" y="5.2" width="4.4" height="4.4" rx="0.5" transform="rotate(45 19.2 7.4)" />
      <path d="M4.8 14.9v3.8M19.2 5.5v3.8" />
    </svg>
  );
}

/** Folded street map with road lines — the OpenStreetMap base map's mark. */
function OsmIcon() {
  return (
    <svg
      className={styles.baseIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
      <path d="M3.8 14.2 8 12.6l2.8-3.4 4.4.8 5-2" />
    </svg>
  );
}

const BASEMAP_NAMES = {
  esri: { button: "Satellite", item: "Satellite imagery" },
  osm: { button: "Street map", item: "Street map (OpenStreetMap)" },
} as const;

export default function MapPane({
  spec,
  preview,
  mode,
  showNumbers,
  onShowNumbersChange,
  onAoiChange,
  onHomeChange,
  onPoiChange,
  onOrbitRadiusChange,
  onModeChange,
  selectedCorner,
  onSelectedCornerChange,
  onBasemapError,
  onBasemapLoaded,
  noNetwork,
  onOfflineMap,
}: MapPaneProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const homeMarkerRef = useRef<Marker | null>(null);
  const poiMarkerRef = useRef<Marker | null>(null);
  const endMarkersRef = useRef<Marker[]>([]);
  const numberMarkersRef = useRef<Marker[]>([]);
  const [basemap, setBasemap] = useState<"esri" | "osm">("esri");
  // The Site's map kept for offline (PWA-2), shown in place of the basemap
  // while the basemap cannot be reached. `appliedStyle` is the style the map
  // has now, so the effect below swaps only on a real change.
  const [siteMaps, setSiteMaps] = useState<SiteMap[]>([]);
  const [offlineDrawn, setOfflineDrawn] = useState(0);
  const appliedStyle = useRef<string>("esri");
  const kept = siteMaps.find((m) => m.siteId === spec.site_id) ?? null;
  const showOffline = noNetwork && kept !== null;
  const [showFootprint, setShowFootprint] = useState(false);
  // The two map-control menus: one open at a time, closing dissolves (250ms,
  // spec §9.1) before unmount, so closingMenu keeps the leaving menu painted.
  const [openMenu, setOpenMenu] = useState<"base" | "overlays" | null>(null);
  const [closingMenu, setClosingMenu] = useState<"base" | "overlays" | null>(null);
  const baseBtnRef = useRef<HTMLButtonElement | null>(null);
  const overlaysBtnRef = useRef<HTMLButtonElement | null>(null);
  const baseMenuRef = useRef<HTMLDivElement | null>(null);
  const overlaysMenuRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a menu opens from the keyboard, so first-item focus happens once
  // the menu is painted; a mouse open leaves focus on the button.
  const focusMenuOnOpen = useRef(false);
  const [drawHint, setDrawHint] = useState<string | null>(null);
  // Why a finish did not happen. A double-click on a two-corner ring used to
  // commit nothing and say nothing, which reads exactly like a broken map.
  const [drawNote, setDrawNote] = useState<string | null>(null);
  // UI-20: the drawing panel's presence outlives the drawing mode by one exit
  // animation. closingDraw is set during the render that first sees the mode
  // leave drawing -- not in an effect, because Escape (window keydown) and the
  // map's dblclick close outside React's events, and an effect would paint one
  // frame with the panel already gone. The hold ends when the exit animation
  // does (`animationend` on the panel, below), not on a timer racing it: a
  // 160ms timer against the 150ms reduced-motion crossfade left 10ms, less
  // than one frame at 60Hz, so a late frame removed the node before the fade
  // had finished. The timer is only the backstop.
  const [closingDraw, setClosingDraw] = useState(false);
  // Previous-render bookkeeping. State, not refs: this lint's react-hooks/refs
  // (React Compiler) forbids touching a ref during render, and both values are
  // read during render to decide the hold.
  const [lastDrawMode, setLastDrawMode] = useState<DrawMode>("idle");
  const [wasDrawing, setWasDrawing] = useState(false);

  // The editing session -- which drag is armed, the pending circle centre, the
  // touch bookkeeping -- belongs to the module; the map only holds it. `run` is
  // built inside the init effect, where the map lives, and the panel buttons
  // and the window key listener reach it through here.
  const sessionRef = useRef<EditSession>(newSession());
  const runRef = useRef<((event: EditEvent) => void) | null>(null);

  // Adjusting state during render (React's documented pattern, guarded so it
  // cannot loop): the render that loses the drawing mode queues the exit hold
  // before React commits, so the panel's DOM node never unmounts in between.
  const drawing = isDrawing(mode);
  if (drawing) {
    if (lastDrawMode !== mode) setLastDrawMode(mode);
    if (!wasDrawing) setWasDrawing(true);
  } else if (wasDrawing) {
    if (!closingDraw) setClosingDraw(true);
    setWasDrawing(false);
  }
  if (drawing && closingDraw) setClosingDraw(false);
  // What the panel reads while it is on screen: the live mode, or the mode it
  // is leaving, so idle copy never flashes during the exit.
  const panelMode = drawing ? mode : lastDrawMode;

  // Backstop for the exit: the panel's own animationend normally ends it first,
  // and this covers a browser that never runs the animation. Drawing again
  // during the hold cancelled this timer already by flipping closingDraw back
  // during that render.
  useEffect(() => {
    if (!closingDraw) return;
    const t = setTimeout(() => setClosingDraw(false), 500);
    return () => clearTimeout(t);
  }, [closingDraw]);

  // The display-pill row's real height, read by the drawing / remove-corner
  // panel below 1000px wide (MapPane.module.css) so it starts under the pills
  // instead of over them -- the row can be one or two lines depending on how
  // the footprint label wraps, so a measured value is the only one that stays
  // true at every width and every label length.
  useEffect(() => {
    const wrap = wrapRef.current;
    const toggle = toggleRef.current;
    if (!wrap || !toggle) return;
    const ro = new ResizeObserver(() => {
      const box = toggle.getBoundingClientRect();
      wrap.style.setProperty("--toggle-h", `${box.height}px`);
      // The notice (a sibling of the map, not inside it) centres itself
      // between the Missions panel and these buttons on a wide screen, so it
      // never covers them; it reads their width from the document.
      document.documentElement.style.setProperty("--map-controls-w", `${box.width}px`);
    });
    ro.observe(toggle);
    return () => ro.disconnect();
  }, []);

  // Base map and overlays are different kinds of control, so they are two
  // buttons with two menus, never one row of four pills (decision 19). One
  // menu open at a time; every close returns focus to its button.
  const openMapMenu = (m: "base" | "overlays") => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setClosingMenu(null);
    setOpenMenu(m);
  };
  const closeMapMenu = (m: "base" | "overlays") => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu(null);
    setClosingMenu(m);
    closeTimer.current = setTimeout(() => setClosingMenu(null), 260);
    (m === "base" ? baseBtnRef : overlaysBtnRef).current?.focus();
  };

  // Tap-outside and Escape close the open menu (same code for touch and
  // mouse: pointerdown fires for both). The keydown listener runs on capture
  // and stops an Escape there, so the map's own Escape handler below -- which
  // cancels a draw -- does not also fire while a menu is open.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!toggleRef.current?.contains(e.target as Node)) closeMapMenu(openMenu);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMapMenu(openMenu);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [openMenu]);

  // Keyboard-opened menus start on their first item (spec §10).
  useEffect(() => {
    if (!openMenu || !focusMenuOnOpen.current) return;
    focusMenuOnOpen.current = false;
    const root = openMenu === "base" ? baseMenuRef.current : overlaysMenuRef.current;
    root?.querySelector<HTMLButtonElement>('[role^="menuitem"]')?.focus();
  }, [openMenu]);

  // Arrow keys move within a menu; the menu holds buttons, so Space and Enter
  // activate without extra code.
  const menuKeys = (e: React.KeyboardEvent, m: "base" | "overlays") => {
    const root = m === "base" ? baseMenuRef.current : overlaysMenuRef.current;
    const items = root ? [...root.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')] : [];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (items[i + 1] ?? items[0]).focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (items[i - 1] ?? items[items.length - 1]).focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };
  const menuBtnKeys = (e: React.KeyboardEvent, m: "base" | "overlays") => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuOnOpen.current = true;
      openMapMenu(m);
    }
  };

  // A mode change discards the gesture state and the hint, as the old handler
  // block's changeMode did. A Sidebar-driven mode change is context and never
  // reaches here, exactly as it never cleared the old refs.
  const changeMode = (next: DrawMode) => {
    if (next !== "draw-circle") {
      sessionRef.current = newSession();
      setDrawHint(null);
    }
    setDrawNote(null);
    onSelectedCornerChange(null);
    onModeChange(next);
  };

  // The polygon draws are the only ones that do not end themselves, so they are
  // the only ones that need an end; the module owns what an end means.
  const finishDraw = () => {
    runRef.current?.({ type: "finish" });
  };

  // Escape and the Cancel button are the same act, so they are the same code.
  const cancelDraw = () => {
    runRef.current?.({ type: "cancel" });
  };

  // Latest props, readable from map handlers registered once on init. This must
  // be refreshed on every render: without it the handlers keep reading the spec
  // as it was at mount, and every click would see an empty area.
  const latest = {
    spec,
    mode,
    onAoiChange,
    onHomeChange,
    onPoiChange,
    onOrbitRadiusChange,
    onModeChange: changeMode,
    finishDraw,
    cancelDraw,
    selectedCorner,
    onSelectedCornerChange,
    onBasemapError,
    onBasemapLoaded,
    onOfflineMap,
  };
  const stateRef = useRef(latest);
  useEffect(() => {
    stateRef.current = latest;
  });

  useEffect(() => {
    const read = () => void listSiteMaps().then(setSiteMaps);
    read();
    return subscribeSiteMaps(read);
  }, []);

  useEffect(() => {
    const key = showOffline && kept ? `offline:${kept.siteId}:${kept.savedAt}` : basemap;
    if (key !== appliedStyle.current) {
      appliedStyle.current = key;
      const map = mapRef.current;
      map?.setStyle(showOffline && kept ? siteMapStyle(kept) : basemap === "esri" ? BASEMAP : BASEMAP_OSM);
      // The map is only drawn where tiles were kept: bring the Site into view.
      if (map && showOffline && kept) {
        const { west, south, east, north } = kept.bounds;
        const { lng, lat } = map.getCenter();
        if (lng < west || lng > east || lat < south || lat > north) {
          map.fitBounds([[west, south], [east, north]], { duration: 0, maxZoom: MAX_ZOOM });
        }
      }
    }
    stateRef.current.onOfflineMap?.(showOffline);
  }, [showOffline, kept, basemap]);

  useEffect(() => {
    addProtocol("sitemap", siteMapTile);
    const map = new MaplibreMap({
      container: containerRef.current!,
      style: BASEMAP,
      center: [START.lon, START.lat],
      zoom: START.zoom,
    });
    mapRef.current = map;
    // MapLibre watches the window, not its own box. On a narrow screen the map
    // is created hidden behind the Missions view, and a column beside it can
    // change width; either way it would draw into a stale size -- or none.
    const fit = new ResizeObserver(() => map.resize());
    fit.observe(containerRef.current!);
    map.doubleClickZoom.disable();
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    // A map that fails to add a source otherwise fails silently, and the data
    // push below just returns early for ever. Say so instead. A failure tied to
    // a source means its tiles never arrived, which is the page's cue to show
    // the hero scene instead of an empty map.
    let gone = false;
    let tileRetryAt = 0;
    map.on("error", (e) => {
      console.error("[map]", e.error?.message ?? e);
      // MapLibre puts `sourceId` on the event when a source's tiles fail,
      // though its ErrorEvent type does not declare it.
      if (isBasemap((e as { sourceId?: string }).sourceId)) {
        stateRef.current.onBasemapError?.();
        // MapLibre does not re-request tiles that errored, so a transient
        // failure -- a 5xx, a DNS blip, a blocked route -- would strand the
        // fallback until reload even though the network recovered. Reissuing
        // the same style with `diff: false` makes it ask for the tiles again;
        // the overlays re-add themselves on the resulting `style.load`.
        // Throttled so a persistently failing tile cannot spin in a retry loop.
        if (Date.now() - tileRetryAt > 30_000) {
          tileRetryAt = Date.now();
          setTimeout(() => {
            if (!gone) map.setStyle(map.getStyle(), { diff: false });
          }, 5_000);
        }
      }
    });
    // The same source delivering tiles again is the page's cue to drop the
    // fallback, instead of staying on it until reload.
    map.on("sourcedata", (e) => {
      if (isBasemap(e.sourceId) && e.isSourceLoaded) stateRef.current.onBasemapLoaded?.();
    });
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __map?: MaplibreMap }).__map = map;
    }

    // What the Site's offline map has drawn, for the wrapper's data-drawn.
    map.on("idle", () => {
      if (appliedStyle.current.startsWith("offline:") && map.getLayer("offline-roads")) {
        setOfflineDrawn(map.queryRenderedFeatures({ layers: SITE_MAP_LAYERS }).length);
      }
    });

    map.on("load", () => addLayers(map));
    map.on("style.load", () => addLayers(map));

    // The editing handles sit on top of everything else, so anything that reacts
    // to a press on the map has to know when the press was really on a handle.
    // The mouse keeps the exact pre-touch query; touch adds the invisible hit
    // layers, which must never widen what the mouse grabs.
    const VISIBLE_HANDLES = ["aoi-vertices", "aoi-midpoints", "circle-handles"];
    const TOUCH_HANDLES = [...VISIBLE_HANDLES, "aoi-vertices-hit", "aoi-midpoints-hit", "circle-handles-hit"];

    /** What the query found under a point, in the module's words. Handles come
     *  first: a press on one is an edit of a handle, never of the fill beneath. */
    const handleAt = (point: MapMouseEvent["point"], layers: string[]): HandleTarget | null => {
      if (map.getLayer("aoi-vertices") === undefined) return null;
      const hit = map.queryRenderedFeatures(point, { layers })[0];
      if (!hit) return null;
      const id = hit.layer.id;
      if (id.startsWith("aoi-vertices")) return { kind: "vertex", index: hit.properties!.index as number };
      if (id.startsWith("aoi-midpoints")) return { kind: "midpoint", edgeIndex: hit.properties!.edgeIndex as number };
      return { kind: "circle", part: hit.properties!.kind as "center" | "radius" };
    };
    // A layer that has not been added yet must not be queried: MapLibre fires
    // an error event for it and returns an empty list.
    const pressTarget = (point: MapMouseEvent["point"], pointer: "mouse" | "touch"): PressTarget | null =>
      map.getLayer("aoi-vertices") === undefined
        ? null
        : (handleAt(point, pointer === "mouse" ? VISIBLE_HANDLES : TOUCH_HANDLES) ??
          (map.queryRenderedFeatures(point, { layers: ["aoi-fill"] }).length > 0 ? { kind: "fill" } : null));

    // The plan facts the rules read, rebuilt from the freshest props per event:
    // the handlers registered once on init must not see the mount-time spec.
    const context = (): EditContext => {
      const s = stateRef.current;
      return { mode: s.mode, aoi: s.spec.aoi, shape: s.spec.shape ?? null, missionType: s.spec.mission_type, orbitCenter: s.spec.orbit.center };
    };

    const cursorRest = () => (stateRef.current.mode === "idle" ? "" : "crosshair");
    // Arming a drag holds the map still; the transition below is what lets go.
    const holdMap = () => {
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };
    const releaseMap = () => {
      map.dragPan.enable();
      map.getCanvas().style.cursor = cursorRest();
    };

    /** Apply one effect from the module. Callbacks are read off `stateRef` per
     *  effect, never off the mount-time closure. */
    const apply = (e: EditEffect) => {
      const s = stateRef.current;
      if (e.kind === "area") s.onAoiChange(e.aoi, e.shape);
      else if (e.kind === "poi") s.onPoiChange(e.center);
      else if (e.kind === "orbit-radius") s.onOrbitRadiusChange(e.radiusM);
      else if (e.kind === "hint") setDrawHint(e.text);
      else if (e.kind === "note") setDrawNote(e.text);
      else if (e.kind === "mode") s.onModeChange(e.mode);
      else if (e.kind === "select") s.onSelectedCornerChange(e.index);
      else if (e.kind === "preview") (map.getSource("aoi") as GeoJSONSource | undefined)?.setData(polygonGeoJSON(e.aoi));
    };

    // One event in: the module decides, the adapter applies. The map is held or
    // released on the drag transition, compared after the effects -- a mode
    // effect goes through changeMode, which resets the session.
    const run = (event: EditEvent) => {
      const before = sessionRef.current;
      const result = step(before, context(), event);
      sessionRef.current = result.session;
      for (const effect of result.effects) apply(effect);
      if (before.drag === null && sessionRef.current.drag !== null) holdMap();
      else if (before.drag !== null && sessionRef.current.drag === null) releaseMap();
    };
    runRef.current = run;

    // Placing the take-off point or the orbit's subject is not area editing, so
    // those one-shot placements stay here; the module keeps the drawing rules.
    // The click veto is the visible-layer query for both inputs.
    map.on("click", (e: MapMouseEvent) => {
      const { mode, onHomeChange, onPoiChange, onModeChange } = stateRef.current;
      const p: LL = [e.lngLat.lat, e.lngLat.lng];
      if (mode === "set-home") { onHomeChange(p); onModeChange("idle"); return; }
      if (mode === "set-poi") { onPoiChange(p); onModeChange("idle"); return; }
      run({ type: "click", at: p, target: handleAt(e.point, VISIBLE_HANDLES) });
    });

    // A double-click still finishes a draw, for the operator who already knows
    // it does; the Finish button above the map is for the one who does not.
    map.on("dblclick", () => run({ type: "dblclick" }));

    // A corner handle is live wherever it is drawn: arming the drag only in
    // `idle` left every corner placed while drawing visibly grabbable and
    // dead, and the press panned the map instead (#122). The circle handles
    // keep their idle gate, which the module applies. One generic press per
    // input, handles before fill -- the old per-layer veto, once. A refusal
    // comes back as the same session and must not preventDefault; the old
    // layer-scoped handlers did not for one either.
    const pressOn = (e: MapMouseEvent | MapTouchEvent, pointer: "mouse" | "touch") => {
      const target = pressTarget(e.point, pointer);
      if (!target) return;
      const before = sessionRef.current;
      run({ type: "press", at: [e.lngLat.lat, e.lngLat.lng], target, pointer, point: { x: e.point.x, y: e.point.y } });
      if (sessionRef.current !== before && sessionRef.current.drag !== null) e.preventDefault();
    };
    map.on("mousedown", (e: MapMouseEvent) => pressOn(e, "mouse"));
    map.on("touchstart", (e: MapTouchEvent) => pressOn(e, "touch"));

    map.on("contextmenu", "aoi-vertices", (e: MapLayerMouseEvent) => {
      const { spec } = stateRef.current;
      // The guard keeps the browser menu closed on a refusal; the rule itself
      // (including refusing when a circle is present) is the module's.
      if (!e.features?.length || spec.shape) return;
      e.preventDefault();
      e.originalEvent.preventDefault();
      run({ type: "remove-corner", index: e.features[0].properties!.index as number });
    });

    const moveTo = (e: MapMouseEvent | MapTouchEvent, pointer: "mouse" | "touch") =>
      run({ type: "move", at: [e.lngLat.lat, e.lngLat.lng], pointer, point: { x: e.point.x, y: e.point.y } });

    // Rubber-bands are module previews now: the adapter paints them straight
    // into the source and the data push below leaves them alone.
    map.on("mousemove", (e: MapMouseEvent) => moveTo(e, "mouse"));

    map.on("mouseup", () => run({ type: "release" }));
    // A touch that never moved is a tap on a corner, which the module turns
    // into a selection for the Remove corner button instead of a drag.
    map.on("touchend", () => run({ type: "release" }));
    map.on("touchcancel", () => {
      // The browser cancelled the gesture, so the cursor always comes back --
      // even when no drag was armed to release.
      run({ type: "touchcancel" });
      map.getCanvas().style.cursor = cursorRest();
    });
    for (const layer of TOUCH_HANDLES) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "grab"; });
      map.on("mouseleave", layer, () => {
        const drag = sessionRef.current.drag;
        if (drag === null || (drag.kind !== "vertex" && drag.kind !== "circle")) map.getCanvas().style.cursor = cursorRest();
      });
    }
    map.on("mouseenter", "aoi-fill", () => {
      const { mode, spec } = stateRef.current;
      if (mode === "idle" && spec.mission_type !== "orbit") map.getCanvas().style.cursor = "move";
    });
    map.on("mouseleave", "aoi-fill", () => {
      if (sessionRef.current.drag?.kind !== "shape") map.getCanvas().style.cursor = cursorRest();
    });

    // Touch move runs the same event as the mouse; the module's tap gate is
    // what holds a barely-moved finger still.
    map.on("touchmove", (e: MapTouchEvent) => moveTo(e, "touch"));

    const onKeydown = (e: KeyboardEvent) => {
      const { cancelDraw, finishDraw } = stateRef.current;
      if (e.key === "Escape") {
        cancelDraw();
        return;
      }
      if (e.key === "Enter") finishDraw();
    };
    window.addEventListener("keydown", onKeydown);

    return () => {
      gone = true;
      runRef.current = null;
      window.removeEventListener("keydown", onKeydown);
      fit.disconnect();
      map.remove();
    };
  }, []);

  // Push data into the live sources whenever the spec or the preview changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("aoi")) return;
    const isOrbit = spec.mission_type === "orbit";
    const set = (id: string, data: GeoJSON.FeatureCollection) =>
      (map.getSource(id) as GeoJSONSource).setData(data);

    if (!sessionRef.current.previewing) set("aoi", isOrbit ? fc([]) : polygonGeoJSON(spec.aoi));
    set("aoi-vertices", isOrbit || spec.shape ? fc([]) : pointsGeoJSON(spec.aoi, (i) => ({ index: i })));
    // The tapped corner reads selected in amber; the rest stay teal.
    if (map.getLayer("aoi-vertices")) {
      map.setPaintProperty("aoi-vertices", "circle-color", [
        "case",
        ["==", ["get", "index"], selectedCorner ?? -1],
        "#e0a44f",
        "#4fb8a8",
      ]);
    }
    // Hidden while a shape is being drawn: there, a click on the map appends a
    // corner, and an insert handle sitting on the outline would make the two
    // indistinguishable. The corner handles carry no such ambiguity, so they
    // stay, and stay live (#122).
    set("aoi-midpoints", isOrbit || mode !== "idle" ? fc([]) : midpointsGeoJSON(spec.aoi, spec.shape));

    const handles: GeoJSON.Feature[] = [];
    const circle = isOrbit
      ? spec.orbit.center
        ? { center: spec.orbit.center, radius_m: spec.orbit.radius_m }
        : null
      : spec.shape;
    if (circle) {
      handles.push({
        type: "Feature",
        properties: { kind: "center" },
        geometry: { type: "Point", coordinates: toLngLat(circle.center) },
      });
      handles.push({
        type: "Feature",
        properties: { kind: "radius" },
        geometry: { type: "Point", coordinates: toLngLat(eastOf(circle.center, circle.radius_m)) },
      });
    }
    set("circle-handles", fc(handles));

    set("flight-path", lineGeoJSON(preview.points));
    set("flight-points", pointsGeoJSON(preview.points));
  });

  // What one photograph covers at this altitude, against what the map is showing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const paint = () => {
      const src = map.getSource("footprint") as GeoJSONSource | undefined;
      if (!src) return;
      const c = map.getCenter();
      src.setData(
        showFootprint
          ? footprintGeoJSON([c.lat, c.lng], preview.footprint_across_m, preview.footprint_along_m)
          : fc([]),
      );
    };
    paint();
    map.on("move", paint);
    return () => {
      map.off("move", paint);
    };
  }, [showFootprint, preview.footprint_across_m, preview.footprint_along_m]);

  // Where the path begins and where it ends, so a wasteful route is obvious.
  useEffect(() => {
    const map = mapRef.current;
    endMarkersRef.current.forEach((m) => m.remove());
    endMarkersRef.current = [];
    if (!map || preview.points.length < 2) return;
    const start = new Marker({ element: labelMarker("START", "#4fb8a8"), anchor: "bottom" })
      .setLngLat(toLngLat(preview.points[0]))
      .addTo(map);
    const end = new Marker({ element: labelMarker("END", "#e0704f"), anchor: "bottom" })
      .setLngLat(toLngLat(preview.points[preview.points.length - 1]))
      .addTo(map);
    endMarkersRef.current = [start, end];
  }, [preview.points]);

  // Capture order, off by default: a number on every position crowds the map.
  useEffect(() => {
    const map = mapRef.current;
    numberMarkersRef.current.forEach((m) => m.remove());
    numberMarkersRef.current = [];
    if (!map || !showNumbers) return;
    numberMarkersRef.current = preview.points.map((p, i) => {
      const el = document.createElement("div");
      el.textContent = String(i + 1);
      el.style.cssText = `color:#f2f5f7;font:600 0.625rem/1 var(--mono, monospace);
        text-shadow:0 0 3px #06110f,0 0 3px #06110f;pointer-events:none;transform:translate(6px,-6px)`;
      return new Marker({ element: el, anchor: "left" }).setLngLat(toLngLat(p)).addTo(map);
    });
  }, [preview.points, showNumbers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!spec.home) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }
    if (!homeMarkerRef.current) {
      const el = document.createElement("div");
      el.className = styles.homeMarker;
      homeMarkerRef.current = new Marker({ element: el, anchor: "center" });
    }
    homeMarkerRef.current.setLngLat(toLngLat(spec.home)).addTo(map);
  }, [spec.home]);

  // The subject an orbit is flown around.
  useEffect(() => {
    const map = mapRef.current;
    const center = spec.orbit.center;
    if (!map || spec.mission_type !== "orbit" || !center) {
      poiMarkerRef.current?.remove();
      poiMarkerRef.current = null;
      return;
    }
    if (!poiMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:#e0a94f;
        border:2px solid #06110f;box-shadow:0 0 0 4px rgba(224,169,79,0.25)`;
      poiMarkerRef.current = new Marker({ element: el, anchor: "center" });
    }
    poiMarkerRef.current.setLngLat(toLngLat(center)).addTo(map);
  }, [spec.mission_type, spec.orbit.center]);

  // The outline says which mode the map is in. Teal and solid is a finished
  // area a click leaves alone; amber and dashed is one still being drawn, where
  // a click adds a corner. Without this the only difference on the map was the
  // absence of the midpoint handles, which is far too quiet to read as a mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mode === "idle" ? "" : "crosshair";
    if (!map.getLayer("aoi-outline")) return;
    // Local, not the render-scope `drawing`: the effect's deps are [mode], and
    // exhaustive-deps would ask for the derived variable too.
    const drawing = isDrawing(mode);
    map.setPaintProperty("aoi-outline", "line-color", drawing ? "#e0a94f" : "#4fb8a8");
    map.setPaintProperty("aoi-outline", "line-dasharray", drawing ? [2, 2] : undefined);
  }, [mode]);

  // What a click on the map does while the panel is up: the live mode, or the
  // one it is leaving, so the exit never switches to idle copy. Not what
  // dragging a finished shape would do. The copy itself is the module's.
  const meaning = clickMeaning(panelMode, spec.aoi.length, drawHint);

  const footprintLabel = preview.footprint_across_m
    ? `${Math.round(preview.footprint_across_m)} × ${Math.round(preview.footprint_along_m)} m`
    : "";
  const overlaysOn = (showNumbers ? 1 : 0) + (showFootprint ? 1 : 0);

  return (
    <div ref={wrapRef} className={styles.wrap} data-basemap={showOffline ? "offline" : basemap} data-drawn={showOffline ? offlineDrawn : 0}>
      {/* The draw step's focus anchor: MapLibre's canvas inside this host is
          the map's own focusable control surface (tabindex 0, role region,
          "Map" label), and where every draw gesture lands. */}
      <div ref={containerRef} className={styles.map} id="map-draw-surface" />
      <div ref={toggleRef} className={styles.basemapToggle} role="group" aria-label="Map display">
        {/* Near what it affects: display options for the map live on the map. */}
        <div className={styles.menuWrap}>
          <button
            ref={baseBtnRef}
            className={styles.pill}
            aria-haspopup="menu"
            aria-expanded={openMenu === "base"}
            aria-label={`Base map: ${showOffline ? "Offline map" : BASEMAP_NAMES[basemap].button}`}
            onClick={() => (openMenu === "base" ? closeMapMenu("base") : openMapMenu("base"))}
            onKeyDown={(e) => menuBtnKeys(e, "base")}
          >
            <span className={styles.layersGlyph} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M8 1.5 14.5 5 8 8.5 1.5 5Z" />
                <path d="m1.5 8.5 6.5 3.5 6.5-3.5" />
                <path d="m1.5 11.5 6.5 3.5 6.5-3.5" />
              </svg>
            </span>
            {basemap === "esri" ? <SatelliteIcon /> : <OsmIcon />}
          </button>
          {(openMenu === "base" || closingMenu === "base") && (
            <div
              ref={baseMenuRef}
              role="menu"
              aria-label="Base map"
              className={`${styles.menu} ${closingMenu === "base" ? styles.menuClosing : ""}`}
              onKeyDown={(e) => menuKeys(e, "base")}
            >
              {(
                [
                  { id: "esri", Icon: SatelliteIcon },
                  { id: "osm", Icon: OsmIcon },
                ] as const
              ).map(({ id, Icon }, i) => (
                <button
                  key={id}
                  role="menuitemradio"
                  aria-checked={basemap === id}
                  aria-label={BASEMAP_NAMES[id].item}
                  className={`${styles.menuItem} ${basemap === id ? styles.menuItemActive : ""}`}
                  style={{ animationDelay: `calc(var(--stagger) * ${i})` }}
                  onClick={() => {
                    setBasemap(id);
                    closeMapMenu("base");
                  }}
                >
                  <span className={styles.menuCheck} aria-hidden="true">
                    {basemap === id ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m3 8.5 3.5 3.5L13 4.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className={styles.menuItemIcon}>
                    <Icon />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.menuWrap}>
          <button
            ref={overlaysBtnRef}
            className={styles.pill}
            aria-haspopup="menu"
            aria-expanded={openMenu === "overlays"}
            aria-label={overlaysOn ? `Overlays, ${overlaysOn} on` : "Overlays, none on"}
            onClick={() => (openMenu === "overlays" ? closeMapMenu("overlays") : openMapMenu("overlays"))}
            onKeyDown={(e) => menuBtnKeys(e, "overlays")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 1.5h7a2 2 0 0 1 2 2v7" />
              <rect x="1.5" y="5.5" width="9" height="9" rx="2" />
            </svg>
            <span className={styles.btnLabel} aria-hidden="true">
              {overlaysOn ? `Overlays · ${overlaysOn}` : "Overlays"}
            </span>
            {overlaysOn > 0 && (
              <span className={styles.countBadge} aria-hidden="true">
                {overlaysOn}
              </span>
            )}
          </button>
          {(openMenu === "overlays" || closingMenu === "overlays") && (
            <div
              ref={overlaysMenuRef}
              role="menu"
              aria-label="Overlays"
              className={`${styles.menu} ${closingMenu === "overlays" ? styles.menuClosing : ""}`}
              onKeyDown={(e) => menuKeys(e, "overlays")}
            >
              <button
                role="menuitemcheckbox"
                aria-checked={showNumbers}
                className={`${styles.menuItem} ${showNumbers ? styles.menuItemActive : ""}`}
                style={{ animationDelay: "calc(var(--stagger) * 0)" }}
                onClick={() => onShowNumbersChange(!showNumbers)}
                title="Number each photo position in capture order"
              >
                <span className={styles.menuCheck} aria-hidden="true">
                  {showNumbers ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 8.5 3.5 3.5L13 4.5" />
                    </svg>
                  ) : null}
                </span>
                Numbers
              </button>
              <button
                role="menuitemcheckbox"
                aria-checked={showFootprint}
                className={`${styles.menuItem} ${showFootprint ? styles.menuItemActive : ""}`}
                style={{ animationDelay: "calc(var(--stagger) * 1)" }}
                onClick={() => setShowFootprint(!showFootprint)}
                title={`What one photograph covers at this altitude${footprintLabel ? `: ${footprintLabel}` : ""}`}
              >
                <span className={styles.menuCheck} aria-hidden="true">
                  {showFootprint ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 8.5 3.5 3.5L13 4.5" />
                    </svg>
                  ) : null}
                </span>
                {showFootprint && footprintLabel ? footprintLabel : "Footprint"}
              </button>
            </div>
          )}
        </div>
      </div>
      {(drawing || closingDraw) && (
        <div
          className={`${styles.drawPanel} glass-smoke ${drawing ? styles.drawPanelLive : styles.drawPanelClosing}`}
          onAnimationEnd={(e) => {
            if (!drawing && e.target === e.currentTarget && e.animationName.endsWith("drawPanelOut")) setClosingDraw(false);
          }}
        >
          <div className={styles.drawTitle}>{drawModeLabel(panelMode)}</div>
          <div className={styles.drawClick}>{meaning}</div>
          {drawNote && (
            <div className={styles.drawNote} aria-live="polite">
              {drawNote}
            </div>
          )}
          <div className={styles.drawActions}>
            {(panelMode === "draw-polygon" || panelMode === "append-polygon") && (
              <button onClick={finishDraw} disabled={!canFinish(spec.aoi)}>
                Finish area
              </button>
            )}
            <button onClick={cancelDraw}>Cancel</button>
          </div>
        </div>
      )}
      {/* Remove-corner action panel appears only when idle and a valid corner is selected. */}
      {mode === "idle" && selectedCorner != null && spec.mission_type !== "orbit" && !spec.shape && (
        <div className={`${styles.drawPanel} glass-smoke`}>
          <div className={styles.drawTitle}>Remove corner</div>
          <div className={styles.drawHint}>Tap the corner on the map to remove. Corners must remain at least three.</div>
          <div className={styles.drawActions}>
            <button
              onClick={() => {
                if (selectedCorner == null) return;
                runRef.current?.({ type: "remove-corner", index: selectedCorner });
              }}
              disabled={!canRemoveCorner(spec.aoi, selectedCorner)}
              title={selectedCorner == null ? "Tap a corner on the map first" : `Remove corner ${selectedCorner + 1}`}
            >
              {selectedCorner == null ? "Remove corner" : `Remove corner ${selectedCorner + 1}`}
            </button>
            <button onClick={() => onSelectedCornerChange(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
