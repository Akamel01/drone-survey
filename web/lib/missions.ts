// What the host reports about the Specs it has Collected and Loaded.
//
// This file used to join drafts, Spec keys and this manifest into rows at the
// rendering layer, which is what produced a row per draft AND a row per Spec:
// one Mission appeared twice, under two names, in two states, with two sets of
// buttons (ADR 0021). That join is gone. A Mission's state is derived once, in
// `missionRecords.ts`, from the store -- so what remains here is only the
// shape of what the host writes, read by that derivation and by nothing else.
//
// Store keys live in ./keys — one home for the layout, imported here and by
// every route, so a producer and a consumer cannot drift apart.

/** One Card as the host reported writing it, with what it measured writing it.
 *
 *  The figures matter more than they look. A Card's name, distance and point
 *  count on the Controller's list are frozen at its creation, but the point
 *  count shown inside a Card, once opened, is the file's own -- so `waypoints`
 *  is the number the operator checks before flying (#155). */
export interface LoadedCard {
  card: string;
  name: string;
  waypoints?: number;
  /** Flight distance of the Mission the host wrote into this Card, in metres. */
  path_length_m?: number;
}

/** What the host says it has done with one Dispatched Spec. Written by the
 *  host, never by the planner. */
export interface ManifestEntry {
  collected_at?: string;
  loaded_at?: string;
  parts?: number;
  cards?: LoadedCard[];
  /** When imagery for this Mission's Site and date arrived. Evidence the
   *  system may infer Flown from; the operator's own mark is what decides it,
   *  and where the two disagree both are shown (ADR 0021). */
  imagery_at?: string;
}

export type Manifest = Record<string, ManifestEntry>;

/** A Load the host refused, as it wrote it under `_notice`. Every refusal
 *  already states what to do next (ADR 0018); `action` is the older overflow
 *  shape, `reason` the Ledger one. Retired by the next successful Load. */
export interface HostNotice {
  type: string;
  at: string;
  /** The Spec keys that were waiting when it refused. */
  waiting: string[];
  reason?: string;
  action?: string;
}

/** Cards whose contents disagree with the Ledger, as the host found them. */
export interface HostDrift {
  at: string;
  cards: { card: string; expected: string; found: string | null }[];
}

/** What the host is saying about the Controller as a whole, rather than about
 *  one Spec. The manifest carries both kinds in one file, under `_` keys. */
export function hostReport(manifest: Manifest): { notice: HostNotice | null; drift: HostDrift | null } {
  const raw = manifest as Record<string, unknown>;
  const notice = raw._notice as HostNotice | undefined;
  const drift = raw._drift as HostDrift | undefined;
  return {
    notice: notice && typeof notice.at === "string" && Array.isArray(notice.waiting) ? notice : null,
    drift: drift && Array.isArray(drift.cards) && drift.cards.length > 0 ? drift : null,
  };
}

/** Per-Spec figures the Dispatch route records, so the host and anything else
 *  reading the store has them without re-deriving the geometry. */
export interface SpecSummary {
  photo_count?: number;
  path_length_m?: number;
  /** How many Missions the writer will split this Spec into — one Card each. */
  parts?: number;
  /** Why this Spec has no figures, when it has none. A Spec written before the
   *  current schema carries no gimbal pitch, margin passes, speed or battery,
   *  so its point count and distance cannot be derived without inventing the
   *  inputs. Recording the reason keeps a blank from reading as a fault. */
  unavailable?: string;
}
