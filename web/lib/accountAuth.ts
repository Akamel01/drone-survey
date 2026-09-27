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

  return betterAuth({
    baseURL: {
      allowedHosts: [
        new URL(appUrl).host,
        "localhost:*",
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
    trustedOrigins: [
      "http://localhost:3000",
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
    databaseHooks: { user: { create: { after: ensureWorkspace } } },
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

/** The genericOAuth entry for one provider when its three AUTH_TEST_* URLs are
 *  present, else null (D12). clientId/clientSecret are required by the
 *  installed config interface; placeholders are fine because the env gate
 *  only lets a fully configured deployment serve a flow. */
function testOverride(
  prefix: "AUTH_TEST_GOOGLE" | "AUTH_TEST_GITHUB",
  providerId: "google" | "github",
): GenericOAuthConfig | null {
  const authorizationUrl = process.env[`${prefix}_AUTHORIZATION_URL`];
  const tokenUrl = process.env[`${prefix}_TOKEN_URL`];
  const userInfoUrl = process.env[`${prefix}_USERINFO_URL`];
  if (!authorizationUrl || !tokenUrl || !userInfoUrl) return null;
  const clientId = providerId === "google" ? process.env.GOOGLE_CLIENT_ID ?? "" : process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret =
    providerId === "google" ? process.env.GOOGLE_CLIENT_SECRET ?? "" : process.env.GITHUB_CLIENT_SECRET ?? "";
  return { providerId, clientId, clientSecret, authorizationUrl, tokenUrl, userInfoUrl };
}

/** What the user.create.after hook hands `ensureWorkspace`, and what tests may
 *  pass: id plus the identity fields the decision needs. */
export type WorkspaceUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

/** One Workspace per Account, once, re-runnable (D7/D8). Owner email gets
 *  slug "operator" (or OWNER_WORKSPACE_SLUG) and the admin/approval bootstrap;
 *  everyone else gets "u-<id>" with approval left at the field default, false.
 *  Called by the user.create.after hook and directly by tests. */
export async function ensureWorkspace(user: WorkspaceUser): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  const email = (user.email ?? "").toLowerCase();
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").toLowerCase();
  const isOwner = ownerEmail !== "" && email === ownerEmail;
  const slug = isOwner ? process.env.OWNER_WORKSPACE_SLUG ?? "operator" : `u-${user.id}`;
  const name = isOwner ? "Operator" : user.name || "Workspace";

  // Lookup before create: two provider sign-ins of one Account both reach the
  // hook, and organization.slug is unique.
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM "organization" WHERE slug = $1', [slug]);
  if (rows.length === 0) {
    try {
      // Server-side creation with userId and no session headers (D7); the
      // creator becomes the owner member.
      const auth = await getAuth();
      await auth.api.createOrganization({ body: { name, slug, userId: user.id } });
    } catch (error) {
      // D7's documented fallback: the self-call through the lazily built
      // instance can fail; the same rows are written directly behind the slug
      // lookup so a sign-in is never left Workspace-less.
      console.error(
        `accountAuth.ensureWorkspace: createOrganization failed for slug ${slug}; writing the Workspace directly:`,
        error,
      );
      await insertWorkspaceDirect(pool, { userId: user.id, name, slug });
    }
  }

  if (isOwner) {
    // Bootstrap (D7/D8): approved is input:false and setRole needs an existing
    // admin, so the owner's role and approval are written server-side.
    await pool.query('UPDATE "user" SET role = $1, approved = true WHERE id = $2', ["admin", user.id]);
  }
}

/** The D7 fallback: organization + owner member rows in one go. */
async function insertWorkspaceDirect(
  pool: Pool,
  workspace: { userId: string; name: string; slug: string },
): Promise<void> {
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
}
