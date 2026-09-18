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
  metrics?: { photo_count: number; path_length_m: number };
  /** ISO instant this row's information is as of: draft update, dispatch stamp,
   *  collect stamp, or load stamp, whichever is newest. */
  updated: string;
  /** Indicates that the assigned card set overflows the 5-card pool. */
  overflow?: boolean;
}

// Lightweight per-spec metrics summary shape stored in summaries.json, to be
// consumed by the UI without re-computing on polls.
export interface SpecSummary {
  photo_count: number;
  path_length_m: number;
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
      // fields must be finite, else the row shows nothing.
      metrics:
        summaries?.[key] &&
        Number.isFinite(summaries[key].photo_count) &&
        Number.isFinite(summaries[key].path_length_m)
          ? { photo_count: summaries[key].photo_count, path_length_m: summaries[key].path_length_m }
          : undefined,
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
  // After queue resorting, compute the expected WAYFINDER cards for waiting rows
  // based on the queue order and per-spec-part counts. This mirrors the host's
  // sequential assignment and allows the UI to reflect the intended cards for
  // each waiting mission.
  const CARD_POOL = 5;
  // Build a list of waiting spec rows in queue order
  const waitingOrdered = rows
    .filter((r) => r.kind === "spec" && (r.state === "dispatched" || r.state === "queued") && r.queue !== null)
    .sort((a, b) => (a.queue! - b.queue!));
  let nextCard = 1; // 1-based index into the card pool
  for (const w of waitingOrdered) {
    // Ensure the cards array exists
    w.cards = [];
    const parts = (w.parts ?? 0) || 0;
    if (parts > 0 && nextCard <= CARD_POOL) {
      const canTake = Math.min(parts, CARD_POOL - (nextCard - 1));
      for (let i = 0; i < canTake; i++) {
        const slot = nextCard + i;
        w.cards.push({ card: `WAYFINDER ${slot}`, name: `Card ${slot}` });
      }
      if (canTake < parts) {
        w.overflow = true;
      }
      nextCard += canTake;
    } else if (parts === 0) {
      // Unknown-parts: assign a single unassigned slot if possible
      if (nextCard <= CARD_POOL) {
        w.cards.push({ card: `UNASSIGNED`, name: `Unassigned` });
        nextCard += 1;
      } else {
        w.overflow = true;
      }
    } else {
      // No more cards left in pool
      w.overflow = true;
    }
  }
  // Fallback: if a waiting row somehow has no cards allocated, mark as unassigned
  for (const w of waitingOrdered) {
    if (!w.cards || w.cards.length === 0) {
      w.cards = [{ card: "UNASSIGNED", name: "Unassigned" }];
    }
  }
  // Extra guard: ensure the very first waiting row has at least one card for UI
  if (waitingOrdered.length > 0) {
    const first = waitingOrdered[0];
    if (!first.cards || first.cards.length === 0) {
      first.cards = [{ card: "WAYFINDER 1", name: "Card 1" }];
    }
  }
  // Newest-first display order remains defined by stamp as before.
  return rows.sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
}
