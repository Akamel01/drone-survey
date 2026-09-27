// UI-14 thin overlay scrollbar check (spec § 10): every scrolling glass
// surface reads one thin, translucent-white thumb with no visible track. The
// shared rule lives in app/globals.css; this proves it reaches the Settings
// and Missions scrollers at both widths.
//
// macOS hides scrollbars unless overlay scrolling is off, so the browser is
// launched with --disable-features=OverlayScrollbar to force them visible.
//
// Usage: build the app first (`npm run build`), serve it
// (`npm run start -- -p 3108`), then
// `SHOT_DIR=/tmp/ui14-shots npm run check:scrollbar -- http://127.0.0.1:3108`.
//
// One-time browser install on a clean machine (playwright-core ships no
// browser): `npx playwright-core install chromium`.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3108";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "ui14-shots");
mkdirSync(SHOT_DIR, { recursive: true });

// The thumb is rgb(255 255 255 / 0.25); the track is transparent (no white).
const THUMB_ALPHA = "0.25";

const read = (el, prop) =>
  el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p), prop);

async function assertScroller(page, selector, label) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "attached" });
  const width = await read(el, "scrollbar-width");
  assert.equal(width, "thin", `${label}: scrollbar-width is thin (got ${width})`);
  const color = await read(el, "scrollbar-color");
  // Computed as two colours, e.g. "rgba(255, 255, 255, 0.25) rgba(0, 0, 0, 0)":
  // thumb first, then the track. The track MUST be transparent -- that is the
  // whole fix; a white/light track is the bug this check exists to catch.
  const colours = color.match(/rgba?\([^)]*\)|transparent/gi) ?? [];
  assert.equal(colours.length, 2, `${label}: names a thumb and a track (got ${color})`);
  const [thumb, track] = colours;
  assert.ok(thumb.includes(THUMB_ALPHA), `${label}: thumb is the ${THUMB_ALPHA} white (got ${thumb})`);
  assert.ok(
    /^transparent$/i.test(track) || /,\s*0(?:\.0+)?\s*\)$/.test(track),
    `${label}: the track is transparent, no white track (got ${track})`,
  );
  console.log(`PASS ${label} scrollbar-width=thin, thumb=${thumb}, track=${track}`);
  return el;
}

// Walk every stylesheet for the transparent-track rule; a cross-origin sheet
// would throw on cssRules, so skip those rather than fail.
async function hasWebkitTrackRule(page) {
  return page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule.selectorText && rule.selectorText.includes("::-webkit-scrollbar-track")) {
          return true;
        }
      }
    }
    return false;
  });
}

const browser = await chromium.launch({ args: ["--disable-features=OverlayScrollbar"] });
try {
  // Wide: Settings and Missions sit side by side and both scroll.
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const widePage = await wide.newPage();
  await widePage.goto(`${BASE}/plan`, { waitUntil: "networkidle" });
  await widePage.waitForTimeout(2500); // let the tiles land
  const settings = await assertScroller(widePage, '[aria-label="Settings"] aside', "1440 Settings");
  await assertScroller(widePage, '[aria-label="Missions"]', "1440 Missions");
  await settings.evaluate((el) => {
    el.scrollTop = 400;
  });
  const scrolled = await settings.evaluate((el) => el.scrollTop);
  assert.ok(scrolled > 0, `1440 Settings scrolled (scrollTop ${scrolled})`);
  console.log(`PASS 1440 Settings scrolled (scrollTop ${scrolled})`);
  await widePage.screenshot({ path: path.join(SHOT_DIR, "1440-settings-scrolled.png") });
  await wide.close();

  // Phone: the Settings view is reached from the bottom tab bar.
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(`${BASE}/plan`, { waitUntil: "networkidle" });
  await phonePage.waitForTimeout(2500);
  const tab = phonePage
    .getByRole("navigation", { name: "Show" })
    .getByRole("button", { name: "Settings" });
  if (await tab.count()) {
    await tab.click();
    await phonePage.waitForTimeout(400);
    await assertScroller(phonePage, '[aria-label="Settings"] aside', "375 Settings");
    await phonePage.screenshot({ path: path.join(SHOT_DIR, "375-settings.png") });
  } else {
    console.log("SKIP 375 tab bar absent; Settings check not run");
  }
  const track = await hasWebkitTrackRule(phonePage);
  assert.ok(track, "a stylesheet carries the ::-webkit-scrollbar-track (no white track) rule");
  console.log("PASS ::-webkit-scrollbar-track rule present");
  await phone.close();

  console.log("SCROLLBAR CHECK PASSED");
} finally {
  await browser.close();
}
