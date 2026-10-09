// M3 route tests: consent helpers + approve/deny handlers against the M2
// stand-in (frozen paths). No browser, no live Supabase. Run from web/:
//   node --import ./scripts/test-hooks.mjs --test app/oauth/consent/consent.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startOAuthStandin } from "../../../lib/oauthStandin.ts";
import {
  SUPABASE_CALLBACK,
  approveAuthorization,
  consentBase,
  denyAuthorization,
  getAuthorizationDetails,
} from "./consent.ts";
import { POST as approvePOST } from "./approve/route.ts";
import { POST as denyPOST } from "./deny/route.ts";

const here = dirname(fileURLToPath(import.meta.url));
const alice = { id: "m3-alice", name: "Alice", email: "alice@example.com" };
const bob = { id: "m3-bob", name: "Bob", email: "bob@example.com" };

const savedBase = process.env.SUPABASE_URL;
const savedId = process.env.SUPABASE_OAUTH_CLIENT_ID;
const savedSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
function cleanEnv() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_OAUTH_CLIENT_ID;
  delete process.env.SUPABASE_OAUTH_CLIENT_SECRET;
}
function restoreEnv() {
  cleanEnv();
  if (savedBase !== undefined) process.env.SUPABASE_URL = savedBase;
  if (savedId !== undefined) process.env.SUPABASE_OAUTH_CLIENT_ID = savedId;
  if (savedSecret !== undefined) process.env.SUPABASE_OAUTH_CLIENT_SECRET = savedSecret;
}

/** Tiny server returning fixed JSON per path while capturing auth headers. */
async function startProbe(routes, seen = {}) {
  const server = createServer((request, response) => {
    seen.authorization = request.headers.authorization ?? null;
    const [path] = (request.url ?? "/").split("?");
    const route = routes[path];
    if (!route) {
      response.writeHead(404, { "content-type": "application/json" }).end("{}");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(route));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    seen,
    stop: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

test("details render client name/scopes from the server only, read-only", async () => {
  cleanEnv();
  const standin = await startOAuthStandin([alice, bob]);
  try {
    const first = await getAuthorizationDetails(standin.baseUrl);
    assert.equal(first.client_name, "Stand-in Supabase client");
    assert.ok(first.scope.includes("openid"));
    assert.equal(first.redirect_uri, SUPABASE_CALLBACK);
    // Read-only: a second read consumes nothing, approve still gets alice.
    await getAuthorizationDetails(standin.baseUrl);
    const target = await approveAuthorization(standin.baseUrl);
    assert.ok(target.startsWith(`${SUPABASE_CALLBACK}?code=code-m3-alice-`), `approve keeps alice: ${target}`);
  } finally {
    restoreEnv();
    await standin.stop();
  }
});

test("approve redirects to the exact callback with code + echoed state", async () => {
  cleanEnv();
  const standin = await startOAuthStandin([alice]);
  try {
    const target = await approveAuthorization(standin.baseUrl, "s1");
    const url = new URL(target);
    assert.equal(`${url.origin}${url.pathname}`, SUPABASE_CALLBACK, "exact match, no wildcards");
    const code = url.searchParams.get("code");
    assert.ok(code, "code present");
    assert.equal(url.searchParams.get("state"), "s1");
    // The code redeems at /token and userinfo carries sub = id.
    const token = await (
      await fetch(`${standin.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code }),
      })
    ).json();
    const me = await (
      await fetch(`${standin.baseUrl}/userinfo`, { headers: { authorization: `Bearer ${token.access_token}` } })
    ).json();
    assert.equal(me.sub, me.id);
    assert.equal(me.id, "m3-alice");
  } finally {
    restoreEnv();
    await standin.stop();
  }
});

test("deny performs the real cancel redirect and issues no code", async () => {
  cleanEnv();
  const standin = await startOAuthStandin([alice, bob]);
  try {
    const target = await denyAuthorization(standin.baseUrl);
    assert.equal(target, `${SUPABASE_CALLBACK}?error=access_denied`);
    // Deny consumed alice: the next approve gets bob.
    const next = await approveAuthorization(standin.baseUrl);
    assert.ok(next.includes("code-m3-bob-"), `deny consumed one identity: ${next}`);
  } finally {
    restoreEnv();
    await standin.stop();
  }
});

test("non-registered redirect_uri refuses to render or redirect", async () => {
  cleanEnv();
  const probe = await startProbe({
    "/oauth/authorization-details": {
      client_id: "evil",
      client_name: "Evil client",
      scope: "openid",
      redirect_uri: "https://evil.example/callback",
    },
  });
  try {
    await assert.rejects(getAuthorizationDetails(probe.baseUrl), /not the registered callback/);
    await assert.rejects(approveAuthorization(probe.baseUrl), /not the registered callback/);
    await assert.rejects(denyAuthorization(probe.baseUrl), /not the registered callback/);
  } finally {
    restoreEnv();
    await probe.stop();
  }
});

test("client secret stays server-side: Basic header on server calls, absent from browser sources", async () => {
  const seen = {};
  const probe = await startProbe(
    {
      "/oauth/authorization-details": {
        client_id: "standin",
        client_name: "Stand-in Supabase client",
        scope: "openid email profile",
        redirect_uri: SUPABASE_CALLBACK,
      },
      "/oauth/approve": { code: "code-probe-0" },
    },
    seen,
  );
  process.env.SUPABASE_OAUTH_CLIENT_ID = "probe-id";
  process.env.SUPABASE_OAUTH_CLIENT_SECRET = "probe-secret";
  try {
    await approveAuthorization(probe.baseUrl);
    assert.equal(seen.authorization, `Basic ${Buffer.from("probe-id:probe-secret").toString("base64")}`);
    for (const file of ["page.tsx", "consent-signin.tsx"]) {
      const source = await readFile(join(here, file), "utf8");
      assert.ok(!source.includes("SUPABASE_OAUTH_CLIENT_SECRET"), `${file} must not name the secret`);
      assert.ok(!source.includes("SUPABASE_OAUTH_CLIENT_ID"), `${file} must not name the client id`);
    }
  } finally {
    restoreEnv();
    await probe.stop();
  }
});

test("approve/deny route handlers 303 to server-derived targets, ignore caller input", async () => {
  cleanEnv();
  const standin = await startOAuthStandin([alice, bob]);
  process.env.SUPABASE_URL = standin.baseUrl;
  try {
    assert.equal(consentBase(), standin.baseUrl);
    const approve = await approvePOST();
    assert.equal(approve.status, 303);
    const approveTarget = approve.headers.get("location");
    assert.ok(approveTarget?.startsWith(`${SUPABASE_CALLBACK}?code=code-m3-alice-`), approveTarget);
    const deny = await denyPOST();
    assert.equal(deny.status, 303);
    assert.equal(deny.headers.get("location"), `${SUPABASE_CALLBACK}?error=access_denied`);
    // Handlers take no request argument: no caller URL can enter the target.
    assert.equal(approvePOST.length, 0);
    assert.equal(denyPOST.length, 0);
  } finally {
    restoreEnv();
    await standin.stop();
  }
});

test("route handlers 503 without SUPABASE_URL", async () => {
  cleanEnv();
  try {
    assert.equal((await approvePOST()).status, 503);
    assert.equal((await denyPOST()).status, 503);
  } finally {
    restoreEnv();
  }
});
