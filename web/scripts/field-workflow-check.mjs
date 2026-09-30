// #227: what the field workflow costs today, at 375 x 812 with touch.
//
// The path, as an operator walks it on a phone: open the planner, Map tab,
// Polygon on the map toolbar, four corners, Finish area, Save Mission (the
// sheet: a Mission name and a Site), confirm, Missions tab, Dispatch, read the
// status. Save and Dispatch are the real Mission lifecycle over the in-memory
// store, answered in this process exactly as e2e/save-mission.test.mjs does it.
//
// Usage (the wrapper builds and serves, then passes the URL):
//   bash web/scripts/remote-check.sh check:field-workflow
//
// Four runs in one invocation: A (an existing Site, found by typing part of its
// name) twice, then B (a new Site) twice. Result: ../../docs/research/field-workflow-check/baseline.json
//
// Effort is counted where the operator acts (tap / type / scroll helpers below),
// never guessed. App time per step is measured in the page, on its own clock:
// from the step's last pointerup or input event to the first animation frame in
// which the NEXT control is ready (present, enabled, not moving between two
// frames, and not covered: Playwright's own actionability rules). The wait is a
// rAF-polled predicate on the real element or state, started BEFORE the action so
// the script's round trips are not in the number. No fixed waits.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/harness.mjs";
import { createMissionLifecycle } from "../lib/missionLifecycle.ts";
import { memoryMissionStore } from "../lib/memoryMissionStore.ts";
import { respond } from "../lib/missionRoute.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT = path.resolve(HERE, "../../docs/research/field-workflow-check");
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const CALLER = { kind: "passphrase" };
// A guard against a hung run, never part of a measurement.
const GUARD_MS = 20_000;

const MISSION_NAME = "north half";
const RUNS = [
  { id: "A1", site: { type: "west", choose: "West Quarry" } },
  { id: "A2", site: { type: "west", choose: "West Quarry" } },
  { id: "B1", site: { type: "Ridge Lake", choose: "New Site: Ridge Lake", created: "Ridge Lake" } },
  { id: "B2", site: { type: "Ridge Lake", choose: "New Site: Ridge Lake", created: "Ridge Lake" } },
];

// ---------------------------------------------------------------------------
// The store: the seed of e2e/save-mission.test.mjs (three Sites, planned
// Missions) plus a Card pool, so Dispatch has Cards to reserve.
// ---------------------------------------------------------------------------
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
const seedMission = (n, id, name, site) => {
  const at = `2026-09-26T08:0${n}:00.000Z`;
  const date = "2026-09-26";
  return {
    id,
    site_id: site.id,
    site: site.name,
    name,
    date,
    created_at: at,
    updated_at: at,
    spec: { ...DEFAULT_SPEC, site: site.name, site_id: site.id, date, aoi: AOI, home: AOI[0] },
    dispatched_key: null,
  };
};
const seed = () => ({
  records: [
    seedMission(0, "m-orchard", "Orchard", SITES.west),
    seedMission(1, "m-roadside", "Roadside", SITES.road),
    seedMission(2, "m-meadow", "Meadow", SITES.field),
  ],
  ledger: { pool: ["way finder 1", "way finder 2", "way finder 3"], holdings: {} },
});

// ---------------------------------------------------------------------------
// Page side. One init script: the timing marks and the "is the next control
// ready" predicates, by name. They run in the page, so a run is not slowed by
// round trips, and none of them sleeps.
// ---------------------------------------------------------------------------
function installPage() {
  // The step's action ends at its last pointerup or input event.
  window.__t0 = null;
  const mark = (e) => {
    window.__t0 = e.timeStamp;
  };
  addEventListener("pointerup", mark, true);
  addEventListener("input", mark, true);

  // Ready to act on: present, enabled, visible, unmoved since the last frame we
  // looked, and (when on screen) not covered. Below or above the screen counts as
  // ready: the operator scrolls to it, and that is counted on the effort side.
  const rects = new WeakMap();
  const usable = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const key = `${r.x}|${r.y}|${r.width}|${r.height}`;
    const stable = rects.get(el) === key;
    rects.set(el, key);
    if (!stable || !r.width || !r.height || el.disabled || el.closest("[inert]")) return false;
    if (getComputedStyle(el).visibility !== "visible") return false;
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    // Sideways off screen is a view still sliding in, not something to scroll to.
    if (x < 0 || x > innerWidth) return false;
    if (y < 0 || y > innerHeight) return true;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (el === hit || el.contains(hit));
  };

  const all = (sel, root = document) => [...root.querySelectorAll(sel)];
  const withText = (sel, t, root = document) => all(sel, root).find((el) => el.textContent.trim() === t);
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? "";
  const dialog = () => document.querySelector("dialog[open]");
  const nav = (t) => withText('nav[aria-label="Show"] button', t);
  const tool = (n) =>
    document.querySelector(`section[aria-label="Map"] [role="group"][aria-label="Map tools"] button[aria-label="${n}"]`);
  const save = () => all("button").find((b) => !b.closest("dialog") && b.textContent.trim() === "Save Mission");
  const finish = () => withText('[class*="drawPanel"] button', "Finish area");
  const field = (t) => {
    const l = withText("label", t, dialog() ?? document);
    return l && document.getElementById(l.htmlFor);
  };
  const confirm = () => dialog()?.querySelector('form button[type="submit"]');
  const row = (id) => document.querySelector(`[data-row-id="${id}"]`);
  const canvasHit = (fx, fy) => {
    const c = document.querySelector('section[aria-label="Map"] canvas');
    const r = c?.getBoundingClientRect();
    if (!r || r.width < 50) return false;
    const hit = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
    return !!hit && !!hit.closest('section[aria-label="Map"] canvas');
  };
  const alertText = () => text('[class*="notice"][role="alert"]');

  window.__ready = {
    planner: () => !!document.querySelector("[data-row-id]") && usable(nav("Map")),
    polygonTool: () => usable(tool("Polygon")),
    drawing: (a) => {
      const panel = document.querySelector('[class*="drawTitle"]')?.closest('[class*="drawPanel"]');
      return text('[class*="drawTitle"]') === "Drawing a polygon" && usable(panel) && canvasHit(...a.first);
    },
    corner: (a) =>
      new RegExp(`— ${a.n} so far`).test(text('[class*="drawClick"]')) && (a.n < 4 || usable(finish())),
    finished: () =>
      !document.querySelector('[class*="drawPanel"]') &&
      !!text('section[aria-label="Map"] [class*="readout"] .mono') &&
      usable(save()),
    sheet: () => usable(field("Mission name")),
    nameTyped: (a) => field("Mission name")?.value === a.name && usable(dialog()?.querySelector('[role="combobox"]')),
    options: (a) =>
      dialog()?.querySelector('[role="combobox"]')?.value === a.typed &&
      all('[role="option"]', dialog()).some((o) => o.textContent.trim() === a.option && usable(o)),
    siteChosen: (a) =>
      dialog()?.querySelector('[role="combobox"]')?.value === a.site && usable(confirm()),
    saved: () => !dialog() && /is saved/.test(text('[class*="notice"][role="status"]')) && usable(nav("Missions")),
    missionsView: (a) => usable(withText("button", "Dispatch", row(a.id) ?? document.body)),
    dispatched: (a) =>
      text(`[data-row-id="${a.id}"] [class*="chip"]`) === "Dispatched" && !row(a.id).closest("[inert]"),
  };
  window.__fail = {
    saved: () => dialog()?.querySelector('[role="alert"]')?.textContent?.trim() || "",
    dispatched: alertText,
  };
}

// ---------------------------------------------------------------------------
// Operator side: every tap, character and scroll goes through these, so the
// counts are of what was done.
// ---------------------------------------------------------------------------
const TOOLBAR = 'section[aria-label="Map"] [role="group"][aria-label="Map tools"]';
const CORNERS = [
  [0.2, 0.55],
  [0.75, 0.55],
  [0.8, 0.8],
  [0.3, 0.85],
];

async function once({ id, site }, browser) {
  const store = memoryMissionStore(seed());
  const lifecycle = createMissionLifecycle(store);
  const posted = [];
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await context.addInitScript((key) => localStorage.setItem(key, "e2e"), PASSPHRASE_KEY);
  await context.addInitScript(installPage);
  await context.route(
    (url) => url.pathname === "/api/missions" || url.pathname === "/api/missions/dispatch",
    async (route) => {
      const request = route.request();
      let outcome;
      if (new URL(request.url()).pathname === "/api/missions/dispatch") {
        outcome = await lifecycle.dispatch(CALLER, request.postDataJSON());
      } else if (request.method() === "GET") {
        outcome = await lifecycle.list(CALLER, { archived: true });
      } else {
        posted.push(request.postDataJSON());
        outcome = await lifecycle.save(CALLER, request.postDataJSON());
      }
      const response = respond(outcome);
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    },
  );
  const page = await context.newPage();

  // Locators: those of e2e/save-mission.test.mjs and scripts/area-edit-check.mjs.
  const nav = (name) => page.getByRole("navigation", { name: "Show" }).getByRole("button", { name });
  const tool = (name) => page.locator(TOOLBAR).getByRole("button", { name, exact: true });
  const saveButton = () => page.getByRole("button", { name: "Save Mission", exact: true }).first();
  const sheetOf = () => page.getByRole("dialog", { name: "Save Mission" });
  const fields = (sheet) => ({
    name: sheet.getByLabel("Mission name", { exact: true }),
    site: sheet.getByRole("combobox", { name: "Site", exact: true }),
  });
  const rowOf = (rowId) => page.locator(`[data-row-id="${rowId}"]`);

  const steps = [];
  let cur;

  /** A tap on a control. A scroll is counted when the control is not reachable
   *  where it is (off screen, or clipped by its container), and made. */
  async function tap(loc, { switchView = false } = {}) {
    const blocked = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const at = `centre (${Math.round(x)}, ${Math.round(y)}) in ${innerWidth}x${innerHeight}`;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
        const chain = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const t = getComputedStyle(p).transform;
          if (p.scrollWidth > p.clientWidth + 1 || t !== "none")
            chain.push(`${p.tagName}.${String(p.className).slice(0, 40)} scrollLeft ${p.scrollLeft} of ${p.scrollWidth}/${p.clientWidth} transform ${t}`);
        }
        return `off screen: ${at}; ${chain.join(" | ")}`;
      }
      const hit = document.elementFromPoint(x, y);
      if (hit && (el === hit || el.contains(hit))) return null;
      return `covered by ${hit?.tagName}.${String(hit?.className).slice(0, 60)}: ${at}`;
    });
    if (blocked) {
      cur.scrolls += 1;
      (cur.scroll_reasons ??= []).push(blocked);
      await loc.scrollIntoViewIfNeeded();
    }
    cur.taps += 1;
    if (switchView) cur.switches += 1;
    await loc.tap();
  }

  /** Type into a field with real key events. A tap to focus it is counted only
   *  when the field does not already have focus. */
  async function type(loc, value) {
    if (!(await loc.evaluate((el) => el === document.activeElement))) await tap(loc);
    await loc.pressSequentially(value);
    cur.chars += value.length;
  }

  async function tapCorner([fx, fy]) {
    const box = await page.locator('section[aria-label="Map"] canvas').boundingBox();
    cur.taps += 1;
    await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
  }

  const guard = (promise, what) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what}: not ready after ${GUARD_MS} ms`)), GUARD_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  /** One step: start the watcher for the next control, act, wait for it. */
  async function step(name, ready, arg, act) {
    cur = { name, taps: 0, chars: 0, switches: 0, scrolls: 0, app_ms: null };
    await page.evaluate(() => {
      window.__t0 = null;
    });
    const watcher = page.evaluate(
      ({ ready, arg }) =>
        new Promise((resolve) => {
          const tick = () => {
            if (window.__t0 !== null) {
              if (window.__ready[ready](arg)) return resolve({ t: performance.now(), t0: window.__t0 });
              const err = window.__fail[ready]?.();
              if (err) return resolve({ err });
            }
            requestAnimationFrame(tick);
          };
          tick();
        }),
      { ready, arg },
    );
    watcher.catch(() => {});
    await act();
    const result = await guard(watcher, name);
    if (result.err) throw new Error(`${name}: ${result.err}`);
    cur.app_ms = Math.round((result.t - result.t0) * 10) / 10;
    steps.push(cur);
  }

  const wallStart = Date.now();
  try {
    // 1. Open the planner. From navigation start to the Map tab being ready.
    cur = { name: "Open the planner", taps: 0, chars: 0, switches: 0, scrolls: 0, app_ms: null };
    await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
    const opened = await page.waitForFunction(() => window.__ready.planner() && performance.now(), undefined, {
      polling: "raf",
      timeout: GUARD_MS,
    });
    cur.app_ms = Math.round((await opened.jsonValue()) * 10) / 10;
    steps.push(cur);

    // 2-3. Map tab, Polygon tool.
    await step("Map tab", "polygonTool", undefined, () => tap(nav("Map"), { switchView: true }));
    await step("Polygon tool", "drawing", { first: CORNERS[0] }, () => tap(tool("Polygon")));

    // 4-7. Four corners. Each is ready when the panel has counted it.
    for (let n = 1; n <= 4; n += 1) {
      await step(`Corner ${n}`, "corner", { n }, () => tapCorner(CORNERS[n - 1]));
    }

    // 8. Finish area.
    await step("Finish area", "finished", undefined, () =>
      tap(page.locator('[class*="drawPanel"]').getByRole("button", { name: "Finish area" })),
    );

    // Settings is not visited: Save asks for the name and the Site itself, and
    // the date is set on load. State it as a fact of the run, not an assumption.
    const saveEnabled = await saveButton().isEnabled();

    // 9. Save Mission, opening the sheet.
    await step("Save Mission (open the sheet)", "sheet", undefined, () => tap(saveButton()));
    const sheet = sheetOf();
    const { name, site: siteField } = fields(sheet);
    const planProblems = /still has problems/.test((await sheet.textContent()) ?? "");
    const nameFocused = await name.evaluate((el) => el === document.activeElement);

    // 10. The Mission name.
    await step("Type the Mission name", "nameTyped", { name: MISSION_NAME }, () => type(name, MISSION_NAME));

    // 11-12. The Site: type part of its name (A) or a new name (B), then choose.
    await step(
      "Type the Site",
      "options",
      { typed: site.type, option: site.choose },
      () => type(siteField, site.type),
    );
    await step("Choose the Site", "siteChosen", { site: site.created ?? site.choose }, () =>
      tap(sheet.getByRole("option", { name: site.choose, exact: true })),
    );

    // 13. Confirm.
    await step("Confirm (Save Mission)", "saved", undefined, () => tap(sheet.locator('form button[type="submit"]')));
    const saved = store.records().find((r) => r.name === MISSION_NAME);
    if (!saved) throw new Error("the Mission was not stored");

    // 14. Missions tab.
    await step("Missions tab", "missionsView", { id: saved.id }, () => tap(nav("Missions"), { switchView: true }));

    // 15. Dispatch.
    await step("Dispatch", "dispatched", { id: saved.id }, () =>
      tap(rowOf(saved.id).getByRole("button", { name: "Dispatch", exact: true })),
    );

    // 16. Read the status: nothing to do, it is on the row.
    const status = {
      chip: (await rowOf(saved.id).locator('[class*="chip"]').textContent())?.trim(),
      headline: (await rowOf(saved.id).locator('[class*="headline"]').first().textContent())?.trim(),
    };
    steps.push({ name: "Read the status", taps: 0, chars: 0, switches: 0, scrolls: 0, app_ms: null });

    const wall_ms = Date.now() - wallStart;
    const stored = (await lifecycle.list(CALLER, { archived: true })).body.missions.find((m) => m.id === saved.id);
    const outcome = {
      status,
      stored_state: stored?.state,
      site: saved.site,
      site_id: saved.site_id,
      posts: posted.length,
      settings_visited: false,
      save_enabled_without_settings: saveEnabled,
      plan_has_problems: planProblems,
      name_focused_on_open: nameFocused,
      cards_reserved: Object.keys(store.ledger().holdings).length,
    };
    const problems = [];
    if (!saveEnabled) problems.push("Save was disabled without Settings");
    if (planProblems) problems.push("the plan has problems, Dispatch would refuse it");
    if (stored?.state !== "dispatched") problems.push(`stored state is ${stored?.state}`);
    if (posted.length !== 1) problems.push(`${posted.length} saves were sent`);
    if (site.created ? saved.site !== site.created : saved.site_id !== SITES.west.id) problems.push("wrong Site saved");
    if (problems.length) throw new Error(problems.join("; "));

    const sum = (key) => steps.reduce((n, s) => n + s[key], 0);
    const totals = {
      taps: sum("taps"),
      chars: sum("chars"),
      view_switches: sum("switches"),
      scrolls: sum("scrolls"),
      app_ms: Math.round(steps.reduce((n, s) => n + (s.app_ms ?? 0), 0)),
      wall_ms,
    };
    console.log(
      `${id} ${site.created ? "new Site" : "existing Site"}: ${totals.taps} taps, ${totals.chars} chars, ` +
        `${totals.view_switches} switches, ${totals.scrolls} scrolls, app ${totals.app_ms} ms (wall ${wall_ms} ms)`,
    );
    for (const s of steps) {
      console.log(
        `  ${s.name.padEnd(30)} ${String(s.taps).padStart(2)} taps ${String(s.chars).padStart(3)} chars ` +
          `${s.switches} sw ${s.scrolls} sc  ${s.app_ms === null ? "-" : `${s.app_ms} ms`}`,
      );
    }
    return { run: id, site_mode: site.created ? "new" : "existing", steps, totals, outcome };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await launchBrowser();
  const runs = [];
  try {
    for (const spec of RUNS) runs.push(await once(spec, browser));
  } finally {
    await browser.close();
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "baseline.json");
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        issue: 227,
        viewport: "375x812, touch",
        base: "next start, real Mission lifecycle over the in-memory store",
        mission_name: MISSION_NAME,
        runs,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
