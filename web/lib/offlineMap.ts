// The browser side of "a Site's map works offline" (PWA-2, #315).
//
// One Cache Storage cache per Site, named `site-map-<site id>`, holds that
// Site's vector tiles (tiles from siteMap.ts, read through /api/site-map) and a
// manifest saying what it holds and how big it is. The service worker neither
// reads nor deletes these (it only touches `mission-control-` caches); the map
// reads them through the `sitemap://` protocol below. Removing a Site deletes
// its cache, which frees exactly its storage.
//
// A cache with no manifest is a save that did not finish: it is never listed
// and is deleted at once.

import type { StyleSpecification } from "maplibre-gl";
import { readPassphrase } from "./passphrase";
import { MAX_ZOOM, MIN_ZOOM, siteBounds, tilesFor, type Bounds } from "./siteMap";

const PREFIX = "site-map-";
const MANIFEST = "/site-map/manifest.json";
const ATTRIBUTION = "© OpenStreetMap contributors (ODbL) · Protomaps";

/** What the operator sees about one Site kept offline. */
export interface SiteMap {
  siteId: string;
  name: string;
  /** What the cache holds, as stored. */
  bytes: number;
  tiles: number;
  maxZoom: number;
  bounds: Bounds;
  savedAt: string;
}

export type Saved = { ok: true; map: SiteMap; persistence: Persistence } | { ok: false; text: string };

/** The browser's answer to "keep this storage": the operator is shown it. */
export type Persistence = "granted" | "not granted" | "unsupported";

const tilePath = (z: number | string, x: number | string, y: number | string) => `/site-map/${z}/${x}/${y}`;
const supported = () => typeof caches !== "undefined";

const listeners = new Set<() => void>();
/** Called when a Site is saved or removed, so the list and the map agree. */
export function subscribeSiteMaps(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

async function manifestOf(name: string): Promise<SiteMap | null> {
  try {
    const hit = await (await caches.open(name)).match(MANIFEST);
    return hit ? ((await hit.json()) as SiteMap) : null;
  } catch {
    return null;
  }
}

/** Every Site kept on this device, biggest first. */
export async function listSiteMaps(): Promise<SiteMap[]> {
  if (!supported()) return [];
  const maps: SiteMap[] = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX)) continue;
    const map = await manifestOf(name);
    if (map) maps.push(map);
    else await caches.delete(name);
  }
  return maps.sort((a, b) => b.bytes - a.bytes);
}

export async function removeSiteMap(siteId: string): Promise<void> {
  if (supported()) await caches.delete(PREFIX + siteId);
  changed();
}

/** Whether the browser has agreed to keep this origin's storage. */
export async function persistence(request: boolean): Promise<Persistence> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage?.persist) return "unsupported";
  try {
    return (await storage.persisted()) || (request && (await storage.persist())) ? "granted" : "not granted";
  } catch {
    return "unsupported";
  }
}

/** Keep the map around a Site: ask for persistent storage, read every tile of
 *  its bounded area, and list it only once all of them are stored. `points` are
 *  the [lat, lon] corners of the Site's Missions. */
export async function saveSiteMap(site: { siteId: string; name: string }, points: [number, number][]): Promise<Saved> {
  if (!supported()) return { ok: false, text: "This browser cannot keep maps for offline." };
  const bounds = siteBounds(points);
  const kept = bounds && tilesFor(bounds);
  if (!bounds || !kept) {
    return { ok: false, text: bounds ? "This Site is too big to keep for offline." : "Draw the area first: there is nothing to keep yet." };
  }
  const persisted = await persistence(true);
  const name = PREFIX + site.siteId;
  await caches.delete(name);
  const cache = await caches.open(name);
  const key = readPassphrase() ?? "";
  let bytes = 0;
  let next = 0;
  let failure: string | null = null;
  const worker = async () => {
    while (failure === null && next < kept.tiles.length) {
      const [z, x, y] = kept.tiles[next++];
      try {
        const res = await fetch(`/api/site-map/${z}/${x}/${y}`, { headers: { "x-wayfinder-key": key } });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          failure = body.error ?? `The map could not be read (HTTP ${res.status}).`;
          return;
        }
        const data = await res.arrayBuffer();
        bytes += data.byteLength;
        await cache.put(tilePath(z, x, y), new Response(data));
      } catch (err) {
        failure = `The map could not be reached: ${err instanceof Error ? err.message : "unknown"}.`;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (failure !== null) {
    await caches.delete(name);
    return { ok: false, text: failure };
  }
  const map: SiteMap = {
    siteId: site.siteId,
    name: site.name,
    bytes,
    tiles: kept.tiles.length,
    maxZoom: kept.maxZoom,
    bounds,
    savedAt: new Date().toISOString(),
  };
  await cache.put(MANIFEST, Response.json(map));
  changed();
  return { ok: true, map, persistence: persisted };
}

// --- on the map ---------------------------------------------------------------

/** MapLibre protocol handler for `sitemap://<site id>/<z>/<x>/<y>`: the tile
 *  from that Site's cache, unpacked; an empty tile where the cache has none
 *  (outside the kept area), so panning past it is blank, not an error. */
export async function siteMapTile(params: { url: string }): Promise<{ data: ArrayBuffer }> {
  const m = /^sitemap:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
  const hit = m && supported() ? await (await caches.open(PREFIX + m[1])).match(tilePath(m[2], m[3], m[4])) : undefined;
  if (!hit) return { data: new ArrayBuffer(0) };
  const bytes = new Uint8Array(await hit.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const plain = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
    return { data: await plain.arrayBuffer() };
  }
  return { data: bytes.buffer as ArrayBuffer };
}

/** The Site's street map as a MapLibre style, drawn in the app's dark palette.
 *  Layer names are the Protomaps basemap schema's. No labels: the app's
 *  styles carry no glyphs. */
export function siteMapStyle(map: Pick<SiteMap, "siteId" | "maxZoom">): StyleSpecification {
  const source = "offline";
  const fill = (layer: string, color: string): StyleSpecification["layers"][number] => ({
    id: `offline-${layer}`,
    type: "fill",
    source,
    "source-layer": layer,
    paint: { "fill-color": color },
  });
  return {
    version: 8,
    sources: {
      [source]: {
        type: "vector",
        tiles: [`sitemap://${map.siteId}/{z}/{x}/{y}`],
        minzoom: MIN_ZOOM,
        maxzoom: Math.min(map.maxZoom, MAX_ZOOM),
        attribution: ATTRIBUTION,
      },
    },
    layers: [
      { id: "offline-background", type: "background", paint: { "background-color": "#161c1e" } },
      fill("earth", "#1c2325"),
      fill("landcover", "#1f2b25"),
      fill("landuse", "#212d27"),
      fill("water", "#254049"),
      fill("buildings", "#333e41"),
      {
        id: "offline-roads",
        type: "line",
        source,
        "source-layer": "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "kind"], ["highway", "major_road"], "#8a9598", "#5c676a"],
          "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 11, 0.6, 15, ["match", ["get", "kind"], ["highway", "major_road"], 4, 2], 19, 12],
        },
      },
    ],
  };
}

/** The layers a rendered Site map is made of, for asking what was drawn. */
export const SITE_MAP_LAYERS = ["offline-earth", "offline-landcover", "offline-landuse", "offline-water", "offline-buildings", "offline-roads"];
