// The accounts' Better Auth instance (D5, D7-D13): built on first call and
// cached, never at import, so a build or a migration with no auth env (D4/D5)
// constructs nothing. Everything reads process.env at call time.
//
// Relative imports carry the explicit .ts extension (accountEnv/accountDb
// discipline): scripts/migrate.mjs and `node --input-type=module` load this
// file with no test-hooks in front of it.

import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { genericOAuth, type GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { organization } from "better-auth/plugins/organization";
import type { Pool } from "pg";
import { getPool } from "./accountDb.ts";
import { emailSignInEnabled, resetMail, sendMail, verificationMail } from "./accountMail.ts";
import { PASSWORD_MIN } from "./emailSignIn.ts";

/** The migration path has a DATABASE_URL but no BETTER_AUTH_SECRET (D5). The
 *  endpoint gate (accountAccess.accountAuthHandler) runs before any request,
 *  so this placeholder never signs or encrypts anything a request sees. */
const MIGRATION_ONLY_SECRET = "migration-only-placeholder";

/** The configured instance, plugins included. `betterAuth()` returns
 *  `Auth<Options>` with the options inferred, and naming that type requires
 *  the factory's return type -- the plain `Auth` export is the unconfigured
 *  shape and does not carry organization/admin endpoints. */
export type AccountAuth = Awaited<ReturnType<typeof createAuth>>;

let authPromise: Promise<AccountAuth> | undefined;

/** The one instance, built on the first call (D5). */
export async function getAuth(): Promise<AccountAuth> {
  if (!authPromise) {
    const pending = createAuth();
    authPromise = pending;
    // A failed construction must not stay cached: the next caller gets a
    // retry rather than the same dead promise (accountDb.ts has the same rule).
    pending.catch(() => {
      if (authPromise === pending) authPromise = undefined;
    });
  }
  return authPromise;
}

async function createAuth() {
  // The DATABASE_URL-only migrate path has no BETTER_AUTH_URL, and
  // `new URL(undefined)` throws; the fallback also becomes the oAuthProxy's
  // productionURL (D11).
  const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const googleTest = testOverride("AUTH_TEST_GOOGLE", "google");
  const githubTest = testOverride("AUTH_TEST_GITHUB", "github");
  const testConfigs = [googleTest, githubTest].filter((config): config is GenericOAuthConfig => config !== null);

  const pool = await getPool();
  // Vercel sets VERCEL_ENV=production|preview on every deployment; localhost
  // grants are for a developer machine only. The AUTH_TRUSTED_* lists are
  // honoured either way, deliberately. NODE_ENV is not the signal: CI's
  // `next start` also runs with NODE_ENV=production and must still get them.
  const onVercel = Boolean(process.env.VERCEL_ENV);

  return betterAuth({
    baseURL: {
      allowedHosts: [
        new URL(appUrl).host,
        ...(onVercel ? [] : ["localhost:*"]),
        ...(process.env.AUTH_TRUSTED_HOSTS ? process.env.AUTH_TRUSTED_HOSTS.split(",") : []),
      ],
      protocol: "auto",
      fallback: appUrl,
    },
    secret: process.env.BETTER_AUTH_SECRET ?? MIGRATION_ONLY_SECRET,
    // Null when DATABASE_URL is absent; the installed option type does not
    // admit null, and an unpinned instance only has to construct (never
    // serve: the gate refuses first).
    database: pool ?? undefined,
    // Explicit account linking (R1): a provider may link to an existing
    // Account only when it reports the email verified AND the local user's
    // email is verified (`requireLocalEmailVerified` stays at its true
    // default). trustedProviders is empty on purpose: an entry there would
    // skip the provider-side emailVerified check (installed 1.7.6
    // oauth2/link-account.mjs:43,139) and let an unverified provider email
    // into someone else's Account.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [],
      },
    },
    // Email and password (#247): on only where its mail can be sent
    // (lib/accountMail.ts). A new Account must confirm its email before its
    // first sign-in; the confirming link signs it in. A password reset signs
    // the Account out everywhere else.
    emailAndPassword: {
      enabled: emailSignInEnabled(),
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendMail(resetMail(user.email, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => sendMail(verificationMail(user.email, url)),
    },
    trustedOrigins: [
      ...(onVercel ? [] : ["http://localhost:3000"]),
      ...(process.env.AUTH_TRUSTED_ORIGINS ? process.env.AUTH_TRUSTED_ORIGINS.split(",") : []),
    ],
    // Exactly one definition of providerId "google"/"github" exists: the
    // stand-in entry when its AUTH_TEST_* trio is set, else the built-in (D12).
    socialProviders: {
      ...(googleTest
        ? {}
        : {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID ?? "",
              clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            },
          }),
      ...(githubTest
        ? {}
        : {
            github: {
              clientId: process.env.GITHUB_CLIENT_ID ?? "",
              clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
            },
          }),
    },
    plugins: [
      ...(testConfigs.length > 0 ? [genericOAuth({ config: testConfigs })] : []),
      organization(),
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      oAuthProxy({ productionURL: appUrl, secret: process.env.OAUTH_PROXY_SECRET }),
    ],
    user: {
      additionalFields: {
        approved: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: { after: ensureWorkspace },
        // Runs on every user update (installed adapter: db/with-hooks.mjs:68);
        // it no-ops for everyone but a newly verified owner email.
        update: { after: promoteOwnerIfVerified },
      },
    },
    rateLimit: { enabled: true, storage: "database" },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  });
}

const AUTH_TEST_PREFIXES = ["AUTH_TEST_GOOGLE", "AUTH_TEST_GITHUB"] as const;
const AUTH_TEST_SUFFIXES = ["AUTHORIZATION_URL", "TOKEN_URL", "USERINFO_URL"] as const;

/** Whether a stand-in override was refused and warned about already. */
let warnedAuthTestOverridesIgnored = false;

/** One warning per process when Vercel refuses the stand-in (R1): silent when
 *  no AUTH_TEST_* variable is set, otherwise names the pattern and what takes
 *  its place. Both providers share the flag, so two testOverride calls warn
 *  once. */
function warnIgnoredAuthTestOverrides(): void {
  if (warnedAuthTestOverridesIgnored) return;
  const present = AUTH_TEST_PREFIXES.some((prefix) =>
    AUTH_TEST_SUFFIXES.some((suffix) => process.env[`${prefix}_${suffix}`] !== undefined),
  );
  if (!present) return;
  warnedAuthTestOverridesIgnored = true;
  console.warn(
    `accountAuth: AUTH_TEST_* variables (${AUTH_TEST_PREFIXES.join(", ")}) are ignored when VERCEL_ENV is set; ` +
      "GOOGLE_*/GITHUB_* credentials are used instead.",
  );
}

/** The genericOAuth entry for one provider when its three AUTH_TEST_* URLs are
 *  present, else null (D12). On Vercel (production or preview) the stand-in is
 *  refused outright, so a deployment serves the real GOOGLE_ / GITHUB_
 *  credentials and the refusal is logged once. VERCEL_ENV is the signal, never NODE_ENV:
 *  CI's `next start` also runs with NODE_ENV=production and must still honour
 *  the stand-in. clientId/clientSecret are required by the installed config
 *  interface; placeholders are fine because the env gate only lets a fully
 *  configured deployment serve a flow. */
function testOverride(
  prefix: (typeof AUTH_TEST_PREFIXES)[number],
  providerId: "google" | "github",
): GenericOAuthConfig | null {
  if (process.env.VERCEL_ENV) {
    warnIgnoredAuthTestOverrides();
    return null;
  }
  const authorizationUrl = process.env[`${prefix}_AUTHORIZATION_URL`];
  const tokenUrl = process.env[`${prefix}_TOKEN_URL`];
  const userInfoUrl = process.env[`${prefix}_USERINFO_URL`];
  if (!authorizationUrl || !tokenUrl || !userInfoUrl) return null;
  const clientId = providerId === "google" ? process.env.GOOGLE_CLIENT_ID ?? "" : process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret =
    providerId === "google" ? process.env.GOOGLE_CLIENT_SECRET ?? "" : process.env.GITHUB_CLIENT_SECRET ?? "";
  return { providerId, clientId, clientSecret, authorizationUrl, tokenUrl, userInfoUrl };
}

/** What the user.create/update.after hooks hand `ensureWorkspace` and
 *  `promoteOwnerIfVerified`, and what tests may pass: id plus the identity
 *  fields the decision needs. */
export type WorkspaceUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
  name?: string | null;
};

/** One Workspace per Account, once, re-runnable (D7/D8). A *verified* owner
 *  email gets slug "operator" (or OWNER_WORKSPACE_SLUG) and the admin/approval
 *  bootstrap; everyone else -- including an unverified OWNER_EMAIL -- gets
 *  "u-<id>" with approval left at the field default, false. An unverified
 *  owner is promoted by `promoteOwnerIfVerified` once the email is verified.
 *  Called by the user.create.after hook and directly by tests. */
export async function ensureWorkspace(user: WorkspaceUser): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const email = (user.email ?? "").toLowerCase();
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").toLowerCase();
  // Verified only: a user row holding OWNER_EMAIL before verification (an
  // unverified provider email, or the email/password sign-up in #247) must
  // not become admin. user.update.after promotes the moment it verifies.
  const isOwner = ownerEmail !== "" && email === ownerEmail && user.emailVerified === true;
  const slug = isOwner ? process.env.OWNER_WORKSPACE_SLUG ?? "operator" : `u-${user.id}`;
  const name = isOwner ? "Operator" : user.name || "Workspace";

  await ensureWorkspaceRows(pool, { userId: user.id, name, slug });

  if (isOwner) {
    // Bootstrap (D7/D8): approved is input:false and setRole needs an existing
    // admin, so the owner's role and approval are written server-side.
    await pool.query('UPDATE "user" SET role = $1, approved = true WHERE id = $2', ["admin", user.id]);
  }
}

/** Grants the owner's Workspace and admin role the moment an owner email
 *  becomes verified (R1), for rows created while unverified. Runs as the
 *  user.update.after hook on every user update -- e.g. a verified OAuth
 *  re-sign-in setting emailVerified=true (installed 1.7.6
 *  oauth2/link-account.mjs:188) -- so it no-ops for everyone but the owner
 *  and the remaining work is two SELECTs plus one UPDATE. */
export async function promoteOwnerIfVerified(user: WorkspaceUser): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const email = (user.email ?? "").toLowerCase();
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").toLowerCase();
  if (ownerEmail === "" || email !== ownerEmail || user.emailVerified !== true) return;

  const slug = process.env.OWNER_WORKSPACE_SLUG ?? "operator";
  const organizationId = await ensureWorkspaceRows(pool, { userId: user.id, name: "Operator", slug });

  // createOrganization already makes the creator the owner member, but the
  // operator Workspace may pre-date this user, so ensure the member row too.
  const member = await pool.query<{ id: string }>(
    'SELECT id FROM "member" WHERE "organizationId" = $1 AND "userId" = $2',
    [organizationId, user.id],
  );
  if (member.rows.length === 0) {
    await pool.query(
      'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), organizationId, user.id, "owner", new Date()],
    );
  }
  // Raw SQL, not the adapter: the bootstrap must not re-enter this hook (same
  // rule as ensureWorkspace's). The SELECTs above are the guard for the cheap
  // repeat case.
  await pool.query('UPDATE "user" SET role = $1, approved = true WHERE id = $2', ["admin", user.id]);
  // The placeholder u-<id> Workspace from the unverified creation is left in
  // place on promotion: #241 has no data in it yet, and deleting it would be
  // deletion logic for nothing.
}

/** The Workspace rows for one slug, once, re-runnable: slug lookup first (two
 *  provider sign-ins of one Account both reach the hook, and organization.slug
 *  is unique), then the D7 create-or-fallback. Returns the organization id so
 *  both ensureWorkspace and promoteOwnerIfVerified can use it. */
async function ensureWorkspaceRows(
  pool: Pool,
  workspace: { userId: string; name: string; slug: string },
): Promise<string> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM "organization" WHERE slug = $1', [workspace.slug]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  try {
    // Server-side creation with userId and no session headers (D7); the
    // creator becomes the owner member.
    const auth = await getAuth();
    await auth.api.createOrganization({ body: { name: workspace.name, slug: workspace.slug, userId: workspace.userId } });
  } catch (error) {
    // D7's documented fallback: the self-call through the lazily built
    // instance can fail; the same rows are written directly behind the slug
    // lookup so a sign-in is never left Workspace-less.
    console.error(
      `accountAuth.ensureWorkspace: createOrganization failed for slug ${workspace.slug}; writing the Workspace directly:`,
      error,
    );
    return insertWorkspaceDirect(pool, workspace);
  }
  // Read the id back rather than trusting the create call's return shape.
  const created = await pool.query<{ id: string }>('SELECT id FROM "organization" WHERE slug = $1', [workspace.slug]);
  return created.rows[0].id;
}

/** The D7 fallback: organization + owner member rows in one go. Returns the
 *  organization id. */
async function insertWorkspaceDirect(
  pool: Pool,
  workspace: { userId: string; name: string; slug: string },
): Promise<string> {
  const organizationId = crypto.randomUUID();
  const now = new Date();
  await pool.query('INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1, $2, $3, $4)', [
    organizationId,
    workspace.name,
    workspace.slug,
    now,
  ]);
  await pool.query('INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, $5)', [
    crypto.randomUUID(),
    organizationId,
    workspace.userId,
    "owner",
    now,
  ]);
  return organizationId;
}
