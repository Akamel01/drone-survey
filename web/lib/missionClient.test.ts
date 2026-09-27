// The Mission client driven through its interface against a fake fetch: the
// four outcomes the acceptance asks for (success, refusal, store failure,
// unauthorised), the wire contract and signedOut. Expected sentences are the
// routes' and the components' own, byte for byte.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { MISSIONS_CHANGED_KEY } from "./actions.ts";
import { writePassphrase } from "./passphrase.ts";
import { DEFAULT_SPEC } from "./spec.ts";
import * as missionClient from "./missionClient.ts";
import type { MissionAction, MissionDraft } from "./missionClient.ts";

type Handler = (input: string, init?: RequestInit) => Response;
type Call = { input: string; init?: RequestInit };

const calls: Call[] = [];
let handler: Handler = () => new Response("{}", { status: 500 });

/** Point the fake fetch at this test's answer, and start recording fresh. */
function install(h: Handler): void {
  calls.length = 0;
  handler = h;
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  calls.length = 0;
  handler = () => new Response("{}", { status: 500 });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return handler(String(input), init);
  }) as typeof fetch;
  // The overlay is per process, so writing "" is what neutralises it between
  // tests: storage where it works, the subscription where it does not.
  writePassphrase("");
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status });
}

function failing(err: unknown): Handler {
  return () => {
    throw err;
  };
}

function draft(over: Partial<MissionDraft> = {}): MissionDraft {
  return { site_id: "s1", site: "Site", name: "North", date: "2026-09-24", spec: DEFAULT_SPEC, ...over };
}

/** A minimal, working `localStorage`, backed by a plain object -- enough for
 *  `safeStorage()` to accept it and for `getItem`/`setItem` to round-trip.
 *  `undefined` installs one that throws on the name itself (#152). */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage;
}

async function withStorage(storage: Storage | undefined, fn: () => Promise<void>): Promise<void> {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (storage) {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  }
  try {
    await fn();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("list reads the whole list with only the key on the wire", async () => {
  install(() => answer({ missions: [], archived_count: 0, stale_cards: [], now: 1 }, 200));
  const got = await missionClient.list();
  assert.deepEqual(got, { ok: true, read: { missions: [], archived_count: 0, stale_cards: [], now: 1 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/missions?archived=1");
  assert.equal(calls[0].init?.method, undefined, "GET is the default; no method is set");
  assert.deepEqual(calls[0].init?.headers, { "x-wayfinder-key": "" }, "list sends the key and nothing else");
});

test("list: the server's sentence, the store failure, and a 200 that is not a list", async () => {
  const unauthorised =
    "That passphrase is not the one this deployment expects. Retype it; it is kept only in this browser.";
  install(() => answer({ error: unauthorised }, 401));
  assert.deepEqual(await missionClient.list(), { ok: false, status: 401, text: unauthorised });

  const notConfigured = "Storage is not configured. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET.";
  install(() => answer({ error: notConfigured }, 503));
  assert.deepEqual(await missionClient.list(), { ok: false, status: 503, text: notConfigured });

  install(failing(new Error("boom")));
  assert.deepEqual(await missionClient.list(), { ok: false, text: "The store could not be reached: boom." });

  install(failing("lost"));
  assert.deepEqual(await missionClient.list(), { ok: false, text: "The store could not be reached: unknown." });

  install(() => answer({ missions: "nope" }, 200));
  assert.deepEqual(await missionClient.list(), {
    ok: false,
    status: 200,
    text: "The Mission list could not be read (HTTP 200).",
  });
});

test("run: every action reports its own success sentence", async () => {
  const cases: [MissionAction, Record<string, unknown>, string][] = [
    ["Dispatch", { cards: ["way finder 1"] }, "Dispatched. way finder 1 is reserved for it."],
    ["Withdraw", { cards_released: ["way finder 1"] }, "Withdrawn. way finder 1 released."],
    ["Withdraw", { cards_released: [] }, "Withdrawn. It held no Card."],
    ["Mark Flown", {}, "Marked Flown. Its Card is free for the next Mission."],
    ["Unmark Flown", {}, "Unmarked. It holds its Card again."],
    ["Remove", { archived: "m1" }, "Removed from the list. It is archived, not deleted — nothing is lost."],
  ];
  for (const [action, body, text] of cases) {
    install(() => answer(body, 200));
    assert.deepEqual(await missionClient.run(action, "m1"), { ok: true, text }, action);
  }
});

test("run: refusals keep the action's name and the status; a throw carries none", async () => {
  install(() => answer({ error: "No Card is free; 2 needed, 0 available." }, 409));
  assert.deepEqual(await missionClient.run("Dispatch", "m1"), {
    ok: false,
    status: 409,
    text: "Dispatch failed: No Card is free; 2 needed, 0 available.",
  });

  install(() => answer({ error: "That Mission is not in the store." }, 404));
  assert.deepEqual(await missionClient.run("Remove", "m1"), {
    ok: false,
    status: 404,
    text: "Remove failed: That Mission is not in the store.",
  });

  install(() => answer({}, 503));
  assert.deepEqual(await missionClient.run("Dispatch", "m1"), {
    ok: false,
    status: 503,
    text: "Dispatch failed: 503",
  });

  const notConfigured = "Storage is not configured. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET.";
  install(() => answer({ error: notConfigured }, 503));
  assert.deepEqual(await missionClient.run("Dispatch", "m1"), {
    ok: false,
    status: 503,
    text: `Dispatch failed: ${notConfigured}`,
  });

  install(failing(new Error("boom")));
  const threw = await missionClient.run("Dispatch", "m1");
  assert.deepEqual(threw, { ok: false, text: "Dispatch failed: boom" });
  assert.ok(!("status" in threw), "no route was reached, so there is no status");

  const unauthorised =
    "That passphrase is not the one this deployment expects. Retype it; it is kept only in this browser.";
  install(() => answer({ error: unauthorised }, 401));
  assert.deepEqual(await missionClient.run("Withdraw", "m1"), {
    ok: false,
    status: 401,
    text: `Withdraw failed: ${unauthorised}`,
  });
});

test("save: success carries the written Mission and the describeSave sentence", async () => {
  install(() => answer({ mission: { name: "North" }, forked_from: null }, 200));
  assert.deepEqual(await missionClient.save(draft()), {
    ok: true,
    mission: { name: "North" },
    text: "“North” is saved. It is Planned until you Dispatch it.",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/missions");
  assert.equal(calls[0].init?.method, "POST");
});

test("save: refusals pass through; a 200 without a Mission and a throw refuse in their own words", async () => {
  const unauthorised =
    "That passphrase is not the one this deployment expects. Retype it; it is kept only in this browser.";
  install(() => answer({ error: unauthorised }, 401));
  assert.deepEqual(await missionClient.save(draft()), { ok: false, status: 401, text: unauthorised });

  const notConfigured = "Storage is not configured. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET.";
  install(() => answer({ error: notConfigured }, 503));
  assert.deepEqual(await missionClient.save(draft()), { ok: false, status: 503, text: notConfigured });

  install(() => answer({}, 200));
  assert.deepEqual(await missionClient.save(draft()), {
    ok: false,
    status: 200,
    text: "Not saved (HTTP 200). Nothing changed.",
  });

  install(failing(new Error("boom")));
  const threw = await missionClient.save(draft());
  assert.deepEqual(threw, { ok: false, text: "Not saved: boom. Nothing changed." });
  assert.ok(!("status" in threw), "no route was reached, so there is no status");

  install(failing("lost"));
  assert.deepEqual(await missionClient.save(draft()), {
    ok: false,
    text: "Not saved: the store could not be reached. Nothing changed.",
  });
});

test("the wire contract: paths, methods, headers and bodies", async () => {
  writePassphrase("pass-1");
  install((input) => {
    if (input === "/api/missions?archived=1") return answer({ missions: [], archived_count: 0, stale_cards: [], now: 1 }, 200);
    if (input === "/api/missions") return answer({ mission: { name: "North" }, forked_from: null }, 200);
    return answer({ cards: ["way finder 1"], cards_released: ["way finder 1"], archived: "m1" }, 200);
  });
  const keyed = { "x-wayfinder-key": "pass-1" };
  const json = { "Content-Type": "application/json", "x-wayfinder-key": "pass-1" };
  const sent = (i: number) => JSON.parse(String(calls[i].init?.body)) as Record<string, unknown>;

  await missionClient.run("Dispatch", "m1");
  assert.equal(calls[0].input, "/api/missions/dispatch");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(calls[0].init?.headers, json);
  assert.deepEqual(sent(0), { id: "m1" });

  await missionClient.run("Withdraw", "m1");
  assert.equal(calls[1].input, "/api/missions/withdraw");
  assert.deepEqual(calls[1].init?.headers, json);
  assert.deepEqual(sent(1), { id: "m1" });

  await missionClient.run("Mark Flown", "m1");
  assert.equal(calls[2].input, "/api/missions/flown");
  assert.deepEqual(sent(2), { id: "m1", flown: true });

  await missionClient.run("Unmark Flown", "m1");
  assert.equal(calls[3].input, "/api/missions/flown");
  assert.deepEqual(sent(3), { id: "m1", flown: false });

  await missionClient.run("Remove", "m 1/x");
  assert.equal(calls[4].input, "/api/missions?id=m%201%2Fx", "the id is percent-encoded");
  assert.equal(calls[4].init?.method, "DELETE");
  assert.deepEqual(calls[4].init?.headers, keyed, "DELETE has no Content-Type");
  assert.equal(calls[4].init?.body, undefined, "DELETE has no body");

  await missionClient.list();
  assert.equal(calls[5].input, "/api/missions?archived=1");
  assert.deepEqual(calls[5].init?.headers, keyed, "list has no Content-Type");

  await missionClient.save({
    id: "m1",
    site_id: "s1",
    site: "Site",
    name: "North",
    date: "2026-09-24",
    spec: DEFAULT_SPEC,
  });
  assert.equal(calls[6].input, "/api/missions");
  assert.deepEqual(calls[6].init?.headers, json);
  assert.deepEqual(sent(6), {
    id: "m1",
    site_id: "s1",
    site: "Site",
    name: "North",
    date: "2026-09-24",
    spec: DEFAULT_SPEC,
  });
});

test("signedOut() follows the credential, and an empty key still goes on the wire", async () => {
  writePassphrase("");
  assert.equal(missionClient.signedOut(), true);
  install(() => answer({ mission: { name: "North" }, forked_from: null }, 200));
  await missionClient.save(draft());
  assert.deepEqual(calls[0].init?.headers, {
    "Content-Type": "application/json",
    "x-wayfinder-key": "",
  });
  const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
  assert.ok(!("id" in body), "an absent id saves a new Mission, and JSON leaves the key out");
  writePassphrase("k");
  assert.equal(missionClient.signedOut(), false);
  writePassphrase("");
  assert.equal(missionClient.signedOut(), true);
});

test("a value typed while storage is blocked still reaches the wire", async () => {
  await withStorage(undefined, async () => {
    writePassphrase("typed");
    install(() => answer({ mission: { name: "North" }, forked_from: null }, 200));
    await missionClient.save(draft());
    assert.deepEqual(calls[0].init?.headers, {
      "Content-Type": "application/json",
      "x-wayfinder-key": "typed",
    });
  });
});

test("a successful run or save signals the other window; a refusal signals nothing", async () => {
  await withStorage(fakeStorage(), async () => {
    install(() => answer({ error: "No Card is free; 2 needed, 0 available." }, 409));
    await missionClient.run("Dispatch", "m1");
    assert.equal(localStorage.getItem(MISSIONS_CHANGED_KEY), null, "a refusal writes nothing");

    const unauthorised =
      "That passphrase is not the one this deployment expects. Retype it; it is kept only in this browser.";
    install(() => answer({ error: unauthorised }, 401));
    await missionClient.save(draft());
    assert.equal(localStorage.getItem(MISSIONS_CHANGED_KEY), null, "a refused save writes nothing");

    install(() => answer({ cards: ["way finder 1"] }, 200));
    await missionClient.run("Dispatch", "m1");
    assert.equal(typeof localStorage.getItem(MISSIONS_CHANGED_KEY), "string", "a successful run signals");

    localStorage.setItem(MISSIONS_CHANGED_KEY, "sentinel");
    install(() => answer({ mission: { name: "North" }, forked_from: null }, 200));
    await missionClient.save(draft());
    assert.notEqual(localStorage.getItem(MISSIONS_CHANGED_KEY), "sentinel", "a successful save signals too");
  });
});
