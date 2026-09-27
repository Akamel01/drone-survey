// UI-7 map chrome check (decision 19): each menu opens/closes by touch,
// mouse and keyboard; Escape returns focus; the other menu closes when one
// opens; Numbers/Footprint toggle independently; the base map switches.
// Also captures the PR evidence screenshots over the satellite basemap.
//
// Usage: serve the built app first (`npx next start -p 3101`), then
// `node scripts/map-chrome-check.mjs [base-url]`.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const SHOTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/ui-theme/screenshots/ui-7",
);

const baseBtn = (page) => page.getByRole("button", { name: /Satellite|OSM/ }).first();
const overlaysBtn = (page) => page.getByRole("button", { name: /Overlays/ }).first();
const baseMenu = (page) => page.getByRole("menu", { name: "Base map" });
const overlaysMenu = (page) => page.getByRole("menu", { name: "Overlays" });

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
  assert.match(await baseBtn(page).textContent(), /Satellite/);
  assert.equal(await baseBtn(page).getAttribute("aria-expanded"), "false");
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  assert.equal(await baseBtn(page).getAttribute("aria-expanded"), "true");
  assert.equal(await page.getByRole("menuitemradio", { name: "Satellite" }).getAttribute("aria-checked"), "true");
  assert.equal(await page.getByRole("menuitemradio", { name: "OSM" }).getAttribute("aria-checked"), "false");
  await page.getByRole("menuitemradio", { name: "OSM" }).click();
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.match(await baseBtn(page).textContent(), /OSM/);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "OSM");

  // Escape closes and returns focus.
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  await page.keyboard.press("Escape");
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "OSM");

  // Keyboard: ArrowDown opens on the first item, arrows move, Escape closes.
  await baseBtn(page).focus();
  await page.keyboard.press("ArrowDown");
  await baseMenu(page).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Satellite");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "OSM");
  await page.keyboard.press("ArrowUp");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Satellite");
  await page.keyboard.press("Escape");
  await baseMenu(page).waitFor({ state: "hidden" });

  // Switch back to satellite for the evidence shots.
  await baseBtn(page).click();
  await page.getByRole("menuitemradio", { name: "Satellite" }).click();
  await baseMenu(page).waitFor({ state: "hidden" });

  // Overlays toggle independently and keep the menu open.
  await overlaysBtn(page).click();
  await overlaysMenu(page).waitFor();
  const numbers = page.getByRole("menuitemcheckbox", { name: "Numbers" });
  const footprint = page.getByRole("menuitemcheckbox", { name: "Footprint" });
  await numbers.click();
  await overlaysMenu(page).waitFor(); // still open
  assert.equal(await numbers.getAttribute("aria-checked"), "true");
  assert.equal(await footprint.getAttribute("aria-checked"), "false");
  await footprint.click();
  await overlaysMenu(page).waitFor(); // still open
  assert.match(await overlaysBtn(page).textContent(), /Overlays · 2/);
  await numbers.click();
  assert.match(await overlaysBtn(page).textContent(), /Overlays · 1/);
  await numbers.click();
  assert.match(await overlaysBtn(page).textContent(), /Overlays · 2/);

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
  await page.getByRole("menuitemradio", { name: "OSM" }).tap();
  await baseMenu(page).waitFor({ state: "hidden" });
  assert.match(await baseBtn(page).textContent(), /OSM/);
  await page.getByRole("menuitemradio", { name: "Satellite" }).first().waitFor({ state: "hidden" });
  await overlaysBtn(page).tap();
  await overlaysMenu(page).waitFor();
  await page.getByRole("menuitemcheckbox", { name: "Numbers" }).tap();
  assert.equal(
    await page.getByRole("menuitemcheckbox", { name: "Numbers" }).getAttribute("aria-checked"),
    "true",
  );
  await page.keyboard.press("Escape");
  await overlaysMenu(page).waitFor({ state: "hidden" });
  console.log("touch checks pass");
}

async function shots(browser, label, viewport, mobile) {
  const context = await browser.newContext({ viewport, hasTouch: mobile });
  const page = await openPlan(context, viewport);
  await baseBtn(page).click();
  await baseMenu(page).waitFor();
  await page.waitForTimeout(600); // opening morph (500ms) settles
  await page.screenshot({ path: path.join(SHOTS, `${label}-menu-base.jpg`), type: "jpeg", quality: 80 });
  await page.keyboard.press("Escape");
  await overlaysBtn(page).click();
  await overlaysMenu(page).waitFor();
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
