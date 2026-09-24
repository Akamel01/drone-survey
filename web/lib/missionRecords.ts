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
  isLive,
  type CardHolding,
  type CardLedger,
  type MissionState,
} from "./model.ts";
import type { LoadedCard, ManifestEntry, Manifest } from "./missions.ts";
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
  /** The Missions this one's Dispatch replaced: the same Site, date and name,
   *  Dispatched before it. Recorded at Dispatch, never inferred (#152). */
  supersedes?: string[];
  /** Cancelled before it reached the Controller. Archived, never deleted. */
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
  /** What the host says it actually wrote to those Cards, with the point count
   *  and distance it measured writing them. Carried rather than summarised,
   *  because the disagreement between these figures and the planner's is the
   *  only detector for flying the wrong Mission -- the Controller's own labels
   *  are frozen at a Card's creation and cannot be asked (ADR 0022). */
  loaded_cards: LoadedCard[];
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

/** A name as an operator reads it: case and spacing are not a difference. */
export function sameName(a: string, b: string): boolean {
  const norm = (x: string) => x.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Another Site already called this, or null.
 *
 * Two Sites with one name are two identical entries in the Site chooser, and
 * the Captures split between them -- the accident ADR 0021 set out to end,
 * reached by naming a "new" Site after an old one (#166). Each Site is
 * compared by its latest label, because a renamed Site's older Missions still
 * carry the name it used to have.
 */
export function siteNameTaken(
  records: Pick<MissionRecord, "site_id" | "site" | "updated_at">[],
  site_id: string,
  site: string,
): { site_id: string; site: string } | null {
  const latest = new Map<string, { site: string; at: string }>();
  for (const r of records) {
    const seen = latest.get(r.site_id);
    if (!seen || r.updated_at > seen.at) latest.set(r.site_id, { site: r.site, at: r.updated_at });
  }
  for (const [id, { site: label }] of latest) {
    if (id !== site_id && sameName(label, site)) return { site_id: id, site: label };
  }
  return null;
}

/**
 * A live Mission this one would silently replace, or null.
 *
 * Site, date and name together are a supersession group (ADR 0021): the newest
 * Dispatch in it replaces the rest. That is the point of an Edit's fork, and
 * the fork is exempt by not calling this. A Mission created fresh under a name
 * already taken would replace the other one without anyone asking (#167).
 */
export function missionNameTaken(
  rows: Pick<MissionRow, "id" | "site_id" | "date" | "name" | "state" | "archived">[],
  candidate: { id?: string | null; site_id: string; date: string; name: string },
): Pick<MissionRow, "id" | "name" | "state"> | null {
  const group = supersessionGroup(candidate);
  return (
    rows.find(
      (r) => r.id !== candidate.id && !r.archived && isLive(r.state) && supersessionGroup(r) === group,
    ) ?? null
  );
}

/** Everything the operator can do to a Mission, in the order a row offers it. */
export type ActionName = "Dispatch" | "Withdraw" | "Mark Flown" | "Unmark Flown" | "Edit" | "Remove" | "Copy";
export const ACTION_ORDER: readonly ActionName[] = [
  "Dispatch",
  "Withdraw",
  "Mark Flown",
  "Unmark Flown",
  "Edit",
  "Remove",
  "Copy",
];

/**
 * Why this action cannot be taken on a Mission in this state, or null when it
 * can. The one rule: a row offers exactly the actions this allows, and every
 * route refuses the rest in these words (#102). The row and the route each
 * kept their own copy, and they drifted -- a Loaded Mission offered Edit that
 * its Save then refused.
 *
 * Only the state decides here. A refusal that depends on more than the state
 * -- no Card free, a Card given away since -- stays in its route.
 */
export function actionProblem(action: ActionName, row: Pick<MissionRow, "state">): string | null {
  const s = row.state;
  switch (action) {
    case "Dispatch":
      return s === "planned"
        ? null
        : `This Mission is ${s}, and only a Planned Mission is Dispatched. To fly it again, Copy it: ` +
            "that makes a new Mission to Dispatch.";
    case "Withdraw":
      if (s === "dispatched" || s === "collected") return null;
      return s === "loaded"
        ? "This Mission is already Loaded, so its file is on the Controller and withdrawing cannot reach it. " +
            "Fly it and Mark it Flown, which releases its Card."
        : `A ${s} Mission has nothing to withdraw: it was never Dispatched, or it is already history.`;
    case "Mark Flown":
      return s === "loaded"
        ? null
        : `This Mission is ${s}, so it has not been written to the Controller and cannot have been flown. ` +
            "It can be marked Flown once it is Loaded.";
    case "Unmark Flown":
      return s === "flown" ? null : `This Mission is ${s}, not Flown, so there is nothing to unmark.`;
    case "Edit":
      return s === "loaded"
        ? "This Mission is already Loaded, so a file for it is on the Controller and it cannot be changed. " +
            "Copy it to plan a new Mission from it."
        : null;
    case "Remove":
      if (s === "planned" || s === "flown" || s === "withdrawn" || s === "superseded") return null;
      return s === "loaded"
        ? "This Mission is on the Controller. Fly it and Mark it Flown, then remove it."
        : "This Mission still holds its Card. Withdraw it first -- that releases the Card -- then remove it.";
    case "Copy":
      return null;
  }
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
      loaded_cards: entry?.cards ?? [],
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

  // A Dispatch that replaced earlier Missions names them in `supersedes`, and
  // that record is what makes them Superseded. It used to be inferred from
  // age -- the newest Dispatch in a Site, date and name replacing the rest --
  // which broke two ways: a tie in creation time was settled by a random id,
  // and withdrawing the replacement brought the old Mission back to life
  // although its Cards were already released and the host told to skip it
  // (#152). What happened at Dispatch is a fact, so it is recorded, not guessed.
  //
  // A Flown Mission is history rather than a correction, and a Withdrawn one
  // was already answered, so neither is superseded by what came after it.
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const record of byAge) {
    for (const oldId of record.supersedes ?? []) {
      const old = byId.get(oldId);
      if (!old || old.state === "flown" || old.state === "withdrawn") continue;
      old.state = "superseded";
      old.superseded_by = record.id;
      old.edit = editBehaviour("superseded");
    }
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
 * Did our change to the Ledger survive what is in the store now?
 *
 * The store has no compare-and-swap, so a write can be overwritten by another
 * writer that read before it landed -- and both are told they succeeded. Two
 * Dispatches racing lost a Reservation exactly that way (#152). Only the
 * Cards we changed are checked: anything else in `after` is someone else's
 * business, and a later writer who kept our change is not a conflict.
 */
export function changeSurvived(base: CardLedger, next: CardLedger, after: CardLedger): boolean {
  const cards = new Set([...Object.keys(base.holdings), ...Object.keys(next.holdings)]);
  for (const card of cards) {
    if (same(base.holdings[card], next.holdings[card])) continue;
    if (!same(after.holdings[card], next.holdings[card])) return false;
  }
  return true;
}

/** Same Ledger, as a whole. */
export function sameLedger(a: CardLedger, b: CardLedger): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether a stored record has the shape a Mission must have. A record that
 *  does not is shown as unreadable and left alone, rather than taking the whole
 *  list down or vanishing from it (#152). */
export function isMissionRecord(x: unknown): x is MissionRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  const text = ["id", "site_id", "site", "name", "date", "created_at", "updated_at"];
  return (
    text.every((k) => typeof r[k] === "string") &&
    !!r.spec &&
    typeof r.spec === "object" &&
    (r.dispatched_key == null || typeof r.dispatched_key === "string")
  );
}

// ---------------------------------------------------------------------------
// What a Mission must carry before the store will hold it
// ---------------------------------------------------------------------------

/** The longest a Mission Name may be. It is read on a phone, beside a Site
 *  name and a date, and it exists to tell two Missions apart -- not to hold a
 *  description. */
export const MISSION_NAME_MAX = 40;

/** The longest a Site name may be. It is written into every Mission file for
 *  the Site and read on the Controller's screen; five hundred characters is
 *  a paste accident, not a name. */
export const SITE_NAME_MAX = 60;

/** The one rule for a Mission Name, so the browser refuses exactly what the
 *  server would. Null when the name is usable. */
/** Characters a name may not carry. Control characters make the Mission file
 *  the Controller reads invalid XML (the Site's name is written into it), and
 *  bidirectional overrides make one name display as another. */
export const UNPRINTABLE = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function missionNameProblem(name: unknown): string | null {
  if (typeof name === "string" && UNPRINTABLE.test(name)) {
    return "A Mission Name cannot contain invisible control characters; retype it.";
  }
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
  if (typeof m.site === "string" && UNPRINTABLE.test(m.site)) {
    return "A Site name cannot contain invisible control characters; retype it.";
  }
  if (typeof m.site === "string" && m.site.trim().length > SITE_NAME_MAX) {
    return `A Site name is at most ${SITE_NAME_MAX} characters; shorten it.`;
  }
  if (!isValidSiteId(m.site_id)) {
    return "Choose an existing Site for this Mission. A Site is identified once at onboarding and reused; typing a new name here creates a Site by accident and breaks Capture accumulation.";
  }
  const badName = missionNameProblem(m.name);
  if (badName) return badName;
  if (typeof m.date !== "string" || !m.date.trim()) return "Give this Mission a date.";
  return null;
}
