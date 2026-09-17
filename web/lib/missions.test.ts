import { test } from "node:test";
import assert from "node:assert/strict";
import {
  joinStatus,
  parseSpecKey,
  type DraftRecord,
  type Manifest,
} from "./missions.ts";

function draft(id: string, dispatched_key: string | null = null): DraftRecord {
  return {
    id,
    created_at: "2026-09-17T00:00:00Z",
    updated_at: "2026-09-17T00:00:00Z",
    dispatched_key,
    spec: { site: "Field", date: "2026-09-17" } as DraftRecord["spec"],
  };
}

test("parseSpecKey accepts Spec keys and rejects everything else", () => {
  assert.deepEqual(parseSpecKey("specs/field/2026-09-17/20260917T000000Z.json"), {
    site: "field",
    date: "2026-09-17",
    stamp: "20260917T000000Z",
  });
  assert.equal(parseSpecKey("specs/_drafts/abc.json"), null);
  assert.equal(parseSpecKey("specs/_status/missions.json"), null);
});

test("undispatched draft reads as draft", () => {
  const rows = joinStatus([draft("a")], [], {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "draft");
  assert.equal(rows[0].queue, null);
});

test("dispatched-but-unreported spec is dispatched, next one queued", () => {
  const rows = joinStatus(
    [],
    ["specs/f/2026-09-17/20260917T000001Z.json", "specs/f/2026-09-17/20260917T000002Z.json"],
    {},
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].state, "dispatched");
  assert.equal(byId["specs/f/2026-09-17/20260917T000001Z.json"].queue, 1);
  assert.equal(byId["specs/f/2026-09-17/20260917T000002Z.json"].state, "queued");
  assert.equal(byId["specs/f/2026-09-17/20260917T000002Z.json"].queue, 2);
});

test("manifest moves rows to collected and loaded with cards", () => {
  const manifest: Manifest = {
    "specs/f/2026-09-17/20260917T000001Z.json": { collected_at: "t" },
    "specs/f/2026-09-17/20260917T000002Z.json": {
      collected_at: "t",
      loaded_at: "t2",
      parts: 1,
      cards: [{ card: "WAYFINDER 1", name: "Field", waypoints: 32 }],
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
  assert.deepEqual(loaded.cards, [{ card: "WAYFINDER 1", name: "Field", waypoints: 32 }]);
  assert.equal(loaded.queue, null);
});

test("unknown manifest keys and non-spec keys never surface", () => {
  const rows = joinStatus([], ["specs/_drafts/a.json"], { "specs/gone/x/y.json": {} });
  assert.equal(rows.length, 0);
});
