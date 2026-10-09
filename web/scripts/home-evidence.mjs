// UI-15 evidence (ticket #237): proves AC1-AC5 of the home page against the
// BUILT app over real HTTP, with the OAuth providers replaced by the
// in-process stand-in (lib/oauthStandin.ts) and the database a local PGlite
// directory. It prints one row per assertion (`T1 ok|FAIL — detail`), writes
// the committed screenshots into docs/ui-theme/screenshots/ui-15/, and exits
// non-zero on any failed assertion.
//
// Usage: cd web && npm run build && node scripts/home-evidence.mjs
//
// Phases and the identity arrangement (deterministic, in this order):
//   identities are consumed one per GET /authorize, in queue order
//   (lib/oauthStandin.ts:90-95), so the queue is laid out to match the phases:
//     1 t1-probe-google     T1 375x812 pill click (pending)
//     2 t1-probe-github     T1 1440x900 pill click (pending)
//     3 owner               T2 owner sign-in -> approved via OWNER_EMAIL
//     4 pending             T2 waiting screen
//     5 t5-probe-google     T5 keyboard Enter
//     6 spare               reserved
//   Each phase waits for its flow to finish (callback -> landing screen)
//   before the next phase starts, so T2's owner/pending can never be starved
//   by T1's probes.
//
// T3 starts a SECOND `next start` on another port with all twelve accountEnv
// variables absent and stops it before T4 (the heavy-command mutex's one
// deliberate exception).
//
// Scratch: web/.evidence/ (gitignored), database web/.pglite/home-evidence
// (gitignored). Screenshots are the only committed output.
//
// ponytail: the ~100-line harness (freePort/run/launchBrowser/stand-in +
// next start + cleanup) is duplicated from scripts/auth-evidence.mjs per
// ADR-237-7. Extract scripts/lib/harness.mjs when a third evidence script
// lands.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const evidenceDir = path.join(webRoot, ".evidence");
const outDir = path.join(repoRoot, "docs/ui-theme/screenshots/ui-15");
const dbDir = path.join(webRoot, ".pglite", "home-evidence");
const DATABASE_URL = `pglite://${dbDir}`;
const OWNER_EMAIL = "owner@example.com";
const PENDING_EMAIL = "waiting@example.com";
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

const IDENTITIES = [
  { id: "t1-probe-google", name: "T1 Google Probe", email: "t1-google@example.com", image: null },
  { id: "t1-probe-github", name: "T1 GitHub Probe", email: "t1-github@example.com", image: null },
  { id: "owner", name: "Owner Example", email: OWNER_EMAIL, image: null },
  { id: "pending", name: "Waiting Example", email: PENDING_EMAIL, image: null },
  { id: "t5-probe-google", name: "T5 Keyboard Probe", email: "t5-keyboard@example.com", image: null },
  { id: "spare", name: "Spare Identity", email: "spare@example.com", image: null },
];

/** The planner files this ticket must not have touched (out-of-scope guard). */
const PLANNER_PATHS = [
  "web/components/MissionList.tsx",
  "web/components/SummaryBar.tsx",
  "web/components/MapPane.tsx",
  "web/components/Notice.tsx",
  "web/components/Sheet.tsx",
  "web/components/plan",
  "web/app/plan",
];

// ---------------------------------------------------------------------------
// Assertion log
// ---------------------------------------------------------------------------

let failed = false;
function row(phase, ok, detail) {
  console.log(`${phase} ${ok ? "ok" : "FAIL"} — ${detail}`);
  if (!ok) failed = true;
}

/** PNG width/height from the IHDR header; null when the file is not a PNG. */
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

async function shoot(page, name, expected) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file });
  const size = pngSize(file);
  const ok = !!size && size.width === expected.width && size.height === expected.height && size.bytes > 1000;
  return { file, size, ok };
}

const shotDetail = (shot, name) =>
  `${name} ${shot.size ? `${shot.size.width}×${shot.size.height}, ${shot.size.bytes} B` : "MISSING/EMPTY"}`;

// ---------------------------------------------------------------------------
// Harness (duplicated from auth-evidence.mjs — see the ponytail note above)
// ---------------------------------------------------------------------------

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: webRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    child.stdout.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
    child.stderr.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve(lines) : reject(new Error(`${command} exited ${code}:\n${lines.join("\n")}`))));
  });
}

/** playwright-core resolves its own cache; on this machine that is fine, but a
 *  mismatch must not send anyone downloading browsers. */
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
    if (!existsSync(cache)) throw error;
    for (const relative of readdirSync(cache, { recursive: true })) {
      const name = path.basename(String(relative));
      if (name === "Google Chrome for Testing" || name === "chrome-headless-shell") {
        const executablePath = path.join(cache, String(relative));
        console.log(`playwright default launch failed; using cached chromium at ${executablePath}`);
        return chromium.launch({ executablePath });
      }
    }
    throw error;
  }
}

function spawnServer(env, port) {
  const lines = [];
  const proc = spawn("npm", ["run", "start", "--", "-p", String(port)], {
    cwd: webRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
  proc.stderr.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
  const exit = new Promise((resolve) => proc.once("exit", resolve));
  return { proc, lines, exit };
}

async function waitReady(server, url, label) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (server.proc.exitCode !== null) throw new Error(`${label} exited early:\n${server.lines.join("\n")}`);
    try {
      const probe = await fetch(url);
      if (probe.status === 200) return;
    } catch {}
    if (Date.now() > deadline) throw new Error(`${label} did not answer on ${url}:\n${server.lines.join("\n")}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function stopServer(server) {
  if (!server) return;
  server.proc.kill("SIGTERM");
  await Promise.race([server.exit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (server.proc.exitCode === null) server.proc.kill("SIGKILL");
}

const authorizeCount = (standin) => standin.requests.filter((r) => r.startsWith("GET /authorize")).length;

async function activeElement(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return {
      text: el?.textContent?.trim() ?? "",
      focusVisible: !!el && typeof el.matches === "function" ? el.matches(":focus-visible") : false,
    };
  });
}

/** Wait for the flow of an in-flight pill/Enter to finish: the identity is
 *  pending, so the app lands on the waiting screen. Proves the queue advanced. */
async function waitForFlowLanding(page) {
  try {
    await page.getByText("Your account is waiting for approval").waitFor({ timeout: 45_000 });
    return true;
  } catch {
    return false;
  }
}

async function bodyText(page) {
  return ((await page.locator("body").innerText()) ?? "").replace(/\s+/g, " ").slice(0, 160);
}

// better-auth's default special rule is 3 POSTs per 10 s on paths starting
// with /sign-in (dist/api/rate-limiter/index.mjs:301-309, rolling window from
// the last allowed request). All five sign-ins in this script share that
// server-side key for this run's 127.0.0.1, so mirror the rule here: a 4th
// sign-in within 10 s of the last allowed one is refused with
// "Too many requests. Please try again later."
const signInRate = { last: 0, count: 0 };
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 3;
async function respectSignInRateLimit() {
  for (;;) {
    const now = Date.now();
    if (now - signInRate.last >= RATE_WINDOW_MS) {
      signInRate.count = 1;
      signInRate.last = now;
      return;
    }
    if (signInRate.count < RATE_MAX) {
      signInRate.count += 1;
      signInRate.last = now;
      return;
    }
    const wait = signInRate.last + RATE_WINDOW_MS - now + 250;
    console.log(`      (waiting ${Math.ceil(wait / 1000)}s for better-auth's rolling 3-per-10s sign-in limit)`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** Wait until the client has hydrated — the hero's src is written by an effect,
 *  so it is a post-hydration marker — then click a sign-in pill and return the
 *  /authorize request it started (or null). */
async function clickPill(page, standin, label) {
  await page.locator('video[src*="/hero/"], img[src*="/hero/"]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await respectSignInRateLimit();
  const requestP = page
    .waitForRequest((request) => request.url().startsWith(`${standin.baseUrl}/authorize`), { timeout: 30_000 })
    .catch(() => null);
  await page.getByRole("button", { name: label, exact: true }).click();
  return requestP;
}

// ---------------------------------------------------------------------------
// T1 — configured server, signed out: hero + title + both pills at both
// viewports; each pill click reaches stand-in.baseUrl with GET /authorize
// ---------------------------------------------------------------------------

async function phaseT1(browser, standin, base) {
  for (const { viewport, label, provider, file, mobile } of [
    { viewport: { width: 375, height: 812 }, label: "375×812", provider: "Continue with Google", file: "home-375.png", mobile: true },
    { viewport: { width: 1440, height: 900 }, label: "1440×900", provider: "Continue with GitHub", file: "home-1440.png", mobile: false },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
    try {
      const page = await context.newPage();
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });

      // The hero: normal motion is a <video> with a /hero/ source; under
      // reduced motion HeroScene swaps in the poster <img>.
      let kind = "video";
      let src = null;
      try {
        const video = page.locator('video[src*="/hero/"]').first();
        await video.waitFor({ timeout: 15_000 });
        src = await video.getAttribute("src");
      } catch {
        kind = "poster";
        const img = page.locator('img[src*="/hero/"]').first();
        await img.waitFor({ timeout: 5_000 });
        src = await img.getAttribute("src");
      }
      const titleOk = await page.getByRole("heading", { level: 1, name: "Mission Control" }).isVisible();
      const googleOk = await page.getByRole("button", { name: "Continue with Google", exact: true }).isVisible();
      const githubOk = await page.getByRole("button", { name: "Continue with GitHub", exact: true }).isVisible();
      const waitingOk = await page.getByText("Your account is waiting for approval").isVisible().catch(() => false);
      // D8, behaviourally: a prerendered / would serve the unconfigured markup
      // to the configured server, so its absence here is part of the proof.
      const quietOk = !(await page
        .getByText("Sign-in is not set up on this deployment yet")
        .isVisible()
        .catch(() => false));

      await page.waitForTimeout(1_200); // let the once-per-visit entrance settle
      const shot = await shoot(page, file, viewport);
      row(
        "T1",
        !!src && titleOk && googleOk && githubOk && !waitingOk && quietOk && shot.ok,
        `${label} signed out: ${kind} src=${src}; h1 "Mission Control"; pills Google+GitHub; no unconfigured line; ${shotDetail(shot, file)}`,
      );

      // Click the pill in this fresh context and watch the browser reach the
      // stand-in's /authorize over the real client path.
      const before = authorizeCount(standin);
      const request = await clickPill(page, standin, provider);
      const landed = await waitForFlowLanding(page);
      const after = authorizeCount(standin);
      const url = request ? new URL(request.url()) : null;
      row(
        "T1",
        !!request && request.method() === "GET" && after === before + 1 && landed,
        request
          ? `${label}: "${provider}" click → ${request.method()} ${url.origin}${url.pathname} (stand-in queue ${before}→${after}); flow landed on the waiting screen`
          : `${label}: "${provider}" click started no GET /authorize request; url=${page.url()}; body="${await bodyText(page)}"`,
      );
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// T2 — owner: sign in on /, land on /plan, Settings line, Sign out -> / with
// an empty session; pending: waiting text + email + Sign out
// ---------------------------------------------------------------------------

async function phaseT2(browser, standin, base) {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ownerContext.newPage();
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const before = authorizeCount(standin);
    const request = await clickPill(page, standin, "Continue with Google");
    const ownerLanded = await page
      .waitForURL((url) => url.pathname === "/plan", { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    row(
      "T2",
      !!request && ownerLanded,
      ownerLanded
        ? `owner ${OWNER_EMAIL} signed in through the stand-in (GET /authorize, queue ${before}→${authorizeCount(standin)}) and the approved state pushed to /plan (${page.url()})`
        : `owner flow did not land on /plan: request=${!!request}, url=${page.url()}, body="${await bodyText(page)}"`,
    );

    if (ownerLanded) {
      const panel = page.locator("#settings-panel");
      const line = panel.getByText("Signed in as");
      await line.waitFor({ timeout: 15_000 });
      const lineText = ((await line.textContent()) ?? "").replace(/\s+/g, " ").trim();
      const signOut = panel.getByRole("button", { name: "Sign out", exact: true });
      const signOutVisible = await signOut.isVisible();
      // The line is the last child of the settings column: scroll it into the
      // viewport so the screenshot actually shows it.
      await signOut.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const box = await signOut.boundingBox();
      const inFrame = !!box && box.y >= 0 && box.y + box.height <= 900;
      const settingsShot = await shoot(page, "settings-line.png", { width: 1440, height: 900 });
      row(
        "T2",
        lineText === "Signed in as Owner Example ·" && signOutVisible && inFrame && settingsShot.ok,
        `Settings line "${lineText}" + Sign out button (in frame: y=${box ? Math.round(box.y) : "?"}); ${shotDetail(settingsShot, "settings-line.png")}`,
      );

      await signOut.click();
      const backHome = await page
        .waitForURL((url) => url.pathname === "/", { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      const pillsBack = await page.getByRole("button", { name: "Continue with Google", exact: true }).isVisible();
      row("T2", backHome && pillsBack, `Sign out returned to / (${page.url()}) and the signed-out pills are back`);

      const sessionResponse = await ownerContext.request.get(`${base}/api/auth/get-session`);
      const session = await sessionResponse.json().catch(() => "<unparseable>");
      row(
        "T2",
        sessionResponse.status() === 200 && (session === null || !session?.user),
        `GET /api/auth/get-session after sign-out → ${sessionResponse.status()} ${JSON.stringify(session)}`,
      );
    }
  } finally {
    await ownerContext.close();
  }

  const pendingContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await pendingContext.newPage();
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const request = await clickPill(page, standin, "Continue with Google");
    const landed = await waitForFlowLanding(page);
    if (landed) {
      const emailOk = await page.getByText(PENDING_EMAIL, { exact: true }).isVisible();
      const signOutOk = await page.getByRole("button", { name: "Sign out", exact: true }).isVisible();
      await page.waitForTimeout(1_000);
      const pendingShot = await shoot(page, "waiting-pending.png", { width: 375, height: 812 });
      row(
        "T2",
        !!request && emailOk && signOutOk && pendingShot.ok,
        `pending ${PENDING_EMAIL}: "Your account is waiting for approval" + email + Sign out; ${shotDetail(pendingShot, "waiting-pending.png")}`,
      );
    } else {
      row(
        "T2",
        false,
        `pending flow did not land on the waiting screen: request=${!!request}, url=${page.url()}, body="${await bodyText(page)}"`,
      );
    }
  } finally {
    await pendingContext.close();
  }
}

// ---------------------------------------------------------------------------
// T3 — second server with NO auth env: quiet line + /plan link, GET /plan 200
// with the passphrase gate, the seeded Missions list, planner files untouched
// ---------------------------------------------------------------------------

async function phaseT3(browser, base2) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base2}/`, { waitUntil: "domcontentloaded" });
    const quiet = page.getByText("Sign-in is not set up on this deployment yet", { exact: true });
    await quiet.waitFor({ timeout: 15_000 });
    const link = page.getByRole("link", { name: "Go to the planner", exact: true });
    const href = await link.getAttribute("href");
    const pills = await page.getByRole("button", { name: /Continue with/ }).count();
    await page.waitForTimeout(800);
    const shot = await shoot(page, "home-noauth.png", { width: 1440, height: 900 });
    row(
      "T3",
      href === "/plan" && pills === 0 && shot.ok,
      `no-env server: exact quiet line + link href="${href}", no sign-in pills; ${shotDetail(shot, "home-noauth.png")}`,
    );
  } finally {
    await context.close();
  }

  // /plan renders and MissionList asks for the passphrase in place.
  const gateContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await gateContext.newPage();
    const response = await page.goto(`${base2}/plan`, { waitUntil: "domcontentloaded" });
    const gateInput = page.locator('input[aria-label="Wayfinder passphrase"]');
    await gateInput.waitFor({ timeout: 15_000 });
    const prompt = await page
      .getByText(/Type the Wayfinder passphrase to read the Missions in the store/)
      .isVisible();
    row(
      "T3",
      response.status() === 200 && prompt,
      `GET /plan → ${response.status()}; passphrase gate present: input[aria-label="Wayfinder passphrase"] + typed-in-place prompt`,
    );
  } finally {
    await gateContext.close();
  }

  // The seeded Missions list still renders once the passphrase is on file,
  // with /api/missions answered from memory (motion-check.mjs's pattern).
  const { DEFAULT_SPEC } = await import("../lib/spec.ts");
  const { deriveMissions } = await import("../lib/missionRecords.ts");
  const spec = { ...DEFAULT_SPEC, site: "E2E Site", site_id: "e2e-site-abc123", date: "2026-09-26" };
  const record = {
    id: "m-e2e-0001",
    site_id: spec.site_id,
    site: spec.site,
    name: "North half",
    date: spec.date,
    created_at: "2026-09-26T00:00:00.000Z",
    updated_at: "2026-09-26T00:00:00.000Z",
    spec,
    dispatched_key: null,
  };
  const payload = {
    missions: [deriveMissions([record], {}, {})[0]],
    archived_count: 0,
    stale_cards: [],
    host: { notice: null, drift: null },
    unreadable: [],
    now: Date.now(),
  };
  const seedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await seedContext.addInitScript(
      ({ body, key, value }) => {
        localStorage.setItem(key, value);
        const original = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
          if (url.includes("/api/missions")) {
            return Promise.resolve(
              new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
            );
          }
          return original(input, init);
        };
      },
      { body: payload, key: PASSPHRASE_KEY, value: "evidence" },
    );
    const page = await seedContext.newPage();
    await page.goto(`${base2}/plan`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 20_000 });
    const gateGone = (await page.locator('input[aria-label="Wayfinder passphrase"]').count()) === 0;
    row("T3", gateGone, "seeded Missions list renders on the no-env server (row Edit button found; gate stepped aside)");
  } finally {
    await seedContext.close();
  }

  // The planner source is untouched by this ticket.
  const diff = spawnSync("git", ["diff", "--stat", "--", ...PLANNER_PATHS], { cwd: repoRoot, encoding: "utf8" });
  row(
    "T3",
    diff.status === 0 && diff.stdout.trim() === "",
    `git diff --stat (${PLANNER_PATHS.length} planner paths) is empty: ${diff.stdout.trim() || "(empty)"}`,
  );
}

// ---------------------------------------------------------------------------
// T4 — reduced motion: poster, no video, no transform transition; normal
// motion: the entrance plays once per visit, never twice
// ---------------------------------------------------------------------------

async function phaseT4(browser, base) {
  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await reducedContext.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.locator('img[src*="/hero/"]').first().waitFor({ timeout: 15_000 });
    const probe = await page.evaluate(() => {
      const styleOf = (el) => {
        const cs = getComputedStyle(el);
        return {
          props: cs.transitionProperty.split(",").map((s) => s.trim()),
          durations: cs.transitionDuration.split(",").map((s) => s.trim()),
          transform: cs.transform,
        };
      };
      return {
        videos: document.querySelectorAll("video").length,
        poster: document.querySelector('img[src*="/hero/"]')?.getAttribute("src") ?? null,
        entrance: document.querySelectorAll("[data-entrance]").length,
        root: styleOf(document.querySelector("main")),
        title: styleOf(document.querySelector("h1")),
      };
    });

    const rootRuns = probe.root.durations.some((d) => d !== "0s");
    const titleRuns = probe.title.durations.some((d) => d !== "0s");
    const allowed = new Set(["opacity", "visibility"]);
    const offending = [
      ...(probe.root.props.includes("transform") || probe.title.props.includes("transform") ? ["transform"] : []),
      ...(rootRuns ? probe.root.props.filter((p) => !allowed.has(p)) : []),
      ...(titleRuns ? probe.title.props.filter((p) => !allowed.has(p)) : []),
    ];
    await page.waitForTimeout(800);
    const shot = await shoot(page, "home-reduced.png", { width: 1440, height: 900 });
    row(
      "T4",
      probe.videos === 0 && !!probe.poster?.includes("poster") && shot.ok,
      `reduced: no <video>, poster img src=${probe.poster}; ${shotDetail(shot, "home-reduced.png")}`,
    );
    row(
      "T4",
      offending.length === 0 && probe.root.transform === "none",
      `reduced transitions: root props=[${probe.root.props}] durations=[${probe.root.durations}] transform=${probe.root.transform}; title props=[${probe.title.props}] durations=[${probe.title.durations}]; nothing transitions transform (offending: ${offending.join(",") || "none"})`,
    );
  } finally {
    await reducedContext.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.locator('main[data-entrance="play"]').waitFor({ timeout: 15_000 });
    const first = await page.locator('main[data-entrance="play"]').count();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('video[src*="/hero/"]').first().waitFor({ timeout: 15_000 }); // hydrated
    await page.waitForTimeout(400);
    const replay = await page.locator("[data-entrance]").count();
    row(
      "T4",
      first === 1 && replay === 0,
      `normal motion: first visit main[data-entrance="play"] (${first}); same-context reload replays it ${replay} times (marker in sessionStorage)`,
    );
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// T5 — keyboard: Tab reaches Google then GitHub, Enter on Google reaches the
// stand-in's /authorize
// ---------------------------------------------------------------------------

async function phaseT5(browser, standin, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continue with Google", exact: true }).waitFor({ timeout: 15_000 });
    await page.locator('video[src*="/hero/"], img[src*="/hero/"]').first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);

    await page.keyboard.press("Tab");
    const first = await activeElement(page);
    row(
      "T5",
      first.text === "Continue with Google" && first.focusVisible,
      `Tab 1 → document.activeElement "${first.text}" (focus-visible=${first.focusVisible})`,
    );

    await page.keyboard.press("Tab");
    const second = await activeElement(page);
    row(
      "T5",
      second.text === "Continue with GitHub" && second.focusVisible,
      `Tab 2 → document.activeElement "${second.text}" (focus-visible=${second.focusVisible})`,
    );

    await page.keyboard.press("Shift+Tab");
    const back = await activeElement(page);
    const before = authorizeCount(standin);
    await respectSignInRateLimit();
    const requestP = page
      .waitForRequest((request) => request.url().startsWith(`${standin.baseUrl}/authorize`), { timeout: 30_000 })
      .catch(() => null);
    await page.keyboard.press("Enter");
    const request = await requestP;
    const landed = await waitForFlowLanding(page);
    const url = request ? new URL(request.url()) : null;
    row(
      "T5",
      back.text === "Continue with Google" &&
        !!request &&
        request.method() === "GET" &&
        authorizeCount(standin) === before + 1 &&
        landed,
      request
        ? `Shift+Tab back to "${back.text}"; Enter → ${request.method()} ${url.origin}${url.pathname}; flow landed on the waiting screen`
        : `Enter started no GET /authorize request (focused: "${back.text}"); url=${page.url()}; body="${await bodyText(page)}"`,
    );
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(path.join(webRoot, ".next", "BUILD_ID"))) {
    throw new Error("no production build found; run `npm run build` in web/ first");
  }
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  rmSync(dbDir, { recursive: true, force: true });
  mkdirSync(path.dirname(dbDir), { recursive: true });

  const { startOAuthStandin } = await import("../lib/oauthStandin.ts");
  const standin = await startOAuthStandin(IDENTITIES);
  console.log(`stand-in: ${standin.baseUrl} (identities in order: ${IDENTITIES.map((i) => i.id).join(", ")})`);

  const port = await freePort();
  const base = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL,
    BETTER_AUTH_SECRET: "home-evidence-secret-0123456789abcdef",
    BETTER_AUTH_URL: base,
    OAUTH_PROXY_SECRET: "home-evidence-proxy-secret",
    GOOGLE_CLIENT_ID: "standin-google-client",
    GOOGLE_CLIENT_SECRET: "standin-google-secret",
    GITHUB_CLIENT_ID: "standin-github-client",
    GITHUB_CLIENT_SECRET: "standin-github-secret",
    OWNER_EMAIL,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_OAUTH_CLIENT_ID: "standin-supabase-client",
    SUPABASE_OAUTH_CLIENT_SECRET: "standin-supabase-secret",
    AUTH_TRUSTED_ORIGINS: base,
    AUTH_TEST_GOOGLE_AUTHORIZATION_URL: `${standin.baseUrl}/authorize`,
    AUTH_TEST_GOOGLE_TOKEN_URL: `${standin.baseUrl}/token`,
    AUTH_TEST_GOOGLE_USERINFO_URL: `${standin.baseUrl}/userinfo`,
    AUTH_TEST_GITHUB_AUTHORIZATION_URL: `${standin.baseUrl}/authorize`,
    AUTH_TEST_GITHUB_TOKEN_URL: `${standin.baseUrl}/token`,
    AUTH_TEST_GITHUB_USERINFO_URL: `${standin.baseUrl}/userinfo`,
  };

  console.log(`migrating ${DATABASE_URL}`);
  for (const line of await run(process.execPath, ["scripts/migrate.mjs"], env)) console.log(`[migrate] ${line}`);

  const server = spawnServer(env, port);
  let browser;
  try {
    await waitReady(server, `${base}/api/auth/get-session`, "configured next start");
    console.log(`app: ${base} (pid ${server.proc.pid})`);
    browser = await launchBrowser();

    await phaseT1(browser, standin, base);
    await phaseT2(browser, standin, base);

    // T3: the deliberate second next start, all twelve accountEnv variables and
    // the stand-in/trusted-origin extras absent. Stopped before T4 reuses the
    // configured server.
    const port2 = await freePort();
    const base2 = `http://localhost:${port2}`;
    const noEnv = { ...process.env };
    for (const name of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "OAUTH_PROXY_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "OWNER_EMAIL",
      "SUPABASE_URL",
      "SUPABASE_OAUTH_CLIENT_ID",
      "SUPABASE_OAUTH_CLIENT_SECRET",
      "AUTH_TRUSTED_ORIGINS",
      "AUTH_TRUSTED_HOSTS",
      "AUTH_TEST_GOOGLE_AUTHORIZATION_URL",
      "AUTH_TEST_GOOGLE_TOKEN_URL",
      "AUTH_TEST_GOOGLE_USERINFO_URL",
      "AUTH_TEST_GITHUB_AUTHORIZATION_URL",
      "AUTH_TEST_GITHUB_TOKEN_URL",
      "AUTH_TEST_GITHUB_USERINFO_URL",
    ]) {
      delete noEnv[name];
    }
    const noEnvServer = spawnServer(noEnv, port2);
    try {
      await waitReady(noEnvServer, `${base2}/`, "no-env next start");
      console.log(`no-env app: ${base2} (pid ${noEnvServer.proc.pid})`);
      await phaseT3(browser, base2);
    } finally {
      await stopServer(noEnvServer);
      console.log("no-env app stopped");
    }

    await phaseT4(browser, base);
    await phaseT5(browser, standin, base);
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
    await standin.stop();
    rmSync(dbDir, { recursive: true, force: true });
  }

  const screenshots = ["home-375.png", "home-1440.png", "waiting-pending.png", "settings-line.png", "home-noauth.png", "home-reduced.png"];
  for (const name of screenshots) {
    const size = pngSize(path.join(outDir, name));
    if (!size) {
      row("ALL", false, `screenshot ${name} missing or not a PNG`);
    } else {
      console.log(`      ${name}: ${size.width}×${size.height}, ${size.bytes} B`);
    }
  }

  console.log(failed ? "home evidence: FAIL" : "home evidence: all rows ok; exit 0");
  process.exit(failed ? 1 : 0);
}

try {
  await main();
} catch (error) {
  console.error(`home evidence failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
