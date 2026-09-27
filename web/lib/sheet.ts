// The one custom gesture a sheet has: drag its grab handle down far enough
// and it dismisses. Pure so the pointer handlers in Sheet.tsx and this file's
// test share one definition of "far enough" (the pattern `isTap` in aoi.ts
// already uses for the map's touch handling).

/** Below this the sheet snaps back; at or past it, releasing dismisses. */
export const SHEET_DISMISS_PX = 120;

/** `dy` is the pointer's downward travel from where the drag started; a drag
 *  that never went down (`dy <= 0`) never dismisses, whatever the threshold. */
export function shouldDismissSheet(dy: number): boolean {
  return dy >= SHEET_DISMISS_PX;
}
