// #336: Papyrus (Supabase genericOAuth) sign-in end to end -- AC1 proof.
//
// Same arrangement as accounts.test.mjs (fresh store -> migrate -> build ->
// `next start` -> real browser -> stop -> in-process DB asserts), but the app
// runs in Supabase mode: SUPABASE_URL points at the stand-in base plus the
// locked trio (SUPABASE_OAUTH_CLIENT_ID / SUPABASE_OAUTH_CLIENT_SECRET) and
// OWNER_EMAIL, with no GOOGLE_*/GITHUB_*/AUTH_TEST_* set -- which also
// exercises the M1 env gate (legacy vars must not be required).
//
// Identity queue (consumed one per GET /authorize, in declaration order):
//   1  e2e-sb-pending    T1 first sign-up -> pending copy, approved=false
//   2  e2e-sb-owner      T2 OWNER_EMAIL (verified) -> /plan as admin
//   3  e2e-sb-intruder   T3 same email as owner, UNVERIFIED -> refused, no session
//   4  e2e-sb-owner-link T4 same email as owner, verified, other sub -> links
// T5 closes with GET /authorize === 4 and POST /token === 4.
//
// Legacy accounts.test.mjs is untouched (AC2 proof runs it trio-unset).
// Browser only through `web/scripts/remote-check.sh` (`test:e2e` self mode).

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
const PENDING_EMAIL = "e2e-sb-pending@example.com";
const PAPYRUS_LABEL = "Continue with your Papyrus account";
const IDENTITIES = [
  { id: "e2e-sb-pending", name: "SB Pending", email: PENDING_EMAIL, emailVerified: true }, // T1
  { id: "e2e-sb-owner", name: "Owner Example", email: OWNER_EMAIL, emailVerified: true }, // T2 owner -> /plan
  { id: "e2e-sb-intruder", name: "Intruder", email: OWNER_EMAIL, emailVerified: false }, // T3 refused
  { id: "e2e-sb-owner-link", name: "Owner Link", email: OWNER_EMAIL, emailVerified: true }, // T4 links to owner
];

let standin;
let base;
let browser;
let server;
let store;
let authEnv;
let pgliteDir;
let dbHandle = null;
const captured = {};

// ---------------------------------------------------------------------------
// Environment and small helpers (same shapes as accounts.test.mjs)
// ---------------------------------------------------------------------------

/** Supabase-mode env: base vars + locked trio + OWNER_EMAIL. Legacy
 *  GOOGLE/GITHUB and every AUTH_TEST var are deleted outright, so an uncleanset ambient environment cannot smuggle them in. */
function authEnvFor(origin, oauthStandin) {
  const env = {
    ...process.env,
    DATABASE_URL: store,
    BETTER_AUTH_SECRET: "accounts-supabase-e2e-secret-0123456789abcdef",
    BETTER_AUTH_URL: origin,
    OAUTH_PROXY_SECRET: "accounts-supabase-e2e-proxy-secret",
    SUPABASE_URL: oauthStandin.baseUrl,
    SUPABASE_OAUTH_CLIENT_ID: "standin-supabase-client",
    SUPABASE_OAUTH_CLIENT_SECRET: "standin-supabase-secret",
    OWNER_EMAIL,
    AUTH_TRUSTED_ORIGINS: origin,
  };
  for (const name of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "AUTH_TEST_GOOGLE_AUTHORIZATION_URL",
    "AUTH_TEST_GOOGLE_TOKEN_URL",
    "AUTH_TEST_GOOGLE_USERINFO_URL",
    "AUTH_TEST_GITHUB_AUTHORIZATION_URL",
    "AUTH_TEST_GITHUB_TOKEN_URL",
    "AUTH_TEST_GITHUB_USERINFO_URL",
  ]) delete env[name];
  return env;
}

/** The build needs the same placeholders the DB-free `web` CI job passes
 *  (mission.yml:92-101) plus DATABASE_URL, or the build's migrate step skips
 *  silently and every flow 503s. */
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
// with /sign-in, shared by every sign-in in this file for this run's
// 127.0.0.1: mirror the window before every click (accounts.test.mjs D4).
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

/** Wait until the client has hydrated, click a sign-in pill, and assert the
 *  stand-in saw GET /authorize and the sign-in POST was not a 429. */
async function clickPill(page, oauthStandin, label) {
  await page.locator('video[src*="/hero/"], img[src*="/hero/"]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await respectSignInRateLimit();
  const authorizeP = page
    .waitForRequest((request) => request.url().startsWith(`${oauthStandin.baseUrl}/authorize`), { timeout: 45_000 })
    .catch(() => null);
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

/** The store, opened after the app stopped (PGlite single owner). */
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
    pgliteDir = path.join(webRoot, ".pglite", "e2e-supabase");
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

  // The M1 gate proof: the trio carries Supabase mode, legacy vars are gone.
  for (const name of ["SUPABASE_URL", "SUPABASE_OAUTH_CLIENT_ID", "SUPABASE_OAUTH_CLIENT_SECRET", "OWNER_EMAIL"]) {
    assert.ok(authEnv[name], `${name} is set for Supabase mode`);
  }
  // Named, not by prefix: GitHub Actions sets its own GITHUB_* variables.
  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]) {
    assert.ok(!authEnv[name], `no legacy auth var leaks in: ${name}`);
  }
  for (const name of Object.keys(authEnv)) {
    assert.ok(!name.startsWith("AUTH_TEST_"), `no legacy auth var leaks in: ${name}`);
  }

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
    try {
      if (server) process.kill(-server.proc.pid, "SIGKILL");
    } catch {}
  });
});

after(async () => {
  await stopApp();
  if (browser) await browser.close();
  if (standin) await standin.stop();
  // A shared Postgres (CI) outlives this suite, and accounts.test.mjs runs
  // next against the same store: leave nothing it would trip over (the owner
  // Account and Workspace, and the sign-in rate-limit rows that would 429 its
  // first sign-ins). PGlite is a private store, removed below.
  if (!pgliteDir) {
    try {
      const pool = await openDb();
      const emails = IDENTITIES.map((identity) => identity.email.toLowerCase());
      const users = (await pool.query('SELECT id FROM "user" WHERE lower(email) = ANY($1)', [emails])).rows.map(
        (row) => row.id,
      );
      const slugs = ["operator", ...users.map((id) => `u-${id}`)];
      const orgs = (await pool.query('SELECT id FROM "organization" WHERE slug = ANY($1)', [slugs])).rows.map(
        (row) => row.id,
      );
      await pool.query('DELETE FROM "member" WHERE "organizationId" = ANY($1) OR "userId" = ANY($2)', [orgs, users]);
      await pool.query('DELETE FROM "invitation" WHERE "organizationId" = ANY($1)', [orgs]);
      await pool.query('DELETE FROM "organization" WHERE id = ANY($1)', [orgs]);
      await pool.query('DELETE FROM "session" WHERE "userId" = ANY($1)', [users]);
      await pool.query('DELETE FROM "account" WHERE "userId" = ANY($1)', [users]);
      await pool.query('DELETE FROM "verification" WHERE identifier = ANY($1)', [emails]);
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [users]);
      await pool.query('DELETE FROM "rateLimit"');
    } catch (error) {
      console.log(`store cleanup failed: ${error.message}`);
    }
  }
  await closeDb();
  if (pgliteDir) rmSync(pgliteDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// T1 -- Papyrus button alone; first sign-up waits for approval
// ---------------------------------------------------------------------------

test("Papyrus button alone: first sign-up waits for approval as a pending Account", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).pathname, "/");

  // Supabase mode: the Papyrus button alone; legacy buttons and email absent.
  await shown(page.getByRole("button", { name: PAPYRUS_LABEL, exact: true }));
  assert.equal(await page.getByRole("button", { name: "Continue with Google", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Continue with GitHub", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Continue with email", exact: true }).count(), 0);

  await clickPill(page, standin, PAPYRUS_LABEL);
  await waitForPending(page, PENDING_EMAIL);

  const session = await getSession(context);
  assert.equal(session.user.email, PENDING_EMAIL);
  assert.equal(session.user.approved, false, "a new Account starts pending");
  captured.pendingUserId = session.user.id;
  captured.pendingSessionId = session.session.id;

  await context.close();
});

// ---------------------------------------------------------------------------
// T2 -- the OWNER_EMAIL Account lands in the planner as admin
// ---------------------------------------------------------------------------

test("the OWNER_EMAIL Account lands in the planner as admin", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(page, standin, PAPYRUS_LABEL);
  await page.waitForURL((url) => url.pathname === "/plan", { timeout: 45_000 });

  assert.equal(
    await page.getByText("Your account is waiting for approval").count(),
    0,
    "the owner never sees the pending screen",
  );

  const session = await getSession(context);
  assert.equal(session.user.email, OWNER_EMAIL);
  assert.equal(session.user.approved, true);
  assert.equal(session.user.role, "admin");
  captured.ownerUserId = session.user.id;
  captured.ownerSessionId = session.session.id;

  await context.close();
});

// ---------------------------------------------------------------------------
// T3 -- an unverified same-email sign-in is refused, with no session
// ---------------------------------------------------------------------------

test("an unverified same-email sign-in is refused with no session", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(page, standin, PAPYRUS_LABEL);
  // The refusal redirects back to the signed-out home page, never to pending.
  await page.waitForURL((url) => url.pathname === "/", { timeout: 45_000 });
  assert.equal(
    await page.getByText("Your account is waiting for approval").count(),
    0,
    "the refused sign-in never reaches the pending screen",
  );
  assert.equal(await getSession(context), null, "the refused sign-in leaves no session");

  await context.close();
});

// ---------------------------------------------------------------------------
// T4 -- a verified same-email sign-in links to the owner's Account
// ---------------------------------------------------------------------------

test("a verified same-email sign-in links to the owner's Account", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await clickPill(page, standin, PAPYRUS_LABEL);
  await page.waitForURL((url) => url.pathname === "/plan", { timeout: 45_000 });

  const session = await getSession(context);
  assert.equal(session.user.id, captured.ownerUserId, "the verified sign-in is the owner's Account");
  assert.equal(session.user.approved, true);
  assert.equal(session.user.role, "admin", "the link changes neither role nor approval");

  await context.close();
});

// ---------------------------------------------------------------------------
// T5 -- the database rows match every flow
// ---------------------------------------------------------------------------

test("the database rows match every flow", async () => {
  await stopApp();
  Object.assign(process.env, authEnv, { NODE_ENV: "production" });
  const pool = await openDb();

  // The pending Account: one user, one supabase row, its u-<id> Workspace.
  const pending = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [PENDING_EMAIL]);
  assert.equal(pending.rows.length, 1, "exactly one user for the pending email");
  assert.equal(pending.rows[0].id, captured.pendingUserId);
  assert.equal(pending.rows[0].role, "user");
  assert.equal(pending.rows[0].approved, false);
  const pendingAccounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
    captured.pendingUserId,
  ]);
  assert.equal(pendingAccounts.rows.length, 1);
  assert.equal(pendingAccounts.rows[0].providerId, "supabase");
  assert.equal(pendingAccounts.rows[0].accountId, "e2e-sb-pending");
  const pendingSessions = await pool.query('SELECT id FROM "session" WHERE "userId" = $1', [captured.pendingUserId]);
  assert.equal(pendingSessions.rows.length, 1);
  assert.equal(pendingSessions.rows[0].id, captured.pendingSessionId);
  const pendingOrgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', [`u-${captured.pendingUserId}`]);
  assert.equal(pendingOrgs.rows.length, 1, "the pending Account's Workspace is u-<id>");

  // The owner: admin, approved, the operator Workspace, both supabase rows.
  const owners = await pool.query('SELECT id, role, approved FROM "user" WHERE lower(email) = $1', [OWNER_EMAIL]);
  assert.equal(owners.rows.length, 1, "exactly one user for OWNER_EMAIL");
  assert.equal(owners.rows[0].id, captured.ownerUserId);
  assert.equal(owners.rows[0].role, "admin");
  assert.equal(owners.rows[0].approved, true);
  const ownerAccounts = await pool.query('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1', [
    captured.ownerUserId,
  ]);
  assert.deepEqual(
    ownerAccounts.rows.map((row) => [row.providerId, row.accountId]).sort(),
    [["supabase", "e2e-sb-owner"], ["supabase", "e2e-sb-owner-link"]],
    "the owner holds exactly its sign-up row plus the verified link",
  );
  const intruder = await pool.query('SELECT count(*)::int AS n FROM "account" WHERE "accountId" = $1', [
    "e2e-sb-intruder",
  ]);
  assert.equal(intruder.rows[0].n, 0, "the refused sign-in created no account row");
  const orgs = await pool.query('SELECT id FROM "organization" WHERE slug = $1', ["operator"]);
  assert.equal(orgs.rows.length, 1, "the owner's Workspace is slug 'operator'");

  // Production discovery ran unmodified against the stand-in (M2+M3 seam proof).
  const discoveryCount = standin.requests.filter((request) => request.includes("openid-configuration")).length;
  console.log(`discovery hits: ${discoveryCount}`);
  assert.ok(discoveryCount >= 1, "GET /.well-known/openid-configuration hit the stand-in at least once");

  // The identity queue was consumed exactly.
  const authorizeCount = standin.requests.filter((request) => request.startsWith("GET /authorize")).length;
  const tokenCount = standin.requests.filter((request) => request.startsWith("POST /token")).length;
  console.log(`identity queue consumed: GET /authorize ${authorizeCount}, POST /token ${tokenCount}`);
  assert.equal(authorizeCount, IDENTITIES.length, "one GET /authorize per identity");
  assert.equal(tokenCount, IDENTITIES.length, "one POST /token per identity");
});
