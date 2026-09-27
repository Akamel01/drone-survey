// Acceptance-1 evidence (D14/report F): signs in through the BUILT app over
// real HTTP, with the OAuth providers replaced by the in-process stand-in
// (lib/oauthStandin.ts) and the database a local PGlite directory.
//
// Usage: cd web && npm run build && node scripts/auth-evidence.mjs
//
// It starts the stand-in, migrates the directory database, starts
// `next start` on a free port with BETTER_AUTH_URL equal to that origin (so
// the oauth-proxy plugin skips its production redirect and the state binding
// holds), drives google and github in two separate browser contexts (each with
// its own cookie jar) through signIn.social -> stand-in -> callback ->
// get-session, screenshots each signed-in session, prints the checked database
// rows, and exits non-zero unless both sessions exist with the right Workspace,
// role and approval. Everything is cleaned up on exit; web/.evidence/ is
// gitignored and never committed.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(webRoot, ".evidence");
const dbDir = path.join(webRoot, ".pglite", "auth-evidence");
const DATABASE_URL = `pglite://${dbDir}`;
const OWNER_EMAIL = "Owner@Example.com";

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

async function main() {
  if (!existsSync(path.join(webRoot, ".next", "BUILD_ID"))) {
    throw new Error("no production build found; run `npm run build` in web/ first");
  }
  mkdirSync(evidenceDir, { recursive: true });
  rmSync(dbDir, { recursive: true, force: true });
  mkdirSync(path.dirname(dbDir), { recursive: true });

  const { startOAuthStandin } = await import("../lib/oauthStandin.ts");
  const standin = await startOAuthStandin([
    { id: "standin-owner", name: "Owner Example", email: "owner@example.com", image: null },
    { id: "standin-other", name: "Other Example", email: "other@example.com", image: null },
  ]);

  const port = await freePort();
  const base = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL,
    BETTER_AUTH_SECRET: "auth-evidence-secret-0123456789abcdef",
    BETTER_AUTH_URL: base,
    OAUTH_PROXY_SECRET: "auth-evidence-proxy-secret",
    GOOGLE_CLIENT_ID: "standin-google-client",
    GOOGLE_CLIENT_SECRET: "standin-google-secret",
    GITHUB_CLIENT_ID: "standin-github-client",
    GITHUB_CLIENT_SECRET: "standin-github-secret",
    OWNER_EMAIL,
    AUTH_TRUSTED_ORIGINS: base,
    AUTH_TEST_GOOGLE_AUTHORIZATION_URL: `${standin.baseUrl}/authorize`,
    AUTH_TEST_GOOGLE_TOKEN_URL: `${standin.baseUrl}/token`,
    AUTH_TEST_GOOGLE_USERINFO_URL: `${standin.baseUrl}/userinfo`,
    AUTH_TEST_GITHUB_AUTHORIZATION_URL: `${standin.baseUrl}/authorize`,
    AUTH_TEST_GITHUB_TOKEN_URL: `${standin.baseUrl}/token`,
    AUTH_TEST_GITHUB_USERINFO_URL: `${standin.baseUrl}/userinfo`,
  };

  console.log(`stand-in: ${standin.baseUrl}`);
  console.log(`migrating ${DATABASE_URL}`);
  for (const line of await run(process.execPath, ["scripts/migrate.mjs"], env)) console.log(`[migrate] ${line}`);

  const serverLines = [];
  const server = spawn("npm", ["run", "start", "--", "-p", String(port)], {
    cwd: webRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => serverLines.push(...String(chunk).split("\n").filter(Boolean)));
  server.stderr.on("data", (chunk) => serverLines.push(...String(chunk).split("\n").filter(Boolean)));
  const serverExit = new Promise((resolve) => server.once("exit", resolve));

  let browser;
  const results = {};
  try {
    const deadline = Date.now() + 60_000;
    for (;;) {
      if (server.exitCode !== null) throw new Error(`next start exited early:\n${serverLines.join("\n")}`);
      try {
        const probe = await fetch(`${base}/api/auth/get-session`);
        if (probe.status === 200) break;
      } catch {}
      if (Date.now() > deadline) throw new Error(`next start did not answer on ${base}:\n${serverLines.join("\n")}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    console.log(`app: ${base} (pid ${server.pid})`);

    browser = await launchBrowser();
    for (const [provider, expectation] of [
      ["google", { email: "owner@example.com", role: "admin", approved: true, slug: "operator" }],
      ["github", { email: "other@example.com", role: "user", approved: false, slug: null }],
    ]) {
      // A fresh context per provider: a browser cookie jar, shared by its
      // request API and its pages, so the sign-in POST's state cookie reaches
      // the callback navigation.
      const context = await browser.newContext();
      try {
        const signIn = await context.request.post(`${base}/api/auth/sign-in/social`, {
          headers: { origin: base },
          data: { provider, callbackURL: `${base}/` },
        });
        const signInBody = await signIn.json();
        if (!signIn.ok() || !signInBody.url) {
          throw new Error(`${provider}: sign-in/social answered ${signIn.status()} ${JSON.stringify(signInBody)}`);
        }
        const page = await context.newPage();
        await page.goto(signInBody.url, { waitUntil: "load" }); // stand-in redirects to the callback, callback to base/

        const sessionResponse = await context.request.get(`${base}/api/auth/get-session`);
        const session = await sessionResponse.json();
        if (!session?.user) throw new Error(`${provider}: no session after the callback (${sessionResponse.status()})`);
        const orgResponse = await context.request.get(`${base}/api/auth/organization/list`);
        const orgs = await orgResponse.json();
        if (!Array.isArray(orgs)) throw new Error(`${provider}: organization/list answered ${orgResponse.status()} ${JSON.stringify(orgs)}`);

        await page.goto(`${base}/api/auth/get-session`, { waitUntil: "load" });
        const screenshot = path.join(evidenceDir, `${provider}.png`);
        await page.screenshot({ path: screenshot });
        results[provider] = { session, orgs, screenshot };
        console.log(
          `${provider}: session user ${session.user.id} <${session.user.email}> role=${session.user.role} approved=${session.user.approved} workspace=${orgs.map((org) => org.slug).join(",") || "(none)"} screenshot=${screenshot}`,
        );
        if (session.user.email.toLowerCase() !== expectation.email) {
          throw new Error(`${provider}: expected ${expectation.email}, got ${session.user.email}`);
        }
      } finally {
        await context.close();
      }
    }

    const owner = results.google;
    const other = results.github;
    const problems = [];
    if (owner.session.user.role !== "admin") problems.push(`owner role is ${owner.session.user.role}, want admin`);
    if (owner.session.user.approved !== true) problems.push(`owner approved is ${owner.session.user.approved}, want true`);
    if (!owner.orgs.some((org) => org.slug === "operator")) problems.push(`owner workspace is ${owner.orgs.map((o) => o.slug)}, want operator`);
    if (other.session.user.id === owner.session.user.id) problems.push("both providers signed in as the same account");
    if (other.session.user.approved === true) problems.push("the second account is approved, want pending");
    const otherSlug = `u-${other.session.user.id}`;
    if (!other.orgs.some((org) => org.slug === otherSlug)) problems.push(`second workspace is ${other.orgs.map((o) => o.slug)}, want ${otherSlug}`);
    if (problems.length > 0) throw new Error(`acceptance rows disagree: ${problems.join("; ")}`);
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
    await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
    await standin.stop();
  }

  // The app has stopped, so the directory database is free: read the rows the
  // flow actually wrote, straight from PGlite.
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(dbDir);
  const users = await db.query('SELECT id, email, role, approved FROM "user" ORDER BY email');
  const members = await db.query('SELECT m.role AS member_role, o.slug FROM "member" m JOIN "organization" o ON o.id = m."organizationId" ORDER BY o.slug');
  await db.close();

  console.log("checked database rows:");
  for (const user of users.rows) console.log(`  user  id=${user.id} email=${user.email} role=${user.role} approved=${user.approved}`);
  for (const member of members.rows) console.log(`  member role=${member.member_role} workspace=${member.slug}`);
  for (const provider of ["google", "github"]) {
    const file = results[provider].screenshot;
    console.log(`  evidence ${file} (${statSync(file).size} bytes)`);
  }

  for (const provider of ["google", "github"]) {
    if (!existsSync(results[provider].screenshot)) throw new Error(`missing screenshot ${results[provider].screenshot}`);
  }
  rmSync(dbDir, { recursive: true, force: true });
}

try {
  await main();
  console.log("auth evidence: both providers signed in; exit 0");
} catch (error) {
  console.error(`auth evidence failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
