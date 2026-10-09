// #338 phone fit check: on an iPhone XS (375x812, DPR 3, iOS UA, touch) and the
// same phone with Safari's toolbars showing (375x635), the planner must not
// scroll sideways or down, and the bottom tab bar must be inside the visible
// viewport, in every view. Prints the widest offenders when it fails.
// Usage: npm run check:phone-fit -- http://127.0.0.1:3155
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "./lib/harness.mjs";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { deriveMissions } from "../lib/missionRecords.ts";

const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// One saved Mission with an Area, so the Summary shows its figures.
const SPEC = { ...DEFAULT_SPEC, site: "E2E Site", site_id: "e2e-site-abc123", date: "2026-09-26",
  aoi: [[37.8, -122.4], [37.8, -122.39], [37.81, -122.39], [37.81, -122.4]], home: [37.8, -122.4] };
const RECORD = { id: "m-e2e-0001", site_id: SPEC.site_id, site: SPEC.site, name: "North half", date: SPEC.date,
  created_at: "2026-09-26T00:00:00.000Z", updated_at: "2026-09-26T00:00:00.000Z", spec: SPEC, dispatched_key: null };
const PAYLOAD = { missions: deriveMissions([RECORD], {}, {}), archived_count: 0, stale_cards: [], host: { notice: null, drift: null }, unreadable: [], now: Date.now() };
let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` -- ${detail}` : ""}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch(chromiumLaunchOptions());
for (const [width, height] of [[375, 812], [375, 635]]) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  await context.addInitScript((payload) => {
    localStorage.setItem("drone-planner.wayfinder-key", "evidence");
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      return url.includes("/api/missions")
        ? Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }))
        : orig(input, init);
    };
  }, PAYLOAD);
  const page = await context.newPage();
  await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
  await page.locator("nav[aria-label='Show'] button").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Edit", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  for (const view of ["Missions", "Map", "Settings"]) {
    await page.locator("nav[aria-label='Show'] button", { hasText: view }).click();
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = window.innerWidth;
      const nav = document.querySelector("nav[aria-label='Show']").getBoundingClientRect();
      const wide = [...document.body.querySelectorAll("*")]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ e, r }) => r.width > 0 && r.right > vw + 1 && getComputedStyle(e).visibility !== "hidden" && e.closest("[inert]") === null)
        .slice(0, 6)
        .map(({ e, r }) => `${e.tagName}.${String(e.className).slice(0, 40)} right=${Math.round(r.right)}`);
      return {
        vw, vh: window.innerHeight, scale: window.visualViewport.scale,
        sw: de.scrollWidth, sh: de.scrollHeight, bsw: document.body.scrollWidth,
        small: [...document.querySelectorAll("input:not([type=range]):not([type=checkbox]):not([type=radio]), select, textarea")]
          .filter((e) => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16)
          .map((e) => `${e.tagName}[${e.type ?? ""}] ${getComputedStyle(e).fontSize}`),
        navBottom: nav.bottom, navTop: nav.top, wide,
      };
    });
    const t = `${width}x${height}/${view}`;
    check(`${t} layout viewport is ${width}px`, m.vw === width && m.scale === 1, `innerWidth=${m.vw} scale=${m.scale}`);
    check(`${t} no horizontal scroll`, m.sw <= m.vw && m.bsw <= m.vw, `scrollWidth=${m.sw} body=${m.bsw} wide=[${m.wide.join("; ")}]`);
    check(`${t} no vertical scroll`, m.sh <= m.vh, `scrollHeight=${m.sh} innerHeight=${m.vh}`);
    // iOS Safari zooms the page in on focus when a field's text is under 16px, and leaves it zoomed.
    check(`${t} fields are 16px or larger (no iOS focus zoom)`, m.small.length === 0, m.small.slice(0, 4).join("; "));
    check(`${t} tab bar inside the viewport`, m.navTop >= 0 && m.navBottom <= m.vh + 0.5, `nav ${m.navTop}..${m.navBottom} of ${m.vh}`);
  }
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
