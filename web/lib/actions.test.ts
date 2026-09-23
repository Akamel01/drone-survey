import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, beginAction, endAction, isRunning, describeResult } from "./actions.ts";

test("a press marks that one control busy, not every control", () => {
  const s = beginAction(IDLE, "Dispatch", "mission-a");
  assert.ok(isRunning(s, "Dispatch", "mission-a"));
  assert.equal(isRunning(s, "Dispatch", "draft-b"), false);
  assert.equal(isRunning(s, "Withdraw", "mission-a"), false);
});

test("a second press while one is in flight is ignored", () => {
  const first = beginAction(IDLE, "Dispatch", "mission-a");
  assert.equal(beginAction(first, "Dispatch", "mission-a"), first);
  assert.equal(beginAction(first, "Delete", "draft-b"), first);
});

test("a press clears the previous message", () => {
  const failed = endAction(beginAction(IDLE, "Dispatch", "mission-a"), "Dispatch", "mission-a", {
    ok: false,
    status: 503,
    body: { error: "Storage is not configured" },
  });
  assert.equal(failed.notice?.failed, true);
  assert.equal(beginAction(failed, "Dispatch", "mission-a").notice, null);
});

test("a failure reports its reason on the row that failed", () => {
  const s = endAction(beginAction(IDLE, "Dispatch", "mission-a"), "Dispatch", "mission-a", {
    ok: false,
    status: 503,
    body: { error: "No Card is free; 2 needed, 0 available." },
  });
  assert.equal(s.running, null);
  assert.deepEqual(s.notice, {
    on: "mission-a",
    text: "Dispatch failed: No Card is free; 2 needed, 0 available.",
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

test("a success reports what the store did, in the glossary's words", () => {
  // Reserving at Dispatch is what lets this name the Card instead of hedging
  // about one (ADR 0022), so the message says which.
  const s = endAction(beginAction(IDLE, "Dispatch", "mission-a"), "Dispatch", "mission-a", {
    ok: true,
    body: { key: "specs/field/2026-09-20/20260920T120000Z.json", cards: ["WAYFINDER 1", "WAYFINDER 2"] },
  });
  assert.equal(s.notice?.failed, false);
  assert.equal(s.notice?.text, "Dispatched. WAYFINDER 1, WAYFINDER 2 are reserved for it.");
  assert.equal(
    describeResult("Withdraw", { ok: true, body: { cards_released: ["WAYFINDER 1"] } }),
    "Withdrawn. WAYFINDER 1 released.",
  );
  // Nothing is ever deleted, so the message must not say it was.
  assert.match(describeResult("Remove", { ok: true, body: { archived: "mission-a" } }), /archived, not deleted/);
  assert.equal(describeResult("Mark Flown", { ok: true, body: {} }), "Mark Flown: done");
});

test("a result that arrives for something else does not free the running control", () => {
  const s = beginAction(IDLE, "Dispatch", "mission-a");
  const other = endAction(s, "Withdraw", "mission-b", { ok: true, body: {} });
  assert.deepEqual(other.running, { label: "Dispatch", on: "mission-a" });
});
