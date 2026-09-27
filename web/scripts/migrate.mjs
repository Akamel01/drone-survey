// The migration half of `npm run build` (D3): apply Better Auth's own schema
// when the deployment has a database, skip loudly when it does not -- a build
// with zero auth env must stay green (D4/D5).
//
// Forward-only: getMigrations creates and adds, never drops (D16); run it
// again and it reports nothing to do.

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping migrations");
  process.exit(0);
}

// Dynamic imports keep the skip path above free of auth and driver code.
// lib/accountAuth.ts's getAuth() is the lazy cached factory (D5): the pool it
// passes to betterAuth() is what getMigrations reads back in auth.options.
const { getAuth } = await import("../lib/accountAuth.ts");
const { getMigrations } = await import("better-auth/db/migration");
const { closeDb } = await import("../lib/accountDb.ts");

const auth = await getAuth();
const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

for (const { table } of toBeCreated) console.log(`creating table ${table}`);
for (const { table, fields } of toBeAdded) {
  const columns = Object.keys(fields);
  if (columns.length > 0) console.log(`adding to ${table}: ${columns.join(", ")}`);
}
if (toBeCreated.length === 0 && toBeAdded.length === 0) console.log("schema is up to date");

await runMigrations();
await closeDb();
