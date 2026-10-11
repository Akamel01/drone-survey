// Telling the store a Mission was Loaded, from the aircraft (PWA-4, #318).
//
// At the aircraft the phone is on the board's hotspot and may have no way to
// the planner's server. The board reports the Load to the store itself when it
// can; when it cannot, the phone does. A report that cannot be sent waits in
// the offline outbox (PWA-3, lib/outbox.ts) with the operator's other offline
// edits, and goes out on the same triggers, so what the operator saw (the Cards
// and their points) is not lost with the signal. Repeats are harmless: the store
// accepts a second report of the same Load.
//
// The report now waits behind this Mission's own earlier changes too, like
// every other verb, so the decision and this wording live in
// `missionRepository` (#348). This stays as the entry point #318's tests and
// the Load sheet call.

import { createRepository, type MarkResult } from "./missionRepository.ts";
import type { BoardCard } from "./board.ts";

export type { MarkResult };

export function reportLoaded(id: string, cards: BoardCard[]): Promise<MarkResult> {
  return createRepository().reportLoaded(id, cards);
}
