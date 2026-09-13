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
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import styles from "./MapPane.module.css";

export type DrawMode = "idle" | "draw-polygon" | "draw-rectangle" | "set-home";

interface MapPaneProps {
  spec: MissionSpec;
  preview: Preview;
  mode: DrawMode;
  onAoiChange: (aoi: [number, number][]) => void;
  onHomeChange: (home: [number, number]) => void;
  onModeChange: (mode: DrawMode) => void;
}

const START = { lat: 49.1891, lon: -122.8396, zoom: 16 };

// GeoJSON is [lon, lat]; the spec/contract is [lat, lon]. Convert at the edges only.
const toLngLat = (p: [number, number]): [number, number] => [p[1], p[0]];

function aoiPolygonGeoJSON(aoi: [number, number][]): GeoJSON.FeatureCollection {
  if (aoi.length < 3) return { type: "FeatureCollection", features: [] };
  const ring = aoi.map(toLngLat);
  ring.push(ring[0]);
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}

function verticesGeoJSON(aoi: [number, number][]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: aoi.map((p, i) => ({
      type: "Feature",
      properties: { index: i },
      geometry: { type: "Point", coordinates: toLngLat(p) },
    })),
  };
}

function linesGeoJSON(lines: [number, number][][]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: line.map(toLngLat) },
    })),
  };
}

function pointsGeoJSON(points: [number, number][]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: toLngLat(p) },
    })),
  };
}

function addLayers(map: MaplibreMap) {
  if (map.getSource("aoi")) return; // already added for this style

  map.addSource("aoi", { type: "geojson", data: aoiPolygonGeoJSON([]) });
  map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": "#4fb8a8", "fill-opacity": 0.18 } });
  map.addLayer({ id: "aoi-outline", type: "line", source: "aoi", paint: { "line-color": "#4fb8a8", "line-width": 2 } });

  map.addSource("aoi-vertices", { type: "geojson", data: verticesGeoJSON([]) });
  map.addLayer({
    id: "aoi-vertices",
    type: "circle",
    source: "aoi-vertices",
    paint: { "circle-radius": 5, "circle-color": "#4fb8a8", "circle-stroke-width": 1.5, "circle-stroke-color": "#06110f" },
  });

  map.addSource("flight-lines", { type: "geojson", data: linesGeoJSON([]) });
  map.addLayer({ id: "flight-lines", type: "line", source: "flight-lines", paint: { "line-color": "#d8dcdf", "line-width": 1.5, "line-opacity": 0.8 } });

  map.addSource("flight-points", { type: "geojson", data: pointsGeoJSON([]) });
  map.addLayer({
    id: "flight-points",
    type: "circle",
    source: "flight-points",
    paint: { "circle-radius": 2.5, "circle-color": "#e0704f" },
  });
}

export default function MapPane({ spec, preview, mode, onAoiChange, onHomeChange, onModeChange }: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const homeMarkerRef = useRef<Marker | null>(null);
  const [basemap, setBasemap] = useState<"esri" | "osm">("esri");

  // Latest props, readable from map event handlers registered once on init.
  const stateRef = useRef({ spec, mode, onAoiChange, onHomeChange, onModeChange });
  useEffect(() => {
    stateRef.current = { spec, mode, onAoiChange, onHomeChange, onModeChange };
  });
  const dragIndexRef = useRef<number | null>(null);

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
      // Idle-mode clicks (including the one that follows a vertex drag) do nothing here.
      const { mode, spec, onAoiChange, onHomeChange, onModeChange } = stateRef.current;
      const p: [number, number] = [e.lngLat.lat, e.lngLat.lng];

      if (mode === "set-home") {
        onHomeChange(p);
        onModeChange("idle");
        return;
      }
      if (mode === "draw-polygon") {
        onAoiChange([...spec.aoi, p]);
        return;
      }
      if (mode === "draw-rectangle") {
        if (spec.aoi.length === 0) {
          onAoiChange([p]);
        } else {
          const [a] = spec.aoi;
          const rect: [number, number][] = [
            [a[0], a[1]],
            [a[0], p[1]],
            [p[0], p[1]],
            [p[0], a[1]],
          ];
          onAoiChange(rect);
          onModeChange("idle");
        }
      }
    });

    // ponytail: a double-click delivers two click events before the dblclick
    // fires, so the last 1-2 vertices are spurious clicks, not real corners.
    // Drop them (keeping at least 3) instead of building a proper draw FSM.
    map.on("dblclick", () => {
      const { mode, spec, onAoiChange, onModeChange } = stateRef.current;
      if (mode !== "draw-polygon") return;
      let pts = spec.aoi;
      if (pts.length >= 5) pts = pts.slice(0, -2);
      else if (pts.length === 4) pts = pts.slice(0, -1);
      if (pts.length >= 3) {
        onAoiChange(pts);
        onModeChange("idle");
      }
    });

    map.on("mousedown", "aoi-vertices", (e: MapLayerMouseEvent) => {
      if (stateRef.current.mode !== "idle") return;
      if (!e.features?.length) return;
      e.preventDefault();
      dragIndexRef.current = e.features[0].properties!.index as number;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });

    map.on("mousemove", (e: MapMouseEvent) => {
      if (dragIndexRef.current === null) return;
      const { spec, onAoiChange } = stateRef.current;
      const next = spec.aoi.slice();
      next[dragIndexRef.current] = [e.lngLat.lat, e.lngLat.lng];
      onAoiChange(next);
    });

    const endDrag = () => {
      if (dragIndexRef.current === null) return;
      dragIndexRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
    map.on("mouseup", endDrag);
    map.on("mouseenter", "aoi-vertices", () => {
      if (stateRef.current.mode === "idle") map.getCanvas().style.cursor = "grab";
    });
    map.on("mouseleave", "aoi-vertices", () => {
      if (dragIndexRef.current === null) map.getCanvas().style.cursor = "";
    });

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const { mode, spec, onAoiChange, onModeChange } = stateRef.current;
      if (mode === "draw-polygon" && spec.aoi.length >= 3) {
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

  // Push data updates into the live sources whenever the spec/preview change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("aoi")) return;
    (map.getSource("aoi") as GeoJSONSource).setData(aoiPolygonGeoJSON(spec.aoi));
    (map.getSource("aoi-vertices") as GeoJSONSource).setData(verticesGeoJSON(spec.aoi));
    (map.getSource("flight-lines") as GeoJSONSource).setData(linesGeoJSON(preview.lines));
    (map.getSource("flight-points") as GeoJSONSource).setData(pointsGeoJSON(preview.points));
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!spec.home) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }
    const lngLat = toLngLat(spec.home);
    if (!homeMarkerRef.current) {
      const el = document.createElement("div");
      el.className = styles.homeMarker;
      homeMarkerRef.current = new Marker({ element: el, anchor: "center" });
    }
    homeMarkerRef.current.setLngLat(lngLat).addTo(map);
  }, [spec.home]);

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
      </div>
      <div className={styles.homeControl}>
        <button className={mode === "set-home" ? "active" : ""} onClick={() => onModeChange(mode === "set-home" ? "idle" : "set-home")}>
          {mode === "set-home" ? "Click map to set home…" : "Set home point"}
        </button>
      </div>
    </div>
  );
}
