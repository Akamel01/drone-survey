// Telling the store a Mission was Loaded, once the phone can reach it (PWA-4, #318).
//
// At the aircraft the phone is on the board's hotspot and may have no way to
// the planner's server. The board reports the Load to the store itself when it
// can; when it cannot, the phone does, here. A report that cannot be sent is
// kept in this browser and sent when the connection returns, so what the
// operator saw (the Cards and their points) is not lost with the signal.
// Repeats are harmless: the store accepts a second report of the same Load.

import { noteMissionsChanged, safeStorage } from "./actions.ts";
import type { BoardCard } from "./board.ts";
import { readPassphrase } from "./passphrase.ts";

export const PENDING_KEY = "drone-planner.pending-loaded";

interface Pending {
  id: string;
  cards: BoardCard[];
}

function pending(): Pending[] {
  try {
    const list: unknown = JSON.parse(safeStorage()?.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(list) ? (list as Pending[]) : [];
  } catch {
    return [];
  }
}

function keep(list: Pending[]): void {
  try {
    safeStorage()?.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // Storage full or off: the report is lost if this visit ends first.
  }
}

/** "sent": the store has it. "refused": the store will never take it (the
 *  Mission was withdrawn, say), so it is dropped. "waiting": no connection or no
 *  passphrase yet; kept for `sendPending`. */
export type MarkResult = "sent" | "refused" | "waiting";

async function send(p: Pending): Promise<MarkResult> {
  try {
    const res = await globalThis.fetch("/api/missions/loaded", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wayfinder-key": readPassphrase() ?? "" },
      body: JSON.stringify({
        id: p.id,
        cards: p.cards.map((c) => ({ card: c.card, name: c.mission, waypoints: c.waypoints })),
      }),
    });
    if (res.ok) return "sent";
    // 401 and 5xx can mend (a passphrase typed, the store back); the rest cannot.
    return res.status === 401 || res.status >= 500 ? "waiting" : "refused";
  } catch {
    return "waiting";
  }
}

/** Report one Load: now if the store answers, else kept for later. */
export async function reportLoaded(id: string, cards: BoardCard[]): Promise<MarkResult> {
  const result = await send({ id, cards });
  if (result === "sent") noteMissionsChanged();
  if (result === "waiting") keep([...pending().filter((p) => p.id !== id), { id, cards }]);
  return result;
}

/** Send what was kept. Returns how many reached the store. */
export async function sendPending(): Promise<number> {
  const kept = pending();
  const left: Pending[] = [];
  let sent = 0;
  for (const p of kept) {
    const result = await send(p);
    if (result === "sent") sent += 1;
    else if (result === "waiting") left.push(p);
  }
  if (kept.length) keep(left);
  if (sent) noteMissionsChanged();
  return sent;
}
