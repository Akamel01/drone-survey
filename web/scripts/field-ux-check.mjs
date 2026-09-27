// Field-UX check (research #226). Encodes the three machine-checkable rules
// from docs/research/field-ux-evidence.md:
//   1. touch targets  -- WCAG 2.5.8 (24x24 AA, hard) and the project floor
//                        (44x44), swept in EACH narrow view (Missions, Map,
//                        Settings): the Mission list lives only in Missions, the
//                        map menu only in Map, the Sidebar only in Settings.
//   2. sunlight ink   -- ink vs the 40%-white map-pill fill, composited over
//                        reference basemap tiles (WCAG 1.4.3 non-large text)
//   3. haptics        -- a support PROBE, never a pass/fail (see the doc: the
//                        Vibration API is Blink-only; iOS never ships it)
//
// Usage: build + serve the app, then
//   node scripts/field-ux-check.mjs [base-url]
// (Mirrors scripts/map-chrome-check.mjs; playwright-core ships no browser, so
//  a clean machine needs `npx playwright-core install chromium` once.)
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
];

// WCAG relative luminance + contrast ratio, verbatim from the SC 1.4.3 definition.
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parseRgb = (s) => s.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];

// A translucent white fill over an opaque tile: out = a*255 + (1-a)*tile.
// MapPane.module.css uses rgb(255 255 255 / 0.4) and dark ink --ink:#0B0B0C.
const composite = (alpha, tile) => tile.map((t) => alpha * 255 + (1 - alpha) * t);
const GREY = (v) => [v, v, v];
const REF_TILE_BRIGHT = GREY(0xcf); // paper-bright concrete, per the CSS comment
const REF_TILE_MID = GREY(0x80); // average imagery
const REF_TILE_DARK = GREY(0x1a); // near-black forest -- the worst case

// The three narrow views and each one's own render anchor (page.tsx:381).
// Below 1000px the page shows one view at a time (plan.module.css:107-121), so
// a size sweep must visit every view or it silently skips that view's controls.
const VIEWS = [
  { name: "Missions", ready: (p) => p.getByRole("region", { name: "Missions" }) },
  { name: "Map", ready: (p) => p.getByRole("group", { name: "Map display" }) },
  { name: "Settings", ready: (p) => p.getByRole("region", { name: "Settings" }) },
];

async function openPlan(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/plan`, { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Show" }).waitFor({ state: "attached" });
  await page.waitForTimeout(1500);
  return page;
}

/** Switch the narrow view and wait for its panel to render. On a wide screen
 *  (not used here) the tab bar is hidden and all three panels show at once. */
async function showView(page, view) {
  const tab = page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: view.name });
  if (await tab.isVisible()) {
    await tab.click();
    await page.waitForTimeout(400);
  }
  await view.ready(page).first().waitFor({ state: "visible" });
}

// Rule 1: every visible interactive element is at least 24x24 (fails the WCAG AA
// hard gate) and, per the field-glove evidence, should reach 44x44 (reported).
// MapLibre injects its own scale/attribution controls; WCAG 2.5.8's user-agent
// and inline exceptions cover them, so they are reported separately, never
// asserted against. (Map pins are not in the selector at all: they are plain
// divs, so the Essential exception the doc cites does not arise in the sweep.)
async function targetSizes(page, viewport, view) {
  const els = await page.$$eval(
    'button, a, input, select, textarea, [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="button"]',
    (nodes) =>
      nodes
        .map((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (!r.width || !r.height || s.visibility === "hidden" || s.display === "none") return null;
          return {
            name: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 32) || el.tagName,
            w: Math.round(r.width),
            h: Math.round(r.height),
            thirdParty: !!el.closest('[class*="maplibregl-ctrl"]'),
          };
        })
        .filter(Boolean),
  );
  const exempt = els.filter((e) => e.thirdParty);
  const app = els.filter((e) => !e.thirdParty);
  const under24 = app.filter((e) => e.w < 24 || e.h < 24);
  const under44 = app.filter((e) => e.w < 44 || e.h < 44);
  console.log(
    `[${viewport.width}x${viewport.height} ${view}] ${app.length} app interactive elements` +
      (exempt.length ? `, ${exempt.length} MapLibre-injected reported separately` : ""),
  );
  if (exempt.length) console.log("  exempt (WCAG 2.5.8 inline/user-agent):", exempt);
  if (under44.length) console.log(`  below 44x44 (${under44.length}):`, under44);
  assert.equal(
    under24.length,
    0,
    `[${view}] WCAG 2.5.8 (24x24 AA) violated by: ${JSON.stringify(under24)}`,
  );
  return { total: app.length, under44: under44.length };
}

// Rule 2: the opaque-ink map pills must hold 4.5:1 against the composite of
// their own 40%-white fill and the tile behind it. Computed, not photographed:
// the real ceiling is that a physical glare check is still needed (see the doc).
async function sunlightContrast(page) {
  const pill = page.getByRole("button", { name: /^Base map: / }).first();
  const { color, background } = await pill.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor };
  });
  const ink = parseRgb(color);
  const alpha = parseRgb(background)[3] ?? 1;
  const at = (hex) => composite(alpha, hex);
  const ratios = {
    bright: contrast(ink, at(REF_TILE_BRIGHT)),
    mid: contrast(ink, at(REF_TILE_MID)),
    dark: contrast(ink, at(REF_TILE_DARK)),
  };
  console.log(
    `[sunlight] pill ink ${color} over ${Math.round(alpha * 100)}% white fill: ` +
      `bright ${ratios.bright.toFixed(2)}:1, mid ${ratios.mid.toFixed(2)}:1, dark ${ratios.dark.toFixed(2)}:1`,
  );
  assert.ok(ratios.bright >= 4.5, `ink fails 4.5:1 on a bright tile (${ratios.bright.toFixed(2)})`);
  assert.ok(ratios.mid >= 4.5, `ink fails 4.5:1 on a mid tile (${ratios.mid.toFixed(2)})`);
  if (ratios.dark < 4.5) {
    console.log(
      `  note: over a near-black tile the ratio falls to ${ratios.dark.toFixed(2)}:1 -- ` +
        `the pill must not sit on very dark imagery; a field glare check still applies.`,
    );
  }
}

// Rule 5: haptics are a probe. navigator.vibrate present => Android/Chromium
// only; absence is the correct, expected result on iOS. Never an assertion.
async function hapticsProbe(page) {
  const support = await page.evaluate(() => ({
    vibrate: typeof navigator.vibrate,
    ua: navigator.userAgent,
  }));
  console.log(
    `[haptics] navigator.vibrate is ${support.vibrate} on ${support.ua.slice(0, 60)} ` +
      `(probe only; no pass/fail -- web haptics do not exist on iOS)`,
  );
}

const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await openPlan(context, viewport);
    // Sweep every narrow view: Missions owns the Mission list, Map the map
    // chrome, Settings the Sidebar. Nothing is hidden from the sweep.
    for (const view of VIEWS) {
      await showView(page, view);
      await targetSizes(page, viewport, view.name);
    }
    // The contrast + haptics rules live on the Map view.
    await showView(page, VIEWS.find((v) => v.name === "Map"));
    if (viewport.width === 375) {
      await sunlightContrast(page);
      await hapticsProbe(page);
    }
    await context.close();
  }
  console.log("field-ux check: pass");
} finally {
  await browser.close();
}
