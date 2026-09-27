// M6 evidence harness (ticket #187): one recording + stills per motion, with
// assertions that exit non-zero on failure.
//
// Usage: build the app, serve it, then
//   npm run check:motion -- [base-url]
//
// It imports the app's own Spec and record code so the seeded Mission list is
// the real thing, not a hand-copied shape. There is no live B2 store, so a
// fetch wrapper answers /api/missions from memory and a localStorage key
// stands in for the planner's passphrase.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { deriveMissions } from "../lib/missionRecords.ts";
import { preview } from "../lib/mission.ts";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../docs/ui-theme/screenshots/ui-11");
fs.mkdirSync(OUT, { recursive: true });
const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ui11-video-"));
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

// ---------------------------------------------------------------------------
// The seeded Mission list
// ---------------------------------------------------------------------------

const SPEC = {
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

const RECORD = {
  id: "m-e2e-0001",
  site_id: SPEC.site_id,
  site: SPEC.site,
  name: "North half",
  date: SPEC.date,
  created_at: "2026-09-26T00:00:00.000Z",
  updated_at: "2026-09-26T00:00:00.000Z",
  spec: SPEC,
  dispatched_key: null,
};

const ROW = deriveMissions([RECORD], {}, {})[0];
const PAYLOAD = {
  missions: [ROW],
  archived_count: 0,
  stale_cards: [],
  host: { notice: null, drift: null },
  unreadable: [],
  now: Date.now(),
};

// `preview(spec)` must yield a non-zero figure or a 0 -> 0 count looks like a
// motion that worked when nothing moved.
const FINAL_90 = preview(SPEC).flight_time_min;
const ALT_60 = { ...SPEC, flight: { ...SPEC.flight, altitude_m: 60 } };
const FINAL_60 = preview(ALT_60).flight_time_min;

// ---------------------------------------------------------------------------
// Assertion log
// ---------------------------------------------------------------------------

let failed = false;
function check(motion, name, cond, detail = "") {
  const line = `${cond ? "PASS" : "FAIL"} ${motion}/${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!cond) failed = true;
}
function isIdentity(transform) {
  if (transform === "none") return true;
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!m) return false;
  const [a, b, c, d] = m[1].split(",").map((v) => Number(v.trim()));
  return a === 1 && b === 0 && c === 0 && d === 1;
}
function txOf(transform) {
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  return m ? Number(m[1].split(",")[4].trim()) : NaN;
}

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

async function pageFor(browser, { width, height, mobile = false, reduced = false, video = null }) {
  const contextOptions = {
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: reduced ? "reduce" : "no-preference",
  };
  if (video) contextOptions.recordVideo = { dir: VIDEO_DIR, size: { width, height } };
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(
    ({ payload, key, value }) => {
      localStorage.setItem(key, value);
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        if (url.includes("/api/missions")) {
          return Promise.resolve(
            new Response(JSON.stringify(payload), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return orig(input, init);
      };
    },
    { payload: PAYLOAD, key: PASSPHRASE_KEY, value: "evidence" },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  // The seeded row is present once the passphrase gate has stepped aside.
  await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 15000 });
  // The Summary's lead figure counts up once on mount (countKey 0), so a read
  // taken now would catch the animation mid-flight.
  await page.waitForTimeout(1000);
  return { context, page };
}

async function openRow(page) {
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
}

const lead = (page) => page.locator('[class*="leadFigure"]').first();

async function readLead(page) {
  return (await lead(page).textContent())?.trim() ?? "";
}

/** Open the row and sample the lead figure in ONE page task, so the very first
 *  frame after the open is the first sample. A layout effect writes 0 before
 *  paint; a plain effect would let the final value paint one frame first and
 *  the first sample would already be final. */
async function openAndSampleLead(page, ms) {
  return page.evaluate(
    async ({ duration }) => {
      const read = () => document.querySelector('[class*="leadFigure"]')?.textContent.trim() ?? "";
      const edit = [...document.querySelectorAll("#missions-panel button")].find(
        (b) => b.textContent.trim() === "Edit",
      );
      if (!edit) throw new Error("row Edit button not found");
      const frame = () =>
        new Promise((r) => {
          const t = setTimeout(r, 50); // never stall if rAF is throttled
          requestAnimationFrame(() => {
            clearTimeout(t);
            r();
          });
        });
      const out = [];
      edit.click();
      // React flushes a discrete click synchronously, so this read lands right
      // after the open's layout effect wrote 0 and before any paint.
      out.push(read());
      await frame();
      const start = performance.now();
      while (performance.now() - start < duration) {
        out.push(read());
        await frame();
      }
      out.push(read());
      return out;
    },
    { duration: ms },
  );
}

/** Wait (bounded) for an element's computed transform to reach the pressed
 *  0.97 scale, so a mid-transition sample under load is not read as identity. */
async function waitForPressScale(el) {
  await el
    .evaluate(
      (node) =>
        new Promise((resolve) => {
          const t0 = performance.now();
          const tick = () => {
            const m = /^matrix\(([^,]+)/.exec(getComputedStyle(node).transform);
            const scale = m ? Number(m[1]) : 1;
            if (Math.abs(scale - 0.97) < 0.005 || performance.now() - t0 > 1500) return resolve();
            requestAnimationFrame(tick);
          };
          tick();
        }),
    )
    .catch(() => {});
}

async function pressAndRead(page, locator, expectMove = true) {
  return pressAndReadChild(page, locator, locator, expectMove);
}

/** Press down over `hover` (e.g. a row's headline text) but read the pressed
 *  ancestor `read` — the element the shared `.press` rule actually washes. */
async function pressAndReadChild(page, hover, read, expectMove = true) {
  await hover.hover();
  await page.mouse.down();
  if (expectMove) await waitForPressScale(read);
  else await page.waitForTimeout(180);
  const style = await read.evaluate((el) => {
    const s = getComputedStyle(el);
    return { transform: s.transform, boxShadow: s.boxShadow };
  });
  // Move off before releasing so no click fires.
  await page.mouse.move(2, 2);
  await page.mouse.up();
  return style;
}

async function changeAltitude(page, value) {
  const changed = await page.evaluate(
    ({ v }) => {
      const ranges = [...document.querySelectorAll('#settings-panel input[type="range"]')];
      const el = ranges.find((r) => /Altitude/.test(r.parentElement?.textContent ?? ""));
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { v: value },
  );
  if (!changed) throw new Error("altitude slider not found");
}

// ---------------------------------------------------------------------------
// Motions
// ---------------------------------------------------------------------------

async function pressMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 1440, height: 900, video: true });
  const video = page.video();
  try {
    // The Spec is valid, so preview() gives a non-zero lead: a 0 -> 0 "count"
    // can never be mistaken for the motion.
    check("press", "target lead figure parses > 0", FINAL_90 > 0, String(FINAL_90));

    const summaryBtn = page.getByRole("button", { name: "Copy spec" });
    const s1 = await pressAndRead(page, summaryBtn);
    check("press", "summary button scales", s1.transform.startsWith("matrix(0.97"), s1.transform);
    check("press", "summary button wash", s1.boxShadow.includes("999px"), s1.boxShadow);

    const pill = page.getByRole("group", { name: "Map display" }).getByRole("button").first();
    const s2 = await pressAndRead(page, pill);
    check("press", "map pill scales", s2.transform.startsWith("matrix(0.97"), s2.transform);
    check("press", "map pill wash", s2.boxShadow.includes("999px"), s2.boxShadow);

    const disabled = page.getByRole("button", { name: "Save new Mission" });
    const s3 = await pressAndRead(page, disabled, false);
    check("press", "disabled button does not move", s3.transform === "none", s3.transform);

    // R1: the Mission row itself presses, not only its buttons. The pointer
    // sits on the headline text (a <p>), so no descendant is :active — which
    // proves the interactive-descendant guard does not suppress the row wash.
    const article = page.locator("article.press").first();
    const headline = article.locator('p[class*="headline"]');
    const s4 = await pressAndReadChild(page, headline, article);
    check("press", "mission row scales", s4.transform.startsWith("matrix(0.97"), s4.transform);
    check("press", "mission row wash", s4.boxShadow.includes("999px"), s4.boxShadow);

    // The Notice presses on the same shared rule; its close button is the only
    // interactive descendant and the pointer is deliberately not on it. The
    // seeded Dispatch reaches /api/missions/dispatch, which the fetch wrapper
    // does not answer like a store, so a real Notice is raised either way.
    await page.getByRole("button", { name: "Dispatch", exact: true }).click();
    const notice = page.locator('[class*="notice"]').first();
    await notice.waitFor({ timeout: 8000 });
    const noticeText = notice.locator('[class*="title"], [class*="short"]').first();
    const s5 = await pressAndReadChild(page, noticeText, notice);
    check("press", "notice scales", s5.transform.includes("0.97"), s5.transform);
    check("press", "notice wash", s5.boxShadow.includes("999px"), s5.boxShadow);
    await page.keyboard.press("Escape");
    await notice.waitFor({ state: "detached", timeout: 4000 });

    // The edge tab centres with `translate`, so the shared press scale composes
    // instead of clobbering it: its vertical centre must not jump.
    await page.getByRole("button", { name: "Collapse Missions" }).click();
    const edgeTab = page.getByRole("button", { name: "Expand Missions" });
    await edgeTab.waitFor();
    await page.waitForTimeout(450); // --dur-slow panel collapse
    const beforeTop = await edgeTab.evaluate((el) => el.getBoundingClientRect().top);
    await edgeTab.hover();
    await page.mouse.down();
    await waitForPressScale(edgeTab);
    const edge = await edgeTab.evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      transform: getComputedStyle(el).transform,
    }));
    await page.mouse.move(2, 2);
    await page.mouse.up();
    check("press", "edge tab scales", edge.transform.startsWith("matrix(0.97"), edge.transform);
    check("press", "edge tab centre holds", Math.abs(edge.top - beforeTop) < 2, `${beforeTop} -> ${edge.top}`);
    await edgeTab.click();
    await page.waitForTimeout(300);

    await page.waitForTimeout(400);
  } finally {
    await context.close();
    await saveVideo(video, "press");
  }
}

async function countUpMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 1440, height: 900, video: true });
  const video = page.video();
  try {
    // Before recording: the figure this Motion is about is non-zero, so the
    // count is a real 0 -> N, never a 0 -> 0 that would look like a motion.
    check("count-up", "target lead parses > 0 before recording", FINAL_90 > 0, String(FINAL_90));

    const samples = await openAndSampleLead(page, 1050);
    const final = FINAL_90.toFixed(1);
    const numbers = samples.map(Number);
    check("count-up", "counts through intermediate values", numbers.some((n) => n > 0 && n < FINAL_90));
    check("count-up", "first sample below final (no one-frame flash)", numbers[0] < FINAL_90, `${numbers[0]} vs ${FINAL_90}`);
    check("count-up", "lands on the final value", samples[samples.length - 1] === final, samples[samples.length - 1]);
    check("count-up", "landed lead is > 0", numbers[numbers.length - 1] > 0, samples[samples.length - 1]);

    await changeAltitude(page, 60);
    await page.waitForTimeout(30);
    const instant = await readLead(page);
    await page.waitForTimeout(300);
    const settled = await readLead(page);
    check("count-up", "slider edit is instant", instant === FINAL_60.toFixed(1), instant);
    check("count-up", "slider edit stays put", settled === FINAL_60.toFixed(1), settled);
  } finally {
    await context.close();
    await saveVideo(video, "count-up");
  }

  // Reduced motion: the same open writes the final value in one frame.
  const { context: rctx, page: rpage } = await pageFor(browser, {
    width: 1440,
    height: 900,
    reduced: true,
  });
  try {
    await openRow(rpage);
    await rpage.waitForTimeout(50);
    const value = await readLead(rpage);
    check("count-up", "reduced motion opens at the final value", value === FINAL_90.toFixed(1), value);
  } finally {
    await rctx.close();
  }
}

async function viewPushMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, video: true });
  const video = page.video();
  try {
    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Map" }).click();
    await page.waitForTimeout(500);
    await checkView(page, "Map", "view-push");

    await nav.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);
    await checkView(page, "Settings", "view-push");
  } finally {
    await context.close();
    await saveVideo(video, "view-push");
  }

  // Reduced motion: no transform, opacity still changes.
  const { context: rctx, page: rpage } = await pageFor(browser, {
    width: 375,
    height: 812,
    mobile: true,
    reduced: true,
  });
  try {
    const nav = rpage.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Map" }).click();
    await rpage.waitForTimeout(250);
    const transforms = await rpage.evaluate(() => {
      const of = (sel) => getComputedStyle(document.querySelector(sel)).transform;
      return { missions: of("#missions-panel"), map: of('section[aria-label="Map"]'), settings: of("#settings-panel") };
    });
    check("view-push", "reduced motion: all panels identity", Object.values(transforms).every(isIdentity), JSON.stringify(transforms));
    const opacities = await rpage.evaluate(() => ({
      map: getComputedStyle(document.querySelector('section[aria-label="Map"]')).opacity,
      settings: getComputedStyle(document.querySelector("#settings-panel")).opacity,
    }));
    check("view-push", "reduced motion: opacity still changes", opacities.map === "1" && opacities.settings === "0", JSON.stringify(opacities));
  } finally {
    await rctx.close();
  }
}

async function checkView(page, activeLabel, motion) {
  const state = await page.evaluate(
    () => {
      const panelOf = (label) =>
        label === "Missions" ? "#missions-panel" : label === "Map" ? 'section[aria-label="Map"]' : "#settings-panel";
      const width = window.innerWidth;
      const out = { width, transforms: {}, inert: {}, opacity: {}, visibility: {} };
      for (const label of ["Missions", "Map", "Settings"]) {
        const el = document.querySelector(panelOf(label));
        const cs = getComputedStyle(el);
        out.transforms[label] = cs.transform;
        out.opacity[label] = cs.opacity;
        out.visibility[label] = cs.visibility;
        out.inert[label] = el.inert;
      }
      return out;
    },
  );
  const order = ["Missions", "Map", "Settings"];
  const activeIndex = order.indexOf(activeLabel);
  check(motion, `${activeLabel} active transform is identity`, isIdentity(state.transforms[activeLabel]), state.transforms[activeLabel]);
  for (const label of order) {
    if (label === activeLabel) continue;
    const expected = (order.indexOf(label) - activeIndex) * state.width;
    check(motion, `${label} is pushed off by ${expected}px`, Math.abs(txOf(state.transforms[label]) - expected) < 2, state.transforms[label]);
    check(motion, `${label} is inert`, state.inert[label] === true);
  }
}

async function heroCrossfadeMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, video: true });
  const video = page.video();
  try {
    const still = page.locator('[class*="heroStill"]');
    const nav = page.getByRole("navigation", { name: "Show" });
    check("hero-crossfade", "still starts hidden", (await still.evaluate((el) => getComputedStyle(el).opacity)) === "0");

    await nav.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);
    check("hero-crossfade", "still reaches 1 on Settings", (await still.evaluate((el) => getComputedStyle(el).opacity)) === "1");
    // Falsifiable: the live hero video must actually be paused off-Missions,
    // not merely absent from the Settings panel's subtree.
    const heroVideo = page.locator('[class*="heroLayer"] video').first();
    check("hero-crossfade", "Settings pauses the live hero video", (await heroVideo.evaluate((v) => v.paused)) === true);

    await nav.getByRole("button", { name: "Missions" }).click();
    await page.waitForTimeout(500);
    check("hero-crossfade", "still returns to 0 on Missions", (await still.evaluate((el) => getComputedStyle(el).opacity)) === "0");
  } finally {
    await context.close();
    await saveVideo(video, "hero-crossfade");
  }
}

async function sheetMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, video: true });
  const video = page.video();
  try {
    await page.getByRole("button", { name: "Details" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    const handle = await dialog.elementHandle();
    const info = await dialog.evaluate((d) => {
      const child = d.querySelector('[class*="__body"] > *');
      const cs = getComputedStyle(child);
      return {
        animationName: cs.animationName,
        animationDelay: cs.animationDelay,
      };
    });
    check("sheet", "panel entrance animation", /sheetPanelIn$/.test(info.animationName), info.animationName);
    check("sheet", "first-child delay is 0.09s", info.animationDelay === "0.09s", info.animationDelay);
    // The entrance transition runs 400ms (--dur-slow); let it reach [open]'s 1.
    await page.waitForTimeout(500);
    check("sheet", "open dialog is opaque", (await dialog.evaluate((d) => getComputedStyle(d).opacity)) === "1");

    // F6: no transition drives box-shadow/width/height/background/colour. A
    // property is only checked when a transition actually runs (non-zero
    // duration); `all` is NOT whitelisted, so a real `transition: all` fails.
    const allowed = new Set(["transform", "opacity", "filter", "clip-path", "visibility"]);
    const probed = await page.evaluate(() => {
      const of = (el) => {
        const cs = getComputedStyle(el);
        return {
          props: cs.transitionProperty.split(",").map((s) => s.trim()),
          durations: cs.transitionDuration.split(",").map((s) => s.trim()),
        };
      };
      const row = document.querySelector("article.press");
      const panel = document.querySelector("#missions-panel");
      const still = document.querySelector('[class*="heroStill"]');
      const child = document.querySelector('dialog[open] [class*="__body"] > *');
      return { press: of(row), panel: of(panel), still: of(still), sheetChild: of(child) };
    });
    for (const [name, t] of Object.entries(probed)) {
      if (t.durations.every((d) => d === "0s")) {
        check("sheet", `no transition: ${name}`, true, t.durations.join(","));
        continue;
      }
      const bad = t.props.filter((p) => !allowed.has(p));
      check("sheet", `transition property subset: ${name}`, bad.length === 0, bad.join(",") || t.props.join(","));
    }

    await page.waitForTimeout(600);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(500);
    const closed = await handle.evaluate((d) => getComputedStyle(d).opacity);
    check("sheet", "dialog fades to 0 on close", closed === "0", closed);
  } finally {
    await context.close();
    await saveVideo(video, "sheet");
  }
}

async function reducedMotionRecording(browser) {
  const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, reduced: true, video: true });
  const video = page.video();
  try {
    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Map" }).click();
    await page.waitForTimeout(350);
    await nav.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(350);
    await nav.getByRole("button", { name: "Missions" }).click();
    await page.waitForTimeout(350);
  } finally {
    await context.close();
    await saveVideo(video, "reduced-motion");
  }
}

async function saveVideo(video, name) {
  const target = path.join(OUT, `${name}.webm`);
  await video.saveAs(target);
  const size = fs.statSync(target).size;
  check("video", `${name}.webm is non-empty`, size > 1500, `${size} bytes`);
}

// ---------------------------------------------------------------------------
// Stills
// ---------------------------------------------------------------------------

async function stills(browser) {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.addInitScript(
    ({ payload, key, value }) => {
      localStorage.setItem(key, value);
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        if (url.includes("/api/missions")) {
          return Promise.resolve(
            new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
          );
        }
        return orig(input, init);
      };
    },
    { payload: PAYLOAD, key: PASSPHRASE_KEY, value: "evidence" },
  );
  let page = await desktop.newPage();
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "1440-missions.png") });
  await page.getByRole("button", { name: "Collapse Missions" }).click();
  await page.getByRole("button", { name: "Collapse Settings" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "1440-map.png") });
  await page.getByRole("button", { name: "Expand Missions" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "1440-settings.png") });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await mobile.addInitScript(
    ({ payload, key, value }) => {
      localStorage.setItem(key, value);
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        if (url.includes("/api/missions")) {
          return Promise.resolve(
            new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
          );
        }
        return orig(input, init);
      };
    },
    { payload: PAYLOAD, key: PASSPHRASE_KEY, value: "evidence" },
  );
  page = await mobile.newPage();
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "375-missions.png") });
  const nav = page.getByRole("navigation", { name: "Show" });
  await nav.getByRole("button", { name: "Map" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "375-map.png") });
  await nav.getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "375-settings.png") });
  await mobile.close();
  console.log("stills saved");
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch();
try {
  await pressMotion(browser);
  await countUpMotion(browser);
  await viewPushMotion(browser);
  await heroCrossfadeMotion(browser);
  await sheetMotion(browser);
  await reducedMotionRecording(browser);
  await stills(browser);
} finally {
  await browser.close();
}

const pngs = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length;
const webms = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm")).length;
console.log(`artifacts: ${pngs} png, ${webms} webm in ${OUT}`);
if (pngs < 6 || webms < 6) {
  console.log("FAIL artifact-count");
  failed = true;
}
console.log(failed ? "motion check: FAIL" : "motion check: all pass");
process.exit(failed ? 1 : 0);
