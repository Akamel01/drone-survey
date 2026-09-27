// Approval (#243) through lib/accountAdmin.ts, on the real schema: the
// migrations Better Auth runs in production, over PGlite locally and Postgres
// in the web-auth CI job. Rows are written directly, so these tests are about
// what the operator's actions do to the store, not about signing in.
//
// Runs only with DATABASE_URL (pglite://memory locally); absent is SKIPPED
// with a printed reason, as in accountFlow.test.ts.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test(
    "account admin: list, approve and remove Accounts",
    { skip: "DATABASE_URL is not set; run with DATABASE_URL=pglite://memory npm test (or a postgres:// URL)." },
    () => {},
  );
} else {
  process.env.BETTER_AUTH_SECRET ??= "account-admin-test-secret-0123456789abcdef";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.OWNER_EMAIL ??= "owner@example.com";

  const { getAuth } = await import("./accountAuth.ts");
  const { getPool, closeDb } = await import("./accountDb.ts");
  const { getMigrations } = await import("better-auth/db/migration");
  const { approveAccount, listAccounts, removeAccount } = await import("./accountAdmin.ts");

  let pool: Pool;
  const now = new Date("2026-09-28T12:00:00Z");
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  async function user(id: string, email: string, opts: { approved: boolean; admin?: boolean; minutes: number }) {
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", approved, role)
       VALUES ($1, $2, $3, true, $4, $4, $5, $6)`,
      [id, id.toUpperCase(), email, at(opts.minutes), opts.approved, opts.admin ? "admin" : "user"],
    );
  }
  async function account(userId: string, providerId: string) {
    await pool.query(
      `INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [`acc-${userId}-${providerId}`, `${providerId}-${userId}`, providerId, userId, now],
    );
  }
  async function workspace(userId: string, slug: string) {
    const orgId = `org-${slug}`;
    await pool.query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1, $2, $3, $4)`, [
      orgId,
      slug,
      slug,
      now,
    ]);
    await pool.query(
      `INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, 'owner', $4)`,
      [`mem-${userId}-${slug}`, orgId, userId, now],
    );
  }
  async function session(userId: string) {
    await pool.query(
      `INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
       VALUES ($1, $2, $3, $4, $4, $5)`,
      [`ses-${userId}`, at(60 * 24), `tok-${userId}`, now, userId],
    );
  }
  const count = async (sql: string, args: unknown[]) =>
    Number((await pool.query<{ n: string }>(sql, args)).rows[0].n);

  before(async () => {
    const auth = await getAuth();
    const maybePool = await getPool();
    assert.ok(maybePool, "DATABASE_URL is set, so getPool must answer");
    pool = maybePool;
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    // The operator, one approved Account and two pending ones.
    await user("owner", "owner@example.com", { approved: true, admin: true, minutes: 0 });
    await account("owner", "google");
    await workspace("owner", "operator");
    await user("ann", "ann@example.com", { approved: true, minutes: 10 });
    await account("ann", "github");
    await workspace("ann", "u-ann");
    await user("bob", "bob@example.com", { approved: false, minutes: 20 });
    await account("bob", "github");
    await account("bob", "google");
    await workspace("bob", "u-bob");
    await session("bob");
    await user("cy", "cy@example.com", { approved: false, minutes: 30 });
    await account("cy", "google");
    await workspace("cy", "u-cy");
  });

  after(async () => {
    await closeDb();
  });

  test("the list puts pending Accounts first, newest first, with their providers", async () => {
    const rows = await listAccounts(pool);
    assert.deepEqual(
      rows.map((r) => [r.id, r.approved, r.admin]),
      [
        ["cy", false, false],
        ["bob", false, false],
        ["ann", true, false],
        ["owner", true, true],
      ],
    );
    assert.deepEqual(rows.find((r) => r.id === "bob")?.providers, ["github", "google"]);
    assert.equal(rows.find((r) => r.id === "cy")?.email, "cy@example.com");
  });

  test("approving lets a pending Account in, and approving again is harmless", async () => {
    assert.deepEqual(await approveAccount(pool, "cy"), { ok: true });
    assert.deepEqual(await approveAccount(pool, "cy"), { ok: true });
    const cy = (await listAccounts(pool)).find((r) => r.id === "cy");
    assert.equal(cy?.approved, true);
  });

  test("approving an Account that is gone is a 404", async () => {
    const outcome = await approveAccount(pool, "nobody");
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.status, 404);
  });

  test("removing an Account signs it out everywhere and deletes it with its own Workspace", async () => {
    assert.equal(await count(`SELECT count(*) AS n FROM "session" WHERE "userId" = $1`, ["bob"]), 1);
    assert.deepEqual(await removeAccount(pool, "bob", "owner"), { ok: true });
    assert.equal(await count(`SELECT count(*) AS n FROM "user" WHERE id = $1`, ["bob"]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "session" WHERE "userId" = $1`, ["bob"]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "account" WHERE "userId" = $1`, ["bob"]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "member" WHERE "userId" = $1`, ["bob"]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "organization" WHERE slug = $1`, ["u-bob"]), 0);
    // Nobody else is touched.
    assert.deepEqual(
      (await listAccounts(pool)).map((r) => r.id),
      ["cy", "ann", "owner"],
    );
    assert.equal(await count(`SELECT count(*) AS n FROM "organization" WHERE slug = $1`, ["u-ann"]), 1);
  });

  test("the operator cannot remove their own Account, nor another admin", async () => {
    const self = await removeAccount(pool, "owner", "owner");
    assert.equal(!self.ok && self.status, 409);
    const admin = await removeAccount(pool, "owner", "ann");
    assert.equal(!admin.ok && admin.status, 409);
    assert.equal(await count(`SELECT count(*) AS n FROM "user" WHERE id = $1`, ["owner"]), 1);
  });

  test("removing an Account that is gone is a 404", async () => {
    const outcome = await removeAccount(pool, "bob", "owner");
    assert.equal(!outcome.ok && outcome.status, 404);
  });
}
