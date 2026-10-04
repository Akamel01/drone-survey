// The offline outbox (PWA-3, #316) through its own interface, over a plain
// object standing in for the browser's storage: order, coalescing, what a
// replay does with each answer, and how the list reads what is waiting.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { MissionDraft } from "./missionClient.ts";
import type { MissionRecord, MissionRow } from "./missionRecords.ts";
import {
  compareFacts,
  discard,
  enqueue,
  forMission,
  keepMine,
  localId,
  overlay,
  readOutbox,
  replay,
  unshown,
  waitingLabel,
  type Entry,
  type Sent,
} from "./outbox.ts";
import { DEFAULT_SPEC } from "./spec.ts";

function storage(over: { full?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (over.full) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

const draft = (name: string, over: Partial<MissionDraft> = {}): MissionDraft => ({
  id: "m1",
  site_id: "s1",
  site: "Site",
  name,
  date: "2026-09-26",
  spec: DEFAULT_SPEC,
  ...over,
});

const ok: Sent = { ok: true };
const later: Sent = { ok: false, later: true };
const refused = (text: string, extra: Partial<Entry["problem"] & object> = {}): Sent => ({ ok: false, problem: { text, ...extra } });

test("entries keep the order they were made in, and survive a reload", () => {
  const ls = storage();
  enqueue(ls, "withdraw", "m1");
  enqueue(ls, "save", "m2", draft("B", { id: "m2" }));
  enqueue(ls, "remove", "m3");
  assert.deepEqual(readOutbox(ls).map((e) => [e.seq, e.op, e.mission_id]), [
    [1, "withdraw", "m1"],
    [2, "save", "m2"],
    [3, "remove", "m3"],
  ]);
  assert.deepEqual(readOutbox({ getItem: () => "not json", setItem() {} }), [], "a broken outbox is an empty one");
});

test("two saves of one Mission before either is sent are one, against the first one's version", () => {
  const ls = storage();
  enqueue(ls, "save", "m1", draft("First", { base_updated_at: "t1" }));
  enqueue(ls, "withdraw", "m2");
  enqueue(ls, "save", "m1", draft("Second", { base_updated_at: "t9" }));
  const entries = readOutbox(ls);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].seq, 1, "it keeps its place in the order");
  assert.equal(entries[0].draft?.name, "Second");
  assert.equal(entries[0].draft?.base_updated_at, "t1");
});

test("a browser that will not keep it says so, rather than pretending", () => {
  assert.equal(enqueue(storage({ full: true }), "withdraw", "m1"), null);
});

test("local ids are the phone's own namespace and a safe id", () => {
  const id = localId();
  assert.match(id, /^local-[a-zA-Z0-9_-]{1,57}$/);
  assert.notEqual(id, localId());
});

test("replay sends in order and clears what the store took", async () => {
  const ls = storage();
  enqueue(ls, "save", "m1", draft("A"));
  enqueue(ls, "withdraw", "m2");
  enqueue(ls, "flown", "m3");
  const sentOrder: string[] = [];
  const report = await replay(ls, async (e) => {
    sentOrder.push(`${e.op}:${e.mission_id}`);
    return ok;
  });
  assert.deepEqual(sentOrder, ["save:m1", "withdraw:m2", "flown:m3"]);
  assert.equal(report.sent.length, 3);
  assert.deepEqual(readOutbox(ls), []);
});

test("replay stops when the store cannot be reached and keeps everything not sent", async () => {
  const ls = storage();
  enqueue(ls, "withdraw", "m1");
  enqueue(ls, "withdraw", "m2");
  enqueue(ls, "withdraw", "m3");
  let n = 0;
  const report = await replay(ls, async () => (++n === 2 ? later : ok));
  assert.equal(n, 2, "nothing is tried after the store went away");
  assert.equal(report.sent.length, 1);
  assert.deepEqual(readOutbox(ls).map((e) => e.mission_id), ["m2", "m3"]);
  assert.ok(readOutbox(ls).every((e) => !e.problem), "an unreachable store is not a refusal");
});

test("a refusal holds that Mission's later entries but not the others'", async () => {
  const ls = storage();
  enqueue(ls, "save", "m1", draft("A", { base_updated_at: "t1" }));
  enqueue(ls, "withdraw", "m1");
  enqueue(ls, "withdraw", "m2");
  const tried: string[] = [];
  const report = await replay(ls, async (e) => {
    tried.push(`${e.op}:${e.mission_id}`);
    return e.op === "save" ? refused("changed", { conflict: { id: "m1", updated_at: "t2" } as MissionRecord, state: "planned" }) : ok;
  });
  assert.deepEqual(tried, ["save:m1", "withdraw:m2"], "m1's Withdraw is not sent past its refused save");
  assert.equal(report.refused.length, 1);
  const left = readOutbox(ls);
  assert.deepEqual(left.map((e) => e.op), ["save", "withdraw"]);
  assert.equal(left[0].problem?.state, "planned");

  // The next replay leaves a refused entry alone: it waits for the operator.
  tried.length = 0;
  await replay(ls, async (e) => (tried.push(e.op), ok));
  assert.deepEqual(tried, []);
});

test("keep mine sends the entry again against the store's version; take the store's drops it", async () => {
  const ls = storage();
  enqueue(ls, "save", "m1", draft("Mine", { base_updated_at: "t1" }));
  enqueue(ls, "withdraw", "m1");
  await replay(ls, async () => refused("changed", { conflict: { id: "m1", updated_at: "t2" } as MissionRecord }));

  keepMine(ls, 1, "t2");
  assert.equal(readOutbox(ls)[0].problem, undefined);
  assert.equal(readOutbox(ls)[0].draft?.base_updated_at, "t2");
  const bases: (string | undefined)[] = [];
  await replay(ls, async (e) => (bases.push(e.draft?.base_updated_at), ok));
  assert.deepEqual(bases, ["t2", undefined], "its Withdraw follows once it is through");
  assert.deepEqual(readOutbox(ls), []);

  enqueue(ls, "save", "m1", draft("Mine"));
  discard(ls, readOutbox(ls)[0].seq);
  assert.deepEqual(readOutbox(ls), []);
});

test("an edit made while its save is in flight is kept, against the version the save wrote", async () => {
  const ls = storage();
  enqueue(ls, "save", "m1", draft("First", { base_updated_at: "t1" }));
  const report = await replay(ls, async () => {
    enqueue(ls, "save", "m1", draft("Second"));
    return { ok: true, id: "m1", updated_at: "t2" };
  });
  assert.equal(report.sent.length, 1);
  const [left] = readOutbox(ls);
  assert.equal(left.draft?.name, "Second");
  assert.equal(left.draft?.base_updated_at, "t2");
});

test("the list: an edit to a Planned Mission lies over its row; a new Mission and a replacement are listed apart", () => {
  const row = (id: string, state: MissionRow["state"], name: string) =>
    ({ id, state, name, site: "Site", site_id: "s1", date: "2026-09-26", spec: DEFAULT_SPEC, updated_at: "t1" }) as MissionRow;
  const rows = [row("m1", "planned", "Old name"), row("m2", "dispatched", "Fixed")];
  const ls = storage();
  enqueue(ls, "save", "m1", draft("New name"));
  enqueue(ls, "save", "m2", draft("Replacement", { id: "m2" }));
  enqueue(ls, "save", "local-x", draft("Brand new", { id: "local-x" }));
  enqueue(ls, "withdraw", "m2");
  const entries = readOutbox(ls);

  const shown = overlay(rows, entries);
  assert.equal(shown[0].name, "New name");
  assert.equal(shown[0].updated_at, "t1", "the store's version is not rewritten");
  assert.equal(shown[1].name, "Fixed");
  assert.deepEqual(unshown(rows, entries).map((e) => e.draft?.name), ["Replacement", "Brand new"]);
  assert.deepEqual(forMission(entries, "m2").map((e) => e.op), ["save", "withdraw"]);
});

test("waiting lines say what is on the way, or why it is not", () => {
  const e = (op: Entry["op"], problem?: Entry["problem"]): Entry => ({ seq: 1, op, mission_id: "m1", ...(problem ? { problem } : {}) });
  assert.equal(waitingLabel(e("save"), true), "Edit waiting to sync.");
  assert.equal(waitingLabel(e("save"), false), "Not in the store yet. Waiting to sync.");
  assert.equal(waitingLabel(e("withdraw"), true), "Withdraw waiting to sync.");
  assert.match(waitingLabel(e("save", { text: "x", conflict: {} as MissionRecord }), true), /Choose which version to keep/);
  assert.equal(waitingLabel(e("remove", { text: "Remove failed: it holds a Card." }), true), "Not sent: Remove failed: it holds a Card.");
});

test("the compare lists the same facts for both versions, so they line up", () => {
  const mine = compareFacts({ name: "Mine", site: "Site", date: "2026-09-26", spec: DEFAULT_SPEC });
  const theirs = compareFacts({ name: "Theirs", site: "Site", date: "2026-09-27", spec: DEFAULT_SPEC });
  assert.deepEqual(mine.map(([k]) => k), theirs.map(([k]) => k));
  assert.deepEqual(mine.filter(([, v], i) => v !== theirs[i][1]).map(([k]) => k), ["Name", "Date"]);
});
