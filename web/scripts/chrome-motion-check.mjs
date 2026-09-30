// UI-20 (ticket #257) evidence harness: the Grid/Orbit section fade, the
// drawing panel's fade-in plus held fade-out, the button hover ease, and the
// reduced-motion versions of all three. Each motion is driven, recorded and
// asserted at 1440x900 (mouse and keyboard), 375x812 (touch) and reduced
// motion; the script exits non-zero if any gating assertion fails.
//
// Prerequisites -- build and serve the app first:
//   cd web && npm run build && npm run start -- -p 3101
// One-time browser install on a clean machine (playwright-core ships no
// browser):
//   npx playwright-core install chromium
// Run:
//   SHOT_DIR=/tmp/ui20 npm run check:chrome-motion -- http://127.0.0.1:3101
// SHOT_DIR defaults to docs/ui-theme/screenshots/ui-20; the base URL argv
// defaults to http://127.0.0.1:3101. Recordings (.webm, one per motion per
// context) and stills land in SHOT_DIR; absolute paths are printed at the end.
//
// UI-29: the shape tools moved from Settings to the map toolbar, so Grid has no
// Settings section of its own any more: the Grid/Orbit swap fades the Orbit's
// Subject section in and out, and the map toolbar's bar fades the other tool
// set in. The Polygon probes below are the toolbar's Polygon button.
//
// Keyboard note: the Mission-type Segmented is role="radio" buttons with no
// arrow-key handler, so the keyboard path is Tab onto the Orbit radio and
// Enter/Space to activate it. Arrow keys are deliberately not exercised.
//
// Mid-flight opacity/brightness samples are logged, never gating: they are a
// best-effort read of a 120-150ms window that can be missed under load. The
// gate is the computed animation/transition state, the settled value, and --
// for every fade -- the animation's keyframe body read back through
// getAnimations()/effect.getKeyframes(): a declared animation-name alone would
// survive deleting the @keyframes rule, and getAnimations() only returns a
// CSSAnimation when the rule resolves. The exit hold is gated as a sequence:
// the panel stays connected while drawPanelOut runs, and its removal must not
// come before the animation could have finished (the finished promise when
// observed, else the animation's own declared duration) -- never against a
// tight wall-clock bound, which is scheduler-dependent and flaky under load.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "./lib/harness.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.resolve(
  process.env.SHOT_DIR ?? path.join(HERE, "../../docs/ui-theme/screenshots/ui-20"),
);
fs.mkdirSync(SHOT_DIR, { recursive: true });
const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ui20-video-"));
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
/** Split a computed style list on its top-level commas only, so the commas
 *  inside a cubic-bezier() survive. */
const splitList = (s) => s.split(/,(?![^(]*\))/).map((x) => x.trim());

let failed = false;
let passed = 0;
function check(motion, name, cond, detail = "") {
  const line = `${cond ? "PASS" : "FAIL"} ${motion}/${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (cond) passed += 1;
  else failed = true;
}

// ---------------------------------------------------------------------------
// Page setup. The passphrase key and the /api/missions stub are duplicated
// from motion-check.mjs, which imports the app's own libs; this harness is
// plain node and must not. The stub answers with an empty Mission list.
// ---------------------------------------------------------------------------
async function open(browser, { width, height, mobile = false, reduced = false, video = null }) {
  const contextOptions = {
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: reduced ? "reduce" : "no-preference",
  };
  if (video) contextOptions.recordVideo = { dir: VIDEO_DIR, size: { width, height } };
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        if (url.includes("/api/missions")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                missions: [],
                archived_count: 0,
                stale_cards: [],
                host: { notice: null, drift: null },
                unreadable: [],
                now: Date.now(),
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return orig(input, init);
      };
    },
    { key: PASSPHRASE_KEY, value: "evidence" },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  // The empty-list line only renders once the stub has answered and the
  // passphrase gate has stepped aside.
  await page.getByText(/No Missions in the store yet/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(250);
  return { context, page };
}

async function finish(context, page, name) {
  const video = page.video();
  await context.close();
  if (!video) return;
  const target = path.join(SHOT_DIR, `${name}.webm`);
  await video.saveAs(target);
  const size = fs.statSync(target).size;
  check("video", `${name}.webm non-empty`, size > 1500, `${size} bytes`);
}

const still = (page, name) => page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });

// ---------------------------------------------------------------------------
// Concurrent rAF sampler. Started BEFORE the trigger (never awaited until the
// window elapses) so reads land inside the animation; the values are logged
// and never gate. `kind` picks the probed node: a section title, "draw" for
// the drawing panel, "polygon" for the map toolbar's Polygon button.
// ---------------------------------------------------------------------------
function sampleStyle(page, kind, ms) {
  return page.evaluate(
    ({ kind, ms }) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const find = () => {
          if (kind === "draw") return document.querySelector('[class*="drawPanel"]');
          if (kind === "polygon")
            return document.querySelector('[role="group"][aria-label="Map tools"] button[aria-label="Polygon"]');
          return [...document.querySelectorAll("#settings-panel section")].find((el) =>
            (el.querySelector("h2")?.textContent ?? "").startsWith(kind),
          );
        };
        const tick = () => {
          const el = find();
          const t = Math.round(performance.now() - t0);
          if (el) {
            const cs = getComputedStyle(el);
            out.push({ t, opacity: cs.opacity, filter: cs.filter });
          } else {
            out.push({ t, opacity: null, filter: null });
          }
          if (performance.now() - t0 >= ms) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { kind, ms },
  );
}

function logSamples(motion, samples, field) {
  const seen = samples.filter((s) => s[field] !== null).map((s) => `${s.t}ms:${s[field]}`);
  console.log(
    `SAMPLE ${motion} ${field}: ${seen.length ? seen.join(" ") : "(no sample landed mid-flight)"}`,
  );
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------
const readSection = (page, title) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("#settings-panel section")].find((s) =>
      (s.querySelector("h2")?.textContent ?? "").startsWith(t),
    );
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      animationName: cs.animationName,
      duration: cs.animationDuration,
      timing: cs.animationTimingFunction,
      opacity: cs.opacity,
    };
  }, title);

/** The map toolbar's Polygon button (a button with aria-pressed, UI-29). */
const polygonTool = (page) =>
  page.locator('[role="group"][aria-label="Map tools"]').getByRole("button", { name: "Polygon", exact: true });

const readDraw = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[class*="drawPanel"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      animationName: cs.animationName,
      duration: cs.animationDuration,
      timing: cs.animationTimingFunction,
      pointerEvents: cs.pointerEvents,
      opacity: cs.opacity,
      sameAsMarked: el === (window.__motion?.drawNode ?? null),
      connected: el.isConnected,
    };
  });

const markDraw = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[class*="drawPanel"]');
    if (!el) throw new Error("draw panel not found to mark");
    el.__motionMark = "draw";
    window.__motion = window.__motion ?? {};
    window.__motion.drawNode = el;
  });

async function markSection(page, title, slot) {
  await page.evaluate(
    ({ title, slot }) => {
      const el = [...document.querySelectorAll("#settings-panel section")].find((s) =>
        (s.querySelector("h2")?.textContent ?? "").startsWith(title),
      );
      if (!el) throw new Error(`section ${title} not found`);
      el.__motionMark = slot;
      window.__motion = window.__motion ?? {};
      window.__motion[slot] = el;
    },
    { title, slot },
  );
}

const sectionProbe = (page) =>
  page.evaluate(() => {
    const byTitle = (t) =>
      [...document.querySelectorAll("#settings-panel section")].find((s) =>
        (s.querySelector("h2")?.textContent ?? "").startsWith(t),
      );
    const takeoff = byTitle("Take-off");
    const out = { takeoffSame: takeoff != null && takeoff === (window.__motion?.takeoff ?? null) };
    for (const slot of ["area", "subject", "takeoff"]) {
      const el = window.__motion?.[slot];
      if (el && el.nodeType === 1) out[slot] = { connected: el.isConnected, mark: el.__motionMark ?? null };
    }
    return out;
  });

/** The new section is a fresh node, the old one disconnected, the animation
 *  is sectionIn at --dur-fast/--ease-out, and it settles opaque. */
async function assertSectionEntrance(page, motion, title, label) {
  const sec = await readSection(page, title);
  if (!sec) {
    check(motion, `${label}: ${title} section present`, false, "not found");
    return;
  }
  check(motion, `${label}: ${title} animation is sectionIn`, /sectionIn$/.test(sec.animationName), sec.animationName);
  check(motion, `${label}: animation duration 0.15s`, sec.duration === "0.15s", sec.duration);
  check(motion, `${label}: easing is --ease-out`, sec.timing === EASE_OUT, sec.timing);
  await page.waitForTimeout(250);
  const settled = await readSection(page, title);
  check(motion, `${label}: settled opacity 1`, settled?.opacity === "1", settled?.opacity ?? "missing");
}

// ---------------------------------------------------------------------------
// Motion 1: Grid <-> Orbit section remount (mouse, keyboard, touch)
// ---------------------------------------------------------------------------
async function gridOrbitMouse(browser) {
  const motion = "grid-orbit";
  const { context, page } = await open(browser, { width: 1440, height: 900, video: true });
  try {
    await markSection(page, "Take-off", "takeoff");

    const sampler = sampleStyle(page, "Subject", 260);
    const subjectFrames = captureEntranceKeyframes(page, "Subject", "sectionIn");
    const toolsFrames = captureEntranceKeyframes(page, "tools", "barIn");
    await page.getByRole("radio", { name: "Orbit", exact: true }).click();
    keyframeCheck(motion, "Grid->Orbit mouse: sectionIn keyframe body starts at opacity 0", await subjectFrames, "start");
    keyframeCheck(motion, "Grid->Orbit mouse: the map toolbar's barIn keyframe body starts at opacity 0", await toolsFrames, "start");
    await page.waitForTimeout(70);
    await still(page, "grid-orbit-1440-mouse-mid");
    logSamples(motion, await sampler, "opacity");
    await assertSectionEntrance(page, motion, "Subject", "Grid->Orbit mouse");
    const probe = await sectionProbe(page);
    check(motion, "Grid->Orbit: Take-off keeps node identity", probe.takeoffSame === true, JSON.stringify(probe));

    await markSection(page, "Subject", "subject");
    const toolsFrames2 = captureEntranceKeyframes(page, "tools", "barIn");
    await page.getByRole("radio", { name: "Grid", exact: true }).click();
    keyframeCheck(motion, "Orbit->Grid mouse: the map toolbar's barIn keyframe body starts at opacity 0", await toolsFrames2, "start");
    await page.waitForTimeout(70);
    await still(page, "grid-orbit-1440-mouse-reverse-mid");
    const probe2 = await sectionProbe(page);
    check(motion, "Orbit->Grid: old Subject node was marked and is disconnected", probe2.subject?.connected === false && probe2.subject?.mark === "subject", JSON.stringify(probe2.subject));
    check(motion, "Orbit->Grid: Take-off keeps node identity", probe2.takeoffSame === true, JSON.stringify(probe2));
  } finally {
    await finish(context, page, "grid-orbit-1440-mouse");
  }
}

async function gridOrbitKeyboard(browser) {
  const motion = "grid-orbit-keyboard";
  const { context, page } = await open(browser, { width: 1440, height: 900, video: true });
  try {
    await markSection(page, "Take-off", "takeoff");

    let tabs = 0;
    let focused = "";
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
      if (focused === "Orbit") {
        tabs = i + 1;
        break;
      }
    }
    check(motion, "Tab reaches the Orbit radio", focused === "Orbit", `${tabs} tabs, focused "${focused}"`);

    const sampler = sampleStyle(page, "Subject", 260);
    const subjectFrames = captureEntranceKeyframes(page, "Subject", "sectionIn");
    await page.keyboard.press("Enter");
    keyframeCheck(motion, "Enter: sectionIn keyframe body starts at opacity 0", await subjectFrames, "start");
    await page.waitForTimeout(70);
    await still(page, "grid-orbit-1440-keyboard-mid");
    logSamples(motion, await sampler, "opacity");
    await assertSectionEntrance(page, motion, "Subject", "Enter");
    const probe = await sectionProbe(page);
    check(motion, "Enter: Take-off keeps node identity", probe.takeoffSame === true, JSON.stringify(probe));

    await page.keyboard.press("Shift+Tab");
    const back = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    check(motion, "Shift+Tab lands back on Grid", back === "Grid", `focused "${back}"`);

    await markSection(page, "Subject", "subject");
    await page.keyboard.press("Space");
    await page.waitForTimeout(70);
    await still(page, "grid-orbit-1440-keyboard-reverse-mid");
    const probe2 = await sectionProbe(page);
    check(motion, "Space: old Subject node disconnected", probe2.subject?.connected === false, JSON.stringify(probe2.subject));
    check(motion, "Space: Take-off keeps node identity", probe2.takeoffSame === true, JSON.stringify(probe2));
  } finally {
    await finish(context, page, "grid-orbit-1440-keyboard");
  }
}

async function gridOrbitTouch(browser) {
  const motion = "grid-orbit-touch";
  const { context, page } = await open(browser, { width: 375, height: 812, mobile: true, video: true });
  try {
    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Settings" }).tap();
    await page.waitForTimeout(450);
    await markSection(page, "Take-off", "takeoff");

    const sampler = sampleStyle(page, "Subject", 260);
    const subjectFrames = captureEntranceKeyframes(page, "Subject", "sectionIn");
    await page.getByRole("radio", { name: "Orbit", exact: true }).tap();
    keyframeCheck(motion, "Settings tap: sectionIn keyframe body starts at opacity 0", await subjectFrames, "start");
    await page.waitForTimeout(70);
    await still(page, "grid-orbit-375-touch-mid");
    logSamples(motion, await sampler, "opacity");
    await assertSectionEntrance(page, motion, "Subject", "Settings tap");
    const probe = await sectionProbe(page);
    check(motion, "tap: Take-off keeps node identity", probe.takeoffSame === true, JSON.stringify(probe));
  } finally {
    await finish(context, page, "grid-orbit-375-touch");
  }
}

// ---------------------------------------------------------------------------
// Motion 2: drawing panel fade in / held fade out (mouse, touch, Cancel path)
// ---------------------------------------------------------------------------
/** Poll from before the close is triggered until the first frame with
 *  drawPanelOut on screen, and return that frame's computed style. Pre-armed
 *  so the 160ms hold can never be missed by roundtrip latency. */
function captureClosingStyle(page, ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector('[class*="drawPanel"]');
          if (el) {
            const cs = getComputedStyle(el);
            if (/drawPanelOut$/.test(cs.animationName)) {
              // Same-frame keyframe-body read (F1): computed animation-name is
              // still the declared identifier if @keyframes is deleted, but
              // getAnimations() only lists the CSSAnimation when it resolves.
              const anim =
                el.getAnimations().find((a) => a.animationName?.endsWith("drawPanelOut")) ?? null;
              const frames = anim ? anim.effect.getKeyframes() : [];
              const end = frames.find((k) => (k.offset ?? k.computedOffset) === 1)?.opacity ?? null;
              return resolve({
                animationName: cs.animationName,
                duration: cs.animationDuration,
                timing: cs.animationTimingFunction,
                pointerEvents: cs.pointerEvents,
                opacity: cs.opacity,
                sameAsMarked: el === (window.__motion?.drawNode ?? null),
                connected: el.isConnected,
                keyframes: {
                  found: anim != null,
                  name: anim?.animationName ?? null,
                  frames: frames.length,
                  end,
                },
              });
            }
          }
          if (performance.now() - t0 >= ms) return resolve(null);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

// ---------------------------------------------------------------------------
// Keyframe-body gates (F1). Computed animation-name only proves the declared
// identifier and survives deleting the @keyframes rule; getAnimations() on the
// element returns a CSSAnimation only when that rule resolves, and
// effect.getKeyframes() exposes its body. The probe is pre-armed before the
// trigger and detects the DOM mutation with a MutationObserver, then reads the
// animation in that microtask -- before any frame runs, so the 120-150ms
// animation cannot finish first and screenshot load cannot starve the read
// (rAF polling is not used here for exactly that reason). Deterministic: the
// run fails if no matching CSSAnimation shows up before the window closes.
// ---------------------------------------------------------------------------
const KEYFRAME_WINDOW_MS = 3000;
/** In-page: observe until a CSSAnimation named `expected` is on the target
 *  node (`kind` is a section title or "draw"), and return the body's edge
 *  opacities. {found:false} if no such animation appears within the window. */
function captureEntranceKeyframes(page, kind, expected, ms = KEYFRAME_WINDOW_MS) {
  return page.evaluate(
    ({ kind, expected, ms }) =>
      new Promise((resolve) => {
        const find = () =>
          kind === "draw"
            ? document.querySelector('[class*="drawPanel"]')
            : kind === "tools"
              ? document.querySelector('[role="group"][aria-label="Map tools"]')
              : [...document.querySelectorAll("#settings-panel section")].find((s) =>
                  (s.querySelector("h2")?.textContent ?? "").startsWith(kind),
                );
        const probe = () => {
          const el = find();
          if (!el) return null;
          const anim = (el.getAnimations?.() ?? []).find((a) => a.animationName?.endsWith(expected));
          if (!anim) return null;
          const frames = anim.effect.getKeyframes();
          const edge = (offset) =>
            frames.find((k) => (k.offset ?? k.computedOffset) === offset)?.opacity ?? null;
          return { found: true, name: anim.animationName, frames: frames.length, start: edge(0), end: edge(1) };
        };
        const initial = probe();
        if (initial) return resolve(initial);
        const obs = new MutationObserver(() => {
          const hit = probe();
          if (hit) {
            obs.disconnect();
            clearTimeout(guard);
            resolve(hit);
          }
        });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        const guard = setTimeout(() => {
          obs.disconnect();
          resolve({ found: false });
        }, ms);
      }),
    { kind, expected, ms },
  );
}

/** Gate a captureEntranceKeyframes result: the animation must exist (so the
 *  @keyframes rule resolves) and its `edge` frame must be opacity 0. */
function keyframeCheck(motion, name, probe, edge) {
  const op = probe?.found ? (edge === "start" ? probe.start : probe.end) : null;
  check(
    motion,
    name,
    probe?.found === true && String(op) === "0",
    probe?.found
      ? `${probe.name} ${edge} opacity "${op}" (${probe.frames} frames)`
      : `no CSSAnimation within ${KEYFRAME_WINDOW_MS}ms (@keyframes missing or never applied)`,
  );
}

function closingStateCheck(motion, label, exit) {
  if (!exit) {
    check(motion, `${label}: panel still in the DOM while closing`, false, "no closing frame captured");
    return;
  }
  check(motion, `${label}: closing animation is drawPanelOut`, /drawPanelOut$/.test(exit.animationName), exit.animationName);
  check(motion, `${label}: closing duration 0.12s`, exit.duration === "0.12s", exit.duration);
  check(motion, `${label}: closing easing is --ease-in`, exit.timing === EASE_IN, exit.timing);
  check(motion, `${label}: pointer-events none while closing`, exit.pointerEvents === "none", exit.pointerEvents);
  check(motion, `${label}: same DOM node held through the exit`, exit.sameAsMarked === true && exit.connected === true, JSON.stringify(exit));
  keyframeCheck(motion, `${label}: drawPanelOut keyframe body ends at opacity 0`, exit.keyframes, "end");
}

/** The whole detach sequence must land inside this window. Deliberately
 *  generous and jitter-proof: the hold itself is 160ms, but the window only
 *  fails a panel that never detaches or an animation that never finishes. */
const DETACH_WINDOW_MS = 3000;

/** Pre-armed before the close is triggered: resolves the exit sequence state
 *  for the panel. A MutationObserver (its callbacks fire even while this
 *  harness's own screenshots starve the frame loop) records the
 *  `drawPanelClosing` class mutation (the trigger) and the node's removal; the
 *  exit CSSAnimation is watched via getAnimations() to `finished`, with a
 *  timer poll as backup, and its own endTime is recorded. State: `early` means
 *  the panel left the DOM before drawPanelOut could have finished -- the
 *  finish promise was not observed before the removal and the removal came
 *  before the animation's declared duration elapsed. A starved frame loop can
 *  hide the finish while the hold timer still fires; load only ever delays
 *  the removal, so the duration fallback cannot flake under it. `detachAt ==
 *  null` after the window means the panel never detached (stuck ghost);
 *  `detachMs` is measured from the trigger (or arming) and never gates. */
function waitDetached(page, ms = DETACH_WINDOW_MS) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const panel = () => document.querySelector('[class*="drawPanel"]');
        const state = {
          triggerAt: null,
          finishAt: null,
          detachAt: null,
          detachMs: null,
          animationSeen: false,
          animMs: null,
          connectedAtFinish: null,
          fromTrigger: false,
          early: false,
          timedOut: false,
        };
        const t0 = performance.now();
        if (!panel()) return resolve({ ...state, early: true });
        let watched = null;
        let obs = null;
        let guard = null;
        let poll = null;
        const done = () => {
          obs?.disconnect();
          clearTimeout(guard);
          clearInterval(poll);
          resolve(state);
        };
        const onFinish = () => {
          if (state.finishAt != null || state.detachAt != null) return;
          state.finishAt = performance.now();
          const el = panel();
          state.connectedAtFinish = el != null && el.isConnected;
          if (!el) done();
        };
        const watch = () => {
          const el = panel();
          if (!el || watched) return;
          const anim = (el.getAnimations?.() ?? []).find((a) => a.animationName?.endsWith("drawPanelOut"));
          if (!anim) return;
          watched = anim;
          state.animationSeen = true;
          state.animMs = Math.round(anim.effect.getComputedTiming().endTime);
          anim.finished.then(onFinish, onFinish);
        };
        const noteDetach = () => {
          if (state.detachAt != null) return;
          state.detachAt = performance.now();
          const elapsed = state.detachAt - (state.triggerAt ?? t0);
          state.detachMs = Math.round(elapsed);
          // Strong gate: the finish was observed while the node was connected.
          // Fallback when the frame loop starved that observation: the removal
          // must still have come after the exit animation's own duration, so
          // it could have run to completion. Load only delays the removal.
          state.early =
            state.finishAt == null &&
            (state.animMs == null || state.triggerAt == null || elapsed < state.animMs);
          done();
        };
        obs = new MutationObserver(() => {
          if (state.triggerAt == null) {
            const el = panel();
            if (el && /drawPanelClosing/.test(el.className)) {
              state.triggerAt = performance.now();
              state.fromTrigger = true;
            }
          }
          if (panel()) watch();
          else noteDetach();
        });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        poll = setInterval(() => {
          if (panel()) watch();
          else noteDetach();
        }, 50);
        guard = setTimeout(() => {
          state.timedOut = true;
          done();
        }, ms);
        watch();
      }),
    ms,
  );
}

/** Gate the exit hold as a sequence, never as a tight wall-clock bound: the
 *  panel must have been connected while drawPanelOut ran and removed only
 *  after it could have finished, within the generous window. FAIL covers
 *  removal before the animation could finish (too early) and a node that
 *  never detaches (stuck ghost). The measured ms is printed, never gated. */
function detachCheck(motion, label, r) {
  const ok = r != null && r.early === false && r.detachAt != null && r.connectedAtFinish !== false;
  let detail;
  if (r == null) detail = "detach probe never resolved";
  else if (r.detachAt == null)
    detail = `still connected ${DETACH_WINDOW_MS}ms after arming (stuck ghost)${r.animationSeen ? "" : "; no drawPanelOut CSSAnimation observed"}`;
  else {
    detail = `detached after ${r.detachMs}ms${r.fromTrigger ? " (from the close trigger)" : " (from arming; trigger not seen)"}`;
    if (r.early)
      detail += r.animationSeen
        ? `, before drawPanelOut could finish (${r.animMs}ms duration)`
        : "; no drawPanelOut CSSAnimation observed while connected";
    else if (r.finishAt != null) detail += "; drawPanelOut reached finished while connected";
    else detail += `; drawPanelOut finish not observed (starved frame loop), held past its ${r.animMs}ms duration`;
    if (r.connectedAtFinish === false) detail += "; node not connected at animation finish";
  }
  check(motion, `${label}: panel held through drawPanelOut, then detached`, ok, detail);
}

async function drawMouse(browser) {
  const motion = "draw";
  const { context, page } = await open(browser, { width: 1440, height: 900, video: true });
  try {
    const poly = polygonTool(page);
    const sampler = sampleStyle(page, "draw", 260);
    const openFrames = captureEntranceKeyframes(page, "draw", "drawPanelIn");
    await poly.click();
    keyframeCheck(motion, "open: drawPanelIn keyframe body starts at opacity 0", await openFrames, "start");
    await page.waitForTimeout(70);
    await still(page, "draw-1440-mouse-mid");
    logSamples(motion, await sampler, "opacity");

    const live = await readDraw(page);
    check(motion, "open: panel animation is drawPanelIn", /drawPanelIn$/.test(live?.animationName ?? ""), live?.animationName ?? "missing");
    check(motion, "open: duration 0.15s", live?.duration === "0.15s", live?.duration ?? "missing");
    check(motion, "open: easing is --ease-out", live?.timing === EASE_OUT, live?.timing ?? "missing");
    await page.waitForTimeout(220);
    const settled = await readDraw(page);
    check(motion, "open: settled opacity 1", settled?.opacity === "1", settled?.opacity ?? "missing");

    await markDraw(page);
    const exitSampler = sampleStyle(page, "draw", 240);
    const escapeCapture = captureClosingStyle(page, 500);
    const escapeDetach = waitDetached(page);
    await page.keyboard.press("Escape");
    closingStateCheck(motion, "Escape", await escapeCapture);
    // Detach is measured before the exit still: a screenshot's forced frame
    // stalls the renderer's timers under load, which would inflate the hold.
    detachCheck(motion, "Escape", await escapeDetach);
    await page.waitForTimeout(60);
    await still(page, "draw-1440-mouse-exit");
    logSamples(motion, await exitSampler, "opacity");

    // The click path: start again and close via the panel's Cancel button.
    const reopenFrames = captureEntranceKeyframes(page, "draw", "drawPanelIn");
    await poly.click();
    keyframeCheck(motion, "open (Cancel path): drawPanelIn keyframe body starts at opacity 0", await reopenFrames, "start");
    await page.waitForTimeout(220);
    await markDraw(page);
    const cancel = page.locator('[class*="drawPanel"]').getByRole("button", { name: "Cancel" });
    const cancelCapture = captureClosingStyle(page, 500);
    const cancelDetach = waitDetached(page);
    await cancel.click();
    closingStateCheck(motion, "Cancel click", await cancelCapture);
    const cancelMs = await cancelDetach;
    detachCheck(motion, "Cancel click", cancelMs);
  } finally {
    await finish(context, page, "draw-1440-mouse");
  }
}

async function drawTouch(browser) {
  const motion = "draw-touch";
  const { context, page } = await open(browser, { width: 375, height: 812, mobile: true, video: true });
  try {
    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Map" }).tap();
    await page.waitForTimeout(450);
    const poly = polygonTool(page);
    const sampler = sampleStyle(page, "draw", 260);
    const openFrames = captureEntranceKeyframes(page, "draw", "drawPanelIn");
    await poly.tap();
    keyframeCheck(motion, "open: drawPanelIn keyframe body starts at opacity 0", await openFrames, "start");
    const live = await readDraw(page);
    check(motion, "open: panel animation is drawPanelIn", /drawPanelIn$/.test(live?.animationName ?? ""), live?.animationName ?? "missing");
    check(motion, "open: duration 0.15s", live?.duration === "0.15s", live?.duration ?? "missing");
    check(motion, "open: easing is --ease-out", live?.timing === EASE_OUT, live?.timing ?? "missing");

    logSamples(motion, await sampler, "opacity");
    await page.waitForTimeout(450);
    await still(page, "draw-375-touch-mid");
    await page.waitForTimeout(220);
    const settled = await readDraw(page);
    check(motion, "open: settled opacity 1", settled?.opacity === "1", settled?.opacity ?? "missing");

    await markDraw(page);
    const exitSampler = sampleStyle(page, "draw", 240);
    const cancelCapture = captureClosingStyle(page, 500);
    const cancelDetach = waitDetached(page);
    await page.locator('[class*="drawPanel"]').getByRole("button", { name: "Cancel" }).tap();
    closingStateCheck(motion, "Cancel tap", await cancelCapture);
    detachCheck(motion, "Cancel tap", await cancelDetach);
    await page.waitForTimeout(60);
    await still(page, "draw-375-touch-exit");
    logSamples(motion, await exitSampler, "opacity");
  } finally {
    await finish(context, page, "draw-375-touch");
  }
}

// ---------------------------------------------------------------------------
// Motion 3: hover ease (mouse) and nothing on touch
// ---------------------------------------------------------------------------
async function hoverMouse(browser) {
  const motion = "hover";
  const { context, page } = await open(browser, { width: 1440, height: 900, video: true });
  try {
    const poly = polygonTool(page);
    const rest = await poly.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        filter: cs.filter,
        props: cs.transitionProperty,
        durations: cs.transitionDuration,
        timings: cs.transitionTimingFunction,
      };
    });
    const props = splitList(rest.props);
    const durations = splitList(rest.durations);
    const timings = splitList(rest.timings);
    check(motion, "rest filter is none before hover", rest.filter === "none", rest.filter ?? "missing");
    for (const prop of ["transform", "filter"]) {
      const i = props.indexOf(prop);
      check(motion, `transition-property includes ${prop}`, i >= 0, props.join(", "));
      check(motion, `${prop} duration 0.12s`, i >= 0 && durations[i] === "0.12s", durations.join(", "));
      check(motion, `${prop} easing is --ease-out`, i >= 0 && timings[i] === EASE_OUT, timings.join(" | "));
    }

    const sampler = sampleStyle(page, "polygon", 240);
    await poly.hover();
    await page.waitForTimeout(70);
    await still(page, "hover-1440-mouse-mid");
    logSamples(motion, await sampler, "filter");
    await page.waitForTimeout(150);
    const settled = await poly.evaluate((el) => getComputedStyle(el).filter);
    check(motion, "hovered filter settles at brightness(1.04)", settled === "brightness(1.04)", settled ?? "missing");
  } finally {
    await finish(context, page, "hover-1440-mouse");
  }
}

async function hoverTouch(browser) {
  const motion = "hover-touch";
  const { context, page } = await open(browser, { width: 375, height: 812, mobile: true, video: true });
  try {
    const hoverCapable = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
    check(motion, "touch context: hover/pointer-fine media query is false", hoverCapable === false, String(hoverCapable));

    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Map" }).tap();
    await page.waitForTimeout(450);
    const poly = polygonTool(page);
    const sampler = sampleStyle(page, "polygon", 220);
    await poly.tap();
    const samples = await sampler;
    logSamples(motion, samples, "filter");
    const filters = samples.filter((s) => s.filter !== null).map((s) => s.filter);
    check(motion, "tap leaves filter none for ~200ms", filters.length > 0 && filters.every((f) => f === "none"), filters.join(", ") || "(no sample)");
    await page.waitForTimeout(60);
    await still(page, "hover-375-touch-mid");
  } finally {
    await finish(context, page, "hover-375-touch");
  }
}

// ---------------------------------------------------------------------------
// Reduced motion at 1440: final states, the draw panel's 150ms crossfade, and
// instant hover.
// ---------------------------------------------------------------------------
async function reducedGridOrbit(browser) {
  const motion = "reduced-grid-orbit";
  const { context, page } = await open(browser, { width: 1440, height: 900, reduced: true, video: true });
  try {
    await page.getByRole("radio", { name: "Orbit", exact: true }).click();
    const sec = await readSection(page, "Subject");
    check(motion, "switch shows the final state (no animation)", sec?.animationName === "none", sec?.animationName ?? "missing");
    check(motion, "opacity is 1 immediately", sec?.opacity === "1", sec?.opacity ?? "missing");
    await page.waitForTimeout(70);
    await still(page, "reduced-1440-grid-orbit-mid");
    const settled = await readSection(page, "Subject");
    check(motion, "settled opacity stays 1", settled?.opacity === "1", settled?.opacity ?? "missing");
  } finally {
    await finish(context, page, "reduced-1440-grid-orbit");
  }
}

async function reducedDraw(browser) {
  const motion = "reduced-draw";
  const { context, page } = await open(browser, { width: 1440, height: 900, reduced: true, video: true });
  try {
    const poly = polygonTool(page);
    const openFrames = captureEntranceKeyframes(page, "draw", "drawPanelIn");
    await poly.click();
    keyframeCheck(motion, "open: drawPanelIn keyframe body starts at opacity 0", await openFrames, "start");
    const live = await readDraw(page);
    check(motion, "open: drawPanelIn crossfade kept", /drawPanelIn$/.test(live?.animationName ?? ""), live?.animationName ?? "missing");
    check(motion, "open: crossfade duration 0.15s", live?.duration === "0.15s", live?.duration ?? "missing");
    check(motion, "open: crossfade easing is --ease-out", live?.timing === EASE_OUT, live?.timing ?? "missing");
    await page.waitForTimeout(70);
    await still(page, "reduced-1440-draw-mid");

    await markDraw(page);
    const capture = captureClosingStyle(page, 500);
    const detach = waitDetached(page);
    await page.keyboard.press("Escape");
    const exit = await capture;
    check(motion, "close: drawPanelOut crossfade kept", /drawPanelOut$/.test(exit?.animationName ?? ""), exit?.animationName ?? "missing");
    check(motion, "close: crossfade duration 0.15s", exit?.duration === "0.15s", exit?.duration ?? "missing");
    check(motion, "close: same DOM node held through the exit", exit?.sameAsMarked === true && exit?.connected === true, JSON.stringify(exit));
    keyframeCheck(motion, "close: drawPanelOut keyframe body ends at opacity 0", exit?.keyframes, "end");
    detachCheck(motion, "close", await detach);
    await page.waitForTimeout(60);
    await still(page, "reduced-1440-draw-exit");
  } finally {
    await finish(context, page, "reduced-1440-draw");
  }
}

async function reducedHover(browser) {
  const motion = "reduced-hover";
  const { context, page } = await open(browser, { width: 1440, height: 900, reduced: true, video: true });
  try {
    const poly = polygonTool(page);
    const duration = await poly.evaluate((el) => getComputedStyle(el).transitionDuration);
    check(motion, "hover transition is instant (duration 0s)", duration.split(",").every((d) => d.trim() === "0s"), duration);
    await poly.hover();
    await page.waitForTimeout(40);
    const filter = await poly.evaluate((el) => getComputedStyle(el).filter);
    check(motion, "hover reaches brightness(1.04) instantly", filter === "brightness(1.04)", filter ?? "missing");
    await still(page, "reduced-1440-hover-mid");
  } finally {
    await finish(context, page, "reduced-1440-hover");
  }
}

// ---------------------------------------------------------------------------
// Regressions: press still scales, focus-visible ring still intact
// ---------------------------------------------------------------------------
async function waitForScale(locator, target = 0.97) {
  await locator
    .evaluate(
      (node, t) =>
        new Promise((resolve) => {
          const t0 = performance.now();
          const tick = () => {
            const m = /^matrix\(([^,]+)/.exec(getComputedStyle(node).transform);
            const scale = m ? Number(m[1]) : 1;
            if (Math.abs(scale - t) < 0.005 || performance.now() - t0 > 1500) return resolve();
            requestAnimationFrame(tick);
          };
          tick();
        }),
      target,
    )
    .catch(() => {});
}

async function regressions(browser) {
  const motion = "regress";
  const { context, page } = await open(browser, { width: 1440, height: 900 });
  try {
    const poly = polygonTool(page);
    await poly.hover();
    await page.mouse.down();
    await waitForScale(poly);
    const pressed = await poly.evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.move(2, 2);
    await page.mouse.up();
    check(motion, "press still scales to 0.97", pressed.startsWith("matrix(0.97"), pressed);

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        label: el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 24),
        width: cs.outlineWidth,
        color: cs.outlineColor,
        focusVisible: el.matches(":focus-visible"),
      };
    });
    check(
      motion,
      "focus-visible ring is 2px white",
      ring?.width === "2px" && ring?.color === "rgb(255, 255, 255)" && ring?.focusVisible === true,
      JSON.stringify(ring),
    );
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
const browser = await chromium.launch(chromiumLaunchOptions());
try {
  await gridOrbitMouse(browser);
  await gridOrbitKeyboard(browser);
  await gridOrbitTouch(browser);
  await drawMouse(browser);
  await drawTouch(browser);
  await hoverMouse(browser);
  await hoverTouch(browser);
  await reducedGridOrbit(browser);
  await reducedDraw(browser);
  await reducedHover(browser);
  await regressions(browser);
} finally {
  await browser.close();
}

const media = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => /\.(png|webm)$/.test(f))
  .sort();
console.log(`checks: ${passed} pass, ${failed ? "1 or more" : "0"} fail`);
console.log(`artifacts (${media.length}) in ${SHOT_DIR}:`);
for (const f of media) console.log(path.join(SHOT_DIR, f));
console.log(failed ? "chrome motion check: FAIL" : "chrome motion check: all pass");
process.exit(failed ? 1 : 0);
