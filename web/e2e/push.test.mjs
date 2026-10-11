// PWA-5 (#319): the phone is told when a Mission changes, end to end -- the
// built app, real sessions (the OAuth stand-in), a real database, the deployed
// routes over the in-memory B2 store (fakeB2.mjs), and a stand-in push service
// and ntfy (fakePush.mjs reroutes them to the recorder below). Each stand-in
// device holds its own keys and decrypts what it was sent, as a phone does.
//
// Asserted: subscribing and unsubscribing per Account and device; Dispatched,
// Withdrawn and Superseded from the planner reach only the owning Workspace;
// Collected, Loaded (naming the Card) and a refusal from the host, behind its
// token; the ntfy fallback switched on for an Account; a device the push
// service has forgotten (410) is removed; and the Settings section.
//
// E2E_SHOTS=<dir>: the Notifications section at 375 x 812.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { after, before, test } from "node:test";
import webpush from "web-push";

import { LEDGER_KEY } from "../lib/keys.ts";
import { DEFAULT_SPEC } from "../lib/spec.ts";
import { standinDevice } from "../lib/pushStandin.ts";
import { freePort, launchBrowser, run, spawnServer, stopServer, waitReady, webRoot } from "../scripts/lib/harness.mjs";

const OWNER_EMAIL = "push-owner@example.com";
const IDENTITIES = {
  owner: { id: "push-owner", name: "Push Owner", email: OWNER_EMAIL },
  alpha: { id: "push-alpha", name: "Alpha", email: "push-alpha@example.com" },
};
const ORDER = ["owner", "alpha"];
const HOST_TOKEN = "push-e2e-host-token-0123456789";

const DATE = "2026-10-11";
const AOI = [
  [49.18946, -122.84085],
  [49.18795, -122.84085],
  [49.18795, -122.83938],
  [49.18944, -122.83934],
];
const SITE = { site_id: "push-site-a1b2c3", site: "Push Field" };
const SPEC = { ...DEFAULT_SPEC, ...SITE, date: DATE, aoi: AOI };

let standin;
let base;
let browser;
let server;
let pgliteDir;
let recorder;
const arrived = [];
const contexts = {};
const devices = {
  owner: standinDevice("https://push.fake.test/owner"),
  alpha: standinDevice("https://push.fake.test/alpha"),
  gone: standinDevice("https://push.fake.test/gone"),
};

before(async () => {
  let store;
  const configured = process.env.DATABASE_URL;
  if (configured && /^postgres(ql)?:\/\//.test(configured)) {
    const host = new URL(configured).hostname;
    if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`DATABASE_URL host "${host}" is not loopback`);
    store = configured;
  } else {
    pgliteDir = path.join(webRoot, ".pglite", "e2e-push");
    rmSync(pgliteDir, { recursive: true, force: true });
    mkdirSync(path.dirname(pgliteDir), { recursive: true });
    store = `pglite://${pgliteDir}`;
  }

  // The push service and ntfy: record everything; a forgotten device is 410.
  recorder = createServer((request, response) => {
    const chunks = [];
    request.on("data", (c) => chunks.push(c));
    request.on("end", () => {
      arrived.push({ host: request.headers["x-fake-host"], path: request.url, headers: request.headers, body: Buffer.concat(chunks) });
      response.writeHead(request.url === "/gone" ? 410 : 201).end();
    });
  });
  await new Promise((resolve) => recorder.listen(0, "127.0.0.1", resolve));

  const { startOAuthStandin } = await import("../lib/oauthStandin.ts");
  standin = await startOAuthStandin(ORDER.map((who) => IDENTITIES[who]));
  const port = await freePort();
  base = `http://localhost:${port}`;
  const vapid = webpush.generateVAPIDKeys();
  const env = {
    ...process.env,
    DATABASE_URL: store,
    BETTER_AUTH_SECRET: "push-e2e-secret-0123456789abcdef",
    BETTER_AUTH_URL: base,
    OAUTH_PROXY_SECRET: "push-e2e-proxy-secret",
    GOOGLE_CLIENT_ID: "standin-google-client",
    GOOGLE_CLIENT_SECRET: "standin-google-secret",
    GITHUB_CLIENT_ID: "standin-github-client",
    GITHUB_CLIENT_SECRET: "standin-github-secret",
    OWNER_EMAIL,
    OWNER_WORKSPACE_SLUG: "push-operator",
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
    VAPID_SUBJECT: "mailto:push-owner@example.com",
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    PUSH_HOST_TOKEN: HOST_TOKEN,
    NTFY_URL: "https://ntfy.fake.test",
  };
  for (const name of ["SUPABASE_URL", "SUPABASE_OAUTH_CLIENT_ID", "SUPABASE_OAUTH_CLIENT_SECRET"]) delete env[name];

  const build = await run("npm", ["run", "build"], env);
  console.log(`[build] ${build.at(-1) ?? "(no output)"}`);
  assert.ok(existsSync(path.join(webRoot, ".next", "BUILD_ID")), "the build produced .next/BUILD_ID");

  const seed = { [LEDGER_KEY]: { pool: ["way finder 1", "way finder 2", "way finder 3"], holdings: {} } };
  const preload = ["fakeB2.mjs", "fakePush.mjs"].map((f) => `--import ${path.join(webRoot, "e2e", f)}`).join(" ");
  server = spawnServer(
    {
      ...env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} ${preload}`.trim(),
      E2E_B2_SEED: JSON.stringify(seed),
      E2E_PUSH_TARGET: `http://127.0.0.1:${recorder.address().port}`,
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

  for (const who of ORDER) {
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
  await new Promise((resolve) => (recorder ? recorder.close(resolve) : resolve()));
  if (pgliteDir) rmSync(pgliteDir, { recursive: true, force: true });
});

async function call(who, method, route, data, headers = {}) {
  contexts.anonymous ??= await browser.newContext();
  const response = await contexts[who ?? "anonymous"].request.fetch(`${base}${route}`, {
    method,
    headers: { origin: base, ...headers },
    ...(data === undefined ? {} : { data }),
  });
  return { status: response.status(), body: await response.json().catch(() => ({})) };
}

const host = (data, token = HOST_TOKEN) => call(null, "POST", "/api/push/host", data, token ? { "x-push-token": token } : {});

/** What one stand-in device has been shown since `from`, waiting for `count`
 *  (the planner sends after it answers). */
async function shown(who, count, from = 0, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mine = arrived.slice(from).filter((a) => a.host === "push.fake.test" && a.path === `/${who}`);
    if (mine.length >= count || Date.now() > deadline) return mine.map((a) => devices[who].read(a.body));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));
let ntfyTopic;

test("subscribing: no session is a 401; a subscription that is not https is refused", async () => {
  assert.equal((await call(null, "POST", "/api/push", { subscription: devices.owner.subscription })).status, 401);
  assert.equal((await call(null, "GET", "/api/push")).status, 401);
  const lan = await call("owner", "POST", "/api/push", { subscription: { ...devices.owner.subscription, endpoint: "http://10.0.0.1/x" } });
  assert.equal(lan.status, 400);
});

test("each Account subscribes its own devices, and switches the ntfy fallback on", async () => {
  const read = await call("owner", "GET", "/api/push");
  assert.equal(read.status, 200);
  assert.ok(read.body.publicKey, "the VAPID public key is served");
  assert.equal(read.body.ntfy, null);
  for (const [who, device] of [["owner", "owner"], ["owner", "gone"], ["alpha", "alpha"]]) {
    const r = await call(who, "POST", "/api/push", { subscription: devices[device].subscription });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const on = await call("owner", "POST", "/api/push", { ntfy: true });
  assert.equal(on.status, 200);
  ntfyTopic = on.body.ntfy.topic;
  assert.match(ntfyTopic, /^mission-control-[A-Za-z0-9_-]{24}$/);
  assert.equal((await call("owner", "POST", "/api/push", { ntfy: true })).body.ntfy.topic, ntfyTopic, "on again keeps the topic");
  assert.equal((await call("alpha", "GET", "/api/push")).body.ntfy, null, "the topic is the owner's alone");
});

let dispatchedKey;

test("Dispatched, Superseded and Withdrawn reach only the Workspace that owns the Mission", async () => {
  const from = arrived.length;
  const created = await call("alpha", "POST", "/api/missions", { ...SITE, name: "North half", date: DATE, spec: SPEC });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const first = await call("alpha", "POST", "/api/missions/dispatch", { id: created.body.mission.id });
  assert.equal(first.status, 200, JSON.stringify(first.body));

  const [dispatched] = await shown("alpha", 1, from);
  assert.equal(dispatched.title, "Dispatched");
  assert.equal(dispatched.body, `North half is Dispatched for Push Field ${DATE}. ${first.body.cards.join(", ")} is reserved for it.`);
  assert.equal(dispatched.url, "/plan");

  // An edit of a Dispatched Mission is a new one; Dispatching it supersedes.
  const forked = await call("alpha", "POST", "/api/missions", { id: created.body.mission.id, ...SITE, name: "North half", date: DATE, spec: SPEC });
  assert.equal(forked.status, 200, JSON.stringify(forked.body));
  const second = await call("alpha", "POST", "/api/missions/dispatch", { id: forked.body.mission.id });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  dispatchedKey = second.body.key;
  const told = await shown("alpha", 3, from);
  assert.deepEqual(told.map((n) => n.title).sort(), ["Dispatched", "Dispatched", "Superseded"]);
  assert.equal(told.find((n) => n.title === "Superseded").tag, `mission-${created.body.mission.id}`);

  // A third Mission, Withdrawn.
  const other = await call("alpha", "POST", "/api/missions", { ...SITE, name: "Orbit", date: DATE, spec: SPEC });
  await call("alpha", "POST", "/api/missions/dispatch", { id: other.body.mission.id });
  const withdrawn = await call("alpha", "POST", "/api/missions/withdraw", { id: other.body.mission.id });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
  const all = await shown("alpha", 5, from);
  const w = all.find((n) => n.title === "Withdrawn");
  assert.ok(w, JSON.stringify(all));
  assert.match(w.body, /^Orbit was Withdrawn\. way finder \d is free\.$/);
  // The repeat changed nothing and tells nobody.
  await call("alpha", "POST", "/api/missions/withdraw", { id: other.body.mission.id });
  await settle();
  assert.equal((await shown("alpha", 99, from, 0)).length, 5);

  assert.equal((await shown("owner", 1, from, 0)).length, 0, "another Workspace is told nothing");
  assert.equal(arrived.slice(from).filter((a) => a.host === "ntfy.fake.test").length, 0);
});

test("the host's route needs its token, and takes only its own events", async () => {
  assert.equal((await host({ event: "collected", keys: ["k"] }, null)).status, 401);
  assert.equal((await host({ event: "collected", keys: ["k"] }, "wrong-token-wrong-token-wrong-")).status, 401);
  assert.equal((await host({ event: "flown", keys: ["k"] })).status, 400, "Flown is never announced");
});

test("Loaded from the host names the Card to open, to the owning Workspace", async () => {
  const from = arrived.length;
  const r = await host({ event: "loaded", loads: [{ key: dispatchedKey, cards: ["way finder 2"] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const [loaded] = await shown("alpha", 1, from);
  assert.equal(loaded.title, "Loaded");
  assert.equal(loaded.body, "North half is Loaded into way finder 2. Open way finder 2.");
  assert.equal((await shown("owner", 1, from, 0)).length, 0);
});

test("Collected of an unknown Spec and a refusal go to the operator, by Web Push and ntfy; a gone device is removed", async () => {
  let from = arrived.length;
  assert.equal((await host({ event: "collected", keys: ["specs/hand/2026-10-11/x.json"] })).status, 200);
  const [collected] = await shown("owner", 1, from);
  assert.equal(collected.body, "specs/hand/2026-10-11/x.json is Collected. It will Load when the Controller is plugged in.");
  const ntfy = arrived.slice(from).find((a) => a.host === "ntfy.fake.test");
  assert.equal(ntfy.path, `/${ntfyTopic}`);
  assert.equal(ntfy.headers.title, "Collected");
  assert.equal(ntfy.body.toString(), collected.body);
  assert.equal(arrived.slice(from).filter((a) => a.path === "/gone").length, 1, "the forgotten device was tried once");

  from = arrived.length;
  const reason = "Load refused: 4 parts do not fit 3 Cards. Nothing was Loaded. Dispatch fewer Missions or clear a Card, then plug the Controller in again.";
  assert.equal((await host({ event: "refused", keys: [dispatchedKey], reason })).status, 200);
  const [refused] = await shown("owner", 1, from);
  assert.deepEqual([refused.title, refused.body], ["Load refused", reason]);
  assert.equal(arrived.slice(from).filter((a) => a.path === "/gone").length, 0, "and is not tried again");
  assert.equal((await shown("alpha", 1, from, 0)).length, 0, "the Controller's refusals are the operator's");
});

test("unsubscribing a device stops it being told; ntfy switches off", async () => {
  const off = await call("alpha", "DELETE", "/api/push", { endpoint: devices.alpha.subscription.endpoint });
  assert.equal(off.status, 200);
  assert.equal((await call("owner", "POST", "/api/push", { ntfy: false })).body.ntfy, null);
  const from = arrived.length;
  await host({ event: "loaded", loads: [{ key: dispatchedKey, cards: ["way finder 2"] }] });
  await host({ event: "collected", keys: ["specs/hand/2026-10-11/y.json"] });
  await settle();
  assert.equal((await shown("alpha", 1, from, 0)).length, 0);
  assert.equal(arrived.slice(from).filter((a) => a.host === "ntfy.fake.test").length, 0);
  assert.equal((await shown("owner", 1, from, 0)).length, 1, "the owner's phone still is");
});

test("Settings shows Notifications, and the ntfy backup can be switched on there", async () => {
  const page = await contexts.owner.newPage();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
    await page.locator('nav[aria-label="Show"]').getByRole("button", { name: "Settings" }).click({ timeout: 30_000 });
    const section = page.locator("section[aria-labelledby='notifications-title']");
    await section.waitFor({ timeout: 30_000 });
    await section.getByText(/iOS 16\.4 or later/).waitFor();
    await section.getByRole("button", { name: "Turn on the ntfy backup" }).click();
    await section.getByLabel("ntfy topic").waitFor({ timeout: 10_000 });
    assert.match(await section.getByLabel("ntfy topic").innerText(), /^mission-control-/);
    if (process.env.E2E_SHOTS) {
      mkdirSync(process.env.E2E_SHOTS, { recursive: true });
      await section.getByRole("button", { name: "Turn off the ntfy backup" }).waitFor();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      await section.screenshot({ path: path.join(process.env.E2E_SHOTS, "notifications-section-375.png") });
      await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "notifications-375.png") });
    }
  } finally {
    await page.close();
  }
});
