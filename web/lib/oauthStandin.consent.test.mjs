// M2 smoke: Supabase OAuth-server surface on the stand-in (frozen paths).
// node:http + fetch asserts, no browser. Run:
//   node --test web/lib/oauthStandin.consent.test.mjs   (from web/)
import { test } from "node:test";
import assert from "node:assert/strict";

import { startOAuthStandin } from "./oauthStandin.ts";

const alice = { id: "consent-alice", name: "Alice", email: "alice@example.com" };
const bob = { id: "consent-bob", name: "Bob", email: "bob@example.com" };

async function json(response) {
  assert.equal(response.headers.get("content-type"), "application/json");
  return response.json();
}

test("discovery document lives at the frozen Supabase-mirroring path", async () => {
  const standin = await startOAuthStandin([alice]);
  try {
    const response = await fetch(`${standin.baseUrl}/auth/v1/.well-known/openid-configuration`);
    assert.equal(response.status, 200);
    const doc = await json(response);
    assert.equal(doc.issuer, standin.baseUrl);
    assert.equal(doc.authorization_endpoint, `${standin.baseUrl}/authorize`);
    assert.equal(doc.token_endpoint, `${standin.baseUrl}/token`);
    assert.equal(doc.userinfo_endpoint, `${standin.baseUrl}/userinfo`);
  } finally {
    await standin.stop();
  }
});

test("authorization-details is read-only; approve consumes one identity per flow", async () => {
  const standin = await startOAuthStandin([alice, bob]);
  try {
    // Read-only: must not advance the queue, so the approve below still gets alice.
    const details = await fetch(`${standin.baseUrl}/oauth/authorization-details`);
    assert.equal(details.status, 200);
    const body = await json(details);
    assert.ok(body.client_name, "details name the client (never query params)");
    assert.ok(body.scope, "details carry the scopes");

    const approve = await fetch(`${standin.baseUrl}/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(approve.status, 200);
    const { code } = await json(approve);
    assert.ok(code, "approve issues a code");

    // /token shape unchanged: exactly access_token/token_type/expires_in.
    const token = await fetch(`${standin.baseUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code }),
    });
    assert.equal(token.status, 200);
    const tokenBody = await json(token);
    assert.deepEqual(Object.keys(tokenBody).sort(), ["access_token", "expires_in", "token_type"]);

    // /userinfo gains OIDC sub (= id) alongside the existing fields.
    const userinfo = await fetch(`${standin.baseUrl}/userinfo`, {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
    });
    assert.equal(userinfo.status, 200);
    const me = await json(userinfo);
    assert.equal(me.id, "consent-alice");
    assert.equal(me.sub, me.id);
    assert.equal(me.email, "alice@example.com");
  } finally {
    await standin.stop();
  }
});

test("deny consumes one identity and issues no code; empty queue fails loudly", async () => {
  const standin = await startOAuthStandin([alice, bob]);
  try {
    const approve = await fetch(`${standin.baseUrl}/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(approve.status, 200);

    const deny = await fetch(`${standin.baseUrl}/oauth/deny`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(deny.status, 200);
    const denied = await json(deny);
    assert.ok(!("code" in denied), "deny issues no code");

    const empty = await fetch(`${standin.baseUrl}/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(empty.status, 400, "no identity left fails loudly like /authorize");
  } finally {
    await standin.stop();
  }
});

test("existing /authorize + /token behavior is untouched", async () => {
  const standin = await startOAuthStandin([alice]);
  try {
    const redirect = "http://localhost:3000/api/auth/callback/google";
    const authorize = await fetch(
      `${standin.baseUrl}/authorize?redirect_uri=${encodeURIComponent(redirect)}&state=xyz`,
      { redirect: "manual" },
    );
    assert.equal(authorize.status, 302);
    assert.ok(authorize.headers.get("location")?.startsWith(redirect));
  } finally {
    await standin.stop();
  }
});
