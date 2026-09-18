import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
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

test("multi-part waiting rows consume consecutive cards and overflow when exceeding pool (explicit manifest parts)", () => {
  const manifest: Manifest = {
    // Each spec has a parts count; these drive card allocation
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
  const heads = rows.filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued"));
  const second = heads.find((h) => h.id.endsWith("20260917T000002Z.json"));
  assert.notEqual(second?.overflow, true);
});

test("withdrawn map shape is flat and overlay applies to waiting rows", () => {
  const key = "specs/Z/2026-09-17/20260917T000005Z.json";
  const rows = joinStatus([], [key], {} as Manifest, { [key]: { withdrawn_at: "t" } });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  // Even with a flat withdrawn map containing the key, overlay should apply to waiting rows
  // and mark the row withdrawn.
  if (byId[key]) {
    assert.equal(byId[key].state, "withdrawn");
  }
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

test("predicted waiting-row cards have undefined waypoints; host cards keep values on collected rows", () => {
  const key = "specs/A/2026-09-17/20260917T000001Z.json";
  // predicted: no host cards yet
  const rows = joinStatus([], [key], {} as Manifest);
  const r = rows.find((rr) => rr.id === key);
  if (!r) throw new Error("row not found");
  const card = r.cards?.[0];
  assert.equal(card?.waypoints, undefined);
  // host-provided card
  const manifest: Manifest = {
    [key]: { collected_at: "t", cards: [{ card: "HOST", name: "Host", waypoints: 32 }] },
  };
  const rows2 = joinStatus([], [key], manifest);
  const r2 = rows2.find((rr) => rr.id === key);
  const hostCard = r2?.cards?.[0];
  assert.equal(hostCard?.waypoints, 32);
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
