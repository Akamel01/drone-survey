// One operator action at a time, its outcome reported through the page-owned
// Notice. The status view polls rarely on purpose (a poll costs a storage
// transaction), so an action's own result is the feedback the operator gets
// until the next poll — it has to be right.

/** Which row a control belongs to; "" for the controls above the list. */
export type ActionTarget = string;

export interface RunningAction {
  label: string;
  on: ActionTarget;
}

export interface ActionState {
  running: RunningAction | null;
}

export const IDLE: ActionState = { running: null };

/** What came back from an endpoint, or why nothing did. */
export type ActionResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> }
  | { ok: false; threw: string };

/** A press. A second press while one is in flight changes nothing. */
export function beginAction(state: ActionState, label: string, on: ActionTarget): ActionState {
  if (state.running) return state;
  return { running: { label, on } };
}

export function isRunning(state: ActionState, label: string, on: ActionTarget): boolean {
  return state.running?.label === label && state.running?.on === on;
}

export function describeResult(label: string, result: ActionResult): string {
  if (!result.ok) {
    if ("threw" in result) return `${label} failed: ${result.threw}`;
    const why = result.body.error;
    return `${label} failed: ${typeof why === "string" && why ? why : result.status}`;
  }
  const { body } = result;
  // Named after the action pressed, then what the endpoint reports, in the
  // glossary's words. There is no "draft" and no "queued" (ADR 0021). Keying on
  // the body's shape alone made Mark Flown -- which also returns `cards` --
  // announce "Dispatched" (#164).
  if (label === "Mark Flown") return "Marked Flown. Its Card is free for the next Mission.";
  if (label === "Unmark Flown") return "Unmarked. It holds its Card again.";
  if (label === "Dispatch" && Array.isArray(body.cards) && body.cards.length > 0) {
    return `Dispatched. ${body.cards.join(", ")} ${body.cards.length === 1 ? "is" : "are"} reserved for it.`;
  }
  if (Array.isArray(body.cards_released)) {
    return body.cards_released.length
      ? `Withdrawn. ${body.cards_released.join(", ")} released.`
      : "Withdrawn. It held no Card.";
  }
  if (typeof body.archived === "string") {
    return "Removed from the list. It is archived, not deleted — nothing is lost.";
  }
  if (typeof body.key === "string") return `${label}: ${body.key}`;
  return `${label}: done`;
}

// A write from one browser window has to reach the status view open in
// another; `storage` fires only in the other windows, which is exactly the
// ones that did not just refresh themselves. No extra polling, no extra
// transaction unless something actually changed.
export const MISSIONS_CHANGED_KEY = "drone-planner.missions-changed";

/** This browser's storage, or null where even touching it throws -- a browser
 *  set to block site data throws on the name `localStorage` itself, before
 *  any call can be wrapped, and took the Mission list down with it (#152). */
export function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s?.getItem("");
    return s ?? null;
  } catch {
    return null;
  }
}

export function noteMissionsChanged(): void {
  try {
    localStorage.setItem(MISSIONS_CHANGED_KEY, String(Date.now()));
  } catch {
    // Private mode or a full quota: the other window still has its poll.
  }
}
