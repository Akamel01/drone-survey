// Which Workspace owns each Mission (#244): one row per Mission, written when
// the Mission is created. A Mission with no row belongs to the operator's
// Workspace, so the Missions from before Accounts stay the operator's with no
// data migration and the B2 store layout is untouched.
//
// No foreign key to "organization": removing an Account deletes its Workspace,
// and its Missions must then belong to nobody rather than block the removal or
// fall to the operator's Workspace.
//
// Explicit .ts on relative imports: scripts/migrate.mjs loads this file with
// no test hooks in front of it.

import type { Pool } from "pg";
import { getPool } from "./accountDb.ts";
import type { MissionOwners } from "./missionLifecycle.ts";

/** Forward-only and re-runnable, like Better Auth's own migrations. */
export async function migrateMissionOwners(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS mission_workspace (
       mission_id text PRIMARY KEY,
       workspace_id text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

async function pool(): Promise<Pool> {
  const p = await getPool();
  // The access gate refuses a deployment with no DATABASE_URL first, so this
  // is a wiring fault, reported as the store being unreachable.
  if (!p) throw new Error("the account database is not configured (DATABASE_URL)");
  return p;
}

/** The deployed adapter: the account database. */
export function pgMissionOwners(): MissionOwners {
  return {
    async read() {
      const { rows } = await (await pool()).query<{ mission_id: string; workspace_id: string }>(
        "SELECT mission_id, workspace_id FROM mission_workspace",
      );
      return new Map(rows.map((r) => [r.mission_id, r.workspace_id]));
    },
    async claim(missionId, workspaceId) {
      // One statement: inserted, or already this Workspace's (a repeat of the
      // same create) -- a row comes back; another Workspace's id -- none does.
      const { rows } = await (await pool()).query(
        `INSERT INTO mission_workspace (mission_id, workspace_id) VALUES ($1, $2)
         ON CONFLICT (mission_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id
           WHERE mission_workspace.workspace_id = EXCLUDED.workspace_id
         RETURNING mission_id`,
        [missionId, workspaceId],
      );
      return rows.length === 1;
    },
  };
}

/** Tests and the browser suites: ownership rows in memory. */
export function memoryMissionOwners(seed: Record<string, string> = {}): MissionOwners & { rows: Map<string, string> } {
  const rows = new Map(Object.entries(seed));
  return {
    rows,
    async read() {
      return new Map(rows);
    },
    async claim(missionId, workspaceId) {
      const owner = rows.get(missionId);
      if (owner !== undefined) return owner === workspaceId;
      rows.set(missionId, workspaceId);
      return true;
    },
  };
}
