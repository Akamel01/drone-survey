// Which deployment variables the accounts surface needs, and the 503 that
// names what is missing (D4). Reading happens at call time against
// process.env: no module-scope snapshot, no validation on import, so a build
// with zero auth env (the existing `web` CI job) is unaffected.

/** The required variables, in the order the 503 and the docs list them. */
export type RequiredVar =
  | "DATABASE_URL"
  | "BETTER_AUTH_SECRET"
  | "BETTER_AUTH_URL"
  | "OAUTH_PROXY_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GITHUB_CLIENT_ID"
  | "GITHUB_CLIENT_SECRET"
  | "OWNER_EMAIL";

const REQUIRED_VARS: readonly RequiredVar[] = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "OAUTH_PROXY_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "OWNER_EMAIL",
];

// Optional, read where they are used and never part of the 503 set: the six
// stand-in URLs AUTH_TEST_GOOGLE_* / AUTH_TEST_GITHUB_* (accountAuth.ts),
// AUTH_TRUSTED_HOSTS, AUTH_TRUSTED_ORIGINS, OWNER_WORKSPACE_SLUG (default
// "operator", accountAuth.ts), PGLITE_PORT (accountDb.ts).

/** The present required values and, in D4 order, the absent names. Absent
 *  means unset or empty -- an empty string is not a value here. */
export function accountEnv(): { values: Partial<Record<RequiredVar, string>>; missing: RequiredVar[] } {
  const values: Partial<Record<RequiredVar, string>> = {};
  const missing: RequiredVar[] = [];
  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (value) values[name] = value;
    else missing.push(name);
  }
  return { values, missing };
}

/** Null when the deployment can run accounts; else the 503 body naming every
 *  missing variable, so the operator has one list to fix rather than a trail
 *  of individually discovered failures (b2.ts:15-31, auth.ts:18-25). */
export function accountEnvProblem(): Response | null {
  const { missing } = accountEnv();
  if (missing.length === 0) return null;
  return Response.json(
    {
      error:
        "This deployment is not configured for accounts, so sign-in cannot work: missing " +
        missing.join(", ") +
        ". Set the missing variables on the deployment and redeploy.",
    },
    { status: 503 },
  );
}
