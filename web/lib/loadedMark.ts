// Telling the store a Mission was Loaded, from the aircraft (PWA-4, #318).
//
// At the aircraft the phone is on the board's hotspot and may have no way to
// the planner's server. The board reports the Load to the store itself when it
// can; when it cannot, the phone does, here. A report that cannot be sent waits
// in the offline outbox (PWA-3, lib/outbox.ts) with the operator's other
// offline edits, and goes out on the same triggers, so what the operator saw
// (the Cards and their points) is not lost with the signal. Repeats are
// harmless: the store accepts a second report of the same Load.

import { safeStorage } from "./actions.ts";
import type { BoardCard } from "./board.ts";
import { markLoaded } from "./missionClient.ts";
import { enqueueLoaded, noSignal } from "./outbox.ts";

/** "sent": the store has it. "waiting": kept in the outbox, sent when the
 *  store can be reached. "refused": the store will not take it, or it could not
 *  be kept. */
export type MarkResult = "sent" | "refused" | "waiting";

export async function reportLoaded(id: string, cards: BoardCard[]): Promise<MarkResult> {
  const wait = () => {
    const ls = safeStorage();
    return ls && enqueueLoaded(ls, id, cards) ? "waiting" : "refused";
  };
  if (noSignal()) return wait();
  const done = await markLoaded(id, cards);
  if (done.ok) return "sent";
  // No route reached, the store failing, or a passphrase still to type: the
  // report can mend. Any other answer is the store saying no.
  return done.status === undefined || done.status >= 500 || done.status === 401 ? wait() : "refused";
}
