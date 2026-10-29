// The regions the offline street map can be kept from (PWA-2, #315).
//
// A region is one Protomaps basemap archive (OpenStreetMap data, ODbL) cut to a
// bounding box and stored in the private B2 bucket under specs/_maps/. The host
// cuts them (scripts/maps/cut_region.py) and is the manifest's only writer; the
// planner reads the manifest, picks the archive that covers a Site, and queues
// cuts and removals for the developer.
//
// Underscore-prefixed inside specs/ on purpose, like _status: store keys are
// confined to that prefix, and the Mission collector's Spec pattern only
// matches three-segment site/date/file keys, so none of this is seen by Collect.

export const MAPS_PREFIX = "specs/_maps/";
export const MANIFEST_KEY = `${MAPS_PREFIX}manifest.json`;
export const REQUESTS_PREFIX = `${MAPS_PREFIX}requests/`;
/** The deepest level the Protomaps archive has. */
export const REGION_MAXZOOM = 15;

export type BBox = [west: number, south: number, east: number, north: number];

/** One archive in the bucket, as the host's manifest records it. */
export interface Region {
  id: string;
  name: string;
  bbox: BBox;
  maxzoom: number;
  /** The archive's object key in the bucket. */
  key: string;
  bytes: number;
  /** ISO time of the cut, and the Protomaps daily build it came from (YYYYMMDD). */
  cut_at: string;
  build: string;
}

export interface Manifest {
  regions: Region[];
}

/** A cut waiting for the host (or failed there). One file per region id, so
 *  asking again replaces the earlier ask. */
export interface CutRequest {
  id: string;
  name: string;
  bbox: BBox;
  maxzoom: number;
  requested_at: string;
  requested_by: string;
  status: "queued" | "cutting" | "failed";
  /** Why it failed, in words for the developer; absent otherwise. */
  message?: string;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const validRegionId = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

const isBBox = (b: unknown): b is BBox =>
  Array.isArray(b) &&
  b.length === 4 &&
  b.every((n) => typeof n === "number" && Number.isFinite(n)) &&
  b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 && b[0] < b[2] && b[1] < b[3];

/** The manifest from its bytes; null when it is absent, and an empty one when
 *  what is there is not a manifest (the host rewrites it on its next cut). */
export function parseManifest(text: string | null): Manifest {
  if (!text) return { regions: [] };
  try {
    const list = (JSON.parse(text) as { regions?: unknown }).regions;
    const regions = Array.isArray(list)
      ? (list as Region[]).filter((r) => validRegionId(r?.id) && isBBox(r.bbox) && typeof r.key === "string" && r.key.startsWith(MAPS_PREFIX))
      : [];
    return { regions };
  } catch {
    return { regions: [] };
  }
}

const area = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);

/** The region whose box holds [lon, lat]; the smallest one when several do, so
 *  a province wins over its country. */
export function regionFor(manifest: Manifest, lon: number, lat: number): Region | null {
  const hits = manifest.regions.filter((r) => lon >= r.bbox[0] && lon <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3]);
  return hits.sort((a, b) => area(a.bbox) - area(b.bbox))[0] ?? null;
}

/** The centre of tile z/x/y as [lon, lat]: where a tile is judged to belong to a region. */
export function tileCentre(z: number, x: number, y: number): [number, number] {
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** What the developer can add: provinces and territories of Canada, then some
 *  countries. Boxes are rounded outlines, not borders; a cut keeps whatever
 *  falls inside the box, neighbouring ground included. */
export const CATALOGUE: { id: string; name: string; group: "Canada" | "Countries"; bbox: BBox }[] = [
  { id: "bc", name: "British Columbia", group: "Canada", bbox: [-139.06, 48.3, -114.03, 60.0] },
  { id: "ab", name: "Alberta", group: "Canada", bbox: [-120.0, 49.0, -110.0, 60.0] },
  { id: "sk", name: "Saskatchewan", group: "Canada", bbox: [-110.0, 49.0, -101.36, 60.0] },
  { id: "mb", name: "Manitoba", group: "Canada", bbox: [-102.05, 48.99, -88.94, 60.0] },
  { id: "on", name: "Ontario", group: "Canada", bbox: [-95.16, 41.68, -74.34, 56.86] },
  { id: "qc", name: "Quebec", group: "Canada", bbox: [-79.76, 44.99, -57.1, 62.59] },
  { id: "nb", name: "New Brunswick", group: "Canada", bbox: [-69.05, 44.56, -63.77, 48.07] },
  { id: "ns", name: "Nova Scotia", group: "Canada", bbox: [-66.33, 43.37, -59.68, 47.04] },
  { id: "pe", name: "Prince Edward Island", group: "Canada", bbox: [-64.42, 45.95, -61.96, 47.06] },
  { id: "nl", name: "Newfoundland and Labrador", group: "Canada", bbox: [-67.81, 46.62, -52.6, 60.38] },
  { id: "yt", name: "Yukon", group: "Canada", bbox: [-141.0, 59.99, -123.81, 69.65] },
  { id: "nt", name: "Northwest Territories", group: "Canada", bbox: [-136.46, 60.0, -101.98, 78.76] },
  { id: "nu", name: "Nunavut", group: "Canada", bbox: [-120.68, 51.64, -61.2, 83.11] },
  { id: "canada", name: "Canada", group: "Countries", bbox: [-141.0, 41.68, -52.6, 83.11] },
  { id: "usa-lower-48", name: "United States (lower 48)", group: "Countries", bbox: [-125.0, 24.4, -66.9, 49.4] },
  { id: "mexico", name: "Mexico", group: "Countries", bbox: [-118.4, 14.5, -86.7, 32.7] },
  { id: "united-kingdom", name: "United Kingdom", group: "Countries", bbox: [-8.7, 49.8, 1.8, 60.9] },
  { id: "ireland", name: "Ireland", group: "Countries", bbox: [-10.7, 51.4, -5.4, 55.4] },
  { id: "france", name: "France", group: "Countries", bbox: [-5.2, 41.3, 9.6, 51.1] },
  { id: "germany", name: "Germany", group: "Countries", bbox: [5.8, 47.2, 15.1, 55.1] },
  { id: "australia", name: "Australia", group: "Countries", bbox: [112.9, -43.7, 153.7, -10.6] },
  { id: "new-zealand", name: "New Zealand", group: "Countries", bbox: [166.3, -47.4, 178.6, -34.4] },
];

/** What the host is asked to cut for a catalogue id; null when it is not one. */
export function cutRequestFor(id: unknown, by: string, now = new Date()): CutRequest | null {
  const entry = CATALOGUE.find((c) => c.id === id);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    bbox: entry.bbox,
    maxzoom: REGION_MAXZOOM,
    requested_at: now.toISOString(),
    requested_by: by,
    status: "queued",
  };
}
