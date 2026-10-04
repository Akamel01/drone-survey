// A tiny, valid PMTiles v3 archive for the e2e tests (PWA-2, #315): every tile
// it is asked to hold is the same hand-encoded vector tile, half water, with
// one road across it. Plain (uncompressed), which the route passes on as is.
// Also served over HTTP with Range support, as the route reads it.

import { createServer } from "node:http";
import { zxyToTileId } from "pmtiles";

const varint = (n) => {
  const out = [];
  for (; n > 127; n = Math.floor(n / 128)) out.push((n % 128) | 128);
  out.push(n);
  return out;
};
const zig = (n) => (n << 1) ^ (n >> 31);
const field = (no, wire, payload) => [...varint((no << 3) | wire), ...payload];
const bytesField = (no, bytes) => field(no, 2, [...varint(bytes.length), ...bytes]);
const packed = (no, nums) => bytesField(no, nums.flatMap(varint));

// One layer with one feature: type 3 = polygon, 2 = line; geometry is MVT commands.
const layer = (name, type, geometry) =>
  bytesField(3, [
    ...field(15, 0, varint(2)),
    ...bytesField(1, [...Buffer.from(name)]),
    ...bytesField(2, [...field(3, 0, varint(type)), ...packed(4, geometry)]),
    ...field(5, 0, varint(4096)),
  ]);

const MOVE = (n) => 1 | (n << 3);
const LINE = (n) => 2 | (n << 3);
const CLOSE = 15;
const TILE = Uint8Array.from([
  // water: the left half of the tile
  ...layer("water", 3, [MOVE(1), 0, 0, LINE(3), zig(2048), 0, 0, zig(4096), zig(-2048), 0, CLOSE]),
  // roads: straight across the middle
  ...layer("roads", 2, [MOVE(1), 0, zig(2048), LINE(1), zig(4096), 0]),
]);

/** The archive's bytes, holding every `[z, x, y]` in `tiles`. */
export function pmtilesArchive(tiles) {
  const ids = tiles.map(([z, x, y]) => zxyToTileId(z, x, y)).sort((a, b) => a - b);
  let last = 0;
  const dir = [...varint(ids.length)];
  for (const id of ids) {
    dir.push(...varint(id - last));
    last = id;
  }
  for (let i = 0; i < ids.length; i++) dir.push(1); // run length
  for (let i = 0; i < ids.length; i++) dir.push(...varint(TILE.length));
  for (let i = 0; i < ids.length; i++) dir.push(...varint(1)); // offset 0 + 1: every entry is the one tile
  const root = Uint8Array.from(dir);
  const metadata = Buffer.from("{}");
  const header = Buffer.alloc(127);
  header.write("PMTiles", 0, "latin1");
  header[7] = 3;
  const u64 = (at, n) => header.writeBigUInt64LE(BigInt(n), at);
  u64(8, 127); // root directory
  u64(16, root.length);
  u64(24, 127 + root.length); // metadata
  u64(32, metadata.length);
  u64(40, 0); // no leaf directories
  u64(48, 0);
  u64(56, 127 + root.length + metadata.length); // tile data
  u64(64, TILE.length);
  u64(72, ids.length);
  u64(80, ids.length);
  u64(88, 1);
  header[96] = 1; // clustered
  header[97] = 1; // internal compression: none
  header[98] = 1; // tile compression: none
  header[99] = 1; // MVT
  header[100] = 0;
  header[101] = 15;
  return Buffer.concat([header, root, metadata, TILE]);
}

/** Serve `bytes` on a free port with Range requests; resolves to { url, close }. */
export function serveArchive(bytes) {
  const server = createServer((req, res) => {
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
    res.writeHead(m ? 206 : 200, {
      "Content-Type": "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(m ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
    });
    res.end(bytes.subarray(start, end + 1));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}/site.pmtiles`, close: () => new Promise((r) => server.close(r)) }),
    ),
  );
}
