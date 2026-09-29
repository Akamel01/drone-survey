// Approval (#243): the operator lists the Accounts, approves a pending one, or
// removes one. The store is the only dependency, passed in, so the tests run
// the same SQL over PGlite that production runs over Postgres.
//
// Relative imports carry the explicit .ts extension (accountEnv/accountDb
// discipline): the e2e suite and migrate.mjs load these files with no
// test-hooks in front of them.

import type { Pool } from "pg";

/** One Account as the Accounts list shows it. */
export interface AccountRow {
  id: string;
  name: string;
  email: string;
  /** The sign-in providers linked to it: google, github, credential. */
  providers: string[];
  createdAt: string;
  approved: boolean;
  admin: boolean;
}

/** Pending Accounts first (newest first), then the approved ones. */
export async function listAccounts(pool: Pool): Promise<AccountRow[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string | null;
    email: string;
    createdAt: Date | string;
    approved: boolean | null;
    role: string | null;
    providers: string[] | null;
  }>(
    `SELECT u.id, u.name, u.email, u."createdAt", u.approved, u.role,
            array_remove(array_agg(DISTINCT a."providerId"), NULL) AS providers
       FROM "user" u
       LEFT JOIN "account" a ON a."userId" = u.id
      GROUP BY u.id
      ORDER BY (u.approved IS TRUE) ASC, u."createdAt" DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    email: r.email,
    providers: (r.providers ?? []).slice().sort(),
    createdAt: new Date(r.createdAt).toISOString(),
    approved: r.approved === true,
    admin: r.role === "admin",
  }));
}

/** How many Accounts are waiting for Approval: pending and not the operator. */
export function pendingCount(rows: AccountRow[]): number {
  return rows.filter((a) => !a.approved && !a.admin).length;
}

/** What an admin action changed, or why it was refused. */
export type AdminOutcome = { ok: true } | { ok: false; status: 404 | 409; error: string };

/** Lets a pending Account into its Workspace. Approving twice is harmless. */
export async function approveAccount(pool: Pool, id: string): Promise<AdminOutcome> {
  const { rowCount } = await pool.query('UPDATE "user" SET approved = true WHERE id = $1', [id]);
  if (!rowCount) return { ok: false, status: 404, error: "That Account no longer exists. Reload the Accounts." };
  return { ok: true };
}

/**
 * Removes an Account: its sessions (so it is signed out everywhere at once),
 * its sign-in links, its memberships, its own Workspace, then the Account.
 * One transaction, so a failure part-way leaves the Account as it was.
 * The admin Account is never removed here: that is the operator.
 */
export async function removeAccount(pool: Pool, id: string, callerId: string): Promise<AdminOutcome> {
  if (id === callerId) {
    return { ok: false, status: 409, error: "You cannot remove your own Account while signed in with it." };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ role: string | null }>('SELECT role FROM "user" WHERE id = $1 FOR UPDATE', [id]);
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, status: 404, error: "That Account no longer exists. Reload the Accounts." };
    }
    if (found.rows[0].role === "admin") {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, error: "The operator's Account cannot be removed." };
    }
    const own = await client.query<{ id: string }>('SELECT id FROM "organization" WHERE slug = $1', [`u-${id}`]);
    await client.query('DELETE FROM "session" WHERE "userId" = $1', [id]);
    await client.query('DELETE FROM "invitation" WHERE "inviterId" = $1', [id]);
    await client.query('DELETE FROM "account" WHERE "userId" = $1', [id]);
    await client.query('DELETE FROM "member" WHERE "userId" = $1', [id]);
    for (const org of own.rows) {
      await client.query('DELETE FROM "invitation" WHERE "organizationId" = $1', [org.id]);
      await client.query('DELETE FROM "member" WHERE "organizationId" = $1', [org.id]);
      await client.query('DELETE FROM "organization" WHERE id = $1', [org.id]);
    }
    await client.query('DELETE FROM "user" WHERE id = $1', [id]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
