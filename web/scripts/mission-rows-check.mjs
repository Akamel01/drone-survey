// UI-17 evidence harness (ticket #254): Mission rows dissolve, the gap closes
// by transform (no jump), a saved Mission blurs in, and the list stays usable
// while that happens. Standalone from `motion-check.mjs`: its output path and
// fixed payload are UI-11-scoped.
//
// Usage: build the app, serve it, then
//   npm run check:mission-rows -- [base-url]
//
// It imports the app's own record code so the seeded list is the real shape,
// and serves the store from an in-page mock that keeps RAW records and
// re-derives on every GET, so the component's own action-then-reload path is
// what drives the motion. Arrivals are triggered the way another window does
// it: push a record, then a `storage` event with `MISSIONS_CHANGED_KEY`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { deriveMissions } from "../lib/missionRecords.ts";
import { MISSIONS_CHANGED_KEY } from "../lib/actions.ts";
import { PASSPHRASE_KEY } from "../lib/passphrase.ts";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../docs/ui-theme/screenshots/ui-17");
fs.mkdirSync(OUT, { recursive: true });
const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ui17-video-"));

// ---------------------------------------------------------------------------
// The seeded Mission list (raw records; the mock derives rows from them)
// ---------------------------------------------------------------------------

const AOI = [
  [37.8, -122.4],
  [37.8, -122.39],
  [37.81, -122.39],
  [37.81, -122.4],
];

function record(id, name, created_at, dispatched) {
  return {
    id,
    site_id: "e2e-site-abc123",
    site: "E2E Site",
    name,
    date: "2026-09-26",
    created_at,
    updated_at: created_at,
    spec: {
      ...DEFAULT_SPEC,
      site: "E2E Site",
      site_id: "e2e-site-abc123",
      date: "2026-09-26",
      aoi: AOI,
      home: [37.8, -122.4],
    },
    dispatched_key: dispatched ? `spec-${id}` : null,
  };
}

// Newest first on screen: 0005, 0004, 0003, 0002, 0001.
const SEED = [
  record("m-e2e-0001", "North half", "2026-09-26T08:00:00.000Z", false),
  record("m-e2e-0002", "Orchard", "2026-09-26T08:10:00.000Z", true),
  record("m-e2e-0003", "Roadside", "2026-09-26T08:20:00.000Z", false),
  record("m-e2e-0004", "North ridge", "2026-09-26T08:30:00.000Z", false),
  record("m-e2e-0005", "South field", "2026-09-26T08:40:00.000Z", true),
];
const ARRIVAL = record("m-e2e-0006", "New field", "2026-09-26T09:00:00.000Z", false);
const ARRIVAL_MOBILE = record("m-e2e-0007", "River bend", "2026-09-26T09:10:00.000Z", false);

const LEAVER = "m-e2e-0005"; // Withdraw target, top row at 1440
const TAP = "m-e2e-0004"; // the survivor directly below it
const REMOVE = "m-e2e-0003"; // Remove target for the phone
const BELOW_REMOVE = "m-e2e-0002"; // the survivor the Remove target sits above
const SECOND_WITHDRAW = "m-e2e-0002"; // the A9 second leaver

// ---------------------------------------------------------------------------
// UI-25 (#294) — the Flown moment's seed: Loaded rows, so Mark Flown is offered
// ---------------------------------------------------------------------------

// Mark Flown is only offered on a Loaded Mission (`missionRecords.actionProblem`),
// and Loaded needs a manifest entry with `loaded_at` — the mock below reads the
// same shape the real `deriveMissions` does. Its own seed, so the sections above
// keep the exact rows they were written against.
const SETTLE_A = "m-settle-a";
const SETTLE_B = "m-settle-b";
const SETTLE_C = "m-settle-c";
function settleEntry(id) {
  return {
    [id]: {
      collected_at: "2026-09-26T07:30:00.000Z",
      loaded_at: "2026-09-26T07:35:00.000Z",
      cards: [{ card: "way finder 1", name: "way finder 1", waypoints: 12, path_length_m: 900 }],
    },
  };
}
const SETTLE_MANIFEST = {
  ...settleEntry(`spec-${SETTLE_A}`),
  ...settleEntry(`spec-${SETTLE_B}`),
  ...settleEntry(`spec-${SETTLE_C}`),
};
const SETTLE_SEED = [
  record(SETTLE_A, "Settle A", "2026-09-26T08:00:00.000Z", true),
  record(SETTLE_B, "Settle B", "2026-09-26T08:10:00.000Z", true),
  record(SETTLE_C, "Settle C", "2026-09-26T08:20:00.000Z", true),
];

// ---------------------------------------------------------------------------
// Assertion log
// ---------------------------------------------------------------------------

let failed = false;
function check(prefix, name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${prefix}/${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed = true;
}
function isIdentity(transform) {
  if (transform === "none") return true;
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!m) return false;
  const [a, b, c, d] = m[1].split(",").map((v) => Number(v.trim()));
  return a === 1 && b === 0 && c === 0 && d === 1;
}
function tyOf(transform) {
  if (transform === "none") return 0;
  const m = /^matrix\(([^)]+)\)$/.exec(transform);
  return m ? Number(m[1].split(",")[5]) : NaN;
}
function blurOf(filter) {
  const m = /blur\(([\d.]+)px\)/.exec(filter ?? "");
  return m ? Number(m[1]) : 0;
}
const ALLOWED_TRANSITIONS = new Set(["transform", "opacity", "filter", "clip-path", "visibility"]);
function transitionSubset(t) {
  const props = (t.transitionProperty ?? "").split(",").map((s) => s.trim());
  const durations = (t.transitionDuration ?? "").split(",").map((s) => s.trim());
  if (durations.every((d) => d === "0s")) return { ok: true, detail: "no transition" };
  const bad = props.filter((p) => !ALLOWED_TRANSITIONS.has(p));
  return { ok: bad.length === 0, detail: bad.length ? bad.join(",") : props.join(",") };
}

// ---------------------------------------------------------------------------
// In-page store mock: RAW records, re-derived on every GET
// ---------------------------------------------------------------------------

function mockInit({ seed, passphraseKey, manifest = {} }) {
  localStorage.setItem(passphraseKey, "evidence");
  const records = JSON.parse(JSON.stringify(seed));
  const ARCHIVED = ["flown", "withdrawn", "superseded"];

  // deriveMissions(records, manifest, {}) for the fields the client reads; no
  // ledger exists in this mock. `manifest` stands in for the host's entries:
  // `loaded_at` is what makes a row Loaded, and `imagery_at` is the evidence
  // the system infers Flown from when the operator has not marked it (#294).
  function derive() {
    const byAge = [...records].sort((a, b) =>
      a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1,
    );
    const rows = byAge.map((r) => {
      const entry = r.dispatched_key ? manifest[r.dispatched_key] : undefined;
      const marked = r.flown_mark ? r.flown_mark.flown : null;
      // A record-level `imagery_at` lets a test stage inferred Flown without
      // reaching into the manifest shape; the real store puts it on the entry.
      const evidence = r.imagery_at ?? entry?.imagery_at ?? null;
      const flown = marked === null ? evidence !== null : marked;
      const loaded = entry?.loaded_at ?? null;
      const state = r.withdrawn_at ? "withdrawn" : flown ? "flown" : loaded ? "loaded" : r.dispatched_key ? "dispatched" : "planned";
      const edit = state === "planned" ? "in-place" : state === "loaded" ? "guarded" : "supersede";
      return {
        id: r.id,
        site_id: r.site_id,
        site: r.site,
        name: r.name,
        date: r.date,
        state,
        archived: false,
        spec_key: r.dispatched_key ?? null,
        spec: r.spec,
        cards: [],
        loaded_cards: entry?.cards ?? [],
        superseded_by: null,
        flown_marked: marked,
        flown_evidence_at: evidence,
        flown_disagreement:
          marked === true && evidence === null
            ? "Marked Flown, but no imagery has arrived for this Site and date yet."
            : marked === false && evidence !== null
              ? `Marked not Flown, but imagery arrived at ${evidence}.`
              : null,
        collected_at: entry?.collected_at ?? null,
        loaded_at: loaded,
        created_at: r.created_at,
        updated_at: r.updated_at,
        edit,
      };
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of byAge) {
      for (const oldId of r.supersedes ?? []) {
        const old = byId.get(oldId);
        if (old && old.state !== "flown" && old.state !== "withdrawn") {
          old.state = "superseded";
          old.superseded_by = r.id;
          old.edit = "supersede";
        }
      }
    }
    const raw = new Map(byAge.map((r) => [r.id, r]));
    for (const row of rows) row.archived = raw.get(row.id).archived_at != null || ARCHIVED.includes(row.state);
    return rows.reverse();
  }

  function payload() {
    const rows = derive();
    return {
      missions: rows,
      archived_count: rows.filter((r) => r.archived).length,
      stale_cards: [],
      host: { notice: null, drift: null },
      unreadable: [],
      now: Date.now(),
    };
  }

  window.__records = records;
  window.__payload = payload;
  window.__lastTap = null;
  // Frame helpers the harness's page.evaluate callbacks destructure. They live
  // in the page rather than in each serialized callback, and no eval is used.
  const h = {
    byId: (id) => document.querySelector('[data-row-id="' + id + '"]'),
    allSlots: () => [...document.querySelectorAll("[data-row-id]")],
    frame: () =>
      new Promise((resolve) => {
        const t = setTimeout(resolve, 50); // never stall if rAF is throttled
        requestAnimationFrame(() => {
          clearTimeout(t);
          resolve();
        });
      }),
    rowIdAt: (x, y) => {
      const el = document.elementFromPoint(x, y);
      const row = el && el.closest ? el.closest("[data-row-id]") : null;
      return row ? row.dataset.rowId : null;
    },
    tyOf: (transform) => {
      const m = /^matrix\(([^)]+)\)$/.exec(transform);
      return m ? Number(m[1].split(",")[5]) : 0;
    },
    isIdentity: (transform) => {
      if (transform === "none") return true;
      const m = /^matrix\(([^)]+)\)$/.exec(transform);
      if (!m) return false;
      const p = m[1].split(",").map((v) => Number(v.trim()));
      return p[0] === 1 && p[1] === 0 && p[2] === 0 && p[3] === 1;
    },
    slotSnap: (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.rowId,
        top: r.top,
        height: r.height,
        transform: cs.transform,
        inline: el.style.transform,
        opacity: cs.opacity,
        filter: cs.filter,
        animationName: cs.animationName,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
        leaving: el.className.includes("leaving"),
        arriving: el.className.includes("arriving"),
        inert: el.inert === true,
        ariaHidden: el.getAttribute("aria-hidden") === "true",
      };
    },
    // UI-25 (#294): the Flown moment's row, with the settle class, the parked
    // reading's chip and the inert flag in one snapshot.
    settleSnap: (el) => {
      const cs = getComputedStyle(el);
      const chip = el.querySelector('[class*="chip"]');
      const ccs = chip ? getComputedStyle(chip) : null;
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.rowId,
        t: performance.now(),
        present: true,
        top: r.top,
        transform: cs.transform,
        inline: el.style.transform,
        settling: el.className.includes("settling"),
        leaving: el.className.includes("leaving"),
        inert: el.inert === true,
        ariaHidden: el.getAttribute("aria-hidden") === "true",
        chipText: chip ? chip.textContent.trim() : null,
        chipOpacity: ccs ? ccs.opacity : null,
        chipAnim: ccs ? ccs.animationName : null,
      };
    },
  };
  window.__h = h;
  document.addEventListener(
    "click",
    (e) => {
      const row = e.target && e.target.closest ? e.target.closest("[data-row-id]") : null;
      window.__lastTap = { rowId: row ? row.dataset.rowId : null, x: e.clientX, y: e.clientY };
    },
    true,
  );

  const originalFetch = window.fetch.bind(window);
  const ok = (body) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    if (!url.includes("/api/missions")) return originalFetch(input, init);
    const [pathname, query] = url.split("?");
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : {};
    const find = (id) => records.find((r) => r.id === id);
    const stamp = () => new Date().toISOString();
    if (method === "GET") return ok(payload());
    if (method === "DELETE") {
      const r = find(new URLSearchParams(query ?? "").get("id"));
      if (r) r.archived_at = stamp();
      return ok({ archived: r ? r.id : null });
    }
    if (pathname.endsWith("/dispatch")) {
      const r = find(body.id);
      if (r) r.dispatched_key = `spec-${r.id}`;
      return ok({ cards: ["WF-01"] });
    }
    if (pathname.endsWith("/withdraw")) {
      const r = find(body.id);
      if (r) r.withdrawn_at = stamp();
      return ok({ cards_released: ["WF-01"] });
    }
    if (pathname.endsWith("/flown")) {
      const r = find(body.id);
      if (r) r.flown_mark = { flown: !!body.flown, at: stamp() };
      return ok({ cards: ["WF-01"] });
    }
    if (method === "POST") {
      // POST /api/missions: create a Mission, or edit one in place.
      const now = stamp();
      const rec = body.id ? find(body.id) : null;
      if (rec) {
        Object.assign(rec, {
          site_id: body.site_id ?? rec.site_id,
          site: body.site ?? rec.site,
          name: body.name ?? rec.name,
          date: body.date ?? rec.date,
          spec: body.spec ?? rec.spec,
          updated_at: now,
        });
        return ok({ mission: rec, forked_from: null });
      }
      const fresh = {
        id: `m-e2e-${Math.random().toString(36).slice(2, 8)}`,
        site_id: body.site_id,
        site: body.site,
        name: body.name,
        date: body.date,
        created_at: now,
        updated_at: now,
        spec: body.spec,
        dispatched_key: null,
      };
      records.push(fresh);
      return ok({ mission: fresh, forked_from: null });
    }
    return ok({});
  };
}

/** Still contexts only: stretch the component's hold timers (the JS 150/250 ms
 *  `setTimeout`s) so a paused transition frame can be captured calmly. CSS
 *  durations are untouched, so the paused frame is still the real curve. */
function slowTimerInit() {
  const original = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) =>
    original(fn, typeof ms === "number" && ms >= 150 && ms <= 400 ? 4000 : ms, ...rest);
}

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

async function contextFor(browser, { width, height, mobile = false, reduced = false, video = false, throttle = 0, slowTimers = false, seed = SEED, manifest = {}, rowReady = false }) {
  const options = {
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: reduced ? "reduce" : "no-preference",
  };
  if (video) options.recordVideo = { dir: VIDEO_DIR, size: { width, height } };
  const context = await browser.newContext(options);
  await context.addInitScript(mockInit, { seed, passphraseKey: PASSPHRASE_KEY, manifest });
  if (slowTimers) await context.addInitScript(slowTimerInit);
  const page = await context.newPage();
  if (throttle > 0) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  // A Loaded row offers no Edit (its file is on the Controller), so the settle
  // context waits on the row itself instead.
  if (rowReady) await page.locator("[data-row-id]").first().waitFor({ timeout: 15000 });
  else await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 15000 });
  // Software-rendered WebGL (the map and the looping hero scene) starves the
  // frame clock under headless Chromium: rAF cadence falls to ~200 ms, and a
  // 150-250 ms transition can pass between two samples. Those surfaces are not
  // the subject here, so their paint is suppressed; layout is untouched.
  await page.addStyleTag({ content: "canvas { visibility: hidden !important; }" });
  await page.waitForTimeout(400);
  return { context, page };
}

async function saveVideo(video, name) {
  const target = path.join(OUT, `${name}.webm`);
  await video.saveAs(target);
  check("video", `${name}.webm is non-empty`, fs.statSync(target).size > 1500, `${fs.statSync(target).size} bytes`);
}

async function saveStill(page, name) {
  const target = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: target });
  check("still", `${name}.png is non-empty`, fs.statSync(target).size > 5000, `${fs.statSync(target).size} bytes`);
}
// ---------------------------------------------------------------------------
// Seed honesty: the in-page derive must agree with the app's own
// ---------------------------------------------------------------------------

async function seedCheck(page) {
  const served = await page.evaluate(() => window.__payload());
  const expected = deriveMissions(JSON.parse(JSON.stringify(SEED)));
  const byId = new Map(expected.map((r) => [r.id, r]));
  const fieldsMatch = served.missions.every((r) => {
    const e = byId.get(r.id);
    return e && e.state === r.state && e.archived === r.archived && e.spec_key === r.spec_key && e.name === r.name && e.date === r.date;
  });
  check(
    "seed",
    "in-page derive matches deriveMissions",
    fieldsMatch && served.missions.length === expected.length && served.archived_count === expected.filter((r) => r.archived).length,
    `${served.missions.length} rows, archived_count ${served.archived_count}`,
  );
}

// ---------------------------------------------------------------------------
// First load / idle re-poll / F6 at rest (1440)
// ---------------------------------------------------------------------------

async function firstLoadAndIdle(page) {
  const first = await page.evaluate(() => {
    const el = document.querySelector("[data-row-id]");
    const cs = getComputedStyle(el);
    return {
      opacity: cs.opacity,
      animationName: cs.animationName,
      arriving: document.querySelectorAll('[class*="arriving"]').length,
      leaving: document.querySelectorAll('[class*="leaving"]').length,
    };
  });
  check("first-load", "sampled row is opaque", first.opacity === "1", first.opacity);
  check("first-load", "sampled row has no animation", first.animationName === "none", first.animationName);
  check("first-load", "no arriving or leaving class", first.arriving === 0 && first.leaving === 0, `arriving ${first.arriving}, leaving ${first.leaving}`);

  const rest = await page.evaluate(() => {
    const of = (el) => {
      const cs = getComputedStyle(el);
      return { transitionProperty: cs.transitionProperty, transitionDuration: cs.transitionDuration };
    };
    return { slot: of(document.querySelector("[data-row-id]")), press: of(document.querySelector("article.press")) };
  });
  const slot = transitionSubset(rest.slot);
  check("f6", "slot transition is in the allowed set", slot.ok && rest.slot.transitionProperty.includes("transform"), slot.detail);
  const press = transitionSubset(rest.press);
  check("f6", "press is transform-only", press.ok && rest.press.transitionProperty.trim() === "transform", `${rest.press.transitionProperty} / ${rest.press.transitionDuration}`);

  const frames = await page.evaluate(
    async () => {
      const { allSlots, frame, slotSnap } = window.__h;
      const btn = [...document.querySelectorAll("#missions-panel button")].find((b) => b.textContent.trim() === "Refresh");
      btn.click();
      const out = [];
      const start = performance.now();
      while (performance.now() - start < 450) {
        out.push({ t: performance.now(), slots: allSlots().map(slotSnap) });
        await frame();
      }
      return out;
    },
  );
  const moving = frames.some((f) => f.slots.some((s) => s.arriving || s.leaving));
  check("idle-refresh", "no arriving or leaving class", !moving);
  const transforms = frames.flatMap((f) => f.slots.map((s) => s.transform)).filter((t) => !isIdentity(t));
  check("idle-refresh", "no transform motion", transforms.length === 0, transforms.slice(0, 3).join(" "));
  const inline = frames.flatMap((f) => f.slots.map((s) => s.inline)).filter((t) => t !== "");
  check("idle-refresh", "no inline transform written", inline.length === 0, inline.slice(0, 3).join(" "));
  const topsById = new Map();
  let topsSteady = true;
  for (const f of frames) {
    for (const s of f.slots) {
      if (!topsById.has(s.id)) topsById.set(s.id, s.top);
      else if (Math.abs(topsById.get(s.id) - s.top) > 1) topsSteady = false;
    }
  }
  check("idle-refresh", "survivor tops hold", topsSteady);
}

// ---------------------------------------------------------------------------
// AC1/AC3/F6 — leaving a row at 1440 (Withdraw), with a mid-slide tap
// ---------------------------------------------------------------------------

async function leaveWithdraw(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900 });
  try {
    const run = await page.evaluate(
      async ({ leaverId, tapId, deadline }) => {
        const { byId, allSlots, frame, rowIdAt, tyOf, slotSnap } = window.__h;
        const frames = [];
        const snap = (phase) => {
          const f = { t: performance.now(), phase, slots: allSlots().map(slotSnap), leaver: null, tap: null };
          const lv = byId(leaverId);
          if (lv) {
            const cs = getComputedStyle(lv);
            const r = lv.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            f.leaver = {
              opacity: cs.opacity,
              filter: cs.filter,
              transform: cs.transform,
              inline: lv.style.transform,
              transitionProperty: cs.transitionProperty,
              transitionDuration: cs.transitionDuration,
              leaving: lv.className.includes("leaving"),
              inert: lv.inert === true,
              ariaHidden: lv.getAttribute("aria-hidden") === "true",
              top: r.top,
              hitRowId: cy > 0 && cy < innerHeight ? rowIdAt(cx, cy) : null,
            };
          }
          const tapEl = byId(tapId);
          if (tapEl) {
            const r = tapEl.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const s = f.slots.find((x) => x.id === tapId);
            f.tap = { cx, cy, transform: s ? s.transform : "none", hitRowId: cy > 0 && cy < innerHeight ? rowIdAt(cx, cy) : null };
          }
          return f;
        };
        const leaver0 = byId(leaverId);
        if (!leaver0) throw new Error(`leaver ${leaverId} not found`);
        const rowHeight = leaver0.getBoundingClientRect().height;
        for (let i = 0; i < 4; i++) {
          frames.push(snap("base"));
          await frame();
        }
        const withdraw = [...byId(leaverId).querySelectorAll("button")].find((b) => b.textContent.trim() === "Withdraw");
        if (!withdraw) throw new Error("Withdraw button not found");
        withdraw.click();
        const start = performance.now();
        let tap = null;
        while (performance.now() - start < deadline) {
          const f = snap("run");
          frames.push(f);
          const t = f.tap ? tyOf(f.tap.transform) : 0;
          if (f.leaver === null && f.tap && Math.abs(t) > 0.5 && Math.abs(t) < 40 && f.tap.hitRowId === tapId && f.tap.cy > 0 && f.tap.cy < innerHeight) {
            tap = { cx: f.tap.cx, cy: f.tap.cy, ty: t, t: f.t };
            break;
          }
          await frame();
        }
        return { frames, tap, rowHeight };
      },
      { leaverId: LEAVER, tapId: TAP, deadline: 1000 },
    );
    if (process.env.UI17_DEBUG) console.log("debug leave frames", JSON.stringify(run.frames));
    const { frames, rowHeight } = run;

    const baseline = new Map(frames[0].slots.map((s) => [s.id, s.top]));
    const leaverFrames = frames.filter((f) => f.leaver);
    const mounted = leaverFrames.filter((f) => f.leaver.leaving);
    const firstDetach = frames.findIndex((f, i) => f.leaver === null && i > 0 && frames[i - 1].leaver !== null);
    const postDetach = firstDetach >= 0 ? frames.slice(firstDetach) : [];

    // 1. Survivors do not move while the leaver is still on screen.
    let held = true;
    for (const f of leaverFrames) {
      for (const s of f.slots) {
        if (s.id === LEAVER) continue;
        if (Math.abs(s.top - baseline.get(s.id)) > 1) held = false;
      }
    }
    check("leave", "survivor tops constant while the leaver is mounted", held);

    // 2. The dissolve itself: opacity down, blur engaged, no movement.
    const dissolving = mounted.filter((f) => Number(f.leaver.opacity) < 0.95);
    const maxBlur = Math.max(0, ...mounted.map((f) => blurOf(f.leaver.filter)));
    check("leave", "mid-hold sample is below opacity 1", dissolving.length > 0, `${dissolving.length} frames`);
    // The dissolve is 250 ms and the hold is 250 ms, so a sampled frame shows
    // the interpolated blur (how far depends on when the sampler lands); the
    // full `blur(4px)` target is asserted in `fullDissolve` with a stretched
    // hold. Here: the blur must be engaged while the opacity is falling.
    check(
      "leave",
      "mid-hold filter blurs toward blur(4px)",
      dissolving.some((f) => blurOf(f.leaver.filter) > 0.5),
      `max blur ${maxBlur.toFixed(2)}px`,
    );
    const leaverMoves = mounted.filter((f) => !isIdentity(f.leaver.transform) || f.leaver.inline !== "");
    check("leave", "leaving wrapper transform identity throughout", leaverMoves.length === 0);
    check("leave", "leaving wrapper is inert and aria-hidden", mounted.length > 0 && mounted.every((f) => f.leaver.inert && f.leaver.ariaHidden));
    const midHold = mounted[Math.floor(mounted.length / 2)];
    check(
      "usable",
      "leaving row centre resolves outside the leaver",
      !!midHold && midHold.leaver.hitRowId !== LEAVER,
      midHold ? `hit ${midHold.leaver.hitRowId}` : "no mid-hold frame",
    );
    // F6: the dissolve animates nothing outside the allowed set.
    const leaveTrans = midHold ? transitionSubset(midHold.leaver) : { ok: false, detail: "no mid-hold frame" };
    check("f6", "mid-dissolve leaving wrapper transition is in the allowed set", leaveTrans.ok, leaveTrans.detail);
    check(
      "f6",
      "mid-dissolve leaving wrapper transitions opacity and filter",
      !!midHold && midHold.leaver.transitionProperty.includes("opacity") && midHold.leaver.transitionProperty.includes("filter"),
      midHold ? `${midHold.leaver.transitionProperty} / ${midHold.leaver.transitionDuration}` : "no mid-hold frame",
    );

    // 3. FLIP engages after detach, and no frame jumps.
    const flipSamples = postDetach.filter((f) => f.slots.some((s) => s.id !== LEAVER && Math.abs(tyOf(s.transform)) > 0.5));
    check("leave", "FLIP engaged after detach", flipSamples.length > 0, `${flipSamples.length} frames with a translated survivor`);
    // The real falsifier: the FLIP writes each survivor's old top as an inline
    // translate in the same commit that detaches the leaver, so the first
    // painted frame after detach must show the same top. A missing FLIP moves
    // it up by the full row+gap in that one commit.
    const lastMountedIndex = frames.reduce((acc, f, i) => (f.leaver ? i : acc), -1);
    const firstPostIndex = frames.findIndex((f, i) => i > 0 && !f.leaver && frames[i - 1].leaver);
    let boundary = 0;
    if (lastMountedIndex >= 0 && firstPostIndex >= 0) {
      for (const s of frames[firstPostIndex].slots) {
        if (s.id === LEAVER) continue;
        const before = frames[lastMountedIndex].slots.find((x) => x.id === s.id);
        if (before) boundary = Math.max(boundary, Math.abs(s.top - before.top));
      }
    }
    check("leave", "no jump across the unmount boundary", boundary <= 1, `max ${boundary.toFixed(1)}px`);
    // Per-frame movement, over pairs a frame or two apart: the ease-out FLIP
    // covers 319 px in 250 ms, so a slower pair is the sampler aliasing, not a
    // jump -- the boundary check above owns that instant.
    let maxStep = 0;
    let maxDt = 0;
    let closePairs = 0;
    for (const id of baseline.keys()) {
      if (id === LEAVER) continue;
      const series = frames
        .map((f) => ({ t: f.t, top: f.slots.find((s) => s.id === id)?.top }))
        .filter((x) => typeof x.top === "number");
      for (let i = 1; i < series.length; i++) {
        const dt = series[i].t - series[i - 1].t;
        const delta = Math.abs(series[i].top - series[i - 1].top);
        if (dt <= 20) {
          closePairs++;
          if (delta > maxStep) {
            maxStep = delta;
            maxDt = dt;
          }
        }
      }
    }
    check(
      "leave",
      "no per-frame top delta of half a row",
      maxStep < rowHeight / 2,
      closePairs > 0
        ? `max step ${maxStep.toFixed(1)}px in ${maxDt.toFixed(1)}ms over ${closePairs} close pairs, half row ${(rowHeight / 2).toFixed(1)}px`
        : `no consecutive samples within 20ms this run; boundary check holds, half row ${(rowHeight / 2).toFixed(1)}px`,
    );

    // 4. A mid-slide tap, clicked at coordinates sampled live in the loop.
    if (!run.tap) {
      check("usable", "mid-slide tap coordinates sampled", false, "no frame qualified");
    } else {
      check("usable", "mid-slide tap coordinates sampled", true, `(${run.tap.cx.toFixed(0)}, ${run.tap.cy.toFixed(0)}) ty ${run.tap.ty.toFixed(1)}px`);
      await page.mouse.click(run.tap.cx, run.tap.cy);
      const tap = await page.evaluate(() => window.__lastTap);
      check("usable", "mid-slide tap hits the intended survivor", tap?.rowId === TAP, `hit ${tap?.rowId}`);
    }

    // 5. Settled: transforms identity, inline transform gone, locator click works.
    await page.waitForTimeout(500);
    const settled = await page.evaluate(
      () => {
        const { allSlots, slotSnap } = window.__h;
        return allSlots().map(slotSnap);
      },
    );
    const settledBad = settled.filter((s) => !isIdentity(s.transform) || s.inline !== "");
    check("leave", "all transforms identity after the slide", settledBad.length === 0, settledBad.map((s) => s.transform).join(" "));
    check("usable", "inline transform empty after settle", settled.every((s) => s.inline === ""));

    // A1: a later state-touching render (an unchanged Refresh) must not round
    // up a stale FLIP snapshot and jump a survivor a second time.
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("#missions-panel button")].find((b) => b.textContent.trim() === "Refresh");
      if (!btn) throw new Error("Refresh button not found");
      btn.click();
    });
    await page.waitForTimeout(450);
    const stale = await page.evaluate(() => {
      const { allSlots, slotSnap, isIdentity } = window.__h;
      return allSlots()
        .map(slotSnap)
        .filter((s) => s.inline !== "" || !isIdentity(s.transform))
        .map((s) => `${s.id} ${s.inline || s.transform}`);
    });
    check("leave", "unchanged Refresh re-applies no FLIP (A1)", stale.length === 0, stale.join("; "));

    if (process.env.UI17_DEBUG) {
      const pre = await page.evaluate((tapId) => {
        const row = document.querySelector(`[data-row-id="${tapId}"]`);
        const btn = row && [...row.querySelectorAll("button")].find((b) => /Dispatch/.test(b.textContent));
        return { row: !!row, btn: btn ? btn.textContent : null, disabled: btn ? btn.disabled : null };
      }, TAP);
      console.log("debug dispatch pre", JSON.stringify(pre));
    }
    await page.locator(`[data-row-id="${TAP}"] button`, { hasText: "Dispatch" }).click();
    await page.waitForTimeout(400);
    const tapped = await page.locator(`[data-row-id="${TAP}"]`).innerText();
    if (process.env.UI17_DEBUG) console.log("debug dispatch post", JSON.stringify(tapped));
    // `innerText` is uppercased by the chip's `text-transform`, so match loosely.
    check("usable", "post-slide locator click lands on its row", /dispatched/i.test(tapped), tapped.split("\n")[0]);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// A11 (literal) — with the JS hold stretched, the dissolve reaches its CSS
// target while the row is still mounted: computed filter blur(4px), opacity 0.
// ---------------------------------------------------------------------------

async function fullDissolve(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900, slowTimers: true });
  try {
    const out = await page.evaluate(
      async ({ leaverId }) => {
        const { byId, frame } = window.__h;
        const btn = [...byId(leaverId).querySelectorAll("button")].find((b) => b.textContent.trim() === "Withdraw");
        if (!btn) throw new Error("Withdraw button not found");
        btn.click();
        const start = performance.now();
        while (performance.now() - start < 3000) {
          const el = byId(leaverId);
          if (el && el.className.includes("leaving")) {
            const cs = getComputedStyle(el);
            if (cs.filter === "blur(4px)") return { filter: cs.filter, opacity: cs.opacity, mounted: true };
          }
          await frame();
        }
        return { filter: null, opacity: null, mounted: false };
      },
      { leaverId: LEAVER },
    );
    check(
      "dissolve",
      "stretched hold reaches the blur(4px) target while mounted",
      out.mounted && out.filter === "blur(4px)",
      `${out.filter} / opacity ${out.opacity}`,
    );
    check("dissolve", "target sample is below opacity 1", out.opacity !== null && Number(out.opacity) < 1, out.opacity ?? "never");
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// AC2 — arrival (storage event, the way another window triggers it)
// ---------------------------------------------------------------------------

async function arrival(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900 });
  try {
    const frames = await page.evaluate(
      async ({ record, key, deadline }) => {
        const { byId, frame } = window.__h;
        window.__records.push(record);
        window.dispatchEvent(new StorageEvent("storage", { key }));
        const out = [];
        const start = performance.now();
        while (performance.now() - start < deadline) {
          const el = byId(record.id);
          const cs = el ? getComputedStyle(el) : null;
          out.push({
            t: performance.now(),
            present: !!el,
            opacity: cs ? cs.opacity : null,
            filter: cs ? cs.filter : null,
            animationName: cs ? cs.animationName : null,
            animations: el
              ? el
                  .getAnimations()
                  .map((a) => `${a.animationName}:${a.playState}:${Math.round(a.currentTime ?? 0)}`)
                  .join("|")
              : null,
            transitionProperty: cs ? cs.transitionProperty : null,
            transitionDuration: cs ? cs.transitionDuration : null,
          });
          await frame();
        }
        return out;
      },
      { record: ARRIVAL, key: MISSIONS_CHANGED_KEY, deadline: 420 },
    );
    if (process.env.UI17_DEBUG) console.log("debug arrival frames", JSON.stringify(frames));
    const first = frames.find((f) => f.present);
    check("arrive", "new row first sample is below opacity 1", !!first && Number(first.opacity) < 1, first?.opacity ?? "never present");
    check("arrive", "new row first sample blurs in", !!first && blurOf(first.filter) > 0, first?.filter ?? "never present");
    // CSS Modules hashes the keyframe name (`…__rowArrive`), so match the suffix.
    check("arrive", "new row uses the rowArrive keyframe", !!first && (first.animationName ?? "").endsWith("rowArrive"), first?.animationName ?? "never present");
    const settled = first ? frames.filter((f) => f.present && f.t - first.t >= 165) : [];
    check(
      "arrive",
      "settles to opacity 1, filter none by 150ms+",
      !!first && settled.length > 0 && settled.every((f) => f.opacity === "1" && f.filter === "none"),
      settled.length ? `${settled[0].opacity} / ${settled[0].filter}` : "no post-150ms sample",
    );
    if (first) {
      const t = transitionSubset(first);
      check("f6", "arriving wrapper transition is in the allowed set", t.ok, `${first.transitionProperty} / ${first.transitionDuration}`);
    }
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// AC2 — Show archived is a filter, not an arrival
// ---------------------------------------------------------------------------

async function archivedToggle(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900 });
  try {
    // Leave one row behind first, so there is something archived to reveal.
    await page.evaluate(
      async () => {
        const { byId, frame } = window.__h;
        const b = [...byId("m-e2e-0005").querySelectorAll("button")].find((x) => x.textContent.trim() === "Withdraw");
        b.click();
        const start = performance.now();
        while (performance.now() - start < 700) await frame();
      },
    );
    const probe = await page.evaluate(
      async () => {
        const { byId, frame } = window.__h;
        const btn = [...document.querySelectorAll("#missions-panel button")].find((b) => /archived/.test(b.textContent));
        if (!btn) throw new Error("archived toggle not found");
        btn.click();
        const out = { arriving: [], archivedPresent: false };
        const start = performance.now();
        while (performance.now() - start < 250) {
          out.arriving.push(document.querySelectorAll('[class*="arriving"]').length);
          out.archivedPresent = out.archivedPresent || !!byId("m-e2e-0005");
          await frame();
        }
        return out;
      },
    );
    check("toggle", "no row arrives on the filter toggle", probe.arriving.every((n) => n === 0), probe.arriving.join(","));
    check("toggle", "archived row is revealed", probe.archivedPresent);
  } finally {
    await context.close();
  }
}
// ---------------------------------------------------------------------------
// A9 — two removals ~100ms apart share one hold window
// ---------------------------------------------------------------------------

async function holdRule(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900 });
  try {
    const run = await page.evaluate(
      async ({ a, b }) => {
        const { byId, allSlots, frame, slotSnap } = window.__h;
        const rows = [a, b];
        const snap = () => {
          const f = { t: performance.now(), slots: allSlots().map(slotSnap), flags: {} };
          for (const id of rows) {
            const el = byId(id);
            f.flags[id] = {
              present: !!el,
              leaving: el ? el.className.includes("leaving") : false,
              opacity: el ? getComputedStyle(el).opacity : null,
            };
          }
          return f;
        };
        const press = (id) => {
          const btn = [...byId(id).querySelectorAll("button")].find((x) => x.textContent.trim() === "Withdraw");
          if (!btn) throw new Error(`Withdraw button not found in ${id}`);
          btn.click();
        };
        const frames = [];
        for (let i = 0; i < 3; i++) {
          frames.push(snap());
          await frame();
        }
        press(a);
        let tA = null;
        const startA = performance.now();
        while (performance.now() - startA < 250 && tA === null) {
          const f = snap();
          frames.push(f);
          if (f.flags[a].leaving) tA = f.t;
          else await frame();
        }
        if (tA === null) throw new Error(`${a} never started leaving`);
        while (performance.now() - tA < 100) {
          frames.push(snap());
          await frame();
        }
        press(b);
        const startB = performance.now();
        while (performance.now() - startB < 900) {
          frames.push(snap());
          await frame();
        }
        return { frames, tA };
      },
      { a: LEAVER, b: SECOND_WITHDRAW },
    );
    if (process.env.UI17_DEBUG) console.log("debug hold frames", JSON.stringify(run.frames));
    const { frames, tA } = run;
    const tB = frames.find((f) => f.t > tA + 40 && f.flags[SECOND_WITHDRAW].leaving)?.t ?? null;
    check("hold", "both leavers dissolve together", !!tB && frames.some((f) => f.flags[LEAVER].leaving && f.flags[SECOND_WITHDRAW].leaving));
    check("hold", "second removal follows the first", !!tB && tB - tA >= 60 && tB - tA <= 250, `${tB && (tB - tA).toFixed(0)}ms`);

    // No commit between the two mutations: every survivor top holds.
    const baseline = new Map(frames[0].slots.map((s) => [s.id, s.top]));
    let steady = true;
    for (const f of frames) {
      if (f.t < tA || f.t > tB) continue;
      for (const s of f.slots) {
        if (s.id === LEAVER) continue;
        if (Math.abs(s.top - baseline.get(s.id)) > 1) steady = false;
      }
    }
    check("hold", "no commit between the two mutations", steady);

    const lastOf = (id) => {
      let last = null;
      for (const f of frames) if (f.flags[id].present) last = f.t;
      return last;
    };
    const lastA = lastOf(LEAVER);
    const lastB = lastOf(SECOND_WITHDRAW);
    check("hold", "first leaver outlives its own deadline", !!tB && !!lastA && lastA >= tB + 180, `detached at tB+${tB && lastA ? (lastA - tB).toFixed(0) : "?"}ms`);
    check(
      "hold",
      "both detach inside one hold window from the newest leaver",
      !!tB && !!lastB && lastB - tB <= 250 + 80 && lastB - tB >= 250 - 60 && Math.abs(lastA - lastB) <= 80,
      `A tB+${tB && lastA ? (lastA - tB).toFixed(0) : "?"}ms, B tB+${tB && lastB ? (lastB - tB).toFixed(0) : "?"}ms`,
    );
    const dissolved = (id) => frames.some((f) => f.flags[id].present && Number(f.flags[id].opacity) < 1);
    check("hold", "both leavers dissolve", dissolved(LEAVER) && dissolved(SECOND_WITHDRAW));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// UI-25 (#294) — the Flown moment: settle → hold → dissolve, once, on the
// operator's own Mark Flown; every other cause (refresh, storage reload,
// inferred imagery) takes the existing dissolve with no moment.
// ---------------------------------------------------------------------------

/** Archived-filter toggle, then a beat for the commit. */
async function toggleArchived(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("#missions-panel button")].find((b) => /archived/.test(b.textContent));
    if (!btn) throw new Error("archived toggle not found");
    btn.click();
  });
  await page.waitForTimeout(450);
}

/** Click Mark Flown on `id` inside one page task and sample that row (plus any
 *  survivor tops) until it detaches. */
async function settleRun(page, id, survivorIds = []) {
  return page.evaluate(
    async ({ id, survivorIds, deadline }) => {
      const { byId, frame, settleSnap } = window.__h;
      const frames = [];
      const snap = () => {
        const el = byId(id);
        const survivors = {};
        for (const sid of survivorIds) {
          const s = byId(sid);
          survivors[sid] = s ? s.getBoundingClientRect().top : null;
        }
        return el ? { ...settleSnap(el), survivors } : { id, present: false, t: performance.now(), survivors };
      };
      for (let i = 0; i < 3; i++) {
        frames.push(snap());
        await frame();
      }
      const btn = [...byId(id).querySelectorAll("button")].find((b) => b.textContent.trim() === "Mark Flown");
      if (!btn) throw new Error(`Mark Flown button not found in ${id}`);
      btn.click();
      const start = performance.now();
      while (performance.now() - start < deadline) {
        frames.push(snap());
        await frame();
      }
      return frames;
    },
    { id, survivorIds, deadline: 2200 },
  );
}

/** The moment's phase contract, asserted on one sampled run. */
function analyzeFlownRun(prefix, frames, survivorId = null) {
  const mounted = frames.filter((f) => f.present);
  const settleFrames = mounted.filter((f) => f.settling);
  const tSettle = settleFrames[0]?.t ?? null;
  const tLeaving = mounted.find((f) => f.leaving)?.t ?? null;
  const detachIndex = frames.findIndex((f, i) => !f.present && i > 0 && frames[i - 1].present);
  const tDetach = detachIndex >= 0 ? frames[detachIndex].t : null;
  const settleIdx = frames.map((f, i) => (f.present && f.settling ? i : -1)).filter((i) => i >= 0);
  const contiguous = settleIdx.length > 0 && settleIdx[settleIdx.length - 1] - settleIdx[0] + 1 === settleIdx.length;
  const tail = detachIndex >= 0 ? frames.slice(detachIndex) : [];
  const ms = (a, b) => (a !== null && b !== null ? `${(b - a).toFixed(0)}ms` : "phase missing");

  check(prefix, "the row was Loaded before the mark", frames[0]?.chipText === "Loaded", String(frames[0]?.chipText));
  check(
    prefix,
    "settle → hold → dissolve, in that order",
    tSettle !== null && tLeaving !== null && tDetach !== null && tSettle < tLeaving && tLeaving < tDetach,
    `settle→leaving ${ms(tSettle, tLeaving)}, leaving→commit ${ms(tLeaving, tDetach)}`,
  );
  check(prefix, ".leaving never joins the settling row", !mounted.some((f) => f.settling && f.leaving));
  check(
    prefix,
    "plays once: one settling run, none after the commit",
    contiguous && !tail.some((f) => f.present && f.settling),
    `${settleIdx.length} settling samples`,
  );
  check(
    prefix,
    "the 900 ms hold follows the settle",
    tSettle !== null && tLeaving !== null && tLeaving - tSettle >= 900 && tLeaving - tSettle <= 1500,
    ms(tSettle, tLeaving),
  );
  check(
    prefix,
    "the existing dissolve follows the hold",
    tLeaving !== null && tDetach !== null && tDetach - tLeaving >= 150 && tDetach - tLeaving <= 700,
    ms(tLeaving, tDetach),
  );
  const loud = mounted.filter((f) => f.settling || f.leaving);
  check(
    prefix,
    "inert and aria-hidden from settle through commit",
    loud.length > 0 && loud.every((f) => f.inert && f.ariaHidden) && mounted.filter((f) => !f.settling && !f.leaving).every((f) => !f.inert),
    `${loud.length} settling/leaving samples`,
  );
  check(
    prefix,
    "the settling row reads Flown",
    settleFrames.length > 0 && settleFrames.every((f) => f.chipText === "Flown"),
    settleFrames[0]?.chipText ?? "none",
  );
  const preCommit = mounted.filter((f) => tDetach === null || f.t < tDetach);
  check(
    prefix,
    "no transform jump on the departing row",
    preCommit.every((f) => isIdentity(f.transform) && f.inline === ""),
    preCommit.find((f) => !isIdentity(f.transform))?.transform ?? "identity throughout",
  );
  if (survivorId) {
    const beforeDetach = frames
      .filter((f) => tDetach === null || f.t < tDetach)
      .map((f) => f.survivors?.[survivorId])
      .filter((t) => typeof t === "number");
    check(
      prefix,
      "the survivor holds its top until the commit",
      beforeDetach.length > 1 && beforeDetach.every((t) => Math.abs(t - beforeDetach[0]) <= 1),
      `${beforeDetach.length} samples`,
    );
  }
}

async function flownSettle(browser) {
  const { context, page } = await contextFor(browser, {
    width: 1440,
    height: 900,
    seed: SETTLE_SEED,
    manifest: SETTLE_MANIFEST,
    rowReady: true,
  });
  try {
    // 1. Reads that are not the operator's mark never play the moment.
    const quiet = await page.evaluate(
      async ({ ids, key }) => {
        const { byId, frame } = window.__h;
        const lit = (id) => {
          const el = byId(id);
          return !!el && (el.className.includes("settling") || el.className.includes("leaving"));
        };
        const watch = async (ms, run) => {
          run();
          let seen = false;
          const start = performance.now();
          while (performance.now() - start < ms) {
            seen = seen || ids.some(lit);
            await frame();
          }
          return seen;
        };
        const refresh = [...document.querySelectorAll("#missions-panel button")].find((b) => b.textContent.trim() === "Refresh");
        if (!refresh) throw new Error("Refresh button not found");
        const onRefresh = await watch(450, () => refresh.click());
        const onStorage = await watch(450, () => window.dispatchEvent(new StorageEvent("storage", { key })));
        return { onRefresh, onStorage };
      },
      { ids: [SETTLE_A, SETTLE_B, SETTLE_C], key: MISSIONS_CHANGED_KEY },
    );
    check("settle", "Refresh never plays the moment", !quiet.onRefresh);
    check("settle", "a storage reload never plays the moment", !quiet.onStorage);

    // 2. The operator's own Mark Flown: settle → 900 ms hold → dissolve, once.
    const first = await settleRun(page, SETTLE_A, [SETTLE_B]);
    analyzeFlownRun("settle/first", first, SETTLE_B);

    // 3. Imagery-inferred Flown (no mark) arrives through a store read; it
    //    dissolves without the moment.
    const inferred = await page.evaluate(
      async ({ id, key, deadline }) => {
        const { byId, frame, settleSnap } = window.__h;
        window.__records.find((r) => r.id === id).imagery_at = "2026-09-27T00:00:00.000Z";
        window.dispatchEvent(new StorageEvent("storage", { key }));
        const out = [];
        const start = performance.now();
        while (performance.now() - start < deadline) {
          const el = byId(id);
          out.push(el ? settleSnap(el) : { id, present: false, t: performance.now() });
          await frame();
        }
        return out;
      },
      { id: SETTLE_C, key: MISSIONS_CHANGED_KEY, deadline: 900 },
    );
    check(
      "settle",
      "inferred Flown dissolves without settling",
      inferred.some((f) => f.leaving) && inferred.every((f) => !f.settling) && inferred.some((f) => !f.present),
      `${inferred.filter((f) => f.leaving).length} leaving samples`,
    );

    // 4. Filter on: the marked row stays; a one-shot crossfade, no hold, never
    //    inert (the row is still visible, so there is no departure to settle).
    await toggleArchived(page);
    const flash = await page.evaluate(
      async ({ id }) => {
        const { byId, frame, settleSnap } = window.__h;
        const btn = [...byId(id).querySelectorAll("button")].find((b) => b.textContent.trim() === "Mark Flown");
        if (!btn) throw new Error("Mark Flown button not found");
        btn.click();
        const out = [];
        const start = performance.now();
        while (performance.now() - start < 600) {
          const el = byId(id);
          out.push(el ? settleSnap(el) : { id, present: false, t: performance.now() });
          await frame();
        }
        return out;
      },
      { id: SETTLE_B },
    );
    const flashed = flash.filter((f) => f.present && f.settling);
    check(
      "settle",
      "filter on: a one-shot crossfade, never a hold",
      flashed.length > 0 && flash.every((f) => !f.present || (!f.inert && !f.leaving)),
      `${flashed.length} settling samples`,
    );
    check("settle", "filter on: the row stays mounted", flash[flash.length - 1]?.present === true);
    check(
      "settle",
      "filter on: the crossfade clears by ~150ms",
      flashed.length > 0 && flashed[flashed.length - 1].t - flashed[0].t <= 400,
      flashed.length ? `${(flashed[flashed.length - 1].t - flashed[0].t).toFixed(0)}ms` : "never settling",
    );

    // 5. Unmark: the operator acting again, but never the moment.
    const unmark = await page.evaluate(
      async ({ id }) => {
        const { byId, frame } = window.__h;
        const btn = [...byId(id).querySelectorAll("button")].find((b) => b.textContent.trim() === "Unmark Flown");
        if (!btn) throw new Error("Unmark button not found");
        btn.click();
        let settling = false;
        let state = null;
        const start = performance.now();
        while (performance.now() - start < 600) {
          const el = byId(id);
          if (el) {
            if (el.className.includes("settling")) settling = true;
            state = el.querySelector('[class*="chip"]')?.textContent.trim() ?? state;
          }
          await frame();
        }
        return { settling, state };
      },
      { id: SETTLE_B },
    );
    check("settle", "Unmark never plays the moment", !unmark.settling, `chip ${unmark.state}`);

    // 6. Filter off, then re-Mark: a new operator cause replays the moment.
    await toggleArchived(page);
    const replay = await settleRun(page, SETTLE_B);
    analyzeFlownRun("settle/replay", replay);

    // 7. A reload after the moment re-renders without replaying it.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.querySelector("[data-row-id]"), null, { timeout: 30000 });
    const afterReload = await page.evaluate(async () => {
      const { frame } = window.__h;
      let lit = false;
      const start = performance.now();
      while (performance.now() - start < 600) {
        lit =
          lit ||
          [...document.querySelectorAll("[data-row-id]")].some(
            (el) => el.className.includes("settling") || el.className.includes("leaving"),
          );
        await frame();
      }
      return lit;
    });
    check("settle", "a reload never replays the moment", !afterReload);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// UI-25 (#294) M7 fix — overlapping marks: a second Mark Flown while the first
// row still settles must not strand the first row on its pre-Flown reading.
// ---------------------------------------------------------------------------

async function flownOverlap(browser) {
  const { context, page } = await contextFor(browser, {
    width: 1440,
    height: 900,
    seed: SETTLE_SEED,
    manifest: SETTLE_MANIFEST,
    rowReady: true,
  });
  try {
    const run = await page.evaluate(
      async ({ first, second, gap, deadline }) => {
        const { byId, frame, settleSnap } = window.__h;
        const mark = (id) => {
          const btn = [...byId(id).querySelectorAll("button")].find((b) => b.textContent.trim() === "Mark Flown");
          if (!btn) throw new Error(`Mark Flown button not found in ${id}`);
          btn.click();
        };
        const snap = (el) => {
          const f = byId(el);
          return f ? settleSnap(f) : null;
        };
        const frames = [];
        mark(first);
        const tFirst = performance.now();
        let tSecond = null;
        while (performance.now() - tFirst < deadline) {
          const t = performance.now();
          if (tSecond === null && t - tFirst >= gap) {
            mark(second);
            tSecond = performance.now();
          }
          frames.push({ t, first: snap(first), second: snap(second) });
          if (tSecond !== null && !byId(first) && !byId(second)) break;
          await frame();
        }
        return { frames, tFirst, tSecond };
      },
      { first: SETTLE_A, second: SETTLE_B, gap: 400, deadline: 3000 },
    );
    const { frames, tSecond } = run;
    const tSettleA = frames.find((f) => f.first?.settling)?.t ?? null;
    const tSettleB = frames.find((f) => f.second?.settling)?.t ?? null;
    const went = (side) => frames.some((f, i) => i > 0 && !f[side] && frames[i - 1][side]);

    check(
      "overlap",
      "the first row settles before the second is marked",
      tSettleA !== null && tSecond !== null && tSettleA < tSecond,
      `first settle at ${tSettleA === null ? "never" : Math.round(tSettleA - run.tFirst)}ms, second mark at ${tSecond === null ? "never" : Math.round(tSecond - run.tFirst)}ms`,
    );
    check(
      "overlap",
      "the second mark lands mid-chain",
      tSettleA !== null && tSecond !== null && tSecond - tSettleA < 1000,
      `${tSettleA !== null && tSecond !== null ? Math.round(tSecond - tSettleA) : "?"}ms after the first settle`,
    );
    check(
      "overlap",
      "the second row settles Flown",
      tSettleB !== null && frames.some((f) => f.second?.settling && f.second.chipText === "Flown"),
      tSettleB === null ? "never settling" : `settle at ${Math.round(tSettleB - run.tFirst)}ms`,
    );
    check(
      "overlap",
      "the first row is still settling after the second mark",
      tSecond !== null && frames.some((f) => f.first?.settling && f.t > tSecond + 50),
      `${frames.filter((f) => f.first?.settling && tSecond !== null && f.t > tSecond + 50).length} samples after the mark`,
    );
    const lit = frames.filter((f) => f.first && tSettleA !== null && f.t >= tSettleA);
    // The dissolve itself renders the committed read (the existing single-mark
    // behaviour); the reading and the settle state are asserted up to the
    // moment the row enters `.leaving`.
    const beforeLeaving = lit.filter((f) => !f.first.leaving);
    check(
      "overlap",
      "the first row keeps its Flown reading until it enters .leaving",
      beforeLeaving.length > 0 && beforeLeaving.every((f) => f.first.chipText === "Flown"),
      `${beforeLeaving.filter((f) => f.first.chipText !== "Flown").length} stale samples of ${beforeLeaving.length}`,
    );
    check(
      "overlap",
      "the first row stays inert until it dissolves",
      lit.length > 0 && lit.every((f) => f.first.inert),
      `${lit.filter((f) => !f.first.inert).length} interactive samples of ${lit.length}`,
    );
    check(
      "overlap",
      "the first row stays settling until it enters .leaving",
      lit.length > 0 && lit.every((f) => f.first.leaving || f.first.settling),
      `${lit.filter((f) => !f.first.leaving && !f.first.settling).length} bare samples of ${lit.length}`,
    );
    check(
      "overlap",
      "the first row enters .leaving before it detaches",
      lit.some((f) => f.first.leaving) && went("first"),
      `${lit.filter((f) => f.first.leaving).length} leaving samples`,
    );
    check(
      "overlap",
      "both rows detach",
      went("first") && went("second"),
      `first gone ${went("first")}, second gone ${went("second")}`,
    );
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Reduced motion — 150ms opacity crossfades, no FLIP, soft arrival
// ---------------------------------------------------------------------------

async function reducedMotion(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900, reduced: true, video: true });
  const video = page.video();
  try {
    const run = await page.evaluate(
      async ({ leaverId, deadline }) => {
        const { byId, allSlots, frame, rowIdAt, slotSnap } = window.__h;
        const frames = [];
        const snap = () => {
          const f = { t: performance.now(), slots: allSlots().map(slotSnap), leaver: null };
          const lv = byId(leaverId);
          if (lv) {
            const cs = getComputedStyle(lv);
            const r = lv.getBoundingClientRect();
            f.leaver = {
              leaving: lv.className.includes("leaving"),
              filter: cs.filter,
              opacity: cs.opacity,
              transitionProperty: cs.transitionProperty,
              transitionDuration: cs.transitionDuration,
              inline: lv.style.transform,
              transform: cs.transform,
              hitRowId: rowIdAt(r.left + r.width / 2, r.top + r.height / 2),
            };
          }
          return f;
        };
        for (let i = 0; i < 3; i++) {
          frames.push(snap());
          await frame();
        }
        const btn = [...byId(leaverId).querySelectorAll("button")].find((b) => b.textContent.trim() === "Withdraw");
        btn.click();
        const start = performance.now();
        while (performance.now() - start < deadline) {
          frames.push(snap());
          await frame();
        }
        return frames;
      },
      { leaverId: LEAVER, deadline: 500 },
    );
    const withLeaver = run.filter((f) => f.leaver && f.leaver.leaving);
    const t0 = withLeaver[0]?.t ?? null;
    check("reduced", "leaving filter is none", withLeaver.length > 0 && withLeaver.every((f) => f.leaver.filter === "none"), withLeaver[0]?.leaver.filter);
    check(
      "reduced",
      "leaving transition is opacity 0.15s",
      withLeaver.length > 0 &&
        withLeaver.every((f) => f.leaver.transitionProperty.trim() === "opacity" && f.leaver.transitionDuration.trim() === "0.15s"),
      `${withLeaver[0]?.leaver.transitionProperty} / ${withLeaver[0]?.leaver.transitionDuration}`,
    );
    const rel = withLeaver.map((f) => f.t - t0);
    check("reduced", "leaver present at ~80ms", rel.some((r) => r >= 55 && r <= 115), rel.map((r) => r.toFixed(0)).join(","));
    const lastRel = rel[rel.length - 1];
    // t0 is the first sample *after* the class lands, so the mounted window is
    // measured a sample short of the real 150 ms hold; what matters is that it
    // is nowhere near the 250 ms hold.
    check("reduced", "leaver detached by ~150ms (not the 250ms hold)", lastRel >= 60 && lastRel <= 220, `last mounted at ${lastRel.toFixed(0)}ms`);
    const moved = run.flatMap((f) => f.slots).filter((s) => !isIdentity(s.transform) || s.inline !== "");
    check("reduced", "FLIP is skipped: survivor transforms stay identity", moved.length === 0, moved.slice(0, 2).map((s) => s.transform).join(" "));
    check(
      "reduced",
      "leaving row centre resolves outside the leaver",
      withLeaver.length > 0 && withLeaver.every((f) => f.leaver.hitRowId !== LEAVER),
      withLeaver.map((f) => f.leaver.hitRowId ?? "none").join(","),
    );

    // Arrival: the soft keyframe, no blur.
    const arrivalFrames = await page.evaluate(
      async ({ record, key }) => {
        const { byId, frame } = window.__h;
        window.__records.push(record);
        window.dispatchEvent(new StorageEvent("storage", { key }));
        const out = [];
        const start = performance.now();
        while (performance.now() - start < 320) {
          const el = byId(record.id);
          const cs = el ? getComputedStyle(el) : null;
          out.push({ t: performance.now(), present: !!el, opacity: cs ? cs.opacity : null, filter: cs ? cs.filter : null, animationName: cs ? cs.animationName : null });
          await frame();
        }
        return out;
      },
      { record: ARRIVAL, key: MISSIONS_CHANGED_KEY },
    );
    const first = arrivalFrames.find((f) => f.present);
    check("reduced", "arrival uses the soft keyframe", !!first && (first.animationName ?? "").endsWith("rowArriveSoft"), first?.animationName ?? "never present");
    check("reduced", "arrival has no blur", !!first && blurOf(first.filter) === 0 && Number(first.opacity) < 1, `${first?.filter} / ${first?.opacity}`);
    const settled = first ? arrivalFrames.filter((f) => f.present && f.t - first.t >= 165) : [];
    check(
      "reduced",
      "arrival settles by 150ms+",
      !!first && settled.length > 0 && settled.every((f) => f.opacity === "1"),
      settled.length ? settled[0].opacity : "no post-150ms sample",
    );
  } finally {
    await context.close();
    await saveVideo(video, "reduced-motion");
  }
}
// ---------------------------------------------------------------------------
// 375x812 touch, 4x CPU — Remove (the second removal path), then an arrival
// ---------------------------------------------------------------------------

async function mobileRemove(browser) {
  const { context, page } = await contextFor(browser, { width: 375, height: 812, mobile: true, throttle: 4, video: true });
  const video = page.video();
  try {
    const run = await page.evaluate(
      async ({ leaverId, belowId, deadline }) => {
        const { byId, allSlots, frame, rowIdAt, slotSnap } = window.__h;
        const frames = [];
        const snap = () => {
          const f = { t: performance.now(), slots: allSlots().map(slotSnap), leaver: null };
          const lv = byId(leaverId);
          if (lv) {
            const cs = getComputedStyle(lv);
            const r = lv.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            f.leaver = {
              opacity: cs.opacity,
              filter: cs.filter,
              transform: cs.transform,
              leaving: lv.className.includes("leaving"),
              inert: lv.inert === true,
              ariaHidden: lv.getAttribute("aria-hidden") === "true",
              hitRowId: cy > 0 && cy < innerHeight ? rowIdAt(cx, cy) : null,
            };
          }
          return f;
        };
        const remove = [...byId(leaverId).querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove");
        if (!remove) throw new Error("Remove button not found");
        remove.click();
        let confirm = null;
        const waitStart = performance.now();
        while (performance.now() - waitStart < 3000 && !confirm) {
          const dialog = document.querySelector("dialog[open]");
          if (dialog) confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove") ?? null;
          if (!confirm) await frame();
        }
        if (!confirm) throw new Error("remove sheet never opened");
        for (let i = 0; i < 3; i++) {
          frames.push(snap());
          await frame();
        }
        confirm.click();
        const start = performance.now();
        while (performance.now() - start < deadline) {
          frames.push(snap());
          await frame();
        }
        const survivor = byId(belowId);
        return { frames, rowHeight: survivor ? survivor.getBoundingClientRect().height : 0 };
      },
      { leaverId: REMOVE, belowId: BELOW_REMOVE, deadline: 1200 },
    );
    const { frames, rowHeight } = run;
    const mounted = frames.filter((f) => f.leaver && f.leaver.leaving);
    check("mobile-remove", "leaver dissolves", mounted.some((f) => Number(f.leaver.opacity) < 0.95 && blurOf(f.leaver.filter) > 0), `${mounted.length} mounted frames`);
    check("mobile-remove", "leaver is inert and aria-hidden", mounted.length > 0 && mounted.every((f) => f.leaver.inert && f.leaver.ariaHidden));
    const mid = mounted[Math.floor(mounted.length / 2)];
    check("mobile-remove", "leaver centre resolves outside it", !!mid && mid.leaver.hitRowId !== REMOVE, mid ? `hit ${mid.leaver.hitRowId}` : "none");
    const detachIndex = frames.findIndex((f, i) => f.leaver === null && i > 0 && frames[i - 1].leaver !== null);
    const post = detachIndex >= 0 ? frames.slice(detachIndex) : [];
    check("mobile-remove", "FLIP engages after detach", post.some((f) => f.slots.some((s) => s.id !== REMOVE && Math.abs(tyOf(s.transform)) > 0.5)));
    const lastMounted = [...frames].reverse().find((f) => f.leaver && f.leaver.leaving);
    const firstPost = post[0];
    const topOf = (f, id) => f.slots.find((s) => s.id === id)?.top ?? NaN;
    check(
      "mobile-remove",
      "the gap closes with no jump at unmount",
      !!lastMounted && !!firstPost && Math.abs(topOf(firstPost, BELOW_REMOVE) - topOf(lastMounted, BELOW_REMOVE)) <= rowHeight / 2 + 12,
      `${topOf(lastMounted, BELOW_REMOVE).toFixed(0)} -> ${topOf(firstPost, BELOW_REMOVE).toFixed(0)} (half row ${(rowHeight / 2).toFixed(0)})`,
    );
    if (firstPost) {
      const wait = Math.max(0, 650 - (frames[frames.length - 1].t - firstPost.t));
      await page.waitForTimeout(wait);
    }
    const settled = await page.evaluate(
      async () => {
        const { allSlots, frame, isIdentity, slotSnap } = window.__h;
        const out = { identity: true, inline: true };
        for (let i = 0; i < 3; i++) {
          for (const s of allSlots().map(slotSnap)) {
            if (!isIdentity(s.transform)) out.identity = false;
            if (s.inline !== "") out.inline = false;
          }
          await frame();
        }
        return out;
      },
    );
    check("mobile-remove", "transforms identity by ~600ms", settled.identity && settled.inline);

    const arrivalFrames = await page.evaluate(
      async ({ record, key }) => {
        const { byId, frame } = window.__h;
        window.__records.push(record);
        window.dispatchEvent(new StorageEvent("storage", { key }));
        const out = [];
        const start = performance.now();
        while (performance.now() - start < 400) {
          const el = byId(record.id);
          const cs = el ? getComputedStyle(el) : null;
          out.push({ t: performance.now(), present: !!el, opacity: cs ? cs.opacity : null, filter: cs ? cs.filter : null });
          await frame();
        }
        return out;
      },
      { record: ARRIVAL_MOBILE, key: MISSIONS_CHANGED_KEY },
    );
    const arrFirst = arrivalFrames.find((f) => f.present);
    check("mobile-remove", "the arrival blurs in", !!arrFirst && Number(arrFirst.opacity) < 1 && blurOf(arrFirst.filter) > 0, `${arrFirst?.opacity} / ${arrFirst?.filter}`);
    await page.waitForTimeout(600);
  } finally {
    await context.close();
    await saveVideo(video, "375-leave-arrive");
  }
}

// ---------------------------------------------------------------------------
// 1440x900 recording: one action by keyboard focus + Enter, then an arrival
// ---------------------------------------------------------------------------

async function desktopVideo(browser) {
  const { context, page } = await contextFor(browser, { width: 1440, height: 900, video: true });
  const video = page.video();
  try {
    await page.waitForTimeout(700);
    await page.locator(`[data-row-id="${LEAVER}"] button`, { hasText: "Withdraw" }).focus();
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    await page.evaluate(
      ({ record, key }) => {
        window.__records.push(record);
        window.dispatchEvent(new StorageEvent("storage", { key }));
      },
      { record: ARRIVAL, key: MISSIONS_CHANGED_KEY },
    );
    await page.waitForTimeout(1500);
  } finally {
    await context.close();
    await saveVideo(video, "1440-leave-arrive");
  }
}

// ---------------------------------------------------------------------------
// Stills: both viewports, plus a frozen mid-dissolve and mid-slide frame
// ---------------------------------------------------------------------------

async function stills(browser) {
  {
    const { context, page } = await contextFor(browser, { width: 1440, height: 900 });
    try {
      await saveStill(page, "1440-missions");
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await contextFor(browser, { width: 375, height: 812, mobile: true });
    try {
      await saveStill(page, "375-missions");
    } finally {
      await context.close();
    }
  }
  {
    // The hold timer would unmount the leaver mid-screenshot, so this context
    // stretches the JS hold and pauses the opacity transition at 120ms.
    const { context, page } = await contextFor(browser, { width: 1440, height: 900, slowTimers: true });
    try {
      await page.evaluate(
        async () => {
          const { byId, frame } = window.__h;
          const b = [...byId("m-e2e-0005").querySelectorAll("button")].find((x) => x.textContent.trim() === "Withdraw");
          b.click();
          const start = performance.now();
          while (performance.now() - start < 2000) {
            const el = byId("m-e2e-0005");
            if (el && el.className.includes("leaving")) {
              const anim = el.getAnimations().find((a) => a.transitionProperty === "opacity");
              if (anim) {
                anim.pause();
                anim.currentTime = 120;
                await frame();
                await frame();
                return;
              }
            }
            await frame();
          }
          throw new Error("dissolve transition never started");
        },
      );
      await saveStill(page, "1440-mid-dissolve");
    } finally {
      await context.close();
    }
  }
  {
    // Freeze the FLIP: the survivor below the removed row, paused 90ms in.
    const { context, page } = await contextFor(browser, { width: 375, height: 812, mobile: true });
    try {
      await page.evaluate(
        async ({ leaverId, belowId }) => {
          const { byId, frame } = window.__h;
          const remove = [...byId(leaverId).querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove");
          remove.click();
          let confirm = null;
          const waitStart = performance.now();
          while (performance.now() - waitStart < 3000 && !confirm) {
            const dialog = document.querySelector("dialog[open]");
            if (dialog) confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove") ?? null;
            if (!confirm) await frame();
          }
          if (!confirm) throw new Error("remove sheet never opened");
          confirm.click();
          const start = performance.now();
          while (performance.now() - start < 2500) {
            const gone = !byId(leaverId);
            const el = byId(belowId);
            if (gone && el) {
              const anim = el.getAnimations().find((a) => a.transitionProperty === "transform");
              if (anim) {
                anim.pause();
                anim.currentTime = 90;
                await frame();
                await frame();
                return;
              }
            }
            await frame();
          }
          throw new Error("FLIP transition never started");
        },
        { leaverId: REMOVE, belowId: BELOW_REMOVE },
      );
      await saveStill(page, "375-mid-slide");
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
try {
  {
    const { context, page } = await contextFor(browser, { width: 1440, height: 900 });
    try {
      await seedCheck(page);
      await firstLoadAndIdle(page);
    } finally {
      await context.close();
    }
  }
  await leaveWithdraw(browser);
  await fullDissolve(browser);
  await arrival(browser);
  await archivedToggle(browser);
  await holdRule(browser);
  await flownSettle(browser);
  await flownOverlap(browser);
  await reducedMotion(browser);
  await mobileRemove(browser);
  await desktopVideo(browser);
  await stills(browser);
} finally {
  await browser.close();
}

const pngs = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length;
const webms = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm")).length;
console.log(`artifacts: ${pngs} png, ${webms} webm in ${OUT}`);
check("artifacts", "at least 4 png", pngs >= 4, String(pngs));
check("artifacts", "at least 3 webm", webms >= 3, String(webms));
console.log(failed ? "mission-rows check: FAIL" : "mission-rows check: all pass");
process.exit(failed ? 1 : 0);

