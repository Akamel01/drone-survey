// Map-side GeoJSON payloads and handle positions. This module may import
// `areaEditing`; neither `areaEditing` nor `mission` may import it. If the
// three-corner rule is ever needed here after areaEditing changes, move the
// predicate to `mission.ts` rather than closing that cycle.

import { mPerLon, type LL } from "./mission";
import { canFinish } from "./areaEditing";
import type { CircleShape } from "./spec";

// GeoJSON is [lon, lat]; the spec/contract is [lat, lon]. Convert at the edges only.
export const toLngLat = (p: LL): [number, number] => [p[1], p[0]];

/** Due east of a point, used to give a circle one radius handle to drag. */
export const eastOf = (center: LL, radiusM: number): LL => [center[0], center[1] + radiusM / mPerLon(center[0])];

export function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

export function polygonGeoJSON(ring: LL[]): GeoJSON.FeatureCollection {
  if (ring.length < 3) return fc([]);
  const coords = ring.map(toLngLat);
  coords.push(coords[0]);
  return fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } }]);
}

export function pointsGeoJSON(points: LL[], props: (i: number) => object = () => ({})) {
  return fc(
    points.map((p, i) => ({
      type: "Feature" as const,
      properties: props(i),
      geometry: { type: "Point" as const, coordinates: toLngLat(p) },
    })),
  );
}

/** Midpoint of every edge — the handle that inserts a vertex on that edge. */
export function midpointsGeoJSON(aoi: LL[], shape: CircleShape | null | undefined) {
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

export function lineGeoJSON(points: LL[]) {
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
export function footprintGeoJSON(center: LL, acrossM: number, alongM: number) {
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
