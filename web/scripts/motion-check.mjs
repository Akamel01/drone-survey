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
import {
  flickVelocity,
  isFlick,
  rubberBand,
  SHEET_DISMISS_PX,
  SHEET_FLICK_MIN_PX,
  SHEET_FLICK_VELOCITY,
} from "../lib/sheet.ts";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../docs/ui-theme/screenshots/ui-11");
fs.mkdirSync(OUT, { recursive: true });
// UI-19 (#256): the sheet-gesture recordings live in their own directory, so
// an `ONLY=sheet` run never rewrites the committed ui-11 media.
const SHEET_OUT = path.resolve(HERE, "../../docs/ui-theme/screenshots/ui-19");
fs.mkdirSync(SHEET_OUT, { recursive: true });
const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ui11-video-"));
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

// `ONLY=sheet` runs only the new ui-19 gesture cases; the legacy ui-11
// motions keep their own groups (`sheet-legacy`, `reduced-legacy`), so a
// focused evidence run leaves ui-11 byte-identical. Unset = run everything.
const ONLY = process.env.ONLY ?? "";
const want = (group) => !ONLY || ONLY.split(",").includes(group);

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
/** The Y translation of a computed transform matrix — the sheet moves on Y,
 *  so `txOf` would always read 0 for it. */
function tyOf(transform) {
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  return m ? Number(m[1].split(",")[5].trim()) : NaN;
}
/** At rest: identity and no residual Y translation. The sheet's property
 *  under test is `translateY`, which bare `isIdentity` never reads — a stuck
 *  `matrix(1, 0, 0, 1, 0, 44)` would otherwise read as identity. Every ui-19
 *  "returns to rest" claim uses this, not `isIdentity` (#256). */
function isRest(transform) {
  if (transform === "none") return true;
  return isIdentity(transform) && Math.abs(tyOf(transform)) <= 0.5;
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

// ---------------------------------------------------------------------------
// The sheet gesture (UI-19, #256)
// ---------------------------------------------------------------------------

/** Install the in-page rig once. `reset()` re-arms capture listeners on the
 *  open sheet's handle recording every pointer sample as `{y, t}` with the
 *  browser's own `event.timeStamp`, plus a `close` counter on the dialog, and
 *  returns dispatchers for synthetic PointerEvents on the handle (O1).
 *  Synthetic events cannot be back-dated, but they run at real browser time,
 *  so the velocity measured from the samples is honest. */
async function installRig(page) {
  await page.evaluate(() => {
    const frame = () =>
      new Promise((resolve) => {
        const t = setTimeout(resolve, 50); // never stall if rAF is throttled
        requestAnimationFrame(() => {
          clearTimeout(t);
          resolve();
        });
      });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    window.__sheetRig = {
      reset() {
        const handle = document.querySelector('dialog[open] [class*="handle"]');
        if (!handle) throw new Error("open sheet handle not found");
        const dialog = handle.closest("dialog");
        const samples = [];
        let closes = 0;
        const record = (e) => samples.push({ y: e.clientY, t: e.timeStamp });
        for (const type of ["pointerdown", "pointermove", "pointerup"]) {
          handle.addEventListener(type, record, true);
        }
        dialog.addEventListener("close", () => {
          closes += 1;
        });
        const rect = handle.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const send = (type, dy) =>
          handle.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
              pointerType: "touch",
              isPrimary: true,
              clientX: x,
              clientY: y + dy,
              buttons: type === "pointerup" ? 0 : 1,
            }),
          );
        return {
          frame,
          sleep,
          rect: { width: rect.width, height: rect.height, top: rect.top },
          samples,
          closes: () => closes,
          down: (dy = 0) => send("pointerdown", dy),
          move: (dy = 0) => send("pointermove", dy),
          up: (dy = 0) => send("pointerup", dy),
          open: () => dialog.hasAttribute("open"),
          hasSettling: () => [...dialog.classList].some((c) => c.includes("settling")),
          rest: () => {
            const t = getComputedStyle(dialog).transform;
            if (t === "none") return true;
            const m = /^matrix\(([^)]+)\)$/.exec(t);
            if (!m) return false;
            const v = m[1].split(",").map((x) => Number(x.trim()));
            return v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === 1 && Math.abs(v[5]) <= 0.5;
          },
          transform: () => getComputedStyle(dialog).transform,
          opacity: () => getComputedStyle(dialog).opacity,
          hitTop: () => document.elementFromPoint(x, rect.top + 2) === handle,
          styles: () => {
            const cs = getComputedStyle(dialog);
            return {
              transitionProperty: cs.transitionProperty,
              transitionDuration: cs.transitionDuration,
              transitionTimingFunction: cs.transitionTimingFunction,
            };
          },
        };
      },
    };
  });
}

/** Open the Details sheet and remember the opener, so focus return can be
 *  asserted. The explicit focus() before the click is what makes the native
 *  dialog's focus restoration deterministic (critic N1). */
async function openDetails(page) {
  const details = page.getByRole("button", { name: "Details", exact: true }).first();
  await details.focus();
  await page.evaluate(() => {
    window.__sheetOpener = document.activeElement;
  });
  await details.click();
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  await page.waitForTimeout(500); // the entrance runs --dur-slow
  return details;
}

/** Close the open sheet through the close control, so the next case starts
 *  from a fresh open. A no-op when the previous case ended dismissed. */
async function closeSheet(page) {
  if ((await page.locator("dialog[open]").count()) === 0) return;
  await page.getByRole("button", { name: "Close" }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden", timeout: 3000 });
  await page.waitForTimeout(350);
}

async function sheetGesture(browser) {
  const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, video: true });
  const video = page.video();
  try {
    await installRig(page);

    // 0. The handle is a real >= 44 x 44 target (the old 5px pill fails).
    await openDetails(page);
    const target = await page.evaluate(() => {
      const g = window.__sheetRig.reset();
      return { width: g.rect.width, height: g.rect.height, hit: g.hitTop() };
    });
    check("sheet-target", "hit box is at least 44 x 44", target.width >= 44 && target.height >= 44, `${target.width} x ${target.height}`);
    check("sheet-target", "elementFromPoint 2px into the hit box finds the handle", target.hit === true);

    // 1. Fast flick: 48px of travel dismisses, though 48 < 120.
    const fast = await page.evaluate(async () => {
      const g = window.__sheetRig.reset();
      g.down();
      await g.frame();
      g.move(24);
      await g.frame();
      g.move(48);
      const closedAt = performance.now();
      g.up(48);
      const samples = g.samples.slice();
      while (g.open() && performance.now() - closedAt < 1000) await g.frame();
      // The exit dissolve runs --dur-base; poll for it instead of sleeping a
      // fixed 300ms, because the first frame after close can lag by a capture
      // interval under video recording.
      let fadedAt = null;
      while (performance.now() - closedAt < 1000) {
        if (g.opacity() === "0") {
          fadedAt = performance.now() - closedAt;
          break;
        }
        await g.frame();
      }
      await g.sleep(80); // the async close event and the focus fixup
      return {
        samples,
        goneWithin1s: !g.open(),
        fadedAt,
        closes: g.closes(),
        focusReturned: document.activeElement === window.__sheetOpener,
        opacity: g.opacity(),
      };
    });
    const fastDy = fast.samples.at(-1).y - fast.samples[0].y;
    const fastV = flickVelocity(fast.samples);
    check("sheet-flick", "raw drag < SHEET_DISMISS_PX", fastDy < SHEET_DISMISS_PX, `${fastDy}px < ${SHEET_DISMISS_PX}px`);
    check("sheet-flick", "measured velocity >= SHEET_FLICK_VELOCITY", fastV >= SHEET_FLICK_VELOCITY, `${fastV.toFixed(3)} px/ms`);
    check("sheet-flick", "dialog[open] gone within 1s", fast.goneWithin1s === true);
    check("sheet-flick", "close count is 1", fast.closes === 1, String(fast.closes));
    check("sheet-flick", "focus returns to the Details opener", fast.focusReturned === true);
    check("sheet-flick", "mounted dialog reaches opacity 0", fast.opacity === "0", fast.fadedAt === null ? "never" : `${fast.fadedAt.toFixed(0)}ms`);

    await closeSheet(page); // already dismissed; explicit for the next case

    // 2. Slow short drag: the premise velocity lands in [half, full), so only
    //    a wrong threshold would dismiss it.
    await openDetails(page);
    const slow = await page.evaluate(async () => {
      const g = window.__sheetRig.reset();
      g.down();
      await g.frame();
      g.move(24);
      await g.sleep(260);
      g.move(44);
      await g.sleep(60);
      g.move(64);
      g.up(64); // final move and release in one task, so dt stays ~60ms
      const styles = g.styles(); // read before any CDP round trip (critic N3)
      const frames = [];
      const start = performance.now();
      while (performance.now() - start < 350) {
        frames.push(g.transform());
        await g.frame();
      }
      await g.sleep(Math.max(0, 500 - (performance.now() - start)));
      return {
        samples: g.samples.slice(),
        styles,
        frames,
        open: g.open(),
        closes: g.closes(),
        settlingAt500: g.hasSettling(),
      };
    });
    const slowV = flickVelocity(slow.samples);
    check("sheet-springback", "premise: slow velocity in [0.25, 0.5)", slowV >= SHEET_FLICK_VELOCITY / 2 && slowV < SHEET_FLICK_VELOCITY, `v = ${slowV.toFixed(3)} px/ms`);
    check("sheet-springback", "halved threshold would have dismissed", isFlick(64, slowV, SHEET_FLICK_MIN_PX, SHEET_FLICK_VELOCITY / 2) === true);
    check("sheet-springback", "tap-sized travel is not a flick", isFlick(8, 5, SHEET_FLICK_MIN_PX, SHEET_FLICK_VELOCITY) === false);
    check("sheet-springback", "dialog stays open", slow.open === true && slow.closes === 0, `open=${slow.open} closes=${slow.closes}`);
    check("sheet-springback", "settle transition includes transform", slow.styles.transitionProperty.includes("transform"), slow.styles.transitionProperty);
    check("sheet-springback", "settle duration starts 0.25s", slow.styles.transitionDuration.startsWith("0.25s"), slow.styles.transitionDuration);
    check("sheet-springback", "settle easing is cubic-bezier(0.22, 1, 0.36, 1)", slow.styles.transitionTimingFunction.includes("cubic-bezier(0.22, 1, 0.36, 1)"), slow.styles.transitionTimingFunction);
    const txs = slow.frames.map(tyOf);
    check("sheet-springback", "first frame still offset (> 0)", txs[0] > 0, `${txs[0]}`);
    check("sheet-springback", "returns to rest monotone, no overshoot", txs.every((x) => x >= 0 && x <= txs[0]), txs.map((x) => x.toFixed(1)).join(","));
    check("sheet-springback", "last frame is at rest", isRest(slow.frames.at(-1)), slow.frames.at(-1));
    check("sheet-springback", "last frame is at rest (|ty| <= 0.5)", Number.isFinite(txs.at(-1)) && Math.abs(txs.at(-1)) <= 0.5, `ty = ${txs.at(-1).toFixed(5)}px`);
    check("sheet-springback", ".settling gone by +500ms", slow.settlingAt500 === false);

    await closeSheet(page);

    // 3. Rubber-band: upward travel follows damped and springs back.
    await openDetails(page);
    const rubber = await page.evaluate(async () => {
      const g = window.__sheetRig.reset();
      g.down();
      await g.frame();
      g.move(-40);
      await g.frame();
      g.move(-80);
      const midTransform = g.transform();
      g.up(-80);
      const start = performance.now();
      let elapsed = null;
      while (performance.now() - start < 800) {
        if (g.rest()) {
          elapsed = performance.now() - start;
          break;
        }
        await g.frame();
      }
      await g.sleep(80);
      return { midTransform, elapsed, open: g.open(), closes: g.closes(), end: g.transform() };
    });
    const midTy = tyOf(rubber.midTransform);
    check("sheet-rubber", "mid-drag offset is upward (ty < 0)", midTy < 0, `${midTy.toFixed(2)}px`);
    check("sheet-rubber", "mid-drag offset is damped (< 80px)", Math.abs(midTy) < 80, `${midTy.toFixed(2)}px`);
    check("sheet-rubber", "mid-drag offset is rubberBand(-80)", Math.abs(midTy - rubberBand(-80)) <= 1, `${midTy.toFixed(2)} vs ${rubberBand(-80).toFixed(2)}`);
    check("sheet-rubber", "at rest within 800ms", rubber.elapsed !== null && isRest(rubber.end), rubber.elapsed === null ? "never" : `${rubber.elapsed.toFixed(0)}ms`);
    check("sheet-rubber", "at rest (|ty| <= 0.5)", Number.isFinite(tyOf(rubber.end)) && Math.abs(tyOf(rubber.end)) <= 0.5, `ty = ${tyOf(rubber.end).toFixed(5)}px`);
    check("sheet-rubber", "dialog stays open", rubber.open === true);
    check("sheet-rubber", "close count is 0", rubber.closes === 0, String(rubber.closes));

    await closeSheet(page);

    // 4. A tap (zero travel) never dismisses and measures exactly zero.
    await openDetails(page);
    const tap = await page.evaluate(async () => {
      const g = window.__sheetRig.reset();
      g.down();
      g.up(0);
      await g.sleep(150);
      return { samples: g.samples.slice(), open: g.open(), closes: g.closes() };
    });
    const tapV = flickVelocity(tap.samples);
    check("sheet-tap", "measured velocity is exactly 0", tapV === 0, String(tapV));
    check("sheet-tap", "dialog stays open", tap.open === true);
    check("sheet-tap", "close count is 0", tap.closes === 0, String(tap.closes));

    await page.waitForTimeout(500);
  } finally {
    await context.close();
    await saveVideo(video, "sheet-drag", SHEET_OUT);
  }
}

async function sheetDesktopMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 1440, height: 900, video: true });
  const video = page.video();
  try {
    const details = page.getByRole("button", { name: "Details", exact: true }).first();
    await details.focus();
    await page.evaluate(() => {
      window.__opener = document.activeElement;
      window.__closes = 0;
    });
    await details.click();
    await page.locator("dialog[open]").waitFor({ timeout: 5000 });
    await page.evaluate(() => {
      document.querySelector("dialog[open]").addEventListener("close", () => {
        window.__closes += 1;
      });
    });
    await page.waitForTimeout(500);

    // Close control (mouse): [open] gone, focus returns, one close event.
    await page.getByRole("button", { name: "Close" }).click();
    let gone = await page
      .locator("dialog[open]")
      .waitFor({ state: "hidden", timeout: 2000 })
      .then(() => true, () => false);
    await page.waitForTimeout(100);
    let state = await page.evaluate(() => ({
      closes: window.__closes,
      focusReturned: document.activeElement === window.__opener,
    }));
    check("sheet-desktop", "Close control removes [open]", gone);
    check("sheet-desktop", "Close control returns focus to the Details opener", state.focusReturned === true);
    check("sheet-desktop", "Close control fires one close event", state.closes === 1, String(state.closes));

    // Escape (keyboard): same three assertions (O7 -- no drag at 1440).
    await details.focus();
    await page.evaluate(() => {
      window.__opener = document.activeElement;
      window.__closes = 0;
    });
    await details.click();
    await page.locator("dialog[open]").waitFor({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    gone = await page.locator("dialog[open]").waitFor({ state: "hidden", timeout: 2000 }).then(() => true, () => false);
    await page.waitForTimeout(100);
    state = await page.evaluate(() => ({
      closes: window.__closes,
      focusReturned: document.activeElement === window.__opener,
    }));
    check("sheet-desktop", "Escape removes [open]", gone);
    check("sheet-desktop", "Escape returns focus to the Details opener", state.focusReturned === true);
    check("sheet-desktop", "Escape fires one close event", state.closes === 1, String(state.closes));
  } finally {
    await context.close();
    await saveVideo(video, "sheet-desktop", SHEET_OUT);
  }
}

async function sheetReducedMotion(browser) {
  const { context, page } = await pageFor(browser, { width: 375, height: 812, mobile: true, reduced: true, video: true });
  const video = page.video();
  try {
    await installRig(page);
    await openDetails(page);
    const duration = await page.evaluate(() => getComputedStyle(document.querySelector("dialog[open]")).transitionDuration);
    check("sheet-reduced", "computed transitionDuration is 0s", duration === "0s", duration);

    const slow = await page.evaluate(async () => {
      const g = window.__sheetRig.reset();
      g.down();
      await g.frame();
      g.move(60);
      await g.sleep(160); // slow finish: the release must not read as a flick
      g.up(60);
      await g.frame();
      const after1 = g.rest();
      await g.frame();
      const after2 = g.rest();
      return { after1, after2, open: g.open() };
    });
    check("sheet-reduced", "released 60px drag reaches rest within 2 rAF", slow.after2 === true, `after1=${slow.after1} after2=${slow.after2}`);
    check("sheet-reduced", "dialog stays open after the drag", slow.open === true);

    const flick = await page.evaluate(async () => {
      const g = window.__sheetRig.reset();
      g.down();
      await g.frame();
      g.move(24);
      await g.frame();
      g.move(48);
      g.up(48);
      const deadline = performance.now() + 1000;
      while (g.open() && performance.now() < deadline) await g.frame();
      return { gone: !g.open() };
    });
    check("sheet-reduced", "fast flick removes [open]", flick.gone === true);

    await page.waitForTimeout(400);
  } finally {
    await context.close();
    await saveVideo(video, "sheet-reduced", SHEET_OUT);
  }
}

async function saveVideo(video, name, dir = OUT) {
  const target = path.join(dir, `${name}.webm`);
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
  if (want("press")) await pressMotion(browser);
  if (want("countup")) await countUpMotion(browser);
  if (want("viewpush")) await viewPushMotion(browser);
  if (want("hero")) await heroCrossfadeMotion(browser);
  if (want("sheet-legacy")) await sheetMotion(browser);
  if (want("reduced-legacy")) await reducedMotionRecording(browser);
  if (want("stills")) await stills(browser);
  if (want("sheet")) await sheetGesture(browser);
  if (want("sheet")) await sheetDesktopMotion(browser);
  if (want("sheet")) await sheetReducedMotion(browser);
} finally {
  await browser.close();
}

// The ui-11 guard only makes sense in a full run; `ONLY=sheet` touches only
// ui-19 and leaves the committed ui-11 media as it is.
if (!ONLY) {
  const pngs = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length;
  const webms = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm")).length;
  console.log(`artifacts: ${pngs} png, ${webms} webm in ${OUT}`);
  if (pngs < 6 || webms < 6) {
    console.log("FAIL artifact-count");
    failed = true;
  }
}
const sheetWebms = fs.readdirSync(SHEET_OUT).filter((f) => f.endsWith(".webm")).length;
console.log(`artifacts: ${sheetWebms} webm in ${SHEET_OUT}`);
if (sheetWebms < 3) {
  console.log("FAIL artifact-count sheet");
  failed = true;
}
console.log(failed ? "motion check: FAIL" : "motion check: all pass");
process.exit(failed ? 1 : 0);
