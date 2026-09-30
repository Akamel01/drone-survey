// UI-18 (#255) rest exit / fold check: asserts the wide-screen fold/unfold
// motion contract and records evidence. Exits non-zero on any FAIL.
//
// Usage: build the app, serve it, then
//   npm run check:fold -- http://127.0.0.1:3155
//
// The harness writes ONLY to a fresh `mkdtempSync(os.tmpdir())` directory
// (printed at the end); there is no output-directory argument, so a run cannot
// leave media in the repo. There is no live B2 store: a fetch wrapper answers
// /api/missions from memory and a localStorage key stands in for the
// planner's passphrase, exactly as motion-check.mjs does.
//
// Assertion style: pass 1 fold/unfold samples the real CSS transitions by
// pausing them and setting `currentTime` to exact instants (getAnimations /
// Web Animations API). This is deterministic regardless of headless frame
// pacing — the samples are the transition's own interpolated values, not a
// guess from a frame. Pass 2 pauses and seeks too, yielding a few tasks after
// each seek so the retarget sees the settled mid-flight style; the browser's
// own reversal/retarget logic then runs, and continuity is read from the
// retarget's start value (the paused clock keeps the read repeatable).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "./lib/harness.mjs";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { deriveMissions } from "../lib/missionRecords.ts";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
// Fresh temp dir per run: the recordings land here and nowhere else.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "ui18-fold-"));
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

// ---------------------------------------------------------------------------
// Seeded Mission list (readiness signal, same shape as motion-check.mjs)
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

// ---------------------------------------------------------------------------
// Assertion log
// ---------------------------------------------------------------------------

let failed = false;
function check(group, name, cond, detail = "") {
  const line = `${cond ? "PASS" : "FAIL"} ${group}/${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!cond) failed = true;
}
const norm = (s) => String(s).replace(/\s+/g, "");
function txOf(transform) {
  if (transform === "none") return 0;
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  return m ? Number(m[1].split(",")[4].trim()) : NaN;
}
function matrixParts(transform) {
  if (transform === "none") return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!m) return null;
  const [a, b, c, d, tx, ty] = m[1].split(",").map((v) => Number(v.trim()));
  return { a, b, c, d, tx, ty };
}
function maxRectDelta(a, b) {
  if (!a || !b) return NaN;
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

async function pageFor(browser, { width, height, mobile = false, reduced = false, video = false, allowOffline = false }) {
  const contextOptions = {
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: reduced ? "reduce" : "no-preference",
  };
  if (video) contextOptions.recordVideo = { dir: path.join(OUT, "raw"), size: { width, height } };
  const context = await browser.newContext(contextOptions);
  try {
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
    const videoHandle = video ? page.video() : null;
    await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 20000 });
    await page.waitForFunction(
      ({ needOnline }) => {
        const pageEl = document.querySelector("[data-missions][data-settings]");
        const panel = document.querySelector("#missions-panel");
        if (!pageEl || !panel) return false;
        if (needOnline && pageEl.getAttribute("data-network") !== "online") return false;
        const cs = getComputedStyle(panel);
        // Wide: identity is "none"; narrow: the view stack's translateX(0%).
        const m = /^matrix\(([^)]+)\)$/.exec(cs.transform);
        const tx = cs.transform === "none" ? 0 : m ? Number(m[1].split(",")[4].trim()) : NaN;
        return tx === 0 && cs.opacity === "1";
      },
      { needOnline: !allowOffline },
      { timeout: 20000 },
    );
    await page.waitForTimeout(1000); // Summary lead figure count-up finishes
    return { context, page, video: videoHandle };
  } catch (err) {
    await context.close().catch(() => {});
    throw err;
  }
}

async function saveVideo(page, video, name) {
  if (!video) {
    check("video", `${name} is non-empty`, false, "no video handle");
    return;
  }
  await video.saveAs(path.join(OUT, name));
  const size = fs.statSync(path.join(OUT, name)).size;
  check("video", `${name} is non-empty`, size > 1000, `${size} bytes`);
}

// Headless Chromium advances the animation clock only when frames are
// produced; a bare wall-clock timeout waits while transitions stay frozen.
// This drives requestAnimationFrame for `ms` so the motion actually runs --
// and the recording captures it.
async function drive(page, ms) {
  await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const start = performance.now();
        const loop = () => (performance.now() - start > ms ? resolve() : requestAnimationFrame(loop));
        requestAnimationFrame(loop);
      }),
    ms,
  );
}

// Wait for the panel's real end state -- terminal computed style plus no
// transition still running on it -- instead of a fixed wall-clock sleep. A
// sleep races the 250 ms-delayed visibility flip (headless Chromium only
// advances the animation clock on frames, and a sleep drives none): the state
// read could see a half-run fold. `polling: "raf"` both drives frames and
// evaluates the predicate on them, and the timeout reports what it actually
// saw rather than failing silently.
async function waitForSettled(page, sel, expect, { timeout = 10000 } = {}) {
  try {
    await page.waitForFunction(
      ({ sel, expect }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        const identity = cs.transform === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(cs.transform);
        const settled =
          expect === "folded"
            ? cs.visibility === "hidden" && Number(cs.opacity) <= 0.05
            : cs.visibility === "visible" && cs.opacity === "1" && identity;
        if (!settled) return false;
        return !document.getAnimations().some((a) => a.effect && a.effect.target === el && (a.playState === "running" || a.playState === "pending"));
      },
      { sel, expect },
      { timeout, polling: "raf" },
    );
  } catch {
    const seen = await page
      .evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { missing: true };
        const cs = getComputedStyle(el);
        return {
          visibility: cs.visibility,
          opacity: cs.opacity,
          transform: cs.transform,
          animations: document
            .getAnimations()
            .filter((a) => a.effect && a.effect.target === el)
            .map((a) => `${a.transitionProperty}:${a.playState}@${Math.round(a.currentTime ?? -1)}`),
        };
      }, sel)
      .catch(() => null);
    throw new Error(`${sel} did not settle ${expect} within ${timeout}ms: ${JSON.stringify(seen)}`);
  }
}

// ---------------------------------------------------------------------------
// Consumers of --missions-w / --settings-w (AC2)
// ---------------------------------------------------------------------------

const CONSUMERS = [
  'div[class*="summary"]',
  ".maplibregl-ctrl-bottom-left .maplibregl-ctrl",
  ".maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib",
  '[class*="basemapToggle"]',
  '[class*="drawPanel"]',
];

const PANELS = {
  missions: {
    id: "fold/missions",
    sel: "#missions-panel",
    attr: "data-missions",
    collapse: "Collapse Missions",
    expand: "Expand Missions",
    slide: -352,
    open: "340px",
    cp: "--missions-w",
    edge: "left",
    expectStep: [0, 1, 4], // Summary, bottom-left ctrl, draw panel
  },
  settings: {
    id: "fold/settings",
    sel: "#settings-panel",
    attr: "data-settings",
    collapse: "Collapse Settings",
    expand: "Expand Settings",
    slide: 372,
    open: "360px",
    cp: "--settings-w",
    edge: "right",
    expectStep: [0, 2, 3], // Summary, attribution, basemap toggle
  },
};

// ---------------------------------------------------------------------------
// Pass 1 primitives: catch the real transitions, pause, seek, sample
// ---------------------------------------------------------------------------

async function sampleToggle(page, cfg) {
  return page.evaluate(
    async ({ panelSel, clickLabel, expandLabel, times, consumerSels }) => {
      const yieldTask = () =>
        new Promise((r) => {
          const c = new MessageChannel();
          c.port1.onmessage = () => {
            c.port1.close();
            r();
          };
          c.port2.postMessage(0);
        });
      const pageEl = document.querySelector("[data-missions][data-settings]");
      const panel = document.querySelector(panelSel);
      const find = (label) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
      const tab = find(expandLabel);
      const btn = find(clickLabel);
      if (!pageEl || !panel || !tab || !btn) return { error: `missing node for ${panelSel}` };
      window.__foldNodes = window.__foldNodes || {};
      window.__foldNodes[panelSel] = { panel, tab, btn };
      const isTarget = (a) => {
        const t = a.effect && a.effect.target;
        return t === panel || t === tab || t === pageEl;
      };
      const catchAnims = async () => {
        for (let i = 0; i < 20000; i++) {
          void getComputedStyle(panel).transform;
          const list = document.getAnimations().filter(isTarget);
          if (list.length) return { iterations: i, list };
          await yieldTask();
        }
        return { iterations: -1, list: [] };
      };
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom];
      };
      const decl = (el) => {
        const cs = getComputedStyle(el);
        return {
          property: cs.transitionProperty,
          duration: cs.transitionDuration,
          timing: cs.transitionTimingFunction,
          delay: cs.transitionDelay,
          animationName: cs.animationName,
        };
      };
      const consumers = consumerSels.map((s) => document.querySelector(s));
      const topEl = document.querySelector('[class*="__top"]');
      const beforeConsumer = consumers.map((el) => (el ? rect(el) : null));
      const beforeRect = rect(panel);
      const scrollBefore = document.documentElement.scrollWidth <= window.innerWidth;
      btn.click();
      const caught = await catchAnims();
      for (const a of caught.list) a.pause();
      const declarations = { panel: decl(panel), tab: decl(tab), page: decl(pageEl) };
      const setT = (t) => {
        for (const a of caught.list) a.currentTime = t;
        void getComputedStyle(panel).transform;
      };
      const sample = (t) => {
        setT(t);
        const c = getComputedStyle(panel);
        const tc = getComputedStyle(tab);
        const pc = getComputedStyle(pageEl);
        return {
          t,
          transform: c.transform,
          opacity: Number(c.opacity),
          visibility: c.visibility,
          pointerEvents: c.pointerEvents,
          animationName: c.animationName,
          tabOpacity: Number(tc.opacity),
          tabVisibility: tc.visibility,
          tabPointerEvents: tc.pointerEvents,
          wx: pc.getPropertyValue("--missions-w").trim(),
          sx: pc.getPropertyValue("--settings-w").trim(),
          wdelay: pc.getPropertyValue("--missions-delay").trim(),
          sdelay: pc.getPropertyValue("--settings-delay").trim(),
          summaryH: pc.getPropertyValue("--summary-h").trim(),
          scrollOk: document.documentElement.scrollWidth <= window.innerWidth,
          topScroll: topEl ? topEl.scrollLeft : 0,
          consumers: consumers.map((el) => (el ? rect(el) : null)),
        };
      };
      const samples = times.map(sample);
      const caughtInfo = caught.list.map((a) => ({
        target: a.effect.target === panel ? "panel" : a.effect.target === tab ? "tab" : "page",
        property: a.transitionProperty,
        duration: a.effect.getTiming().duration,
        delay: a.effect.getTiming().delay,
        easing: a.effect.getTiming().easing,
      }));
      for (const a of caught.list) {
        try {
          a.finish();
        } catch {
          a.currentTime = a.effect.getTiming().delay + a.effect.getTiming().duration;
        }
      }
      void getComputedStyle(panel).transform;
      const after = {
        transform: getComputedStyle(panel).transform,
        opacity: getComputedStyle(panel).opacity,
        visibility: getComputedStyle(panel).visibility,
        pointerEvents: getComputedStyle(panel).pointerEvents,
        animationName: getComputedStyle(panel).animationName,
        rect: rect(panel),
        tabOpacity: getComputedStyle(tab).opacity,
        tabVisibility: getComputedStyle(tab).visibility,
        tabPointerEvents: getComputedStyle(tab).pointerEvents,
        tabRect: rect(tab),
        tabInert: tab.inert,
        panelInert: panel.inert,
        wx: getComputedStyle(pageEl).getPropertyValue("--missions-w").trim(),
        sx: getComputedStyle(pageEl).getPropertyValue("--settings-w").trim(),
        wdelay: getComputedStyle(pageEl).getPropertyValue("--missions-delay").trim(),
        sdelay: getComputedStyle(pageEl).getPropertyValue("--settings-delay").trim(),
        summaryH: getComputedStyle(pageEl).getPropertyValue("--summary-h").trim(),
        dataMissions: pageEl.getAttribute("data-missions"),
        dataSettings: pageEl.getAttribute("data-settings"),
        scrollOk: document.documentElement.scrollWidth <= window.innerWidth,
        topScroll: topEl ? topEl.scrollLeft : 0,
        consumers: consumers.map((el) => (el ? rect(el) : null)),
      };
      const late = [];
      for (let k = 0; k < 12; k++) {
        await yieldTask();
        late.push({
          consumers: consumers.map((el) => (el ? rect(el) : null)),
          summaryH: getComputedStyle(pageEl).getPropertyValue("--summary-h").trim(),
          topScroll: topEl ? topEl.scrollLeft : 0,
        });
      }
      return {
        caughtIterations: caught.iterations,
        caughtInfo,
        declarations,
        samples,
        after,
        late,
        beforeRect,
        beforeConsumer,
        scrollBefore,
        bounds: { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth },
      };
    },
    cfg,
  );
}

// ---------------------------------------------------------------------------
// Pass 1 assertions
// ---------------------------------------------------------------------------

const EXPECT_FOLD = {
  property: "transform,opacity,visibility",
  duration: "0.25s,0.25s,0s",
  timing: "cubic-bezier(0.4,0,1,1),cubic-bezier(0.4,0,1,1),linear",
  delay: "0s,0s,0.25s",
};
const EXPECT_UNFOLD = {
  property: "transform,opacity,visibility",
  duration: "0.4s,0.4s,0s",
  timing: "cubic-bezier(0.3,0.7,0.2,1),cubic-bezier(0.3,0.7,0.2,1),linear",
  delay: "0s,0s,0s",
};

async function runTogglePanel(page, P) {
  const G = P.id;
  const slideAbs = Math.abs(P.slide);
  const fold = await sampleToggle(page, {
    panelSel: P.sel,
    clickLabel: P.collapse,
    expandLabel: P.expand,
    times: [0, 62.5, 125, 187.5, 240, 249, 258],
    consumerSels: CONSUMERS,
  });
  check(`${G}/fold`, "sampling caught the fold transitions", !fold.error && fold.samples.length === 7, fold.error ?? `${fold.caughtIterations} yields, ${fold.caughtInfo.length} transitions`);
  if (fold.error) return { fold, unfold: null };

  const identityFold = await page.evaluate((sel) => {
    const stored = window.__foldNodes[sel];
    return {
      panel: stored.panel === document.querySelector(sel),
      tab: stored.tab === [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === stored.tab.getAttribute("aria-label")),
      btn: stored.btn === [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === stored.btn.getAttribute("aria-label")),
    };
  }, P.sel);
  check(`${G}/fold`, "panel and tab stay the same DOM nodes", identityFold.panel && identityFold.tab && identityFold.btn, JSON.stringify(identityFold));

  const propOf = (list, target, property) => list.find((a) => a.target === target && a.property === property) ?? null;
  // This panel's own attribute, and the sibling panel's (which the toggle must
  // leave where it was).
  const attrOf = (snap) => (P.attr === "data-missions" ? snap.dataMissions : snap.dataSettings);
  const otherAttrOf = (snap) => (P.attr === "data-missions" ? snap.dataSettings : snap.dataMissions);
  const panelTransform = propOf(fold.caughtInfo, "panel", "transform");
  const panelOpacity = propOf(fold.caughtInfo, "panel", "opacity");
  const panelVisibility = propOf(fold.caughtInfo, "panel", "visibility");
  const tabOpacity = propOf(fold.caughtInfo, "tab", "opacity");
  const cpTransition = propOf(fold.caughtInfo, "page", P.cp);
  check(`${G}/fold`, "panel transform transition is 250ms --ease-in", panelTransform?.duration === 250 && norm(panelTransform.easing) === "cubic-bezier(0.4,0,1,1)", JSON.stringify(panelTransform));
  check(`${G}/fold`, "panel opacity transition is 250ms --ease-in", panelOpacity?.duration === 250 && norm(panelOpacity.easing) === "cubic-bezier(0.4,0,1,1)", JSON.stringify(panelOpacity));
  check(`${G}/fold`, "panel visibility transition is 0s + 250ms", panelVisibility?.duration === 0 && panelVisibility.delay === 250, JSON.stringify(panelVisibility));
  check(`${G}/fold`, "tab opacity transition is 150ms + 150ms --ease-out", tabOpacity?.duration === 150 && tabOpacity.delay === 150 && norm(tabOpacity.easing) === "cubic-bezier(0.22,1,0.36,1)", JSON.stringify(tabOpacity));
  check(`${G}/fold`, `custom property ${P.cp} transition is 0s + 250ms`, cpTransition?.duration === 0 && cpTransition.delay === 250, JSON.stringify(cpTransition));

  const pd = fold.declarations.panel;
  check(`${G}/fold`, "computed panel transition-property", norm(pd.property) === EXPECT_FOLD.property, pd.property);
  check(`${G}/fold`, "computed panel transition-duration", norm(pd.duration) === EXPECT_FOLD.duration, pd.duration);
  check(`${G}/fold`, "computed panel transition-timing-function", norm(pd.timing) === EXPECT_FOLD.timing, pd.timing);
  check(`${G}/fold`, "computed panel transition-delay (visibility hides at settle)", norm(pd.delay) === EXPECT_FOLD.delay, pd.delay);
  check(`${G}/fold`, "fold uses transitions, not animations", fold.samples.every((s) => s.animationName === "none") && pd.animationName === "none", pd.animationName);
  const pageD = fold.declarations.page;
  check(`${G}/fold`, "page transitions --missions-w/--settings-w with 0s duration", norm(pageD.property) === "--missions-w,--settings-w" && norm(pageD.duration) === "0s,0s", `${pageD.property} @ ${pageD.duration}`);

  const mid = fold.samples.find((s) => s.t === 125);
  const midRatio = Math.abs(txOf(mid.transform)) / slideAbs;
  check(`${G}/fold`, "mid-motion sample at 125ms is really mid-flight", midRatio > 0.05 && midRatio < 0.95 && mid.opacity > 0 && mid.opacity < 1, `tx=${txOf(mid.transform).toFixed(1)}px (${(midRatio * 100).toFixed(1)}% of slide), opacity=${mid.opacity.toFixed(3)}`);
  check(`${G}/fold`, "mid-motion is near the --ease-in 32% mark", midRatio > 0.2 && midRatio < 0.5, `${(midRatio * 100).toFixed(1)}%`);

  const move = fold.samples.filter((s) => s.t <= 249);
  const txMags = move.map((s) => Math.abs(txOf(s.transform)));
  const ops = move.map((s) => s.opacity);
  check(`${G}/fold`, "translateX magnitude is strictly monotonic", txMags.every((v, i) => i === 0 || v > txMags[i - 1]), txMags.map((v) => v.toFixed(1)).join(" -> "));
  check(`${G}/fold`, "opacity is strictly monotonic", ops.every((v, i) => i === 0 || v < ops[i - 1]), ops.map((v) => v.toFixed(3)).join(" -> "));
  const parts = fold.samples.map((s) => matrixParts(s.transform));
  check(`${G}/fold`, "no translateY/scale/rotation, only translateX", parts.every((m) => m && m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && Math.abs(m.ty) < 0.01), JSON.stringify(parts[2]));

  const hold240 = fold.samples.find((s) => s.t === 240);
  const hold258 = fold.samples.find((s) => s.t === 258);
  const holdVal = (s) => (P.cp === "--missions-w" ? s.wx : s.sx);
  const holdDelay = (s) => (P.cp === "--missions-w" ? s.wdelay : s.sdelay);
  check(`${G}/fold`, `settle hold pair: ${P.cp} still ${P.open} at t=240ms`, holdVal(hold240) === P.open, `${holdVal(hold240)} (delay ${holdDelay(hold240)})`);
  check(`${G}/fold`, `settle hold pair: ${P.cp} is 0px at t=258ms`, holdVal(hold258) === "0px", `${holdVal(hold258)} (delay ${holdDelay(hold258)})`);
  check(`${G}/fold`, "offsets never interpolate (only open or 0 values)", fold.samples.every((s) => [P.open, "0px"].includes(holdVal(s))), fold.samples.map((s) => holdVal(s)).join(","));

  check(`${G}/fold`, "settled panel is invisible and out of the viewport", hold258.visibility === "hidden" && hold258.opacity <= 0.05 && (P.edge === "left" ? fold.after.rect[2] <= 0 : fold.after.rect[0] >= fold.bounds.innerWidth), `vis=${hold258.visibility}, opacity=${hold258.opacity}, rect=${fold.after.rect.map((v) => v.toFixed(1))}`);
  check(`${G}/fold`, "folded panel is inert and click-through", fold.after.panelInert === true && hold258.pointerEvents === "none", `inert=${fold.after.panelInert}, pointer-events=${hold258.pointerEvents}`);
  check(`${G}/fold`, "settled panel transform is the full slide", Math.abs(Math.abs(txOf(fold.after.transform)) - slideAbs) < 2, fold.after.transform);
  check(`${G}/fold`, "state attribute flipped and offsets settled", attrOf(fold.after) === "closed" && otherAttrOf(fold.after) === "open" && holdVal(hold258) === "0px", `${fold.after.dataMissions}/${fold.after.dataSettings}`);

  const tabEarly = fold.samples.filter((s) => s.t <= 150);
  const tabLate = fold.samples.find((s) => s.t === 240);
  check(`${G}/fold`, "tab is invisible for the first 150ms", tabEarly.every((s) => s.tabOpacity <= 0.2), tabEarly.map((s) => `${s.t}:${s.tabOpacity.toFixed(3)}`).join(" "));
  check(`${G}/fold`, "tab is fully visible at settle", tabLate.tabOpacity >= 0.9 && fold.after.tabOpacity === "1" && fold.after.tabVisibility === "visible" && hold258.tabVisibility === "visible", `240ms=${tabLate.tabOpacity.toFixed(3)}, after=${fold.after.tabOpacity}/${fold.after.tabVisibility}`);
  check(`${G}/fold`, "tab is focusable (live) while the panel is folded", fold.after.tabInert === false && fold.after.tabPointerEvents === "auto", `inert=${fold.after.tabInert}, pointer-events=${fold.after.tabPointerEvents}`);
  const tabAtEdge = P.edge === "left" ? fold.after.tabRect[0] <= 16 : fold.after.tabRect[2] >= fold.bounds.innerWidth - 16;
  check(`${G}/fold`, "tab sits at its panel's edge", tabAtEdge, `rect=${fold.after.tabRect.map((v) => v.toFixed(1))}`);

  const midSamples = fold.samples.filter((s) => s.t < 250);
  const maxMidDelta = Math.max(...midSamples.map((s) => Math.max(...s.consumers.map((c, i) => maxRectDelta(c, fold.beforeConsumer[i])))));
  check(`${G}/fold`, "consumers do not move mid-motion (Summary, map corners, basemap, draw panel)", maxMidDelta <= 1, `max delta ${maxMidDelta.toFixed(2)}px`);
  check(`${G}/fold`, "no horizontal overflow at any sample", fold.samples.every((s) => s.scrollOk && s.topScroll === 0) && fold.after.scrollOk && fold.after.topScroll === 0, `${fold.bounds.scrollWidth}/${fold.bounds.innerWidth} topScroll=${fold.samples.map((s) => s.topScroll).join(",")}/${fold.after.topScroll}`);
  const summaryHMids = new Set(midSamples.map((s) => s.summaryH));
  check(`${G}/fold`, "--summary-h does not change mid-motion", summaryHMids.size === 1, [...summaryHMids].join(","));

  const stepDeltas = fold.after.consumers.map((c, i) => maxRectDelta(c, fold.beforeConsumer[i]));
  const primary = P.expectStep.map((i) => stepDeltas[i]);
  check(`${G}/fold`, "offset consumers step once at the settle", primary.every((d) => d >= 300 && d <= 400), P.expectStep.map((i) => `${CONSUMERS[i].slice(0, 22)}=${stepDeltas[i].toFixed(1)}`).join(" "));
  const untouched = stepDeltas.filter((_, i) => !P.expectStep.includes(i));
  check(`${G}/fold`, "unrelated consumers stay put at the settle", untouched.every((d) => d <= 1), untouched.map((d) => d.toFixed(2)).join(","));
  // R7: the Summary's ResizeObserver may write --summary-h once, on the settle
  // frame, moving only the map controls whose bottom margin reads it. Once that
  // single write has committed, nothing may move again -- and nothing else may.
  // An unset --summary-h parses to NaN; treat it as "no write" so the drift
  // rules below stay meaningful instead of failing on NaN comparisons.
  const hNum = (s) => {
    const v = Number.parseFloat(s);
    return Number.isFinite(v) ? v : 0;
  };
  const hVals = [fold.after.summaryH, ...fold.late.map((l) => l.summaryH)];
  const hWrites = hVals.filter((v, i) => i > 0 && v !== hVals[i - 1]).length;
  const stableAt = fold.late.findIndex((l, i) => i + 1 < fold.late.length && JSON.stringify(l) === JSON.stringify(fold.late[i + 1]));
  const stable = stableAt >= 0;
  const preStable = stable ? fold.late.slice(0, stableAt + 1) : [];
  const stableTail = stable ? fold.late.slice(stableAt + 1) : [];
  const driftViolations = [];
  for (const l of preStable) {
    const drop = hNum(fold.after.summaryH) - hNum(l.summaryH);
    let moved = 0;
    l.consumers.forEach((c, i) => {
      const a = fold.after.consumers[i];
      if (!a || !c || a === c) return;
      const [dl, dt, dr, db] = a.map((v, k) => c[k] - v);
      const stays = Math.abs(dl) <= 1 && Math.abs(dr) <= 1 && Math.abs(dt) <= 1 && Math.abs(db) <= 1;
      const follows = Math.abs(dl) <= 1 && Math.abs(dr) <= 1 && Math.abs(dt - drop) <= 1 && Math.abs(db - drop) <= 1;
      if (!stays && !follows) driftViolations.push(`c${i} d=[${dl.toFixed(1)},${dt.toFixed(1)},${dr.toFixed(1)},${db.toFixed(1)}] drop=${drop.toFixed(1)}`);
      else if (follows && !stays) moved++;
    });
    if (Math.abs(drop) > 1 && moved === 0) driftViolations.push(`drop ${drop.toFixed(1)} with no consumer following it`);
  }
  const driftIsSummaryWrite = driftViolations.length === 0;
  const tailDeltas = stableTail.map((l) => Math.max(...l.consumers.map((c, i) => maxRectDelta(c, fold.late[stableAt].consumers[i]))));
  check(`${G}/fold`, "at most one --summary-h write follows the settle", hWrites <= 1 && new Set(hVals).size <= 2, hVals.join(" -> "));
  check(`${G}/fold`, "post-settle movement is only that --summary-h write (vertical, matching)", stable && driftIsSummaryWrite && preStable.every((l) => l.topScroll === 0), stable ? `write at sample ${stableAt + 1}/12; ${driftViolations.slice(0, 3).join("; ") || "all drifts match"}` : "never stabilized (12 samples)");
  check(`${G}/fold`, "nothing moves after the settle write commits (and no clip-container scroll)", stable && tailDeltas.every((d) => d <= 1) && stableTail.every((l) => l.summaryH === fold.late[stableAt].summaryH && l.topScroll === 0), stable ? `tail deltas ${tailDeltas.map((d) => d.toFixed(2)).join(",")} over ${stableTail.length} samples` : "never stabilized");

  // ---- unfold ------------------------------------------------------------
  const unfold = await sampleToggle(page, {
    panelSel: P.sel,
    clickLabel: P.expand,
    expandLabel: P.expand,
    times: [0, 100, 200, 300, 400],
    consumerSels: CONSUMERS,
  });
  check(`${G}/unfold`, "sampling caught the unfold transitions", !unfold.error && unfold.samples.length === 5, unfold.error ?? `${unfold.caughtIterations} yields, ${unfold.caughtInfo.length} transitions`);
  if (unfold.error) return { fold, unfold };

  const ud = unfold.declarations.panel;
  check(`${G}/unfold`, "computed unfold transition-duration is --dur-slow", norm(ud.duration) === EXPECT_UNFOLD.duration, ud.duration);
  check(`${G}/unfold`, "computed unfold transition-timing-function is --ease-emphasised", norm(ud.timing) === EXPECT_UNFOLD.timing, ud.timing);
  check(`${G}/unfold`, "computed unfold transition-delay is 0 (visibility at commit)", norm(ud.delay) === EXPECT_UNFOLD.delay, ud.delay);
  check(`${G}/unfold`, "unfold uses transitions, not animations", unfold.samples.every((s) => s.animationName === "none"), ud.animationName);
  const exitDur = propOf(fold.caughtInfo, "panel", "transform")?.duration ?? 0;
  const enterDur = propOf(unfold.caughtInfo, "panel", "transform")?.duration ?? 0;
  check(`${G}/unfold`, "exit (250ms) is faster than entrance (400ms)", exitDur === 250 && enterDur === 400, `exit ${exitDur}ms < entrance ${enterDur}ms`);

  const start = unfold.samples[0];
  check(`${G}/unfold`, `starts at the full slide with opacity 0 (out of the edge)`, Math.abs(Math.abs(txOf(start.transform)) - slideAbs) < 2 && start.opacity <= 0.05, `${start.transform} opacity=${start.opacity}`);
  check(`${G}/unfold`, `offsets settle at t=0 for unfold (${P.cp}=${P.open})`, (P.cp === "--missions-w" ? start.wx : start.sx) === P.open, P.cp === "--missions-w" ? start.wx : start.sx);
  check(`${G}/unfold`, "tab is fully visible at the unfold commit", start.tabOpacity >= 0.9 && start.tabVisibility === "visible", `${start.tabOpacity}/${start.tabVisibility}`);

  const utx = unfold.samples.map((s) => Math.abs(txOf(s.transform)));
  const uop = unfold.samples.map((s) => s.opacity);
  check(`${G}/unfold`, "translateX magnitude shrinks monotonically", utx.every((v, i) => i === 0 || v < utx[i - 1]), utx.map((v) => v.toFixed(1)).join(" -> "));
  check(`${G}/unfold`, "opacity grows monotonically", uop.every((v, i) => i === 0 || v > uop[i - 1]), uop.map((v) => v.toFixed(3)).join(" -> "));
  const end = unfold.samples[4];
  check(`${G}/unfold`, "tab is gone by the unfold end", end.tabOpacity <= 0.1 && end.tabVisibility === "hidden", `${end.tabOpacity}/${end.tabVisibility}`);

  const unfoldMid = unfold.samples.filter((s) => s.t > 0);
  const unfoldMaxDelta = Math.max(...unfoldMid.map((s) => Math.max(...s.consumers.map((c, i) => maxRectDelta(c, unfold.samples[0].consumers[i])))));
  check(`${G}/unfold`, "consumers do not move during the unfold", unfoldMaxDelta <= 1, `max delta ${unfoldMaxDelta.toFixed(2)}px`);
  check(`${G}/unfold`, "no horizontal overflow at any unfold sample", unfold.samples.every((s) => s.scrollOk && s.topScroll === 0), `${unfold.bounds.scrollWidth}/${unfold.bounds.innerWidth} topScroll=${unfold.samples.map((s) => s.topScroll).join(",")}`);

  // The resting rect is the pre-fold open rect captured by the fold sampling,
  // not the folded rect sampled after the click (which is what this harness
  // compared before and could never match).
  check(`${G}/unfold`, "resting rect is restored (within 1px)", maxRectDelta(unfold.after.rect, fold.beforeRect) <= 1, `open=${fold.beforeRect.map((v) => v.toFixed(1))} after=${unfold.after.rect.map((v) => v.toFixed(1))}`);
  check(`${G}/unfold`, "settled panel is identity, opaque, visible and interactive", unfold.after.transform === "none" && unfold.after.opacity === "1" && unfold.after.visibility === "visible" && unfold.after.pointerEvents === "auto" && unfold.after.panelInert === false, `${unfold.after.transform} ${unfold.after.opacity}/${unfold.after.visibility}/${unfold.after.pointerEvents} inert=${unfold.after.panelInert}`);
  check(`${G}/unfold`, "state attribute and offsets are back to open", attrOf(unfold.after) === "open" && unfold.after.tabInert === true, `${unfold.after.dataMissions}/${unfold.after.dataSettings} tabInert=${unfold.after.tabInert}`);
  return { fold, unfold };
}

// ---------------------------------------------------------------------------
// Pass 2: rapid toggle with real retargeting (seek, never pause/remount)
// ---------------------------------------------------------------------------

async function rapidToggle(page, P) {
  return page.evaluate(
    async ({ panelSel, attr, collapseLabel, expandLabel, slide, cp, open }) => {
      const yieldTask = () =>
        new Promise((r) => {
          const c = new MessageChannel();
          c.port1.onmessage = () => {
            c.port1.close();
            r();
          };
          c.port2.postMessage(0);
        });
      const pageEl = document.querySelector("[data-missions][data-settings]");
      const panel = document.querySelector(panelSel);
      const find = (label) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
      const collapse = find(collapseLabel);
      const expand = find(expandLabel);
      if (!pageEl || !panel || !collapse || !expand) return { error: `missing node for ${panelSel}` };
      const watch = [panel, collapse, expand, document.querySelector("#missions-panel"), document.querySelector("#settings-panel"), document.querySelector('[aria-label="Expand Missions"]'), document.querySelector('[aria-label="Expand Settings"]'), document.querySelector('[aria-label="Collapse Missions"]'), document.querySelector('[aria-label="Collapse Settings"]')].filter(Boolean);
      const records = [];
      const obs = new MutationObserver((recs) => {
        for (const rec of recs) {
          for (const n of [...rec.addedNodes, ...rec.removedNodes]) {
            if (watch.some((w) => n === w || (n.nodeType === 1 && (n.contains(w) || w.contains(n))))) records.push(rec.type);
          }
        }
      });
      obs.observe(pageEl, { childList: true, subtree: true });

      const isTarget = (a) => {
        const t = a.effect && a.effect.target;
        return t === panel || t === expand || t === collapse || t === pageEl;
      };
      // Chromium may reuse a running transition's Animation object when it is
      // retargeted mid-flight (reversal), so "not in the previous list" is not
      // a reliable test. The active set at the attribute flip is what the panel
      // is running now: replaced transitions have vanished, reused ones carry
      // the new timing.
      const catchCurrent = async (want) => {
        for (let i = 0; i < 20000; i++) {
          void getComputedStyle(panel).transform;
          if (pageEl.getAttribute(want.attr) === want.value) {
            const list = document.getAnimations().filter(isTarget);
            if (list.length) return { iterations: i, list };
          }
          await yieldTask();
        }
        return { iterations: -1, list: [] };
      };
      const tx = (t) => {
        const m = /^matrix\(([^)]+)\)$/.exec(t);
        return m ? Number(m[1].split(",")[4].trim()) : t === "none" ? 0 : NaN;
      };
      const read = () => {
        const cs = getComputedStyle(panel);
        const pc = getComputedStyle(pageEl);
        return { tx: tx(cs.transform), opacity: Number(cs.opacity), visibility: cs.visibility, animationName: cs.animationName, cp: pc.getPropertyValue(cp).trim(), data: `${pageEl.getAttribute("data-missions")}/${pageEl.getAttribute("data-settings")}`, attrValue: pageEl.getAttribute(attr), rect: panel.getBoundingClientRect().right };
      };
      const seek = (list, t) => {
        for (const a of list) a.currentTime = t;
        void getComputedStyle(panel).transform;
      };
      const names = (list) => list.map((a) => `${a.transitionProperty}:${Math.round(a.effect.getTiming().duration)}+${Math.round(a.effect.getTiming().delay)}`);

      const all = [];
      // trigger 1: fold; the next trigger lands at t=100ms of the fold.
      // The fold is paused and seeked, then a few tasks are yielded so the
      // seeked style has settled before the retarget: without that settle
      // Chromium sometimes drops the interrupted transition instead of
      // reversing it, which made the continuity assertion a coin flip.
      collapse.click();
      const c1 = await catchCurrent({ attr, value: "closed" });
      all.push(...c1.list);
      for (const a of c1.list) a.pause();
      seek(c1.list, 100);
      await yieldTask();
      await yieldTask();
      await yieldTask();
      const s1 = read();
      // trigger 2: unfold at t=100ms (mid-fold); read the retarget's start value
      expand.click();
      const c2 = await catchCurrent({ attr, value: "open" });
      all.push(...c2.list);
      for (const a of c2.list) a.pause();
      const c2Transforms = c2.list.filter((a) => a.transitionProperty === "transform" && Number.isFinite(a.effect.getTiming().duration));
      const c2dur = c2Transforms.length ? Math.min(...c2Transforms.map((a) => a.effect.getTiming().duration)) : 0;
      seek(c2.list, 0);
      const s2 = read();
      seek(c2.list, Math.max(1, c2dur / 2));
      const s3 = read();
      // trigger 3: fold again while the unfold is still running
      await yieldTask();
      await yieldTask();
      await yieldTask();
      collapse.click();
      const c3 = await catchCurrent({ attr, value: "closed" });
      all.push(...c3.list);
      for (const a of c3.list) a.pause();
      seek(c3.list, 0);
      const s4 = read();
      seek(c3.list, 60);
      const s5 = read();
      const animNames = [s1, s2, s3, s4, s5].map((s) => s.animationName);
      // finish deterministically so the post state is the contract's end state
      for (const a of [...all]) {
        try {
          a.finish();
        } catch {}
      }
      void getComputedStyle(panel).transform;
      const post = read();
      const cpSamples = [s1, s2, s3, s4, s5, post].map((s) => s.cp);
      obs.disconnect();
      return {
        error: null,
        caught: { c1: names(c1.list), c2: names(c2.list), c3: names(c3.list) },
        s1,
        s2,
        s3,
        s4,
        s5,
        post,
        animNames,
        cpSamples,
        retarget: {
          c2Transform: c2Transforms.length > 0,
          c3Transform: c3.list.some((a) => a.transitionProperty === "transform"),
        },
        cpOpen: open,
        cp,
        slide,
        records: records.length,
        identity: {
          panel: panel === document.querySelector(panelSel),
          collapse: collapse === find(collapseLabel),
          expand: expand === find(expandLabel),
        },
      };
    },
    { panelSel: P.sel, attr: P.attr, collapseLabel: P.collapse, expandLabel: P.expand, slide: P.slide, cp: P.cp, open: P.open },
  );
}

function checkRapid(P, r) {
  const G = `${P.id}/rapid`;
  check(G, "rapid toggle sequence ran", !!r && !r.error, r?.error ?? `transitions c1=${r?.caught.c1.length} c2=${r?.caught.c2.length} c3=${r?.caught.c3.length}`);
  if (!r || r.error) return;
  const bound = 0.2 * Math.abs(P.slide);
  check(G, "no DOM nodes added or removed (MutationObserver on .page ancestor)", r.records === 0, `records=${r.records}`);
  check(G, "panel and both controls are the same nodes after the sequence", r.identity.panel && r.identity.collapse && r.identity.expand, JSON.stringify(r.identity));
  check(G, 'animationName is "none" throughout', r.animNames.every((n) => n === "none"), r.animNames.join(","));
  check(G, "retarget keeps a transform transition (reversal, no missing animation)", r.retarget.c2Transform && r.retarget.c3Transform, JSON.stringify(r.retarget));

  check(G, "first retarget is mid-fold (not from rest, not finished)", Math.abs(r.s1.tx) > 5 && Math.abs(r.s1.tx) < Math.abs(P.slide) - 5, `t=100ms tx=${r.s1.tx.toFixed(1)}px`);
  check(G, "unfold continues from the fold's position (no restart-from-zero snap)", Math.abs(r.s2.tx - r.s1.tx) <= bound && Math.abs(r.s2.tx) > 5, `start=${r.s2.tx.toFixed(2)} vs ${r.s1.tx.toFixed(2)} (delta ${Math.abs(r.s2.tx - r.s1.tx).toFixed(2)} <= ${bound.toFixed(1)})`);
  check(G, "second retarget is mid-unfold (motion still in flight)", Math.abs(r.s3.tx) > 1 && Math.abs(r.s3.tx) < Math.abs(P.slide) - 1, `tx=${r.s3.tx.toFixed(1)}px (unfold transition ${r.caught.c2.find((n) => n.startsWith("transform")) ?? "?"})`);
  check(G, "fold continues from the unfold's position (no restart snap)", Math.abs(r.s4.tx - r.s3.tx) <= bound && Math.abs(r.s4.tx) > 1, `start=${r.s4.tx.toFixed(2)} vs ${r.s3.tx.toFixed(2)} (delta ${Math.abs(r.s4.tx - r.s3.tx).toFixed(2)} <= ${bound.toFixed(1)})`);
  check(G, "fold progresses from the retarget point", Math.abs(r.s5.tx) > Math.abs(r.s4.tx), `${r.s4.tx.toFixed(1)} -> ${r.s5.tx.toFixed(1)}`);

  check(G, `offsets hold through the toggle (${P.cp} only ${P.open} or 0px)`, r.cpSamples.every((v) => v === P.open || v === "0px"), r.cpSamples.join(","));
  check(G, "final state after the last trigger is folded", r.post.attrValue === "closed" && r.post.visibility === "hidden" && r.post.opacity <= 0.05 && Math.abs(Math.abs(r.post.tx) - Math.abs(P.slide)) < 2, `${r.post.data} ${r.post.tx} ${r.post.opacity}/${r.post.visibility}`);
  check(G, `settled offset is 0px`, r.post.cp === "0px", r.post.cp);
}

// ---------------------------------------------------------------------------
// Pass 3: focus / AT
// ---------------------------------------------------------------------------

async function tabUntil(page, label, max = 300) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((l) => (document.activeElement && document.activeElement.getAttribute("aria-label")) === l, label);
    if (hit) return i;
  }
  return -1;
}

async function focusPass(browser) {
  const { context, page } = await pageFor(browser, { width: 1440, height: 900 });
  try {
    const presses = await tabUntil(page, "Collapse Missions");
    check("focus", "real Tab presses reach the Collapse Missions button", presses > 0, `${presses} presses`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Expand Missions", null, { timeout: 5000 });
    const activeAfterFold = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
    check("focus", "after fold, focus is on the Expand Missions tab", activeAfterFold === "Expand Missions", `activeElement=${activeAfterFold}`);

    const folded = await page.evaluate(() => {
      const tab = document.querySelector('[aria-label="Expand Missions"]');
      const panel = document.querySelector("#missions-panel");
      const collapse = document.querySelector('[aria-label="Collapse Missions"]');
      return {
        tabInert: tab.inert,
        tabExposed: !tab.closest("[inert]"),
        panelInert: panel.inert,
        collapseInert: !!collapse.closest("[inert]"),
      };
    });
    check("focus", "folded: exactly one exposed control (tab live, collapse inert)", folded.tabInert === false && folded.tabExposed && folded.panelInert === true && folded.collapseInert === true, JSON.stringify(folded));

    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Collapse Missions", null, { timeout: 5000 });
    const activeAfterUnfold = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
    check("focus", "after unfold, focus is back on the Collapse Missions button", activeAfterUnfold === "Collapse Missions", `activeElement=${activeAfterUnfold}`);
    const open = await page.evaluate(() => {
      const tab = document.querySelector('[aria-label="Expand Missions"]');
      const collapse = document.querySelector('[aria-label="Collapse Missions"]');
      return { tabInert: tab.inert, tabInertAncestor: !!tab.closest("[inert]"), collapseInert: !!collapse.closest("[inert]") };
    });
    check("focus", "open: exactly one exposed control (collapse live, tab inert)", open.collapseInert === false && open.tabInert === true && open.tabInertAncestor === true, JSON.stringify(open));

    const presses2 = await tabUntil(page, "Collapse Settings");
    check("focus", "real Tab presses reach the Collapse Settings button", presses2 > 0, `${presses2} presses`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Expand Settings", null, { timeout: 5000 });
    const activeSettingsFold = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
    check("focus", "after Settings fold, focus is on the Expand Settings tab", activeSettingsFold === "Expand Settings", `activeElement=${activeSettingsFold}`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Collapse Settings", null, { timeout: 5000 });
    const activeSettingsUnfold = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
    check("focus", "after Settings unfold, focus is back on its collapse button", activeSettingsUnfold === "Collapse Settings", `activeElement=${activeSettingsUnfold}`);
  } catch (err) {
    check("focus", "focus pass completed", false, String(err).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Pass 4: offline smoke (H11)
// ---------------------------------------------------------------------------

async function offlinePass(browser) {
  const { context, page } = await pageFor(browser, { width: 1440, height: 900 });
  try {
    const offline = await page.evaluate(async () => {
      const yieldTask = () =>
        new Promise((r) => {
          const c = new MessageChannel();
          c.port1.onmessage = () => {
            c.port1.close();
            r();
          };
          c.port2.postMessage(0);
        });
      const pageEl = document.querySelector("[data-missions][data-settings]");
      window.dispatchEvent(new Event("offline"));
      for (let i = 0; i < 5000 && pageEl.getAttribute("data-network") !== "offline"; i++) await yieldTask();
      const display = (sel) => getComputedStyle(document.querySelector(sel)).display;
      const targets = [document.querySelector("#missions-panel"), document.querySelector("#settings-panel"), document.querySelector('[aria-label="Expand Missions"]'), document.querySelector('[aria-label="Expand Settings"]')];
      const running = document.getAnimations().filter((a) => a.effect && targets.includes(a.effect.target)).length;
      return {
        network: pageEl.getAttribute("data-network"),
        panels: [display("#missions-panel"), display("#settings-panel")],
        tabs: [display('[aria-label="Expand Missions"]'), display('[aria-label="Expand Settings"]')],
        running,
      };
    });
    check("offline", "offline state engages", offline.network === "offline", offline.network);
    check("offline", "panels and tabs are display:none while offline", offline.panels.every((d) => d === "none") && offline.tabs.every((d) => d === "none"), JSON.stringify(offline));
    check("offline", "no fold motion runs while offline", offline.running === 0, `animations=${offline.running}`);

    const restored = await page.evaluate(async () => {
      const yieldTask = () =>
        new Promise((r) => {
          const c = new MessageChannel();
          c.port1.onmessage = () => {
            c.port1.close();
            r();
          };
          c.port2.postMessage(0);
        });
      const pageEl = document.querySelector("[data-missions][data-settings]");
      window.dispatchEvent(new Event("online"));
      for (let i = 0; i < 5000 && pageEl.getAttribute("data-network") !== "online"; i++) await yieldTask();
      return { network: pageEl.getAttribute("data-network"), display: getComputedStyle(document.querySelector("#missions-panel")).display };
    });
    check("offline", "panels return online", restored.network === "online" && restored.display === "block", JSON.stringify(restored));
  } catch (err) {
    check("offline", "offline pass completed", false, String(err).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Pass 5: reduced motion (H2/H9)
// ---------------------------------------------------------------------------

async function reducedPass(browser) {
  const { context, page } = await pageFor(browser, { width: 1440, height: 900, reduced: true });
  try {
    const r = await page.evaluate(async ({ cp }) => {
      const yieldTask = () =>
        new Promise((r) => {
          const c = new MessageChannel();
          c.port1.onmessage = () => {
            c.port1.close();
            r();
          };
          c.port2.postMessage(0);
        });
      const pageEl = document.querySelector("[data-missions][data-settings]");
      const panel = document.querySelector("#missions-panel");
      const find = (label) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
      const collapse = find("Collapse Missions");
      const expand = find("Expand Missions");
      const decl = (el) => {
        const cs = getComputedStyle(el);
        return { property: cs.transitionProperty, duration: cs.transitionDuration, timing: cs.transitionTimingFunction, animationName: cs.animationName };
      };
      const openDecl = decl(panel);
      const isTarget = (a) => {
        const t = a.effect && a.effect.target;
        return t === panel || t === expand || t === pageEl;
      };
      const catchAnims = async () => {
        for (let i = 0; i < 20000; i++) {
          void getComputedStyle(panel).transform;
          const list = document.getAnimations().filter(isTarget);
          if (list.length && pageEl.getAttribute("data-missions") === "closed") return list;
          await yieldTask();
        }
        return [];
      };
      collapse.click();
      const anims = await catchAnims();
      const immediate = {
        w: getComputedStyle(pageEl).getPropertyValue(cp).trim(),
        delay: getComputedStyle(pageEl).getPropertyValue("--missions-delay").trim(),
        closedDecl: decl(panel),
        active: document.activeElement?.getAttribute("aria-label") ?? null,
        tabInert: expand.inert,
        tabVisibility: getComputedStyle(expand).visibility,
      };
      for (const a of anims) a.pause();
      const sample = (t) => {
        for (const a of anims) a.currentTime = t;
        void getComputedStyle(panel).transform;
        const cs = getComputedStyle(panel);
        return { t, transform: cs.transform, opacity: Number(cs.opacity), visibility: cs.visibility, animationName: cs.animationName };
      };
      const samples = [0, 40, 75, 120, 150].map(sample);
      for (const a of anims) {
        try {
          a.finish();
        } catch {}
      }
      // unfold half
      const catchUnfold = async () => {
        for (let i = 0; i < 20000; i++) {
          void getComputedStyle(panel).transform;
          const list = document.getAnimations().filter(isTarget);
          if (list.length && pageEl.getAttribute("data-missions") === "open") return list;
          await yieldTask();
        }
        return [];
      };
      expand.click();
      const anims2 = await catchUnfold();
      for (const a of anims2) a.pause();
      const sample2 = (t) => {
        for (const a of anims2) a.currentTime = t;
        void getComputedStyle(panel).transform;
        const cs = getComputedStyle(panel);
        return { t, transform: cs.transform, opacity: Number(cs.opacity), visibility: cs.visibility };
      };
      const samples2 = [0, 75, 150].map(sample2);
      for (const a of anims2) {
        try {
          a.finish();
        } catch {}
      }
      return {
        openDecl,
        immediate,
        samples,
        samples2,
        caughtFold: anims.length,
        caughtUnfold: anims2.length,
        foldNames: anims.map((a) => `${a.transitionProperty}:${Math.round(a.effect.getTiming().duration)}+${Math.round(a.effect.getTiming().delay)}`),
        unfoldNames: anims2.map((a) => `${a.transitionProperty}:${Math.round(a.effect.getTiming().duration)}+${Math.round(a.effect.getTiming().delay)}`),
        after: { transform: getComputedStyle(panel).transform, opacity: getComputedStyle(panel).opacity, w: getComputedStyle(pageEl).getPropertyValue(cp).trim() },
      };
    }, { cp: PANELS.missions.cp });
    const G = "reduced";
    check(G, "fold sampling caught the crossfade transitions", r.caughtFold > 0, `${r.caughtFold} transitions: ${r.foldNames.join(",")}`);
    check(G, "open computed transition is opacity 0.15s --ease-out + visibility only", norm(r.openDecl.property) === "opacity,visibility" && norm(r.openDecl.duration) === "0.15s,0s" && norm(r.openDecl.timing) === "cubic-bezier(0.22,1,0.36,1),linear", `${r.openDecl.property} @ ${r.openDecl.duration} ${r.openDecl.timing}`);
    check(G, "closed computed transition is the same 150ms crossfade", norm(r.immediate.closedDecl.duration) === "0.15s,0s", r.immediate.closedDecl.duration);
    check(G, "offsets settle at t=0 (no delayed jump after the fade)", r.immediate.w === "0px" && r.immediate.delay === "0s", `${PANELS.missions.cp}=${r.immediate.w}, delay=${r.immediate.delay}`);
    check(G, "transform is identity at every sample (no movement)", r.samples.every((s) => s.transform === "none"), r.samples.map((s) => `${s.t}:${s.transform}`).join(" "));
    const rops = r.samples.map((s) => s.opacity);
    check(G, "opacity crossfades (1 -> mid -> 0, monotonic --ease-out decay)", rops[0] === 1 && rops[4] <= 0.05 && rops.every((v, i) => i === 0 || v <= rops[i - 1]) && rops.some((v) => v > 0.05 && v < 0.95), r.samples.map((s) => `${s.t}:${s.opacity.toFixed(3)}`).join(" "));
    check(G, "visibility holds through the fade, hidden at its end", r.samples[2].visibility === "visible" && r.samples[4].visibility === "hidden", `${r.samples[2].visibility} -> ${r.samples[4].visibility}`);
    check(G, "appearing tab is focusable at commit", r.immediate.active === "Expand Missions" && r.immediate.tabInert === false && r.immediate.tabVisibility === "visible", `active=${r.immediate.active}, inert=${r.immediate.tabInert}, visibility=${r.immediate.tabVisibility}`);
    check(G, "unfold is also a 150ms crossfade with identity transform", r.samples2.every((s) => s.transform === "none") && r.samples2[0].opacity <= 0.05 && r.samples2[2].opacity === 1, r.samples2.map((s) => `${s.t}:${s.opacity.toFixed(3)}`).join(" "));
    check(G, "reduced fold ends folded and unfolded state restores", r.after.transform === "none" && r.after.opacity === "1" && r.after.w === PANELS.missions.open, `${r.after.transform} ${r.after.opacity} ${r.after.w}`);
  } catch (err) {
    check("reduced", "reduced-motion pass completed", false, String(err).split("\n")[0]);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Pass 6: recordings
// ---------------------------------------------------------------------------

async function recordMobile(browser) {
  const { context, page, video } = await pageFor(browser, { width: 375, height: 812, mobile: true, video: true, allowOffline: true });
  try {
    const hidden = await page.evaluate(() => ({
      collapse: [...document.querySelectorAll('[class*="collapse"]')].map((el) => getComputedStyle(el).display),
      tabs: [...document.querySelectorAll('[class*="edgeTab"]')].map((el) => getComputedStyle(el).display),
    }));
    check("video", "375: wide fold controls are absent", hidden.collapse.every((d) => d === "none") && hidden.tabs.every((d) => d === "none"), JSON.stringify(hidden));
    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Map" }).click();
    await waitForSettled(page, 'section[aria-label="Map"]', "open");
    const mapVisible = await page.locator('section[aria-label="Map"]').isVisible();
    await nav.getByRole("button", { name: "Settings" }).click();
    await waitForSettled(page, "#settings-panel", "open");
    const settingsVisible = await page.locator("#settings-panel").isVisible();
    await nav.getByRole("button", { name: "Missions" }).click();
    await waitForSettled(page, "#missions-panel", "open");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check("video", "375: view switch works and nothing overflows horizontally", mapVisible && settingsVisible && overflow, `map=${mapVisible} settings=${settingsVisible} overflowOk=${overflow}`);
    await drive(page, 300);
  } finally {
    await context.close().catch(() => {});
    await saveVideo(page, video, "375x812-touch.webm");
  }
}

async function recordMouse(browser) {
  const { context, page, video } = await pageFor(browser, { width: 1440, height: 900, video: true });
  try {
    const state = () =>
      page.evaluate(() => {
        const pageEl = document.querySelector("[data-missions][data-settings]");
        const cs = (sel) => getComputedStyle(document.querySelector(sel));
        return {
          missions: pageEl.getAttribute("data-missions"),
          settings: pageEl.getAttribute("data-settings"),
          missionsVisibility: cs("#missions-panel").visibility,
          settingsVisibility: cs("#settings-panel").visibility,
        };
      });
    await page.getByRole("button", { name: "Collapse Missions" }).click();
    await waitForSettled(page, "#missions-panel", "folded");
    const foldedM = await state();
    await page.getByRole("button", { name: "Expand Missions" }).click();
    await waitForSettled(page, "#missions-panel", "open");
    await page.getByRole("button", { name: "Collapse Settings" }).click();
    await waitForSettled(page, "#settings-panel", "folded");
    const foldedS = await state();
    await page.getByRole("button", { name: "Expand Settings" }).click();
    await waitForSettled(page, "#settings-panel", "open");
    // rapid toggle, folded into the same recording. Programmatic clicks: the
    // targets are mid-flight and moving, and a coordinate click can land on a
    // neighbour (the video has no OS cursor to preserve anyway).
    await page.evaluate(() => document.querySelector('[aria-label="Collapse Missions"]').click());
    await drive(page, 100);
    await page.evaluate(() => document.querySelector('[aria-label="Expand Missions"]').click());
    await drive(page, 150);
    await page.evaluate(() => document.querySelector('[aria-label="Collapse Missions"]').click());
    await waitForSettled(page, "#missions-panel", "folded");
    const rapidEnd = await state();
    await page.getByRole("button", { name: "Expand Missions" }).click();
    await waitForSettled(page, "#missions-panel", "open");
    const final = await state();
    check("video", "1440 mouse: both panels fold and unfold by click", foldedM.missions === "closed" && foldedM.missionsVisibility === "hidden" && foldedS.settings === "closed" && foldedS.settingsVisibility === "hidden" && final.missions === "open" && final.settings === "open", JSON.stringify({ foldedM, foldedS, final }));
    check("video", "1440 mouse: rapid toggle ends in the folded state", rapidEnd.missions === "closed" && rapidEnd.missionsVisibility === "hidden", JSON.stringify(rapidEnd));
    await drive(page, 300);
  } finally {
    await context.close().catch(() => {});
    await saveVideo(page, video, "1440x900-mouse.webm");
  }
}

async function recordKeyboard(browser) {
  const { context, page, video } = await pageFor(browser, { width: 1440, height: 900, video: true });
  try {
    const presses = await tabUntil(page, "Collapse Missions");
    await drive(page, 250);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Expand Missions", null, { timeout: 5000 });
    await waitForSettled(page, "#missions-panel", "folded");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Collapse Missions", null, { timeout: 5000 });
    await waitForSettled(page, "#missions-panel", "open");
    const presses2 = await tabUntil(page, "Collapse Settings");
    await drive(page, 250);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Expand Settings", null, { timeout: 5000 });
    await waitForSettled(page, "#settings-panel", "folded");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Collapse Settings", null, { timeout: 5000 });
    await waitForSettled(page, "#settings-panel", "open");
    const final = await page.evaluate(() => {
      const pageEl = document.querySelector("[data-missions][data-settings]");
      return { missions: pageEl.getAttribute("data-missions"), settings: pageEl.getAttribute("data-settings") };
    });
    check("video", "1440 keyboard: Tab+Enter folds and unfolds with the focus swap", presses > 0 && presses2 > 0 && final.missions === "open" && final.settings === "open", `presses=${presses}/${presses2} final=${JSON.stringify(final)}`);
  } finally {
    await context.close().catch(() => {});
    await saveVideo(page, video, "1440x900-keyboard.webm");
  }
}

async function recordReduced(browser) {
  const { context, page, video } = await pageFor(browser, { width: 1440, height: 900, reduced: true, video: true });
  try {
    await page.getByRole("button", { name: "Collapse Missions" }).click();
    await drive(page, 250);
    const mid = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector("#missions-panel"));
      return { transform: cs.transform, duration: cs.transitionDuration, property: cs.transitionProperty };
    });
    await page.getByRole("button", { name: "Expand Missions" }).click();
    await drive(page, 350);
    check("video", "1440 reduced: 150ms crossfade, no movement", norm(mid.duration) === "0.15s,0s" && mid.transform === "none" && norm(mid.property) === "opacity,visibility", JSON.stringify(mid));
    await drive(page, 200);
  } finally {
    await context.close().catch(() => {});
    await saveVideo(page, video, "1440x900-reduced-motion.webm");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// A thrown pass must not abort the run: it fails its group, the remaining
// passes (notably the recordings) still run, and contexts are closed in the
// pass's own finally so any started video flushes.
const firstLine = (err) => String(err).split("\n")[0];
async function guard(group, fn) {
  try {
    await fn();
  } catch (err) {
    check(group, "pass completed without an unhandled exception", false, firstLine(err));
  }
}

async function main() {
  console.log(`fold check: ${BASE} -> evidence dir ${OUT}`);
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    // Pass 1: fold/unfold assertions with consumer stability (both panels).
    await guard("pass 1", async () => {
      const { context, page } = await pageFor(browser, { width: 1440, height: 900 });
      try {
        const drawMode = await page.evaluate(async () => {
          const yieldTask = () =>
            new Promise((r) => {
              const c = new MessageChannel();
              c.port1.onmessage = () => {
                c.port1.close();
                r();
              };
              c.port2.postMessage(0);
            });
          const b = document.querySelector('[role="group"][aria-label="Map tools"] button[aria-label="Polygon"]');
          if (!b) return false;
          b.click();
          for (let i = 0; i < 5000; i++) {
            if (document.querySelector('[class*="drawPanel"]')) return true;
            await yieldTask();
          }
          return false;
        });
        check("fold/setup", "draw panel consumer present (draw mode active)", drawMode === true, String(drawMode));
        await runTogglePanel(page, PANELS.missions);
        await runTogglePanel(page, PANELS.settings);
      } finally {
        await context.close();
      }
    });

    // Pass 2: rapid toggle on both panels, final state 600ms after the last trigger.
    await guard("pass 2", async () => {
      const { context, page } = await pageFor(browser, { width: 1440, height: 900 });
      try {
        for (const P of [PANELS.missions, PANELS.settings]) {
          const r = await rapidToggle(page, P);
          checkRapid(P, r);
          await page.waitForTimeout(600);
          const final = await page.evaluate(
            ({ sel, cp, open, slide }) => {
              const pageEl = document.querySelector("[data-missions][data-settings]");
              const panel = document.querySelector(sel);
              const cs = getComputedStyle(panel);
              const tab = document.querySelector(`[aria-label="${sel === "#missions-panel" ? "Expand Missions" : "Expand Settings"}"]`);
              return {
                attr: sel === "#missions-panel" ? pageEl.getAttribute("data-missions") : pageEl.getAttribute("data-settings"),
                transform: cs.transform,
                opacity: cs.opacity,
                visibility: cs.visibility,
                cp: getComputedStyle(pageEl).getPropertyValue(cp).trim(),
                tabOpacity: Number(getComputedStyle(tab).opacity),
                tabVisibility: getComputedStyle(tab).visibility,
                rectCleared: sel === "#missions-panel" ? panel.getBoundingClientRect().right <= 0 : panel.getBoundingClientRect().left >= window.innerWidth,
                slide,
                open,
              };
            },
            { sel: P.sel, cp: P.cp, open: P.open, slide: P.slide },
          );
          check(`${P.id}/rapid`, "600ms after the last trigger the folded end state holds", final.attr === "closed" && final.visibility === "hidden" && Number(final.opacity) <= 0.05 && final.rectCleared && final.cp === "0px" && Math.abs(Math.abs(txOf(final.transform)) - Math.abs(P.slide)) < 2, JSON.stringify(final));
          check(`${P.id}/rapid`, "600ms after the last trigger the tab is back", final.tabVisibility === "visible" && final.tabOpacity >= 0.9, `tab ${final.tabOpacity}/${final.tabVisibility}`);
          // put the panel back so the next panel starts clean
          await page.evaluate((label) => document.querySelector(`[aria-label="${label}"]`).click(), P.expand);
          await page.evaluate(async () => {
            const yieldTask = () =>
              new Promise((r) => {
                const c = new MessageChannel();
                c.port1.onmessage = () => {
                  c.port1.close();
                  r();
                };
                c.port2.postMessage(0);
              });
            for (let i = 0; i < 20000; i++) {
              const el = document.querySelector("#missions-panel");
              const settings = document.querySelector("#settings-panel");
              if (getComputedStyle(el).transform === "none" && getComputedStyle(settings).transform === "none") return;
              await yieldTask();
            }
          });
        }
      } finally {
        await context.close();
      }
    });

    // Pass 3: focus / AT
    await guard("focus", () => focusPass(browser));

    // Pass 4: offline smoke
    await guard("offline", () => offlinePass(browser));

    // Pass 5: reduced motion
    await guard("reduced", () => reducedPass(browser));

    // Pass 6: recordings
    await guard("video", () => recordMobile(browser));
    await guard("video", () => recordMouse(browser));
    await guard("video", () => recordKeyboard(browser));
    await guard("video", () => recordReduced(browser));

    // Recordings land only in OUT; list them so the transcript carries proof.
    const files = fs.readdirSync(OUT).sort();
    for (const f of files) {
      console.log(`artifact: ${f} — ${fs.statSync(path.join(OUT, f)).size} bytes`);
    }
    check("video", "four named recordings exist in the temp dir", ["375x812-touch.webm", "1440x900-mouse.webm", "1440x900-keyboard.webm", "1440x900-reduced-motion.webm"].every((f) => files.includes(f)), files.join(","));
  } finally {
    await browser.close();
  }
  console.log(`evidence dir: ${OUT}`);
  console.log(failed ? "fold check: FAIL" : "fold check: all pass");
  process.exit(failed ? 1 : 0);
}

try {
  await main();
} catch (err) {
  check("harness", "no unhandled exception", false, String(err).split("\n")[0]);
  console.log(`evidence dir: ${OUT}`);
  console.log("fold check: FAIL");
  process.exit(1);
}
