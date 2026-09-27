// The Vercel-only configuration facts (R2, PR #264): on a deployment the
// AUTH_TEST_* stand-in overrides are impossible and localhost grants are
// absent, while off Vercel both come back. No DATABASE_URL is needed -- the
// assertions read the options off the really-built Better Auth instance, and
// the two cases import cache-busted specifiers so each gets its own module
// state whose createAuth re-reads process.env.
//
// `node --test` runs each test file in its own process, so the env changes
// here cannot leak into another file; they are still restored at the end.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "./accountDb.ts";

const VERCEL_ENV_SAVED = process.env.VERCEL_ENV;
const SIX_AUTH_TEST = [
  "AUTH_TEST_GOOGLE_AUTHORIZATION_URL",
  "AUTH_TEST_GOOGLE_TOKEN_URL",
  "AUTH_TEST_GOOGLE_USERINFO_URL",
  "AUTH_TEST_GITHUB_AUTHORIZATION_URL",
  "AUTH_TEST_GITHUB_TOKEN_URL",
  "AUTH_TEST_GITHUB_USERINFO_URL",
] as const;
const SAVED_VARS = [
  ...SIX_AUTH_TEST,
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "BETTER_AUTH_URL",
] as const;
const saved = new Map<string, string | undefined>();
for (const name of SAVED_VARS) saved.set(name, process.env[name]);

after(async () => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (VERCEL_ENV_SAVED === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = VERCEL_ENV_SAVED;
  // Idempotent no-op when nothing was opened; closes a PGlite a DB-set run
  // started through getAuth so the process can exit.
  await closeDb();
});

/** The options actually built, as this test reads them. */
type AuthOptions = {
  plugins: { id: string }[];
  socialProviders: Record<string, unknown>;
  baseURL: { allowedHosts: string[] };
  trustedOrigins: string[];
};

/** A distinct specifier is a distinct module instance, so createAuth re-reads
 *  process.env for this case instead of hitting the cached void. */
async function getAuthFresh(specifier: string) {
  const loaded = (await import(specifier)) as typeof import("./accountAuth.ts");
  return loaded.getAuth();
}

function setRealCredentials(): void {
  process.env.BETTER_AUTH_URL = "https://planner.example.com";
  process.env.GOOGLE_CLIENT_ID = "vercel-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "vercel-google-secret";
  process.env.GITHUB_CLIENT_ID = "vercel-github-client";
  process.env.GITHUB_CLIENT_SECRET = "vercel-github-secret";
}

function setStandInOverrides(): void {
  for (const name of SIX_AUTH_TEST) process.env[name] = "http://127.0.0.1:1/standin";
}

test("vercel: AUTH_TEST_* are ignored, providers use real credentials, and the warning is logged once when VERCEL_ENV is set", async () => {
  process.env.VERCEL_ENV = "preview";
  setRealCredentials();
  setStandInOverrides();

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  let options: AuthOptions;
  try {
    const auth = await getAuthFresh("./accountAuth.ts?case=vercel");
    const again = await getAuthFresh("./accountAuth.ts?case=vercel");
    assert.equal(again, auth, "getAuth answers the same instance on the second call");
    options = auth.options as unknown as AuthOptions;
  } finally {
    console.warn = originalWarn;
  }

  const pluginIds = options.plugins.map((plugin) => plugin.id);
  assert.ok(
    !pluginIds.includes("generic-oauth"),
    `generic-oauth must be absent on Vercel: ${JSON.stringify(pluginIds)}`,
  );
  assert.deepEqual(
    Object.keys(options.socialProviders).sort(),
    ["github", "google"],
    `socialProviders: ${JSON.stringify(Object.keys(options.socialProviders))}`,
  );
  assert.ok(
    options.baseURL.allowedHosts.includes("planner.example.com"),
    `allowedHosts names the real host: ${JSON.stringify(options.baseURL.allowedHosts)}`,
  );
  assert.ok(
    !options.baseURL.allowedHosts.includes("localhost:*"),
    `allowedHosts: ${JSON.stringify(options.baseURL.allowedHosts)}`,
  );
  assert.ok(
    !options.trustedOrigins.includes("http://localhost:3000"),
    `trustedOrigins: ${JSON.stringify(options.trustedOrigins)}`,
  );
  assert.equal(
    warnings.filter((line) => line.includes("AUTH_TEST")).length,
    1,
    `exactly one AUTH_TEST warning across two getAuth() calls: ${JSON.stringify(warnings)}`,
  );
});

test("vercel: off Vercel the stand-in overrides and localhost entries apply", async () => {
  delete process.env.VERCEL_ENV;
  setRealCredentials();
  setStandInOverrides();

  const auth = await getAuthFresh("./accountAuth.ts?case=local");
  const options = auth.options as unknown as AuthOptions;

  const pluginIds = options.plugins.map((plugin) => plugin.id);
  assert.ok(
    pluginIds.includes("generic-oauth"),
    `generic-oauth must be present off Vercel: ${JSON.stringify(pluginIds)}`,
  );
  assert.ok(
    options.baseURL.allowedHosts.includes("localhost:*"),
    `allowedHosts: ${JSON.stringify(options.baseURL.allowedHosts)}`,
  );
  assert.ok(
    options.trustedOrigins.includes("http://localhost:3000"),
    `trustedOrigins: ${JSON.stringify(options.trustedOrigins)}`,
  );
});
