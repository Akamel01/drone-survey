import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cardsFor, withReservation, type CardLedger } from "./model.ts";
import { changeSurvived } from "./missionRecords.ts";

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
  op: "reserve" | "pool" | "verify";
  cards: string[];
  spec_key: string;
  at: string;
  pool: string[];
  apply_to?: "base" | "ours";
};

const OP_KEYS: Record<string, readonly string[]> = {
  reserve: ["op", "cards", "spec_key", "at"],
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
    fail(name, `${side}.op must be "reserve", "pool" or "verify"`);
  }
  checkKeys(name, op, side === "after" ? [...OP_KEYS[kind], "apply_to"] : OP_KEYS[kind]);
  if (kind === "reserve") {
    if (!Array.isArray(op.cards)) fail(name, `${side}.cards must be an array on a reserve op`);
    required<string>(name, op, "spec_key");
    required<string>(name, op, "at");
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
  // ponytail: three ops, one apply_to; reserve is the planner's, pool/verify
  // mirror the host's writers.
  if (op.op === "reserve") return withReservation(on, op.cards as string[], op.spec_key, op.at as string);
  if (op.op === "pool") return { ...on, pool: op.pool };
  return { ...on, verified_at: op.at };
}

const handlers: Record<string, Handler> = {
  cards_for(name, c) {
    checkKeys(name, c, ["rule", "ledger", "spec_key", "expect_cards_for"]);
    const specKey = required<string>(name, c, "spec_key");
    assert.deepEqual(
      cardsFor(ledgerOf(name, c), specKey).map((h) => `${h.flight} of ${h.flights} in ${h.card}`),
      required<string[]>(name, c, "expect_cards_for"),
      `card ledger case "${name}": cards for ${specKey}`,
    );
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
