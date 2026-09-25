"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  Marker,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
  type MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP, BASEMAP_OSM } from "@/lib/basemap";
import { insertCorner, isTap, moveCorner, removeCorner, trimDoubleClick } from "@/lib/aoi";
import { circlePolygon, geodesicM } from "@/lib/mission";
import type { CircleShape, MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import styles from "./MapPane.module.css";

export type DrawMode =
  | "idle"
  | "draw-polygon"
  | "draw-rectangle"
  | "draw-circle"
  | "append-polygon"
  | "set-home"
  | "set-poi";

/** A mode in which a click on the map places part of a shape, rather than editing one. */
export const isDrawing = (m: DrawMode) =>
  m === "draw-polygon" || m === "draw-rectangle" || m === "draw-circle" || m === "append-polygon";

/** The one thing a click on the map does in each drawing mode, in the operator's words. */
export function drawModeLabel(m: DrawMode): string {
  if (m === "draw-polygon") return "Drawing a polygon";
  if (m === "append-polygon") return "Adding corners to the area";
  if (m === "draw-rectangle") return "Drawing a rectangle";
  if (m === "draw-circle") return "Drawing a circle";
  return "";
}

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
  if (aoi.length < 3 || shape) return fc([]);
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

function labelMarker(text: string, background: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `background:${background};color:#06110f;font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.06em;padding:4px 6px;border-radius:4px;border:1px solid #06110f;white-space:nowrap;
    transform:translateY(-14px);pointer-events:none`;
  return el;
}

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
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const homeMarkerRef = useRef<Marker | null>(null);
  const poiMarkerRef = useRef<Marker | null>(null);
  const endMarkersRef = useRef<Marker[]>([]);
  const dragLockRef = useRef(false);
  const numberMarkersRef = useRef<Marker[]>([]);
  const [basemap, setBasemap] = useState<"esri" | "osm">("esri");
  const [showFootprint, setShowFootprint] = useState(false);
  const [drawHint, setDrawHint] = useState<string | null>(null);
  // Why a finish did not happen. A double-click on a two-corner ring used to
  // commit nothing and say nothing, which reads exactly like a broken map.
  const [drawNote, setDrawNote] = useState<string | null>(null);

  const dragIndexRef = useRef<number | null>(null);
  const circleDragRef = useRef<null | "center" | "radius">(null);
  const circleCenterRef = useRef<LL | null>(null);
  // Touch press bookkeeping: where the finger landed and which handle it armed,
  // so touchend can tell a tap (selects the corner) from a drag (moves it).
  const touchStartRef = useRef<{ x: number; y: number; index: number; kind: "vertex" | "midpoint" | "circle" | "fill" } | null>(null);
  const touchMovedRef = useRef(false);
  const shapeDragRef = useRef<null | { start: LL; aoi: LL[]; shape: CircleShape | null }>(null);
  // True while a shape is being rubber-banded, so the data push below leaves the
  // live preview alone instead of overwriting it from the committed spec.
  const drawingRef = useRef(false);

  // Leaving a draw mode half-finished must not leave the shape behind, so every
  // mode change discards it. An effect on `mode` would cost a second render.
  const changeMode = (next: DrawMode) => {
    if (next !== "draw-circle") {
      circleCenterRef.current = null;
      drawingRef.current = false;
      setDrawHint(null);
    }
    setDrawNote(null);
    onSelectedCornerChange(null);
    onModeChange(next);
  };

  // The polygon draws are the only ones that do not end themselves, so they are
  // the only ones that need an end. Refusing a short ring out loud is the point:
  // silence here is what made a slow double-click look like a dead map.
  const finishDraw = () => {
    const { spec, mode, onAoiChange } = stateRef.current;
    if (mode !== "draw-polygon" && mode !== "append-polygon") return;
    if (spec.aoi.length < 3) {
      setDrawNote(`An area needs three corners — ${3 - spec.aoi.length} to go.`);
      return;
    }
    onAoiChange(spec.aoi, spec.shape ?? null);
    changeMode("idle");
  };

  // Escape and the Cancel button are the same act, so they are the same code. A
  // shape mode cleared the area on the way in, so there is nothing to keep; a
  // corner-adding mode found an area already there, so it keeps it.
  const cancelDraw = () => {
    const { spec, mode, onAoiChange } = stateRef.current;
    if (mode === "draw-polygon" || mode === "draw-rectangle" || mode === "draw-circle") {
      if (spec.aoi.length) onAoiChange([], null);
    }
    changeMode("idle");
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
  };
  const stateRef = useRef(latest);
  useEffect(() => {
    stateRef.current = latest;
  });

  useEffect(() => {
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

    map.on("load", () => addLayers(map));
    map.on("style.load", () => addLayers(map));

    // The editing handles sit on top of everything else, so anything that reacts
    // to a press on the map has to know when the press was really on a handle.
    // The mouse keeps the exact pre-touch query; touch adds the invisible hit
    // layers, which must never widen what the mouse grabs.
    const VISIBLE_HANDLES = ["aoi-vertices", "aoi-midpoints", "circle-handles"];
    const TOUCH_HANDLES = [...VISIBLE_HANDLES, "aoi-vertices-hit", "aoi-midpoints-hit", "circle-handles-hit"];
    const handlesAt = (point: MapMouseEvent["point"], layers: string[]) =>
      map.getLayer("aoi-vertices") !== undefined && map.queryRenderedFeatures(point, { layers }).length > 0;
    const onHandle = (point: MapMouseEvent["point"]) => handlesAt(point, VISIBLE_HANDLES);
    const onTouchHandle = (point: MapMouseEvent["point"]) => handlesAt(point, TOUCH_HANDLES);

    // One press-and-drag core for mouse and touch. The event wrappers translate
    // their event into plain data and call these, so neither input owns the
    // logic and the two paths cannot drift apart.
    const holdMap = () => {
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };
    const startVertexDrag = (index: number) => {
      dragIndexRef.current = index;
      holdMap();
    };
    const startMidpointDrag = (edge: number, at: LL) => {
      const { spec, onAoiChange } = stateRef.current;
      onAoiChange(insertCorner(spec.aoi, edge, at), spec.shape);
      dragIndexRef.current = edge + 1;
      holdMap();
    };
    const startCircleDrag = (kind: "center" | "radius") => {
      circleDragRef.current = kind;
      holdMap();
    };
    const startShapeDrag = (at: LL) => {
      const { spec } = stateRef.current;
      shapeDragRef.current = { start: at, aoi: spec.aoi, shape: spec.shape ?? null };
      holdMap();
    };
    // Where the finger presses down, so touchend can tell a tap (selects the
    // corner) from a drag (moves it). Mouse needs none of this.
    const noteTouchStart = (
      x: number,
      y: number,
      index: number,
      kind: "vertex" | "midpoint" | "circle" | "fill",
    ) => {
      touchStartRef.current = { x, y, index, kind };
      touchMovedRef.current = false;
    };
    // The drag-move core: circle handles, whole-shape moves and corner drags
    // all land here with a map position, whichever input produced it.
    const moveDragged = (p: LL) => {
      const { spec, onAoiChange, onPoiChange, onOrbitRadiusChange } = stateRef.current;
      if (circleDragRef.current) {
        if (spec.mission_type === "orbit" && spec.orbit.center) {
          if (circleDragRef.current === "center") onPoiChange(p);
          else onOrbitRadiusChange(Math.max(5, Math.round(geodesicM(spec.orbit.center, p))));
        } else if (spec.shape) {
          const s = spec.shape;
          if (circleDragRef.current === "center") {
            onAoiChange(circlePolygon(p, s.radius_m), { ...s, center: p });
          } else {
            const radius_m = Math.max(1, geodesicM(s.center, p));
            onAoiChange(circlePolygon(s.center, radius_m), { ...s, radius_m });
          }
        }
        return;
      }
      if (shapeDragRef.current) {
        const d = shapeDragRef.current;
        const dLat = p[0] - d.start[0];
        const dLon = p[1] - d.start[1];
        const moved = d.aoi.map(([la, lo]) => [la + dLat, lo + dLon] as LL);
        onAoiChange(
          moved,
          d.shape ? { ...d.shape, center: [d.shape.center[0] + dLat, d.shape.center[1] + dLon] } : null,
        );
        return;
      }
      if (dragIndexRef.current === null) return;
      onAoiChange(moveCorner(spec.aoi, dragIndexRef.current, p), spec.shape);
    };

    map.on("click", (e: MapMouseEvent) => {
      const { mode, spec, onAoiChange, onHomeChange, onPoiChange, onModeChange } = stateRef.current;
      const p: LL = [e.lngLat.lat, e.lngLat.lng];

      if (mode === "set-home") {
        onHomeChange(p);
        onModeChange("idle");
        return;
      }
      if (mode === "set-poi") {
        onPoiChange(p);
        onModeChange("idle");
        return;
      }
      if (mode === "draw-polygon" || mode === "append-polygon") {
        // A press on a handle is an edit of a corner that exists, never a new
        // one: without this a click on a handle drops a second corner on top.
        if (onHandle(e.point)) return;
        setDrawNote(null); // the operator is acting on the refusal; stop repeating it
        onAoiChange([...spec.aoi, p]);
        return;
      }
      if (mode === "draw-rectangle") {
        if (spec.aoi.length === 0) {
          onAoiChange([p]);
          setDrawHint("Drag out the opposite corner");
        } else {
          const [a] = spec.aoi;
          drawingRef.current = false;
          setDrawHint(null);
          onAoiChange([[a[0], a[1]], [a[0], p[1]], [p[0], p[1]], [p[0], a[1]]]);
          onModeChange("idle");
        }
        return;
      }
      if (mode === "draw-circle") {
        if (!circleCenterRef.current) {
          circleCenterRef.current = p;
          setDrawHint("Drag out the radius");
        } else {
          const center = circleCenterRef.current;
          const radius_m = Math.max(1, geodesicM(center, p));
          circleCenterRef.current = null;
          drawingRef.current = false;
          setDrawHint(null);
          onAoiChange(circlePolygon(center, radius_m), { kind: "circle", center, radius_m });
          onModeChange("idle");
        }
      }
    });

    // A double-click still finishes a draw, for the operator who already knows
    // it does; the Finish button above the map is for the one who does not.
    map.on("dblclick", () => {
      const { mode, spec, onAoiChange, onModeChange } = stateRef.current;
      if (mode !== "draw-polygon" && mode !== "append-polygon") return;
      const pts = trimDoubleClick(spec.aoi);
      if (pts.length < 3) {
        setDrawNote(`An area needs three corners — ${3 - pts.length} to go.`);
        return;
      }
      onAoiChange(pts);
      onModeChange("idle");
    });

    // A corner handle is live wherever it is drawn. Arming the drag only in
    // `idle` left every corner placed while drawing visibly grabbable and dead,
    // and the press panned the map instead (#122). The handles are drawn only
    // for an editable area, so their own presence is the whole condition.
    map.on("mousedown", "aoi-vertices", (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      e.preventDefault();
      startVertexDrag(e.features[0].properties!.index as number);
    });

    // Touch variant: hit area for vertices
    map.on("touchstart", "aoi-vertices-hit", (e: MapLayerTouchEvent) => {
      if (dragLockRef.current || !e.features?.length) return;
      dragLockRef.current = true;
      e.preventDefault();
      const index = e.features[0].properties!.index as number;
      noteTouchStart(e.point.x, e.point.y, index, "vertex");
      startVertexDrag(index);
    });

    // Clicking a midpoint inserts a vertex there, then hands straight over to the
    // existing drag machinery so a click drops it and a drag positions it.
    map.on("mousedown", "aoi-midpoints", (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      e.preventDefault();
      startMidpointDrag(e.features[0].properties!.edgeIndex as number, [e.lngLat.lat, e.lngLat.lng]);
    });

    // Touch variant: hit area for midpoints
    map.on("touchstart", "aoi-midpoints-hit", (e: MapLayerTouchEvent) => {
      if (dragLockRef.current || !e.features?.length) return;
      dragLockRef.current = true;
      e.preventDefault();
      const edge = e.features[0].properties!.edgeIndex as number;
      noteTouchStart(e.point.x, e.point.y, edge + 1, "midpoint");
      startMidpointDrag(edge, [e.lngLat.lat, e.lngLat.lng]);
    });

    map.on("mousedown", "circle-handles", (e: MapLayerMouseEvent) => {
      if (stateRef.current.mode !== "idle" || !e.features?.length) return;
      e.preventDefault();
      startCircleDrag(e.features[0].properties!.kind as "center" | "radius");
    });

    // Touch variant: hit area for circle handles
    map.on("touchstart", "circle-handles-hit", (e: MapLayerTouchEvent) => {
      if (dragLockRef.current || stateRef.current.mode !== "idle" || !e.features?.length) return;
      dragLockRef.current = true;
      e.preventDefault();
      noteTouchStart(e.point.x, e.point.y, -1, "circle");
      startCircleDrag(e.features[0].properties!.kind as "center" | "radius");
    });

    // Dragging inside the shape moves the whole thing. The handles sit on top of
    // the fill, so a press on one of them must not also start a move.
    map.on("mousedown", "aoi-fill", (e: MapLayerMouseEvent) => {
      const { mode, spec } = stateRef.current;
      if (mode !== "idle" || spec.mission_type === "orbit" || spec.aoi.length < 3) return;
      if (onHandle(e.point)) return;
      e.preventDefault();
      startShapeDrag([e.lngLat.lat, e.lngLat.lng]);
    });

    // Touch variant: a finger inside the shape moves the whole thing, like the
    // mouse. A tap without movement ends the drag with nothing moved.
    map.on("touchstart", "aoi-fill", (e: MapLayerTouchEvent) => {
      const { mode, spec } = stateRef.current;
      if (dragLockRef.current || mode !== "idle" || spec.mission_type === "orbit" || spec.aoi.length < 3) return;
      if (onTouchHandle(e.point)) return;
      dragLockRef.current = true;
      e.preventDefault();
      noteTouchStart(e.point.x, e.point.y, -1, "fill");
      startShapeDrag([e.lngLat.lat, e.lngLat.lng]);
    });

    map.on("contextmenu", "aoi-vertices", (e: MapLayerMouseEvent) => {
      const { spec, onAoiChange } = stateRef.current;
      if (!e.features?.length || spec.shape) return;
      e.preventDefault();
      e.originalEvent.preventDefault();
      const i = e.features[0].properties!.index as number;
      onAoiChange(removeCorner(spec.aoi, i), spec.shape); // a polygon needs three corners
    });

    map.on("mousemove", (e: MapMouseEvent) => {
      const { spec, mode } = stateRef.current;
      const p: LL = [e.lngLat.lat, e.lngLat.lng];
      const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

      // Rubber-band while a shape is being drawn, painted straight into the
      // source: committing to state on every mouse move would be a render per
      // pixel, and without it there is no sign anything is being drawn at all.
      if (mode === "draw-rectangle" && spec.aoi.length === 1) {
        const a = spec.aoi[0];
        const rect: LL[] = [[a[0], a[1]], [a[0], p[1]], [p[0], p[1]], [p[0], a[1]]];
        drawingRef.current = true;
        src("aoi")?.setData(polygonGeoJSON(rect));
        setDrawHint(
          `${Math.round(geodesicM(rect[0], rect[1]))} × ${Math.round(geodesicM(rect[1], rect[2]))} m — click to finish`,
        );
        return;
      }
      if (mode === "draw-circle" && circleCenterRef.current) {
        const r = Math.max(1, geodesicM(circleCenterRef.current, p));
        drawingRef.current = true;
        src("aoi")?.setData(polygonGeoJSON(circlePolygon(circleCenterRef.current, r)));
        setDrawHint(`Radius ${Math.round(r)} m — click to finish`);
        return;
      }

      moveDragged(p);
    });

    const endDrag = () => {
      // The re-entry lock always clears, even when nothing was armed: a touch
      // refused up front must not lock touch out afterwards.
      dragLockRef.current = false;
      if (dragIndexRef.current === null && circleDragRef.current === null && shapeDragRef.current === null) {
        return;
      }
      dragIndexRef.current = null;
      circleDragRef.current = null;
      shapeDragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = stateRef.current.mode === "idle" ? "" : "crosshair";
    };
    map.on("mouseup", endDrag);
    // A touch that never moved is a tap on a corner: select it for the Remove
    // corner button instead of dragging it. Anything else ends the drag.
    map.on("touchend", () => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (start && !touchMovedRef.current && (start.kind === "vertex" || start.kind === "midpoint")) {
        touchMovedRef.current = false;
        dragIndexRef.current = null;
        circleDragRef.current = null;
        shapeDragRef.current = null;
        dragLockRef.current = false;
        map.dragPan.enable();
        map.getCanvas().style.cursor = stateRef.current.mode === "idle" ? "" : "crosshair";
        // Selecting is an edit-mode act: while drawing, a tap stays a no-op so
        // it can never arm the Remove button mid-draw.
        if (stateRef.current.mode === "idle") stateRef.current.onSelectedCornerChange(start.index);
        return;
      }
      touchMovedRef.current = false;
      endDrag();
    });
    map.on("touchcancel", () => {
      touchStartRef.current = null;
      touchMovedRef.current = false;
      endDrag();
      map.getCanvas().style.cursor = stateRef.current.mode === "idle" ? "" : "crosshair";
    });
    for (const layer of ["aoi-vertices", "aoi-midpoints", "circle-handles", "aoi-vertices-hit", "aoi-midpoints-hit", "circle-handles-hit"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", layer, () => {
        if (dragIndexRef.current === null && circleDragRef.current === null) {
          map.getCanvas().style.cursor = stateRef.current.mode === "idle" ? "" : "crosshair";
        }
      });
    }
    map.on("mouseenter", "aoi-fill", () => {
      const { mode, spec } = stateRef.current;
      if (mode === "idle" && spec.mission_type !== "orbit") map.getCanvas().style.cursor = "move";
    });
    map.on("mouseleave", "aoi-fill", () => {
      if (shapeDragRef.current === null) {
        map.getCanvas().style.cursor = stateRef.current.mode === "idle" ? "" : "crosshair";
      }
    });

    // Touch move handling runs the same drag-move core as the mouse, with one
    // extra gate above it: a finger that has barely moved is a tap, not a drag.
    map.on("touchmove", (e: MapTouchEvent) => {
      const x = e.point.x;
      const y = e.point.y;
      const p: LL = [e.lngLat.lat, e.lngLat.lng];
      // Hold the corner still so touchend can select it instead of shifting it
      // by a pixel.
      const start = touchStartRef.current;
      if (start && !touchMovedRef.current) {
        if (isTap(x - start.x, y - start.y)) return;
        touchMovedRef.current = true;
      }
      moveDragged(p);
    });

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

    if (!drawingRef.current) set("aoi", isOrbit ? fc([]) : polygonGeoJSON(spec.aoi));
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
      el.style.cssText = `color:#f2f5f7;font:600 10px/1 var(--mono, monospace);
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
    const drawing = isDrawing(mode);
    map.setPaintProperty("aoi-outline", "line-color", drawing ? "#e0a94f" : "#4fb8a8");
    map.setPaintProperty("aoi-outline", "line-dasharray", drawing ? [2, 2] : undefined);
  }, [mode]);

  function toggleBasemap(next: "esri" | "osm") {
    setBasemap(next);
    mapRef.current?.setStyle(next === "esri" ? BASEMAP : BASEMAP_OSM);
  }

  // What a click on the map does at this instant — not what it did a mode ago,
  // and not what dragging a finished shape would do.
  const corners = spec.aoi.length;
  const clickMeaning =
    mode === "draw-polygon" || mode === "append-polygon"
      ? `Each click adds a corner — ${corners} so far, three needed.`
      : mode === "draw-rectangle"
        ? (corners === 0 ? "Click one corner." : (drawHint ?? "Click the opposite corner."))
        : (drawHint ?? "Click the centre, then drag out the radius.");

  const footprintLabel = preview.footprint_across_m
    ? `${Math.round(preview.footprint_across_m)} × ${Math.round(preview.footprint_along_m)} m`
    : "";

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
      <div className={styles.basemapToggle}>
        <button className={basemap === "esri" ? "active" : ""} onClick={() => toggleBasemap("esri")}>
          Satellite
        </button>
        <button className={basemap === "osm" ? "active" : ""} onClick={() => toggleBasemap("osm")}>
          OSM
        </button>
        {/* Near what it affects: display options for the map live on the map. */}
        <button
          className={showNumbers ? "active" : ""}
          onClick={() => onShowNumbersChange(!showNumbers)}
          title="Number each photo position in capture order"
        >
          Numbers
        </button>
        <button
          className={showFootprint ? "active" : ""}
          onClick={() => setShowFootprint(!showFootprint)}
          title={`What one photograph covers at this altitude${footprintLabel ? `: ${footprintLabel}` : ""}`}
        >
          {showFootprint && footprintLabel ? footprintLabel : "Footprint"}
        </button>
      </div>
      {isDrawing(mode) && (
        <div className={styles.drawPanel}>
          <div className={styles.drawTitle}>{drawModeLabel(mode)}</div>
          <div className={styles.drawClick}>{clickMeaning}</div>
          {drawNote && <div className={styles.drawNote}>{drawNote}</div>}
          <div className={styles.drawActions}>
            {(mode === "draw-polygon" || mode === "append-polygon") && (
              <button onClick={finishDraw} disabled={spec.aoi.length < 3}>
                Finish area
              </button>
            )}
            <button onClick={cancelDraw}>Cancel</button>
          </div>
        </div>
      )}
      {/* Remove-corner action panel appears only when idle and a valid corner is selected. */}
      {mode === "idle" && selectedCorner != null && spec.mission_type !== "orbit" && !spec.shape && (
        <div className={styles.drawPanel}>
          <div className={styles.drawTitle}>Remove corner</div>
          <div className={styles.drawHint}>Tap the corner on the map to remove. Corners must remain at least three.</div>
          <div className={styles.drawActions}>
            <button
              onClick={() => {
                const newAoi = removeCorner(spec.aoi, selectedCorner);
                if (newAoi !== spec.aoi) onAoiChange(newAoi, spec.shape);
                onSelectedCornerChange(null);
              }}
              disabled={selectedCorner == null || selectedCorner >= spec.aoi.length || spec.aoi.length <= 3}
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
