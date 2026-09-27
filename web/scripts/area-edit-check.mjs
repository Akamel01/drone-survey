// #260 area-edit evidence harness: drives the production build with real mouse
// input at 1440x900 and real touch input at 375x812, asserts what the operator
// can observe, and exits non-zero if anything gated fails.
//
// Prerequisites -- build and serve the app first:
//   cd web && npm run build && npm run start -- -p 3101
// One-time browser install on a clean machine (playwright-core ships no
// browser): npx playwright-core install chromium
// Run:
//   node scripts/area-edit-check.mjs http://127.0.0.1:3101
//   SHOT_DIR=/tmp/ui260-evidence node scripts/area-edit-check.mjs
// SHOT_DIR defaults to docs/ui-theme/screenshots/ui-260 and the base URL to
// http://127.0.0.1:3101. No npm script is added: package.json is out of scope
// for this ticket. Recordings, one .webm per context:
//   mouse-rectangle-1440.webm  polygon draw (3 corners, Enter to finish), the
//                              vertex drag with its canvas-cursor gate, then
//                              the rectangle first click -> rubber band ->
//                              opposite click commit
//   touch-polygon-375.webm     4 taps (Settings -> Polygon -> Map), Finish area,
//                              then a corner tap that opens Remove corner
//
// Gating (any failure exits non-zero): the panel appears on tool pick; the
// exact per-corner copy from lib/areaEditing (clickMeaning); Finish enabled at
// three (mouse) / four (touch) corners; the panel detaches after finishing
// (the UI-20 exit hold, reused from chrome-motion-check.mjs); Sidebar Clear
// area enabled and the area readout non-zero after the mouse finish; the
// .maplibregl-canvas inline cursor is "grabbing" while a vertex drag is held
// and is restored after release; the rectangle rubber-band hint matches
// /m — click to finish/; the touch corner tap opens the Remove corner panel
// with its button enabled (the tap lands outside the 5px visible vertex but
// inside the 44px touch hit layer, so a dropped hit layer would fail it); Add
// points is enabled after the touch finish; each .webm is non-empty
// (> 1500 bytes, the chrome-motion convention).
//
// Recorded, never asserted: the gesture pixels and timing, the rubber-band
// shape, the basemap tile imagery (architecture §10). Flakiness rules: no
// wall-clock gates; every wait is a DOM signal (panel class/title, exact hint
// text, button enabled, canvas cursor, [data-network="online"]); canvas
// coordinates are fractions of the map canvas that avoid the display pills,
// the drawing panel's corner and the bottom tab bar; timeouts are generous
// (10-15s) for tile/network slowness.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.resolve(
  process.env.SHOT_DIR ?? path.join(HERE, "../../docs/ui-theme/screenshots/ui-260"),
);
fs.mkdirSync(SHOT_DIR, { recursive: true });
const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ui260-video-"));
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const TIMEOUT = 15_000;

let failed = false;
let passed = 0;
function check(motion, name, cond, detail = "") {
  const line = `${cond ? "PASS" : "FAIL"} ${motion}/${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (cond) passed += 1;
  else failed = true;
}

/** Run one gating assertion; a rejection becomes a FAIL line, never a crash. */
async function gate(motion, name, run, okDetail = "") {
  try {
    const extra = await run();
    check(motion, name, true, extra || okDetail);
  } catch (err) {
    check(motion, name, false, String(err?.message ?? err).split("\n")[0]);
  }
}

// ---------------------------------------------------------------------------
// Page setup. The passphrase key and the /api/missions stub are duplicated
// from chrome-motion-check.mjs, which imports the app's own libs; this harness
// is plain node and must not. The stub answers with an empty Mission list.
// ---------------------------------------------------------------------------
async function open(browser, { width, height, mobile = false, video = null }) {
  const contextOptions = { viewport: { width, height }, hasTouch: mobile, isMobile: mobile };
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
  // passphrase gate has stepped aside. The map canvas is attached on every
  // viewport; on a phone the map section is hidden behind Missions until the
  // Map tab is tapped.
  await page.getByText(/No Missions in the store yet/).waitFor({ timeout: TIMEOUT });
  await page.locator('section[aria-label="Map"] canvas').waitFor({ state: "attached", timeout: TIMEOUT });
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

const waitOnline = (page, timeout = TIMEOUT) =>
  page.waitForFunction(() => document.querySelector('[data-network="online"]') !== null, undefined, {
    timeout,
  });

/** A viewport point at fraction (fx, fy) of the map canvas. The point is
 *  verified to land on the canvas before it is returned: a panel, the Summary
 *  bar or a pill on top of it would swallow the input and every later
 *  assertion would blame the wrong thing. The check retries while the point is
 *  covered or off-screen (the narrow view slide animates the whole section in),
 *  and fails at the deadline with what was on top. */
async function canvasPoint(page, fx, fy) {
  const deadline = Date.now() + TIMEOUT;
  let lastHit = "(never computed)";
  for (;;) {
    const box = await page.locator('section[aria-label="Map"] canvas').boundingBox();
    if (box && box.width >= 50 && box.height >= 50) {
      const x = Math.round(box.x + box.width * fx);
      const y = Math.round(box.y + box.height * fy);
      lastHit = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return `(${x},${y}) outside the viewport`;
          if (el.closest('section[aria-label="Map"] canvas')) return "canvas";
          return `${el.tagName}.${el.className}`;
        },
        { x, y },
      );
      if (lastHit === "canvas") return { x, y };
    } else {
      lastHit = `map canvas box unusable: ${JSON.stringify(box)}`;
    }
    if (Date.now() > deadline) throw new Error(`${lastHit} (wanted fraction ${fx},${fy})`);
    await page.waitForTimeout(100);
  }
}

/** Wait for an element's trimmed textContent to equal `expected`, and on
 *  timeout report what it actually said. */
async function waitTextExact(page, selector, expected, timeout = TIMEOUT) {
  try {
    await page.waitForFunction(
      ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
      { selector, expected },
      { timeout },
    );
  } catch {
    const actual = await page.evaluate(
      (selector) => document.querySelector(selector)?.textContent?.trim() ?? "(absent)",
      selector,
    );
    throw new Error(`expected "${expected}", got "${actual}"`);
  }
}

/** The drawing panel is visible and titled `title` (visibility, not just
 *  presence: on a phone the map section holds the panel while hidden). */
const waitPanelTitle = (page, title, timeout = TIMEOUT) =>
  page.waitForFunction(
    (title) => {
      const titleEl = document.querySelector('[class*="drawTitle"]');
      const panel = titleEl?.closest('[class*="drawPanel"]');
      if (!titleEl || !panel) return false;
      const cs = getComputedStyle(panel);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      return titleEl.textContent.trim() === title && panel.getBoundingClientRect().width > 0;
    },
    title,
    { timeout },
  );

/** The Remove corner panel is up with its action button enabled. */
const waitRemovePanel = (page, timeout = TIMEOUT) =>
  page.waitForFunction(
    () => {
      const titleEl = document.querySelector('[class*="drawTitle"]');
      const panel = titleEl?.closest('[class*="drawPanel"]');
      if (!titleEl || !panel || titleEl.textContent.trim() !== "Remove corner") return false;
      if (getComputedStyle(panel).visibility === "hidden") return false;
      const btn = [...panel.querySelectorAll("button")].find((b) =>
        /^Remove corner \d+$/.test(b.textContent.trim()),
      );
      return !!btn && !btn.disabled;
    },
    undefined,
    { timeout },
  );

const waitCanvasCursor = async (page, value, timeout = TIMEOUT) => {
  try {
    await page.waitForFunction(
      (expected) => document.querySelector(".maplibregl-canvas")?.style.cursor === expected,
      value,
      { timeout },
    );
  } catch {
    const actual = await page.evaluate(
      () => document.querySelector(".maplibregl-canvas")?.style.cursor ?? "(absent)",
    );
    throw new Error(`expected cursor "${value}", got "${actual}"`);
  }
};

const waitClearAreaEnabled = (page, timeout = TIMEOUT) =>
  page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("#settings-panel button")].find(
        (x) => x.textContent.trim() === "Clear area",
      );
      return !!b && !b.disabled;
    },
    undefined,
    { timeout },
  );

const readAreaText = (page) =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('#settings-panel [class*="readout"]')].find(
      (el) => (el.firstElementChild?.textContent ?? "").trim() === "Area",
    );
    return row?.lastElementChild?.textContent?.trim() ?? null;
  });

/** The Sidebar's formatArea output, as square metres. */
const areaM2 = (text) => {
  if (typeof text !== "string") return NaN;
  const n = parseFloat(text.replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return text.includes("km²") ? n * 1_000_000 : n;
};

const waitAreaNonZero = (page, timeout = TIMEOUT) =>
  page.waitForFunction(
    () => {
      const row = [...document.querySelectorAll('#settings-panel [class*="readout"]')].find(
        (el) => (el.firstElementChild?.textContent ?? "").trim() === "Area",
      );
      const t = row?.lastElementChild?.textContent?.trim() ?? "";
      const n = parseFloat(t.replace(/,/g, ""));
      return Number.isFinite(n) && n > 0;
    },
    undefined,
    { timeout },
  );

/** Add points enabled is read from the inert Settings panel on a phone; the
 *  DOM property is still the app's own predicate result. */
const readAddPointsDisabled = (page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll("#settings-panel button")].find(
      (x) => x.textContent.trim() === "Add points",
    );
    return b ? b.disabled : null;
  });

// ---------------------------------------------------------------------------
// The UI-20 exit hold, reused from chrome-motion-check.mjs so "the panel
// detaches after finishing" is gated as the same sequence: the panel stays
// connected while drawPanelOut runs and is removed only after it could have
// finished; a removal that never happens fails as a stuck ghost. Split into
// arm/collect so the MutationObserver is installed BEFORE the trigger command
// is dispatched: the one-call version can arrive after the closing class was
// applied under video load and then blames a hold that actually happened.
// ---------------------------------------------------------------------------
const DETACH_WINDOW_MS = 3000;

async function armDetached(page, ms = DETACH_WINDOW_MS) {
  await page.evaluate((ms) => {
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
      absentAtArm: false,
    };
    const t0 = performance.now();
    if (!panel()) {
      window.__m2Detach = { state: { ...state, absentAtArm: true, early: true }, done: true };
      return;
    }
    let watched = null;
    let obs = null;
    let guard = null;
    let poll = null;
    const done = () => {
      obs?.disconnect();
      clearTimeout(guard);
      clearInterval(poll);
      window.__m2Detach.done = true;
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
      const anim = (el.getAnimations?.() ?? []).find((a) =>
        a.animationName?.endsWith("drawPanelOut"),
      );
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
      // must still have come after the exit animation's own duration, so it
      // could have run to completion. Load only delays the removal.
      state.early =
        state.finishAt == null &&
        (state.animMs == null || state.triggerAt == null || elapsed < state.animMs);
      done();
    };
    window.__m2Detach = { state, done: false };
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
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    poll = setInterval(() => {
      if (panel()) watch();
      else noteDetach();
    }, 50);
    guard = setTimeout(() => {
      state.timedOut = true;
      done();
    }, ms);
    watch();
  }, ms);
}

async function collectDetached(page, ms = DETACH_WINDOW_MS + 1500) {
  await page.waitForFunction(() => window.__m2Detach?.done === true, undefined, {
    polling: 100,
    timeout: ms,
  });
  return page.evaluate(() => {
    const state = window.__m2Detach.state;
    delete window.__m2Detach;
    return state;
  });
}

function detachCheck(motion, label, r) {
  const ok = r != null && r.early === false && r.detachAt != null && r.connectedAtFinish !== false;
  let detail;
  if (r == null) detail = "detach probe never resolved";
  else if (r.absentAtArm)
    detail = "no drawing panel present when the exit probe was armed";
  else if (r.detachAt == null)
    detail = `still connected ${DETACH_WINDOW_MS}ms after arming (stuck ghost)${
      r.animationSeen ? "" : "; no drawPanelOut CSSAnimation observed"
    }`;
  else {
    detail = `detached after ${r.detachMs}ms${r.fromTrigger ? " (from the close trigger)" : " (from arming; trigger not seen)"}`;
    if (r.early)
      detail += r.animationSeen
        ? `, before drawPanelOut could finish (${r.animMs}ms duration)`
        : "; no drawPanelOut CSSAnimation observed while connected";
    else if (r.finishAt != null) detail += "; drawPanelOut reached finished while connected";
    else
      detail += `; drawPanelOut finish not observed (starved frame loop), held past its ${r.animMs}ms duration`;
    if (r.connectedAtFinish === false) detail += "; node not connected at animation finish";
  }
  check(motion, `${label}: panel held through drawPanelOut, then detached`, ok, detail);
}

// ---------------------------------------------------------------------------
// Context A: mouse at 1440x900. Polygon draw (3 corners, Enter), the committed
// area in the Sidebar, a vertex drag with the cursor gate, then the rectangle
// preview and commit. Coordinates are canvas fractions that clear the display
// pills (top, right of the map), the drawing panel (top-left) and the Summary
// bar (bottom); see MapPane.module.css and plan.module.css.
// ---------------------------------------------------------------------------
async function mouseFlow(browser) {
  const motion = "mouse";
  const { context, page } = await open(browser, { width: 1440, height: 900, video: true });
  try {
    await gate(motion, "page ready (empty store, online)", async () => {
      await waitOnline(page);
      return 'data-network="online" and the empty-store line';
    });

    // Panel appears on tool pick.
    await page.getByRole("radio", { name: "Polygon", exact: true }).click();
    await gate(motion, "panel appears on Polygon pick", async () => {
      await waitPanelTitle(page, "Drawing a polygon");
      return 'title "Drawing a polygon" visible';
    });

    // Three corners, exact click copy after each (lib/areaEditing clickMeaning).
    // The Summary bar owns the lower-centre band (y 480-888) on wide, so all
    // corners stay in the free strip below the drawing panel and above it.
    const corners = [
      [0.3, 0.35],
      [0.55, 0.3],
      [0.45, 0.45],
    ];
    for (let i = 1; i <= 3; i += 1) {
      const { x, y } = await canvasPoint(page, ...corners[i - 1]);
      await page.mouse.click(x, y);
      const expected = `Each click adds a corner — ${i} so far, three needed.`;
      await gate(motion, `corner ${i} copy exact`, async () => {
        await waitTextExact(page, '[class*="drawClick"]', expected);
        return `"${expected}"`;
      });
    }

    // Finish by Enter; the panel holds through drawPanelOut and detaches.
    await gate(motion, "Finish area enabled at three corners", async () => {
      const b = page.getByRole("button", { name: "Finish area" });
      if (!(await b.isEnabled())) throw new Error("Finish area is disabled");
      return "enabled";
    });
    await armDetached(page);
    await page.keyboard.press("Enter");
    detachCheck(motion, "Enter", await collectDetached(page));

    // The Sidebar reads the committed area: Clear area enabled, non-zero m².
    await gate(motion, "Clear area enabled after finish", async () => {
      await waitClearAreaEnabled(page);
      return "Clear area no longer disabled";
    });
    await gate(motion, "area readout non-zero after finish", async () => {
      await waitAreaNonZero(page);
      const text = await readAreaText(page);
      const m2 = areaM2(text);
      if (!(m2 > 0)) throw new Error(`formatArea readout ${JSON.stringify(text)}`);
      return `formatArea shows "${text}" (${Math.round(m2)} m²)`;
    });

    // Vertex drag: press the first corner, hold, drag it outward (away from
    // the fill, so the fill's hover cursor cannot overwrite the drag cursor),
    // then release. The cursor must be grabbing while held and restored after;
    // the area readout must change, which proves a corner moved (a whole-shape
    // drag would keep the area) and that the gesture did real work. The rest
    // cursor is read after the pointer leaves the shape, because hovering a
    // handle shows "grab" by design -- that is the hover cursor, not a failed
    // release.
    const first = await canvasPoint(page, ...corners[0]);
    const areaBefore = await readAreaText(page);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await gate(motion, "canvas cursor grabbing while the vertex drag is held", async () => {
      await waitCanvasCursor(page, "grabbing");
      return 'inline cursor "grabbing" on .maplibregl-canvas';
    });
    await page.mouse.move(first.x - 60, first.y - 60, { steps: 3 });
    await gate(motion, "canvas cursor still grabbing after the drag move", async () => {
      await waitCanvasCursor(page, "grabbing");
      return "grabbing held through the move";
    });
    await page.mouse.up();
    await page.mouse.move(950, 430); // empty map, clear of the shape and panels
    await gate(motion, "canvas cursor restored after release", async () => {
      await waitCanvasCursor(page, "");
      return "inline cursor back to empty in idle";
    });
    await gate(motion, "vertex drag changed the area readout", async () => {
      await page.waitForFunction(
        (before) => {
          const row = [...document.querySelectorAll('#settings-panel [class*="readout"]')].find(
            (el) => (el.firstElementChild?.textContent ?? "").trim() === "Area",
          );
          const t = row?.lastElementChild?.textContent?.trim() ?? "";
          return t.length > 0 && t !== before;
        },
        areaBefore,
        { timeout: TIMEOUT },
      );
      return `formatArea ${areaBefore} -> ${await readAreaText(page)}`;
    });

    // Rectangle: first click, a mouse move rubber-bands with the measured hint,
    // the opposite click commits and the panel detaches.
    await page.getByRole("radio", { name: "Rectangle", exact: true }).click();
    await gate(motion, "panel appears on Rectangle pick", async () => {
      await waitPanelTitle(page, "Drawing a rectangle");
      return 'title "Drawing a rectangle" visible';
    });
    const r1 = await canvasPoint(page, 0.3, 0.35);
    const r2 = await canvasPoint(page, 0.55, 0.48);
    await page.mouse.click(r1.x, r1.y);
    await gate(motion, "rectangle first click copy", async () => {
      await waitTextExact(page, '[class*="drawClick"]', "Drag out the opposite corner");
      return '"Drag out the opposite corner"';
    });
    await page.mouse.move(r2.x, r2.y);
    await gate(motion, "rectangle rubber-band hint", async () => {
      await page.waitForFunction(
        () => /m — click to finish/.test(document.querySelector('[class*="drawClick"]')?.textContent ?? ""),
        undefined,
        { timeout: TIMEOUT },
      );
      const text = await page.evaluate(
        () => document.querySelector('[class*="drawClick"]')?.textContent?.trim() ?? "(absent)",
      );
      return `"${text}"`;
    });
    await armDetached(page);
    await page.mouse.click(r2.x, r2.y);
    detachCheck(motion, "opposite corner", await collectDetached(page));
  } finally {
    await finish(context, page, "mouse-rectangle-1440");
  }
}

// ---------------------------------------------------------------------------
// Context B: touch at 375x812. The phone opens on Missions; pick Polygon in
// Settings, switch to Map, tap four corners, tap Finish area, then tap a
// corner: the selection opens the Remove corner panel. The corner tap lands
// 15px below the corner -- outside the 5px visible vertex, inside the 44px
// touch hit layer -- so a missing hit layer fails this context (G6).
// ---------------------------------------------------------------------------
async function touchFlow(browser) {
  const motion = "touch";
  const { context, page } = await open(browser, { width: 375, height: 812, mobile: true, video: true });
  try {
    await gate(motion, "page ready (empty store, online)", async () => {
      await waitOnline(page);
      return 'data-network="online" and the empty-store line';
    });

    const nav = page.getByRole("navigation", { name: "Show" });
    await nav.getByRole("button", { name: "Settings" }).tap();
    await page.getByRole("radio", { name: "Polygon", exact: true }).tap();
    await nav.getByRole("button", { name: "Map" }).tap();
    await page.locator('section[aria-label="Map"] canvas').waitFor({ state: "visible", timeout: TIMEOUT });
    // Let the view slide settle: while the section is still animating in, its
    // box is translated and every canvas point would land off-screen.
    await page
      .locator('section[aria-label="Map"]')
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
      .catch(() => {});
    await page.waitForTimeout(120);
    await gate(motion, "panel appears on Polygon pick", async () => {
      await waitPanelTitle(page, "Drawing a polygon");
      return 'title "Drawing a polygon" visible on the Map view';
    });

    // Four taps, exact copy after each. On a phone the map canvas is only the
    // top strip (the Summary bar owns the rest): the drawing panel covers
    // x 24-304 / y 64-203 and the display pills x 257-351 / y 12-56, so the
    // points sit in the free top-left, top-centre, right column and bottom band.
    const corners = [
      [0.15, 0.08],
      [0.65, 0.08],
      [0.88, 0.5],
      [0.25, 0.93],
    ];
    for (let i = 1; i <= 4; i += 1) {
      const { x, y } = await canvasPoint(page, ...corners[i - 1]);
      await page.touchscreen.tap(x, y);
      const expected = `Each click adds a corner — ${i} so far, three needed.`;
      await gate(motion, `tap ${i} copy exact`, async () => {
        await waitTextExact(page, '[class*="drawClick"]', expected);
        return `"${expected}"`;
      });
    }

    // Finish area by tap; the panel holds through drawPanelOut and detaches.
    await gate(motion, "Finish area enabled at four corners", async () => {
      const b = page.getByRole("button", { name: "Finish area" });
      if (!(await b.isEnabled())) throw new Error("Finish area is disabled");
      return "enabled";
    });
    await armDetached(page);
    await page.locator('[class*="drawPanel"]').getByRole("button", { name: "Finish area" }).tap();
    detachCheck(motion, "Finish area tap", await collectDetached(page));

    // Corner tap (through the 44px hit layer) opens the Remove corner panel.
    const first = await canvasPoint(page, ...corners[0]);
    await page.touchscreen.tap(first.x, first.y + 15);
    await gate(motion, "Remove corner panel after corner tap", async () => {
      await waitRemovePanel(page);
      const label = await page.evaluate(() => {
        const titleEl = document.querySelector('[class*="drawTitle"]');
        const panel = titleEl?.closest('[class*="drawPanel"]');
        const btn = [...(panel?.querySelectorAll("button") ?? [])].find((b) =>
          /^Remove corner \d+$/.test(b.textContent.trim()),
        );
        return btn?.textContent.trim() ?? "(absent)";
      });
      return `"Remove corner" panel, button "${label}" enabled (tap 15px off the 5px vertex)`;
    });
    await gate(motion, "Add points enabled after finish", async () => {
      const disabled = await readAddPointsDisabled(page);
      if (disabled !== false) throw new Error(`Add points disabled read: ${disabled}`);
      return "enabled (idle, four corners, no circle)";
    });
  } finally {
    await finish(context, page, "touch-polygon-375");
  }
}

// ---------------------------------------------------------------------------
const browser = await chromium.launch();
try {
  // One context per recording; a flow that throws is a FAIL line, and the
  // other flow still runs so both .webm files are attempted (R15).
  for (const flow of [mouseFlow, touchFlow]) {
    try {
      await flow(browser);
    } catch (err) {
      check(flow.name, "flow completed", false, String(err?.message ?? err).split("\n")[0]);
    }
  }
} finally {
  await browser.close();
}

const media = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => f.endsWith(".webm"))
  .sort();
console.log(`checks: ${passed} pass, ${failed ? "1 or more" : "0"} fail`);
console.log(`recordings (${media.length}) in ${SHOT_DIR}:`);
for (const f of media) console.log(path.join(SHOT_DIR, f));
console.log(failed ? "area edit check: FAIL" : "area edit check: all pass");
process.exit(failed ? 1 : 0);
