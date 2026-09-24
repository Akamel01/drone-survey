import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  availableCards,
  cardUnavailable,
  cardsFor,
  editBehaviour,
  isLive,
  ledgerDrift,
  reserveCards,
  staleCards,
  withRelease,
  withReservation,
  type CardLedger,
} from "./model.ts";

// The fixture is the contract between this side and the host's loader: both
// assert against it, so the two rules cannot drift apart without one failing.
const fixture = JSON.parse(readFileSync(new URL("../../fixtures/card-ledger.json", import.meta.url), "utf8"));
const LEDGER = fixture.ledger as CardLedger;
const C = fixture.cases;

test("a Card holding an unflown Mission is not available; a Flown one is", () => {
  assert.deepEqual(availableCards(LEDGER), C.available.expect);
  assert.match(cardUnavailable(LEDGER, "way finder 1")!, /unflown/);
  assert.equal(cardUnavailable(LEDGER, "way finder 2"), null, "Flown releases the Card");
});

test("a Card outside the calibrated pool cannot be reserved", () => {
  assert.equal(cardUnavailable(LEDGER, C.uncalibrated_card.card), C.uncalibrated_card.expect_reason);
});

test("a Spec that splits into two Missions takes two Cards", () => {
  const r = reserveCards(LEDGER, C.reserve_two.needed);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.cards, C.reserve_two.expect_cards);
});

test("asking for more Cards than are free is refused, and says what is in the way", () => {
  const r = reserveCards(LEDGER, C.reserve_more_than_free.needed);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.available, C.reserve_more_than_free.expect_available);
  for (const fragment of C.reserve_more_than_free.expect_reason_mentions) {
    assert.match(r.reason, new RegExp(fragment), `refusal should mention ${fragment}`);
  }
});

test("withdrawing a Spec gives its Cards back, and keeps a Flown record", () => {
  const after = withRelease(LEDGER, C.release_on_withdraw.spec_key);
  assert.deepEqual(availableCards(after), C.release_on_withdraw.expect_available_after);

  const keptFlown = withRelease(LEDGER, C.flown_holding_survives_release.spec_key);
  assert.ok(
    keptFlown.holdings[C.flown_holding_survives_release.expect_holding_kept],
    "a Flown holding is the record of what was flown and must survive a release",
  );
});

test("reserving records the flight order, so a row can say flight 2 of 3", () => {
  const empty: CardLedger = { pool: ["A", "B", "C"], holdings: {} };
  const held = withReservation(empty, ["A", "B", "C"], "specs/s/d/k.json", "2026-09-23T00:00:00Z");
  assert.deepEqual(
    cardsFor(held, "specs/s/d/k.json").map((h) => `${h.flight} of ${h.flights} in ${h.card}`),
    ["1 of 3 in A", "2 of 3 in B", "3 of 3 in C"],
  );
  assert.deepEqual(availableCards(held), [], "every Card is now held");
});

test("a Card whose Mission is no longer current is stale, and only once written", () => {
  const live = new Set<string>();
  const stale = staleCards(LEDGER, live).map((h) => h.card);
  assert.deepEqual(stale, ["way finder 1"], "the Flown one is not stale; the unflown written one is");

  const reservedOnly = withReservation({ pool: ["A"], holdings: {} }, ["A"], "specs/x/y/z.json", "t");
  assert.deepEqual(
    staleCards(reservedOnly, new Set()),
    [],
    "a reservation that never reached the Controller cannot be stale on it",
  );
});

test("a Ledger that disagrees with the Controller reports the difference", () => {
  assert.deepEqual(ledgerDrift(LEDGER, C.drift.on_device), C.drift.expect_drift);
});

test("a Card the device was not asked about is not evidence of drift", () => {
  assert.deepEqual(ledgerDrift(LEDGER, {}), [], "silence from the device is not a disagreement");
});

test("editing is in place only before a Spec exists, and guarded once Loaded", () => {
  assert.equal(editBehaviour("planned"), "in-place");
  assert.equal(editBehaviour("dispatched"), "supersede");
  assert.equal(editBehaviour("collected"), "supersede");
  assert.equal(editBehaviour("loaded"), "guarded");
});

test("live states are the ones still worth acting on", () => {
  assert.equal(isLive("dispatched"), true);
  assert.equal(isLive("flown"), false);
  assert.equal(isLive("withdrawn"), false);
  assert.equal(isLive("superseded"), false);
});
