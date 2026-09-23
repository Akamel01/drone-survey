// A Mission as it lives in the store, and the one derivation of its state.
//
// ADR 0021: a Mission is one thing with one lifecycle, it lives in the shared
// store rather than in browser local storage, and nothing is ever deleted.
// ADR 0022: its Cards are reserved at Dispatch.
//
// Everything here is a pure function over plain data, for the same reason
// `model.ts` is: the routes must not each grow their own copy of the rules,
// and the rules must be reachable from a test without a network. The states,
// the Card rules and the edit rule all come from `model.ts` -- this file joins
// them to stored records, it does not restate them.

import {
  ARCHIVED_STATES,
  editBehaviour,
  type CardHolding,
  type CardLedger,
  type MissionState,
} from "./model.ts";
import type { ManifestEntry, Manifest } from "./missions.ts";
import { isValidSiteId, siteNameProblem, type MissionSpec } from "./spec.ts";

/** One Mission, as stored at specs/_missions/<id>.json.
 *
 *  The record holds only what was asserted. Where the Mission has reached is
 *  never stored -- it is derived, once, by `deriveMissions`, because a stored
 *  state is a second answer that can disagree with the store. */
export interface MissionRecord {
  id: string;
  /** The Site this Mission belongs to. Chosen, never typed fresh: typing it
   *  per Mission is what was quietly creating a new Site every time and
   *  breaking Capture accumulation (ADR 0021). */
  site_id: string;
  /** The Site's label at the time of writing. A label may change; `site_id`
   *  is what identifies the place (CONTEXT.md, Site). */
  site: string;
  /** The Mission Name: short, and distinct from the Site's name. Two Missions
   *  may share a Site and a date when their names differ. */
  name: string;
  date: string;
  created_at: string;
  updated_at: string;
  spec: MissionSpec;
  /** The Spec key this Mission was Dispatched as, once it has been. */
  dispatched_key: string | null;
  dispatched_at?: string;
  /** Cancelled before it was Collected. Archived, never deleted. */
  withdrawn_at?: string;
  /** Removed by the operator. Removing archives; it does not delete. */
  archived_at?: string;
  /** The operator's own answer about Flown, which is what decides it. Absent
   *  when they have not answered, which is not the same as "not flown". */
  flown_mark?: { flown: boolean; at: string };
}

/** What the store says about one Mission, with its state derived. */
export interface MissionRow {
  id: string;
  site_id: string;
  site: string;
  name: string;
  date: string;
  state: MissionState;
  /** True while this Mission can still be acted on and has not been removed. */
  archived: boolean;
  spec_key: string | null;
  spec: MissionSpec;
  /** The Cards reserved for this Mission, in flight order. Empty until
   *  Dispatch, because that is when a Card stops being a prediction. */
  cards: CardHolding[];
  /** The newer Mission that superseded this one, when one did. */
  superseded_by: string | null;
  /** What each side says about Flown. The operator's mark decides; imagery is
   *  evidence the system infers from. Where they disagree both are carried,
   *  so the UI can show both rather than resolving it silently (ADR 0021). */
  flown_marked: boolean | null;
  flown_evidence_at: string | null;
  flown_disagreement: string | null;
  collected_at: string | null;
  loaded_at: string | null;
  created_at: string;
  updated_at: string;
  /** What editing this Mission means from here (`model.ts`). */
  edit: "in-place" | "supersede" | "guarded";
}

/** Two Missions are the same Mission repeated when they share a Site, a date
 *  and a name. A different name is two deliberate flights, not a correction
 *  (ADR 0021), so supersession is scoped to this key and nothing wider. */
export function supersessionGroup(r: {
  site_id: string;
  date: string;
  name: string;
}): string {
  return `${r.site_id}\u0000${r.date}\u0000${r.name.trim().toLowerCase()}`;
}

/** What the operator and the imagery each say, and whether they disagree. */
function flownEvidence(
  record: MissionRecord,
  entry: ManifestEntry | undefined,
): { flown: boolean; marked: boolean | null; evidence: string | null; disagreement: string | null } {
  const evidence = entry?.imagery_at ?? null;
  const marked = record.flown_mark ? record.flown_mark.flown : null;
  // The operator's answer wins in both directions: they may mark a Mission
  // Flown before the imagery lands, or unmark one the imagery suggested.
  const flown = marked === null ? evidence !== null : marked;
  let disagreement: string | null = null;
  if (marked === true && evidence === null) {
    disagreement = "Marked Flown, but no imagery has arrived for this Site and date yet.";
  } else if (marked === false && evidence !== null) {
    disagreement = `Marked not Flown, but imagery arrived at ${evidence}.`;
  }
  return { flown, marked, evidence, disagreement };
}

/** Where one Mission has reached, before supersession is considered.
 *
 *  Withdrawn first: it is an answer about the Mission, not a step along the
 *  way, and a withdrawn Mission never reached the Controller. Flown before
 *  Loaded, because Flown is where a Loaded Mission ends up. */
function baseState(record: MissionRecord, entry: ManifestEntry | undefined, flown: boolean): MissionState {
  if (record.withdrawn_at) return "withdrawn";
  if (flown) return "flown";
  if (entry?.loaded_at) return "loaded";
  if (entry?.collected_at) return "collected";
  if (record.dispatched_key) return "dispatched";
  return "planned";
}

/**
 * The single derivation of Mission state, from the store.
 *
 * Every route answers from this and no route computes a state its own way:
 * the screen that failed did so because three files were joined at the
 * rendering layer and each had its own vocabulary (ADR 0021).
 *
 * Supersession cannot be decided one record at a time -- it is a statement
 * about a group -- which is why this takes the whole set rather than a single
 * record.
 */
export function deriveMissions(
  records: MissionRecord[],
  manifest: Manifest = {},
  ledger: CardLedger = { pool: [], holdings: {} },
): MissionRow[] {
  const byAge = [...records].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1,
  );

  const rows: MissionRow[] = byAge.map((record) => {
    const entry = record.dispatched_key ? manifest[record.dispatched_key] : undefined;
    const { flown, marked, evidence, disagreement } = flownEvidence(record, entry);
    const state = baseState(record, entry, flown);
    return {
      id: record.id,
      site_id: record.site_id,
      site: record.site,
      name: record.name,
      date: record.date,
      state,
      archived: false,
      spec_key: record.dispatched_key,
      spec: record.spec,
      cards: record.dispatched_key
        ? Object.values(ledger.holdings)
            .filter((h) => h.spec_key === record.dispatched_key)
            .sort((a, b) => a.flight - b.flight)
        : [],
      superseded_by: null,
      flown_marked: marked,
      flown_evidence_at: evidence,
      flown_disagreement: disagreement,
      collected_at: entry?.collected_at ?? null,
      loaded_at: entry?.loaded_at ?? null,
      created_at: record.created_at,
      updated_at: record.updated_at,
      edit: editBehaviour(state),
    };
  });

  // Within one Site, date and name, the newest Dispatched Mission replaces the
  // ones before it. Replacement happens at Dispatch, not at saving: a Spec is
  // never edited, so it is the new Spec that supersedes the earlier one, and a
  // Mission still only Planned has not replaced anything yet.
  //
  // A Flown Mission is history rather than a correction, and a Withdrawn one
  // was already answered, so neither is superseded by what came after it.
  const replacedBy = new Map<string, MissionRow>();
  for (const row of rows) {
    // rows are oldest-first here, so the last writer into the map is newest.
    if (row.spec_key && row.state !== "withdrawn") replacedBy.set(supersessionGroup(row), row);
  }
  const order = new Map(rows.map((r, i) => [r.id, i]));
  for (const row of rows) {
    const current = replacedBy.get(supersessionGroup(row));
    if (!current || current.id === row.id) continue;
    if (order.get(row.id)! > order.get(current.id)!) continue;
    if (row.state === "flown" || row.state === "withdrawn") continue;
    row.state = "superseded";
    row.superseded_by = current.id;
    row.edit = editBehaviour("superseded");
  }

  for (const row of rows) {
    const record = byAge.find((r) => r.id === row.id)!;
    // Archived is "removed, or finished": nothing is deleted, so both are
    // hidden behind the same filter rather than mixed into the list.
    row.archived = record.archived_at != null || ARCHIVED_STATES.includes(row.state);
  }

  // Newest first: the list is read to answer "which Card do I open now?".
  return rows.reverse();
}

/** The Spec keys of Missions still current, which is what tells a Card holding
 *  a no-longer-current Mission apart from one that is fine (`staleCards`). */
export function liveSpecKeys(rows: MissionRow[]): Set<string> {
  return new Set(
    rows.filter((r) => !r.archived && r.spec_key).map((r) => r.spec_key as string),
  );
}

// ---------------------------------------------------------------------------
// Writing the Ledger back without losing someone else's write
// ---------------------------------------------------------------------------

/** Record the operator's Flown answer against every Card this Spec holds.
 *
 *  This is what actually frees the Card: `cardUnavailable` reads `flown_at`,
 *  so marking Flown and releasing are the same act, and unmarking takes the
 *  Card back (ADR 0022). Returns a new Ledger; never mutates. */
export function withFlownMark(ledger: CardLedger, spec_key: string, at: string | null): CardLedger {
  const holdings: Record<string, CardHolding> = {};
  for (const [card, held] of Object.entries(ledger.holdings)) {
    if (held.spec_key !== spec_key) {
      holdings[card] = held;
      continue;
    }
    const rest = { ...held };
    // Removed rather than set false: absent is "not answered", which is not
    // the same claim as "did not fly".
    delete rest.flown_at;
    holdings[card] = at ? { ...rest, flown_at: at } : rest;
  }
  return { ...ledger, holdings };
}

export type LedgerMerge = { ok: true; ledger: CardLedger } | { ok: false; reason: string };

function same(a: CardHolding | undefined, b: CardHolding | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Fold our intended Ledger into whatever the store holds now.
 *
 * The Ledger is one file and B2 offers no compare-and-swap, so the only
 * defence is the one `scripts/backfill-summaries.ts` already uses: re-read
 * immediately before writing, keep what someone else wrote meanwhile, and
 * refuse outright rather than overwrite a change we cannot reconcile.
 *
 * `started` is the copy the caller read and computed against, `latest` is the
 * copy read again just before writing, `next` is what the caller wants.
 * A Card both sides changed is a genuine conflict -- two Dispatches racing for
 * the last Card -- and is refused, naming the Card and what to do.
 *
 * The pool and the verification stamp always come from `latest`: the host owns
 * both, and the planner must never un-calibrate a Card by writing a stale copy.
 */
export function mergeLedger(started: CardLedger, latest: CardLedger, next: CardLedger): LedgerMerge {
  const holdings: Record<string, CardHolding> = {};
  const cards = new Set([
    ...Object.keys(started.holdings),
    ...Object.keys(latest.holdings),
    ...Object.keys(next.holdings),
  ]);
  for (const card of cards) {
    const theirs = latest.holdings[card];
    const ours = next.holdings[card];
    const base = started.holdings[card];
    const theyChanged = !same(base, theirs);
    const weChanged = !same(base, ours);
    if (theyChanged && weChanged) {
      return {
        ok: false,
        reason:
          `${card} changed in the store while this change was being prepared. ` +
          `Nothing was written. Reload the Mission list and try again.`,
      };
    }
    const winner = theyChanged ? theirs : ours;
    if (winner) holdings[card] = winner;
  }
  return { ok: true, ledger: { ...latest, holdings } };
}

// ---------------------------------------------------------------------------
// What a Mission must carry before the store will hold it
// ---------------------------------------------------------------------------

/** The longest a Mission Name may be. It is read on a phone, beside a Site
 *  name and a date, and it exists to tell two Missions apart -- not to hold a
 *  description. */
export const MISSION_NAME_MAX = 40;

/** The one rule for a Mission Name, so the browser refuses exactly what the
 *  server would. Null when the name is usable. */
export function missionNameProblem(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) {
    return "Give this Mission a short name -- \"north half\", \"orbit\" -- so it can be told apart from another for the same Site on the same day.";
  }
  if (name.trim().length > MISSION_NAME_MAX) {
    return `A Mission Name is at most ${MISSION_NAME_MAX} characters; shorten it.`;
  }
  return null;
}

/** Everything that must hold before a Mission record is written, in the
 *  operator's words. The browser enforces the same rules; this is the copy
 *  that counts, because the client is not a trust boundary. */
export function missionProblem(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Body is not a Mission.";
  const m = body as Partial<MissionRecord>;
  const unnamedSite = siteNameProblem(m.site);
  if (unnamedSite) return "Choose the Site this Mission belongs to.";
  if (!isValidSiteId(m.site_id)) {
    return "Choose an existing Site for this Mission. A Site is identified once at onboarding and reused; typing a new name here creates a Site by accident and breaks Capture accumulation.";
  }
  const badName = missionNameProblem(m.name);
  if (badName) return badName;
  if (typeof m.date !== "string" || !m.date.trim()) return "Give this Mission a date.";
  return null;
}
