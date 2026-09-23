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
 *  The figures matter more than they look: ADR 0016 measured that a Card's own
 *  displayed name, distance and point count are frozen at its creation, so the
 *  Controller cannot confirm which Mission is in it. Comparing these against
 *  the planner's own figures is the only detector there is. */
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
