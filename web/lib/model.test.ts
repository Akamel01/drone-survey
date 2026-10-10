import { test } from "node:test";
import assert from "node:assert/strict";

import {
  availableCards,
  cardUnavailable,
  editBehaviour,
  isLive,
  reserveCards,
  staleCards,
  withRelease,
  withReservation,
  type CardLedger,
} from "./model.ts";
import { withFlownMark } from "./missionRecords.ts";

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

// The planner's own Ledger rules (ADR 0022): the host never reserves, so no
// other language asserts these.
const held = (card: string, spec_key: string, extra = {}) => ({
  card, spec_key, flight: 1, flights: 1, reserved_at: "t", ...extra,
});
const LEDGER: CardLedger = {
  pool: ["w1", "w2", "w3"],
  holdings: {
    w1: held("w1", "a.json", { written_at: "t" }),
    w2: held("w2", "b.json", { written_at: "t", flown_at: "t2" }),
  },
};

test("a Card is free unless it holds an unflown Mission, and only calibrated Cards count", () => {
  assert.deepEqual(availableCards(LEDGER), ["w2", "w3"]);
  assert.equal(cardUnavailable(LEDGER, "w9"), "not calibrated");
  assert.match(cardUnavailable(LEDGER, "w1")!, /unflown/);
});

test("reserving takes the first free Cards and refuses, naming what blocks, when short", () => {
  assert.deepEqual(reserveCards(LEDGER, 2), { ok: true, cards: ["w2", "w3"] });
  const no = reserveCards(LEDGER, 3);
  assert.ok(!no.ok && no.available === 2 && /w1.*unflown/.test(no.reason));
});

test("a reservation records flight order and counts as occupied", () => {
  const l = withReservation({ pool: ["A", "B"], holdings: {} }, ["A", "B"], "k.json", "t");
  assert.deepEqual([l.holdings.A.flight, l.holdings.B.flight, l.holdings.B.flights], [1, 2, 2]);
  assert.deepEqual(availableCards(l), []);
});

test("release frees an unflown holding and keeps a Flown one", () => {
  assert.deepEqual(availableCards(withRelease(LEDGER, "a.json")), ["w1", "w2", "w3"]);
  assert.ok(withRelease(LEDGER, "b.json").holdings.w2);
});

test("marking Flown frees the Card; unmarking removes the mark and takes it back", () => {
  const marked = withFlownMark(LEDGER, "a.json", "t3");
  assert.deepEqual(availableCards(marked), ["w1", "w2", "w3"]);
  const back = withFlownMark(marked, "a.json", null);
  assert.ok(!("flown_at" in back.holdings.w1));
  assert.deepEqual(availableCards(back), ["w2", "w3"]);
  assert.deepEqual(availableCards(withFlownMark(LEDGER, "a.json", "")), ["w2", "w3"]);
});

test("stale is a written, unflown holding whose Spec is no longer live", () => {
  assert.deepEqual(staleCards(LEDGER, new Set()).map((h) => h.card), ["w1"]);
  assert.deepEqual(staleCards(LEDGER, new Set(["a.json"])), []);
  const unwritten = withReservation({ pool: ["A"], holdings: {} }, ["A"], "k.json", "t");
  assert.deepEqual(staleCards(unwritten, new Set()), []);
});
