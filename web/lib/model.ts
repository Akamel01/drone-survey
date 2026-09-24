// The Mission model: what a Mission is, where it has reached, and which Card
// holds it. ADR 0021 and ADR 0022.
//
// This file is the contract the planner, the API routes and the host all work
// against, so it holds the rules and none of the plumbing: no fetch, no
// storage, no React. Everything here is a pure function over plain data, which
// is why it can be asserted from tests on both sides of the language boundary.
//
// The vocabulary is CONTEXT.md's, not the store's. A word that appears here and
// not in the glossary is a bug in one of the two.

/** Where one Mission has reached. Named after the verbs that cause them.
 *
 *  There is deliberately no "queued": the glossary says a Dispatched Spec is
 *  waiting to be Collected, so how many are ahead of it is something the
 *  Mission has, not somewhere it is (ADR 0021). */
export type MissionState =
  | "planned"
  | "dispatched"
  | "collected"
  | "loaded"
  | "flown"
  | "withdrawn"
  | "superseded";

/** States a Mission can still be acted on from. Everything else is history. */
export const LIVE_STATES: readonly MissionState[] = [
  "planned",
  "dispatched",
  "collected",
  "loaded",
] as const;

/** Archived rather than deleted (ADR 0021): nothing is ever removed, so these
 *  are hidden behind a filter rather than absent. */
export const ARCHIVED_STATES: readonly MissionState[] = ["flown", "withdrawn", "superseded"] as const;

export function isLive(state: MissionState): boolean {
  return LIVE_STATES.includes(state);
}

/** Editing in place is only ever safe before a Spec exists, because a Spec is
 *  never edited -- a change is a new Spec that supersedes the earlier one. From
 *  Dispatched onwards, editing means withdraw-and-redispatch, which is ordinary
 *  and automatic; from Loaded onwards it also means a file already in the field,
 *  which is the one case that is guarded (ADR 0021). */
export function editBehaviour(state: MissionState): "in-place" | "supersede" | "guarded" {
  if (state === "planned") return "in-place";
  if (state === "loaded") return "guarded";
  return "supersede";
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** What one Card holds. A Card holds exactly one Mission, so a Spec split into
 *  three Missions occupies three Cards (CONTEXT.md, Card). */
export interface CardHolding {
  /** The Card's name as the operator sees it on the Controller. */
  card: string;
  /** The Spec this Mission came from. */
  spec_key: string;
  /** Which Mission of that Spec: 1-based, so "Flight 2 of 3". */
  flight: number;
  flights: number;
  /** When the Card was reserved, and when the host actually wrote to it.
   *  A reservation with no written_at has not reached the Controller yet. */
  reserved_at: string;
  /** The Mission that reserved it. A double-pressed Dispatch reads it back to
   *  see that its own Mission already holds a Card (#152). Absent on
   *  reservations made before it existed. */
  mission_id?: string;
  written_at?: string;
  /** The hash of what the host read back after writing this Card. */
  written_md5?: string;
  /** Set once the Mission in this Card has been Flown -- the operator's mark,
   *  which is what decides it (ADR 0021). */
  flown_at?: string;
}

/** The Card Ledger: what each Card holds, keyed by Card name. Lives in the
 *  store, written by the host, read by the planner (ADR 0022). */
export interface CardLedger {
  /** Every Card the operator has calibrated, in operator order. A Card absent
   *  from here cannot be reserved: the pool is what is calibrated, never what
   *  is hoped for. */
  pool: string[];
  holdings: Record<string, CardHolding>;
  /** When the host last checked the Ledger against the Controller itself. */
  verified_at?: string;
}

export const EMPTY_LEDGER: CardLedger = { pool: [], holdings: {} };

/** Why a Card cannot be reused, or null when it can.
 *
 *  A Card is occupied by a Mission that has not been Flown. Withdrawing or
 *  superseding that Mission releases it, because what it holds is no longer
 *  current -- which is also why such a Card is an alarm rather than a note
 *  until it is overwritten (ADR 0022). */
export function cardUnavailable(ledger: CardLedger, card: string): string | null {
  if (!ledger.pool.includes(card)) return "not calibrated";
  const held = ledger.holdings[card];
  if (!held) return null;
  if (held.flown_at) return null;
  return `holds an unflown Mission (${held.spec_key}, flight ${held.flight} of ${held.flights})`;
}

export function availableCards(ledger: CardLedger): string[] {
  return ledger.pool.filter((c) => cardUnavailable(ledger, c) === null);
}

/** The outcome of asking for Cards at Dispatch. A refusal names what is in the
 *  way, because the operator is standing at the planner and can act on it --
 *  which is the whole reason reservation happens here and not at Load. */
export type Reservation =
  | { ok: true; cards: string[] }
  | { ok: false; reason: string; available: number; needed: number };

export function reserveCards(ledger: CardLedger, needed: number): Reservation {
  const free = availableCards(ledger);
  if (needed > free.length) {
    const blocking = ledger.pool
      .map((c) => ({ card: c, why: cardUnavailable(ledger, c) }))
      .filter((x) => x.why !== null);
    return {
      ok: false,
      needed,
      available: free.length,
      reason:
        blocking.length === 0
          ? `no Cards are calibrated; ${needed} needed`
          : `${needed} Cards needed, ${free.length} free. ` +
            blocking.map((b) => `${b.card}: ${b.why}`).join("; "),
    };
  }
  return { ok: true, cards: free.slice(0, needed) };
}

/** Claim Cards for a Spec's flights. Returns a new Ledger; never mutates. */
export function withReservation(
  ledger: CardLedger,
  cards: string[],
  spec_key: string,
  reserved_at: string,
  mission_id?: string,
): CardLedger {
  const holdings = { ...ledger.holdings };
  cards.forEach((card, i) => {
    holdings[card] = {
      card,
      spec_key,
      flight: i + 1,
      flights: cards.length,
      reserved_at,
      ...(mission_id ? { mission_id } : {}),
    };
  });
  return { ...ledger, holdings };
}

/** Give back every Card held for a Spec -- what Withdrawn and Superseded do.
 *  Flown holdings are left alone: they are the record of what was flown, and
 *  the Card is already available because it was Flown. */
export function withRelease(ledger: CardLedger, spec_key: string): CardLedger {
  const holdings: Record<string, CardHolding> = {};
  for (const [card, held] of Object.entries(ledger.holdings)) {
    if (held.spec_key === spec_key && !held.flown_at) continue;
    holdings[card] = held;
  }
  return { ...ledger, holdings };
}

/** The Cards a Spec holds, in flight order. */
export function cardsFor(ledger: CardLedger, spec_key: string): CardHolding[] {
  return Object.values(ledger.holdings)
    .filter((h) => h.spec_key === spec_key)
    .sort((a, b) => a.flight - b.flight);
}

/** A Card holding a Mission that is no longer current. The Controller cannot
 *  report this -- ADR 0016 measured that its own labels are frozen at creation
 *  -- so the planner is the only thing that can say do not fly this. */
export function staleCards(ledger: CardLedger, liveSpecKeys: Set<string>): CardHolding[] {
  return Object.values(ledger.holdings).filter(
    (h) => h.written_at && !h.flown_at && !liveSpecKeys.has(h.spec_key),
  );
}

/** Where the Ledger and the Controller disagree. Reported, never quietly
 *  corrected: a difference here is the only evidence that a Card holds
 *  something other than what was planned (ADR 0022). */
export interface LedgerDrift {
  card: string;
  expected: string | null;
  found: string | null;
}

export function ledgerDrift(ledger: CardLedger, onDevice: Record<string, string | null>): LedgerDrift[] {
  const drift: LedgerDrift[] = [];
  for (const card of ledger.pool) {
    const expected = ledger.holdings[card]?.spec_key ?? null;
    // A Card the device was not asked about is not evidence of anything.
    if (!(card in onDevice)) continue;
    const found = onDevice[card];
    if (expected !== found) drift.push({ card, expected, found });
  }
  return drift;
}
