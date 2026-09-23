import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_POOL,
  cardMismatch,
  joinStatus,
  type DraftRecord,
  type Manifest,
  type StatusRow,
} from "./missions.ts";

import { isDraftDeletable, isSpecWithdrawable, isWithdrawn } from "./missions.ts";

function draft(id: string, dispatched_key: string | null = null): DraftRecord {
  return {
    id,
    created_at: "2026-09-17T00:00:00Z",
    updated_at: "2026-09-17T00:00:00Z",
    dispatched_key,
  spec: { site: "Field", date: "2026-09-17" } as DraftRecord["spec"],
  };
}

test("undispatched draft reads as draft", () => {
  const rows = joinStatus([draft("a")], [], {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "draft");
  assert.equal(rows[0].queue, null);
});

test("dispatched-but-unreported spec is dispatched; older waiting superseded", () => {
  const rows = joinStatus(
    [],
    ["specs/f/2026-09-17/20260917T000001Z.json", "specs/f/2026-09-17/20260917T000002Z.json"],
    {},
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  // Older waiting becomes superseded; newest waiting remains dispatched with queue 1
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].state, "superseded");
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].queue, null);
  assert.equal(byId["specs/f/2026-09-17/20260917T000002Z.json"].state, "dispatched");
  assert.equal(byId["specs/f/2026-09-17/20260917T000002Z.json"].queue, 1);
});

test("manifest moves rows to collected and loaded with cards", () => {
  const manifest: Manifest = {
    "specs/f/2026-09-17/20260917T000001Z.json": { collected_at: "t" },
    "specs/f/2026-09-17/20260917T000002Z.json": {
      collected_at: "t",
      loaded_at: "t2",
      parts: 1,
      cards: [{ card: "HOST", name: "Field", waypoints: 32 }],
    },
  };
  const rows = joinStatus(
    [],
    ["specs/f/2026-09-17/20260917T000001Z.json", "specs/f/2026-09-17/20260917T000002Z.json"],
    manifest,
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].state, "collected");
  const loaded = byId["specs/f/2026-09-17/20260917T000002Z.json"];
  assert.equal(loaded.state, "loaded");
  assert.deepEqual(loaded.cards, [{ card: "HOST", name: "Field", waypoints: 32 }]);
  assert.equal(loaded.queue, null);
});

test("unknown manifest keys and non-spec keys never surface", () => {
  const rows = joinStatus([], ["specs/_drafts/a.json"], { "specs/gone/x/y.json": {} });
  assert.equal(rows.length, 0);
});

test("every row carries the instant its information is as of", () => {
  const rows = joinStatus(
    [draft("a")],
    ["specs/f/2026-09-17/20260917T000002Z.json"],
    { "specs/f/2026-09-17/20260917T000002Z.json": { collected_at: "2026-09-17T01:00:00Z" } },
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["a"].updated, "2026-09-17T00:00:00Z");
  assert.equal(byId["specs/f/2026-09-17/20260917T000002Z.json"].updated, "2026-09-17T01:00:00Z");
  const waiting = joinStatus([], ["specs/f/2026-09-17/20260917T000002Z.json"], {});
  assert.equal(waiting[0].updated, "2026-09-17T00:00:02Z");
});

// Additional vectors for M-58 repair tests
test("older-waiting + newer-collected supersedes older waiting", () => {
  const rows = joinStatus(
    [],
    [
      "specs/f/2026-09-17/20260917T000001Z.json",
      "specs/f/2026-09-17/20260917T000002Z.json",
    ],
    {
      "specs/f/2026-09-17/20260917T000001Z.json": { collected_at: undefined },
      "specs/f/2026-09-17/20260917T000002Z.json": { collected_at: "t" },
    },
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  // Older waiting superseded; newer is collected
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].state, "superseded");
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].queue, null);
  assert.equal(byId["specs/f/2026-09-17/20260917T000002Z.json"].state, "collected");
});

test("older-waiting + newer-loaded supersedes older waiting", () => {
  const rows = joinStatus(
    [],
    [
      "specs/g/2026-09-17/20260917T000001Z.json",
      "specs/g/2026-09-17/20260917T000002Z.json",
    ],
    {
      "specs/g/2026-09-17/20260917T000001Z.json": {},
      "specs/g/2026-09-17/20260917T000002Z.json": { loaded_at: "t" },
    },
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  // Older waiting superseded; newer is loaded
  assert.equal(byId["specs/g/2026-09-17/20260917T000001Z.json"].state, "superseded");
  assert.equal(byId["specs/g/2026-09-17/20260917T000001Z.json"].queue, null);
  assert.equal(byId["specs/g/2026-09-17/20260917T000002Z.json"].state, "loaded");
});

test("withdraw overlay marks withdrawn rows", () => {
  const rows = joinStatus(
    [],
    [
      "specs/A/2026-09-17/20260917T000001Z.json",
      "specs/A/2026-09-17/20260917T000002Z.json",
    ],
    {
      // both waiting
      "specs/A/2026-09-17/20260917T000001Z.json": {},
      "specs/A/2026-09-17/20260917T000002Z.json": {},
    },
    {
      // withdrawn markers: mark the first as withdrawn
      "specs/A/2026-09-17/20260917T000001Z.json": {},
    },
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["specs/A/2026-09-17/20260917T000001Z.json"].state, "withdrawn");
  // The newer one remains dispatched by default ordering
  assert.equal(byId["specs/A/2026-09-17/20260917T000002Z.json"].state, "dispatched");
});

test("draft deletable predicate works for pure drafts", () => {
  const d = { kind: "draft" as const, state: "draft" as const } as unknown as StatusRow;
  const nd = { kind: "draft" as const, state: "dispatched" as const } as unknown as StatusRow;
  assert.equal(isDraftDeletable(d), true);
  assert.equal(isDraftDeletable(nd), false);
});

test("spec withdrawable predicate works for queued/dispatched rows", () => {
  const s1 = { kind: "spec" as const, state: "dispatched" as const } as unknown as StatusRow;
  const s2 = { kind: "spec" as const, state: "queued" as const } as unknown as StatusRow;
  const s3 = { kind: "spec" as const, state: "collected" as const } as unknown as StatusRow;
  assert.equal(isSpecWithdrawable(s1), true);
  assert.equal(isSpecWithdrawable(s2), true);
  assert.equal(isSpecWithdrawable(s3), false);
});

test("withdrawn predicate works", () => {
  const s = { kind: "spec" as const, state: "withdrawn" as const } as unknown as StatusRow;
  assert.equal(isWithdrawn(s), true);
  const t = { kind: "spec" as const, state: "dispatched" as const } as unknown as StatusRow;
  assert.equal(isWithdrawn(t), false);
});

// Additional vectors for M-57-API repair (R-1, R-3)
test("withdrawn never overrides collected or loaded", () => {
  const key = "specs/A/2026-09-17/20260917T000003Z.json";
  // once collected by host, withdrawal is refused
  const rows = joinStatus(
    [],
    [key],
    {
      [key]: { collected_at: "t" },
    },
    { [key]: { withdrawn_at: "t" } },
  );
  // host state should win: collected, not withdrawn
  assert.equal(rows[0].state, "collected");
  // when only waiting and no manifest entry, withdrawal should still allow withdrawal
  const rows2 = joinStatus([], [key], {} as Manifest, { [key]: { withdrawn_at: "t" } });
  assert.equal(rows2[0].state, "withdrawn");
});

test("un-withdraw restores waiting state; unknown keys and malformed skipped mark nothing", () => {
  const key = "specs/A/2026-09-17/20260917T000004Z.json";
  // withdrawn marker present
  const rowsWithdrawn = joinStatus([], [key], {} as Manifest, { [key]: { withdrawn_at: "t" } });
  assert.equal(rowsWithdrawn[0].state, "withdrawn");
  // no marker -> dispatched for single waiting key
  const rowsNoWithdraw = joinStatus([], [key], {} as Manifest, {});
  assert.equal(rowsNoWithdraw[0].state, "dispatched");
  // unknown key in skipped should not surface as withdrawn
  const rowsUnknown = joinStatus([], [key], {} as Manifest, { "specs/ghost/x/y.json": {} });
  assert.notEqual(rowsUnknown[0]?.state, "withdrawn");
  // malformed skipped (e.g., not an object) should not crash and should not mark withdrawn
  for (const bad of [[key], key, null] as unknown[]) {
    const out = joinStatus([], [key], {} as Manifest, bad as unknown as Record<string, unknown>)[0];
    if (out) {
      assert.notEqual(out.state, "withdrawn");
    }
  }
});

test("two groups global numbering assigns queues oldest-first across groups", () => {
  const rows = joinStatus(
    [],
    [
      // Group 1
      "specs/A/2026-09-17/20260917T000001Z.json",
      "specs/A/2026-09-17/20260917T000003Z.json",
      // Group 2
      "specs/B/2026-09-17/20260917T000001Z.json",
      "specs/B/2026-09-17/20260917T000002Z.json",
    ],
    {
      // Group 1: newest waiting is 000003 (dispatched)
      "specs/A/2026-09-17/20260917T000001Z.json": {},
      "specs/A/2026-09-17/20260917T000003Z.json": { collected_at: undefined },
      // Group 2: newest waiting is 000002 (dispatched)
      "specs/B/2026-09-17/20260917T000001Z.json": {},
      "specs/B/2026-09-17/20260917T000002Z.json": { collected_at: undefined },
    },
  );
  // Both groups have a waiting head; oldest-first across groups should be queue 1 then 2
  const heads = rows.filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued"));
  const q1 = heads.find((h) => h.id.endsWith("20260917T000002Z.json"));
  const q2 = heads.find((h) => h.id.endsWith("20260917T000003Z.json"));
  // Sanity: we should have two active heads
  assert.ok(q1);
  assert.ok(q2);
  // The oldest should have queue 1 and the newer queue 2 (order by stamp)
  assert.equal(q1!.queue, 1);
  assert.equal(q2!.queue, 2);
});

test("a waiting row has no cards until the host manifest reports them", () => {
  // The planner does not predict Controller cards: the host's calibrated slot
  // file is the only authority, and it refuses overflow at Load time. So a
  // waiting row is empty here rather than optimistically filled.
  const manifest: Manifest = {
    "specs/A/2026-09-17/20260917T000001Z.json": { parts: 2 },
    "specs/A/2026-09-17/20260917T000002Z.json": { parts: 3 },
  };
  const rows = joinStatus(
    [],
    [
      "specs/A/2026-09-17/20260917T000001Z.json",
      "specs/A/2026-09-17/20260917T000002Z.json",
    ],
    manifest,
  );
  // Two Specs for one Site and date: the newer is current, the older superseded.
  const waiting = rows.filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued"));
  assert.equal(waiting.length, 1, "one Spec per Site and date is current");
  for (const row of rows) {
    assert.deepEqual(row.cards, [], `${row.id} must not carry invented cards`);
    assert.equal(row.overflow, undefined, "overflow is the host's verdict, reported in the manifest notice");
  }
  // Once the host reports the cards it placed, the row carries exactly those.
  const loaded: Manifest = {
    "specs/A/2026-09-17/20260917T000001Z.json": {
      parts: 2,
      cards: [{ card: "WAYFINDER 1", name: "north", waypoints: 4 }],
    },
  };
  const [row] = joinStatus([], ["specs/A/2026-09-17/20260917T000001Z.json"], loaded);
  assert.deepEqual(row.cards, [{ card: "WAYFINDER 1", name: "north", waypoints: 4 }]);
});

test("withdrawn map shape is flat and overlay applies to waiting rows", () => {
  const key = "specs/Z/2026-09-17/20260917T000005Z.json";
  const rows = joinStatus([], [key], {} as Manifest, { [key]: { withdrawn_at: "t" } });
  assert.equal(rows.length, 1, "the key must produce a row for the overlay to mean anything");
  assert.equal(rows[0].state, "withdrawn", "a withdrawn marker marks a waiting row withdrawn");
});

// New tests for M2: summaries attachment and waypoints handling
test("summary metrics attach to exact spec row", () => {
  const key = "specs/A/2026-09-17/20260917T000001Z.json";
  const summaries = { [key]: { photo_count: 12, path_length_m: 345.6 } };
  const rows = joinStatus([], [key], {}, {}, summaries);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[key].metrics?.photo_count, 12);
  assert.equal(byId[key].metrics?.path_length_m, 345.6);
});

test("missing summary leaves metrics undefined", () => {
  const key = "specs/A/2026-09-17/20260917T000001Z.json";
  const rows = joinStatus([], [key], {} as Manifest);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  // metrics should be undefined when summary is absent
  assert.equal(byId[key].metrics, undefined);
});

test("joinStatus backward compatibility with 4 args leaves metrics undefined", () => {
  const key = "specs/A/2026-09-17/20260917T000001Z.json";
  const rows = joinStatus([], [key], {} as Manifest);
  const row = rows.find((r) => r.id === key);
  assert.ok(row, "the spec key still produces a row with the 4-arg signature");
  assert.equal(row!.metrics, undefined);
});

test("host cards carry their waypoint counts; a row without them carries no cards", () => {
  const key = "specs/A/2026-09-17/20260917T000001Z.json";
  const [empty] = joinStatus([], [key], {} as Manifest);
  assert.deepEqual(empty.cards, [], "nothing is predicted before the host reports");

  const manifest: Manifest = {
    [key]: { collected_at: "t", cards: [{ card: "WAYFINDER 1", name: "Host", waypoints: 32 }] },
  };
  const [reported] = joinStatus([], [key], manifest);
  assert.equal(reported.cards?.[0]?.waypoints, 32, "the host's own numbers survive");
});

// The committed fixture is the cross-language contract for the record shapes:
// scripts/mission/b2_status.py asserts the same file from the other side.
test("the golden record fixture yields the rows the host's records describe", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../fixtures/store-records.json", import.meta.url), "utf8")) as {
    manifest: Record<string, Manifest[string]>;
    skip_list: Record<string, { withdrawn_at: string }>;
    summary: { photo_count: number; path_length_m: number };
  };
  const key = Object.keys(fixture.manifest)[0];
  const [site, date] = key.split("/").slice(1, 3);
  const withdrawnKey = Object.keys(fixture.skip_list).find((k) => !(k in fixture.manifest))!;
  const rows = joinStatus([], [key, withdrawnKey], fixture.manifest, fixture.skip_list, { [key]: fixture.summary });
  assert.equal(rows.length, 2, JSON.stringify(rows.map((r) => r.state)));
  const loaded = rows.find((r) => r.state === "loaded")!;
  const skipped = rows.find((r) => r.state === "withdrawn")!;
  assert.equal(loaded.site, site);
  assert.equal(loaded.date, date);
  assert.equal(loaded.state, "loaded", "the manifest's timestamps decide a loaded row");
  assert.deepEqual(loaded.cards, fixture.manifest[key].cards, "the manifest's cards are the row's cards");
  assert.deepEqual(loaded.metrics, fixture.summary, "the stored summary is the row's metrics");
  assert.equal(skipped.state, "withdrawn", "a skip-list entry with no Load marks the row withdrawn");
});

// --- Predicted cards for a Mission still waiting to Load (#128) -------------
// The prediction has to follow load.py's own rule, so the queue table lives in
// the committed fixture and load.py's self-check asserts the same assignment.
function specKey(site: string, date: string, stamp: string): string {
  return `specs/${site}/${date}/${stamp}.json`;
}

const ALPHA = specKey("alpha", "2026-09-18", "20260918T120000Z");
const BRAVO = specKey("bravo", "2026-09-18", "20260918T090000Z");

test("the card prediction follows load.py's assignment over the whole queue", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../fixtures/store-records.json", import.meta.url), "utf8")) as {
    card_prediction: { pool: string[]; queue: { key: string; parts: number }[]; cards: string[][] };
  };
  const contract = fixture.card_prediction;
  assert.deepEqual(CARD_POOL, contract.pool, "the planner's pool is the host's calibrated pool");
  const summaries = Object.fromEntries(
    contract.queue.map((q) => [q.key, { photo_count: 10 * q.parts, path_length_m: 100, parts: q.parts }]),
  );
  const rows = joinStatus([], contract.queue.map((q) => q.key), {}, {}, summaries);
  const got = contract.queue.map((q) => rows.find((r) => r.id === q.key)!.prediction!.cards);
  assert.deepEqual(got, contract.cards, "the second mission's card depends on the first one's part count");
});

test("the waiting queue is ordered by key, as load.py's unloaded_queue() sorts it", () => {
  // load.py sorts the queue by path, not by time: bravo's older Dispatch stamp
  // does not put it first, because "alpha" sorts before "bravo".
  const summaries = {
    [ALPHA]: { photo_count: 60, path_length_m: 800, parts: 2 },
    [BRAVO]: { photo_count: 20, path_length_m: 300, parts: 1 },
  };
  const rows = joinStatus([], [BRAVO, ALPHA], {}, {}, summaries);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId[ALPHA].prediction?.cards, ["WAYFINDER 1", "WAYFINDER 2"]);
  assert.deepEqual(byId[BRAVO].prediction?.cards, ["WAYFINDER 3"]);
  assert.equal(byId[ALPHA].prediction?.waypoints, 60);
  assert.equal(byId[ALPHA].prediction?.path_length_m, 800);
});

test("a Collected mission still takes its cards from the ones behind it", () => {
  const summaries = {
    [ALPHA]: { photo_count: 60, path_length_m: 800, parts: 3 },
    [BRAVO]: { photo_count: 20, path_length_m: 300, parts: 1 },
  };
  // Collected but not Loaded is still in the host's queue, and still takes cards.
  const rows = joinStatus([], [ALPHA, BRAVO], { [ALPHA]: { collected_at: "t" } }, {}, summaries);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[ALPHA].state, "collected");
  assert.deepEqual(byId[BRAVO].prediction?.cards, ["WAYFINDER 4"]);
});

test("a queue that overflows the pool predicts that nothing Loads", () => {
  const summaries = {
    [ALPHA]: { photo_count: 60, path_length_m: 800, parts: 4 },
    [BRAVO]: { photo_count: 20, path_length_m: 300, parts: 2 },
  };
  const rows = joinStatus([], [ALPHA, BRAVO], {}, {}, summaries);
  for (const key of [ALPHA, BRAVO]) {
    const row = rows.find((r) => r.id === key)!;
    assert.equal(row.prediction?.overflow, true, `${key} must say the host refuses the whole queue`);
    assert.deepEqual(row.prediction?.cards, [], "no card is promised when nothing Loads");
    assert.equal(row.overflow, true);
  }
});

test("an unknown split predicts nothing for itself or anything behind it", () => {
  // No summary for alpha: its card count is unknowable, so bravo's is too.
  const rows = joinStatus([], [ALPHA, BRAVO], {}, {}, { [BRAVO]: { photo_count: 20, path_length_m: 300, parts: 1 } });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[ALPHA].prediction, undefined);
  assert.equal(byId[BRAVO].prediction, undefined, "a guess behind an unknown split would be fiction");
});

test("a Loaded mission carries the host's cards and no prediction", () => {
  const manifest: Manifest = {
    [ALPHA]: {
      collected_at: "t",
      loaded_at: "t2",
      parts: 1,
      cards: [{ card: "WAYFINDER 1", name: "Alpha", waypoints: 69, path_length_m: 828 }],
    },
  };
  const [row] = joinStatus([], [ALPHA], manifest, {}, { [ALPHA]: { photo_count: 69, path_length_m: 828, parts: 1 } });
  assert.equal(row.prediction, undefined, "a measurement is never dressed up as a prediction");
  assert.equal(row.cards[0].path_length_m, 828);
  assert.equal(cardMismatch(row), null);
});

test("a Load that disagrees with the plan says so in both figures", () => {
  const manifest: Manifest = {
    [ALPHA]: {
      collected_at: "t",
      loaded_at: "t2",
      parts: 1,
      cards: [{ card: "WAYFINDER 1", name: "Alpha", waypoints: 5, path_length_m: 900 }],
    },
  };
  const [row] = joinStatus([], [ALPHA], manifest, {}, { [ALPHA]: { photo_count: 62, path_length_m: 990, parts: 1 } });
  const off = cardMismatch(row)!;
  assert.match(off, /62 points planned, 5 loaded/);
  assert.match(off, /990 m planned, 900 m loaded/);
});

test("a host that reported no distance is not read as a disagreement", () => {
  const manifest: Manifest = {
    [ALPHA]: { collected_at: "t", loaded_at: "t2", parts: 1, cards: [{ card: "WAYFINDER 1", name: "A", waypoints: 62 }] },
  };
  const [row] = joinStatus([], [ALPHA], manifest, {}, { [ALPHA]: { photo_count: 62, path_length_m: 990, parts: 1 } });
  assert.equal(cardMismatch(row), null, "a missing figure is silence, not a mismatch");
});
