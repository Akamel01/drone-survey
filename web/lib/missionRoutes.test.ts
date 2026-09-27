// The route adapters (#259): the only things a route still owns are auth, the
// JSON parse with its own message, and the kind-to-status mapping. The real
// handlers run against the fetch fake, as deployed.

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import { FAKE_BUCKET, installFakeStore } from "./fakeStore.ts";
import { LEDGER_KEY } from "./keys.ts";
import { DEFAULT_SPEC, type MissionSpec } from "./spec.ts";

process.env.DISPATCH_SECRET = "test-secret";
process.env.B2_KEY_ID = "key";
process.env.B2_APP_KEY = "app";
process.env.B2_BUCKET = FAKE_BUCKET;
process.env.LEDGER_SETTLE_MS = "0";
delete process.env.B2_READ_KEY_ID;
delete process.env.B2_READ_APP_KEY;

const store = installFakeStore();
after(() => store.restore());

const missions = await import("../app/api/missions/route.ts");
const dispatchRoute = await import("../app/api/missions/dispatch/route.ts");
const withdrawRoute = await import("../app/api/missions/withdraw/route.ts");
const flownRoute = await import("../app/api/missions/flown/route.ts");

type Json = Record<string, unknown>;

function request(method: string, body?: unknown, key = "test-secret", query = ""): Request {
  return new Request(`http://planner.test/api/missions${query}`, {
    method,
    headers: { "x-wayfinder-key": key, "Content-Type": "application/json" },
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

test("401/503 auth", async () => {
  const wrong = await answer(await missions.GET(request("GET", undefined, "not-it")));
  assert.equal(wrong.status, 401);
  assert.match(String(wrong.body.error), /Retype it/);

  const key = process.env.B2_KEY_ID;
  delete process.env.B2_KEY_ID;
  try {
    const r = await answer(await missions.GET(request("GET")));
    assert.equal(r.status, 503);
    assert.match(String(r.body.error), /Storage is not configured/);
  } finally {
    process.env.B2_KEY_ID = key;
  }

  const secret = process.env.DISPATCH_SECRET;
  delete process.env.DISPATCH_SECRET;
  try {
    const r = await answer(await missions.GET(request("GET")));
    assert.equal(r.status, 503);
    assert.match(String(r.body.error), /no shared secret set/);
  } finally {
    process.env.DISPATCH_SECRET = secret;
  }
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
  const del = await answer(await missions.DELETE(request("DELETE", undefined, "test-secret", "?id=missing1")));
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
  const list = await answer(await missions.GET(request("GET", undefined, "test-secret", "?archived=1")));
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
