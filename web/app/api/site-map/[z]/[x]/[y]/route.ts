import { authProblem } from "@/lib/auth";
import { readTile } from "@/lib/mapArchive";
import { validTile } from "@/lib/siteMap";

// One vector tile of the street map a Site keeps for offline (PWA-2, #315).
//
// Read by range request from the region archive that covers the tile, held in
// the private B2 bucket (lib/mapArchive.ts, regions in lib/mapRegions.ts); the
// host cuts the archives from Protomaps basemap builds (OpenStreetMap data, ODbL
// Produced Work), which Protomaps asks us to host ourselves rather than hotlink.
// Only the offline cache's build step asks this route for tiles; the map on
// screen never does.
//
// The tile is passed on as the archive stores it (gzip or plain); the browser
// side unpacks it. A tile the archive does not have (open water) is a 204.

export const runtime = "nodejs";
export const preferredRegion = "yyz1";

export async function GET(request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const denied = authProblem(request);
  if (denied) return denied;
  const { z, x, y } = await params;
  const [zn, xn, yn] = [z, x, y].map((s) => (/^\d{1,8}$/.test(s) ? Number(s) : NaN));
  if (!validTile(zn, xn, yn)) return Response.json({ error: "Not a tile this map keeps" }, { status: 404 });

  try {
    const tile = await readTile(zn, xn, yn);
    if (!tile.ok) return Response.json({ error: tile.error }, { status: tile.status });
    if (!tile.data) return new Response(null, { status: 204 });
    return new Response(tile.data, {
      headers: { "Content-Type": "application/x-protobuf", "Cache-Control": "private, max-age=86400" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `The offline map source could not be read: ${detail}` }, { status: 502 });
  }
}
