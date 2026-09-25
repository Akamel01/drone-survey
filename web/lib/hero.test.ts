import { test } from "node:test";
import assert from "node:assert/strict";

import { pickHero, rateFor, TURN_S } from "./hero.ts";

const AV1 = () => "probably";
const NONE = () => "";

test("a turn reads as 40 s: duration / rate is 40 within 1 s", () => {
  for (const duration of [32.4, 32.43, 10.125]) {
    const shown = duration / rateFor(duration);
    assert.ok(Math.abs(shown - TURN_S) <= 1, `${duration}s shows as ${shown}s`);
  }
});

test("the 32.4 s file plays at ~0.8", () => {
  assert.ok(Math.abs(rateFor(32.4) - 0.81) < 0.01);
});

test("tall viewport picks the tall framing, never 4K", () => {
  const pick = pickHero({ w: 375, h: 812, dpr: 3, canPlay: AV1 });
  assert.equal(pick.poster, "/hero/v1/hero-tall-poster-1440.jpg");
  assert.ok(pick.src.endsWith("hero-tall-1440p60-av1.mp4"));
});

test("wide viewport picks the wide framing", () => {
  const pick = pickHero({ w: 1440, h: 900, dpr: 1, canPlay: AV1 });
  assert.ok(pick.src.endsWith("hero-wide-1440p60-av1.mp4"));
});

test("4K only on a wide screen with >= 2560 device px across", () => {
  const big = pickHero({ w: 1440, h: 900, dpr: 2, canPlay: AV1 });
  assert.ok(big.src.endsWith("hero-wide-4k60-av1.mp4"));
  const small = pickHero({ w: 1279, h: 800, dpr: 2, canPlay: AV1 });
  assert.ok(small.src.endsWith("hero-wide-1440p60-av1.mp4"));
});

test("codec order is AV1, HEVC, then H.264", () => {
  const hevcOnly = (type: string) => (type.includes("av01") ? "" : "maybe");
  assert.ok(pickHero({ w: 375, h: 812, canPlay: hevcOnly }).src.endsWith("hero-tall-1440p60-hevc.mp4"));
  assert.ok(pickHero({ w: 375, h: 812, canPlay: NONE }).src.endsWith("hero-tall-1080p30-h264.mp4"));
  assert.ok(pickHero({ w: 1440, h: 900, canPlay: NONE }).src.endsWith("hero-wide-1080p30-h264.mp4"));
});

test("same pick key means the video element keeps its source", () => {
  const a = pickHero({ w: 375, h: 812, dpr: 3, canPlay: AV1 });
  const b = pickHero({ w: 390, h: 844, dpr: 3, canPlay: AV1 });
  assert.equal(a.key, b.key);
});
