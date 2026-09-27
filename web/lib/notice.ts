// The Notice's state and timing, as pure functions.
//
// The component (Notice.tsx) owns the DOM — timers, focus, key handling — and
// these are the rules it follows, reachable from a test the way the row
// reading in missionView.ts is: everything below is a pure function, the
// component renders what it returns and decides nothing about timing.

// Success timing (spec §9.1, grilling §3): every notice arrives compact; a
// success rests there until 4s, then leaves over 250ms `--ease-in` and
// dismisses. A failure auto-expands at 200ms and carries no timers.
export const ARRIVAL_MS = 200;
export const COLLAPSE_MS = 4000;
export const LEAVE_MS = 250;

/** Elapsed-since-payload at which a success dismisses itself. */
export const DISMISS_MS = COLLAPSE_MS + LEAVE_MS;

/** The ellipsis the compact pill appends to its stripped title. */
export const COMPACT_TITLE = "…";

/** Expanded shows mission + title + body; compact the short title (and is the
 *  arrival state); leaving is the short ease-in dissolve before dismiss. */
export type NoticePhase = "expanded" | "compact" | "leaving";

/** A new payload always arrives compact — which is also what a superseding
 *  payload (parent remounts per key) and a re-announced identical failure do.
 *  Arrival itself is a mount-only CSS animation, not a phase. */
export function initialPhase(): NoticePhase {
  return "compact";
}

/** Which phase a notice shown `elapsedMs` ago is in, on the timer path only
 *  (taps and dismissals are `togglePhase`'s and the component's business).
 *  A failure auto-expands at `ARRIVAL_MS` and then stays; a success leaves at
 *  `COLLAPSE_MS`. */
export function phaseAt(elapsedMs: number, failed: boolean): NoticePhase {
  if (failed) return elapsedMs < ARRIVAL_MS ? "compact" : "expanded";
  return elapsedMs < COLLAPSE_MS ? "compact" : "leaving";
}

/** When a success dismisses itself, or null: failures stay until dismissed. */
export function dismissAt(failed: boolean): number | null {
  return failed ? null : DISMISS_MS;
}

/** Tap toggles compact/expanded. A leaving notice stays leaving: the timers
 *  own the leave, a tap cannot recall it. */
export function togglePhase(phase: NoticePhase): NoticePhase {
  if (phase === "expanded") return "compact";
  if (phase === "compact") return "expanded";
  return "leaving";
}

// ---------------------------------------------------------------------------
// Tone and role per outcome
// ---------------------------------------------------------------------------

/** Screen-reader contract: success announces politely, failure assertively. */
export function noticeRole(failed: boolean): "status" | "alert" {
  return failed ? "alert" : "status";
}

/** In the headline vocabulary (missionView.ts): a failure is something wrong
 *  (`stop`); a reported success is history, kept but not acted on (`quiet`). */
export function noticeTone(failed: boolean): "quiet" | "stop" {
  return failed ? "stop" : "quiet";
}

// ---------------------------------------------------------------------------
// Title and body
// ---------------------------------------------------------------------------

/** The compact title: the first sentence of the verbatim result text. */
export function firstSentence(text: string): string {
  return text.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? text;
}

/** Title says what happened; rest carries only what the title does not, so
 *  the two never duplicate a sentence. One sentence leaves rest empty. */
export function splitNotice(body: string): { title: string; rest: string } {
  const title = firstSentence(body);
  return { title, rest: body.slice(title.length).trimStart() };
}

/** The compact pill shows the title minus trailing punctuation (the pill adds
 *  its own ellipsis). */
export function compactTitle(title: string): string {
  return title.replace(/[.!?…]+$/, "");
}
