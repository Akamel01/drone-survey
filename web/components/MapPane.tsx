"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  Marker,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP, BASEMAP_OSM } from "@/lib/basemap";
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

interface MapPaneProps {
  spec: MissionSpec;
  preview: Preview;
  mode: DrawMode;
  showNumbers: boolean;
  onShowNumbersChange: (v: boolean) => void;
  onAoiChange: (aoi: [number, number][], shape?: CircleShape | null) => void;
  onHomeChange: (home: [number, number]) => void;
  onPoiChange: (center: [number, number]) => void;
  onModeChange: (mode: DrawMode) => void;
}

const START = { lat: 49.1891, lon: -122.8396, zoom: 16 };
type LL = [number, number];

// GeoJSON is [lon, lat]; the spec/contract is [lat, lon]. Convert at the edges only.
const toLngLat = (p: LL): [number, number] => [p[1], p[0]];

/** Due east of a point, used to give a circle one radius handle to drag. */
function eastOf(center: LL, radiusM: number): LL {
  return [center[0], center[1] + radiusM / (111320 * Math.cos((center[0] * Math.PI) / 180))];
}

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

function aoiPolygonGeoJSON(aoi: LL[]): GeoJSON.FeatureCollection {
  if (aoi.length < 3) return fc([]);
  const ring = aoi.map(toLngLat);
  ring.push(ring[0]);
  return fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }]);
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

function linesGeoJSON(lines: LL[][]) {
  return fc(
    lines.map((line) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: line.map(toLngLat) },
    })),
  );
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
  if (map.getSource("aoi")) return; // already added for this style
  if (!map.hasImage("flight-arrow")) map.addImage("flight-arrow", arrowImage());

  map.addSource("aoi", { type: "geojson", data: aoiPolygonGeoJSON([]) });
  map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": "#4fb8a8", "fill-opacity": 0.18 } });
  map.addLayer({ id: "aoi-outline", type: "line", source: "aoi", paint: { "line-color": "#4fb8a8", "line-width": 2 } });

  map.addSource("flight-lines", { type: "geojson", data: linesGeoJSON([]) });
  map.addLayer({
    id: "flight-lines",
    type: "line",
    source: "flight-lines",
    paint: { "line-color": "#d8dcdf", "line-width": 1.5, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "flight-arrows",
    type: "symbol",
    source: "flight-lines",
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

  map.addSource("flight-points", { type: "geojson", data: pointsGeoJSON([]) });
  map.addLayer({
    id: "flight-points",
    type: "circle",
    source: "flight-points",
    paint: { "circle-radius": 2.5, "circle-color": "#e0704f" },
  });

  map.addSource("aoi-vertices", { type: "geojson", data: pointsGeoJSON([]) });
  map.addLayer({
    id: "aoi-vertices",
    type: "circle",
    source: "aoi-vertices",
    paint: { "circle-radius": 5, "circle-color": "#4fb8a8", "circle-stroke-width": 1.5, "circle-stroke-color": "#06110f" },
  });

  // Smaller, amber handles distinct from the teal vertices: click to insert.
  map.addSource("aoi-midpoints", { type: "geojson", data: pointsGeoJSON([]) });
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

  // A circle is edited as a centre and a radius, not as sixty-four vertices.
  map.addSource("circle-handles", { type: "geojson", data: pointsGeoJSON([]) });
  map.addLayer({
    id: "circle-handles",
    type: "circle",
    source: "circle-handles",
    paint: { "circle-radius": 6, "circle-color": "#4fb8a8", "circle-stroke-width": 2, "circle-stroke-color": "#06110f" },
  });
}

function labelMarker(text: string, background: string, color: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `background:${background};color:${color};font:600 10px/1 var(--mono, monospace);
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
  onModeChange,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const homeMarkerRef = useRef<Marker | null>(null);
  const poiMarkerRef = useRef<Marker | null>(null);
  const endMarkersRef = useRef<Marker[]>([]);
  const numberMarkersRef = useRef<Marker[]>([]);
  const [basemap, setBasemap] = useState<"esri" | "osm">("esri");
  const [pendingRadius, setPendingRadius] = useState<number | null>(null);

  const dragIndexRef = useRef<number | null>(null);
  const circleDragRef = useRef<null | "center" | "radius">(null);
  const circleCenterRef = useRef<LL | null>(null);

  // Leaving circle mode with a centre placed but no radius must not leave that
  // half-drawn circle behind, so every mode change discards it. Doing this in an
  // effect on `mode` instead would cost a second render on every mode change.
  const changeMode = (next: DrawMode) => {
    if (next !== "draw-circle") {
      circleCenterRef.current = null;
      setPendingRadius(null);
    }
    onModeChange(next);
  };

  // Latest props, readable from map handlers registered once on init. This must
  // be refreshed on every render: without it the handlers keep reading the spec
  // as it was at mount, and every click would see an empty area.
  const stateRef = useRef({ spec, mode, onAoiChange, onHomeChange, onPoiChange, onModeChange: changeMode });
  useEffect(() => {
    stateRef.current = { spec, mode, onAoiChange, onHomeChange, onPoiChange, onModeChange: changeMode };
  });

  useEffect(() => {
    const map = new MaplibreMap({
      container: containerRef.current!,
      style: BASEMAP,
      center: [START.lon, START.lat],
      zoom: START.zoom,
    });
    mapRef.current = map;
    map.doubleClickZoom.disable();
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    // A map that fails to add a source otherwise fails silently, and the data
    // push below just returns early for ever. Say so instead.
    map.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __map?: MaplibreMap }).__map = map;
    }

    map.on("load", () => addLayers(map));
    map.on("style.load", () => addLayers(map));

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
        onAoiChange([...spec.aoi, p]);
        return;
      }
      if (mode === "draw-rectangle") {
        if (spec.aoi.length === 0) {
          onAoiChange([p]);
        } else {
          const [a] = spec.aoi;
          onAoiChange([[a[0], a[1]], [a[0], p[1]], [p[0], p[1]], [p[0], a[1]]]);
          onModeChange("idle");
        }
        return;
      }
      if (mode === "draw-circle") {
        if (!circleCenterRef.current) {
          circleCenterRef.current = p;
          setPendingRadius(0);
        } else {
          const center = circleCenterRef.current;
          const radius_m = Math.max(1, geodesicM(center, p));
          circleCenterRef.current = null;
          setPendingRadius(null);
          onAoiChange(circlePolygon(center, radius_m), { kind: "circle", center, radius_m });
          onModeChange("idle");
        }
      }
    });

    // ponytail: a double-click delivers two click events before the dblclick
    // fires, so the last 1-2 vertices are spurious clicks, not real corners.
    map.on("dblclick", () => {
      const { mode, spec, onAoiChange, onModeChange } = stateRef.current;
      if (mode !== "draw-polygon" && mode !== "append-polygon") return;
      let pts = spec.aoi;
      if (pts.length >= 5) pts = pts.slice(0, -2);
      else if (pts.length === 4) pts = pts.slice(0, -1);
      if (pts.length >= 3) {
        onAoiChange(pts);
        onModeChange("idle");
      }
    });

    map.on("mousedown", "aoi-vertices", (e: MapLayerMouseEvent) => {
      if (stateRef.current.mode !== "idle" || !e.features?.length) return;
      e.preventDefault();
      dragIndexRef.current = e.features[0].properties!.index as number;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });

    // Clicking a midpoint inserts a vertex there, then hands straight over to the
    // existing drag machinery so a click drops it and a drag positions it.
    map.on("mousedown", "aoi-midpoints", (e: MapLayerMouseEvent) => {
      const { mode, spec, onAoiChange } = stateRef.current;
      if (mode !== "idle" || !e.features?.length) return;
      e.preventDefault();
      const edge = e.features[0].properties!.edgeIndex as number;
      const next = spec.aoi.slice();
      next.splice(edge + 1, 0, [e.lngLat.lat, e.lngLat.lng]);
      onAoiChange(next);
      dragIndexRef.current = edge + 1;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });

    map.on("mousedown", "circle-handles", (e: MapLayerMouseEvent) => {
      if (stateRef.current.mode !== "idle" || !e.features?.length) return;
      e.preventDefault();
      circleDragRef.current = e.features[0].properties!.kind as "center" | "radius";
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });

    map.on("contextmenu", "aoi-vertices", (e: MapLayerMouseEvent) => {
      const { spec, onAoiChange } = stateRef.current;
      if (!e.features?.length || spec.shape) return;
      e.preventDefault();
      e.originalEvent.preventDefault();
      if (spec.aoi.length <= 3) return; // a polygon needs three corners
      const i = e.features[0].properties!.index as number;
      onAoiChange(spec.aoi.filter((_, j) => j !== i));
    });

    map.on("mousemove", (e: MapMouseEvent) => {
      const { spec, onAoiChange, mode } = stateRef.current;
      const p: LL = [e.lngLat.lat, e.lngLat.lng];

      // Live circle while it is being drawn, painted straight into the source:
      // committing to state on every mouse move would be a render per pixel.
      if (mode === "draw-circle" && circleCenterRef.current) {
        const r = Math.max(1, geodesicM(circleCenterRef.current, p));
        const src = map.getSource("aoi") as GeoJSONSource | undefined;
        if (src) src.setData(aoiPolygonGeoJSON(circlePolygon(circleCenterRef.current, r)));
        setPendingRadius(r);
        return;
      }

      if (circleDragRef.current && spec.shape) {
        const s = spec.shape;
        if (circleDragRef.current === "center") {
          onAoiChange(circlePolygon(p, s.radius_m), { ...s, center: p });
        } else {
          const radius_m = Math.max(1, geodesicM(s.center, p));
          onAoiChange(circlePolygon(s.center, radius_m), { ...s, radius_m });
        }
        return;
      }

      if (dragIndexRef.current === null) return;
      const next = spec.aoi.slice();
      next[dragIndexRef.current] = p;
      onAoiChange(next, spec.shape);
    });

    const endDrag = () => {
      if (dragIndexRef.current === null && circleDragRef.current === null) return;
      dragIndexRef.current = null;
      circleDragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
    map.on("mouseup", endDrag);
    for (const layer of ["aoi-vertices", "aoi-midpoints", "circle-handles"]) {
      map.on("mouseenter", layer, () => {
        if (stateRef.current.mode === "idle") map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", layer, () => {
        if (dragIndexRef.current === null && circleDragRef.current === null) {
          map.getCanvas().style.cursor = "";
        }
      });
    }

    const onKeydown = (e: KeyboardEvent) => {
      const { mode, spec, onAoiChange, onModeChange } = stateRef.current;
      if (e.key === "Escape") {
        circleCenterRef.current = null;
        setPendingRadius(null);
        onModeChange("idle");
        return;
      }
      if (e.key !== "Enter") return;
      if ((mode === "draw-polygon" || mode === "append-polygon") && spec.aoi.length >= 3) {
        onAoiChange(spec.aoi);
        onModeChange("idle");
      }
    };
    window.addEventListener("keydown", onKeydown);

    return () => {
      window.removeEventListener("keydown", onKeydown);
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

    set("aoi", isOrbit ? fc([]) : aoiPolygonGeoJSON(spec.aoi));
    set("aoi-vertices", isOrbit || spec.shape ? fc([]) : pointsGeoJSON(spec.aoi, (i) => ({ index: i })));
    set("aoi-midpoints", isOrbit || mode !== "idle" ? fc([]) : midpointsGeoJSON(spec.aoi, spec.shape));
    set(
      "circle-handles",
      !isOrbit && spec.shape
        ? fc([
            {
              type: "Feature",
              properties: { kind: "center" },
              geometry: { type: "Point", coordinates: toLngLat(spec.shape.center) },
            },
            {
              type: "Feature",
              properties: { kind: "radius" },
              geometry: { type: "Point", coordinates: toLngLat(eastOf(spec.shape.center, spec.shape.radius_m)) },
            },
          ])
        : fc([]),
    );
    set("flight-lines", linesGeoJSON(preview.lines));
    set("flight-points", pointsGeoJSON(preview.points));
  });

  // Where the path begins and where it ends, so a wasteful route is obvious.
  useEffect(() => {
    const map = mapRef.current;
    endMarkersRef.current.forEach((m) => m.remove());
    endMarkersRef.current = [];
    if (!map || preview.points.length < 2) return;
    const first = preview.points[0];
    const last = preview.points[preview.points.length - 1];
    const start = new Marker({ element: labelMarker("START", "#4fb8a8", "#06110f"), anchor: "bottom" })
      .setLngLat(toLngLat(first))
      .addTo(map);
    const end = new Marker({ element: labelMarker("END", "#e0704f", "#06110f"), anchor: "bottom" })
      .setLngLat(toLngLat(last))
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

  // Only the cursor belongs here: it is an external system being synchronised
  // with React state. The half-drawn circle is cleared where the mode actually
  // changes instead, because reacting to the change afterwards means a second
  // render every time the mode moves.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = mode === "idle" ? "" : "crosshair";
  }, [mode]);

  function toggleBasemap(next: "esri" | "osm") {
    setBasemap(next);
    mapRef.current?.setStyle(next === "esri" ? BASEMAP : BASEMAP_OSM);
  }

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
        {/* Near what it affects: a display option for the map lives on the map. */}
        <button
          className={showNumbers ? "active" : ""}
          onClick={() => onShowNumbersChange(!showNumbers)}
          title="Number each photo position in capture order"
        >
          Numbers
        </button>
      </div>
      {mode === "draw-circle" && (
        <div className={styles.homeControl}>
          {/* Driven by state, not by the ref: a ref read during render is not
              guaranteed to be the value React rendered with. */}
          <button disabled>
            {pendingRadius === null
              ? "Click the centre"
              : `Radius ${Math.round(pendingRadius)} m — click to finish`}
          </button>
        </div>
      )}
    </div>
  );
}
