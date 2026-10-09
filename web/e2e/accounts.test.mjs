// #242: the account flows end to end -- the built app, a real browser and a
// real database. One `node --test` file (D7), run with --test-concurrency=1.
//
// Arrangement (D3/D5): fresh store -> migrate -> build -> `next start` on a
// free port -> drive the hero home page through the flows -> stop the app ->
// assert the database rows and the account gate in-process. The app and this
// process never hold the store at the same time: PGlite's socket owns it
// while the app runs, so every DB query and requireApprovedAccount call
// happens after stopApp() (D2, R1).
//
// Store: DATABASE_URL postgres:// on localhost/127.0.0.1 is used as given
// (D10); anything else means a freshly deleted PGlite directory
// (web/.pglite/e2e, gitignored). Nothing here truncates or deletes tables.
//
// Identity queue (R3): identities are consumed one per GET /authorize, in
// declaration order (lib/oauthStandin.ts:90-95), so the six slots below are
// matched one-for-one to the test declaration order:
//   1  e2e-google  T1 first sign-up
//   2  e2e-google  T1 re-sign-in (same account id)
//   3  e2e-github  T2
//   4  e2e-owner   T3 owner -> /plan
//   5  e2e-other   T3 other -> pending
//   6  e2e-owner   T3.5 planner sign-out
//   7  e2e-remove  T4.5 the Account the operator removes
// T6 closes with GET /authorize === 7 and POST /token === 7.
//
// Rate limit (D4): better-auth's default is 3 sign-in POSTs per rolling 10 s
// for this run's 127.0.0.1; respectSignInRateLimit() mirrors that window
// before every click, and every sign-in asserts its POST is not a 429.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  freePort,
  launchBrowser,
  run,
  spawnServer,
  stopServer,
  waitReady,
  webRoot,
} from "../scripts/lib/harness.mjs";

const OWNER_EMAIL = "owner@example.com";
const IDENTITIES = [
  { id: "e2e-google", name: "E2E Google", email: "e2e-google@example.com" }, // T1 first sign-up
  { id: "e2e-google", name: "E2E Google", email: "e2e-google@example.com" }, // T1 re-sign-in (same account id)
  { id: "e2e-github", name: "E2E GitHub", email: "e2e-github@example.com" }, // T2
  { id: "e2e-owner", name: "Owner Example", email: OWNER_EMAIL }, // T3 owner -> /plan
  { id: "e2e-other", name: "Other Example", email: "e2e-other@example.com" }, // T3 other -> pending
  { id: "e2e-owner", name: "Owner Example", email: OWNER_EMAIL }, // T3.5 planner sign-out
  { id: "e2e-remove", name: "Remove Me", email: "e2e-remove@example.com" }, // T4.5 the Account the operator removes
];

let standin;
let base;
let browser;
let server;
let store;
let authEnv;
let pgliteDir;
let ownerContext; // T3's owner context, kept open for T4's "real session still valid" assert
let dbHandle = null; // memoized pool, opened after the app stops
const captured = {};

// ---------------------------------------------------------------------------
// Environment and small helpers
// ---------------------------------------------------------------------------

/** The twelve accountEnv variables (lib/accountEnv.ts:18-31) plus the trusted
 *  origin and the six stand-in URLs -- the proven auth-evidence arrangement
 *  (scripts/auth-evidence.mjs:89-107). BETTER_AUTH_URL must equal the origin
 *  so the oauth-proxy plugin skips its production redirect. */
function authEnvFor(origin, oauthStandin) {
  return {
    ...process.env,
    DATABASE_URL: store,
    BETTER_AUTH_SECRET: "accounts-e2e-secret-0123456789abcdef",
    BETTER_AUTH_URL: origin,
    OAUTH_PROXY_SECRET: "accounts-e2e-proxy-secret",
    GOOGLE_CLIENT_ID: "standin-google-client",
    GOOGLE_CLIENT_SECRET: "standin-google-secret",
    GITHUB_CLIENT_ID: "standin-github-client",
    GITHUB_CLIENT_SECRET: "standin-github-secret",
    OWNER_EMAIL,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_OAUTH_CLIENT_ID: "standin-supabase-client",
    SUPABASE_OAUTH_CLIENT_SECRET: "standin-supabase-secret",
    AUTH_TRUSTED_ORIGINS: origin,
    AUTH_TEST_GOOGLE_AUTHORIZATION_URL: `${oauthStandin.baseUrl}/authorize`,
    AUTH_TEST_GOOGLE_TOKEN_URL: `${oauthStandin.baseUrl}/token`,
    AUTH_TEST_GOOGLE_USERINFO_URL: `${oauthStandin.baseUrl}/userinfo`,
    AUTH_TEST_GITHUB_AUTHORIZATION_URL: `${oauthStandin.baseUrl}/authorize`,
    AUTH_TEST_GITHUB_TOKEN_URL: `${oauthStandin.baseUrl}/token`,
    AUTH_TEST_GITHUB_USERINFO_URL: `${oauthStandin.baseUrl}/userinfo`,
    AUTH_TEST_MAIL_DIR: mailDir,
  };
}

/** Email and password (#247): the test inbox, one JSON file per mail. */
const mailDir = path.join(webRoot, ".e2e-mail");

/** The newest mail to `to` written after `since`, waited for up to 15 s. */
async function readMail(to, since) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const found = (existsSync(mailDir) ? readdirSync(mailDir) : [])
      .map((name) => ({ name, at: statSync(path.join(mailDir, name)).mtimeMs }))
      .filter((f) => f.at >= since)
      .sort((a, b) => b.at - a.at)
      .map((f) => JSON.parse(readFileSync(path.join(mailDir, f.name), "utf8")))
      .find((mail) => mail.to === to);
    if (found) return { ...found, url: found.text.match(/https?:\/\/\S+/)?.[0] };
    if (Date.now() > deadline) throw new Error(`no mail to ${to} arrived in the test inbox`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The build needs the same placeholders the DB-free `web` CI job passes
 *  (mission.yml:92-101) plus DATABASE_URL, or the build's migrate step skips
 *  silently and every flow 503s (R4). */
function buildEnvFor() {
  return {
    ...authEnv,
    B2_BUCKET: "ci",
    B2_KEY_ID: "ci",
    B2_APP_KEY: "ci",
    B2_READ_KEY_ID: "ci",
    B2_READ_APP_KEY: "ci",
    DISPATCH_SECRET: "ci",
  };
}

/** Waits for a locator to be visible and asserts it actually is. */
async function shown(locator) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  assert.ok(await locator.isVisible(), `${locator} is visible`);
  return locator;
}

/** `better-auth.session_token=<value>` from a context's live cookie jar --
 *  never a hardcoded prefix (the cookie name may grow one under https). */
async function sessionCookieHeader(context) {
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
  assert.ok(cookie, "the context holds a session_token cookie");
  return `${cookie.name}=${cookie.value}`;
}

async function getSession(context) {
  const response = await context.request.get(`${base}/api/auth/get-session`);
  assert.equal(response.status(), 200, "get-session answers even when signed out");
  return response.json();
}

/** The pending landing screen: copy + the email the identity reported. Waiting
 *  for it proves the identity queue advanced. */
async function waitForPending(page, email) {
  await page.getByText("Your account is waiting for approval").waitFor({ timeout: 45_000 });
  await shown(page.getByText(email, { exact: true }));
}

// better-auth's default special rule is 3 POSTs per 10 s on paths starting
// with /sign-in (dist/api/rate-limiter/index.mjs:301-309, rolling window from
// the last allowed request). All six sign-ins in this file share that key for
// this run's 127.0.0.1, so mirror the rule here: a 4th sign-in within 10 s of
// the last allowed one would be refused with
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

/** Wait until the client has hydrated -- the hero's src is written by an
 *  effect, so it is a post-hydration marker -- then click a sign-in pill,
 *  returning the GET /authorize request it started. The sign-in POST is
 *  asserted not to be a 429 (D4). */
async function clickPill(page, oauthStandin, label) {
  await page.locator('video[src*="/hero/"], img[src*="/hero/"]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await respectSignInRateLimit();
  const authorizeP = page
    .waitForRequest((request) => request.url().startsWith(`${oauthStandin.baseUrl}/authorize`), { timeout: 45_000 })
    .catch(() => null);
  // A click that lands before the page has hydrated does nothing (the button
  // is server-rendered), and a loaded CI runner can hydrate late: if no
  // sign-in POST follows, click again. An unhandled click sends nothing, so
  // it costs no rate-limit budget.
  let signIn = null;
  for (let attempt = 0; attempt < 3 && !signIn; attempt++) {
    const signInP = page
      .waitForResponse(
        (response) => response.request().method() === "POST" && response.url().includes("/api/auth/sign-in/social"),
        { timeout: 10_000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: label, exact: true }).click();
    signIn = await signInP;
  }
  const authorize = await authorizeP;
  assert.ok(authorize, `clicking "${label}" started GET /authorize at the stand-in`);
  assert.equal(authorize.method(), "GET");
  assert.ok(authorize.url().startsWith(`${oauthStandin.baseUrl}/authorize`));
  assert.ok(signIn, `the sign-in POST for "${label}" was answered`);
  assert.notEqual(signIn.status(), 429, `the sign-in POST for "${label}" was refused with 429`);
  return authorize;
}

/** The store, opened after the app stopped. A PGlite start can race the
 *  killed process for the directory once; retry once after 1 s (T5, R1). */
async function openDb() {
  if (dbHandle) return dbHandle;
  const { getPool } = await import("../lib/accountDb.ts");
  try {
    dbHandle = await getPool();
  } catch (error) {
    console.log(`store open failed (${error.message}); retrying once after 1 s`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    dbHandle = await getPool();
  }
  assert.ok(dbHandle, "the store answers after the app stopped");
  return dbHandle;
}

async function closeDb() {
  if (dbHandle) {
    const { closeDb: close } = await import("../lib/accountDb.ts");
    await close();
    dbHandle = null;
  }
}

async function stopApp() {
  const current = server;
  server = undefined;
  await stopServer(current);
}

// ---------------------------------------------------------------------------
// Arrangement: fresh store -> migrate -> build -> start -> ready -> browser
// ---------------------------------------------------------------------------

before(async () => {
  const configured = process.env.DATABASE_URL;
  if (configured && /^postgres(ql)?:\/\//.test(configured)) {
    const host = new URL(configured).hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new Error(
        `DATABASE_URL host "${host}" is not loopback: this suite only runs against a localhost/127.0.0.1 Postgres or a fresh PGlite store of its own.`,
      );
    }
    store = configured;
    console.log(`e2e store: ${store} (postgres, loopback; used as given, never truncated)`);
  } else {
    pgliteDir = path.join(webRoot, ".pglite", "e2e");
    rmSync(pgliteDir, { recursive: true, force: true });
    mkdirSync(path.dirname(pgliteDir), { recursive: true });
    store = `pglite://${pgliteDir}`;
    console.log(`e2e store: ${store} (fresh)`);
  }

  rmSync(mailDir, { recursive: true, force: true });
  mkdirSync(mailDir, { recursive: true });

  const { startOAuthStandin } = await import("../lib/oauthStandin.ts");
  standin = await startOAuthStandin(IDENTITIES);
  const port = await freePort();
  base = `http://localhost:${port}`;
  authEnv = authEnvFor(base, standin);
  console.log(`stand-in: ${standin.baseUrl} (identities in order: ${IDENTITIES.map((i) => i.id).join(", ")})`);

  // Migrate first and explicitly, so a skipped migration is loud (R4); the
  // build runs it again (idempotent) because `npm run build` includes it.
  const migrate = await run(process.execPath, ["scripts/migrate.mjs"], authEnv);
  assert.ok(
    !migrate.join("\n").includes("DATABASE_URL not set; skipping migrations"),
    "migrate ran against the chosen store",
  );
  for (const line of migrate) console.log(`[migrate] ${line}`);

  const build = await run("npm", ["run", "build"], buildEnvFor());
  console.log(`[build] ${build.at(-1) ?? "(no output)"}`);
  assert.ok(existsSync(path.join(webRoot, ".next", "BUILD_ID")), "the build produced .next/BUILD_ID");

  server = spawnServer(authEnv, port);
  await waitReady(server, `${base}/api/auth/get-session`, "next start");
  console.log(`app: ${base} (pid ${server.proc.pid})`);

  browser = await launchBrowser();
  process.on("exit", () => {
    // A last resort if after() never ran: the server's whole process group.
    try {
      if (server) process.kill(-server.proc.pid, "SIGKILL");
    } catch {}
  });
});

after(async () => {
  await stopApp();
  if (browser) await browser.close();
  if (standin) await standin.stop();
  await closeDb();
  if (pgliteDir) rmSync(pgliteDir, { recursive: true, force: true });
  rmSync(mailDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// T1 -- sign up with Google, sign out, sign in again
// ---------------------------------------------------------------------------

test("sign up with Google, sign out, and sign in again: the same user with a new session", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).pathname, "/");
  await shown(page.getByRole("button", { name: "Continue with Google", exact: true }));
  await shown(page.getByRole("button", { name: "Continue with GitHub", exact: true }));

  await clickPill(page, standin, "Continue with Google");
  await waitForPending(page, IDENTITIES[0].email);

  const session1 = await getSession(context);
  assert.equal(session1.user.email, IDENTITIES[0].email);
  assert.equal(session1.user.approved, false, "a new account starts pending");
  captured.googleUserId = session1.user.id;
  captured.googleSessionId = session1.session.id;
  captured.googleCookie = await sessionCookieHeader(context);

  // Sign out: back to the signed-out home page, session row deleted.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
  await shown(page.getByRole("button", { name: "Continue with Google", exact: true }));
  assert.equal(await getSession(context), null, "sign-out left no session");

  // Sign in again: same Account, a new session.
  await clickPill(page, standin, "Continue with Google");
  await waitForPending(page, IDENTITIES[1].email);
  const session2 = await getSession(context);
  assert.equal(session2.user.id, session1.user.id, "the re-sign-in is the same Account");
  assert.notEqual(session2.session.id, session1.session.id, "a new session row, not the old one");
  assert.notEqual(await sessionCookieHeader(context), captured.googleCookie);
  captured.googleSessionId2 = session2.session.id;

  await context.close();
});

// ---------------------------------------------------------------------------
// T2 -- sign up with GitHub
// ---------------------------------------------------------------------------

test("sign up with GitHub: a new pending Account with its GitHub account row and Workspace", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });

  await clickPill(page, standin, "Continue with GitHub");
  await waitForPending(page, IDENTITIES[2].email);

  const session = await getSession(context);
  assert.equal(session.user.email, IDENTITIES[2].email);
  assert.notEqual(session.user.id, captured.googleUserId, "GitHub is a different Account from Google");
  assert.equal(session.user.approved, false);
  captured.githubUserId = session.user.id;
  captured.githubSessionId = session.session.id;
  captured.githubCookie = await sessionCookieHeader(context);

  await context.close();
});

// ---------------------------------------------------------------------------
// T3 -- the OWNER_EMAIL Account lands in the planner; any other waits
// ---------------------------------------------------------------------------

test("the OWNER_EMAIL Account lands in the planner as admin; any other Account waits for approval", async () => {
  ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ownerContext.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(page, standin, "Continue with Google");
  await page.waitForURL((url) => url.pathname === "/plan", { timeout: 45_000 });

  const settings = page.locator("#settings-panel");
  await settings.getByText("Signed in as").waitFor({ timeout: 15_000 });
  await shown(settings.getByRole("button", { name: "Sign out", exact: true }));
  assert.equal(
    await page.getByText("Your account is waiting for approval").count(),
    0,
    "the owner never sees the pending screen",
  );

  const ownerSession = await getSession(ownerContext);
  assert.equal(ownerSession.user.email, OWNER_EMAIL);
  assert.equal(ownerSession.user.approved, true);
  assert.equal(ownerSession.user.role, "admin");
  captured.ownerUserId = ownerSession.user.id;
  captured.ownerSessionId = ownerSession.session.id;
  captured.ownerCookie = await sessionCookieHeader(ownerContext);

  // The same pill, a non-owner identity: waiting screen, no planner.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(otherPage, standin, "Continue with Google");
  await waitForPending(otherPage, IDENTITIES[4].email);
  const otherSession = await getSession(otherContext);
  assert.equal(otherSession.user.email, IDENTITIES[4].email);
  assert.equal(otherSession.user.approved, false);
  captured.pendingUserId = otherSession.user.id;
  captured.pendingSessionId = otherSession.session.id;
  captured.pendingCookie = await sessionCookieHeader(otherContext);
  await otherContext.close();
});

// ---------------------------------------------------------------------------
// T3.5 -- signing out of the planner
// ---------------------------------------------------------------------------

test("signing out of the planner returns to the signed-out home page", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(page, standin, "Continue with Google");
  await page.waitForURL((url) => url.pathname === "/plan", { timeout: 45_000 });

  const settings = page.locator("#settings-panel");
  await settings.getByText("Signed in as").waitFor({ timeout: 15_000 });
  const session = await getSession(context);
  assert.equal(session.user.email, OWNER_EMAIL);
  captured.t35SessionId = session.session.id; // T6 proves this row was deleted

  await settings.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
  await shown(page.getByRole("button", { name: "Continue with Google", exact: true }));
  await shown(page.getByRole("button", { name: "Continue with GitHub", exact: true }));
  assert.equal(await getSession(context), null, "the planner sign-out left no session");

  await context.close();
});

// ---------------------------------------------------------------------------
// T4 -- a tampered session cookie
// ---------------------------------------------------------------------------

test("a tampered session cookie is refused", async () => {
  const cookie = (await ownerContext.cookies()).find((c) => c.name.endsWith("session_token"));
  assert.ok(cookie, "the owner context holds a session_token cookie");
  const flipped = cookie.value.slice(0, -1) + (cookie.value.endsWith("a") ? "b" : "a");
  captured.tamperedOwnerCookie = `${cookie.name}=${flipped}`;

  const context = await browser.newContext();
  // The domain+path form, because Chromium's Storage.setCookies refuses a
  // `__Secure-` name on an http:// `url` (probed: url form -> "Invalid cookie
  // fields", domain form accepted and sent to http://localhost).
  await context.addCookies([{ name: cookie.name, value: flipped, domain: "localhost", path: "/", secure: true }]);
  const response = await context.request.get(`${base}/api/auth/get-session`);
  assert.equal(response.status(), 200);
  assert.equal(await response.json(), null, "the tampered cookie is not a session");

  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await shown(page.getByRole("button", { name: "Continue with Google", exact: true }));
  assert.equal(
    await page.getByText("Sign-in is not set up on this deployment yet").count(),
    0,
    "the home page is the configured signed-out screen, not the unconfigured one",
  );

  // The client-side tamper mutated no store row: the owner's real context is
  // untouched (T6's owner sub-test then proves the row survives).
  const owner = await getSession(ownerContext);
  assert.equal(owner.user.email, OWNER_EMAIL, "the owner's real session is still valid");

  await context.close();
});

// ---------------------------------------------------------------------------
// T4.5 -- Approval (#243): the operator approves and removes Accounts
// ---------------------------------------------------------------------------

test("the operator approves and removes Accounts in Settings; nobody else can", async () => {
  // A throwaway Account for the operator to remove.
  const doomed = await browser.newContext();
  const doomedPage = await doomed.newPage();
  await doomedPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(doomedPage, standin, "Continue with GitHub");
  await waitForPending(doomedPage, IDENTITIES[6].email);
  captured.removedUserId = (await getSession(doomed)).user.id;

  // A pending Account can neither read nor change the Accounts, even by
  // calling the API directly: the role is checked on the server.
  const read = await doomed.request.get(`${base}/api/accounts`);
  assert.equal(read.status(), 403, "a pending Account cannot read the Accounts");
  const write = await doomed.request.post(`${base}/api/accounts`, {
    data: { id: captured.githubUserId, action: "approve" },
  });
  assert.equal(write.status(), 403, "a pending Account cannot approve anyone");

  // The operator, in Settings.
  const page = await ownerContext.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  const accounts = page.locator("#settings-panel").getByRole("region", { name: "Accounts" });
  const row = (email) => accounts.locator("li").filter({ hasText: email });
  await shown(row(IDENTITIES[2].email));
  await shown(row(IDENTITIES[6].email).getByText("Waiting for approval"));

  // The badge's number comes from the same list the section renders: pending
  // and not the operator (lib/accountAdmin.ts `pendingCount`).
  const apiPending = async () => {
    const response = await ownerContext.request.get(`${base}/api/accounts`);
    assert.equal(response.status(), 200);
    const { accounts: rows } = await response.json();
    return rows.filter((r) => !r.approved && !r.admin).length;
  };
  const waitingName = (n) => (n === 1 ? "1 Account waiting" : `${n} Accounts waiting`);
  const displayOf = (n) => (n > 9 ? "9+" : String(n));
  const before = await apiPending();
  assert.ok(before > 0, "Accounts are waiting, so the admin sees a badge");

  // Admin, desktop, panel open: the heading carries the visual pill.
  await shown(page.locator("#settings-panel h2").getByText(displayOf(before), { exact: true }));

  // Nobody else sees it: the pending Account loads /plan and finds no badge
  // element, no waiting-named control, and no Accounts region at all.
  await doomedPage.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  assert.equal(await doomedPage.locator('[class*="pendingBadge"]').count(), 0, "no badge element for a pending Account");
  assert.equal(await doomedPage.getByRole("button", { name: /waiting/ }).count(), 0, "no waiting-named control for a pending Account");
  assert.equal(await doomedPage.getByRole("region", { name: "Accounts" }).count(), 0, "no Accounts region for a pending Account");

  // Admin, phone: the Settings tab names the wait and carries the pill; the
  // phone label survives beside it.
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await phone.addCookies(await ownerContext.cookies());
  const phonePage = await phone.newPage();
  await phonePage.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  const phoneTab = phonePage
    .getByRole("navigation", { name: "Show" })
    .getByRole("button", { name: `Settings, ${waitingName(before)}`, exact: true });
  await shown(phoneTab);
  await shown(phoneTab.getByText(displayOf(before), { exact: true }));
  await shown(phoneTab.getByText("Settings", { exact: true }));

  // Admin, desktop, folded: the edge tab names the wait and carries the pill.
  await page.getByRole("button", { name: "Collapse Settings", exact: true }).click();
  const edge = page.getByRole("button", { name: `Expand Settings, ${waitingName(before)}`, exact: true });
  await shown(edge);
  await shown(edge.getByText(displayOf(before), { exact: true }));

  // E2E_SHOTS=<dir>: the folded edge tab at desktop size, for the pull
  // request. The panel stays folded for the shot; it unfolds right after.
  if (process.env.E2E_SHOTS) {
    mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "badge-edge-1440.png") });
  }

  // Unfold for the approve/remove flow.
  await edge.click();
  await shown(row(IDENTITIES[2].email));

  // E2E_SHOTS=<dir>: the badge on the phone tab and the Accounts section at
  // both sizes, for the pull request. Both panels are open here, so the
  // regions are visible.
  if (process.env.E2E_SHOTS) {
    await phoneTab.click();
    await shown(phonePage.getByRole("region", { name: "Accounts" }).getByText("Waiting for approval").first());
    await phonePage.waitForTimeout(600);
    await phonePage.screenshot({ path: path.join(process.env.E2E_SHOTS, "badge-phone-375.png") });
    const phoneAccounts = phonePage.getByRole("region", { name: "Accounts" });
    await phoneAccounts.scrollIntoViewIfNeeded();
    await phonePage.screenshot({ path: path.join(process.env.E2E_SHOTS, "accounts-375.png") });
    await accounts.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "accounts-1440.png") });
  }
  await phone.close();

  // Approve the GitHub Account (T2).
  await row(IDENTITIES[2].email).getByRole("button", { name: "Approve", exact: true }).click();
  await shown(row(IDENTITIES[2].email).getByText("Approved", { exact: true }));
  assert.equal(await row(IDENTITIES[2].email).getByRole("button", { name: "Approve" }).count(), 0);

  // An approved ordinary Account sees no badge either: the same planner, no
  // pill, no waiting name, no Accounts region. Its live session cookie is
  // reused, so no new sign-in and the identity queue is untouched.
  const eq = captured.githubCookie.indexOf("=");
  const member = await browser.newContext();
  await member.addCookies([
    {
      name: captured.githubCookie.slice(0, eq),
      value: captured.githubCookie.slice(eq + 1),
      domain: "localhost",
      path: "/",
      secure: true,
    },
  ]);
  const memberSession = await getSession(member);
  assert.equal(memberSession.user.approved, true, "the GitHub Account is approved now");
  assert.equal(memberSession.user.role, "user", "and still an ordinary Account");
  const memberPage = await member.newPage();
  await memberPage.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  assert.equal(await memberPage.locator('[class*="pendingBadge"]').count(), 0, "no badge element for an approved ordinary Account");
  assert.equal(await memberPage.getByRole("button", { name: /waiting/ }).count(), 0, "no waiting-named control for an approved ordinary Account");
  assert.equal(await memberPage.getByRole("region", { name: "Accounts" }).count(), 0, "no Accounts region for an approved ordinary Account");
  await member.close();

  // Remove the throwaway Account, through the confirmation sheet.
  await row(IDENTITIES[6].email).getByRole("button", { name: "Remove", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await shown(sheet.getByText(/^Remove /));
  // The badge stays up while the sheet is open: the count only moves when the
  // list answer arrives, never on open/cancel.
  const mid = await apiPending();
  assert.equal(mid, before - 1, "approving one drops the wait by one");
  await shown(page.locator("#settings-panel h2").getByText(displayOf(mid), { exact: true }));
  await sheet.getByRole("button", { name: "Remove", exact: true }).click();
  await row(IDENTITIES[6].email).waitFor({ state: "detached", timeout: 15_000 });
  assert.equal(await getSession(doomed), null, "the removed Account is signed out everywhere");

  // Live update, no reload: approve + remove moved the lifted count, so the
  // folded edge tab names the smaller wait and no zero-pill exists anywhere.
  const after = await apiPending();
  assert.equal(after, before - 2, "approving one and removing one drops the wait by two");
  await page.getByRole("button", { name: "Collapse Settings", exact: true }).click();
  await shown(page.getByRole("button", { name: `Expand Settings, ${waitingName(after)}`, exact: true }));
  assert.equal(await page.getByRole("button", { name: /0 Accounts? waiting/ }).count(), 0, "the badge unmounts at zero, it never reads 0");
  await page.getByRole("button", { name: `Expand Settings, ${waitingName(after)}`, exact: true }).click();
  await shown(row(IDENTITIES[2].email));

  // Approve-to-zero (AC2): the two remaining pendings (Google T1 + other T3),
  // in this same admin session with no reload. Approve, not remove: removal
  // would break T6's row-existence asserts, while approval only flips a
  // boolean (T5's expiry lifecycle moves to the email Account, still pending).
  await row(IDENTITIES[0].email).getByRole("button", { name: "Approve", exact: true }).click();
  await shown(row(IDENTITIES[0].email).getByText("Approved", { exact: true }));
  await row(IDENTITIES[4].email).getByRole("button", { name: "Approve", exact: true }).click();
  await shown(row(IDENTITIES[4].email).getByText("Approved", { exact: true }));
  assert.equal(await apiPending(), 0, "approving the last pendings clears the wait");
  assert.equal(await page.locator('[class*="pendingBadge"]').count(), 0, "the badge unmounts at zero");
  assert.equal(await page.getByRole("button", { name: /waiting/ }).count(), 0, "no waiting-named control at zero");
  // Folded edge tab falls back to its plain name, pill gone with it.
  await page.getByRole("button", { name: "Collapse Settings", exact: true }).click();
  await shown(page.getByRole("button", { name: "Expand Settings", exact: true }));
  assert.equal(await page.locator('[class*="pendingBadge"]').count(), 0, "no pill on the folded edge tab at zero");
  await page.getByRole("button", { name: "Expand Settings", exact: true }).click();
  await shown(row(IDENTITIES[0].email));

  // Phone at zero: a fresh phone view on the same admin session names the tab
  // plain Settings, with no pill and no waiting name.
  const zeroPhone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await zeroPhone.addCookies(await ownerContext.cookies());
  const zeroPhonePage = await zeroPhone.newPage();
  await zeroPhonePage.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await shown(
    zeroPhonePage.getByRole("navigation", { name: "Show" }).getByText("Settings", { exact: true }),
  );
  assert.equal(await zeroPhonePage.locator('[class*="pendingBadge"]').count(), 0, "no badge element on the phone tab at zero");
  assert.equal(await zeroPhonePage.getByRole("button", { name: /waiting/ }).count(), 0, "no waiting-named control on the phone tab at zero");
  await zeroPhone.close();

  // The API agrees.
  const list = await ownerContext.request.get(`${base}/api/accounts`);
  assert.equal(list.status(), 200);
  const { accounts: rows } = await list.json();
  assert.equal(rows.find((r) => r.email === IDENTITIES[2].email)?.approved, true);
  assert.equal(rows.find((r) => r.email === IDENTITIES[0].email)?.approved, true, "the Google Account was approved in the approve-to-zero");
  assert.equal(rows.find((r) => r.email === IDENTITIES[4].email)?.approved, true, "the other Account was approved in the approve-to-zero");
  assert.equal(rows.some((r) => r.email === IDENTITIES[6].email), false);

  await page.close();
  await doomed.close();
});

// ---------------------------------------------------------------------------
// PWA-2 (#315) -- the Developer section: offline map regions
// ---------------------------------------------------------------------------

test("the Developer section: the operator sees, adds and removes map regions; nobody else sees it", async () => {
  // The regions API reaches B2, which this suite has none of, so the browser's
  // calls to it are answered here by a stand-in with the real route's shape.
  // What is real: the session, the admin role, and the section's visibility.
  const state = {
    regions: [
      { id: "bc", name: "British Columbia", bbox: [-139.06, 48.3, -114.03, 60], maxzoom: 15, key: "specs/_maps/bc-20261003.pmtiles", bytes: 2_140_000_000, cut_at: "2026-10-03T08:00:00Z", build: "20261003" },
    ],
    requests: [],
  };
  const standinRoute = async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const { action, id } = request.postDataJSON();
      if (action === "add") state.requests.push({ id, name: id === "ab" ? "Alberta" : id, bbox: [0, 0, 1, 1], maxzoom: 15, requested_at: "2026-10-04T00:00:00Z", requested_by: "owner", status: "queued" });
      if (action === "remove") state.regions = state.regions.filter((r) => r.id !== id);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
  };
  await ownerContext.route((url) => url.pathname === "/api/maps/regions", standinRoute);

  const page = await ownerContext.newPage();
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  const dev = page.locator("#settings-panel").getByRole("region", { name: "Developer" });
  await shown(dev.locator("li").filter({ hasText: "British Columbia" }).getByText(/^2\.1 GB · cut /));

  // Add: the catalogue offers what is not there yet, and the cut is queued for the host.
  const choice = dev.getByRole("combobox", { name: "Region to add" });
  assert.equal(await choice.locator('option[value="bc"]').count(), 0, "a region already cut is not offered again");
  await choice.selectOption("ab");
  await dev.getByRole("button", { name: "Add region", exact: true }).click();
  await shown(dev.locator("li").filter({ hasText: "Alberta" }).getByText(/^Queued/));
  assert.equal(await choice.locator('option[value="ab"]').count(), 0, "a queued region is not offered again");

  if (process.env.E2E_SHOTS) {
    mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    await dev.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "developer-1440.png") });
  }

  // Remove.
  await dev.getByRole("button", { name: "Remove British Columbia", exact: true }).click();
  await dev.locator("li").filter({ hasText: "British Columbia" }).waitFor({ state: "detached", timeout: 15_000 });
  assert.equal(await choice.locator('option[value="bc"]').count(), 1, "removed, it can be added again");
  await page.close();

  // Nobody else: an approved ordinary Account has no Developer section, and
  // the real route refuses it, and a visitor with no session, on the server.
  const eq = captured.githubCookie.indexOf("=");
  const member = await browser.newContext();
  await member.addCookies([{ name: captured.githubCookie.slice(0, eq), value: captured.githubCookie.slice(eq + 1), domain: "localhost", path: "/", secure: true }]);
  const memberPage = await member.newPage();
  await memberPage.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await memberPage.locator("#settings-panel").waitFor();
  assert.equal(await memberPage.getByRole("region", { name: "Developer" }).count(), 0, "no Developer section for an ordinary Account");
  assert.equal((await member.request.get(`${base}/api/maps/regions`)).status(), 403, "the route refuses an ordinary Account");
  assert.equal((await member.request.post(`${base}/api/maps/regions`, { data: { action: "add", id: "ab" } })).status(), 403);
  await member.close();
  const visitor = await browser.newContext();
  assert.equal((await visitor.request.get(`${base}/api/maps/regions`)).status(), 401, "no session, no regions");
  await visitor.close();
});

// ---------------------------------------------------------------------------
// T5 -- the account gate, after the app stops (PGlite single owner)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T4.7 -- email and password (#247)
// ---------------------------------------------------------------------------

const EMAIL_USER = "e2e-email@example.com";

test("email and password: sign up, confirm by mail, sign in, a wrong password, and a reset", async () => {
  const first = "correct-horse-1";
  const second = "battery-staple-2";
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const status = page.getByRole("status");
  const openEmail = async () => {
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continue with email", exact: true }).click();
  };
  // The pending screen's Sign out already sits at "/", so wait for the
  // signed-out screen itself, not the URL, before reloading.
  const signOutHere = async () => {
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await shown(page.getByRole("button", { name: "Continue with Google", exact: true }));
    assert.equal(await getSession(context), null, "signed out");
  };
  const signIn = async (password) => {
    await page.getByLabel("Email", { exact: true }).fill(EMAIL_USER);
    await page.getByLabel(/^Password/).fill(password);
    await respectSignInRateLimit();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };

  // Sign up: a short password is refused before anything is sent.
  await openEmail();
  // E2E_SHOTS=<dir>: the email form at both sizes, for the pull request.
  if (process.env.E2E_SHOTS) {
    mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "email-1440.png") });
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const phonePage = await phone.newPage();
    await phonePage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await phonePage.getByRole("button", { name: "Continue with email", exact: true }).click();
    await phonePage.getByRole("button", { name: "Create an account", exact: true }).click();
    await phonePage.waitForTimeout(800);
    await phonePage.screenshot({ path: path.join(process.env.E2E_SHOTS, "email-375.png") });
    await phonePage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await phonePage.waitForTimeout(3000);
    await phonePage.screenshot({ path: path.join(process.env.E2E_SHOTS, "home-375.png") });
    await phone.close();
  }
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(EMAIL_USER);
  await page.getByLabel(/^Password/).fill("short");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await shown(status.filter({ hasText: "at least 10 characters" }));
  await page.getByLabel(/^Password/).fill(first);
  const signedUpAt = Date.now() - 1000;
  await respectSignInRateLimit();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await shown(page.getByText(`Check ${EMAIL_USER}`));

  // Before confirming, signing in is refused and says why.
  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await signIn(first);
  await shown(status.filter({ hasText: "Confirm your email" }));

  // The confirming link signs the Account in: pending, like any new Account.
  const verification = await readMail(EMAIL_USER, signedUpAt);
  assert.ok(verification.url, "the verification mail carries a link");
  await page.goto(verification.url, { waitUntil: "domcontentloaded" });
  await waitForPending(page, EMAIL_USER);
  const session = await getSession(context);
  assert.equal(session.user.email, EMAIL_USER);
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.approved, false);
  captured.emailUserId = session.user.id;

  // Signed out: a wrong password is refused, the right one signs in.
  await signOutHere();
  await openEmail();
  await signIn("not-the-password");
  await shown(status.filter({ hasText: "do not match" }));
  await signIn(first);
  await waitForPending(page, EMAIL_USER);

  // A reset: the form answers the same for an unknown address, sending nothing.
  await signOutHere();
  await openEmail();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("nobody@example.com");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await shown(page.getByText("If nobody@example.com has an Account"));
  await assert.rejects(readMail("nobody@example.com", 0), /no mail/);

  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(EMAIL_USER);
  const askedAt = Date.now() - 1000;
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await shown(page.getByText(`If ${EMAIL_USER} has an Account`));
  const reset = await readMail(EMAIL_USER, askedAt);
  assert.ok(reset.url, "the reset mail carries a link");
  await page.goto(reset.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/reset-password", { timeout: 20_000 });
  await page.getByLabel(/^New password/).fill(second);
  await page.getByLabel("The same password again", { exact: true }).fill(second);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await shown(page.getByText("Your password is changed"));

  // The old password no longer works; the new one does.
  await openEmail();
  await signIn(first);
  await shown(status.filter({ hasText: "do not match" }));
  await signIn(second);
  await waitForPending(page, EMAIL_USER);
  // T5's pending-403 + expiry lifecycle runs against this still-pending email
  // Account (T4.5 approved the Google + other pendings to reach badge zero).
  captured.emailCookie = await sessionCookieHeader(context);

  await context.close();
});

test("the account gate: 401 without a session, 403 for a pending Account; a tampered or expired cookie is refused", async () => {
  await stopApp();
  // The in-process instance must agree with the server it drove on the cookie
  // name: `next start` runs NODE_ENV=production, better-auth's baseURL is the
  // protocol:"auto" object, and production is what earns the `__Secure-`
  // prefix (better-auth/dist/cookies/index.mjs:20-23). Without it the
  // captured cookie reads as a different, absent cookie.
  Object.assign(process.env, authEnv, { NODE_ENV: "production" });
  const pool = await openDb();
  const { requireApprovedAccount } = await import("../lib/accountAccess.ts");
  const { getAuth } = await import("../lib/accountAuth.ts");

  const url = `${base}/api/missions`;
  const gate = (cookie) => requireApprovedAccount(new Request(url, cookie ? { headers: { cookie } } : undefined));

  const anonymous = await gate(null);
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.response.status, 401);
  assert.deepEqual(await anonymous.response.json(), {
    error: "Sign in to continue: this request carried no session.",
  });

  // The email Account is still pending (T4.5 approved the Google + other
  // pendings to reach badge zero), so the 403 + expiry lifecycle runs
  // against it.
  const pending = await gate(captured.emailCookie);
  assert.equal(pending.ok, false);
  assert.equal(pending.response.status, 403);
  assert.deepEqual(await pending.response.json(), {
    error:
      "This account is waiting for approval: an operator must approve it before it can reach its Workspace's Missions.",
  });

  const owner = await gate(captured.ownerCookie);
  assert.equal(owner.ok, true);
  assert.equal(owner.session.user.email, OWNER_EMAIL);

  const tampered = await gate(captured.tamperedOwnerCookie);
  assert.equal(tampered.ok, false);
  assert.equal(tampered.response.status, 401);

  // Expire the pending Account's session last, then watch the row lifecycle:
  // live -> expired -> refused, and better-auth's own get-session deletes the
  // expired row it reads (dist/api/routes/session.mjs:155-163).
  const liveBefore = await pool.query(
    'SELECT count(*)::int AS n FROM "session" WHERE "userId" = $1 AND "expiresAt" > now()',
    [captured.emailUserId],
  );
  assert.equal(liveBefore.rows[0].n, 1, "the email Account's session is live before the expiry");
  await pool.query('UPDATE "session" SET "expiresAt" = now() - interval \'1 minute\' WHERE "userId" = $1', [
    captured.emailUserId,
  ]);
  const liveAfter = await pool.query(
    'SELECT count(*)::int AS n FROM "session" WHERE "userId" = $1 AND "expiresAt" > now()',
    [captured.emailUserId],
  );
  assert.equal(liveAfter.rows[0].n, 0, "the session is expired in the store");

  const expired = await gate(captured.emailCookie);
  assert.equal(expired.ok, false);
  assert.equal(expired.response.status, 401);

  const auth = await getAuth();
  const sessionResponse = await auth.handler(
    new Request(`${base}/api/auth/get-session`, { headers: { cookie: captured.emailCookie } }),
  );
  assert.equal(sessionResponse.status, 200);
  assert.equal(await sessionResponse.json(), null);

  const remaining = await pool.query('SELECT count(*)::int AS n FROM "session" WHERE "userId" = $1', [
    captured.emailUserId,
  ]);
  assert.equal(remaining.rows[0].n, 0, "the expired row was cleaned up by the get-session that refused it");
});

// ---------------------------------------------------------------------------
// T6 -- the database rows match every flow
// ---------------------------------------------------------------------------

test("the database rows match every flow", async (t) => {
  const pool = await openDb();

  await t.test("Google: one user, one google account row, one session row, its Workspace", async () => {
    const users = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [
      IDENTITIES[0].email,
    ]);
    assert.equal(users.rows.length, 1, "exactly one user for the Google email");
    assert.equal(users.rows[0].id, captured.googleUserId);
    assert.equal(users.rows[0].role, "user");
    assert.equal(users.rows[0].approved, true, "the operator approved it in T4.5's approve-to-zero");

    const accounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
      captured.googleUserId,
    ]);
    assert.equal(accounts.rows.length, 1, "exactly one account row for the Google user");
    assert.equal(accounts.rows[0].providerId, "google");
    assert.equal(accounts.rows[0].accountId, "e2e-google");

    const sessions = await pool.query('SELECT id FROM "session" WHERE "userId" = $1', [captured.googleUserId]);
    assert.equal(sessions.rows.length, 1, "the sign-out deleted the first session; one remains");
    assert.equal(sessions.rows[0].id, captured.googleSessionId2, "and it is the re-sign-in's session");

    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${captured.googleUserId}`]);
    assert.equal(orgs.rows.length, 1, "the Google Account's Workspace is u-<id>");
    const members = await pool.query('SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2', [
      orgs.rows[0].id,
      captured.googleUserId,
    ]);
    assert.equal(members.rows[0]?.role, "owner");
  });

  await t.test("GitHub: the github account row and its Workspace", async () => {
    const users = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [
      IDENTITIES[2].email,
    ]);
    assert.equal(users.rows.length, 1, "exactly one user for the GitHub email");
    assert.equal(users.rows[0].id, captured.githubUserId);
    assert.equal(users.rows[0].role, "user");
    assert.equal(users.rows[0].approved, true, "the operator approved it in T4.5");

    const accounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
      captured.githubUserId,
    ]);
    assert.equal(accounts.rows.length, 1);
    assert.equal(accounts.rows[0].providerId, "github");
    assert.equal(accounts.rows[0].accountId, "e2e-github");

    const sessions = await pool.query('SELECT id FROM "session" WHERE "userId" = $1', [captured.githubUserId]);
    assert.equal(sessions.rows.length, 1);
    assert.equal(sessions.rows[0].id, captured.githubSessionId);

    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${captured.githubUserId}`]);
    assert.equal(orgs.rows.length, 1, "the GitHub Account's Workspace is u-<id>");
    const members = await pool.query('SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2', [
      orgs.rows[0].id,
      captured.githubUserId,
    ]);
    assert.equal(members.rows[0]?.role, "owner");
  });

  await t.test("the owner: admin, approved, the operator Workspace", async () => {
    const users = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [OWNER_EMAIL]);
    assert.equal(users.rows.length, 1, "exactly one user for OWNER_EMAIL");
    assert.equal(users.rows[0].id, captured.ownerUserId);
    assert.equal(users.rows[0].role, "admin");
    assert.equal(users.rows[0].approved, true);

    const accounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
      captured.ownerUserId,
    ]);
    assert.equal(accounts.rows.length, 1);
    assert.equal(accounts.rows[0].providerId, "google");
    assert.equal(accounts.rows[0].accountId, "e2e-owner");

    const sessions = await pool.query('SELECT id, "expiresAt" FROM "session" WHERE "userId" = $1', [
      captured.ownerUserId,
    ]);
    assert.equal(sessions.rows.length, 1, "the planner sign-out deleted its own session; one remains");
    assert.equal(sessions.rows[0].id, captured.ownerSessionId);
    assert.ok(sessions.rows[0].expiresAt > new Date(), "the owner's session has not expired");

    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', ["operator"]);
    assert.equal(orgs.rows.length, 1, "the owner's Workspace is slug 'operator'");
    const members = await pool.query('SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2', [
      orgs.rows[0].id,
      captured.ownerUserId,
    ]);
    assert.equal(members.rows[0]?.role, "owner");

    const t35 = await pool.query('SELECT count(*)::int AS n FROM "session" WHERE id = $1', [captured.t35SessionId]);
    assert.equal(t35.rows[0].n, 0, "T3.5's sign-out deleted its session row");
  });

  await t.test("the other Account: user, approved=true in the approve-to-zero, its u-<id> Workspace", async () => {
    const users = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [
      IDENTITIES[4].email,
    ]);
    assert.equal(users.rows.length, 1, "exactly one user for the pending email");
    assert.equal(users.rows[0].id, captured.pendingUserId);
    assert.equal(users.rows[0].role, "user");
    assert.equal(users.rows[0].approved, true, "the operator approved it in T4.5's approve-to-zero");

    const accounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
      captured.pendingUserId,
    ]);
    assert.equal(accounts.rows.length, 1);
    assert.equal(accounts.rows[0].providerId, "google");
    assert.equal(accounts.rows[0].accountId, "e2e-other");

    // T5's expiry lifecycle moved to the email Account (still pending), so
    // this Account's session is untouched: signed in once in T3, never out.
    const sessions = await pool.query('SELECT id FROM "session" WHERE "userId" = $1', [captured.pendingUserId]);
    assert.equal(sessions.rows.length, 1, "the approved other Account is still signed in");
    assert.ok(sessions.rows[0].id, "its session row survives approval");

    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${captured.pendingUserId}`]);
    assert.equal(orgs.rows.length, 1, "the pending Account's Workspace is u-<id>");
    const members = await pool.query('SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2', [
      orgs.rows[0].id,
      captured.pendingUserId,
    ]);
    assert.equal(members.rows[0]?.role, "owner");
  });

  await t.test("the email Account: verified, one credential sign-in, pending, its own Workspace", async () => {
    const users = await pool.query('SELECT id, role, approved, "emailVerified" FROM "user" WHERE lower(email) = $1', [
      EMAIL_USER,
    ]);
    assert.equal(users.rows.length, 1, "exactly one user for the email address");
    assert.equal(users.rows[0].id, captured.emailUserId);
    assert.equal(users.rows[0].emailVerified, true);
    assert.equal(users.rows[0].approved, false);
    assert.equal(users.rows[0].role, "user");
    const accounts = await pool.query('SELECT "providerId", password FROM "account" WHERE "userId" = $1', [
      captured.emailUserId,
    ]);
    assert.equal(accounts.rows.length, 1);
    assert.equal(accounts.rows[0].providerId, "credential");
    assert.ok(accounts.rows[0].password && !accounts.rows[0].password.includes("battery-staple-2"), "the password is stored hashed");
    // The expired session was refused and deleted in T5; nothing active is
    // left for this Account (the row lifecycle is asserted there).
    const sessions = await pool.query('SELECT id FROM "session" WHERE "userId" = $1', [captured.emailUserId]);
    assert.equal(sessions.rows.length, 0, "the expiry refusal cleaned the email session up");
    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${captured.emailUserId}`]);
    assert.equal(orgs.rows.length, 1, "the email Account's Workspace is u-<id>");
  });

  await t.test("the removed Account: no user, sessions, sign-in links or Workspace", async () => {
    const id = captured.removedUserId;
    assert.ok(id, "T4.5 captured the removed Account");
    for (const [table, column] of [
      ["user", "id"],
      ["session", '"userId"'],
      ["account", '"userId"'],
      ["member", '"userId"'],
    ]) {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${column} = $1`, [id]);
      assert.equal(rows[0].n, 0, `no ${table} row is left for the removed Account`);
    }
    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${id}`]);
    assert.equal(orgs.rows.length, 0, "its own Workspace is gone");
  });

  // The identity queue was consumed exactly (R3).
  const authorizeCount = standin.requests.filter((request) => request.startsWith("GET /authorize")).length;
  const tokenCount = standin.requests.filter((request) => request.startsWith("POST /token")).length;
  console.log(`identity queue consumed: GET /authorize ${authorizeCount}, POST /token ${tokenCount}`);
  assert.equal(authorizeCount, IDENTITIES.length, "one GET /authorize per identity");
  assert.equal(tokenCount, IDENTITIES.length, "one POST /token per identity");
});

// Flow 4's page half is #244's cutover: today a signed-out /plan still shows
// the passphrase gate, so only the gate helper's 401/403 is asserted (T5).
test.todo("signed out, /plan goes to / (lands with #244)");
