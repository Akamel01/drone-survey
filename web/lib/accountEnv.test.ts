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

const saved = new Map<string, string | undefined>();
for (const name of REQUIRED) {
  saved.set(name, process.env[name]);
  delete process.env[name];
}

// The import itself is the "importing with no env does not throw" proof.
const { accountEnv, accountEnvProblem } = await import("./accountEnv.ts");

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
    delete process.env.DATABASE_URL;
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
