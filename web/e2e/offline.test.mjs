// PWA-1 (#313): the planner as an installable app that opens with no network.
//
// Arrangement as save-mission.test.mjs: build -> `next start` on a free port ->
// a browser context whose /api/missions calls are answered in this process by
// the real Mission lifecycle over the in-memory store. The service worker is
// left on (it is what is under test), and the network is cut two ways at once:
// the server process is stopped and the context goes offline, so nothing
// reaches the app by any route except the worker's cache.
//
// PWA-2 (#315) rides on the same server: a Site's street map is kept through
// the real /api/site-map route, which reads a small PMTiles archive this file
// serves itself (scripts/lib/pmtilesFixture.mjs), stored in the browser, and
// drawn with the network cut.
//
// E2E_SHOTS=<dir>: the offline planner at 375 x 812, for the pull request.

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import { createMissionLifecycle } from "../lib/missionLifecycle.ts";
import { memoryMissionStore } from "../lib/memoryMissionStore.ts";
import { respond } from "../lib/missionRoute.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { MAX_TILES, siteBounds, tilesFor } from "../lib/siteMap.ts";
import { pmtilesArchive, serveArchive } from "../scripts/lib/pmtilesFixture.mjs";
import { freePort, launchBrowser, run, spawnServer, stopServer, waitReady, webRoot } from "../scripts/lib/harness.mjs";

// lib/passphrase.ts imports extensionless, which plain node cannot load, so
// the key is written out here as it is in scripts/look-check.mjs.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const CALLER = { kind: "passphrase" };
const AOI = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];

let base;
let browser;
let server;
let archive;

before(async () => {
  archive = await serveArchive(pmtilesArchive(tilesFor(siteBounds(AOI)).tiles));
  const env = {
    ...process.env,
    B2_BUCKET: "ci",
    B2_KEY_ID: "ci",
    B2_APP_KEY: "ci",
    B2_READ_KEY_ID: "ci",
    B2_READ_APP_KEY: "ci",
    DISPATCH_SECRET: "ci",
    SITE_MAP_PMTILES_URL: archive.url,
  };
  delete env.DATABASE_URL;
  const port = await freePort();
  base = `http://localhost:${port}`;
  const build = await run("npm", ["run", "build"], env);
  console.log(`[build] ${build.at(-1) ?? "(no output)"}`);
  assert.ok(existsSync(path.join(webRoot, ".next", "BUILD_ID")), "the build produced .next/BUILD_ID");
  server = spawnServer(env, port);
  await waitReady(server, `${base}/plan`, "next start");
  browser = await launchBrowser();
  process.on("exit", () => {
    try {
      if (server) process.kill(-server.proc.pid, "SIGKILL");
    } catch {}
  });
});

after(async () => {
  await archive?.close();
  const current = server;
  server = undefined;
  await stopServer(current);
  if (browser) await browser.close();
});

function seed() {
  const mission = (id, name, n) => ({
    id,
    site_id: "quarry-road-a1b2c3",
    site: "Quarry Road",
    name,
    date: "2026-09-26",
    created_at: `2026-09-26T08:0${n}:00.000Z`,
    updated_at: `2026-09-26T08:0${n}:00.000Z`,
    spec: { ...DEFAULT_SPEC, site: "Quarry Road", site_id: "quarry-road-a1b2c3", date: "2026-09-26", aoi: AOI, home: AOI[0] },
    dispatched_key: null,
  });
  return { records: [mission("m-one", "Orchard", 1), mission("m-two", "Roadside", 2)], manifest: {} };
}

/** A context with the planner's Mission list answered in-process, until `cut()`. */
async function planner() {
  const lifecycle = createMissionLifecycle(memoryMissionStore(seed()));
  let down = false;
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript((key) => localStorage.setItem(key, "ci"), PASSPHRASE_KEY);
  await context.route(
    (url) => url.pathname === "/api/missions",
    async (route) => {
      if (down) return route.abort("internetdisconnected");
      const response = respond(await lifecycle.list(CALLER, { archived: true }));
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    },
  );
  return {
    context,
    async cut() {
      down = true;
      const current = server;
      server = undefined;
      await stopServer(current);
      await context.setOffline(true);
    },
  };
}

const rows = (page) => page.locator("[data-row-id]");

/** Waits until the worker is in control and has kept the shell and every build
 *  file this page loaded. */
async function kept(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller || !(await caches.match("/plan"))) return false;
    const loaded = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
    const hits = await Promise.all(loaded.map((u) => caches.match(u)));
    return loaded.length > 0 && hits.every(Boolean);
  }, null, { timeout: 30_000 });
}

test("installable: Chrome's own check finds nothing wrong with the manifest", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  // Playwright's contexts are incognito, where Chrome never offers Install.
  assert.deepEqual(installabilityErrors.filter((e) => e.errorId !== "in-incognito"), []);
  const { url, errors } = await cdp.send("Page.getAppManifest");
  assert.ok(url.endsWith("/manifest.webmanifest"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("a new deployment's worker replaces the old cache", async () => {
  const { context } = await planner();
  const page = await context.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await kept(page);
  const version = (await (await page.request.get(`${base}/sw.js`)).text()).match(/CACHE = "(mission-control-[^"]+)"/)?.[1];
  assert.ok(version, "the worker names its cache after the build");

  // What an earlier deploy left behind, and no worker installed: the next visit installs this build's.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    await caches.open("mission-control-old");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  let keys = [];
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
    keys = await page.evaluate(() => caches.keys());
    if (!keys.includes("mission-control-old")) break;
    await page.waitForTimeout(250);
  }
  assert.deepEqual(keys, [version]);
  await context.close();
});

/** Edit the first Mission (its Site becomes the editor's), open Settings and keep
 *  that Site's map. Resolves to the sentence the section reports. */
async function keepSite(page) {
  await rows(page).first().getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator('nav[aria-label="Show"]').getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Keep this Site's map offline" }).click();
  const done = page.getByText(/^Kept Quarry Road offline: \d+ tiles, [\d.]+ (B|KB|MB)\.$/);
  await done.waitFor({ timeout: 30_000 });
  return done.innerText();
}

const siteCaches = (page) => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("site-map-")));

test("a Site's map is kept bounded, its size and persistence are shown, removing frees it", async () => {
  const { context } = await planner();
  const page = await context.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await rows(page).first().waitFor({ timeout: 30_000 });
  const sentence = await keepSite(page);

  const manifest = await page.evaluate(async () => (await (await (await caches.open("site-map-quarry-road-a1b2c3")).match("/site-map/manifest.json")).json()));
  assert.ok(manifest.tiles > 0 && manifest.tiles <= MAX_TILES, `bounded: ${manifest.tiles} tiles`);
  assert.equal(manifest.maxZoom, 15);
  const held = await page.evaluate(async () => (await (await caches.open("site-map-quarry-road-a1b2c3")).keys()).length);
  assert.equal(held, manifest.tiles + 1, "every tile and the manifest, nothing else");
  assert.ok(manifest.bytes > 0);
  assert.ok(sentence.includes(`${manifest.tiles} tiles`));

  // The size is on the list beside the Site, and the browser's answer on persistent storage is shown.
  const list = page.getByRole("list", { name: "Sites kept offline" });
  assert.match(await list.innerText(), /Quarry Road[\s\S]*\d+ tiles/);
  await page.getByText(/^Persistent storage: (granted|not granted|not supported)/).waitFor();
  if (process.env.E2E_SHOTS) {
    mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    await page.getByRole("heading", { name: "Offline map" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "offline-map-settings-375x812.png") });
  }

  await page.getByRole("button", { name: "Remove Quarry Road from offline" }).click();
  await page.getByText(/^Removed Quarry Road: [\d.]+ (B|KB|MB) freed\.$/).waitFor();
  assert.deepEqual(await siteCaches(page), [], "its cache is gone");
  assert.equal(await list.count(), 0);
  await context.close();
});

// Last: it stops the server, which no later test could do without.
test("opened offline after one online visit: last-read Missions and an offline notice", async () => {
  const { context, cut } = await planner();
  const online = await context.newPage();
  await online.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await rows(online).first().waitFor({ timeout: 30_000 });
  await online.waitForLoadState("networkidle");
  await kept(online);
  await keepSite(online);
  await online.close();

  await cut();

  const page = await context.newPage();
  const response = await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  assert.ok(response?.ok(), "the shell came from the worker, not a browser error page");
  await rows(page).first().waitFor({ timeout: 30_000 });
  assert.equal(await rows(page).count(), 2, "both Missions from the last read");
  const notice = page.getByText("You are offline.");
  await notice.waitFor({ timeout: 10_000 });
  assert.match(await page.locator("body").innerText(), /not live/);

  // PWA-2: the Site's kept map is what the map shows, drawn from the browser's own storage.
  await rows(page).first().getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator('[data-basemap="offline"]').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => Number(document.querySelector("[data-basemap]")?.getAttribute("data-drawn")) > 0, null, { timeout: 30_000 });
  if (process.env.E2E_SHOTS) {
    mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "offline-site-map-375x812.png") });
  }
  await page.locator('nav[aria-label="Show"]').getByRole("button", { name: "Missions" }).click();

  // The app's other front door, "/", goes on to the planner rather than to an error.
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/plan$/, { timeout: 10_000 });
  await rows(page).first().waitFor({ timeout: 30_000 });

  if (process.env.E2E_SHOTS) {
    mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "offline-375x812.png") });
  }
  await context.close();
});
