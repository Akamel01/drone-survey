// Reading one tile of the offline street map from the region archive that
// covers it (PWA-2, #315): the manifest says which archive, a range-reading
// PMTiles Source over private B2 reads it. SITE_MAP_PMTILES_URL, when set,
// overrides everything with one archive at a plain URL (development, tests).

import { Compression, FetchSource, PMTiles, TileType, type RangeResponse, type Source } from "pmtiles";
import { authorize, b2ReadEnv, downloadFile, downloadRange } from "./b2";
import { MANIFEST_KEY, parseManifest, regionFor, tileCentre, type Manifest } from "./mapRegions";

export type TileAnswer =
  | { ok: true; data: ArrayBuffer | null }
  | { ok: false; status: number; error: string };

/** A PMTiles Source over one object in the private bucket. */
class B2Source implements Source {
  constructor(private bucket: string, private key: string) {}
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const env = b2ReadEnv()!;
    return downloadRange(await authorize(env), this.bucket, this.key, offset, length);
  }
}

const archives = new Map<string, PMTiles>();
const archive = (id: string, make: () => Source) => {
  let a = archives.get(id);
  if (!a) archives.set(id, (a = new PMTiles(make())));
  return a;
};

// The manifest changes only when the host cuts: a minute old is fresh enough.
let cached: { at: number; manifest: Manifest } | null = null;
async function manifest(): Promise<Manifest> {
  if (cached && Date.now() - cached.at < 60_000) return cached.manifest;
  const env = b2ReadEnv()!;
  const text = await downloadFile(await authorize(env), env.bucket, MANIFEST_KEY);
  cached = { at: Date.now(), manifest: parseManifest(text?.toString() ?? null) };
  return cached.manifest;
}

/** The tile as the archive stores it (gzip or plain); `data: null` where the
 *  archive has none (open water). */
export async function readTile(z: number, x: number, y: number): Promise<TileAnswer> {
  const override = process.env.SITE_MAP_PMTILES_URL;
  let source: PMTiles;
  if (override) {
    source = archive(override, () => new FetchSource(override));
  } else {
    const env = b2ReadEnv();
    if (!env) {
      return { ok: false, status: 503, error: "This deployment has no storage credential, so it cannot read the offline map regions." };
    }
    const [lon, lat] = tileCentre(z, x, y);
    const region = regionFor(await manifest(), lon, lat);
    if (!region) {
      return { ok: false, status: 404, error: "No offline map region covers this Site yet. The developer can add one in Settings." };
    }
    source = archive(region.key, () => new B2Source(env.bucket, region.key));
  }
  const header = await source.getHeader();
  if (header.tileType !== TileType.Mvt || (header.tileCompression !== Compression.None && header.tileCompression !== Compression.Gzip)) {
    return { ok: false, status: 502, error: "The offline map source is not a vector (MVT, gzip or plain) archive" };
  }
  const tile = await source.getZxy(z, x, y);
  return { ok: true, data: tile?.data ?? null };
}
