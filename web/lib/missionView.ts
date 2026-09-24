// What one Mission row says, and in what order.
//
// The screen exists to answer one question -- "is this Mission going to fly
// correctly, and which Card do I open?" (ADR 0021) -- so a row leads with its
// state and the next thing to do, and everything else is subordinate to that.
//
// The reading lives here rather than inside the component for the reason the
// last screen failed: its rules were unreachable from a test, so nothing could
// assert that the words on it came from the glossary or that a mismatch
// actually withheld the affirmation. Everything below is a pure function over
// a `MissionRow`; the component renders what it returns and decides nothing.
//
// The vocabulary is CONTEXT.md's. A word here that is not in the glossary is a
// bug -- there is no "draft" and no "queued".

import type { CardHolding, MissionState } from "./model.ts";
import { SITE_NAME_MAX, UNPRINTABLE, missionNameProblem, sameName, type MissionRow } from "./missionRecords.ts";
import type { HostDrift, HostNotice, LoadedCard } from "./missions.ts";

/** The glossary's own words, capitalised for a heading and nothing more. */
export const STATE_LABEL: Record<MissionState, string> = {
  planned: "Planned",
  dispatched: "Dispatched",
  collected: "Collected",
  loaded: "Loaded",
  flown: "Flown",
  withdrawn: "Withdrawn",
  superseded: "Superseded",
};

/** Metres under a kilometre, kilometres above. One rule, used everywhere a
 *  distance is shown, so two lines of the same row cannot round differently. */
export function metres(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

/** Counting words up to the only counts a battery split ever produces. Past
 *  that the numeral reads better than the word anyway. */
const WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
export function count(n: number): string {
  return WORDS[n] ?? String(n);
}

/** The planner's own figures for a Mission, as `preview()` computes them. The
 *  row carries its Spec, so these are derived where they are read rather than
 *  trusted from a summary file the host also writes into. */
export interface Figures {
  photo_count: number;
  path_length_m: number;
  parts: number;
}

/**
 * Why this Mission is several flights, stated once.
 *
 * `CONTEXT.md` defines a Mission as what the aircraft executes on one flight,
 * so a Site too large for one battery is several Missions and several Cards.
 * The operator is owed the reason, not just the count -- otherwise "Flight 1 of
 * 2" reads as a system decision nobody can check.
 */
export function flightReason(f: Figures | null): string | null {
  if (!f || f.photo_count === 0) return null;
  const figures = `${f.photo_count} points, ${metres(f.path_length_m)}`;
  if (f.parts > 1) {
    return `${figures} — more than one battery, so it flies as ${count(f.parts)}.`;
  }
  return `${figures} — one battery, so it flies as one.`;
}

/** One flight of a Mission: what to do, and the Card it is in. The Card is
 *  where to find it; the flight is what you do (ADR 0022). */
export interface Flight {
  /** 1-based, so "Flight 2 of 3". */
  flight: number;
  flights: number;
  /** The Card's name. Stated, never hedged: reserving at Dispatch is what
   *  lets the screen say which one (ADR 0022). */
  card: string;
  /** The host has actually written this Card, rather than only reserved it. */
  written: boolean;
  /** The point count this Card shows once opened, as the host wrote it. The
   *  list on the Controller is frozen at the Card's creation, but the count
   *  inside an opened Card is the file's own -- the one check the operator can
   *  make that the Card is the one the planner means (#155). */
  points: number | null;
  label: string;
}

function flightLabel(flight: number, flights: number, card: string): string {
  return flights > 1 ? `Flight ${flight} of ${flights} — ${card}` : card;
}

/**
 * The flights of one Mission, in order -- one per Card it holds.
 *
 * Empty before Dispatch, and deliberately: a Card stops being a prediction
 * only when it is reserved (ADR 0022), and the old screen's predicted Cards
 * had three Missions heading for two of them with no contradiction detected.
 * How many flights a Planned Mission will take is carried by `flightReason`,
 * which states it once with the reason, rather than by a column of rows that
 * each say "no Card yet".
 */
export function flights(cards: CardHolding[], loaded: LoadedCard[] = []): Flight[] {
  return cards.map((h) => {
    const wrote = loaded.find((c) => c.card === h.card);
    return {
      flight: h.flight,
      flights: h.flights,
      card: h.card,
      written: h.written_at != null,
      points: typeof wrote?.waypoints === "number" ? wrote.waypoints : null,
      label: flightLabel(h.flight, h.flights, h.card),
    };
  });
}

/**
 * The disagreement between what the planner expected and what the host wrote.
 *
 * The Controller's list cannot be asked: a Card's name, distance and point
 * count there are frozen at its creation, so a 62-waypoint Mission still reads
 * "900m(5)" on it (ADR 0016). Only the count inside an opened Card is live. A
 * grey note is how a difference gets missed, so where this returns a reason
 * the row withholds "open way finder 2" entirely (ADR 0022).
 *
 * Null when they agree, or when there is nothing yet to compare.
 */
export function figuresMismatch(planned: Figures | null, written: LoadedCard[]): string | null {
  if (!planned || written.length === 0) return null;
  const notes: string[] = [];
  // A Card the host reported without a figure is not evidence of a difference,
  // so a partial report is not a mismatch -- it is simply not an answer yet.
  if (written.every((c) => typeof c.waypoints === "number")) {
    const loaded = written.reduce((n, c) => n + (c.waypoints as number), 0);
    if (planned.photo_count > 0 && loaded !== planned.photo_count) {
      notes.push(`${planned.photo_count} points planned, ${loaded} written`);
    }
  }
  if (written.every((c) => typeof c.path_length_m === "number") && planned.path_length_m > 0) {
    const loaded = written.reduce((n, c) => n + (c.path_length_m as number), 0);
    // Distance is two measurements of the same path, so only a real difference
    // counts: 5% is well past rounding and the two geodesic sums.
    if (Math.abs(loaded - planned.path_length_m) / planned.path_length_m > 0.05) {
      notes.push(`${metres(planned.path_length_m)} planned, ${metres(loaded)} written`);
    }
  }
  return notes.length ? notes.join("; ") : null;
}

/** A Card holding a Mission that is no longer current. `stale_cards` comes
 *  from the API; this is only which of them belong to this row's Spec. */
export function staleFor(row: MissionRow, stale: CardHolding[]): CardHolding[] {
  return row.spec_key ? stale.filter((h) => h.spec_key === row.spec_key) : [];
}

// ---------------------------------------------------------------------------
// What the row leads with
// ---------------------------------------------------------------------------

/** The one action a row offers, named after the verb that causes the state. */
export type ActionName = "Dispatch" | "Withdraw" | "Mark Flown" | "Unmark Flown" | "Edit" | "Copy" | "Remove";

/**
 * The headline of a row: the answer, then why, then what to press.
 *
 *  - `tone: "go"`     the Mission is ready and the Card is named;
 *  - `tone: "stop"`   something is wrong and it must not be flown;
 *  - `tone: "wait"`   nothing is wrong and nothing is ready;
 *  - `tone: "quiet"`  history, kept but not acted on.
 */
export interface Headline {
  tone: "go" | "stop" | "wait" | "quiet";
  /** The prominent line. "Open way finder 2" when that is the honest answer. */
  text: string;
  /** The sentence under it, always present: a tone with no reason is a colour. */
  detail: string;
}

export interface RowView {
  state: MissionState;
  stateLabel: string;
  headline: Headline;
  figures: Figures | null;
  reason: string | null;
  flights: Flight[];
  /** Every reason this Mission must not be flown as it stands. */
  blockers: string[];
  /** Both answers about Flown, where they differ (ADR 0021). */
  disagreement: string | null;
  actions: ActionName[];
}

/** What the operator may do to a Mission in this state. The server refuses the
 *  rest and says why; this only keeps a control from being offered for
 *  something that can never work. */
export function actionsFor(row: MissionRow): ActionName[] {
  // Copy is offered on every row: a new Mission that starts from this one,
  // whatever became of it, is never a change to it.
  return [...stateActions(row), "Copy"];
}

function stateActions(row: MissionRow): ActionName[] {
  switch (row.state) {
    case "planned":
      return ["Dispatch", "Edit", "Remove"];
    // Nothing has reached the Controller yet, so it can still be withdrawn and
    // cannot have been flown (#163, #165).
    case "dispatched":
    case "collected":
      return ["Withdraw", "Edit"];
    case "loaded":
      return ["Mark Flown", "Edit"];
    case "flown":
      return ["Unmark Flown", "Edit", "Remove"];
    default:
      // Withdrawn and Superseded are answered. Editing one is the model's
      // native move: it makes a new Mission, and Dispatching that supersedes.
      return ["Edit", "Remove"];
  }
}

/**
 * The whole reading of one row.
 *
 * The order of the tests is the point. A stale Card and a mismatch are checked
 * before readiness, because the failure this screen exists to prevent is an
 * affirmation given while one of them is true.
 */
export function rowView(
  row: MissionRow,
  figures: Figures | null,
  staleCards: CardHolding[] = [],
  hostNotice: HostNotice | null = null,
): RowView {
  const stale = staleFor(row, staleCards);
  const mismatch = figuresMismatch(figures, row.loaded_cards);
  const blockers: string[] = [];
  if (stale.length) {
    blockers.push(
      `${stale.map((h) => h.card).join(", ")} holds a Mission that is no longer current. ` +
        "Do not fly this. The Controller's list cannot tell you — its labels are frozen at the " +
        "Card's creation — so this line is the only warning there is.",
    );
  }
  if (mismatch) {
    blockers.push(
      `What was written to the Card does not match this Mission: ${mismatch}. ` +
        "Do not fly it until that is explained.",
    );
  }
  return {
    state: row.state,
    stateLabel: STATE_LABEL[row.state],
    headline: heldUp(row, hostNotice) ?? headlineFor(row, blockers),
    figures,
    reason: flightReason(figures),
    flights: flights(row.cards, row.loaded_cards),
    blockers,
    disagreement: row.flown_disagreement,
    actions: actionsFor(row),
  };
}

/**
 * The headline of a row the host is refusing to Load, or null.
 *
 * Without it the row went on saying "plug the Controller in and it is written"
 * while the host refused every minute it was plugged in (#162). Only rows that
 * have not reached the Controller can be held up; the refusal already says
 * what to do.
 */
function heldUp(row: MissionRow, notice: HostNotice | null): Headline | null {
  if (!notice || !row.spec_key || !notice.waiting.includes(row.spec_key)) return null;
  if (row.state !== "dispatched" && row.state !== "collected") return null;
  return {
    tone: "stop",
    text: "Not being Loaded",
    detail: `The host refused the Load at ${when(notice.at)}. ${noticeReason(notice)}`,
  };
}

function noticeReason(notice: HostNotice): string {
  const why = notice.reason ?? notice.action ?? "it gave no reason.";
  return why.charAt(0).toUpperCase() + why.slice(1);
}

/** "2026-09-24 09:02 UTC": the host writes UTC, and saying so beats guessing. */
function when(at: string): string {
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(at) ? `${at.slice(0, 10)} ${at.slice(11, 16)} UTC` : at;
}

/** What the host is saying about the Controller as a whole, for above the
 *  list. Empty when it is saying nothing. */
export function hostLines(host: { notice: HostNotice | null; drift: HostDrift | null } | undefined): string[] {
  const lines: string[] = [];
  if (host?.notice) {
    lines.push(`The host refused the last Load, at ${when(host.notice.at)}. ${noticeReason(host.notice)}`);
  }
  for (const d of host?.drift?.cards ?? []) {
    lines.push(
      `${d.card} does not hold what was Loaded into it (found ${d.found ?? "nothing"}). ` +
        `Do not fly ${d.card} until its Mission is Dispatched and Loaded again.`,
    );
  }
  return lines;
}

/** Mission records the store holds but that could not be read -- named, and
 *  left alone, so one hand-edited file neither hides the list nor vanishes. */
export function unreadableLine(keys: string[] | undefined): string | null {
  if (!keys?.length) return null;
  return (
    `${keys.length === 1 ? "One Mission record" : `${keys.length} Mission records`} in the store could not be read ` +
    `and ${keys.length === 1 ? "is" : "are"} not shown: ${keys.join(", ")}. ` +
    `${keys.length === 1 ? "It was" : "They were"} left untouched.`
  );
}

/** What to check inside a Card before flying it (#155). */
function countCheck(fs: Flight[]): string {
  const known = fs.filter((f) => f.points !== null);
  if (known.length === 0) return "Open that Card by name — the Card's own label describes whatever it held before.";
  const what =
    fs.length === 1 && known.length === 1
      ? `Open it and check it shows ${known[0].points} points before you fly.`
      : "Open each Card and check it shows the points listed for it below before you fly.";
  return (
    `${what} A different number means Cards were renamed or remade since they were calibrated: ` +
    "do not fly, and recalibrate them. The count on the Controller's list is not the check — only the one inside."
  );
}

function headlineFor(row: MissionRow, blockers: string[]): Headline {
  if (blockers.length > 0) {
    return {
      tone: "stop",
      text: "Do not fly this Mission",
      detail: blockers[0],
    };
  }
  switch (row.state) {
    case "planned":
      return {
        tone: "wait",
        text: "Dispatch to reserve a Card",
        detail:
          "Nothing has left the planner yet. Dispatching reserves the Cards this Mission needs, " +
          "and is refused here if none is free — while you can still do something about it.",
      };
    case "dispatched":
      return {
        tone: "wait",
        text: "Waiting to be Collected",
        detail:
          `${cardList(row.cards)} reserved. Nothing has reached the Controller yet: the host ` +
          "Collects on its own, and Loads when the Controller is plugged in.",
      };
    case "collected":
      return {
        tone: "wait",
        text: "Collected, not yet on the Controller",
        detail: `The host has it. Plug the Controller in and it is written to ${cardList(row.cards)}.`,
      };
    case "loaded":
      return {
        tone: "go",
        text: `Open ${cardList(row.cards)}`,
        detail: countCheck(flights(row.cards, row.loaded_cards)),
      };
    case "flown":
      return {
        tone: "quiet",
        text: "Flown",
        detail: row.flown_marked
          ? "You marked this Flown. Its Cards are free for the next Mission."
          : "Imagery has arrived for this Site and date. Unmark it if it did not fly.",
      };
    case "withdrawn":
      return {
        tone: "quiet",
        text: "Withdrawn",
        detail: "Cancelled before it reached the Controller, so nothing was written and its Cards came back.",
      };
    default:
      return {
        tone: "quiet",
        text: "Superseded",
        detail:
          "A newer Mission for this Site, date and name replaced it. A Spec is never edited, so " +
          "the change became a new Spec and this one is kept as history.",
      };
  }
}

/** The Cards a Mission holds, named. Never "a Card": the whole reason for
 *  reserving at Dispatch is that the screen can say which one (ADR 0022). */
export function cardList(cards: CardHolding[]): string {
  if (cards.length === 0) return "No Card";
  if (cards.length === 1) return cards[0].card;
  return `${cards.slice(0, -1).map((c) => c.card).join(", ")} and ${cards[cards.length - 1].card}`;
}

// ---------------------------------------------------------------------------
// The list around the rows
// ---------------------------------------------------------------------------

/** One Site, as the planner offers it for choosing.
 *
 *  The Site is chosen, never typed fresh: a Site is the unit a client buys work
 *  about, identified once at onboarding, and typing a name per Mission was
 *  quietly creating a new one every time (ADR 0021). */
export interface SiteChoice {
  site_id: string;
  site: string;
}

/** Every Site already in the store, newest label first, one entry per id. The
 *  rows arrive newest-first, so the first label seen for an id is the current
 *  one -- a Site's name may change and its id may not. */
export function sitesFrom(rows: MissionRow[]): SiteChoice[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.site_id && !seen.has(row.site_id)) seen.set(row.site_id, row.site);
  }
  return [...seen].map(([site_id, site]) => ({ site_id, site })).sort((a, b) => a.site.localeCompare(b.site));
}

/** How long ago the list was read, in the operator's words.
 *
 *  The background poll is five minutes on purpose (a 30-second one once spent
 *  2,880 of the day's transactions), so the screen must always say how old what
 *  it shows is, and always offer to ask again. A timer with no visible age is
 *  how "it says Loaded" becomes an hour-old claim. */
export function checkedAgo(at: number, now: number): string {
  const ms = now - at;
  if (!Number.isFinite(ms) || ms < 0) return "checked just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "checked just now";
  if (min < 60) return `checked ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `checked ${h} h ago`;
  return `checked ${Math.floor(h / 24)} d ago`;
}

/** The stamp on a cached read, shown when the store cannot be reached. This
 *  screen is most needed standing next to the aircraft, possibly with no
 *  signal, so it shows the last read rather than nothing -- clearly dated, so
 *  it can never be mistaken for the live answer. */
export function asOfStamp(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `as of ${hh}:${mm}, not live`;
}

// ---------------------------------------------------------------------------
// Saving what is in the editor
// ---------------------------------------------------------------------------

/** What must hold before Save is worth pressing, in the operator's words.
 *
 *  The server enforces all of this (`missionProblem`, `draftProblem`) and its
 *  copy is the one that counts; this only says so beside the control instead
 *  of after a round trip. Null when the Mission can be saved. */
export function saveProblem(
  spec: { site?: string; site_id?: string; date?: string },
  name: string,
  sites: SiteChoice[] = [],
): string | null {
  if (!spec.site?.trim()) return "Choose the Site this Mission belongs to, or name a new one.";
  if (UNPRINTABLE.test(spec.site)) return "A Site name cannot contain invisible control characters; retype it.";
  if (spec.site.trim().length > SITE_NAME_MAX) return `A Site name is at most ${SITE_NAME_MAX} characters; shorten it.`;
  const twin = siteTwin(sites, spec.site_id, spec.site);
  if (twin) return `There is already a Site called “${twin.site}”. Choose it from the Site list instead.`;
  if (!spec.site_id?.trim()) return "This Site has no identifier yet. Name it, and one is assigned.";
  const badName = missionNameProblem(name);
  if (badName) return badName;
  if (!spec.date?.trim()) return "Give this Mission a date.";
  return null;
}

/** A date as the operator's own calendar has it, YYYY-MM-DD. `toISOString`
 *  would give tomorrow's date every evening west of Greenwich. */
export function localDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * A new Mission that starts as a copy of an existing one.
 *
 * Not an Edit: an Edit changes a Mission (in place, or by a fork that replaces
 * it at Dispatch), and a Loaded one cannot be edited at all. A copy has no id,
 * so saving it creates a Mission and replaces nothing -- the original is left
 * exactly as it is, Flown, Loaded or otherwise. It keeps the Site and the
 * Name, which is how a repeat Capture of a Site reads, and takes today's
 * date, because a copy is a new flight.
 */
export function copyOf(
  row: Pick<MissionRow, "spec" | "site" | "site_id" | "name" | "date">,
  today: string,
): { spec: MissionRow["spec"]; editing: { id: null; name: string; copied_from: string } } {
  return {
    spec: { ...row.spec, site: row.site, site_id: row.site_id, date: today },
    editing: { id: null, name: row.name, copied_from: `${row.name}, ${row.site} ${row.date}` },
  };
}

/** An existing Site with this name that is not this Site, or null. Two Sites
 *  under one name split their Captures between them (#166). */
export function siteTwin(sites: SiteChoice[], site_id: string | undefined, site: string): SiteChoice | null {
  return sites.find((s) => s.site_id !== site_id && sameName(s.site, site)) ?? null;
}

/** What `POST /api/missions` just did, said plainly.
 *
 *  A fork is not a failure and must not read as one: a Spec is never edited, so
 *  a change to a Dispatched Mission is a new Mission, and Dispatching it
 *  supersedes the old one. Saying "saved" alone would hide that (ADR 0021). */
export function describeSave(body: {
  forked_from?: string | null;
  superseded_on_dispatch?: string | null;
  mission?: { name?: string } | null;
}): string {
  const name = body.mission?.name ? `“${body.mission.name}”` : "This Mission";
  if (!body.forked_from) return `${name} is saved. It is Planned until you Dispatch it.`;
  return (
    `${name} is saved as a new Mission, because the one it came from has already been Dispatched — ` +
    "a Spec is never edited. Dispatching this one supersedes that one and releases its Cards."
  );
}

// ---------------------------------------------------------------------------
// The last read, kept for when the store cannot be reached
// ---------------------------------------------------------------------------

/** What `GET /api/missions` answers. Named here because the cache stores it
 *  whole -- a partial cache is a screen that disagrees with itself. */
export interface MissionListRead {
  missions: MissionRow[];
  archived_count: number;
  stale_cards: CardHolding[];
  /** What the host is saying about the Controller as a whole (#162). Absent
   *  from a cache written before it existed. */
  host?: { notice: HostNotice | null; drift: HostDrift | null };
  /** Records in the store that could not be read as Missions, by key. */
  unreadable?: string[];
  now: number;
}

export const CACHE_KEY = "drone-planner.missions-cache";

/** The narrow part of `Storage` this needs, so the rule is reachable from a
 *  test without a browser. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Keep the last good read.
 *
 * This screen is most needed standing next to the aircraft, possibly with no
 * signal. Showing nothing there is worse than showing the last answer, as long
 * as the last answer can never be mistaken for the live one -- which is what
 * `read_at` and `asOfStamp` are for.
 */
export function cacheRead(store: KeyValue, read: MissionListRead, at: number): void {
  try {
    store.setItem(CACHE_KEY, JSON.stringify({ read_at: at, read }));
  } catch {
    // Private mode, a full quota, or storage switched off. The live read still
    // works; only the offline fallback is lost, and silently is correct here.
  }
}

/** The last good read and when it was taken, or null when there is none or it
 *  cannot be trusted. A cache that does not parse is no cache: it must never
 *  become a half-populated list that reads as the truth. */
export function cachedRead(store: KeyValue): { read_at: number; read: MissionListRead } | null {
  try {
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { read_at?: unknown; read?: { missions?: unknown } };
    if (typeof parsed?.read_at !== "number" || !Array.isArray(parsed.read?.missions)) return null;
    return parsed as { read_at: number; read: MissionListRead };
  } catch {
    return null;
  }
}
