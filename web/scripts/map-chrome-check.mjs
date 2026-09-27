// UI-7 map chrome check (decision 19, plus the 2026-09-26 icon revision):
// each menu opens/closes by touch, mouse and keyboard; Escape returns focus;
// the other menu closes when one opens; Numbers/Footprint toggle
// independently; the base map switches. Also captures the PR evidence
// screenshots over the satellite basemap.
//
// Usage: build the app first (`npm run build`), serve it
// (`npm run start -- -p 3101`), then `npm run check:map-chrome -- [base-url]`.
//
// One-time browser install on a clean machine (playwright-core ships no
// browser): `npx playwright-core install chromium`.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const SHOTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/ui-theme/screenshots/ui-7",
);

// Both buttons are icon-led: the accessible name carries what the icons show.
const baseBtn = (page) => page.getByRole("button", { name: /^Base map: / }).first();
const overlaysBtn = (page) => page.getByRole("button", { name: /^Overlays/ }).first();
const baseMenu = (page) => page.getByRole("menu", { name: "Base map" });
const overlaysMenu = (page) => page.getByRole("menu", { name: "Overlays" });
const satItem = (page) => page.getByRole("menuitemradio", { name: "Satellite imagery" });
const osmItem = (page) => page.getByRole("menuitemradio", { name: "Street map (OpenStreetMap)" });
const focusedName = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));

async function openPlan(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/plan`, { waitUntil: "networkidle" });
  // Narrow screens open on the Missions view; switch to the map first.
  const mapTab = page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: "Map" });
  if (await mapTab.isVisible()) await mapTab.click();
  await page.getByRole("group", { name: "Map display" }).waitFor();
  // Let the satellite tiles land so the evidence shots show the real basemap.
  await page.waitForTimeout(2500);
  return page;
}

async function mouseAndKeyboard(page) {
  // Base map opens by mouse, switches, closes, focus back on the button.
  assert.equal(await baseBtn(page).getAttribute("aria-label"), "Base map: Satellite");
  assert.equal(await baseBtn(page).getAttribute("aria-expanded"), "false");
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  assert.equal(await baseBtn(page).getAttribute("aria-expanded"), "true");
  assert.equal(await satItem(page).getAttribute("aria-checked"), "true");
  assert.equal(await osmItem(page).getAttribute("aria-checked"), "false");
  await osmItem(page).click();
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.equal(await baseBtn(page).getAttribute("aria-label"), "Base map: Street map");
  assert.equal(await focusedName(page), "Base map: Street map");

  // Escape closes and returns focus.
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  await page.keyboard.press("Escape");
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.equal(await focusedName(page), "Base map: Street map");

  // Keyboard: ArrowDown opens on the first item, arrows move, Escape closes.
  await baseBtn(page).focus();
  await page.keyboard.press("ArrowDown");
  await baseMenu(page).waitFor();
  assert.equal(await focusedName(page), "Satellite imagery");
  await page.keyboard.press("ArrowDown");
  assert.equal(await focusedName(page), "Street map (OpenStreetMap)");
  await page.keyboard.press("ArrowUp");
  assert.equal(await focusedName(page), "Satellite imagery");
  await page.keyboard.press("Escape");
  await baseMenu(page).waitFor({ state: "hidden" });

  // Switch back to satellite for the evidence shots.
  await baseBtn(page).click();
  await satItem(page).click();
  await baseMenu(page).waitFor({ state: "hidden" });

  // Overlays toggle independently and keep the menu open.
  await overlaysBtn(page).click();
  await overlaysMenu(page).waitFor();
  // The Footprint item's visible text becomes the photo dimensions when it is
  // on, so locate both items by order, not by name.
  const items = overlaysMenu(page).getByRole("menuitemcheckbox");
  const numbers = items.nth(0);
  const footprint = items.nth(1);
  await numbers.click();
  await overlaysMenu(page).waitFor(); // still open
  assert.equal(await numbers.getAttribute("aria-checked"), "true");
  assert.equal(await footprint.getAttribute("aria-checked"), "false");
  await footprint.click();
  await overlaysMenu(page).waitFor(); // still open
  assert.equal(await overlaysBtn(page).getAttribute("aria-label"), "Overlays, 2 on");
  assert.match(await overlaysBtn(page).textContent(), /Overlays · 2/);
  await numbers.click();
  assert.equal(await overlaysBtn(page).getAttribute("aria-label"), "Overlays, 1 on");
  await numbers.click();
  assert.equal(await overlaysBtn(page).getAttribute("aria-label"), "Overlays, 2 on");
  // Back to none on so the shots start clean.
  await numbers.click();
  await footprint.click();
  assert.equal(await overlaysBtn(page).getAttribute("aria-label"), "Overlays, none on");

  // Opening one menu closes the other.
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  await overlaysBtn(page).click();
  await overlaysMenu(page).waitFor();
  await baseMenu(page).waitFor({ state: "hidden" });

  // Tap-outside (mouse) closes.
  await page.mouse.click(400, 500);
  await overlaysMenu(page).waitFor({ state: "hidden" });
  console.log("mouse + keyboard checks pass");
}

async function touch(page) {
  await baseBtn(page).tap();
  await baseMenu(page).waitFor();
  await osmItem(page).tap();
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.equal(await baseBtn(page).getAttribute("aria-label"), "Base map: Street map");
  await satItem(page).first().waitFor({ state: "hidden" });
  // Back to satellite for the evidence shots.
  await baseBtn(page).tap();
  await satItem(page).tap();
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.equal(await baseBtn(page).getAttribute("aria-label"), "Base map: Satellite");
  await overlaysBtn(page).tap();
  await overlaysMenu(page).waitFor();
  await page.getByRole("menuitemcheckbox", { name: "Numbers" }).tap();
  assert.equal(
    await page.getByRole("menuitemcheckbox", { name: "Numbers" }).getAttribute("aria-checked"),
    "true",
  );
  // Phone buttons are icon-only; the badge count lives in the accessible name.
  assert.equal(await overlaysBtn(page).getAttribute("aria-label"), "Overlays, 1 on");
  await page.keyboard.press("Escape");
  await overlaysMenu(page).waitFor({ state: "hidden" });
  console.log("touch checks pass");
}

async function shots(browser, label, viewport, mobile) {
  const context = await browser.newContext({ viewport, hasTouch: mobile });
  const page = await openPlan(context, viewport);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `${label}-closed.jpg`), type: "jpeg", quality: 80 });
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  await page.waitForTimeout(600); // opening morph (500ms) settles
  await page.screenshot({ path: path.join(SHOTS, `${label}-menu-base.jpg`), type: "jpeg", quality: 80 });
  await page.keyboard.press("Escape");
  await overlaysBtn(page).click();
  await overlaysMenu(page).waitFor();
  // One overlay on, as the evidence requires.
  await page.getByRole("menuitemcheckbox", { name: "Numbers" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, `${label}-menu-overlays.jpg`), type: "jpeg", quality: 80 });
  await context.close();
  console.log(`${label} screenshots saved`);
}

const browser = await chromium.launch();
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mouseAndKeyboard(await openPlan(desktop, { width: 1440, height: 900 }));
  await desktop.close();
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  await touch(await openPlan(mobile, { width: 375, height: 812 }));
  await mobile.close();
  await shots(browser, "1440", { width: 1440, height: 900 }, false);
  await shots(browser, "375", { width: 375, height: 812 }, true);
  console.log("map chrome check: all pass");
} finally {
  await browser.close();
}
