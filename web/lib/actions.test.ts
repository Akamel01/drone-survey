import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, beginAction, endAction, isRunning, describeResult } from "./actions.ts";

test("a press marks that one control busy, not every control", () => {
  const s = beginAction(IDLE, "Dispatch", "draft-a");
  assert.ok(isRunning(s, "Dispatch", "draft-a"));
  assert.equal(isRunning(s, "Dispatch", "draft-b"), false);
  assert.equal(isRunning(s, "Withdraw", "draft-a"), false);
});

test("a second press while one is in flight is ignored", () => {
  const first = beginAction(IDLE, "Dispatch", "draft-a");
  assert.equal(beginAction(first, "Dispatch", "draft-a"), first);
  assert.equal(beginAction(first, "Delete", "draft-b"), first);
});

test("a press clears the previous message", () => {
  const failed = endAction(beginAction(IDLE, "Dispatch", "draft-a"), "Dispatch", "draft-a", {
    ok: false,
    status: 503,
    body: { error: "Storage is not configured" },
  });
  assert.equal(failed.notice?.failed, true);
  assert.equal(beginAction(failed, "Dispatch", "draft-a").notice, null);
});

test("a failure reports its reason on the row that failed", () => {
  const s = endAction(beginAction(IDLE, "Dispatch", "draft-a"), "Dispatch", "draft-a", {
    ok: false,
    status: 503,
    body: { error: "Dispatch is not configured" },
  });
  assert.equal(s.running, null);
  assert.deepEqual(s.notice, {
    on: "draft-a",
    text: "Dispatch failed: Dispatch is not configured",
    failed: true,
  });
});

test("a failure with no reason still names the status code", () => {
  assert.equal(describeResult("Dispatch", { ok: false, status: 502, body: {} }), "Dispatch failed: 502");
  assert.equal(
    describeResult("Dispatch", { ok: false, threw: "Failed to fetch" }),
    "Dispatch failed: Failed to fetch",
  );
});

test("a success reports what the store wrote", () => {
  const s = endAction(beginAction(IDLE, "Dispatch", "draft-a"), "Dispatch", "draft-a", {
    ok: true,
    body: { key: "specs/field/2026-09-20/20260920T120000Z.json" },
  });
  assert.equal(s.running, null);
  assert.equal(s.notice?.failed, false);
  assert.equal(s.notice?.text, "Dispatch: specs/field/2026-09-20/20260920T120000Z.json");
  assert.equal(describeResult("Delete", { ok: true, body: { deleted: "draft-a" } }).startsWith("Delete: draft removed"), true);
  assert.equal(describeResult("Withdraw", { ok: true, body: {} }), "Withdraw: done");
});

test("a result that arrives for something else does not free the running control", () => {
  const s = beginAction(IDLE, "Dispatch", "draft-a");
  const other = endAction(s, "Withdraw", "spec-b", { ok: true, body: {} });
  assert.deepEqual(other.running, { label: "Dispatch", on: "draft-a" });
});
