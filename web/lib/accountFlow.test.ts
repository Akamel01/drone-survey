// The whole account flow, in-process (D12/D14): real Better Auth handler, real
// migrations, real OAuth redirects -- only the far side (google/github) is the
// stand-in in lib/oauthStandin.ts.
//
// Covered, in this order: migrations are idempotent; an unverified OWNER_EMAIL
// Account is created pending on its own u-<id> Workspace with no admin role and
// is promoted to 'operator'/admin/approved by a verified re-sign-in; another
// Account stays pending; an unverified provider email equal to the owner's is
// refused by the explicit account-linking gate (no session, no account row, no
// second user) while a verified one links to the same Account.
//
// Runs only with DATABASE_URL, used exactly as given (postgres:// in the
// web-auth CI job, pglite://memory locally); absent is SKIPPED with a printed
// reason so the existing no-DB web job stays green.
//
// Migrations run twice in this process against the same pool. With
// pglite://memory that is the same live database (one PGlite per process, D2),
// so the second getMigrations is a real idempotency check. A directory URL
// would survive across processes too, but then the assertion would be about
// the previous run's leftovers rather than this run; the in-process pairing is
// the meaningful one here.
//
// The /sign-in* rate limit (default 3 requests per 10s, storage "database")
// stays enabled exactly as production configures it; each sign-in below resets
// only its persisted window so six flows can run in one process.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { startOAuthStandin } from "./oauthStandin.ts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test(
    "account flow: google and github sign-in against the stand-in",
    { skip: "DATABASE_URL is not set; run with DATABASE_URL=pglite://memory npm test (or a postgres:// URL) to exercise the OAuth flow." },
    () => {},
  );
} else {
  const OWNER_EMAIL = "Owner@Example.com"; // deliberately mixed case: the owner match is case-insensitive
  // Consumed one per authorization request, in this exact declaration order
  // (the stand-in's queue), which is also test execution order: the owner signs
  // in unverified, then verified with the same identity, then the other
  // Account, then the two github identities carrying the owner's email.
  const ownerUnverified = { id: "standin-owner", name: "Owner Example", email: "owner@example.com", image: null, emailVerified: false };
  const ownerVerified = { ...ownerUnverified, emailVerified: true };
  const otherIdentity = { id: "standin-other", name: "Other Example", email: "other@example.com", image: null };
  const ownerGithubUnverified = {
    id: "standin-owner-github-unverified",
    name: "Owner Example",
    email: "owner@example.com",
    image: null,
    emailVerified: false,
  };
  const ownerGithubVerified = {
    id: "standin-owner-github-verified",
    name: "Owner Example",
    email: "owner@example.com",
    image: null,
    emailVerified: true,
  };

  const standin = await startOAuthStandin([
    ownerUnverified,
    ownerVerified,
    otherIdentity,
    ownerGithubUnverified,
    ownerGithubVerified,
  ]);

  process.env.AUTH_TEST_GOOGLE_AUTHORIZATION_URL = `${standin.baseUrl}/authorize`;
  process.env.AUTH_TEST_GOOGLE_TOKEN_URL = `${standin.baseUrl}/token`;
  process.env.AUTH_TEST_GOOGLE_USERINFO_URL = `${standin.baseUrl}/userinfo`;
  process.env.AUTH_TEST_GITHUB_AUTHORIZATION_URL = `${standin.baseUrl}/authorize`;
  process.env.AUTH_TEST_GITHUB_TOKEN_URL = `${standin.baseUrl}/token`;
  process.env.AUTH_TEST_GITHUB_USERINFO_URL = `${standin.baseUrl}/userinfo`;
  process.env.GOOGLE_CLIENT_ID = "standin-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "standin-google-secret";
  process.env.GITHUB_CLIENT_ID = "standin-github-client";
  process.env.GITHUB_CLIENT_SECRET = "standin-github-secret";
  process.env.OWNER_EMAIL = OWNER_EMAIL;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_OAUTH_CLIENT_ID = "standin-supabase-client";
  process.env.SUPABASE_OAUTH_CLIENT_SECRET = "standin-supabase-secret";
  process.env.BETTER_AUTH_SECRET = "account-flow-test-secret-0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.OAUTH_PROXY_SECRET = "account-flow-proxy-secret";

  const { getAuth } = await import("./accountAuth.ts");
  const { getPool, closeDb } = await import("./accountDb.ts");
  const { getMigrations } = await import("better-auth/db/migration");

  const auth = await getAuth();
  const maybePool = await getPool();
  assert.ok(maybePool, "DATABASE_URL is set, so getPool must answer");
  const pool = maybePool;

  after(async () => {
    await closeDb();
    await standin.stop();
  });

  const BASE = "http://localhost:3000";

  /** Cookies from every response of one sign-in, threaded by hand. */
  class CookieJar {
    private cookies = new Map<string, string>();

    absorb(response: Response): void {
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";")[0];
        const eq = pair.indexOf("=");
        if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }

    header(): string {
      return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    }
  }

  type SeenSession = {
    session: { id?: string };
    user: { id: string; email: string; role?: string; approved?: boolean | null };
  };

  async function getSession(jar: CookieJar): Promise<SeenSession | null> {
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie: jar.header() } }),
    );
    assert.equal(response.status, 200, "get-session answers even when signed out");
    return (await response.json()) as SeenSession | null;
  }

  /** The installed /sign-in* rule is 3 requests per 10s, kept in the
   *  "rateLimit" table (rate-limit/index.mjs:301-309). The limiter stays on --
   *  production config -- and this only clears its window so the file's
   *  several sign-ins are not refused with a 429. */
  async function resetRateLimit(pool: Pool): Promise<void> {
    await pool.query('DELETE FROM "rateLimit"');
  }

  type SignInRun = { callback: Response; session: SeenSession | null; setCookies: string[] };

  /** signIn.social -> stand-in authorization redirect -> callback -> get-session,
   *  with every Set-Cookie carried forward (the state cookie is required on the
   *  callback; better-auth/db state storage also checks it). No success
   *  assumption: the callback response and whatever session the jar holds are
   *  returned for the caller to judge. */
  async function runSignIn(provider: "google" | "github", jar: CookieJar): Promise<SignInRun> {
    await resetRateLimit(pool);
    const startResponse = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie: jar.header() },
        body: JSON.stringify({ provider, callbackURL: `${BASE}/signed-in` }),
      }),
    );
    const startBody = await startResponse.text();
    assert.equal(startResponse.status, 200, `sign-in/social (${provider}): ${startBody}`);
    jar.absorb(startResponse);
    const { url } = JSON.parse(startBody) as { url: string };
    assert.ok(url.startsWith(standin.baseUrl), `sign-in goes through the stand-in: ${url}`);

    // The stand-in redirects to redirect_uri with the code and our state echoed.
    const authorize = await fetch(url, { redirect: "manual" });
    assert.equal(authorize.status, 302, "the stand-in redirects back");
    const location = authorize.headers.get("location");
    assert.ok(location, "the stand-in sent a Location");
    assert.match(location, /\/api\/auth\/callback\/(google|github)\?/);
    assert.ok(location.includes(`state=${new URL(url).searchParams.get("state")}`), "state is echoed byte-for-byte");

    const callback = await auth.handler(new Request(location, { headers: { cookie: jar.header() } }));
    const setCookies = callback.headers.getSetCookie();
    jar.absorb(callback);
    return { callback, session: await getSession(jar), setCookies };
  }

  /** A run that must have succeeded: 302 callback and a session. */
  async function signIn(
    provider: "google" | "github",
    jar: CookieJar,
  ): Promise<{ session: SeenSession; setCookies: string[] }> {
    const { callback, session, setCookies } = await runSignIn(provider, jar);
    assert.equal(callback.status, 302, `callback: ${callback.headers.get("location")} | ${setCookies.join(" | ")}`);
    assert.ok(session, `the callback left a session for ${provider}`);
    return { session, setCookies };
  }

  const ownerJar = new CookieJar();
  const otherJar = new CookieJar();
  let ownerId = "";

  test("migrations: the second has nothing to create or add", async () => {
    const first = await getMigrations(auth.options);
    await first.runMigrations();
    const second = await getMigrations(auth.options);
    assert.deepEqual(second.toBeCreated, []);
    assert.deepEqual(second.toBeAdded, []);
  });

  test("owner: an unverified OWNER_EMAIL Account stays pending on 'u-<id>' with no admin role", async () => {
    const { session } = await signIn("google", ownerJar);
    ownerId = session.user.id;
    assert.ok(ownerId, "the unverified owner has a user id");
    assert.equal(session.user.email.toLowerCase(), ownerUnverified.email);

    const { rows } = await pool.query<{ role: string; approved: boolean }>(
      'SELECT role, approved FROM "user" WHERE id = $1',
      [ownerId],
    );
    assert.equal(rows[0]?.role, "user");
    assert.equal(rows[0]?.approved, false);

    const own = await pool.query<{ slug: string }>('SELECT slug FROM "organization" WHERE slug = $1', [`u-${ownerId}`]);
    assert.equal(own.rows.length, 1, "the unverified owner's Workspace is u-<id>");
    const member = await pool.query<{ role: string }>(
      'SELECT role FROM "member" WHERE "organizationId" = (SELECT id FROM "organization" WHERE slug = $1) AND "userId" = $2',
      [`u-${ownerId}`, ownerId],
    );
    assert.equal(member.rows[0]?.role, "owner");

    const operator = await pool.query<{ slug: string }>('SELECT slug FROM "organization" WHERE slug = $1', ["operator"]);
    assert.equal(operator.rows.length, 0, "no operator Workspace exists before verification");
  });

  test("owner: promoted to admin on 'operator' once the email is verified", async () => {
    const { session, setCookies } = await signIn("google", ownerJar);
    assert.equal(session.user.id, ownerId, "the verified re-sign-in is the same Account");
    assert.ok(
      setCookies.some((header) => /httponly/i.test(header)),
      `session cookies are HttpOnly: ${setCookies.join(" | ")}`,
    );

    const operator = await pool.query<{ id: string }>('SELECT id FROM "organization" WHERE slug = $1', ["operator"]);
    assert.equal(operator.rows.length, 1, "the owner's verified Workspace is slug 'operator'");
    const members = await pool.query<{ role: string }>(
      'SELECT role FROM "member" WHERE "organizationId" = $1 AND "userId" = $2',
      [operator.rows[0].id, ownerId],
    );
    assert.equal(members.rows[0]?.role, "owner");
    const { rows } = await pool.query<{ role: string; approved: boolean }>(
      'SELECT role, approved FROM "user" WHERE id = $1',
      [ownerId],
    );
    assert.equal(rows[0]?.role, "admin");
    assert.equal(rows[0]?.approved, true);

    // Documented choice: promotion leaves the unverified placeholder in place.
    const placeholder = await pool.query<{ slug: string }>('SELECT slug FROM "organization" WHERE slug = $1', [
      `u-${ownerId}`,
    ]);
    assert.equal(placeholder.rows.length, 1, "the placeholder u-<id> Workspace is kept on promotion");
  });

  test("other: github sign-in gets 'u-<id>', stays pending, and keeps its session", async () => {
    const { session } = await signIn("github", otherJar);
    const otherId = session.user.id;
    assert.ok(otherId, "the second account has a user id");
    assert.notEqual(otherId, ownerId);
    assert.equal(session.user.email, otherIdentity.email);
    assert.ok(session.user.approved !== true, `a new account is not approved: ${JSON.stringify(session.user)}`);

    const orgs = await pool.query<{ slug: string }>('SELECT slug FROM "organization" WHERE slug = $1', [`u-${otherId}`]);
    assert.equal(orgs.rows.length, 1, "the second account's Workspace is slug u-<id>");
    const { rows } = await pool.query<{ role: string; approved: boolean }>(
      'SELECT role, approved FROM "user" WHERE id = $1',
      [otherId],
    );
    assert.equal(rows[0]?.role, "user");
    assert.equal(rows[0]?.approved, false);

    // The pending account can still sign in: its session survived the flow.
    const again = await getSession(otherJar);
    assert.equal(again?.user.id, otherId);
    assert.equal(again?.session.id, session.session.id);
  });

  test("linking: an unverified provider email matching the owner's does not sign into the owner's Account", async () => {
    const githubJar = new CookieJar();
    const { callback, session } = await runSignIn("github", githubJar);
    const observed = `callback ${callback.status} Location: ${callback.headers.get("location") ?? "(none)"}`;

    assert.equal(session, null, "no session exists in the refused jar");
    assert.equal(callback.status, 302, `the refusal redirects: ${observed}`);
    assert.ok(
      callback.headers.get("location")?.includes("error=account_not_linked"),
      `the refusal redirect carries the error code: ${observed}`,
    );

    const accounts = await pool.query<{ id: string }>(
      'SELECT id FROM "account" WHERE "providerId" = $1 AND "accountId" = $2',
      ["github", ownerGithubUnverified.id],
    );
    assert.equal(accounts.rows.length, 0, "no github account row was created");
    const ownerRows = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = $1', [
      "owner@example.com",
    ]);
    assert.equal(ownerRows.rows.length, 1, "still exactly one user with the owner email");
    assert.equal(ownerRows.rows[0]?.id, ownerId, "and it is the original owner");

    const ownerSession = await getSession(ownerJar);
    assert.equal(ownerSession?.user.id, ownerId, "the owner's own session is still valid");
  });

  test("linking: a verified provider email links to the owner's Account", async () => {
    const githubJar = new CookieJar();
    const { session } = await signIn("github", githubJar);
    assert.equal(session.user.id, ownerId, "the verified github sign-in is the owner's Account");

    const accounts = await pool.query<{ providerId: string; accountId: string }>(
      'SELECT "providerId", "accountId" FROM "account" WHERE "userId" = $1',
      [ownerId],
    );
    assert.ok(
      accounts.rows.some(
        (row) => row.providerId === "github" && row.accountId === ownerGithubVerified.id,
      ),
      `the github account is linked: ${JSON.stringify(accounts.rows)}`,
    );
    assert.deepEqual(
      accounts.rows.map((row) => row.providerId).sort(),
      ["github", "google"],
      `exactly the two provider rows belong to the owner: ${JSON.stringify(accounts.rows)}`,
    );

    const ownerRows = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = $1', [
      "owner@example.com",
    ]);
    assert.equal(ownerRows.rows.length, 1, "still exactly one user with the owner email");
    const { rows } = await pool.query<{ role: string; approved: boolean }>(
      'SELECT role, approved FROM "user" WHERE id = $1',
      [ownerId],
    );
    assert.equal(rows[0]?.role, "admin", "the link does not change the role");
    assert.equal(rows[0]?.approved, true, "the link does not change the approval");
  });
}
