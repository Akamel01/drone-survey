// The whole account flow, in-process (D12/D14): real Better Auth handler, real
// migrations, real OAuth redirects -- only the far side (google/github) is the
// stand-in in lib/oauthStandin.ts.
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

import { after, test } from "node:test";
import assert from "node:assert/strict";
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
  const ownerIdentity = { id: "standin-owner", name: "Owner Example", email: "owner@example.com", image: null };
  const otherIdentity = { id: "standin-other", name: "Other Example", email: "other@example.com", image: null };

  const standin = await startOAuthStandin([ownerIdentity, otherIdentity]);

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
  process.env.BETTER_AUTH_SECRET = "account-flow-test-secret-0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.OAUTH_PROXY_SECRET = "account-flow-proxy-secret";

  const { getAuth } = await import("./accountAuth.ts");
  const { getPool, closeDb } = await import("./accountDb.ts");
  const { getMigrations } = await import("better-auth/db/migration");

  const auth = await getAuth();
  const pool = await getPool();
  assert.ok(pool, "DATABASE_URL is set, so getPool must answer");

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

  /** signIn.social -> stand-in authorization redirect -> callback -> get-session,
   *  with every Set-Cookie carried forward (the state cookie is required on the
   *  callback; better-auth/db state storage also checks it). */
  async function signIn(provider: "google" | "github", jar: CookieJar) {
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

    const callbackResponse = await auth.handler(new Request(location, { headers: { cookie: jar.header() } }));
    const setCookies = callbackResponse.headers.getSetCookie();
    jar.absorb(callbackResponse);
    assert.equal(callbackResponse.status, 302, `callback: ${callbackResponse.headers.get("location")} | ${setCookies.join(" | ")}`);

    const session = await getSession(jar);
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

  test("owner: google sign-in (mixed-case OWNER_EMAIL) is admin and approved on 'operator'", async () => {
    const { session, setCookies } = await signIn("google", ownerJar);
    ownerId = session.user.id;
    assert.ok(ownerId, "the owner has a user id");
    assert.equal(session.user.email.toLowerCase(), ownerIdentity.email);
    assert.ok(
      setCookies.some((header) => /httponly/i.test(header)),
      `session cookies are HttpOnly: ${setCookies.join(" | ")}`,
    );

    const orgs = await pool.query<{ slug: string }>('SELECT slug FROM "organization" WHERE slug = $1', ["operator"]);
    assert.equal(orgs.rows.length, 1, "the owner's Workspace is slug 'operator'");
    const members = await pool.query<{ role: string }>(
      'SELECT role FROM "member" WHERE "organizationId" = (SELECT id FROM "organization" WHERE slug = $1) AND "userId" = $2',
      ["operator", ownerId],
    );
    assert.equal(members.rows[0]?.role, "owner");
    const { rows } = await pool.query<{ role: string; approved: boolean }>(
      'SELECT role, approved FROM "user" WHERE id = $1',
      [ownerId],
    );
    assert.equal(rows[0]?.role, "admin");
    assert.equal(rows[0]?.approved, true);
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
}
