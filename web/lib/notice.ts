// The Notice's state and timing, as pure functions.
//
// The component (Notice.tsx) owns the DOM — timers, focus, key handling — and
// these are the rules it follows, reachable from a test the way the row
// reading in missionView.ts is: everything below is a pure function, the
// component renders what it returns and decides nothing about timing.

// Success timing (spec §9.1, grilling §3): expanded ~4s → compact for a brief
// beat → 200ms `--ease-in` leave, then dismiss. Failures carry no timers.
export const COLLAPSE_MS = 4000;
export const COMPACT_BEAT_MS = 250;
export const LEAVE_MS = 200;

/** Elapsed-since-payload at which a success dismisses itself. */
export const DISMISS_MS = COLLAPSE_MS + COMPACT_BEAT_MS + LEAVE_MS;

/** The ellipsis the compact pill appends to its stripped title. */
export const COMPACT_TITLE = "…";

/** Expanded shows mission + title + body; compact the short title; leaving is
 *  the short ease-in fade before dismiss. */
export type NoticePhase = "expanded" | "compact" | "leaving";

/** A new payload always arrives expanded — which is also what a superseding
 *  payload (parent remounts per key) and a re-announced identical failure do. */
export function initialPhase(): NoticePhase {
  return "expanded";
}

/** Which phase a notice shown `elapsedMs` ago is in. Failures never leave
 *  `expanded`: no timers are armed for them. */
export function phaseAt(elapsedMs: number, failed: boolean): NoticePhase {
  if (failed || elapsedMs < COLLAPSE_MS) return "expanded";
  if (elapsedMs < COLLAPSE_MS + COMPACT_BEAT_MS) return "compact";
  return "leaving";
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
