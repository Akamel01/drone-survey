import { Compression, FetchSource, PMTiles, TileType } from "pmtiles";
import { authProblem } from "@/lib/auth";
import { validTile } from "@/lib/siteMap";

// One vector tile of the street map a Site keeps for offline (PWA-2, #315).
//
// Read from a Protomaps basemap archive (OpenStreetMap data, ODbL Produced
// Work) by range request, from a copy WE host: SITE_MAP_PMTILES_URL. Protomaps
// asks that its public daily builds are not hotlinked and that the tileset is
// copied to your own storage, and `pmtiles extract <build> <file> --bbox=...
// --maxzoom=15` is how to cut a region from it. Only the offline cache's build
// step asks this route for tiles; the map on screen never does.
//
// The tile is passed on as the archive stores it (gzip or plain); the browser
// side unpacks it. A tile the archive does not have (open water) is a 204.

export const runtime = "nodejs";
export const preferredRegion = "yyz1";

// The archive's header and directories are fetched once per instance, then kept.
const archives = new Map<string, PMTiles>();

function archive(url: string): PMTiles {
  let a = archives.get(url);
  if (!a) archives.set(url, (a = new PMTiles(new FetchSource(url))));
  return a;
}

export async function GET(request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const denied = authProblem(request);
  if (denied) return denied;
  const { z, x, y } = await params;
  const [zn, xn, yn] = [z, x, y].map((s) => (/^\d{1,8}$/.test(s) ? Number(s) : NaN));
  if (!validTile(zn, xn, yn)) return Response.json({ error: "Not a tile this map keeps" }, { status: 404 });

  const url = process.env.SITE_MAP_PMTILES_URL;
  if (!url) {
    return Response.json(
      { error: "This deployment has no offline map source (SITE_MAP_PMTILES_URL is not set), so no Site can be kept for offline." },
      { status: 503 },
    );
  }
  try {
    const a = archive(url);
    const header = await a.getHeader();
    if (header.tileType !== TileType.Mvt || (header.tileCompression !== Compression.None && header.tileCompression !== Compression.Gzip)) {
      return Response.json({ error: "The offline map source is not a vector (MVT, gzip or plain) archive" }, { status: 502 });
    }
    const tile = await a.getZxy(zn, xn, yn);
    if (!tile) return new Response(null, { status: 204 });
    return new Response(tile.data, {
      headers: { "Content-Type": "application/x-protobuf", "Cache-Control": "private, max-age=86400" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `The offline map source could not be read: ${detail}` }, { status: 502 });
  }
}
