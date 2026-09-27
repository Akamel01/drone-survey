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
// T6 closes with GET /authorize === 6 and POST /token === 6.
//
// Rate limit (D4): better-auth's default is 3 sign-in POSTs per rolling 10 s
// for this run's 127.0.0.1; respectSignInRateLimit() mirrors that window
// before every click, and every sign-in asserts its POST is not a 429.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
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

/** The nine accountEnv variables (lib/accountEnv.ts:18-28) plus the trusted
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
    AUTH_TRUSTED_ORIGINS: origin,
    AUTH_TEST_GOOGLE_AUTHORIZATION_URL: `${oauthStandin.baseUrl}/authorize`,
    AUTH_TEST_GOOGLE_TOKEN_URL: `${oauthStandin.baseUrl}/token`,
    AUTH_TEST_GOOGLE_USERINFO_URL: `${oauthStandin.baseUrl}/userinfo`,
    AUTH_TEST_GITHUB_AUTHORIZATION_URL: `${oauthStandin.baseUrl}/authorize`,
    AUTH_TEST_GITHUB_TOKEN_URL: `${oauthStandin.baseUrl}/token`,
    AUTH_TEST_GITHUB_USERINFO_URL: `${oauthStandin.baseUrl}/userinfo`,
  };
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
    .waitForRequest((request) => request.url().startsWith(`${oauthStandin.baseUrl}/authorize`), { timeout: 30_000 })
    .catch(() => null);
  const signInP = page
    .waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/api/auth/sign-in/social"),
      { timeout: 30_000 },
    )
    .catch(() => null);
  await page.getByRole("button", { name: label, exact: true }).click();
  const [authorize, signIn] = await Promise.all([authorizeP, signInP]);
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
// T5 -- the account gate, after the app stops (PGlite single owner)
// ---------------------------------------------------------------------------

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

  const pending = await gate(captured.pendingCookie);
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
    [captured.pendingUserId],
  );
  assert.equal(liveBefore.rows[0].n, 1, "the pending Account's session is live before the expiry");
  await pool.query('UPDATE "session" SET "expiresAt" = now() - interval \'1 minute\' WHERE "userId" = $1', [
    captured.pendingUserId,
  ]);
  const liveAfter = await pool.query(
    'SELECT count(*)::int AS n FROM "session" WHERE "userId" = $1 AND "expiresAt" > now()',
    [captured.pendingUserId],
  );
  assert.equal(liveAfter.rows[0].n, 0, "the session is expired in the store");

  const expired = await gate(captured.pendingCookie);
  assert.equal(expired.ok, false);
  assert.equal(expired.response.status, 401);

  const auth = await getAuth();
  const sessionResponse = await auth.handler(
    new Request(`${base}/api/auth/get-session`, { headers: { cookie: captured.pendingCookie } }),
  );
  assert.equal(sessionResponse.status, 200);
  assert.equal(await sessionResponse.json(), null);

  const remaining = await pool.query('SELECT count(*)::int AS n FROM "session" WHERE "userId" = $1', [
    captured.pendingUserId,
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
    assert.equal(users.rows[0].approved, false);

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
    assert.equal(users.rows[0].approved, false);

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

  await t.test("the pending Account: user, approved=false, its u-<id> Workspace", async () => {
    const users = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [
      IDENTITIES[4].email,
    ]);
    assert.equal(users.rows.length, 1, "exactly one user for the pending email");
    assert.equal(users.rows[0].id, captured.pendingUserId);
    assert.equal(users.rows[0].role, "user");
    assert.equal(users.rows[0].approved, false);

    const accounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
      captured.pendingUserId,
    ]);
    assert.equal(accounts.rows.length, 1);
    assert.equal(accounts.rows[0].providerId, "google");
    assert.equal(accounts.rows[0].accountId, "e2e-other");

    // The expired session was refused and deleted in T5; nothing active is
    // left for this Account (the row lifecycle is asserted there).
    const sessions = await pool.query('SELECT id FROM "session" WHERE "userId" = $1', [captured.pendingUserId]);
    assert.equal(sessions.rows.length, 0, "the expiry refusal cleaned the pending session up");

    const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${captured.pendingUserId}`]);
    assert.equal(orgs.rows.length, 1, "the pending Account's Workspace is u-<id>");
    const members = await pool.query('SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2', [
      orgs.rows[0].id,
      captured.pendingUserId,
    ]);
    assert.equal(members.rows[0]?.role, "owner");
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
