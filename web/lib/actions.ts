// One operator action at a time, and its outcome reported next to the control
// that started it. The status view polls rarely on purpose (a poll costs a
// storage transaction), so an action's own result is the only feedback the
// operator gets until the next poll — it has to be right and it has to be
// where they are looking.

/** Which row a control belongs to; "" for the controls above the list. */
export type ActionTarget = string;

export interface RunningAction {
  label: string;
  on: ActionTarget;
}

export interface ActionNotice {
  on: ActionTarget;
  text: string;
  failed: boolean;
}

export interface ActionState {
  running: RunningAction | null;
  notice: ActionNotice | null;
}

export const IDLE: ActionState = { running: null, notice: null };

/** What came back from an endpoint, or why nothing did. */
export type ActionResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> }
  | { ok: false; threw: string };

/** A press. A second press while one is in flight changes nothing. */
export function beginAction(state: ActionState, label: string, on: ActionTarget): ActionState {
  if (state.running) return state;
  return { running: { label, on }, notice: null };
}

/** The result lands on the row that started it, whether it worked or not. */
export function endAction(
  state: ActionState,
  label: string,
  on: ActionTarget,
  result: ActionResult,
): ActionState {
  const failed = !result.ok;
  return {
    running: state.running && state.running.label === label && state.running.on === on ? null : state.running,
    notice: { on, text: describeResult(label, result), failed },
  };
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
  // Named after what the endpoint actually reports, in the glossary's words.
  // There is no "draft" and no "queued" (ADR 0021).
  if (Array.isArray(body.cards) && body.cards.length > 0) {
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

export function noteMissionsChanged(): void {
  try {
    localStorage.setItem(MISSIONS_CHANGED_KEY, String(Date.now()));
  } catch {
    // Private mode or a full quota: the other window still has its poll.
  }
}
