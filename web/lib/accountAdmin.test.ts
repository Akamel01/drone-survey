// Approval (#243) through lib/accountAdmin.ts, on the real schema: the
// migrations Better Auth runs in production, over PGlite locally and Postgres
// in the web-auth CI job. Rows are written directly, so these tests are about
// what the operator's actions do to the store, not about signing in.
//
// Runs only with DATABASE_URL (pglite://memory locally); absent is SKIPPED
// with a printed reason, as in accountFlow.test.ts. In CI every test file
// shares one Postgres and runs at the same time, so every row here carries
// the "adm-" prefix and the assertions look only at those rows.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { pendingCount } from "./accountAdmin.ts";
import type { AccountRow } from "./accountAdmin.ts";

const databaseUrl = process.env.DATABASE_URL;

/** One AccountRow with only the fields pendingCount reads varied. */
function row(overrides: Partial<AccountRow> & { id: string }): AccountRow {
  return {
    name: overrides.id.toUpperCase(),
    email: `${overrides.id}@example.test`,
    providers: ["google"],
    createdAt: new Date("2026-09-28T12:00:00Z").toISOString(),
    approved: false,
    admin: false,
    ...overrides,
  };
}

test("pendingCount is zero when no Accounts are waiting", () => {
  assert.equal(pendingCount([]), 0);
  assert.equal(
    pendingCount([row({ id: "a1", approved: true }), row({ id: "a2", approved: true, admin: true })]),
    0,
  );
});

test("pendingCount counts pending Accounts but never the operator", () => {
  assert.equal(
    pendingCount([
      row({ id: "p1", approved: false }),
      row({ id: "p2", approved: false }),
      row({ id: "ok", approved: true }),
      // Legacy NULL approved normalizes to approved:false in listAccounts, so it waits.
      row({ id: "legacy", approved: false }),
      // The operator's Account is never waiting, even when unapproved.
      row({ id: "op", approved: false, admin: true }),
    ]),
    3,
  );
});

if (!databaseUrl) {
  test(
    "account admin: list, approve and remove Accounts",
    { skip: "DATABASE_URL is not set; run with DATABASE_URL=pglite://memory npm test (or a postgres:// URL)." },
    () => {},
  );
} else {
  process.env.BETTER_AUTH_SECRET ??= "account-admin-test-secret-0123456789abcdef";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

  const { getAuth } = await import("./accountAuth.ts");
  const { getPool, closeDb } = await import("./accountDb.ts");
  const { getMigrations } = await import("better-auth/db/migration");
  const { approveAccount, listAccounts, removeAccount } = await import("./accountAdmin.ts");

  let pool: Pool;
  const now = new Date("2026-09-28T12:00:00Z");
  const P = "adm-";
  const mine = async () => (await listAccounts(pool)).filter((r) => r.id.startsWith(P));
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
  /** This file's rows only, so a rerun against the same database starts clean. */
  async function purge() {
    await pool.query(`DELETE FROM "session" WHERE "userId" LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM "account" WHERE "userId" LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM "member" WHERE "userId" LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM "organization" WHERE slug LIKE $1 OR slug LIKE $2`, [`${P}%`, `u-${P}%`]);
    await pool.query(`DELETE FROM "user" WHERE id LIKE $1`, [`${P}%`]);
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
    await purge();
    // The operator, one approved Account and two pending ones.
    await user(`${P}owner`, "adm-owner@example.test", { approved: true, admin: true, minutes: 0 });
    await account(`${P}owner`, "google");
    await workspace(`${P}owner`, `${P}operator`);
    await user(`${P}ann`, "adm-ann@example.test", { approved: true, minutes: 10 });
    await account(`${P}ann`, "github");
    await workspace(`${P}ann`, `u-${P}ann`);
    await user(`${P}bob`, "adm-bob@example.test", { approved: false, minutes: 20 });
    await account(`${P}bob`, "github");
    await account(`${P}bob`, "google");
    await workspace(`${P}bob`, `u-${P}bob`);
    await session(`${P}bob`);
    await user(`${P}cy`, "adm-cy@example.test", { approved: false, minutes: 30 });
    await account(`${P}cy`, "google");
    await workspace(`${P}cy`, `u-${P}cy`);
  });

  after(async () => {
    await purge();
    await closeDb();
  });

  test("the list puts pending Accounts first, newest first, with their providers", async () => {
    const rows = await mine();
    assert.deepEqual(
      rows.map((r) => [r.id, r.approved, r.admin]),
      [
        [`${P}cy`, false, false],
        [`${P}bob`, false, false],
        [`${P}ann`, true, false],
        [`${P}owner`, true, true],
      ],
    );
    assert.deepEqual(rows.find((r) => r.id === `${P}bob`)?.providers, ["github", "google"]);
    assert.equal(rows.find((r) => r.id === `${P}cy`)?.email, "adm-cy@example.test");
  });

  test("approving lets a pending Account in, and approving again is harmless", async () => {
    assert.deepEqual(await approveAccount(pool, `${P}cy`), { ok: true });
    assert.deepEqual(await approveAccount(pool, `${P}cy`), { ok: true });
    const cy = (await mine()).find((r) => r.id === `${P}cy`);
    assert.equal(cy?.approved, true);
  });

  test("approving an Account that is gone is a 404", async () => {
    const outcome = await approveAccount(pool, `${P}nobody`);
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.status, 404);
  });

  test("removing an Account signs it out everywhere and deletes it with its own Workspace", async () => {
    const bob = `${P}bob`;
    assert.equal(await count(`SELECT count(*) AS n FROM "session" WHERE "userId" = $1`, [bob]), 1);
    assert.deepEqual(await removeAccount(pool, bob, `${P}owner`), { ok: true });
    assert.equal(await count(`SELECT count(*) AS n FROM "user" WHERE id = $1`, [bob]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "session" WHERE "userId" = $1`, [bob]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "account" WHERE "userId" = $1`, [bob]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "member" WHERE "userId" = $1`, [bob]), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM "organization" WHERE slug = $1`, [`u-${bob}`]), 0);
    // Nobody else is touched.
    assert.deepEqual(
      (await mine()).map((r) => r.id),
      [`${P}cy`, `${P}ann`, `${P}owner`],
    );
    assert.equal(await count(`SELECT count(*) AS n FROM "organization" WHERE slug = $1`, [`u-${P}ann`]), 1);
  });

  test("the operator cannot remove their own Account, nor another admin", async () => {
    const self = await removeAccount(pool, `${P}owner`, `${P}owner`);
    assert.equal(!self.ok && self.status, 409);
    const admin = await removeAccount(pool, `${P}owner`, `${P}ann`);
    assert.equal(!admin.ok && admin.status, 409);
    assert.equal(await count(`SELECT count(*) AS n FROM "user" WHERE id = $1`, [`${P}owner`]), 1);
  });

  test("removing an Account that is gone is a 404", async () => {
    const outcome = await removeAccount(pool, `${P}bob`, `${P}owner`);
    assert.equal(!outcome.ok && outcome.status, 404);
  });
}
