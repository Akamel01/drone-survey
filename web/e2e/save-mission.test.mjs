// UI-30 (#309): the Save Mission sheet end to end -- the built planner in a real
// browser, over the real Mission lifecycle on the in-memory test store.
//
// Arrangement: build -> `next start` on a free port -> for each test, a fresh
// browser context whose /api/missions calls are answered in this process by
// `createMissionLifecycle(memoryMissionStore(seed))`. Every save, fork and
// refusal is the module's own, so "each option does what it says" is asserted
// against the store the routes use, not against a stub of it. No accounts and
// no database: the planner and the Mission routes are all this suite talks to.
//
// One `node --test` file, run with --test-concurrency=1 like the others.
//
// E2E_SHOTS=<dir>: the sheet at 375 x 812 and 1440 x 900 for a new Mission and
// for a Planned, a Dispatched and a Loaded edit, for the pull request.

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import { createMissionLifecycle } from "../lib/missionLifecycle.ts";
import { memoryMissionStore } from "../lib/memoryMissionStore.ts";
import { respond } from "../lib/missionRoute.ts";
import { supersessionGroup } from "../lib/missionRecords.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { freePort, launchBrowser, run, spawnServer, stopServer, waitReady, webRoot } from "../scripts/lib/harness.mjs";

// lib/passphrase.ts imports extensionless, which plain node cannot load, so
// the key is written out here as it is in scripts/look-check.mjs.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const CALLER = { kind: "passphrase" };

let base;
let browser;
let server;

// ---------------------------------------------------------------------------
// Arrangement: build -> start -> browser
// ---------------------------------------------------------------------------

before(async () => {
  // The build's placeholders are the DB-free `web` CI job's; DATABASE_URL is
  // dropped so neither the build's migrate step nor the app touches a store.
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

// ---------------------------------------------------------------------------
// The seeded store: one Mission in every state the sheet distinguishes
// ---------------------------------------------------------------------------

const DATE = "2026-09-26";
const AOI = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];
const SITES = {
  road: { id: "quarry-road-a1b2c3", name: "Quarry Road" },
  west: { id: "west-quarry-d4e5f6", name: "West Quarry" },
  field: { id: "rehearsal-1", name: "Rehearsal Field" },
};
let clock = 0;

function mission(id, name, site, over = {}) {
  const at = `2026-09-26T08:${String(clock++).padStart(2, "0")}:00.000Z`;
  return {
    id,
    site_id: site.id,
    site: site.name,
    name,
    date: DATE,
    created_at: at,
    updated_at: at,
    spec: { ...DEFAULT_SPEC, site: site.name, site_id: site.id, date: DATE, aoi: AOI, home: AOI[0] },
    dispatched_key: null,
    ...over,
  };
}

const dispatched = (id) => ({ dispatched_key: `spec-${id}` });
const LOADED_ENTRY = {
  collected_at: "2026-09-26T07:30:00.000Z",
  loaded_at: "2026-09-26T07:35:00.000Z",
  cards: [{ card: "way finder 1", name: "way finder 1", waypoints: 12, path_length_m: 900 }],
};

function seed() {
  clock = 0;
  return {
    records: [
      mission("m-planned", "Orchard", SITES.west),
      mission("m-dispatched", "Roadside", SITES.road, dispatched("m-dispatched")),
      mission("m-collected", "Ridge", SITES.west, dispatched("m-collected")),
      mission("m-loading", "Meadow", SITES.field, dispatched("m-loading")),
      mission("m-flown", "Pasture", SITES.field, {
        ...dispatched("m-flown"),
        flown_mark: { flown: true, at: "2026-09-26T09:00:00.000Z" },
      }),
      mission("m-withdrawn", "Creek", SITES.road, {
        ...dispatched("m-withdrawn"),
        withdrawn_at: "2026-09-26T09:00:00.000Z",
      }),
      mission("m-old", "Knoll", SITES.west, dispatched("m-old")),
      mission("m-new", "Knoll", SITES.west, { ...dispatched("m-new"), supersedes: ["m-old"] }),
    ],
    manifest: { "spec-m-collected": { collected_at: "2026-09-26T07:30:00.000Z" } },
  };
}

// ---------------------------------------------------------------------------
// Driving the planner
// ---------------------------------------------------------------------------

/** A planner in a fresh context whose Mission routes are the real lifecycle
 *  over a fresh store. `posted` is every save body the page sent. */
async function planner(viewport = { width: 1440, height: 900 }) {
  const store = memoryMissionStore(seed());
  const lifecycle = createMissionLifecycle(store);
  const posted = [];
  // Saves the browser is to lose on the wire: the request goes out and no
  // answer comes back, as when the network drops.
  let dropped = 0;
  const context = await browser.newContext({ viewport });
  await context.addInitScript((key) => localStorage.setItem(key, "e2e"), PASSPHRASE_KEY);
  await context.route(
    (url) => url.pathname === "/api/missions" || url.pathname === "/api/missions/dispatch",
    async (route) => {
      const request = route.request();
      let outcome;
      if (new URL(request.url()).pathname === "/api/missions/dispatch") {
        outcome = await lifecycle.dispatch(CALLER, request.postDataJSON());
      } else if (request.method() === "GET") {
        outcome = await lifecycle.list(CALLER, { archived: true });
      } else if (request.method() === "POST") {
        posted.push(request.postDataJSON());
        if (dropped > 0) {
          dropped -= 1;
          await route.abort("failed");
          return;
        }
        outcome = await lifecycle.save(CALLER, request.postDataJSON());
      } else {
        outcome = await lifecycle.remove(CALLER, { id: new URL(request.url()).searchParams.get("id") });
      }
      const response = respond(outcome);
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    },
  );
  const page = await context.newPage();
  await load(page);
  return {
    store,
    lifecycle,
    posted,
    context,
    page,
    dropNextSave: () => {
      dropped += 1;
    },
  };
}

async function load(page) {
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-row-id]").first().waitFor({ timeout: 30_000 });
}

const saveButton = (page) => page.getByRole("button", { name: "Save Mission", exact: true }).first();
const sheetOf = (page) => page.getByRole("dialog", { name: "Save Mission" });
const rowOf = (page, id) => page.locator(`[data-row-id="${id}"]`);
const edit = (page, id) => rowOf(page, id).getByRole("button", { name: "Edit", exact: true }).click();

async function openSheet(page) {
  await saveButton(page).click();
  const sheet = sheetOf(page);
  await sheet.waitFor({ state: "visible", timeout: 10_000 });
  return sheet;
}

/** Retry a DOM read until it says what it should: React commits after the
 *  event that caused it, so a read straight after an action can be early. */
async function eventually(read, expected, what) {
  const deadline = Date.now() + 8_000;
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

const optionNames = (sheet) => sheet.locator('label [class*="optionLabel"]').allTextContents();
const confirmName = (sheet) => sheet.locator('form button[type="submit"]').textContent();
const fields = (sheet) => ({
  name: sheet.getByLabel("Mission name", { exact: true }),
  site: sheet.getByRole("combobox", { name: "Site", exact: true }),
});

/** What has focus, named the way a screen reader would name it. */
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return (el?.labels?.[0]?.textContent ?? el?.getAttribute("aria-label") ?? el?.tagName ?? "").trim();
  });

async function noticeText(page) {
  const notice = page.locator('[class*="notice"][role="status"], [class*="notice"][role="alert"]').first();
  await notice.waitFor({ state: "attached", timeout: 10_000 });
  return (await notice.textContent()) ?? "";
}

const byId = (store, id) => store.records().find((r) => r.id === id);

async function shot(page, name) {
  if (!process.env.E2E_SHOTS) return;
  mkdirSync(process.env.E2E_SHOTS, { recursive: true });
  // The sheet's entrance is 400 ms plus its stagger; let it settle.
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`) });
}

// ---------------------------------------------------------------------------
// A new Mission: name and Site, the Site found by typing, created by choosing
// ---------------------------------------------------------------------------

test("a new Mission: the sheet asks for name and Site; a Site is found by typing and created only by choosing", async () => {
  const { page, store, posted, context } = await planner();
  try {
    const save = saveButton(page);
    assert.equal((await save.textContent())?.trim(), "Save Mission");
    assert.ok(await save.isEnabled(), "a missing name and Site does not disable the button");
    const before = store.records().length;

    const sheet = await openSheet(page);
    // Announced: a dialog named by its heading; focus starts on the first field.
    assert.equal(await sheet.evaluate((el) => el.tagName), "DIALOG");
    assert.deepEqual(await optionNames(sheet), [], "a new Mission has nothing to choose, only name and Site");
    assert.equal(await focused(page), "Mission name");
    const { name, site } = fields(sheet);
    const confirm = sheet.locator('form button[type="submit"]');
    assert.equal(await confirmName(sheet), "Save Mission");
    assert.ok(await confirm.isDisabled(), "the sheet asks for what is missing");

    // Typing part of a name lists the Sites that match, case and spacing
    // ignored, and offers a new one for the text as typed.
    await site.fill("quar");
    await eventually(
      () => sheet.getByRole("option").allTextContents(),
      ["Quarry Road", "West Quarry", "New Site: quar"],
      "options for 'quar'",
    );
    // A name an existing Site already has offers that Site, never a twin (#166).
    await site.fill("west  QUARRY");
    await eventually(() => sheet.getByRole("option").allTextContents(), ["West Quarry"], "twin guard");
    // Typing alone chooses nothing: leaving the field drops the text.
    await site.fill("Nowhere Yet");
    await site.press("Tab");
    assert.equal(await site.inputValue(), "", "an unchosen name is not a Site");
    assert.ok(await confirm.isDisabled());

    // Choose an existing Site by clicking it, and name the Mission.
    await site.fill("quar");
    await sheet.getByRole("option", { name: "West Quarry", exact: true }).click();
    assert.equal(await site.inputValue(), "West Quarry");
    await name.fill("north half");
    assert.ok(await confirm.isEnabled());
    await confirm.click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted.length, 1);
    assert.equal(posted[0].id, undefined, "a new Mission is a save without an id");
    assert.equal(posted[0].site_id, SITES.west.id);
    assert.equal(posted[0].name, "north half");
    assert.equal(store.records().length, before + 1);
    const notice = await noticeText(page);
    // The Notice shows the first sentence as its title, without its full stop.
    assert.match(notice, /“north half” is saved/);
    assert.match(notice, /It is Planned until you Dispatch it\./);
  } finally {
    await context.close();
  }
});

test("a new Site is created only by choosing New Site: <name>, and the same field replaces the Settings picker", async () => {
  const { page, store, posted, context } = await planner();
  try {
    // Settings: one field, not a select.
    const settingsSite = page.locator("#site-select");
    assert.equal(await settingsSite.evaluate((el) => el.tagName), "INPUT");
    assert.equal(await settingsSite.getAttribute("role"), "combobox");
    assert.equal(await page.locator("select#site-select").count(), 0, "the picker is gone");
    await settingsSite.fill("rehe");
    await eventually(
      () => page.getByRole("listbox", { name: "Sites" }).getByRole("option").allTextContents(),
      ["Rehearsal Field", "New Site: rehe"],
      "Settings options",
    );
    await page.getByRole("option", { name: "Rehearsal Field", exact: true }).click();
    assert.equal(await settingsSite.inputValue(), "Rehearsal Field");

    // The Sheet: a name that matches none offers only the deliberate choice.
    const sheet = await openSheet(page);
    const { name, site } = fields(sheet);
    assert.equal(await site.inputValue(), "Rehearsal Field", "the sheet starts from the Site Settings holds");
    await name.fill("east block");
    await site.fill("Brand New Field");
    await eventually(
      () => sheet.getByRole("option").allTextContents(),
      ["New Site: Brand New Field"],
      "only the new-Site choice",
    );
    await site.press("Enter");
    assert.equal(await site.inputValue(), "Brand New Field");
    assert.equal(posted.length, 0, "choosing is not saving");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted.length, 1);
    assert.equal(posted[0].site, "Brand New Field");
    assert.match(posted[0].site_id, /^brand-[a-z0-9]+$/);
    assert.equal(posted[0].spec.site_id, posted[0].site_id, "the Spec carries the Site it was saved under");
    assert.ok(store.records().some((r) => r.site_id === posted[0].site_id && r.name === "east block"));
    // Settings now shows the saved Site.
    assert.equal(await settingsSite.inputValue(), "Brand New Field");
  } finally {
    await context.close();
  }
});

test("keyboard and screen reader: Escape closes the list first and the sheet second, and saves nothing", async () => {
  const { page, posted, context } = await planner();
  try {
    const sheet = await openSheet(page);
    const { site } = fields(sheet);
    assert.equal(await focused(page), "Mission name");
    await site.fill("zz");
    await eventually(() => sheet.getByRole("option").allTextContents(), ["New Site: zz"], "list open");
    await site.press("Escape");
    assert.ok(await sheet.isVisible(), "Escape on an open list closes the list only");
    assert.equal(await sheet.getByRole("option").count(), 0);
    await site.press("Escape");
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    assert.equal(posted.length, 0, "Escape cancels without saving");
    assert.ok(
      await saveButton(page).evaluate((el) => el === document.activeElement),
      "focus returns to the Save Mission button",
    );

    // A second open starts again from the planner, not from what was typed.
    const again = await openSheet(page);
    assert.equal(await fields(again).site.inputValue(), "");
    await again.getByRole("button", { name: "Cancel", exact: true }).click();
    await again.waitFor({ state: "hidden", timeout: 10_000 });
    assert.equal(posted.length, 0);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// Editing: what each state offers, and that each option does what it says
// ---------------------------------------------------------------------------

test("Planned: Save changes overwrites it", async () => {
  const { page, store, posted, context } = await planner();
  try {
    await edit(page, "m-planned");
    assert.equal((await saveButton(page).textContent())?.trim(), "Save Mission");
    const sheet = await openSheet(page);
    assert.deepEqual(await optionNames(sheet), ["Save changes", "Save as new Mission"]);
    assert.match(await focused(page), /^Save changes/, "focus starts on the first field: the chosen option");
    assert.ok(await sheet.getByRole("radio", { name: /^Save changes/ }).isChecked());
    const { name, site } = fields(sheet);
    assert.equal(await name.inputValue(), "Orchard");
    assert.equal(await site.inputValue(), "West Quarry");
    const before = store.records().length;

    await name.fill("Orchard east");
    assert.equal(await confirmName(sheet), "Save changes");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted[0].id, "m-planned", "changes name the Mission");
    assert.equal(store.records().length, before, "overwritten, not added");
    assert.equal(byId(store, "m-planned").name, "Orchard east");
    assert.match(await noticeText(page), /Changes are saved to “Orchard east”/);
    assert.equal(await page.locator("#mission-name").inputValue(), "Orchard east");
  } finally {
    await context.close();
  }
});

test("Planned: Save as new Mission keeps it and saves a copy under a different name", async () => {
  const { page, store, posted, context } = await planner();
  try {
    await edit(page, "m-planned");
    const original = structuredClone(byId(store, "m-planned"));
    const before = store.records().length;
    const sheet = await openSheet(page);
    await sheet.getByRole("radio", { name: /^Save as new Mission/ }).check();
    const { name } = fields(sheet);
    assert.equal(await name.inputValue(), "Orchard (2)", "prefilled as <name> (2)");
    assert.equal(await confirmName(sheet), "Save as new Mission");

    // The same name would make it a replacement, so the sheet asks for another.
    await name.fill("Orchard");
    await eventually(
      () => sheet.locator('form button[type="submit"]').isDisabled(),
      true,
      "same name is refused",
    );
    await name.fill("Orchard (2)");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted[0].id, undefined, "a new Mission is a save without an id");
    assert.equal(store.records().length, before + 1);
    assert.deepEqual(byId(store, "m-planned"), original, "the Planned Mission is untouched");
    assert.match(
      await noticeText(page),
      /“Orchard \(2\)” is saved as a new Mission; “Orchard” is left as it is/,
    );
  } finally {
    await context.close();
  }
});

for (const [id, name] of [
  ["m-dispatched", "Roadside"],
  ["m-collected", "Ridge"],
]) {
  test(`${id.slice(2)}: Save as replacement keeps its name, Site and date`, async () => {
    const { page, store, posted, context } = await planner();
    try {
      await edit(page, id);
      const original = structuredClone(byId(store, id));
      const before = store.records().length;
      const sheet = await openSheet(page);
      assert.deepEqual(await optionNames(sheet), ["Save as replacement", "Save as new Mission"]);
      assert.equal((await saveButton(page).textContent())?.trim(), "Save Mission");
      assert.match(await focused(page), /^Save as replacement/);
      // A replacement is only one under the same Site, date and name, so they are fixed.
      const nameField = fields(sheet).name;
      assert.equal(await nameField.inputValue(), name);
      assert.notEqual(await nameField.getAttribute("readonly"), null, "the name is fixed");
      assert.equal(await confirmName(sheet), "Save as replacement");
      await sheet.locator('form button[type="submit"]').click();
      await sheet.waitFor({ state: "hidden", timeout: 10_000 });

      assert.equal(posted[0].id, id, "a replacement names the Mission it replaces");
      assert.equal(store.records().length, before + 1);
      assert.deepEqual(byId(store, id), original, "a Spec is never edited");
      const fork = store.records().find((r) => r.id !== id && r.name === name && r.site_id === original.site_id);
      assert.ok(fork, "the replacement is a new Mission");
      assert.equal(fork.dispatched_key, null, "it is Planned until Dispatched");
      assert.equal(supersessionGroup(fork), supersessionGroup(original), "so Dispatching it supersedes the old one");
      assert.match(await noticeText(page), new RegExp(`“${name}” is saved as a replacement`));
    } finally {
      await context.close();
    }
  });
}

test("Dispatched: Save as new Mission leaves the old one alone, under a different name", async () => {
  const { page, store, posted, context } = await planner();
  try {
    await edit(page, "m-dispatched");
    const original = structuredClone(byId(store, "m-dispatched"));
    const before = store.records().length;
    const sheet = await openSheet(page);
    await sheet.getByRole("radio", { name: /^Save as new Mission/ }).check();
    const { name } = fields(sheet);
    assert.equal(await name.inputValue(), "Roadside (2)");
    assert.equal(await name.getAttribute("readonly"), null, "a new Mission's name is asked for");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted[0].id, undefined);
    assert.equal(store.records().length, before + 1);
    assert.deepEqual(byId(store, "m-dispatched"), original);
    const added = store.records().find((r) => r.name === "Roadside (2)");
    assert.notEqual(supersessionGroup(added), supersessionGroup(original), "it does not replace the old one");
    assert.match(await noticeText(page), /is saved as a new Mission; “Roadside” is left as it is/);
  } finally {
    await context.close();
  }
});

test("Loaded: only Save as new Mission, with the reason; the state is the list's, read while editing", async () => {
  const { page, store, posted, context } = await planner();
  try {
    // Open it while Dispatched, then let the host Load it: the list is what
    // says so, and the sheet must follow it, not the state it opened with.
    await edit(page, "m-loading");
    store.putManifest({ ...store.manifest(), "spec-m-loading": LOADED_ENTRY });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await rowOf(page, "m-loading").getByRole("button", { name: "Edit", exact: true }).waitFor({
      state: "detached",
      timeout: 10_000,
    });
    const original = structuredClone(byId(store, "m-loading"));
    const before = store.records().length;

    assert.equal((await saveButton(page).textContent())?.trim(), "Save Mission");
    const sheet = await openSheet(page);
    assert.deepEqual(await optionNames(sheet), [], "no choice: a Loaded file is already on the Controller");
    assert.equal(await sheet.getByRole("radio").count(), 0);
    assert.match((await sheet.textContent()) ?? "", /already Loaded: its file is on the Controller/);
    assert.equal(await confirmName(sheet), "Save as new Mission");
    assert.equal(await focused(page), "Mission name");
    assert.equal(await fields(sheet).name.inputValue(), "Meadow (2)");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted[0].id, undefined, "a new Mission, never an overwrite of the Loaded one");
    assert.equal(store.records().length, before + 1);
    assert.deepEqual(byId(store, "m-loading"), original);
    assert.match(await noticeText(page), /“Meadow \(2\)” is saved as a new Mission; “Meadow” is left as it is/);
  } finally {
    await context.close();
  }
});

test("Flown, Withdrawn and Superseded: only Save as new Mission", async () => {
  const { page, store, posted, context } = await planner();
  try {
    await page.getByRole("button", { name: /^Show \d+ archived$/ }).click();
    for (const [id, state] of [
      ["m-flown", "Flown"],
      ["m-withdrawn", "Withdrawn"],
      ["m-old", "Superseded"],
    ]) {
      await edit(page, id);
      assert.equal((await saveButton(page).textContent())?.trim(), "Save Mission", state);
      const sheet = await openSheet(page);
      assert.deepEqual(await optionNames(sheet), [], `${state}: nothing to choose`);
      assert.equal(await sheet.getByRole("radio").count(), 0, state);
      assert.match((await sheet.textContent()) ?? "", new RegExp(`This Mission is ${state}, so it stays as it is\\.`));
      assert.equal(await confirmName(sheet), "Save as new Mission", state);
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    }
    assert.equal(posted.length, 0);

    // One through to the store: a Flown Mission is never overwritten.
    await edit(page, "m-flown");
    const original = structuredClone(byId(store, "m-flown"));
    const before = store.records().length;
    const sheet = await openSheet(page);
    assert.equal(await fields(sheet).name.inputValue(), "Pasture (2)");
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    assert.equal(posted[0].id, undefined);
    assert.equal(store.records().length, before + 1);
    assert.deepEqual(byId(store, "m-flown"), original);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// A plan with problems is a draft: it saves, and Dispatch refuses it
// ---------------------------------------------------------------------------

test("an Orbit with no point of interest saves as a Planned Mission; Dispatch refuses it, naming the problem", async () => {
  const { page, store, lifecycle, posted, context } = await planner();
  try {
    // A new Orbit with no subject set: the planner lists the problem, and Save
    // is still there (operator decision 2026-09-29: allow drafts).
    await page.locator("#settings-panel").getByRole("radio", { name: "Orbit", exact: true }).click();
    await page.getByText("no point of interest set").first().waitFor({ timeout: 10_000 });
    const save = saveButton(page);
    assert.equal((await save.textContent())?.trim(), "Save Mission");
    assert.ok(await save.isEnabled(), "a plan with problems can still be saved");

    const sheet = await openSheet(page);
    const said = (await sheet.textContent()) ?? "";
    assert.match(said, /still has problems, so it is saved as an unfinished Planned Mission/);
    assert.match(said, /It cannot be Dispatched until they are fixed/);
    assert.match(said, /no point of interest set/, "the problems are named in the sheet");
    const { name, site } = fields(sheet);
    await name.fill("Tower orbit");
    await site.fill("west");
    await sheet.getByRole("option", { name: "West Quarry", exact: true }).click();
    await sheet.locator('form button[type="submit"]').click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });

    assert.equal(posted[0].spec.mission_type, "orbit");
    assert.equal(posted[0].spec.orbit.center, null);
    const rows = async () => (await lifecycle.list(CALLER, { archived: true })).body.missions;
    const draft = (await rows()).find((r) => r.name === "Tower orbit");
    assert.ok(draft, "the Mission was stored");
    assert.equal(draft.state, "planned", "saved as an unfinished Planned Mission");

    // Dispatch on it is refused, in the planner's own list, with the problem named.
    const row = rowOf(page, draft.id);
    await row.waitFor({ state: "visible", timeout: 10_000 });
    await row.getByRole("button", { name: "Dispatch", exact: true }).click();
    const alert = page.locator('[class*="notice"][role="alert"]').first();
    await alert.waitFor({ state: "attached", timeout: 10_000 });
    const refusal = (await alert.textContent()) ?? "";
    assert.match(refusal, /This Mission cannot be Dispatched: an orbit needs a subject/);
    assert.equal((await rows()).find((r) => r.id === draft.id).state, "planned", "still Planned");
    assert.deepEqual(store.ledger().holdings, {}, "no Card is reserved");
    assert.equal(store.specs().size, 0, "no Spec is written for the host to Collect");
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// A failed save keeps the sheet and what was typed; retrying works
// ---------------------------------------------------------------------------

test("a refused save keeps the sheet open with the choice, name and Site, says why, and a retry succeeds", async () => {
  const { page, store, posted, context } = await planner();
  try {
    await edit(page, "m-planned");
    const before = store.records().length;
    const sheet = await openSheet(page);
    await sheet.getByRole("radio", { name: /^Save as new Mission/ }).check();
    const { name, site } = fields(sheet);
    await name.fill("Orchard field");
    await site.fill("rehe");
    await sheet.getByRole("option", { name: "Rehearsal Field", exact: true }).click();

    // The store refuses this one write, as when the bucket cannot be reached.
    store.failNext("writeMission", new Error("the bucket is unreachable"));
    const confirm = sheet.locator('form button[type="submit"]');
    await confirm.click();
    const alert = sheet.getByRole("alert");
    await alert.waitFor({ state: "visible", timeout: 10_000 });
    assert.match((await alert.textContent()) ?? "", /Could not reach the store: the bucket is unreachable\./);
    await shot(page, "failed-1440");
    assert.ok(await sheet.isVisible(), "the sheet stays open");
    assert.equal(posted.length, 1);
    assert.equal(store.records().length, before, "nothing was written");

    // Everything is where it was, and Save is ready to try again.
    assert.ok(await sheet.getByRole("radio", { name: /^Save as new Mission/ }).isChecked(), "the choice is kept");
    assert.equal(await name.inputValue(), "Orchard field");
    assert.equal(await site.inputValue(), "Rehearsal Field");
    assert.equal(await confirmName(sheet), "Save as new Mission");
    assert.ok(await confirm.isEnabled());
    assert.ok(await confirm.evaluate((el) => el === document.activeElement), "focus is still on Save");
    // The Notice reports it too, behind the sheet.
    assert.match(await noticeText(page), /Could not reach the store/);

    await confirm.click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    assert.equal(posted.length, 2);
    assert.deepEqual(posted[1], posted[0], "the retry sends the same save");
    assert.equal(posted[1].id, undefined);
    assert.equal(posted[1].name, "Orchard field");
    assert.equal(posted[1].site_id, SITES.field.id);
    assert.equal(store.records().length, before + 1);
    assert.match(await noticeText(page), /“Orchard field” is saved as a new Mission/);
  } finally {
    await context.close();
  }
});

test("a save lost to the network keeps the sheet open, and changing the name clears the message", async () => {
  const { page, store, posted, context, dropNextSave } = await planner();
  try {
    await edit(page, "m-planned");
    const before = store.records().length;
    const sheet = await openSheet(page);
    const { name } = fields(sheet);
    await name.fill("Orchard west");
    dropNextSave();
    const confirm = sheet.locator('form button[type="submit"]');
    await confirm.click();
    const alert = sheet.getByRole("alert");
    await alert.waitFor({ state: "visible", timeout: 10_000 });
    assert.match((await alert.textContent()) ?? "", /^Not saved: .*Nothing changed\./);
    assert.ok(await sheet.isVisible(), "the sheet stays open");
    assert.equal(store.records().length, before);
    assert.ok(await sheet.getByRole("radio", { name: /^Save changes/ }).isChecked(), "the choice is kept");
    assert.equal(await name.inputValue(), "Orchard west");
    assert.ok(await confirm.isEnabled());

    // A message about the last try is not left standing over a changed form.
    await name.fill("Orchard west 2");
    await alert.waitFor({ state: "detached", timeout: 5_000 });

    await confirm.click();
    await sheet.waitFor({ state: "hidden", timeout: 10_000 });
    assert.equal(posted.length, 2);
    assert.equal(posted[1].id, "m-planned");
    assert.equal(posted[1].name, "Orchard west 2");
    assert.equal(byId(store, "m-planned").name, "Orchard west 2");
    assert.equal(store.records().length, before);
    assert.match(await noticeText(page), /Changes are saved to “Orchard west 2”/);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// Evidence: the sheet at both sizes
// ---------------------------------------------------------------------------

test("screenshots: new, Planned, Dispatched and Loaded at 375 x 812 and 1440 x 900", { skip: !process.env.E2E_SHOTS }, async () => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1440, height: 900 },
  ]) {
    const phone = viewport.width < 1000;
    for (const scenario of ["new", "planned", "dispatched", "loaded"]) {
      const { page, store, context } = await planner(viewport);
      try {
        const source = { planned: "m-planned", dispatched: "m-dispatched", loaded: "m-loading" }[scenario];
        if (source) await edit(page, source);
        if (scenario === "loaded") {
          store.putManifest({ ...store.manifest(), "spec-m-loading": LOADED_ENTRY });
          // The Missions list is a view of its own on a phone.
          if (phone) await page.getByRole("button", { name: "Missions", exact: true }).click();
          await page.getByRole("button", { name: "Refresh", exact: true }).click();
          await rowOf(page, "m-loading").getByRole("button", { name: "Edit", exact: true }).waitFor({
            state: "detached",
            timeout: 10_000,
          });
          if (phone) await page.getByRole("button", { name: "Map", exact: true }).click();
        } else if (scenario === "new" && phone) {
          await page.getByRole("button", { name: "Map", exact: true }).click();
        }
        await openSheet(page);
        await shot(page, `${scenario}-${viewport.width}`);
      } finally {
        await context.close();
      }
    }
  }
});
