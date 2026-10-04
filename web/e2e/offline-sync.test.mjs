// PWA-3 (#316): edits made with no signal wait on the device and reach the
// store when the network is back -- the built planner in a real browser, over
// the real Mission lifecycle on the in-memory test store.
//
// Arrangement as save-mission.test.mjs: build -> `next start` on a free port ->
// a browser context whose /api/missions* calls are answered in this process by
// `createMissionLifecycle(memoryMissionStore(seed))`. "No signal" is the
// context offline and those calls refused on the wire; "another browser" is a
// save made straight on the lifecycle. The page, the service worker and the
// outbox are the real ones.
//
// E2E_SHOTS=<dir>: the list with edits waiting, the compare, and the refused
// Dispatch, at 375 x 812, for the pull request.

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import { createMissionLifecycle } from "../lib/missionLifecycle.ts";
import { memoryMissionStore } from "../lib/memoryMissionStore.ts";
import { respond } from "../lib/missionRoute.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { freePort, launchBrowser, run, spawnServer, stopServer, waitReady, webRoot } from "../scripts/lib/harness.mjs";

// lib/passphrase.ts imports extensionless, which plain node cannot load, so
// the key is written out here as it is in scripts/look-check.mjs.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const OUTBOX_KEY = "drone-planner.outbox";
const CALLER = { kind: "passphrase" };
const DATE = "2026-09-26";
const AOI = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];
const SITE = { id: "west-quarry-d4e5f6", name: "West Quarry" };

let base;
let browser;
let server;

before(async () => {
  const env = {
    ...process.env,
    B2_BUCKET: "ci",
    B2_KEY_ID: "ci",
    B2_APP_KEY: "ci",
    B2_READ_KEY_ID: "ci",
    B2_READ_APP_KEY: "ci",
    DISPATCH_SECRET: "ci",
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
  const current = server;
  server = undefined;
  await stopServer(current);
  if (browser) await browser.close();
});

function seed() {
  const mission = (id, name, n, over = {}) => ({
    id,
    site_id: SITE.id,
    site: SITE.name,
    name,
    date: DATE,
    created_at: `2026-09-26T08:0${n}:00.000Z`,
    updated_at: `2026-09-26T08:0${n}:00.000Z`,
    spec: { ...DEFAULT_SPEC, site: SITE.name, site_id: SITE.id, date: DATE, aoi: AOI, home: AOI[0] },
    dispatched_key: null,
    ...over,
  });
  return {
    records: [mission("m-planned", "Orchard", 1), mission("m-dispatched", "Roadside", 2, { dispatched_key: "spec-m-dispatched" })],
    manifest: {},
  };
}

/** A planner in a fresh context over a fresh store, with the network to cut and
 *  restore. `log` is every write the store took, in order; `seen` is every
 *  Mission request that reached the wire, whatever became of it. */
async function planner(viewport = { width: 375, height: 812 }) {
  const store = memoryMissionStore(seed());
  const lifecycle = createMissionLifecycle(store);
  const log = [];
  const seen = [];
  let down = false;
  const context = await browser.newContext({ viewport });
  await context.addInitScript((key) => localStorage.setItem(key, "e2e"), PASSPHRASE_KEY);
  await context.route(
    (url) => url.pathname.startsWith("/api/missions"),
    async (route) => {
      const request = route.request();
      const { pathname, searchParams } = new URL(request.url());
      seen.push(`${request.method()} ${pathname}`);
      if (down) return route.abort("internetdisconnected");
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      let outcome;
      if (pathname === "/api/missions/dispatch") outcome = await lifecycle.dispatch(CALLER, body);
      else if (pathname === "/api/missions/withdraw") {
        log.push(`withdraw:${body.id}`);
        outcome = await lifecycle.withdraw(CALLER, body);
      } else if (pathname === "/api/missions/flown") outcome = await lifecycle.setFlown(CALLER, body);
      else if (request.method() === "GET") outcome = await lifecycle.list(CALLER, { archived: true });
      else if (request.method() === "POST") {
        log.push(`save:${body.id ?? "new"}`);
        outcome = await lifecycle.save(CALLER, body);
      } else outcome = await lifecycle.remove(CALLER, { id: searchParams.get("id") });
      const response = respond(outcome);
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    },
  );
  const page = await context.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await rows(page).first().waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await kept(page);
  return {
    store,
    lifecycle,
    log,
    seen,
    context,
    page,
    async cut() {
      down = true;
      await context.setOffline(true);
    },
    async restore() {
      down = false;
      await context.setOffline(false);
    },
  };
}

/** Waits until the worker is in control and has kept the shell and every build
 *  file this page loaded, so a reload with no signal still opens. */
async function kept(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    async () => {
      if (!navigator.serviceWorker.controller || !(await caches.match("/plan"))) return false;
      const loaded = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
      const hits = await Promise.all(loaded.map((u) => caches.match(u)));
      return loaded.length > 0 && hits.every(Boolean);
    },
    null,
    { timeout: 30_000 },
  );
}

const rows = (page) => page.locator("[data-row-id]");
const rowOf = (page, id) => page.locator(`[data-row-id="${id}"]`);
const waiting = (page) => page.locator("[data-waiting]");
const outbox = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), OUTBOX_KEY);
const byId = (store, id) => store.records().find((r) => r.id === id);

/** Poll until `read` says `expected`: React commits after the event that
 *  caused it, and a sync is a chain of requests. */
async function eventually(read, expected, what, ms = 15_000) {
  const deadline = Date.now() + ms;
  let last;
  for (;;) {
    last = await read();
    try {
      assert.deepEqual(last, expected);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`${what}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// A phone by default, where the planner is used with no signal. The tab bar that
// switches to the Missions is there only below 1000 px; wide screens show it always.
async function showMissions(page) {
  const tab = page.getByRole("navigation", { name: "Show" }).getByRole("button", { name: "Missions", exact: true });
  if (await tab.isVisible()) await tab.click();
}

/** Edit a Planned Mission in the editor and save it under a new name. */
async function renameVia(page, id, name) {
  await showMissions(page);
  await rowOf(page, id).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Save Mission", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Save Mission" });
  await sheet.waitFor({ state: "visible", timeout: 10_000 });
  await sheet.getByLabel("Mission name", { exact: true }).fill(name);
  await sheet.locator('form button[type="submit"]').click();
  await sheet.waitFor({ state: "hidden", timeout: 10_000 });
}

async function noticeText(page) {
  const notice = page.locator('[class*="notice"][role="status"], [class*="notice"][role="alert"]').first();
  await notice.waitFor({ state: "attached", timeout: 10_000 });
  return (await notice.textContent()) ?? "";
}

async function shot(page, name) {
  if (!process.env.E2E_SHOTS) return;
  mkdirSync(process.env.E2E_SHOTS, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`) });
}

/** Another browser changes the store's Mission while this one is offline, then
 *  this one edits the same Mission and comes back. Leaves the page showing the
 *  conflict on Orchard's row. */
async function conflict({ page, lifecycle, cut, restore }) {
  await cut();
  await renameVia(page, "m-planned", "Mine");
  await new Promise((resolve) => setTimeout(resolve, 20)); // updated_at is to the millisecond
  const stored = (await lifecycle.list(CALLER, { archived: true })).body.missions.find((m) => m.id === "m-planned");
  const theirs = await lifecycle.save(CALLER, {
    id: "m-planned",
    site_id: stored.site_id,
    site: stored.site,
    name: "Theirs",
    date: stored.date,
    spec: stored.spec,
  });
  assert.ok(theirs.ok, "the other browser's save is taken");
  await restore();
  await showMissions(page);
  await page.getByText("Changed in the store since you edited it").waitFor({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------

test("offline: edits, a new Mission and a Withdraw are kept, still there after a reload, and marked as waiting to sync", async () => {
  const { page, store, seen, context, cut } = await planner();
  try {
    await cut();
    await renameVia(page, "m-planned", "Orchard east");
    // The same editor goes on to save a new Mission: no id, so the phone names it.
    await page.getByRole("button", { name: "Save Mission", exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: "Save Mission" });
    await sheet.waitFor({ state: "visible", timeout: 10_000 });
    await sheet.getByRole("radio", { name: /^Save as new Mission/ }).check();
    await sheet.getByLabel("Mission name", { exact: true }).fill("Fresh cut");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    await showMissions(page);
    await rowOf(page, "m-dispatched").getByRole("button", { name: "Withdraw", exact: true }).click();

    // Nothing reached the store, and the page says what is waiting.
    assert.equal(byId(store, "m-planned").name, "Orchard");
    assert.equal(byId(store, "m-dispatched").withdrawn_at, undefined);
    const check = async () => {
      assert.match((await rowOf(page, "m-planned").innerText()), /Orchard east/);
      assert.match((await rowOf(page, "m-planned").innerText()), /Edit waiting to sync\./);
      assert.match((await rowOf(page, "m-dispatched").innerText()), /Withdraw waiting to sync\./);
      const fresh = page.locator('[data-pending-id^="local-"]');
      assert.match(await fresh.innerText(), /Fresh cut/);
      assert.match(await fresh.innerText(), /Not in the store yet\. Waiting to sync\./);
      assert.equal(await waiting(page).textContent(), "3 waiting to sync");
    };
    await check();
    assert.match(await noticeText(page), /kept on this device/i);
    await shot(page, "offline-sync-waiting-375x812");

    // Reloaded with no signal: the same list, the same marks.
    await page.reload({ waitUntil: "domcontentloaded" });
    await rows(page).first().waitFor({ timeout: 30_000 });
    await check();
    assert.equal((await outbox(page)).length, 3);

    // Dispatch is refused, with the reason, and never tried.
    const dispatch = rowOf(page, "m-planned").getByRole("button", { name: "Dispatch", exact: true });
    assert.ok(await dispatch.isDisabled());
    assert.match(await rowOf(page, "m-planned").innerText(), /Dispatch needs the network/);
    assert.equal(seen.filter((r) => r.endsWith("/dispatch")).length, 0);
    await rowOf(page, "m-planned").scrollIntoViewIfNeeded();
    await shot(page, "offline-sync-dispatch-refused-375x812");
  } finally {
    await context.close();
  }
});

test("back online: the outbox replays in order and clears, and the store has every change", async () => {
  const { page, store, log, context, cut, restore } = await planner();
  try {
    await cut();
    await renameVia(page, "m-planned", "Orchard east");
    await page.getByRole("button", { name: "Save Mission", exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: "Save Mission" });
    await sheet.waitFor({ state: "visible", timeout: 10_000 });
    await sheet.getByRole("radio", { name: /^Save as new Mission/ }).check();
    await sheet.getByLabel("Mission name", { exact: true }).fill("Fresh cut");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    await showMissions(page);
    await rowOf(page, "m-dispatched").getByRole("button", { name: "Withdraw", exact: true }).click();
    assert.equal((await outbox(page)).length, 3);
    log.length = 0;

    await restore();
    await waiting(page).waitFor({ state: "detached", timeout: 15_000 });

    assert.equal(log.length, 3);
    assert.equal(log[0], "save:m-planned");
    assert.match(log[1], /^save:local-/);
    assert.equal(log[2], "withdraw:m-dispatched");
    assert.equal(byId(store, "m-planned").name, "Orchard east");
    const fresh = store.records().find((r) => r.name === "Fresh cut");
    assert.ok(fresh, "the Mission made offline is in the store");
    assert.match(fresh.id, /^local-/);
    assert.ok(byId(store, "m-dispatched").withdrawn_at, "the Withdraw reached the store");
    assert.deepEqual(await outbox(page), []);
    assert.match(await noticeText(page), /3 changes made offline are now in the store/);
    assert.equal(await page.locator('[data-pending-id]').count(), 0);
    await rowOf(page, "m-planned").getByText("Orchard east").waitFor();
  } finally {
    await context.close();
  }
});

test("conflict: the compare shows both versions, and keep mine saves mine over the store's", async () => {
  const ctx = await planner();
  const { page, store, context } = ctx;
  try {
    await conflict(ctx);
    assert.equal(byId(store, "m-planned").name, "Theirs", "nothing was written over the store's version");
    assert.match(await noticeText(page), /changed in the store while you were offline/);
    assert.equal((await outbox(page)).length, 1, "mine is kept until the operator chooses");

    await rowOf(page, "m-planned").getByRole("button", { name: "Compare", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: /Two versions of/ });
    await sheet.waitFor({ state: "visible", timeout: 10_000 });
    assert.match(await sheet.locator('[data-version="mine"]').innerText(), /Mine/);
    assert.match(await sheet.locator('[data-version="store"]').innerText(), /Theirs/);
    await shot(page, "offline-sync-compare-375x812");

    await sheet.getByRole("button", { name: "Keep mine", exact: true }).click();
    await waiting(page).waitFor({ state: "detached", timeout: 15_000 });
    assert.equal(byId(store, "m-planned").name, "Mine");
    assert.deepEqual(await outbox(page), []);
  } finally {
    await context.close();
  }
});

test("wide screen: offline, the Missions list, Settings and Summary stay, and a saved edit shows as waiting to sync", async () => {
  const { page, store, context, cut } = await planner({ width: 1280, height: 800 });
  try {
    await cut();
    // The map area gives way to its no-network scene; the panels do not.
    await page.locator('[data-network="offline"]').waitFor({ timeout: 10_000 });
    for (const name of ["Missions", "Settings"]) assert.ok(await page.getByRole("region", { name, exact: true }).isVisible(), `${name} stays`);
    assert.ok(await page.getByRole("button", { name: "Save Mission", exact: true }).first().isVisible(), "the Summary's Save stays");

    await renameVia(page, "m-planned", "Orchard east");
    assert.equal(byId(store, "m-planned").name, "Orchard", "nothing reached the store");
    assert.match(await rowOf(page, "m-planned").innerText(), /Orchard east/);
    assert.match(await rowOf(page, "m-planned").innerText(), /Edit waiting to sync\./);
    assert.equal(await waiting(page).textContent(), "1 waiting to sync");
    await shot(page, "offline-sync-waiting-1280x800");
  } finally {
    await context.close();
  }
});

test("conflict: take the store's drops mine and leaves the store as it is", async () => {
  const ctx = await planner();
  const { page, store, context } = ctx;
  try {
    await conflict(ctx);
    await rowOf(page, "m-planned").getByRole("button", { name: "Compare", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: /Two versions of/ });
    await sheet.waitFor({ state: "visible", timeout: 10_000 });
    await sheet.getByRole("button", { name: /^Take the store/ }).click();

    await eventually(() => outbox(page), [], "the outbox after taking the store's");
    assert.equal(byId(store, "m-planned").name, "Theirs");
    await rowOf(page, "m-planned").getByText("Theirs").waitFor();
    assert.equal(await waiting(page).count(), 0);
  } finally {
    await context.close();
  }
});
