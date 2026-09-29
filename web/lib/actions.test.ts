import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, beginAction, isRunning, describeResult, safeStorage } from "./actions.ts";

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

test("a failure names its reason in the glossary's words", () => {
  assert.equal(
    describeResult("Dispatch", {
      ok: false,
      status: 503,
      body: { error: "No Card is free; 2 needed, 0 available." },
    }),
    "Dispatch failed: No Card is free; 2 needed, 0 available.",
  );
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
  assert.equal(
    describeResult("Dispatch", {
      ok: true,
      body: { key: "specs/field/2026-09-20/20260920T120000Z.json", cards: ["way finder 1", "way finder 2"] },
    }),
    "Dispatched. way finder 1, way finder 2 are reserved for it.",
  );
  assert.equal(
    describeResult("Withdraw", { ok: true, body: { cards_released: ["way finder 1"] } }),
    "Withdrawn. way finder 1 released.",
  );
  // Nothing is ever deleted, so the message must not say it was.
  assert.match(describeResult("Remove", { ok: true, body: { archived: "mission-a" } }), /archived, not deleted/);
  // Mark Flown also answers with `cards`; it must not announce a Dispatch (#164).
  // A Mission can span several Cards, so both Flown sentences say Cards —
  // matching the row detail (missionView.ts) and the ticket's wording (#294).
  assert.equal(
    describeResult("Mark Flown", { ok: true, body: { cards: [{ card: "way finder 1" }] } }),
    "Marked Flown. Its Cards are free for the next Mission.",
  );
  assert.equal(describeResult("Unmark Flown", { ok: true, body: {} }), "Unmarked. It holds its Cards again.");
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
