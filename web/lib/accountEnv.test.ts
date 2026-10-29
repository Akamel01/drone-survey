// The env contract (D4): which variables accounts need, in which order the 503
// names them, and that absence is answered -- never thrown. No database here;
// accountEnv reads process.env at call time.
//
// The deletions run before the dynamic import (static imports hoist), the
// lifecycle.test.ts:18-37 pattern: import with no env must be safe.

import { after, test } from "node:test";
import assert from "node:assert/strict";

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "OAUTH_PROXY_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "OWNER_EMAIL",
] as const;

// The locked Supabase trio (full names only, no bare shorthands).
const TRIO = [
  "SUPABASE_URL",
  "SUPABASE_OAUTH_CLIENT_ID",
  "SUPABASE_OAUTH_CLIENT_SECRET",
] as const;

const saved = new Map<string, string | undefined>();
for (const name of [...REQUIRED, ...TRIO]) {
  saved.set(name, process.env[name]);
  delete process.env[name];
}

// The import itself is the "importing with no env does not throw" proof.
const { accountEnv, accountEnvProblem, supabaseOAuthEnabled } = await import("./accountEnv.ts");

after(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configure(): void {
  for (const name of REQUIRED) process.env[name] = `test-${name.toLowerCase()}`;
}

test("missing: all nine absent, named in the D4 order", () => {
  const { values, missing } = accountEnv();
  assert.deepEqual(missing, [...REQUIRED]);
  assert.deepEqual(values, {});
});

test("missing: an empty string is not a value", () => {
  process.env.DATABASE_URL = "";
  try {
    const { values, missing } = accountEnv();
    assert.equal(missing[0], "DATABASE_URL");
    assert.ok(!("DATABASE_URL" in values));
  } finally {
    clearTrio();
  }
});

// Email+password gate (#336 F1): Mission Control's own providers are switched
// off in Supabase mode, so the server must refuse email sign-up/sign-in there
// even with a mail sink set; legacy mode keeps today's mail-sink behavior.
const MAIL_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "AUTH_TEST_MAIL_DIR", "VERCEL_ENV"] as const;

function withMailSink(): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>(MAIL_KEYS.map((k) => [k, process.env[k]]));
  for (const k of MAIL_KEYS) delete process.env[k];
  process.env.AUTH_TEST_MAIL_DIR = "/tmp/accountenv-mail-sink";
  return saved;
}

function restoreMail(saved: Map<string, string | undefined>): void {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test("email gate: on in legacy mode with a mail sink, off in supabase mode", async () => {
  const { emailPasswordEnabled } = await import("./accountAuth.ts");
  const { emailSignInEnabled } = await import("./accountMail.ts");
  const saved = withMailSink();
  try {
    clearTrio();
    assert.equal(emailSignInEnabled(), true, "mail sink present, so legacy email is on");
    assert.equal(emailPasswordEnabled(), true, "legacy mode keeps email sign-in");
    configureTrio();
    assert.equal(emailPasswordEnabled(), false, "supabase mode refuses email even with a mail sink");
  } finally {
    clearTrio();
    restoreMail(saved);
  }
});

test("email gate: off with no mail sink in either mode", async () => {
  const { emailPasswordEnabled } = await import("./accountAuth.ts");
  const saved = new Map<string, string | undefined>(MAIL_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of MAIL_KEYS) delete process.env[k];
    clearTrio();
    assert.equal(emailPasswordEnabled(), false);
    configureTrio();
    assert.equal(emailPasswordEnabled(), false);
  } finally {
    clearTrio();
    restoreMail(saved);
  }
});

test("503: unconfigured names every missing variable, in order", async () => {
  const problem = accountEnvProblem();
  assert.ok(problem, "unconfigured must answer, not return null");
  assert.equal(problem.status, 503);
  const body = (await problem.json()) as { error: string };
  assert.match(body.error, /^This deployment is not configured for accounts, so sign-in cannot work: missing /);
  let cursor = -1;
  for (const name of REQUIRED) {
    const at = body.error.indexOf(name);
    assert.ok(at > cursor, `${name} is missing from the 503 body or out of order: ${body.error}`);
    cursor = at;
  }
});

test("configured: all nine present -> null, values collected", () => {
  configure();
  try {
    assert.equal(accountEnvProblem(), null);
    const { values, missing } = accountEnv();
    assert.deepEqual(missing, []);
    for (const name of REQUIRED) assert.equal(values[name], `test-${name.toLowerCase()}`);
  } finally {
    for (const name of REQUIRED) delete process.env[name];
  }
});

function configureTrio(): void {
  process.env.SUPABASE_URL = "test-supabase-url";
  process.env.SUPABASE_OAUTH_CLIENT_ID = "test-supabase-oauth-client-id";
  process.env.SUPABASE_OAUTH_CLIENT_SECRET = "test-supabase-oauth-client-secret";
}

function clearTrio(): void {
  for (const name of TRIO) delete process.env[name];
}

test("supabase mode: predicate false when trio unset", () => {
  clearTrio();
  assert.equal(supabaseOAuthEnabled(), false);
});

test("supabase mode: predicate false on partial trio or empty string", () => {
  clearTrio();
  try {
    process.env.SUPABASE_URL = "test-supabase-url";
    assert.equal(supabaseOAuthEnabled(), false);
    process.env.SUPABASE_OAUTH_CLIENT_ID = "";
    process.env.SUPABASE_OAUTH_CLIENT_SECRET = "test-supabase-oauth-client-secret";
    assert.equal(supabaseOAuthEnabled(), false);
  } finally {
    clearTrio();
  }
});

test("supabase mode: trio set -> predicate true, GOOGLE_*/GITHUB_* not required", () => {
  configure();
  configureTrio();
  try {
    assert.equal(supabaseOAuthEnabled(), true);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    assert.equal(accountEnvProblem(), null);
    const { values, missing } = accountEnv();
    assert.deepEqual(missing, []);
    assert.equal(values.SUPABASE_URL, "test-supabase-url");
    assert.ok(!("GOOGLE_CLIENT_ID" in values));
    assert.ok(!("GITHUB_CLIENT_SECRET" in values));
  } finally {
    for (const name of REQUIRED) delete process.env[name];
    clearTrio();
  }
});

test("supabase mode: 503 names only the supabase set in order, never GOOGLE_*/GITHUB_*", async () => {
  configureTrio();
  try {
    const problem = accountEnvProblem();
    assert.ok(problem, "supabase mode with no base vars must answer, not return null");
    assert.equal(problem.status, 503);
    const body = (await problem.json()) as { error: string };
    // Trio set, so the missing five are the base vars in D4 relative order.
    const EXPECTED_MISSING = [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "OAUTH_PROXY_SECRET",
      "OWNER_EMAIL",
    ] as const;
    const { missing } = accountEnv();
    assert.deepEqual(missing, [...EXPECTED_MISSING]);
    let cursor = -1;
    for (const name of EXPECTED_MISSING) {
      const at = body.error.indexOf(name);
      assert.ok(at > cursor, `${name} is missing from the 503 body or out of order: ${body.error}`);
      cursor = at;
    }
    for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]) {
      assert.ok(!body.error.includes(name), `${name} must not be required in supabase mode: ${body.error}`);
    }
  } finally {
    clearTrio();
  }
});

test("legacy trap: partial trio never names SUPABASE_* in the 503", async () => {
  process.env.SUPABASE_URL = "test-supabase-url";
  try {
    assert.equal(supabaseOAuthEnabled(), false);
    const problem = accountEnvProblem();
    assert.ok(problem, "legacy mode unconfigured must answer, not return null");
    const body = (await problem.json()) as { error: string };
    for (const name of TRIO) {
      assert.ok(!body.error.includes(name), `${name} must never be named when the trio is absent: ${body.error}`);
    }
  } finally {
    clearTrio();
  }
});
