// What a Site keeps for the map to work with no signal (PWA-2, #315).
//
// Not satellite or street tiles from the two base-map providers: the OSM Tile
// Usage Policy bans offline use and prefetching on tile.openstreetmap.org, and
// Esri's World Imagery license says it is not for offline export. What is kept
// is a vector street map cut from OpenStreetMap data (a Protomaps basemap
// archive, an ODbL Produced Work), a few dozen tiles around the Site, read
// through our own route from a copy we host (app/api/site-map).
//
// This file is only the arithmetic: which tiles, how many, how big. The
// browser side that stores them is offlineMap.ts.

/** The zooms kept. 11 shows the surroundings (~15 km a tile); 15 is the
 *  archive's deepest level, and the map draws it larger beyond that. */
export const MIN_ZOOM = 11;
export const MAX_ZOOM = 15;
/** A ceiling on the tiles kept for one Site (a few MB): a bigger Site keeps
 *  fewer zoom levels rather than more storage. */
export const MAX_TILES = 150;

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type TileId = [z: number, x: number, y: number];

/** The box around [lat, lon] points, widened by a quarter of its span each way
 *  (at least ~300 m) so panning past the edge of the area still shows ground. */
export function siteBounds(points: [number, number][]): Bounds | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const pad = Math.max((north - south) / 4, (east - west) / 4, 0.003);
  return {
    west: Math.max(west - pad, -180),
    south: Math.max(south - pad, -85),
    east: Math.min(east + pad, 180),
    north: Math.min(north + pad, 85),
  };
}

const colAt = (lon: number, z: number) => Math.min(2 ** z - 1, Math.floor(((lon + 180) / 360) * 2 ** z));
const rowAt = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.min(2 ** z - 1, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z));
};

/** Every tile covering `b` from MIN_ZOOM down to the deepest level that keeps
 *  the total within MAX_TILES. Null when even MIN_ZOOM alone is too many: that
 *  Site is too big to keep. */
export function tilesFor(b: Bounds): { tiles: TileId[]; maxZoom: number } | null {
  const level = (z: number): TileId[] => {
    const out: TileId[] = [];
    for (let x = colAt(b.west, z); x <= colAt(b.east, z); x++) {
      for (let y = rowAt(b.north, z); y <= rowAt(b.south, z); y++) out.push([z, x, y]);
    }
    return out;
  };
  const tiles: TileId[] = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const next = level(z);
    if (tiles.length + next.length > MAX_TILES) break;
    tiles.push(...next);
  }
  return tiles.length === 0 ? null : { tiles, maxZoom: tiles[tiles.length - 1][0] };
}

/** True for a tile the route may read: a level we keep, inside its grid. */
export function validTile(z: number, x: number, y: number): boolean {
  return (
    Number.isInteger(z) && Number.isInteger(x) && Number.isInteger(y) &&
    z >= MIN_ZOOM && z <= MAX_ZOOM && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z
  );
}

/** "1.4 MB", "820 KB", "2.1 GB": what the operator reads for a size. */
export function formatBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}
