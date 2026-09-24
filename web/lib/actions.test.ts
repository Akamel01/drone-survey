import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, beginAction, endAction, isRunning, describeResult, noticeShows, safeStorage, settleNotice } from "./actions.ts";

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
    body: { key: "specs/field/2026-09-20/20260920T120000Z.json", cards: ["way finder 1", "way finder 2"] },
  });
  assert.equal(s.notice?.failed, false);
  assert.equal(s.notice?.text, "Dispatched. way finder 1, way finder 2 are reserved for it.");
  assert.equal(
    describeResult("Withdraw", { ok: true, body: { cards_released: ["way finder 1"] } }),
    "Withdrawn. way finder 1 released.",
  );
  // Nothing is ever deleted, so the message must not say it was.
  assert.match(describeResult("Remove", { ok: true, body: { archived: "mission-a" } }), /archived, not deleted/);
  // Mark Flown also answers with `cards`; it must not announce a Dispatch (#164).
  assert.match(
    describeResult("Mark Flown", { ok: true, body: { cards: [{ card: "way finder 1" }] } }),
    /^Marked Flown/,
  );
});

test("a result that arrives for something else does not free the running control", () => {
  const s = beginAction(IDLE, "Dispatch", "mission-a");
  const other = endAction(s, "Withdraw", "mission-b", { ok: true, body: {} });
  assert.deepEqual(other.running, { label: "Dispatch", on: "mission-a" });
});

test("a notice goes once its row has moved on, and stays while it has not (#164)", () => {
  const done = endAction(beginAction(IDLE, "Dispatch", "m"), "Dispatch", "m", {
    ok: true,
    body: { cards: ["way finder 1"] },
  });
  const settled = settleNotice(done, "dispatched");
  assert.equal(noticeShows(settled.notice!, "dispatched"), true);
  assert.equal(noticeShows(settled.notice!, "collected"), false, "stale once Collected");
  assert.equal(noticeShows(done.notice!, "planned"), true, "not yet settled: still shown");
});

test("storage blocked outright reads as no storage, not a crash (#152)", () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
  try {
    assert.equal(safeStorage(), null);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
