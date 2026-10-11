// The route adapters (#259): the only things a route still owns are auth, the
// JSON parse with its own message, and the kind-to-status mapping. The real
// handlers run against the fetch fake, as deployed.

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { FAKE_BUCKET, installFakeStore } from "./fakeStore.ts";
import { LEDGER_KEY, missionKey } from "./keys.ts";
import { DEFAULT_SPEC, type MissionSpec } from "./spec.ts";

// The one gate (#244) reads a session and the caller's Workspace from the
// account database: PGlite in memory unless a postgres:// URL is given (the
// web-auth CI job). Rows carry a per-run suffix so a shared Postgres can run
// this file again.
const RUN = randomUUID().slice(0, 8);
const OWNER_EMAIL = `routes-owner-${RUN}@example.com`;
const ACCOUNTS: Record<string, string> = {
  DATABASE_URL: process.env.DATABASE_URL || "pglite://memory",
  BETTER_AUTH_SECRET: "mission-routes-test-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  OAUTH_PROXY_SECRET: "mission-routes-proxy-secret",
  GOOGLE_CLIENT_ID: "test-google-id",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "test-github-id",
  GITHUB_CLIENT_SECRET: "test-github-secret",
  OWNER_EMAIL,
  OWNER_WORKSPACE_SLUG: `routes-operator-${RUN}`,
};
Object.assign(process.env, ACCOUNTS);
for (const name of ["SUPABASE_URL", "SUPABASE_OAUTH_CLIENT_ID", "SUPABASE_OAUTH_CLIENT_SECRET"]) delete process.env[name];
process.env.B2_KEY_ID = "key";
process.env.B2_APP_KEY = "app";
process.env.B2_BUCKET = FAKE_BUCKET;
process.env.LEDGER_SETTLE_MS = "0";
delete process.env.B2_READ_KEY_ID;
delete process.env.B2_READ_APP_KEY;

const { getAuth } = await import("./accountAuth.ts");
const { getPool, closeDb } = await import("./accountDb.ts");
const { migrateMissionOwners } = await import("./missionOwners.ts");
const { migratePush } = await import("./push.ts");
const { getMigrations } = await import("better-auth/db/migration");

const auth = await getAuth();
await (await getMigrations(auth.options)).runMigrations();
const pool = (await getPool())!;
await migrateMissionOwners(pool);
await migratePush(pool);

type Who = "owner" | "alpha" | "beta" | "pending";
const USERS: Record<Who, { id: string; email: string; emailVerified: boolean; approved: boolean; slug: string }> = {
  owner: { id: `owner-${RUN}`, email: OWNER_EMAIL, emailVerified: true, approved: true, slug: ACCOUNTS.OWNER_WORKSPACE_SLUG },
  alpha: { id: `alpha-${RUN}`, email: `alpha-${RUN}@example.com`, emailVerified: true, approved: true, slug: `u-alpha-${RUN}` },
  beta: { id: `beta-${RUN}`, email: `beta-${RUN}@example.com`, emailVerified: true, approved: true, slug: `u-beta-${RUN}` },
  pending: { id: `pending-${RUN}`, email: `pending-${RUN}@example.com`, emailVerified: false, approved: false, slug: `u-pending-${RUN}` },
};
for (const u of Object.values(USERS)) {
  const now = new Date();
  await pool.query(
    'INSERT INTO "user" (id, name, email, "emailVerified", approved, "createdAt", "updatedAt") VALUES ($1, $1, $2, $3, $4, $5, $5)',
    [u.id, u.email, u.emailVerified, u.approved, now],
  );
  const org = randomUUID();
  await pool.query('INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1, $2, $2, $3)', [org, u.slug, now]);
  await pool.query(
    'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [randomUUID(), org, u.id, "owner", now],
  );
}

// The session is Better Auth's to parse; the gate is what is under test, so
// the instance's getSession answers for the Account named in a test header.
(auth.api as unknown as { getSession: unknown }).getSession = async ({ headers }: { headers: Headers }) => {
  const u = USERS[headers.get("x-test-as") as Who];
  return u ? { session: {}, user: { ...u, name: u.id } } : null;
};

const store = installFakeStore();
after(async () => {
  store.restore();
  await closeDb();
});

const missions = await import("../app/api/missions/route.ts");
const dispatchRoute = await import("../app/api/missions/dispatch/route.ts");
const withdrawRoute = await import("../app/api/missions/withdraw/route.ts");
const flownRoute = await import("../app/api/missions/flown/route.ts");

type Json = Record<string, unknown>;

function request(method: string, body?: unknown, as: Who | null = "owner", query = ""): Request {
  return new Request(`http://planner.test/api/missions${query}`, {
    method,
    headers: { ...(as ? { "x-test-as": as } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function answer(res: Response): Promise<{ status: number; body: Json }> {
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}

function spec(): MissionSpec {
  return {
    ...DEFAULT_SPEC,
    site: "GeorgeTown2",
    site_id: "g-z2m4tx",
    date: "2026-09-24",
    aoi: [
      [49.18946, -122.84085],
      [49.18795, -122.84085],
      [49.18795, -122.83938],
      [49.18944, -122.83934],
    ],
    flight: { ...DEFAULT_SPEC.flight, altitude_m: 60, speed_ms: 2.5, margin_passes: 0.5, gimbal_pitch_deg: -90 },
  };
}

async function saved(): Promise<string> {
  const s = spec();
  const r = await answer(
    await missions.POST(request("POST", { site_id: s.site_id, site: s.site, name: "Ortho", date: s.date, spec: s })),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body.mission as { id: string }).id;
}

beforeEach(() => {
  store.files.clear();
  store.beforeDownload = null;
  store.put(LEDGER_KEY, { pool: ["way finder 1", "way finder 2", "way finder 3"], holdings: {} });
});

test("401 no session, 403 pending, 503 unconfigured -- before the store is touched", async () => {
  const before = { ...store.calls };
  const none = await answer(await missions.GET(request("GET", undefined, null)));
  assert.equal(none.status, 401);
  assert.equal(none.body.error, "Sign in to continue: this request carried no session.");

  const pending = await answer(await withdrawRoute.POST(request("POST", { id: "m1" }, "pending")));
  assert.equal(pending.status, 403);
  assert.match(String(pending.body.error), /waiting for approval/);
  assert.deepEqual(store.calls, before, "a refused caller costs no store transaction");

  const key = process.env.B2_KEY_ID;
  delete process.env.B2_KEY_ID;
  try {
    const r = await answer(await missions.GET(request("GET")));
    assert.equal(r.status, 503);
    assert.match(String(r.body.error), /Storage is not configured/);
  } finally {
    process.env.B2_KEY_ID = key;
  }

  const url = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const r = await answer(await missions.GET(request("GET")));
    assert.equal(r.status, 503);
    assert.match(String(r.body.error), /not configured for accounts/);
  } finally {
    process.env.DATABASE_URL = url;
  }
});

test("two Workspaces cannot see or change each other's Missions; un-owned ones are the operator's alone", async () => {
  const s = spec();
  const draft = { site_id: s.site_id, site: s.site, name: "Ortho", date: s.date, spec: s };
  const ids = async (as: Who) =>
    ((await answer(await missions.GET(request("GET", undefined, as, "?archived=1")))).body.missions as { id: string }[]).map(
      (m) => m.id,
    );

  // A Mission from before Accounts: in the store, no ownership row.
  const legacy = await saved();
  await pool.query("DELETE FROM mission_workspace WHERE mission_id = $1", [legacy]);

  const created = await answer(await missions.POST(request("POST", draft, "alpha")));
  assert.equal(created.status, 200);
  const a = (created.body.mission as { id: string }).id;

  assert.deepEqual(await ids("alpha"), [a]);
  assert.deepEqual(await ids("beta"), []);
  assert.deepEqual(await ids("owner"), [legacy]);

  for (const as of ["beta", "owner"] as const) {
    const edit = await answer(await missions.POST(request("POST", { ...draft, id: a, name: "Taken" }, as)));
    assert.equal(edit.status, 404, `${as} cannot save over alpha's Mission`);
    assert.equal((await answer(await dispatchRoute.POST(request("POST", { id: a }, as)))).status, 404);
  }
  assert.equal((await answer(await dispatchRoute.POST(request("POST", { id: a }, "alpha")))).status, 200);
  for (const as of ["beta", "owner"] as const) {
    assert.equal((await answer(await withdrawRoute.POST(request("POST", { id: a }, as)))).status, 404, `${as} cannot withdraw it`);
    assert.equal((await answer(await missions.DELETE(request("DELETE", undefined, as, `?id=${a}`)))).status, 404);
  }
  assert.equal((await answer(await withdrawRoute.POST(request("POST", { id: legacy }, "alpha")))).status, 404);
  assert.equal((store.json(missionKey(a)) as { name: string }).name, "Ortho", "nobody else's write reached it");
  assert.equal((await answer(await withdrawRoute.POST(request("POST", { id: a }, "alpha")))).status, 200);
});

test("per-route JSON 400 wording", async () => {
  const save = await answer(await missions.POST(request("POST", "{nope")));
  assert.equal(save.status, 400);
  assert.equal(save.body.error, "Body is not JSON. Send the Mission as JSON.");

  const dispatch = await answer(await dispatchRoute.POST(request("POST", "{nope")));
  assert.equal(dispatch.status, 400);
  assert.equal(dispatch.body.error, "Body is not JSON. Send { id }.");

  const withdraw = await answer(await withdrawRoute.POST(request("POST", "{nope")));
  assert.equal(withdraw.status, 400);
  assert.equal(withdraw.body.error, "Body is not JSON. Send { id }.");

  const flown = await answer(await flownRoute.POST(request("POST", "{nope")));
  assert.equal(flown.status, 400);
  assert.equal(flown.body.error, "Body is not JSON. Send { id, flown }.");

  const id = await saved();
  const shape = await answer(await flownRoute.POST(request("POST", { id })));
  assert.equal(shape.status, 400);
  assert.equal(
    shape.body.error,
    "Say whether this Mission was Flown: send { flown: true } or { flown: false }.",
  );
});

test("one kind→status hit per route", async () => {
  // invalid 400 -- save validation
  const bad = await answer(await missions.POST(request("POST", {})));
  assert.equal(bad.status, 400);
  assert.match(String(bad.body.error), /Choose the Site/);

  // not_found 404 -- DELETE, dispatch, flown
  const del = await answer(await missions.DELETE(request("DELETE", undefined, "owner", "?id=missing1")));
  assert.equal(del.status, 404);
  assert.equal(del.body.error, "That Mission is not in the store.");
  const dispatch = await answer(await dispatchRoute.POST(request("POST", { id: "missing1" })));
  assert.equal(dispatch.status, 404);
  const flown = await answer(await flownRoute.POST(request("POST", { id: "missing1", flown: true })));
  assert.equal(flown.status, 404);

  // refused 409 -- withdraw on a Planned Mission
  const id = await saved();
  const withdraw = await answer(await withdrawRoute.POST(request("POST", { id })));
  assert.equal(withdraw.status, 409);
  assert.match(String(withdraw.body.error), /nothing to withdraw/);

  // GET 200 delegates to the list
  const list = await answer(await missions.GET(request("GET", undefined, "owner", "?archived=1")));
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.missions));

  // not_configured 503 through GET
  const key = process.env.B2_KEY_ID;
  delete process.env.B2_KEY_ID;
  try {
    const none = await answer(await missions.GET(request("GET")));
    assert.equal(none.status, 503);
    assert.match(String(none.body.error), /Storage is not configured/);
  } finally {
    process.env.B2_KEY_ID = key;
  }
});

test("the verified owner outside the operator's Workspace is healed into it, not shown an empty list", async () => {
  const legacy = await saved();
  await pool.query("DELETE FROM mission_workspace WHERE mission_id = $1", [legacy]);
  await pool.query('DELETE FROM "member" WHERE "userId" = $1', [USERS.owner.id]);
  const org = randomUUID();
  await pool.query('INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1, $2, $2, now())', [org, `u-${USERS.owner.id}`]);
  await pool.query('INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())', [
    randomUUID(),
    org,
    USERS.owner.id,
    "owner",
  ]);
  const r = await answer(await missions.GET(request("GET", undefined, "owner", "?archived=1")));
  assert.equal(r.status, 200);
  assert.deepEqual((r.body.missions as { id: string }[]).map((m) => m.id), [legacy]);
});
