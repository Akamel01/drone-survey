// The Load view's board client and the Loaded report, against a fake fetch
// (PWA-4, #318). The board's shapes are scripts/board/README.md's.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { answerFor, boardAddress, followLoad, missionLabel, readBoard, rowFor, startLoad } from "./board.ts";
import type { BoardLoad, BoardMission } from "./board.ts";
import { reportLoaded } from "./loadedMark.ts";
import { send } from "./missionClient.ts";
import { OUTBOX_KEY, readOutbox, replay } from "./outbox.ts";
import type { MissionRow } from "./missionRecords.ts";

const realFetch = globalThis.fetch;
const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let fetchCalls: { url: string; init?: RequestInit }[] = [];
let answer: (url: string, init?: RequestInit) => Response | Promise<Response>;
const store = new Map<string, string>();

beforeEach(() => {
  fetchCalls = [];
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return answer(String(input), init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realStorage) Object.defineProperty(globalThis, "localStorage", realStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

const json = (body: unknown, status = 200) => Response.json(body, { status });
const down = () => {
  throw new TypeError("Failed to fetch");
};

const MISSION: BoardMission = { id: "site-a/2026-09-30/20260930T010203Z-aaaa1111.json", site: "site-a", date: "2026-09-30", stamp: "x", cards: ["way finder 4"] };
const LOADED: BoardLoad = {
  id: "fb44f056",
  mission: MISSION.id,
  state: "loaded",
  reason: null,
  cards: [{ card: "way finder 4", mission: "Site A 2026-09-30", waypoints: 125 }],
};

test("boardAddress: an address is an origin on the board's port; https unless http is typed", () => {
  assert.equal(boardAddress("192.168.43.1"), "https://192.168.43.1:8787");
  assert.equal(boardAddress(" board.local "), "https://board.local:8787");
  assert.equal(boardAddress("https://board.local:9000/health"), "https://board.local:9000");
  assert.equal(boardAddress("http://10.0.0.5"), "http://10.0.0.5:8787");
  assert.equal(boardAddress(""), null);
  assert.equal(boardAddress("not an address"), null);
});

test("readBoard: health and missions together; the board's note comes through", async () => {
  answer = (url) => (url.endsWith("/health") ? json({ ok: true, controller: true, busy: null }) : json({ missions: [MISSION], note: "n" }));
  const reply = await readBoard("https://board.local:8787");
  assert.ok(reply.ok);
  assert.deepEqual(reply.body, { controller: true, busy: null, missions: [MISSION], note: "n" });
  assert.deepEqual(fetchCalls.map((c) => c.url), ["https://board.local:8787/health", "https://board.local:8787/missions"]);
});

test("readBoard: a board that is off, untrusted or not allowing this origin is unreachable; a refusal in words is kept", async () => {
  answer = down;
  assert.deepEqual(await readBoard("https://board.local:8787"), { ok: false, unreachable: true });
  answer = () => json({ error: "bad_origin", reason: "Requests from 'x' are not accepted." }, 403);
  const refused = await readBoard("https://board.local:8787");
  assert.ok(!refused.ok && !refused.unreachable);
  assert.equal(refused.status, 403);
  assert.match(refused.reason, /not accepted/);
});

test("startLoad: posts the Mission id; a busy board's reason is returned", async () => {
  answer = () => json({ error: "busy", reason: "A Load is already running; wait for it to finish." }, 409);
  const reply = await startLoad("http://x:8787", MISSION.id);
  assert.deepEqual(JSON.parse(String(fetchCalls[0].init?.body)), { mission: MISSION.id });
  assert.ok(!reply.ok && !reply.unreachable && reply.status === 409);
});

test("followLoad: keeps asking through a lost connection and returns how the Load ended", async () => {
  const replies = [() => down(), () => json({ ...LOADED, state: "running", cards: [] }), () => json(LOADED)];
  answer = () => replies.shift()!();
  const lost: boolean[] = [];
  const ended = await followLoad("http://x:8787", LOADED.id, {
    signal: new AbortController().signal,
    every: 1,
    onLost: (l) => lost.push(l),
  });
  assert.equal(ended?.state, "loaded");
  assert.deepEqual(lost, [true, false, false]);
});

test("followLoad: a Load the board has forgotten ends as failed; an aborted follow ends as null", async () => {
  answer = () => json({ error: "no_such_load", reason: "No Load 'x'." }, 404);
  const forgotten = await followLoad("http://x:8787", "x", { signal: new AbortController().signal, every: 1 });
  assert.equal(forgotten?.state, "failed");
  const stop = new AbortController();
  stop.abort();
  assert.equal(await followLoad("http://x:8787", "x", { signal: stop.signal, every: 1 }), null);
});

test("answerFor: Loaded names the Card and the points to check; a refusal says nothing changed; a failure says not to fly", () => {
  const ok = answerFor(LOADED);
  assert.equal(ok.tone, "go");
  assert.equal(ok.headline, "Open way finder 4");
  assert.match(ok.detail, /125 points/);
  assert.deepEqual(ok.cards, [{ card: "way finder 4", points: 125 }]);
  const two = answerFor({ ...LOADED, cards: [...LOADED.cards, { card: "way finder 5", mission: "Site A", waypoints: 40 }] });
  assert.equal(two.headline, "Open way finder 4 and way finder 5");

  const refused = answerFor({ ...LOADED, state: "refused", reason: "Card pool changed", cards: [] });
  assert.equal(refused.tone, "stop");
  assert.match(refused.headline, /left as it was/);
  assert.equal(refused.detail, "Card pool changed");

  const failed = answerFor({ ...LOADED, state: "failed", reason: "FileNotFoundError: jmtpfs", cards: [] });
  assert.match(failed.headline, /Do not fly/);
  assert.match(failed.detail, /FileNotFoundError: jmtpfs/);
});

test("rowFor and missionLabel: the store's name when the Mission is in the list, the board's otherwise", () => {
  const row = { id: "m1", name: "north half", site: "Site A", spec_key: `specs/${MISSION.id}` } as MissionRow;
  assert.equal(rowFor([row], MISSION.id), row);
  assert.equal(rowFor([row], "other.json"), null);
  assert.equal(missionLabel(MISSION, row).title, "north half");
  assert.equal(missionLabel(MISSION, null).title, "site-a, 2026-09-30");
  assert.match(missionLabel({ ...MISSION, cards: null }, null).detail, /Cards unknown/);
});

test("reportLoaded: sent when the store answers; kept in the outbox when it cannot be reached; sent by the replay", async () => {
  const cards = LOADED.cards;
  answer = down;
  assert.equal(await reportLoaded("m1", cards), "waiting");
  const kept = readOutbox(localStorage);
  assert.deepEqual(kept.map((e) => [e.op, e.mission_id]), [["loaded", "m1"]]);

  answer = (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      id: "m1",
      cards: [{ card: "way finder 4", name: "Site A 2026-09-30", waypoints: 125 }],
    });
    return json({ id: "m1" });
  };
  const report = await replay(localStorage, send);
  assert.deepEqual(report.sent.map((s) => s.id), ["m1"]);
  assert.deepEqual(JSON.parse(store.get(OUTBOX_KEY)!), []);
  assert.equal(await reportLoaded("m1", cards), "sent");
});

test("reportLoaded: a second report of one Mission replaces the first; a refusal the store will always give is not kept; a wrong passphrase waits", async () => {
  answer = down;
  await reportLoaded("m1", LOADED.cards);
  await reportLoaded("m1", LOADED.cards);
  assert.equal(readOutbox(localStorage).length, 1);
  store.clear();
  answer = () => json({ error: "This Mission is withdrawn" }, 409);
  assert.equal(await reportLoaded("m1", LOADED.cards), "refused");
  assert.equal(store.get(OUTBOX_KEY), undefined);
  answer = () => json({ error: "passphrase" }, 401);
  assert.equal(await reportLoaded("m1", LOADED.cards), "waiting");
  assert.equal(readOutbox(localStorage).length, 1);
});
