import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  availableCards,
  cardUnavailable,
  cardsFor,
  ledgerDrift,
  reserveCards,
  staleCards,
  withRelease,
  withReservation,
  type CardLedger,
} from "./model.ts";
import { changeSurvived, withFlownMark } from "./missionRecords.ts";

// The fixture is the contract between this side and the host's loader: both
// suites dispatch these cases by `rule`, so a rule one side changed (or a case
// that side never implemented) fails here by case name.
const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/card-ledger.json", import.meta.url), "utf8"),
) as { ledger: CardLedger; cases: Record<string, RawCase> };

type RawCase = Record<string, unknown>;
type Handler = (name: string, c: RawCase) => void;

function fail(name: string, what: string): never {
  assert.fail(`card ledger case "${name}": ${what}`);
}

function required<T>(name: string, c: RawCase, key: string): T {
  if (!(key in c)) fail(name, `missing required field "${key}"`);
  return c[key] as T;
}

/** A case (or an op object inside one) names only keys its handler declares;
 *  `_`-prefixed notes are free. A misspelled `expect_*` cannot pass silently. */
function checkKeys(name: string, obj: RawCase, allowed: readonly string[]): void {
  for (const key of Object.keys(obj)) {
    if (key.startsWith("_") || allowed.includes(key)) continue;
    fail(name, `unrecognised key "${key}"`);
  }
}

function readLedger(name: string, raw: unknown): CardLedger {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(name, "ledger must be an object");
  }
  const l = raw as RawCase;
  checkKeys(name, l, ["pool", "holdings", "verified_at"]);
  if (!Array.isArray(required<unknown>(name, l, "pool"))) fail(name, "ledger.pool must be an array");
  const holdings = required<unknown>(name, l, "holdings");
  if (typeof holdings !== "object" || holdings === null || Array.isArray(holdings)) {
    fail(name, "ledger.holdings must be an object");
  }
  return raw as CardLedger;
}

/** The shared base Ledger, unless the case carries its own (only where the
 *  old inline test used a different pool). */
function ledgerOf(name: string, c: RawCase): CardLedger {
  return "ledger" in c ? readLedger(name, c.ledger) : fixture.ledger;
}

type Op = {
  op: "reserve" | "release" | "pool" | "verify";
  cards: string[];
  spec_key: string;
  at: string;
  pool: string[];
  apply_to?: "base" | "ours";
};

const OP_KEYS: Record<string, readonly string[]> = {
  reserve: ["op", "cards", "spec_key", "at"],
  release: ["op", "spec_key"],
  pool: ["op", "pool"],
  verify: ["op", "at"],
};

function readOp(name: string, side: "ours" | "after", raw: unknown): Op {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(name, `${side} must be an op object`);
  }
  const op = raw as RawCase;
  const kind = required<string>(name, op, "op");
  if (typeof kind !== "string" || !Object.hasOwn(OP_KEYS, kind)) {
    fail(name, `${side}.op must be "reserve", "release", "pool" or "verify"`);
  }
  checkKeys(name, op, side === "after" ? [...OP_KEYS[kind], "apply_to"] : OP_KEYS[kind]);
  if (kind === "reserve") {
    if (!Array.isArray(op.cards)) fail(name, `${side}.cards must be an array on a reserve op`);
    required<string>(name, op, "spec_key");
    required<string>(name, op, "at");
  } else if (kind === "release") {
    required<string>(name, op, "spec_key");
  } else if (kind === "pool") {
    if (!Array.isArray(op.pool)) fail(name, `${side}.pool must be an array on a pool op`);
  } else {
    required<string>(name, op, "at");
  }
  if (side === "after") {
    const to = required<string>(name, op, "apply_to");
    // Anything but an exact match fails: a typo must not take the base branch.
    if (to !== "base" && to !== "ours") fail(name, `after.apply_to must be "base" or "ours"`);
  }
  return op as unknown as Op;
}

function applyOp(op: Op, on: CardLedger): CardLedger {
  // ponytail: four ops, one apply_to; reserve/release are the planner's, pool/
  // verify mirror the host's writers; anything beyond these belongs in a
  // per-side adapter harness, not here.
  if (op.op === "reserve") return withReservation(on, op.cards as string[], op.spec_key, op.at as string);
  if (op.op === "release") return withRelease(on, op.spec_key);
  if (op.op === "pool") return { ...on, pool: op.pool };
  return { ...on, verified_at: op.at };
}

const handlers: Record<string, Handler> = {
  available(name, c) {
    checkKeys(name, c, ["rule", "ledger", "expect", "card", "expect_reason"]);
    const ledger = ledgerOf(name, c);
    const hasExpect = "expect" in c;
    const hasCard = "card" in c;
    if (!hasExpect && !hasCard) fail(name, `missing required field "expect" (or "card" with "expect_reason")`);
    if (hasExpect) {
      assert.deepEqual(availableCards(ledger), c.expect, `card ledger case "${name}": available`);
    }
    if (hasCard) {
      const card = required<string>(name, c, "card");
      assert.equal(
        cardUnavailable(ledger, card),
        required<string>(name, c, "expect_reason"),
        `card ledger case "${name}": ${card}`,
      );
    }
  },

  reserve(name, c) {
    checkKeys(name, c, [
      "rule",
      "ledger",
      "needed",
      "expect_ok",
      "expect_cards",
      "expect_available",
      "expect_reason_mentions",
    ]);
    const r = reserveCards(ledgerOf(name, c), required<number>(name, c, "needed"));
    assert.equal(r.ok, required<boolean>(name, c, "expect_ok"), `card ledger case "${name}": reserveCards(...).ok`);
    if (r.ok) {
      assert.deepEqual(r.cards, required<string[]>(name, c, "expect_cards"), `card ledger case "${name}": cards`);
    } else {
      assert.equal(
        r.available,
        required<number>(name, c, "expect_available"),
        `card ledger case "${name}": available count`,
      );
      for (const fragment of required<string[]>(name, c, "expect_reason_mentions")) {
        assert.match(r.reason, new RegExp(fragment), `card ledger case "${name}": refusal should mention ${fragment}`);
      }
    }
  },

  release(name, c) {
    checkKeys(name, c, ["rule", "ledger", "spec_key", "expect_available_after", "expect_holding_kept"]);
    const after = withRelease(ledgerOf(name, c), required<string>(name, c, "spec_key"));
    const hasAvailable = "expect_available_after" in c;
    const hasKept = "expect_holding_kept" in c;
    if (!hasAvailable && !hasKept) {
      fail(name, `missing required field "expect_available_after" (or "expect_holding_kept")`);
    }
    if (hasAvailable) {
      assert.deepEqual(
        availableCards(after),
        c.expect_available_after,
        `card ledger case "${name}": available after release`,
      );
    }
    if (hasKept) {
      const card = required<string>(name, c, "expect_holding_kept");
      assert.ok(after.holdings[card], `card ledger case "${name}": Flown holding ${card} must survive release`);
    }
  },

  flown_mark(name, c) {
    checkKeys(name, c, [
      "rule",
      "spec_key",
      "card",
      "at",
      "expect_available_when_marked",
      "expect_reason_mentions",
      "expect_flown_at_absent_when_unmarked",
    ]);
    const specKey = required<string>(name, c, "spec_key");
    const card = required<string>(name, c, "card");
    const at = required<string>(name, c, "at");
    // The runner builds the mark with the function under test itself.
    const marked = withFlownMark(fixture.ledger, specKey, at);
    const held = marked.holdings[card];
    assert.ok(held, `card ledger case "${name}": marking Flown must leave ${card} holding the Mission`);
    assert.equal(held.flown_at, at, `card ledger case "${name}": the holding carries the mark`);
    assert.deepEqual(
      availableCards(marked),
      required<string[]>(name, c, "expect_available_when_marked"),
      `card ledger case "${name}": available when marked`,
    );
    const unmarked = withFlownMark(marked, specKey, null);
    const back = unmarked.holdings[card];
    assert.ok(back, `card ledger case "${name}": unmarking must keep the holding`);
    if (required<boolean>(name, c, "expect_flown_at_absent_when_unmarked")) {
      assert.ok(!("flown_at" in back), `card ledger case "${name}": the mark is removed, not falsified`);
    }
    const reason = cardUnavailable(unmarked, card);
    assert.ok(reason !== null, `card ledger case "${name}": unmarking takes ${card} back`);
    for (const fragment of required<string[]>(name, c, "expect_reason_mentions")) {
      assert.match(reason, new RegExp(fragment), `card ledger case "${name}": refusal should mention ${fragment}`);
    }
  },

  drift(name, c) {
    checkKeys(name, c, ["rule", "ledger", "on_device", "expect_drift"]);
    assert.deepEqual(
      ledgerDrift(ledgerOf(name, c), required<Record<string, string | null>>(name, c, "on_device")),
      required(name, c, "expect_drift"),
      `card ledger case "${name}": drift`,
    );
  },

  stale(name, c) {
    checkKeys(name, c, ["rule", "ledger", "cards", "spec_key", "at", "live_spec_keys", "expect_stale"]);
    const current =
      "cards" in c
        ? withReservation(
            ledgerOf(name, c),
            required<string[]>(name, c, "cards"),
            required<string>(name, c, "spec_key"),
            required<string>(name, c, "at"),
          )
        : ledgerOf(name, c);
    const live = new Set<string>((c.live_spec_keys as string[] | undefined) ?? []);
    assert.deepEqual(
      staleCards(current, live).map((h) => h.card),
      required<string[]>(name, c, "expect_stale"),
      `card ledger case "${name}": stale Cards`,
    );
  },

  reservation(name, c) {
    checkKeys(name, c, [
      "rule",
      "ledger",
      "cards",
      "spec_key",
      "at",
      "expect_cards_for",
      "expect_available_after",
    ]);
    const specKey = required<string>(name, c, "spec_key");
    const current =
      "cards" in c
        ? withReservation(
            ledgerOf(name, c),
            required<string[]>(name, c, "cards"),
            specKey,
            required<string>(name, c, "at"),
          )
        : ledgerOf(name, c);
    assert.deepEqual(
      cardsFor(current, specKey).map((h) => `${h.flight} of ${h.flights} in ${h.card}`),
      required<string[]>(name, c, "expect_cards_for"),
      `card ledger case "${name}": cards for ${specKey}`,
    );
    if ("expect_available_after" in c) {
      assert.deepEqual(
        availableCards(current),
        c.expect_available_after,
        `card ledger case "${name}": available after reservation`,
      );
    }
  },

  change_survived(name, c) {
    checkKeys(name, c, ["rule", "base", "ours", "after", "expect_survived"]);
    const base = readLedger(name, required(name, c, "base"));
    const ours = readOp(name, "ours", required(name, c, "ours"));
    const after = readOp(name, "after", required(name, c, "after"));
    const next = applyOp(ours, base);
    const then = applyOp(after, after.apply_to === "ours" ? next : base);
    assert.equal(
      changeSurvived(base, next, then),
      required<boolean>(name, c, "expect_survived"),
      `card ledger case "${name}": change survived`,
    );
  },
};

for (const [name, c] of Object.entries(fixture.cases)) {
  test(`card ledger: ${name}`, () => {
    const rule = required<string>(name, c, "rule");
    // `hasOwn`, not truthiness: a rule named "constructor" must fail by name
    // rather than resolve through Object.prototype (investigation F1).
    if (!Object.hasOwn(handlers, rule)) fail(name, `no handler for rule "${rule}"`);
    handlers[rule](name, c);
  });
}
