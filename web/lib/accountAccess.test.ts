// The account gate (D10) with no database: the env gate answers 503 before
// Better Auth is even built; with the env set, the session decision (401 /
// 403 / ok) is driven by patching the shared instance's getSession, the seam
// M2 documented. DATABASE_URL points at a port nothing listens on -- a pg.Pool
// is lazy, so no connection is ever opened and no PGlite starts.

import { after, test } from "node:test";
import assert from "node:assert/strict";

const CONFIGURED: Record<string, string> = {
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/never",
  BETTER_AUTH_SECRET: "account-access-test-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  OAUTH_PROXY_SECRET: "account-access-proxy-secret",
  GOOGLE_CLIENT_ID: "test-google-id",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "test-github-id",
  GITHUB_CLIENT_SECRET: "test-github-secret",
  OWNER_EMAIL: "owner@example.com",
};

for (const name of Object.keys(CONFIGURED)) delete process.env[name];

const { requireApprovedAccount, getAccount } = await import("./accountAccess.ts");
const { getAuth } = await import("./accountAuth.ts");
const { closeDb } = await import("./accountDb.ts");

after(async () => {
  for (const name of Object.keys(CONFIGURED)) delete process.env[name];
  await closeDb();
});

function configure(): void {
  for (const [name, value] of Object.entries(CONFIGURED)) process.env[name] = value;
}

/** Replace the cached instance's getSession with a fixed answer; returns the
 *  restore. The gate is the thing under test, not Better Auth's session parse. */
async function patchGetSession(answer: unknown): Promise<() => void> {
  const auth = (await getAuth()) as unknown as { api: { getSession: unknown } };
  const original = auth.api.getSession;
  auth.api.getSession = async () => answer;
  return () => {
    auth.api.getSession = original;
  };
}

const REQUEST = new Request("http://localhost:3000/api/missions");

test("503: unconfigured refuses before any session is read", async () => {
  const gate = await requireApprovedAccount(REQUEST);
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.equal(gate.response.status, 503);
  const body = (await gate.response.json()) as { error: string };
  assert.match(body.error, /^This deployment is not configured for accounts/);
  assert.match(body.error, /DATABASE_URL/);
});

test("401: a configured deployment with no session says to sign in", async () => {
  configure();
  const restore = await patchGetSession(null);
  try {
    const gate = await requireApprovedAccount(REQUEST);
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.response.status, 401);
    const body = (await gate.response.json()) as { error: string };
    assert.equal(body.error, "Sign in to continue: this request carried no session.");
  } finally {
    restore();
  }
});

test("403: a signed-in but unapproved account is waiting for approval", async () => {
  configure();
  const restore = await patchGetSession({ session: {}, user: { id: "user-1", approved: false } });
  try {
    const gate = await requireApprovedAccount(REQUEST);
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.response.status, 403);
    const body = (await gate.response.json()) as { error: string };
    assert.match(body.error, /waiting for approval/);
  } finally {
    restore();
  }
});

test("403: a null approved is pending, not approved", async () => {
  configure();
  const restore = await patchGetSession({ session: {}, user: { id: "user-1", approved: null } });
  try {
    const gate = await requireApprovedAccount(REQUEST);
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.response.status, 403);
  } finally {
    restore();
  }
});

test("ok: an approved account passes with its session", async () => {
  configure();
  const restore = await patchGetSession({ session: {}, user: { id: "user-1", approved: true } });
  try {
    const gate = await requireApprovedAccount(REQUEST);
    assert.equal(gate.ok, true);
    if (!gate.ok) return;
    assert.equal(gate.session.user.id, "user-1");
  } finally {
    restore();
  }
});

test("getAccount: null when unconfigured, without throwing", async () => {
  for (const name of Object.keys(CONFIGURED)) delete process.env[name];
  assert.equal(await getAccount(), null);
});

test("getAccount: null outside a request, without throwing", async () => {
  configure();
  const restore = await patchGetSession({ session: {}, user: { id: "user-1", approved: true } });
  const realError = console.error;
  console.error = () => {};
  try {
    // next/headers has no request here; the catch is the contract.
    assert.equal(await getAccount(), null);
  } finally {
    console.error = realError;
    restore();
    for (const name of Object.keys(CONFIGURED)) delete process.env[name];
  }
});
