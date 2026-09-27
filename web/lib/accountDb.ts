// The store's one driver entry point (D2): DATABASE_URL decides the driver,
// and every caller only ever sees a pg.Pool.
//
//   postgres:// / postgresql:// -- a real Postgres with pg defaults; a Neon
//     URL carries its own sslmode in the query string.
//   pglite://memory | pglite://<dir> -- local and tests only: PGlite behind
//     PGLiteSocketServer, so Better Auth's adapter and the migrations run the
//     same SQL over the same wire protocol as production.
//   absent -- null; callers 503 (lib/accountEnv.ts) and migrations skip.
//
// Nothing here runs at import: the pool and, in the pglite case, the server
// start on first getPool() call and are cached on globalThis, so a `next dev`
// reload cannot open a second store or a second socket.

import { Pool } from "pg";

type DbHandle = {
  pool: Pool;
  // Structural, because the pglite packages are devDependencies loaded by
  // `await import()` inside the pglite:// branch and never named here.
  pglite?: { close(): Promise<void> };
  socket?: { stop(): Promise<void> };
};

// Cached across module reloads. A promise, so two concurrent first calls
// share one start.
const globalDb = globalThis as typeof globalThis & {
  __droneSurveyAccountDb?: Promise<DbHandle>;
};

/** The shared pool, or null when this deployment has no database. */
export async function getPool(): Promise<Pool | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return (await handleFor(url)).pool;
}

function handleFor(url: string): Promise<DbHandle> {
  const cached = globalDb.__droneSurveyAccountDb;
  if (cached) return cached;
  const pending = url.startsWith("pglite://")
    ? startPglite(url)
    : Promise.resolve({ pool: new Pool({ connectionString: url }) });
  globalDb.__droneSurveyAccountDb = pending;
  // A failed start must not stay cached: the next call deserves a retry
  // rather than the same dead promise forever in a dev server.
  pending.catch(() => {
    if (globalDb.__droneSurveyAccountDb === pending) globalDb.__droneSurveyAccountDb = undefined;
  });
  return pending;
}

/** Local/test databases only: in-memory (`pglite://memory`) or a directory
 *  (`pglite://<dir>`), served on a loopback socket. Pool max 1 because the
 *  socket's query queue is a single-connection multiplexer (D2). */
async function startPglite(url: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const dataDir = url.slice("pglite://".length);
  const db = new PGlite(dataDir && dataDir !== "memory" ? dataDir : undefined);
  const socket = new PGLiteSocketServer({ db, port: Number(process.env.PGLITE_PORT ?? 0) });
  await socket.start();
  // Bound port, resolved from the installed types: `port` is private, but
  // getServerConn() is public (node_modules/@electric-sql/pglite-socket/
  // dist/index.d.ts:114) and start() rewrites it from Server.address() after
  // listening with port 0. The free-port fallback was not needed.
  const conn = socket.getServerConn();
  const sep = conn.lastIndexOf(":");
  const pool = new Pool({
    host: conn.slice(0, sep),
    port: Number(conn.slice(sep + 1)),
    database: "postgres",
    user: "postgres",
    max: 1,
    ssl: false,
  });
  return { pool, pglite: db, socket };
}

/** End the cached store and forget it (idempotent; the CLI scripts call it so
 *  the process can exit). Nothing cached is a no-op. */
export async function closeDb(): Promise<void> {
  const pending = globalDb.__droneSurveyAccountDb;
  globalDb.__droneSurveyAccountDb = undefined;
  if (!pending) return;
  const { pool, pglite, socket } = await pending;
  await pool.end();
  if (socket) await socket.stop();
  if (pglite) await pglite.close();
}
