// UI-12 (#188) verification harness: the finished redesign measured once.
//
// Usage: build the app, serve it, then
//   npm run check:look -- [base-url]
//
// Sections: text contrast on glass against the brightest and darkest
// backdrops it can sit on; text over the hero; the notice against the map
// controls at 1280, 1440 and 1920 wide; reduced transparency, increased
// contrast and reduced motion; a keyboard walk of the planner; the Mission
// rows (three Planned rows lead with the answer, one held row keeps its
// stop tone) and the Details open/announce/focus-return walk at phone and
// desktop widths; the frame rate
// of panning the map under glass on a throttled phone; and two screenshots the
// operator decides on (the phone Map tab, a long Missions list over the hero).
// Like motion-check, a fetch wrapper answers /api/missions from memory and a
// localStorage key stands in for the passphrase. Exits non-zero on a failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { deriveMissions } from "../lib/missionRecords.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT = path.resolve(HERE, "../../docs/ui-theme/screenshots/ui-12");
fs.mkdirSync(OUT, { recursive: true });
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

// ---------------------------------------------------------------------------
// Seeded Missions
// ---------------------------------------------------------------------------

function record(i) {
  const spec = {
    ...DEFAULT_SPEC,
    site: "E2E Site",
    site_id: "e2e-site-abc123",
    date: "2026-09-26",
    aoi: [
      [37.8, -122.4],
      [37.8, -122.39],
      [37.81, -122.39],
      [37.81, -122.4],
    ],
    home: [37.8, -122.4],
  };
  // UI-23 (#292): the fourth seed is Dispatched and held up by the host, so
  // one row carries the stop tone while the rest stay Planned. Counts below
  // four seed Planned rows only, as before.
  const held = i === 4;
  return {
    id: `m-e2e-${String(i).padStart(4, "0")}`,
    site_id: spec.site_id,
    site: spec.site,
    name: i === 1 ? "North half" : `Block ${i}`,
    date: spec.date,
    created_at: "2026-09-26T00:00:00.000Z",
    updated_at: "2026-09-26T00:00:00.000Z",
    spec,
    dispatched_key: held ? HELD_KEY : null,
  };
}

const HELD_KEY = "specs/e2e-site-abc123/2026-09-26/20260926T000000Z.json";

function payload(count) {
  const records = Array.from({ length: count }, (_, i) => record(i + 1));
  const held = records.some((r) => r.dispatched_key);
  return {
    missions: deriveMissions(
      records,
      {},
      held
        ? {
            pool: [],
            holdings: {
              "way finder 1": {
                spec_key: HELD_KEY,
                card: "way finder 1",
                flight: 1,
                flights: 1,
                reserved_at: "2026-09-26T00:00:00.000Z",
              },
            },
          }
        : { pool: [], holdings: {} },
    ),
    archived_count: 0,
    stale_cards: [],
    host: held
      ? {
          notice: {
            type: "card-ledger",
            at: "2026-09-26T07:20:00Z",
            waiting: [HELD_KEY],
            reason: "no Card is reserved for specs/e2e-old.json; nothing was touched.",
          },
          drift: null,
        }
      : { notice: null, drift: null },
    unreadable: [],
    now: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

let failed = false;
const report = {};
function check(section, name, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"} ${section}/${name}${detail ? ` — ${detail}` : ""}`);
}
function note(section, name, detail = "") {
  console.log(`NOTE ${section}/${name}${detail ? ` — ${detail}` : ""}`);
}

async function pageFor(browser, { width, height, mobile = false, missions = 1, media = {} }) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: media.reducedMotion ?? "no-preference",
  });
  await context.addInitScript(
    ({ body, key }) => {
      localStorage.setItem(key, "evidence");
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        if (url.includes("/api/missions")) {
          return Promise.resolve(
            new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
          );
        }
        return orig(input, init);
      };
    },
    { body: payload(missions), key: PASSPHRASE_KEY },
  );
  const page = await context.newPage();
  if (media.features) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", { features: media.features });
  }
  return { context, page };
}

// PREVIEW_CSS=<file> measures a proposed change without editing the app: the
// file's rules are added to every page after it loads (UI-12's contrast
// options for the operator).
const PREVIEW_CSS = process.env.PREVIEW_CSS ? fs.readFileSync(process.env.PREVIEW_CSS, "utf8") : "";

async function openPlanner(page) {
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  if (PREVIEW_CSS) await page.addStyleTag({ content: PREVIEW_CSS });
  await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

async function raiseNotice(page) {
  await page.getByRole("button", { name: "Dispatch", exact: true }).first().click();
  await page.locator('[class*="notice"]').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(900);
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

// Backdrops a glass surface can sit on (spec § 12): the hero sky's lowest
// tone, bright satellite tiles (snow, concrete, sand) and a near-black forest
// tile. Glass is blurred, so a surface sees an average colour, never a pixel;
// these are the extremes of that average.
// Behind glass on the hero: the sky's lowest token and the brightest mist the
// hero video shows (measured under the home page title at 375 wide).
const HERO_BACKDROPS = {
  "sky-low": [170, 187, 202],
  mist: [190, 202, 214],
  "sky-top": [73, 108, 129],
};

const TILE_BACKDROPS = {
  snow: [250, 250, 250],
  concrete: [207, 207, 207],
  sand: [226, 210, 170],
  forest: [12, 20, 12],
};

/** Runs in the page: every visible text run on a translucent surface, with
 *  its colour, its surface's fill, and whether it is large text. */
function collectPairs() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || cs.visibility === "hidden") continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    // Skip anything whose own or ancestor opacity hides it (inactive panels).
    let hidden = false;
    for (let a = el; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (Number(acs.opacity) === 0 || acs.display === "none" || a.inert) { hidden = true; break; }
    }
    if (hidden) continue;
    // The surfaces under the text, from the text outwards, down to the
    // outermost glass (a backdrop blur) or the first opaque fill. A glass
    // surface blurs whatever is painted behind it -- the map or the hero --
    // which is no ancestor's background, so the backdrops stand in for it.
    const chain = [];
    const mapCanvas = document.querySelector("canvas.maplibregl-canvas");
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      // The map canvas paints over the backgrounds of the elements that hold
      // it, so nothing from there down is behind a control floating on it.
      if (a !== el && mapCanvas && a.contains(mapCanvas)) break;
      const acs = getComputedStyle(a);
      const bf = acs.backdropFilter || acs.webkitBackdropFilter;
      chain.push({ el: a, bg: parse(acs.backgroundColor), glass: !!bf && bf !== "none" });
    }
    let end = chain.length - 1;
    const opaque = chain.findIndex((c) => c.bg && c.bg[3] >= 1);
    let outerGlass = -1;
    chain.forEach((c, i) => { if (c.glass) outerGlass = i; });
    if (outerGlass >= 0) end = outerGlass;
    if (opaque >= 0 && opaque < end) end = opaque;
    const layers = chain.slice(0, end + 1).filter((c) => c.bg && c.bg[3] > 0).map((c) => c.bg);
    // What the outermost glass sits on: the map where the visible map canvas
    // lies under it, otherwise the hero.
    const surface = (outerGlass >= 0 ? chain[outerGlass].el : el).getBoundingClientRect();
    const canvas = document.querySelector("canvas.maplibregl-canvas");
    let over = "hero";
    if (canvas) {
      let visible = true;
      for (let a = canvas; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (Number(acs.opacity) === 0 || acs.visibility === "hidden" || acs.display === "none" || a.inert) { visible = false; break; }
      }
      const c = canvas.getBoundingClientRect();
      const cx = (surface.left + surface.right) / 2;
      const cy = (surface.top + surface.bottom) / 2;
      if (visible && cx >= c.left && cx <= c.right && cy >= c.top && cy <= c.bottom) over = "map";
    }
    const color = parse(cs.color);
    if (!color) continue;
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const cls = (el.className && typeof el.className === "string" ? el.className : "").split(" ")[0].replace(/_[A-Za-z0-9-]+$/, "");
    el.dataset.lookIdx = String(out.length);
    out.push({ label: `${el.tagName.toLowerCase()}.${cls} "${text.slice(0, 28)}"`, color, layers, large, over, idx: out.length, rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
  }
  return out;
}

const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));

function worstContrast(pair, backdrops) {
  let worst = { ratio: Infinity, on: "" };
  for (const [name, bd] of Object.entries(backdrops)) {
    // Composite the surfaces from the bottom (furthest) up over the backdrop.
    let base = bd;
    for (const layer of [...pair.layers].reverse()) base = over(layer, base);
    const fg = over(pair.color, base);
    const r = ratio(fg, base);
    if (r < worst.ratio) worst = { ratio: r, on: name };
    if (pair.layers.some((l) => l[3] >= 1)) break; // opaque: the backdrop never shows
  }
  return worst;
}

/** The brightest pixel of a PNG screenshot, measured in the page. */
async function brightestPixel(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let best = [0, 0, 0];
    let bestL = -1;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l > bestL) { bestL = l; best = [d[i], d[i + 1], d[i + 2]]; }
    }
    return best;
  }, png.toString("base64"));
}

async function contrastSection(browser) {
  const section = "contrast";
  const rows = [];
  const scenes = [
    { name: "1440 planner", vp: { width: 1440, height: 900 }, setup: async () => {} },
    {
      name: "1440 base-map menu",
      vp: { width: 1440, height: 900 },
      setup: async (page) => {
        await page.locator('[class*="basemapToggle"] button').first().click();
        await page.waitForTimeout(700);
      },
    },
    {
      name: "1440 overlays menu",
      vp: { width: 1440, height: 900 },
      setup: async (page) => {
        await page.locator('[class*="basemapToggle"] button').nth(1).click();
        await page.waitForTimeout(700);
      },
    },
    { name: "1440 notice", vp: { width: 1440, height: 900 }, setup: raiseNotice },
    { name: "375 missions", vp: { width: 375, height: 812, mobile: true }, setup: async () => {} },
    {
      name: "375 map",
      vp: { width: 375, height: 812, mobile: true },
      setup: async (page) => {
        await page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: "Map" }).click();
        await page.waitForTimeout(700);
      },
    },
    {
      name: "375 settings",
      vp: { width: 375, height: 812, mobile: true },
      setup: async (page) => {
        await page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: "Settings" }).click();
        await page.waitForTimeout(700);
      },
    },
  ];
  for (const scene of scenes) {
    const { context, page } = await pageFor(browser, scene.vp);
    try {
      await openPlanner(page);
      await scene.setup(page);
      const pairs = await page.evaluate(collectPairs);
      // Text with no surface of its own sits straight on the hero or a scrim:
      // measure the brightest pixel actually behind it, with the text hidden.
      const bare = pairs.filter((p) => p.layers.length === 0 && p.over === "hero");
      const sampled = new Map();
      if (bare.length) {
        await page.addStyleTag({ content: "[data-look-idx] { color: transparent !important; text-shadow: none !important; }" });
        await page.waitForTimeout(150);
        for (const p of bare) {
          const vw = scene.vp.width;
          const clip = { x: Math.max(0, p.rect.x), y: Math.max(0, p.rect.y), width: Math.max(1, Math.min(p.rect.w, vw - p.rect.x)), height: Math.max(1, p.rect.h) };
          const shot = await page.screenshot({ clip });
          sampled.set(p.idx, await brightestPixel(page, shot));
        }
      }
      for (const pair of pairs) {
        const w = sampled.has(pair.idx)
          ? (() => { const bg = sampled.get(pair.idx); return { ratio: ratio(over(pair.color, bg), bg), on: `pixels rgb(${bg.join(",")})` }; })()
          : worstContrast(pair, pair.over === "map" ? TILE_BACKDROPS : HERO_BACKDROPS);
        const need = pair.large ? 3 : 4.5;
        rows.push({ scene: scene.name, label: pair.label, over: pair.over, ratio: Number(w.ratio.toFixed(2)), on: w.on, need });
      }
    } finally {
      await context.close();
    }
  }
  const failing = rows.filter((r) => r.ratio < r.need);
  report.contrast = { pairs: rows.length, failing };
  const min = rows.reduce((m, r) => (r.ratio < m.ratio ? r : m), { ratio: Infinity });
  check(section, `every text pairing reaches its bar (${rows.length} measured)`, failing.length === 0,
    failing.length ? failing.slice(0, 12).map((f) => `${f.scene} ${f.label} ${f.ratio}:1 on ${f.on} (need ${f.need})`).join("; ") : `lowest ${min.ratio}:1 (${min.scene} ${min.label} on ${min.on})`);
  fs.writeFileSync(path.join(OUT, "contrast.json"), JSON.stringify(rows, null, 2));
}

/** Text on the hero (the home page): no surface behind it, so measure the
 *  brightest backdrop pixel under each text box from a screenshot taken with
 *  the text made transparent. */
async function heroContrastSection(browser) {
  const section = "hero-contrast";
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 375, height: 812, mobile: true },
  ]) {
    const context = await browser.newContext({ viewport: vp, hasTouch: !!vp.mobile, isMobile: !!vp.mobile });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      if (PREVIEW_CSS) await page.addStyleTag({ content: PREVIEW_CSS });
      await page.waitForTimeout(3500);
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll("h1, p, a")]
          .filter((el) => el.textContent.trim() && el.getBoundingClientRect().width > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return { text: el.textContent.trim().slice(0, 30), x: r.x, y: r.y, w: r.width, h: r.height, color: cs.color, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) };
          }),
      );
      await page.addStyleTag({ content: "h1, p, a { color: transparent !important; text-shadow: none !important; }" });
      await page.waitForTimeout(200);
      for (const b of boxes) {
        const shot = await page.screenshot({ clip: { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.w, vp.width - b.x), height: b.h } });
        const brightest = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let best = [0, 0, 0];
          let bestL = -1;
          for (let i = 0; i < d.length; i += 4) {
            const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            if (l > bestL) { bestL = l; best = [d[i], d[i + 1], d[i + 2]]; }
          }
          return best;
        }, shot.toString("base64"));
        const fg = b.color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const r = ratio(fg, brightest);
        const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
        check(section, `${vp.width} "${b.text}"`, r >= (large ? 3 : 4.5), `${r.toFixed(2)}:1 against the brightest pixel rgb(${brightest.join(",")})${large ? " (large text, 3:1)" : ""}`);
      }
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// The notice against the map controls
// ---------------------------------------------------------------------------

async function collisionSection(browser) {
  const section = "collision";
  for (const width of [1280, 1440, 1920]) {
    const { context, page } = await pageFor(browser, { width, height: 900 });
    try {
      await openPlanner(page);
      await raiseNotice(page);
      for (const state of ["compact", "expanded"]) {
        if (state === "expanded") {
          await page.locator('[class*="notice"]').first().click();
          await page.waitForTimeout(800);
        }
        const rects = await page.evaluate(() => {
          const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
          const notice = document.querySelector('[class*="notice"]');
          // The visible notice is its clip, not its box: read the clip inset.
          const nb = r(notice);
          const m = getComputedStyle(notice).clipPath.match(/inset\(([^)]*?)(?: round|\))/);
          if (m) {
            const v = m[1].trim().split(/\s+/).map(parseFloat);
            const [t, rt, bt, lt] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
            nb.t += t; nb.r -= rt; nb.b -= bt; nb.l += lt;
          }
          const controls = [...document.querySelectorAll('[class*="basemapToggle"] > *')].map(r);
          return { notice: nb, controls };
        });
        const hit = rects.controls.filter((c) => !(c.r <= rects.notice.l || c.l >= rects.notice.r || c.b <= rects.notice.t || c.t >= rects.notice.b));
        check(section, `${width} ${state} notice clears the map controls`, hit.length === 0, JSON.stringify({ notice: rects.notice, controls: rects.controls }));
      }
      await page.screenshot({ path: path.join(OUT, `notice-${width}.png`), clip: { x: 0, y: 0, width, height: 260 } });
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

async function fallbackSection(browser) {
  const section = "fallbacks";
  const glassRead = () => {
    const g = document.querySelector(".glass-smoke");
    const cs = getComputedStyle(g);
    return { bg: cs.backgroundColor, filter: cs.backdropFilter || cs.webkitBackdropFilter, border: cs.borderColor };
  };
  // Reduced transparency: glass becomes opaque (spec § 12).
  {
    const { context, page } = await pageFor(browser, { width: 1440, height: 900, media: { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] } });
    try {
      await openPlanner(page);
      const g = await page.evaluate(glassRead);
      const alpha = (g.bg.match(/[\d.]+/g) ?? []).length > 3 ? Number(g.bg.match(/[\d.]+/g)[3]) : 1;
      check(section, "reduced transparency: smoke glass is opaque, no blur", alpha === 1 && (!g.filter || g.filter === "none"), JSON.stringify(g));
      await page.screenshot({ path: path.join(OUT, "fallback-reduced-transparency-1440.png") });
    } finally {
      await context.close();
    }
  }
  // Increased contrast: opaque surfaces and white borders on glass.
  {
    const { context, page } = await pageFor(browser, { width: 1440, height: 900, media: { features: [{ name: "prefers-contrast", value: "more" }] } });
    try {
      await openPlanner(page);
      const g = await page.evaluate(glassRead);
      const alpha = (g.bg.match(/[\d.]+/g) ?? []).length > 3 ? Number(g.bg.match(/[\d.]+/g)[3]) : 1;
      check(section, "increased contrast: smoke glass is opaque with a white edge", alpha === 1 && /255, 255, 255/.test(g.border), JSON.stringify(g));
      await page.screenshot({ path: path.join(OUT, "fallback-more-contrast-1440.png") });
    } finally {
      await context.close();
    }
  }
  // Reduced motion: the hero shows its poster, without birds.
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 375, height: 812, mobile: true },
  ]) {
    const context = await browser.newContext({ viewport: vp, reducedMotion: "reduce", hasTouch: !!vp.mobile, isMobile: !!vp.mobile });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      await page.waitForTimeout(2000);
      const s = await page.evaluate(() => ({
        playing: [...document.querySelectorAll("video")].some((v) => !v.paused && getComputedStyle(v).display !== "none"),
        birds: document.querySelectorAll('[class*="bird"]').length,
        poster: !!document.querySelector('img, [style*="poster"], [class*="poster"]'),
      }));
      check(section, `reduced motion ${vp.width}: poster, no playing video, no birds`, !s.playing && s.birds === 0 && s.poster, JSON.stringify(s));
      await page.screenshot({ path: path.join(OUT, `fallback-reduced-motion-${vp.width}.png`) });
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Keyboard walk
// ---------------------------------------------------------------------------

async function keyboardSection(browser) {
  const section = "keyboard";
  const { context, page } = await pageFor(browser, { width: 1440, height: 900 });
  try {
    await openPlanner(page);
    await page.locator("body").click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
    const stops = [];
    const missing = [];
    for (let i = 0; i < 160; i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : el.closest("label")?.textContent;
        const name = (el.getAttribute("aria-label") || label || el.textContent || el.getAttribute("placeholder") || `${el.tagName}[${el.getAttribute("type") ?? ""}]`).trim().replace(/\s+/g, " ").slice(0, 32);
        const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        return { id: el.tagName + "|" + name + "|" + Math.round(r.x) + "," + Math.round(r.y), name, ring, visible };
      });
      if (!s) continue;
      if (stops.length && s.id === stops[0].id) break;
      stops.push(s);
      if (!s.ring || !s.visible) missing.push(s);
    }
    report.keyboard = stops.map((s) => s.name);
    check(section, `every Tab stop shows a visible focus ring (${stops.length} stops)`, missing.length === 0, missing.slice(0, 8).map((m) => `${m.name}${m.visible ? "" : " (off-screen)"}`).join("; "));
    const names = stops.map((s) => s.name.toLowerCase());
    for (const want of ["refresh", "dispatch", "overlays", "grid", "orbit", "download mission spec"]) {
      check(section, `reaches "${want}"`, names.some((n) => n.includes(want)));
    }
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Mission rows: the row leads with the answer, Details carries the reason
// (UI-23, #292)
// ---------------------------------------------------------------------------

async function missionRowsSection(browser) {
  const section = "mission-rows";
  for (const vp of [
    { width: 375, height: 812, mobile: true },
    { width: 1440, height: 900 },
  ]) {
    const { context, page } = await pageFor(browser, { ...vp, missions: 4 });
    try {
      await openPlanner(page);
      // Three Planned rows share no identical detail paragraph; the held row
      // keeps its stop-tone headline. Before the fix every Planned row
      // repeated its detail sentence on the row itself.
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll("article")].map((a) => ({
          name: a.querySelector("h3")?.textContent ?? "",
          text: a.textContent ?? "",
        })),
      );
      check(section, `${vp.width}: four rows seeded (three Planned, one held)`, rows.length === 4,
        rows.map((r) => r.name).join(" | "));
      const plannedDetail = "Nothing has left the planner yet";
      const repeating = rows.filter((r) => r.text.includes(plannedDetail));
      check(section, `${vp.width}: no Planned row repeats its detail on the row`, repeating.length === 0,
        repeating.map((r) => r.name).join(", "));
      const held = rows.filter((r) => r.text.includes("Not being Loaded"));
      check(section, `${vp.width}: the held row keeps its stop-tone headline`, held.length === 1,
        held[0]?.name ?? "none");
      // Details carries what the row no longer says: open one Planned row's.
      const target = page.locator("article", { hasText: "North half" });
      await target.getByRole("button", { name: "Details", exact: true }).click();
      await page.locator("dialog[open]").waitFor({ timeout: 10000 });
      const sheet = await page.evaluate(() => {
        const d = document.querySelector("dialog[open]");
        const id = d?.getAttribute("aria-labelledby");
        const h = id ? document.getElementById(id) : null;
        return { heading: h?.textContent ?? null, text: d?.textContent ?? "" };
      });
      check(section, `${vp.width}: Details opens with its heading announced`, sheet.heading === "North half",
        JSON.stringify(sheet.heading));
      for (const fact of [plannedDetail, "E2E Site · 2026-09-26", "ha", "photos", "Saved"]) {
        check(section, `${vp.width}: Details shows "${fact}"`, sheet.text.includes(fact));
      }
      // Escape returns focus to the row that opened it (M3's listRef seam).
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 });
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          button: el?.textContent?.trim().slice(0, 8) ?? null,
          row: el?.closest("article")?.querySelector("h3")?.textContent ?? null,
        };
      });
      check(section, `${vp.width}: Escape returns focus to that row's Details button`,
        focus.button === "Details" && (focus.row ?? "").includes("North half"), JSON.stringify(focus));
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// UI-23 (#292) evidence shots: Details open and the Planned row list, at 375
// and 1440. Gated behind ONLY=details-shots so a normal check:look run
// writes nothing; the PNGs are committed on the oc/292-shots assets branch,
// never on the feature branch.
// ---------------------------------------------------------------------------

async function detailsShotsSection(browser) {
  const section = "details-shots";
  const OUT23 = path.resolve(HERE, "../../docs/ui-theme/screenshots/ui-23");
  fs.mkdirSync(OUT23, { recursive: true });
  for (const vp of [
    { width: 375, height: 812, mobile: true },
    { width: 1440, height: 900 },
  ]) {
    const { context, page } = await pageFor(browser, { ...vp, missions: 4 });
    try {
      await openPlanner(page);
      await page.screenshot({ path: path.join(OUT23, `list-${vp.width}.png`) });
      note(section, `${vp.width}: Planned row list`, `list-${vp.width}.png`);
      await page.locator("article", { hasText: "North half" }).getByRole("button", { name: "Details", exact: true }).click();
      await page.locator("dialog[open]").waitFor({ timeout: 10000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT23, `details-${vp.width}.png`) });
      note(section, `${vp.width}: Details open`, `details-${vp.width}.png`);
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Frame rate: panning the map under glass on a throttled phone
// ---------------------------------------------------------------------------

async function panFps(page) {
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + Math.min(box.height / 2, 120);
  await page.evaluate(() => {
    window.__frames = 0;
    window.__run = true;
    const tick = () => { if (!window.__run) return; window.__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) {
    const dx = Math.sin(i / 6) * 120;
    await page.mouse.move(cx + dx, cy + (i % 2 ? 20 : -20), { steps: 2 });
  }
  await page.mouse.up();
  const ms = Date.now() - t0;
  const frames = await page.evaluate(() => { window.__run = false; return window.__frames; });
  return Math.round((frames * 1000) / ms);
}

async function fpsSection(browser) {
  const section = "frame-rate";
  const results = {};
  for (const [label, vp, throttle] of [
    ["375 phone, 4x CPU throttle", { width: 375, height: 812, mobile: false }, 4],
    ["1440 desktop", { width: 1440, height: 900 }, 1],
  ]) {
    const { context, page } = await pageFor(browser, vp);
    try {
      await openPlanner(page);
      if (vp.width < 1000) {
        await page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: "Map" }).click();
        await page.waitForTimeout(700);
      }
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      const glass = await panFps(page);
      await page.addStyleTag({ content: "* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }" });
      await page.waitForTimeout(300);
      const opaque = await panFps(page);
      results[label] = { glass, opaque };
      note(section, label, `${glass} fps with glass, ${opaque} fps with blur off`);
    } finally {
      await context.close();
    }
  }
  report.fps = results;
}

// ---------------------------------------------------------------------------
// For the operator
// ---------------------------------------------------------------------------

async function operatorShots(browser) {
  const section = "operator";
  {
    const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true });
    try {
      await openPlanner(page);
      await page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: "Map" }).click();
      await page.waitForTimeout(900);
      const split = await page.evaluate(() => {
        const map = document.querySelector("canvas.maplibregl-canvas")?.getBoundingClientRect();
        const summary = document.querySelector('[class*="summary"]')?.getBoundingClientRect();
        return { mapTop: map?.top, summaryTop: summary?.top, height: innerHeight };
      });
      note(section, "375 Map tab: map visible above the Summary", `${Math.round(split.summaryTop - (split.mapTop ?? 0))} px of ${split.height}`);
      await page.screenshot({ path: path.join(OUT, "375-map-tab.png") });
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, missions: 14 });
    try {
      await openPlanner(page);
      const cover = await page.evaluate(async () => {
        const rows = document.querySelectorAll("article");
        rows[rows.length - 1]?.scrollIntoView({ block: "end" });
        await new Promise((r) => setTimeout(r, 600));
        const layer = document.querySelector('[class*="heroLayer"]');
        const r = layer?.getBoundingClientRect();
        const bar = document.querySelector('nav[aria-label="Show"]')?.getBoundingClientRect();
        return { top: r?.top, bottom: r?.bottom, tabBarTop: bar?.top ?? innerHeight, height: innerHeight };
      });
      check(section, "375 long Missions list: the hero covers the screen down to the tab bar while scrolled", cover.top <= 0 && cover.bottom >= cover.tabBarTop, JSON.stringify(cover));
      await page.screenshot({ path: path.join(OUT, "375-missions-scrolled.png") });
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch();
try {
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  const want = (g) => !only || only.includes(g);
  if (want("contrast")) await contrastSection(browser);
  if (want("hero")) await heroContrastSection(browser);
  if (want("collision")) await collisionSection(browser);
  if (want("fallbacks")) await fallbackSection(browser);
  if (want("keyboard")) await keyboardSection(browser);
  if (want("mission-rows")) await missionRowsSection(browser);
  if (want("fps")) await fpsSection(browser);
  if (want("operator")) await operatorShots(browser);
  // Gated on an explicit ONLY: a bare run must not write evidence PNGs into
  // the tree.
  if ((process.env.ONLY ?? "").split(",").includes("details-shots")) await detailsShotsSection(browser);
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(failed ? "look check: FAILED" : "look check: all pass");
process.exit(failed ? 1 : 0);
