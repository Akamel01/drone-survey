import type { MissionSpec } from "./spec";
import { parseSpecKey, stampToIso } from "./keys.ts";
// Server-side mission records. Drafts live under specs/_drafts/<id>.json in
// the same bucket as Specs; Dispatched Specs stay immutable under specs/ and
// are only ever superseded, never edited or deleted (ADR 0016).

// Store keys live in ./keys — one home for the layout, imported here and by
// every route, so a producer and a consumer cannot drift apart.

export interface DraftRecord {
  id: string;
  created_at: string;
  updated_at: string;
  dispatched_key: string | null;
  spec: MissionSpec;
  /** Stamp of how many parts this draft will consume when dispatched. */
  parts?: number;
}

export interface LoadedCard {
  card: string;
  name: string;
  // Optional: real host cards carry a measured waypoint count; predicted cards
  // do not yet have a value.
  waypoints?: number;
  /** Flight distance of the part the host wrote into this card, in metres. */
  path_length_m?: number;
}

// The calibrated WAYFINDER pool (scripts/mission/wayfinder_slots.json). The
// loader refuses a queue that needs more cards than this rather than
// truncating it, so a prediction past the pool is a prediction that nothing
// Loads at all (#118).
export const CARD_POOL = ["WAYFINDER 1", "WAYFINDER 2", "WAYFINDER 3", "WAYFINDER 4", "WAYFINDER 5"];

/** What the host is expected to do with a Mission that has not Loaded yet.
 *  A guess, never a fact: it changes the moment another Mission is Dispatched
 *  ahead of this one, because cards are handed out over the whole queue. */
export interface CardPrediction {
  /** Card names, one per part, in part order. Empty when nothing will Load. */
  cards: string[];
  parts: number;
  /** Planner-side figures for the whole Mission, across all its parts. */
  waypoints?: number;
  path_length_m?: number;
  /** The queue needs more cards than the pool holds: the host refuses it whole. */
  overflow: boolean;
}

export interface ManifestEntry {
  collected_at?: string;
  loaded_at?: string;
  parts?: number;
  cards?: LoadedCard[];
}

export type Manifest = Record<string, ManifestEntry>;

// Small action helpers used by the UI to decide which actions to present in the
// mission status console (M-57 UI). These are lightweight, testable predicates
// that rely only on the in-memory StatusRow shape.
export function isDraftDeletable(row: StatusRow): boolean {
  // Drafts are deletable only if they have not been dispatched yet.
  // We keep the check minimal here and rely on server-side guards as well.
  return row.kind === "draft" && row.state === "draft";
}

export function isSpecWithdrawable(row: StatusRow): boolean {
  // Only spec rows that are still in the host queue can be withdrawn.
  return row.kind === "spec" && (row.state === "dispatched" || row.state === "queued");
}

export function isWithdrawn(row: StatusRow): boolean {
  return row.kind === "spec" && row.state === "withdrawn";
}

// M-58: superseded state within joinStatus. In each Site/Date group,
// among spec rows that are waiting (not yet collected), all older ones are
// superseded by the newest waiting row. Drafts and non-spec rows are unaffected.
// Extend MissionState to accommodate an explicit withdrawn overlay (M-57-API).
export type MissionState = "draft" | "dispatched" | "queued" | "collected" | "loaded" | "superseded" | "withdrawn";

export interface StatusRow {
  kind: "draft" | "spec";
  /** Draft id or full Spec key. */
  id: string;
  site: string;
  date: string;
  state: MissionState;
  /** Lexical dispatch stamp for Specs; updated_at for drafts. */
  stamp: string;
  dispatched_key: string | null;
  collected_at: string | null;
  loaded_at: string | null;
  cards: LoadedCard[];
  /** Optional per-row parts hint from manifest (host-provided). */
  parts?: number;
  /** 1-based position among missions still waiting on the host, if waiting. */
  queue: number | null;
  /** The draft body, on draft rows only — the tab Dispatches and edits from it. */
  spec?: MissionSpec;
  /** Optional per-spec metrics if available from summaries.json. */
  metrics?: SpecSummary;
  /** ISO instant this row's information is as of: draft update, dispatch stamp,
   *  collect stamp, or load stamp, whichever is newest. */
  updated: string;
  /** Indicates that the assigned card set overflows the 5-card pool. */
  overflow?: boolean;
  /** Predicted card, point count and distance while this Mission waits to
   *  Load. Absent once the host has reported, and absent when the parts count
   *  of something ahead in the queue is unknown. */
  prediction?: CardPrediction;
  /** Server-side computed human-friendly age from the row's timestamp. */
  age?: string;
  /** True when a waiting mission has sat longer than the 15-minute nudge. */
  stale?: boolean;
}

// Lightweight per-spec metrics summary shape stored in summaries.json, to be
// consumed by the UI without re-computing on polls.
export interface SpecSummary {
  photo_count?: number;
  path_length_m?: number;
  /** How many parts the writer will split this Mission into — one card each. */
  parts?: number;
  /** Why this Spec has no figures, when it has none. A Spec written before the
   *  current schema carries no gimbal pitch, margin passes, speed or battery,
   *  so its point count and distance cannot be derived without inventing the
   *  inputs. Recording the reason keeps a blank row from reading as a fault. */
  unavailable?: string;
}

/** Pure join of drafts + Dispatched keys + host manifest into status rows. */
export function joinStatus(
  drafts: DraftRecord[],
  specKeys: string[],
  manifest: Manifest,
  withdrawn: Record<string, unknown> = {},
  summaries: Record<string, SpecSummary> = {},
): StatusRow[] {
  const rows: StatusRow[] = drafts.map((d) => ({
    kind: "draft" as const,
    id: d.id,
    site: d.spec.site ?? "Untitled",
    date: d.spec.date ?? "",
    state: (d.dispatched_key ? "dispatched" : "draft") as MissionState,
    stamp: d.updated_at,
    dispatched_key: d.dispatched_key,
    collected_at: null,
    loaded_at: null,
    cards: [],
    queue: null,
    spec: d.spec,
    updated: d.updated_at,
  }));

  const specs = specKeys
    .map((key) => ({ key, parsed: parseSpecKey(key) }))
    .filter((s) => s.parsed !== null)
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  const waiting = specs.filter(({ key }) => !manifest[key]?.collected_at);
  for (const { key, parsed } of specs) {
    const entry = manifest[key] ?? {};
    // The head of the waiting line is what the host takes next: Dispatched.
    // Everything behind it is Queued. Collected/Loaded come from the manifest.
    const waitIndex = waiting.findIndex((w) => w.key === key);
    rows.push({
      kind: "spec",
      id: key,
      site: parsed!.site,
      date: parsed!.date,
      state:
        entry.loaded_at ? "loaded" : entry.collected_at ? "collected" : waitIndex <= 0 ? "dispatched" : "queued",
      stamp: parsed!.stamp,
      dispatched_key: key,
      collected_at: entry.collected_at ?? null,
      loaded_at: entry.loaded_at ?? null,
      cards: entry.cards ?? [],
      // Expose how many parts this spec will consume when dispatched. This comes
      // from the host manifest as part of the spec's materialisation.
      parts: (entry.parts ?? 0) as number,
      queue: waitIndex < 0 ? null : waitIndex + 1,
      updated: entry.loaded_at ?? entry.collected_at ?? stampToIso(parsed!.stamp),
      // A partial or hand-edited summary must not surface a half number: both
      // fields must be finite, else the row shows nothing. A summary that
      // states instead why it has no figures is carried through as that
      // reason, so the row can say it rather than leaving a silent gap.
      metrics: (() => {
        const sum = summaries?.[key];
        if (!sum) return undefined;
        if (Number.isFinite(sum.photo_count) && Number.isFinite(sum.path_length_m)) {
          return {
            photo_count: sum.photo_count,
            path_length_m: sum.path_length_m,
            // Carried through because the prediction is derived from it and
            // the row is what the API hands the browser.
            ...(typeof sum.parts === "number" ? { parts: sum.parts } : {}),
          };
        }
        return typeof sum.unavailable === "string" ? { unavailable: sum.unavailable } : undefined;
      })(),
    });
  }

  // Canonical superseded handling (M-58): within each Site/Date group, among spec
  // rows that are waiting (not yet collected), mark all but the newest by
  // stamp as superseded. This preserves the newest actionable row and hides older
  // superseded rows from the host queue view.
  // 
  // New behavior (M-58 repair): determine the newest spec per group across ALL
  // spec rows, not just the waiting ones. This ensures that older waiting rows are
  // superseded by the truly newest spec in the group, even if that newest spec has
  // progressed to collected/loaded state.
  const waitingRows = rows.filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued"));
  const newestForGroup: Map<string, string> = new Map(); // group -> newest id across all spec rows
  const allSpecRows = rows.filter((r) => r.kind === "spec");
  for (const s of allSpecRows) {
    const group = `${s.site}::${s.date}`;
    const current = newestForGroup.get(group);
    if (!current) {
      newestForGroup.set(group, s.id);
    } else {
      const currentRow = rows.find((rr) => rr.id === current && rr.kind === "spec");
      if (currentRow && s.stamp > currentRow.stamp) {
        newestForGroup.set(group, s.id);
      }
    }
  }
  // Re-assign waiting rows: newest per group (by ALL spec rows) becomes dispatched
  // with queue=1; older waiting become superseded. This also prepares for global
  // renumbering in the next step.
  for (const w of waitingRows) {
    const group = `${w.site}::${w.date}`;
    const newestId = newestForGroup.get(group);
    if (newestId && w.id === newestId) {
      w.state = ("dispatched" as MissionState);
      w.queue = 1;
    } else if (newestId) {
      w.state = ("superseded" as MissionState);
      w.queue = null;
    }
  }

  // Withdrawn overlay: apply after superseded logic. Precedence per Contract-2:
  // loaded > collected > withdrawn > superseded. Keys listed in `withdrawn`
  // override superseded/queued/dispatched only; collected/loaded rows stay
  // (withdraw of those is refused server-side; a stale marker must not resurrect).
  if (withdrawn && typeof withdrawn === "object") {
    for (const r of rows) {
      if (r.kind === "spec" && Object.prototype.hasOwnProperty.call(withdrawn, r.id)) {
        if (r.state === "collected" || r.state === "loaded") continue;
        r.state = ("withdrawn" as MissionState);
        r.queue = null;
      }
    }
  }
  // Global renumbering: renumber surviving heads (currently the ones with queue=1)
  // oldest-first across all groups. Find all active heads and assign 1..N by stamp.
  const activeHeads = rows.filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued") && r.queue !== null);
  const sortedHeads = activeHeads.sort((a, b) => (a.stamp < b.stamp ? -1 : 1));
  sortedHeads.forEach((r, idx) => {
    r.queue = idx + 1;
  });
  // Cards are supplied by host manifest; do not fabricate WAYFINDER slots here.
  // Just ensure cards array exists for each waiting row to keep UI stable.
  const waitingOrdered = rows
    .filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued") && r.queue !== null)
    .sort((a, b) => (a.queue! - b.queue!));
  waitingOrdered.forEach((w) => {
    if (!w.cards) w.cards = [];
  });
  predictCards(rows, summaries);
  // Newest-first display order remains defined by stamp as before.
  return rows.sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
}

/** Predict which cards the host will use for every Mission still waiting to
 *  Load, following `load.py`'s own rule: one pass over the whole queue in key
 *  order (Site, then date, then Dispatch stamp — `unloaded_queue()` sorts by
 *  path, not by time), parts taken sequentially from the card pool, and the
 *  whole queue refused rather than truncated when it does not fit.
 *
 *  Mutates the rows, and only the waiting ones: a Loaded row carries the
 *  host's measurement instead, which is the only figure that is a fact. */
export function predictCards(rows: StatusRow[], summaries: Record<string, SpecSummary> = {}): void {
  const queue = rows
    .filter(
      (r) =>
        r.kind === "spec" &&
        (r.state === "dispatched" || r.state === "queued" || r.state === "collected"),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const partsOf = (r: StatusRow): number | null => {
    const n = summaries[r.id]?.parts;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const known = queue.map(partsOf);
  const total = known.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const overfull = known.every((n) => n !== null) && total > CARD_POOL.length;
  let next = 0;
  for (const [i, row] of queue.entries()) {
    const parts = known[i];
    // A Mission whose split is unknown moves the cards for everything behind
    // it by an unknown amount, so nothing behind it is predictable either.
    if (parts === null) break;
    const past = overfull || next + parts > CARD_POOL.length;
    row.prediction = {
      cards: past ? [] : CARD_POOL.slice(next, next + parts),
      parts,
      waypoints: summaries[row.id]?.photo_count,
      path_length_m: summaries[row.id]?.path_length_m,
      overflow: past,
    };
    row.overflow = past;
    next += parts;
  }
}

/** The disagreement between what the planner expected and what the host wrote,
 *  which is the whole point of showing both: a Load that put a different
 *  Mission in the card cannot be caught on the Controller, whose own labels
 *  are frozen at Placeholder creation (ADR 0016). Null when they agree, or
 *  when there is nothing to compare. */
export function cardMismatch(row: StatusRow): string | null {
  if (!row.metrics || row.cards.length === 0) return null;
  const measuredPoints = row.cards.reduce<number>((n, c) => n + (c.waypoints ?? 0), 0);
  const measuredDist = row.cards.reduce<number>((n, c) => n + (c.path_length_m ?? 0), 0);
  const notes: string[] = [];
  // A Spec with no planned figures at all has nothing to disagree with, so it
  // cannot be a mismatch -- only an unknown, which the row states separately.
  const plannedPoints = row.metrics.photo_count;
  const plannedDist = row.metrics.path_length_m;
  if (
    plannedPoints != null &&
    row.cards.every((c) => typeof c.waypoints === "number") &&
    measuredPoints !== plannedPoints
  ) {
    notes.push(`${plannedPoints} points planned, ${measuredPoints} loaded`);
  }
  // Distance is two measurements of the same path, so only a real difference
  // counts: 5% is well past rounding and the two geodesic sums.
  if (
    plannedDist != null &&
    row.cards.every((c) => typeof c.path_length_m === "number") &&
    plannedDist > 0 &&
    Math.abs(measuredDist - plannedDist) / plannedDist > 0.05
  ) {
    notes.push(`${Math.round(plannedDist)} m planned, ${Math.round(measuredDist)} m loaded`);
  }
  return notes.length ? notes.join("; ") : null;
}

// A waiting mission the host has not picked up in 15 minutes is worth a nudge:
// cron runs every minute, so anything older means the Controller is unplugged
// or the host is quiet — both are the operator's call, hence a hint, not an alarm.
const WAITING_WARN_MS = 15 * 60 * 1000;

/** Server-side derivation of status rows: the clock that decides age and the
 *  staleness nudge is the server's, so two browsers cannot disagree. */
export function deriveStatusRows(
  drafts: DraftRecord[],
  specKeys: string[],
  manifest: Manifest,
  withdrawn: Record<string, unknown> = {},
  summaries: Record<string, SpecSummary> = {},
  clock?: number,
): StatusRow[] {
  const rows = joinStatus(drafts, specKeys, manifest, withdrawn, summaries);
  const now = typeof clock === "number" ? clock : Date.now();
  const toAge = (iso: string) => {
    const ms = now - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return "just now";
    const min = Math.floor(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const h = Math.floor(min / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.floor(h / 24)} d ago`;
  };
  rows.forEach((r) => {
    const ms = now - Date.parse(r.updated);
    r.age = toAge(r.updated);
    // The 15-minute nudge is a decision, not a label, so the server makes it.
    r.stale = Number.isFinite(ms) && ms > WAITING_WARN_MS;
  });
  return rows;
}
