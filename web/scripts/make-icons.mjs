// Renders the app icons (public/icons/*.png) from the mark defined below: a
// survey path (the boustrophedon a Mission flies) on the theme's darkest
// canopy colour, with a sky-blue dot where it starts. Pure node, no image
// dependency; run `node scripts/make-icons.mjs` after changing the mark.
//
// One full-bleed design serves every size: iOS and Android mask it themselves,
// and the path sits inside the 80% circle Android's maskable icons keep safe.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const BG = [0x0a, 0x0e, 0x0f]; // --canopy-900
const PATH = [0xff, 0xff, 0xff]; // --on-glass
const DOT = [0x7c, 0x99, 0xad]; // --sky-mid
const POINTS = [
  [0.24, 0.28],
  [0.76, 0.28],
  [0.76, 0.5],
  [0.24, 0.5],
  [0.24, 0.72],
  [0.76, 0.72],
];
const HALF_STROKE = 0.036;
const DOT_RADIUS = 0.075;
const SAMPLES = 4; // per axis, per pixel

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function colourAt(x, y) {
  if (Math.hypot(x - POINTS[0][0], y - POINTS[0][1]) <= DOT_RADIUS) return DOT;
  for (let i = 1; i < POINTS.length; i++) {
    if (segmentDistance(x, y, POINTS[i - 1], POINTS[i]) <= HALF_STROKE) return PATH;
  }
  return BG;
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1)); // each row: filter byte 0, then RGB
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1);
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = colourAt((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      for (let k = 0; k < 3; k++) raw[row + 1 + px * 3 + k] = Math.round(sum[k] / (SAMPLES * SAMPLES));
    }
  }
  return png(size, raw);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, deflate, no filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(out, { recursive: true });
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
]) {
  writeFileSync(path.join(out, `${name}.png`), render(size));
}
