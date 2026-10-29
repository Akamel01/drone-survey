// #244: Missions belong to a Workspace, end to end -- the built app, real
// sessions from real sign-ins (the OAuth stand-in), a real database, and the
// deployed Mission routes over an in-memory B2 store preloaded into the server
// (e2e/fakeB2.mjs). Nothing here reaches past the routes.
//
// Asserted: no session is a 401 and a pending Account a 403 on every planner
// route; two approved Accounts in different Workspaces cannot list, read,
// save, dispatch or withdraw each other's Missions (404, never 403); a
// Mission with no ownership row is the operator's alone; and a signed-out
// /plan goes to the home page, which is the sign-in.
//
// Store: DATABASE_URL postgres:// on loopback is used as given (CI); anything
// else is a fresh PGlite directory (web/.pglite/e2e-workspaces, gitignored).
// One `node --test` file, run with --test-concurrency=1 like the others.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import { LEDGER_KEY, missionKey } from "../lib/keys.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { siteBounds, tilesFor } from "../lib/siteMap.ts";
import { pmtilesArchive, serveArchive } from "../scripts/lib/pmtilesFixture.mjs";
import { freePort, launchBrowser, run, spawnServer, stopServer, waitReady, webRoot } from "../scripts/lib/harness.mjs";

const OWNER_EMAIL = "workspaces-owner@example.com";
const IDENTITIES = {
  owner: { id: "ws-owner", name: "Workspace Owner", email: OWNER_EMAIL },
  alpha: { id: "ws-alpha", name: "Alpha", email: "ws-alpha@example.com" },
  beta: { id: "ws-beta", name: "Beta", email: "ws-beta@example.com" },
  // An unverified provider email stays pending (#341).
  pending: { id: "ws-pending", name: "Pending", email: "ws-pending@example.com", emailVerified: false },
};
const ORDER = ["owner", "alpha", "beta", "pending"];

const DATE = "2026-10-10";
const AOI = [
  [49.18946, -122.84085],
  [49.18795, -122.84085],
  [49.18795, -122.83938],
  [49.18944, -122.83934],
];
const SITE = { site_id: "ws-site-a1b2c3", site: "Workspace Field" };
const SPEC = { ...DEFAULT_SPEC, ...SITE, date: DATE, aoi: AOI };
const LEGACY = "legacy-before-accounts";

let standin;
let base;
let browser;
let server;
let pgliteDir;
let archive;
const TILES = tilesFor(siteBounds(AOI)).tiles;
const contexts = {};

before(async () => {
  let store;
  const configured = process.env.DATABASE_URL;
  if (configured && /^postgres(ql)?:\/\//.test(configured)) {
    const host = new URL(configured).hostname;
    if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`DATABASE_URL host "${host}" is not loopback`);
    store = configured;
  } else {
    pgliteDir = path.join(webRoot, ".pglite", "e2e-workspaces");
    rmSync(pgliteDir, { recursive: true, force: true });
    mkdirSync(path.dirname(pgliteDir), { recursive: true });
    store = `pglite://${pgliteDir}`;
  }

  archive = await serveArchive(pmtilesArchive(TILES));
  const { startOAuthStandin } = await import("../lib/oauthStandin.ts");
  standin = await startOAuthStandin(ORDER.map((who) => IDENTITIES[who]));
  const port = await freePort();
  base = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: store,
    BETTER_AUTH_SECRET: "workspaces-e2e-secret-0123456789abcdef",
    BETTER_AUTH_URL: base,
    OAUTH_PROXY_SECRET: "workspaces-e2e-proxy-secret",
    GOOGLE_CLIENT_ID: "standin-google-client",
    GOOGLE_CLIENT_SECRET: "standin-google-secret",
    GITHUB_CLIENT_ID: "standin-github-client",
    GITHUB_CLIENT_SECRET: "standin-github-secret",
    OWNER_EMAIL,
    // Its own slug, so a shared CI Postgres that already holds another
    // suite's "operator" Workspace cannot answer for this one.
    OWNER_WORKSPACE_SLUG: "workspaces-operator",
    AUTH_TRUSTED_ORIGINS: base,
    AUTH_TEST_GOOGLE_AUTHORIZATION_URL: `${standin.baseUrl}/authorize`,
    AUTH_TEST_GOOGLE_TOKEN_URL: `${standin.baseUrl}/token`,
    AUTH_TEST_GOOGLE_USERINFO_URL: `${standin.baseUrl}/userinfo`,
    AUTH_TEST_GITHUB_AUTHORIZATION_URL: `${standin.baseUrl}/authorize`,
    AUTH_TEST_GITHUB_TOKEN_URL: `${standin.baseUrl}/token`,
    AUTH_TEST_GITHUB_USERINFO_URL: `${standin.baseUrl}/userinfo`,
    B2_BUCKET: "fake-bucket",
    B2_KEY_ID: "ci",
    B2_APP_KEY: "ci",
    B2_READ_KEY_ID: "ci",
    B2_READ_APP_KEY: "ci",
    LEDGER_SETTLE_MS: "0",
    SITE_MAP_PMTILES_URL: archive.url,
  };
  for (const name of ["SUPABASE_URL", "SUPABASE_OAUTH_CLIENT_ID", "SUPABASE_OAUTH_CLIENT_SECRET"]) delete env[name];

  const build = await run("npm", ["run", "build"], env);
  console.log(`[build] ${build.at(-1) ?? "(no output)"}`);
  assert.ok(existsSync(path.join(webRoot, ".next", "BUILD_ID")), "the build produced .next/BUILD_ID");

  // A Mission from before Accounts: in the store, with no ownership row.
  const at = "2026-10-10T08:00:00.000Z";
  const legacy = { id: LEGACY, ...SITE, name: "Legacy", date: DATE, created_at: at, updated_at: at, spec: SPEC, dispatched_key: null };
  const seed = { [LEDGER_KEY]: { pool: ["way finder 1", "way finder 2"], holdings: {} }, [missionKey(LEGACY)]: legacy };
  server = spawnServer(
    {
      ...env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${path.join(webRoot, "e2e", "fakeB2.mjs")}`.trim(),
      E2E_B2_SEED: JSON.stringify(seed),
    },
    port,
  );
  await waitReady(server, `${base}/api/auth/get-session`, "next start");
  browser = await launchBrowser();
  process.on("exit", () => {
    try {
      if (server) process.kill(-server.proc.pid, "SIGKILL");
    } catch {}
  });

  // One sign-in per Account, through the stand-in, in its queue's order.
  // better-auth allows 3 sign-in POSTs per rolling 10 s; the fourth waits.
  for (const [i, who] of ORDER.entries()) {
    if (i === 3) await new Promise((resolve) => setTimeout(resolve, 10_500));
    const context = await browser.newContext();
    const signIn = await context.request.post(`${base}/api/auth/sign-in/social`, {
      headers: { origin: base },
      data: { provider: "google", callbackURL: `${base}/` },
    });
    const body = await signIn.json();
    assert.ok(signIn.ok() && body.url, `${who}: sign-in/social answered ${signIn.status()} ${JSON.stringify(body)}`);
    const page = await context.newPage();
    await page.goto(body.url, { waitUntil: "domcontentloaded" });
    await page.close();
    const session = await (await context.request.get(`${base}/api/auth/get-session`)).json();
    assert.equal(session?.user?.email, IDENTITIES[who].email, `${who} is signed in`);
    assert.equal(session.user.approved, who !== "pending", `${who}'s approval`);
    contexts[who] = context;
  }
});

after(async () => {
  for (const context of Object.values(contexts)) await context.close().catch(() => {});
  const current = server;
  server = undefined;
  await stopServer(current);
  if (browser) await browser.close();
  if (standin) await standin.stop();
  await archive?.close();
  if (pgliteDir) rmSync(pgliteDir, { recursive: true, force: true });
});

/** One call to a planner route as an Account (or with no session at all). */
async function call(who, method, route, data) {
  contexts.anonymous ??= await browser.newContext();
  const request = contexts[who ?? "anonymous"].request;
  const response = await request.fetch(`${base}${route}`, {
    method,
    headers: { origin: base },
    ...(data === undefined ? {} : { data }),
  });
  return { status: response.status(), body: await response.json().catch(() => ({})) };
}

const listed = async (who) => (await call(who, "GET", "/api/missions?archived=1")).body.missions.map((m) => m.id);
const draft = (name) => ({ ...SITE, name, date: DATE, spec: SPEC });

test("no session is a 401 and a pending Account a 403, on every planner route", async () => {
  const routes = [
    ["GET", "/api/missions?archived=1"],
    ["POST", "/api/missions", draft("Nope")],
    ["DELETE", `/api/missions?id=${LEGACY}`],
    ["POST", "/api/missions/dispatch", { id: LEGACY }],
    ["POST", "/api/missions/withdraw", { id: LEGACY }],
    ["POST", "/api/missions/flown", { id: LEGACY, flown: true }],
    ["POST", "/api/missions/loaded", { id: LEGACY, cards: [] }],
    ["GET", "/api/specs?key=specs/x/y/z.json"],
    ["GET", "/api/site-map/10/163/355"],
  ];
  for (const [method, route, data] of routes) {
    const none = await call(null, method, route, data);
    assert.equal(none.status, 401, `${method} ${route} with no session`);
    assert.equal(none.body.error, "Sign in to continue: this request carried no session.");
    const pending = await call("pending", method, route, data);
    assert.equal(pending.status, 403, `${method} ${route} as a pending Account`);
    assert.match(pending.body.error, /waiting for approval/);
  }
});

test("an approved Account reaches the offline street map; the route needs nothing else", async () => {
  const [z, x, y] = TILES[0];
  const response = await contexts.alpha.request.get(`${base}/api/site-map/${z}/${x}/${y}`);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["content-type"], "application/x-protobuf");
  assert.ok((await response.body()).length > 0);
});

test("a Mission with no ownership row is the operator's alone", async () => {
  assert.deepEqual(await listed("owner"), [LEGACY]);
  assert.deepEqual(await listed("alpha"), []);
  assert.deepEqual(await listed("beta"), []);
  assert.equal((await call("alpha", "POST", "/api/missions/dispatch", { id: LEGACY })).status, 404);
  assert.equal((await call("alpha", "POST", "/api/missions", { ...draft("Taken"), id: LEGACY })).status, 404);
});

test("two approved Accounts in different Workspaces cannot see or change each other's Missions", async () => {
  const created = await call("alpha", "POST", "/api/missions", draft("Alpha's"));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const a = created.body.mission.id;
  const b = (await call("beta", "POST", "/api/missions", draft("Beta's"))).body.mission.id;

  // list (read): each sees its own, and the operator sees neither.
  assert.deepEqual(await listed("alpha"), [a]);
  assert.deepEqual(await listed("beta"), [b]);
  assert.deepEqual((await listed("owner")).sort(), [LEGACY]);

  // save: an edit to another Workspace's Mission is "not in the store".
  const save = await call("beta", "POST", "/api/missions", { ...draft("Hijacked"), id: a });
  assert.equal(save.status, 404);
  assert.equal(save.body.error, "That Mission is no longer in the store. Reload the Mission list and save it again.");

  // dispatch and withdraw: only by its own Workspace.
  assert.equal((await call("beta", "POST", "/api/missions/dispatch", { id: a })).status, 404);
  const dispatched = await call("alpha", "POST", "/api/missions/dispatch", { id: a });
  assert.equal(dispatched.status, 200, JSON.stringify(dispatched.body));
  assert.equal((await call("beta", "POST", "/api/missions/withdraw", { id: a })).status, 404);
  assert.equal((await call("owner", "POST", "/api/missions/withdraw", { id: a })).status, 404);
  assert.equal((await call("beta", "DELETE", `/api/missions?id=${a}`)).status, 404);

  // read the Spec: only the Workspace whose Mission Dispatched it.
  const key = dispatched.body.key;
  assert.equal((await call("beta", "GET", `/api/specs?key=${encodeURIComponent(key)}`)).status, 404);

  // Card holdings are shown only to the Workspace whose Mission holds them.
  const betaRead = (await call("beta", "GET", "/api/missions?archived=1")).body;
  assert.deepEqual(betaRead.ledger.holdings, {});
  const alphaRead = (await call("alpha", "GET", "/api/missions?archived=1")).body;
  assert.equal(alphaRead.missions[0].name, "Alpha's", "beta's save changed nothing");
  assert.equal(alphaRead.missions[0].state, "dispatched");

  const withdrawn = await call("alpha", "POST", "/api/missions/withdraw", { id: a });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
});

test("signed out, /plan goes to the home page, which is the sign-in", async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
    await page.getByRole("button", { name: "Continue with Google", exact: true }).waitFor({ timeout: 20_000 });
    assert.equal(await page.getByLabel(/passphrase/i).count(), 0, "no passphrase is asked for anywhere");
  } finally {
    await context.close();
  }
});

test("the operator signed in sees today's Missions on /plan, with no passphrase", async () => {
  const page = await contexts.owner.newPage();
  try {
    await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-row-id="${LEGACY}"]`).first().waitFor({ timeout: 30_000 });
    assert.equal(await page.getByLabel(/passphrase/i).count(), 0);
  } finally {
    await page.close();
  }
});
