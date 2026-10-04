// PWA-4 (#318): Load a Mission from the app at the aircraft, end to end.
//
// Arrangement as offline.test.mjs: build -> `next start` on a free port -> a
// browser context whose Mission routes are answered in this process by the real
// Mission lifecycle over the in-memory store. The board is a stand-in
// (scripts/board/standin_board.py): board_service.py itself with a fake loader,
// so its routes, origin allowlist and CORS are the real ones and nothing can
// reach a Controller. The phone's side is the real built app talking to it
// from the browser, as it does at the aircraft.
//
// E2E_SHOTS=<dir>: the Load view at 375 x 812, for the pull request.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { createMissionLifecycle } from "../lib/missionLifecycle.ts";
import { memoryMissionStore } from "../lib/memoryMissionStore.ts";
import { respond } from "../lib/missionRoute.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { freePort, launchBrowser, run, spawnServer, stopServer, waitReady, webRoot } from "../scripts/lib/harness.mjs";

const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const BOARD_KEY = "drone-planner.board-address";
const CALLER = { kind: "passphrase" };
const AOI = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];
const STANDIN = path.resolve(webRoot, "../scripts/board/standin_board.py");
const SPEC_KEYS = {
  ok: "specs/g-ok/2026-09-26/20260926T214926Z-8636f888.json",
  refuse: "specs/g-refuse/2026-09-26/20260926T214927Z-8636f889.json",
  crash: "specs/g-crash/2026-09-26/20260926T214928Z-8636f88a.json",
};

let base;
let browser;
let server;
const boards = [];

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
    for (const b of boards) b.proc.kill("SIGKILL");
  });
});

after(async () => {
  const current = server;
  server = undefined;
  await stopServer(current);
  if (browser) await browser.close();
  for (const b of boards.splice(0)) {
    b.proc.kill("SIGTERM");
    rmSync(b.dir, { recursive: true, force: true });
  }
});

/** A stand-in board on a free port, allowing `origin` (the app's, unless told otherwise); ready when it has said where it is. */
async function board(extra = [], origin = base) {
  const port = await freePort();
  const dir = mkdtempSync(path.join(os.tmpdir(), "standin-"));
  const proc = spawn("python3", [STANDIN, "--port", String(port), "--allow-origin", origin, "--state", dir, "--delay", "1", ...extra], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    proc.once("exit", (code) => reject(new Error(`stand-in board exited ${code}`)));
    proc.stdout.once("data", resolve);
  });
  const b = { proc, dir, url: `http://127.0.0.1:${port}` };
  boards.push(b);
  return b;
}

/** Three Collected Missions, one per way a Load can end, named after the Specs the board offers. */
function seed() {
  const mission = (id, name, key, n) => ({
    id,
    site_id: "quarry-road-a1b2c3",
    site: "Quarry Road",
    name,
    date: "2026-09-26",
    created_at: `2026-09-26T08:0${n}:00.000Z`,
    updated_at: `2026-09-26T08:0${n}:00.000Z`,
    spec: { ...DEFAULT_SPEC, site: "Quarry Road", site_id: "quarry-road-a1b2c3", date: "2026-09-26", aoi: AOI, home: AOI[0] },
    dispatched_key: key,
  });
  const collected = { collected_at: "2026-09-26T09:00:00Z" };
  return {
    records: [
      mission("m-ok", "Orchard", SPEC_KEYS.ok, 1),
      mission("m-refuse", "Roadside", SPEC_KEYS.refuse, 2),
      mission("m-crash", "Ridge", SPEC_KEYS.crash, 3),
    ],
    manifest: Object.fromEntries(Object.values(SPEC_KEYS).map((k) => [k, collected])),
  };
}

/** A phone at the aircraft: the planner's Mission routes answered in-process, the board's address set. */
async function phone(boardUrl, viewport = { width: 375, height: 812 }) {
  const store = memoryMissionStore(seed());
  const lifecycle = createMissionLifecycle(store);
  const state = { storeUp: true };
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([key, boardKey, address]) => {
      localStorage.setItem(key, "e2e");
      if (address) localStorage.setItem(boardKey, address);
    },
    [PASSPHRASE_KEY, BOARD_KEY, boardUrl],
  );
  await context.route(
    (url) => url.pathname === "/api/missions" || url.pathname === "/api/missions/loaded",
    async (route) => {
      if (!state.storeUp) return route.abort("internetdisconnected");
      const request = route.request();
      const response =
        new URL(request.url()).pathname === "/api/missions/loaded"
          ? respond(await lifecycle.setLoaded(CALLER, request.postDataJSON()))
          : respond(await lifecycle.list(CALLER, { archived: true }));
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    },
  );
  const page = await context.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-row-id]").first().waitFor({ timeout: 30_000 });
  return { context, page, store, state };
}

const sheet = (page) => page.locator("dialog[open]");

async function openLoad(page) {
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await sheet(page).waitFor();
}

async function shot(page, name) {
  if (!process.env.E2E_SHOTS) return;
  mkdirSync(process.env.E2E_SHOTS, { recursive: true });
  // The sheet's entrance is 400 ms plus its stagger.
  await page.waitForTimeout(900);
  const { width, height } = page.viewportSize();
  await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}-${width}x${height}.png`) });
}

test("a Collected Mission is Loaded through the board: progress, the Card and its points, and the store told", async () => {
  const b = await board();
  const { context, page, store } = await phone(b.url);
  await shot(page, "missions");
  await openLoad(page);
  await sheet(page).getByText("Orchard").waitFor();
  assert.match(await sheet(page).innerText(), /Quarry Road, 2026-09-26.*way finder 4/s);
  await shot(page, "load-ready");

  await sheet(page).getByRole("button", { name: "Load Orchard" }).click();
  await sheet(page).getByText("Loading Orchard…").waitFor();
  await shot(page, "load-running");

  await sheet(page).getByText("Open way finder 4", { exact: true }).waitFor({ timeout: 30_000 });
  const text = await sheet(page).innerText();
  assert.match(text, /125 points/, "the points to check inside the Card");
  assert.match(text, /Marked Loaded in the store/);
  await shot(page, "load-result");

  const record = store.records().find((r) => r.id === "m-ok");
  assert.equal(record.loaded_mark.cards[0].card, "way finder 4");
  assert.equal(record.loaded_mark.cards[0].waypoints, 125);
  const list = await createMissionLifecycle(store).list(CALLER, { archived: true });
  assert.equal(list.body.missions.find((m) => m.id === "m-ok").state, "loaded");
  await context.close();
});

test("on a wide screen the Load button sits in the Missions panel and the sheet is a centred panel", async () => {
  const b = await board();
  const { context, page } = await phone(b.url, { width: 1440, height: 900 });
  await shot(page, "missions");
  await openLoad(page);
  await sheet(page).getByRole("button", { name: "Load Orchard" }).waitFor();
  await shot(page, "load-ready");
  await context.close();
});

test("a refusal shows its reason and leaves the store alone; a broken loader says not to fly", async () => {
  const b = await board();
  const { context, page, store } = await phone(b.url);
  await openLoad(page);

  await sheet(page).getByRole("button", { name: "Load Roadside" }).click();
  await sheet(page).getByText("Not Loaded. The Controller was left as it was.").waitFor({ timeout: 30_000 });
  assert.match(await sheet(page).innerText(), /the Card pool has changed since it was calibrated; nothing was touched/);
  await shot(page, "load-refused");
  assert.equal(store.records().find((r) => r.id === "m-refuse").loaded_mark, undefined);

  await sheet(page).getByRole("button", { name: "Load another" }).click();
  await sheet(page).getByRole("button", { name: "Load Ridge" }).click();
  await sheet(page).getByText("The Load failed. Do not fly this Mission.").waitFor({ timeout: 30_000 });
  assert.match(await sheet(page).innerText(), /FileNotFoundError: jmtpfs/);
  assert.equal(store.records().find((r) => r.id === "m-crash").loaded_mark, undefined);
  await context.close();
});

test("a Controller that is not plugged in is said, and nothing can be Loaded", async () => {
  const b = await board(["--unplugged"]);
  const { context, page } = await phone(b.url);
  await openLoad(page);
  await sheet(page).getByText(/not plugged into the board/).waitFor();
  assert.equal(await sheet(page).getByRole("button", { name: "Load Orchard" }).isDisabled(), true);

  // Plug it in and ask again.
  rmSync(path.join(b.dir, "unplugged"));
  await sheet(page).getByRole("button", { name: "Refresh" }).click();
  await sheet(page).getByRole("button", { name: "Load Orchard" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("dialog[open]")?.textContent?.includes("not plugged into the board"));
  assert.equal(await sheet(page).getByRole("button", { name: "Load Orchard" }).isDisabled(), false);
  await context.close();
});

test("an unreachable board shows the checklist, and a corrected address finds it", async () => {
  const b = await board();
  const dead = await freePort();
  const { context, page } = await phone(`http://127.0.0.1:${dead}`);
  await openLoad(page);
  await sheet(page).getByText("The board did not answer.").waitFor({ timeout: 30_000 });
  const text = await sheet(page).innerText();
  for (const item of [/hotspot is on/, /board has power/, /certificate is trusted/, /local network/]) assert.match(text, item);
  await shot(page, "load-unreachable");

  await sheet(page).getByLabel("Board address").fill("not an address");
  await sheet(page).getByRole("button", { name: "Try again" }).click();
  await sheet(page).getByText(/That is not an address/).waitFor();

  await sheet(page).getByLabel("Board address").fill(b.url);
  await sheet(page).getByRole("button", { name: "Try again" }).click();
  await sheet(page).getByRole("button", { name: "Load Orchard" }).waitFor();
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), BOARD_KEY), b.url, "the corrected address is kept");
  await context.close();
});

test("a board that does not allow this app looks unreachable, and the checklist names the allowlist", async () => {
  const b = await board([], "http://localhost:1");
  const { context, page } = await phone(b.url);
  await openLoad(page);
  // The browser hides a refused origin's reply, so what shows is the checklist.
  await sheet(page).getByText("The board did not answer.").waitFor({ timeout: 30_000 });
  assert.match(await sheet(page).innerText(), /lists this app's address as allowed/);
  await context.close();
});

test("with no way to the store, the Load stands and the Mission is marked Loaded when back online", async () => {
  const b = await board();
  const { context, page, store, state } = await phone(b.url);
  await openLoad(page);
  state.storeUp = false;
  await sheet(page).getByRole("button", { name: "Load Orchard" }).click();
  await sheet(page).getByText("Open way finder 4", { exact: true }).waitFor({ timeout: 30_000 });
  assert.match(await sheet(page).innerText(), /marked Loaded when this phone is back online/);
  assert.equal(store.records().find((r) => r.id === "m-ok").loaded_mark, undefined, "the store was not reached");
  await shot(page, "load-queued");

  state.storeUp = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  for (const deadline = Date.now() + 15_000; Date.now() < deadline; ) {
    if (store.records().find((r) => r.id === "m-ok").loaded_mark) break;
    await page.waitForTimeout(250);
  }
  assert.equal(store.records().find((r) => r.id === "m-ok").loaded_mark.cards[0].waypoints, 125);
  assert.equal(await page.evaluate(() => localStorage.getItem("drone-planner.pending-loaded")), "[]");
  await context.close();
});
