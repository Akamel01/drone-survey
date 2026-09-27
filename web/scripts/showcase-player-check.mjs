// M3 evidence harness (ticket #193): the Bundle Showcase player's playback
// rules exercised in real engines, with assertions that exit non-zero on
// failure.
//
// Usage:
//   npm run check:showcase-player -- <page-url>               (post-publish: the /d/ route)
//   npm run check:showcase-player -- --serve-dir <bundle-dir> (pre-publish: own Range server)
//
// The selection/rate rules are re-stated here independently of the page under
// test (`nodes/bundle/showcase.html` mirrors `web/lib/hero.ts:27-42`), so the
// page and the harness must agree. No dependency beyond playwright-core and
// node:http.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../.autoforge/evidence/193/showcase-player");
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Static server for --serve-dir: Range-capable, so the page and the Node-side
// 206 assert exercise the same bytes with no extra dependency.
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function startServer(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const size = stat.size;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m && (m[1] !== "" || m[2] !== "")) {
        let start;
        let end;
        if (m[1] === "") {
          start = Math.max(0, size - Number(m[2]));
          end = size - 1;
        } else {
          start = Number(m[1]);
          end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
        }
        if (start >= size || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": end - start + 1,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------------
// Assertion log
// ---------------------------------------------------------------------------

let failed = false;
const failures = [];
function check(context, name, cond, detail = "") {
  const line = `${cond ? "PASS" : "FAIL"} ${context}/${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!cond) {
    failed = true;
    failures.push(line);
  }
}

const shot = (label) => path.join(OUT, `${label}.png`);

// ---------------------------------------------------------------------------
// In-page probes. READ_STATE reads the real element; EXPECTED_PICK re-states
// the frozen selection rules from the candidate table, not from the page.
// ---------------------------------------------------------------------------

const READ_STATE = () => {
  const v = document.querySelector("#hero");
  const p = document.querySelector("#poster");
  return {
    paused: v.paused,
    readyState: v.readyState,
    currentTime: v.currentTime,
    rate: v.playbackRate,
    duration: v.duration,
    currentSrc: v.currentSrc,
    hasSrcAttr: v.hasAttribute("src"),
    videoHidden: v.hidden,
    posterW: p.naturalWidth,
    posterSrc: p.src,
    posterHidden: p.hidden,
    birds: document.querySelectorAll(".bird").length,
    innerW: innerWidth,
    innerH: innerHeight,
    dpr: devicePixelRatio,
  };
};

const EXPECTED_PICK = () => {
  const CUTS = {
    tall: {
      av1_1440: "showcase/tall-1440p60-av1.mp4",
      hevc_1440: "showcase/tall-1440p60-hevc.mp4",
      h264_1080: "showcase/tall-1080p30-h264.mp4",
      poster: "showcase/tall-poster-1440.jpg",
    },
    wide: {
      av1_1440: "showcase/wide-1440p60-av1.mp4",
      av1_4k60: "showcase/wide-4k60-av1.mp4",
      hevc_1440: "showcase/wide-1440p60-hevc.mp4",
      h264_1080: "showcase/wide-1080p30-h264.mp4",
      poster: "showcase/wide-poster-1440.jpg",
    },
  };
  const tall = innerWidth <= innerHeight;
  const cuts = tall ? CUTS.tall : CUTS.wide;
  const big = !tall && innerWidth * devicePixelRatio >= 2560;
  const av1 = big ? 'video/mp4; codecs="av01.0.13M.08"' : 'video/mp4; codecs="av01.0.12M.08"';
  const video = document.querySelector("#hero");
  const pick =
    [
      [big ? cuts.av1_4k60 : cuts.av1_1440, av1],
      [cuts.hevc_1440, 'video/mp4; codecs="hvc1"'],
      [cuts.h264_1080, "video/mp4"],
    ].find(([, type]) => video.canPlayType(type))?.[0] ?? cuts.h264_1080;
  return { tall, big, pick, poster: cuts.poster };
};

// ---------------------------------------------------------------------------
// Engine/device matrix
// ---------------------------------------------------------------------------

const MATRIX = [
  { name: "chromium-wide-1440x900-dpr1", engine: "chromium", width: 1440, height: 900, dpr: 1 },
  { name: "chromium-wide-1440x900-dpr2", engine: "chromium", width: 1440, height: 900, dpr: 2 },
  { name: "chromium-tall-390x844-dpr3", engine: "chromium", width: 390, height: 844, dpr: 3 },
  { name: "webkit-wide-1440x900-dpr1", engine: "webkit", width: 1440, height: 900, dpr: 1 },
  { name: "webkit-tall-390x844-dpr3", engine: "webkit", width: 390, height: 844, dpr: 3, mobile: true },
];

const REDUCED = [
  { name: "chromium-reduced-1440x900-dpr1", engine: "chromium", width: 1440, height: 900, dpr: 1 },
  { name: "webkit-reduced-1440x900-dpr1", engine: "webkit", width: 1440, height: 900, dpr: 1 },
];

const LOW_POWER = [
  { name: "chromium-low-power-390x844-dpr3", engine: "chromium", width: 390, height: 844, dpr: 3 },
  { name: "webkit-low-power-390x844-dpr3", engine: "webkit", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "chromium-low-power-key-390x844-dpr3", engine: "chromium", width: 390, height: 844, dpr: 3, key: true },
];

async function openContext(browsers, spec, { reduced = false, lowPower = false } = {}) {
  const context = await browsers[spec.engine].newContext({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: spec.dpr,
    isMobile: spec.mobile ?? false,
    hasTouch: spec.mobile ?? false,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  if (lowPower) {
    await context.addInitScript(() => {
      let unlocked = false;
      // The page resumes on the first pointerdown OR keydown
      // (`nodes/bundle/showcase.html`); either unlocks the simulation.
      addEventListener("pointerdown", () => { unlocked = true; }, true);
      addEventListener("keydown", () => { unlocked = true; }, true);
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!unlocked) {
          return Promise.reject(
            new DOMException(
              "play() failed because the user agent refused autoplay (Low Power Mode simulation).",
              "NotAllowedError",
            ),
          );
        }
        return origPlay.apply(this, arguments);
      };
      // WebKit starts playback from the `autoplay` attribute without going
      // through the JS `play()`, so the refusal must also revert any playback
      // that starts while locked — exactly what Low Power Mode does. The
      // `playing` event must not reach the page while locked, or the page's
      // `playing` handler detaches the first-touch resume the real hardware
      // path relies on.
      document.addEventListener(
        "play",
        (e) => {
          if (!unlocked) e.target.pause();
        },
        true,
      );
      document.addEventListener(
        "playing",
        (e) => {
          if (!unlocked) {
            e.stopPropagation();
            e.target.pause();
          }
        },
        true,
      );
    });
  }
  return context;
}

// The page's own first-flock delay (`next = 4000` in nodes/bundle/showcase.html)
// plus margin, capped at the contract's 30 s.
function birdBudgetMs() {
  try {
    const html = fs.readFileSync(path.resolve(HERE, "../../nodes/bundle/showcase.html"), "utf8");
    const m = /next\s*=\s*(\d+)/.exec(html);
    if (m) return Math.min(30000, Number(m[1]) + 26000);
  } catch {}
  return 30000;
}

// ---------------------------------------------------------------------------
// Context runs
// ---------------------------------------------------------------------------

async function runPrimary(spec, browsers) {
  const name = spec.name;
  const context = await openContext(browsers, spec);
  const page = await context.newPage();
  try {
    await page.goto(PAGE_URL, { waitUntil: "load", timeout: 30000 });
    try {
      await page.waitForFunction(() => {
        const v = document.querySelector("#hero");
        return !!v && v.readyState >= 2;
      }, null, { timeout: 30000 });
      check(name, "video reaches readyState >= 2", true);
    } catch {
      check(name, "video reaches readyState >= 2", false, "timed out after 30s");
      await page.screenshot({ path: shot(name) });
      return;
    }

    let playing = true;
    try {
      await page.waitForFunction(() => !document.querySelector("#hero").paused, null, { timeout: 10000 });
    } catch {
      playing = false;
    }
    check(name, "autoplay starts (!paused)", playing, playing ? "" : "still paused after 10s");
    const t1 = await page.evaluate(() => document.querySelector("#hero").currentTime);
    await page.waitForTimeout(600);
    const t2 = await page.evaluate(() => document.querySelector("#hero").currentTime);
    check(name, "currentTime advances over 600ms", t2 > t1 + 0.1, `${t1.toFixed(3)} -> ${t2.toFixed(3)}`);

    const state = await page.evaluate(READ_STATE);
    check(
      name,
      "playbackRate = duration / 40",
      Math.abs(state.rate - state.duration / 40) <= 0.005,
      `${state.rate.toFixed(4)} vs ${(state.duration / 40).toFixed(4)} (duration ${state.duration})`,
    );

    const expected = await page.evaluate(EXPECTED_PICK);
    check(
      name,
      `chosen source = ${expected.pick}`,
      state.currentSrc.endsWith(expected.pick),
      state.currentSrc,
    );
    check(name, "tall never wide-4k60-av1.mp4", !expected.tall || !state.currentSrc.includes("4k60"));
    check(
      name,
      "wide 4K only when w*dpr >= 2560",
      expected.big || !state.currentSrc.includes("4k60"),
      `w*dpr = ${state.innerW * state.dpr}`,
    );

    check(name, "poster loaded (naturalWidth > 0)", state.posterW > 0, String(state.posterW));
    check(name, `poster matches framing (${expected.poster})`, state.posterSrc.endsWith(expected.poster), state.posterSrc);
    await page.screenshot({ path: shot(name) });

    // Flip the framing; the page must pick the new source and re-apply the
    // rate on the new file's `loadeddata`.
    const target = expected.tall ? { width: 844, height: 390 } : { width: 500, height: 900 };
    await page.setViewportSize(target);
    const expected2 = await page.evaluate(EXPECTED_PICK);
    try {
      await page.waitForFunction(
        ({ want }) => {
          const v = document.querySelector("#hero");
          return v.currentSrc.endsWith(want) && Math.abs(v.playbackRate - v.duration / 40) <= 0.005;
        },
        { want: expected2.pick },
        { timeout: 30000 },
      );
    } catch {
      // The two checks below carry the FAIL detail.
    }
    const state2 = await page.evaluate(READ_STATE);
    check(
      name,
      `source changes with viewport = ${expected2.pick}`,
      state2.currentSrc.endsWith(expected2.pick),
      state2.currentSrc,
    );
    check(
      name,
      "rate re-applied on loadeddata after source change",
      Math.abs(state2.rate - state2.duration / 40) <= 0.005,
      `${state2.rate.toFixed(4)} vs ${(state2.duration / 40).toFixed(4)} (duration ${state2.duration})`,
    );

    if (name === "chromium-tall-390x844-dpr3") {
      const budget = birdBudgetMs();
      const deadline = Date.now() + budget;
      let birds = 0;
      while (Date.now() < deadline) {
        birds = await page.evaluate(() => document.querySelectorAll(".bird").length);
        if (birds > 0) break;
        await page.waitForTimeout(250);
      }
      check(name, `.bird count > 0 within ${budget}ms`, birds > 0, String(birds));
      await page.screenshot({ path: shot(`${name}-birds`) });
    }

    // Hidden-page pause, then resume on restore. `configurable: true` is what
    // makes `delete` restore the real prototype getters.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hidden = await page.evaluate(READ_STATE);
    check(name, "hidden: video paused", hidden.paused === true, `paused=${hidden.paused}`);
    check(name, "hidden: .bird count is 0", hidden.birds === 0, String(hidden.birds));
    await page.evaluate(() => {
      delete document.hidden;
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    let resumed = true;
    try {
      await page.waitForFunction(() => !document.querySelector("#hero").paused, null, { timeout: 5000 });
    } catch {
      resumed = false;
    }
    check(name, "visible: video resumes", resumed, resumed ? "" : "still paused after 5s");
  } finally {
    await context.close();
  }
}

async function runReduced(spec, browsers) {
  const name = spec.name;
  const context = await openContext(browsers, spec, { reduced: true });
  const page = await context.newPage();
  try {
    await page.goto(PAGE_URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(600);
    const state = await page.evaluate(READ_STATE);
    const display = await page.evaluate(() => ({
      poster: getComputedStyle(document.querySelector("#poster")).display,
      video: getComputedStyle(document.querySelector("#hero")).display,
    }));
    check(name, "poster loaded (naturalWidth > 0)", state.posterW > 0, String(state.posterW));
    check(name, "poster visible", display.poster !== "none" && !state.posterHidden, display.poster);
    check(name, "video hidden", display.video === "none", display.video);
    check(name, ".bird count is 0", state.birds === 0, String(state.birds));
    check(name, "video paused", state.paused === true, `paused=${state.paused}`);
    check(
      name,
      "video has no src/currentSrc",
      !state.hasSrcAttr && state.currentSrc === "",
      `attr=${state.hasSrcAttr} currentSrc=${JSON.stringify(state.currentSrc)}`,
    );
    await page.screenshot({ path: shot(name) });
  } finally {
    await context.close();
  }
}

async function runLowPower(spec, browsers) {
  const name = spec.name;
  const context = await openContext(browsers, spec, { lowPower: true });
  const page = await context.newPage();
  try {
    await page.goto(PAGE_URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1200);
    const state = await page.evaluate(READ_STATE);
    check(name, "autoplay refused: video paused", state.paused === true, `paused=${state.paused}`);
    check(name, "autoplay refused: poster loaded", state.posterW > 0, String(state.posterW));
    await page.screenshot({ path: shot(`${name}-locked`) });
    if (spec.key) {
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press("Space");
    } else {
      await page.mouse.click(Math.round(spec.width / 2), Math.round(spec.height / 2));
    }
    let playing = true;
    try {
      await page.waitForFunction(() => !document.querySelector("#hero").paused, null, { timeout: 10000 });
    } catch {
      playing = false;
    }
    const first = spec.key ? "first key press starts playback" : "first touch starts playback";
    check(name, first, playing, playing ? "" : `still paused after ${spec.key ? "Space" : "click"}`);
    await page.screenshot({ path: shot(`${name}-playing`) });
  } finally {
    await context.close();
  }
}

// F2: a page loaded while hidden must fetch no media at all — not even the
// source selection — and must load and start from the visible branch of its
// own `visibilitychange` handler. The override is installed before any page
// script runs, so the page's first `apply()` sees `document.hidden === true`.
async function runHiddenAtLoad(browsers) {
  const name = "chromium-hidden-at-load-1440x900-dpr1";
  const context = await browsers.chromium.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const mediaRequests = [];
  await context.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  });
  const page = await context.newPage();
  page.on("request", (req) => {
    if (req.url().includes(".mp4")) mediaRequests.push(req.url());
  });
  try {
    await page.goto(PAGE_URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1000);
    const state = await page.evaluate(READ_STATE);
    const display = await page.evaluate(() => getComputedStyle(document.querySelector("#poster")).display);
    check(
      name,
      "hidden at load: no src/currentSrc",
      !state.hasSrcAttr && state.currentSrc === "",
      `attr=${state.hasSrcAttr} currentSrc=${JSON.stringify(state.currentSrc)}`,
    );
    check(name, "hidden at load: no media request", mediaRequests.length === 0, mediaRequests.join(", "));
    check(
      name,
      "hidden at load: poster visible",
      state.posterW > 0 && !state.posterHidden && display !== "none",
      `display=${display} naturalWidth=${state.posterW}`,
    );
    await page.screenshot({ path: shot(name) });

    await page.evaluate(() => {
      delete document.hidden;
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const expected = await page.evaluate(EXPECTED_PICK);
    let started = true;
    try {
      await page.waitForFunction(
        ({ want }) => {
          const v = document.querySelector("#hero");
          return v.currentSrc.endsWith(want) && !v.paused;
        },
        { want: expected.pick },
        { timeout: 20000 },
      );
    } catch {
      started = false;
    }
    const shown = await page.evaluate(READ_STATE);
    check(name, `visible: source set = ${expected.pick}`, shown.currentSrc.endsWith(expected.pick), shown.currentSrc);
    check(name, "visible: playback starts", started, started ? "" : `paused=${shown.paused} currentSrc=${shown.currentSrc}`);
  } finally {
    await context.close();
  }
}

// F3: the live `prefers-reduced-motion` listener — the context starts at
// no-preference, then the media feature is toggled under the running page and
// both directions are asserted. A page that only reads the query once
// (or lost its `change` listener) fails here.
async function runReducedLive(browsers) {
  const name = "chromium-reduced-live-1440x900-dpr1";
  const context = await openContext(browsers, { engine: "chromium", width: 1440, height: 900, dpr: 1 });
  const page = await context.newPage();
  try {
    await page.goto(PAGE_URL, { waitUntil: "load", timeout: 30000 });
    try {
      await page.waitForFunction(() => {
        const v = document.querySelector("#hero");
        return v.readyState >= 2 && !v.paused;
      }, null, { timeout: 30000 });
    } catch {
      check(name, "playback before toggle", false, "never reached playing state");
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    try {
      await page.waitForFunction(() => {
        const v = document.querySelector("#hero");
        return v.paused && !v.hasAttribute("src");
      }, null, { timeout: 5000 });
    } catch {
      // The checks below carry the FAIL detail.
    }
    const state = await page.evaluate(READ_STATE);
    const display = await page.evaluate(() => ({
      poster: getComputedStyle(document.querySelector("#poster")).display,
      video: getComputedStyle(document.querySelector("#hero")).display,
    }));
    check(name, "toggle to reduce: video paused", state.paused === true, `paused=${state.paused}`);
    // `src` removal is the documented rule (`video.removeAttribute("src")`).
    // Chromium keeps the last selected resource in `currentSrc` after a live
    // `load()`, so only the attribute is asserted here (the fresh-load reduced
    // contexts above still assert `currentSrc === ""`).
    check(name, "toggle to reduce: no src attribute", !state.hasSrcAttr, `attr=${state.hasSrcAttr}`);
    check(
      name,
      "toggle to reduce: poster visible",
      state.posterW > 0 && display.poster !== "none" && display.video === "none",
      `poster=${display.poster} video=${display.video} naturalWidth=${state.posterW}`,
    );
    check(name, "toggle to reduce: .bird count is 0", state.birds === 0, String(state.birds));
    await page.screenshot({ path: shot(name) });

    await page.emulateMedia({ reducedMotion: "no-preference" });
    let resumed = true;
    try {
      await page.waitForFunction(() => !document.querySelector("#hero").paused, null, { timeout: 10000 });
    } catch {
      resumed = false;
    }
    const t1 = await page.evaluate(() => document.querySelector("#hero").currentTime);
    await page.waitForTimeout(600);
    const t2 = await page.evaluate(() => document.querySelector("#hero").currentTime);
    check(name, "toggle back: playback resumes", resumed && t2 > t1, `${t1.toFixed(3)} -> ${t2.toFixed(3)}`);
  } finally {
    await context.close();
  }
}

async function rangeCheck(pageUrl) {
  const videoUrl = pageUrl.replace("showcase.html", "showcase/wide-1440p60-hevc.mp4");
  const res = await fetch(videoUrl, { headers: { Range: "bytes=0-99" } });
  check("range", "status 206", res.status === 206, String(res.status));
  const contentRange = res.headers.get("content-range") ?? "";
  check("range", "content-range: bytes 0-99/<size>", /^bytes 0-99\/\d+$/.test(contentRange), contentRange);
  const acceptRanges = res.headers.get("accept-ranges") ?? "";
  check("range", "accept-ranges: bytes", acceptRanges.toLowerCase() === "bytes", acceptRanges);
  const body = Buffer.from(await res.arrayBuffer());
  check("range", "body is 100 bytes", body.length === 100, String(body.length));
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (!args[0]) {
  console.error("usage: npm run check:showcase-player -- <page-url> | --serve-dir <bundle-dir>");
  process.exit(2);
}

let PAGE_URL;
let server = null;
if (args[0] === "--serve-dir") {
  if (!args[1]) {
    console.error("usage: npm run check:showcase-player -- --serve-dir <bundle-dir>");
    process.exit(2);
  }
  const dir = path.resolve(args[1]);
  if (!fs.existsSync(path.join(dir, "showcase.html"))) {
    console.error(`FAIL: ${dir}/showcase.html not found`);
    process.exit(2);
  }
  const started = await startServer(dir);
  server = started.server;
  PAGE_URL = `http://127.0.0.1:${started.port}/showcase.html`;
  console.log(`serving ${dir} at ${PAGE_URL}`);
} else {
  PAGE_URL = args[0];
}
console.log(`page under test: ${PAGE_URL}`);
console.log(`screenshots: ${OUT}`);

const browsers = { chromium: await chromium.launch(), webkit: await webkit.launch() };
try {
  for (const spec of MATRIX) {
    try {
      await runPrimary(spec, browsers);
    } catch (err) {
      check(spec.name, "context ran", false, err?.message ?? String(err));
    }
  }
  for (const spec of REDUCED) {
    try {
      await runReduced(spec, browsers);
    } catch (err) {
      check(spec.name, "context ran", false, err?.message ?? String(err));
    }
  }
  for (const spec of LOW_POWER) {
    try {
      await runLowPower(spec, browsers);
    } catch (err) {
      check(spec.name, "context ran", false, err?.message ?? String(err));
    }
  }
  try {
    await runHiddenAtLoad(browsers);
  } catch (err) {
    check("chromium-hidden-at-load-1440x900-dpr1", "context ran", false, err?.message ?? String(err));
  }
  try {
    await runReducedLive(browsers);
  } catch (err) {
    check("chromium-reduced-live-1440x900-dpr1", "context ran", false, err?.message ?? String(err));
  }
  try {
    await rangeCheck(PAGE_URL);
  } catch (err) {
    check("range", "request completed", false, err?.message ?? String(err));
  }
} finally {
  await browsers.chromium.close();
  await browsers.webkit.close();
  if (server) server.close();
}

if (failed) {
  console.log(`\nFAIL LIST (${failures.length}):`);
  for (const line of failures) console.log(`  ${line}`);
  console.log("showcase-player check: FAIL");
  process.exit(1);
}
console.log("\nALL PASS");
