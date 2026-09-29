/** When a Mission row leaves and when it arrives (spec § 9.1): the dissolve is
 *  the sheet's 250ms exit, the blur-in is the 150ms fade. The component owns
 *  the DOM, timers and classes; every decision it makes lives here. */

export const EXIT_MS = 250;
export const ENTER_MS = 150;

/** The same filter the render uses, in one place. */
export function visibleMissions<T extends { archived: boolean }>(
  missions: readonly T[],
  showArchived: boolean,
): readonly T[] {
  return showArchived ? missions : missions.filter((r) => !r.archived);
}

/** Ids rendered now but not visible in the incoming read: the rows to dissolve. */
export function leavingIds(renderedIds: Iterable<string>, nextVisibleIds: Iterable<string>): string[] {
  const next = new Set(nextVisibleIds);
  return [...new Set(renderedIds)].filter((id) => !next.has(id));
}

/** Ids in the incoming read that were not in the previous committed read.
 *  `null` previous means the first load: the first read primes, nothing arrives. */
export function arrivingIds(
  previousIds: ReadonlySet<string> | null,
  nextIds: Iterable<string>,
): string[] {
  if (previousIds === null) return [];
  return [...new Set(nextIds)].filter((id) => !previousIds.has(id));
}

/** FLIP deltas: previous − next, for ids in both reads, skipping movement below
 *  half a pixel. A row cannot move by arriving or leaving. */
export function flipDeltas(
  previous: ReadonlyMap<string, number>,
  next: ReadonlyMap<string, number>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const [id, before] of previous) {
    const after = next.get(id);
    if (after === undefined) continue;
    const delta = before - after;
    if (Math.abs(delta) < 0.5) continue;
    deltas.set(id, delta);
  }
  return deltas;
}

/** The leave hold: under reduced motion it covers the 150ms crossfade, so the
 *  row is never inert and invisible longer than it takes to fade. */
export function holdMs(reduced: boolean): number {
  return reduced ? ENTER_MS : EXIT_MS;
}

/** The operator's own Mark Flown cause. Set only in `act()` on
 *  `label === "Mark Flown"` + `outcome.ok`; the ref lives in the component,
 *  the decision lives here. `seq` is the read generation at arming: a read
 *  issued at or before it predates the mark and can never consume the marker,
 *  so a poll already in flight can neither swallow nor cancel the moment. */
export type FlownMarker = { id: string; seq: number } | null;

/** Settle crossfade reuses the 150ms blur-in; the Flown reading hold is
 *  `--dur-count` (globals.css). */
export const SETTLE_MS = ENTER_MS;
export const FLOWN_COUNT_MS = 900;

/** Matches iff the marker names an id among the leaving ids: a poll with no
 *  leaving id can never match. */
export function settleFlown(marker: FlownMarker, leaving: Iterable<string>): boolean {
  if (marker === null) return false;
  return new Set(leaving).has(marker.id);
}

/** Only a read issued after the mark was armed may consume the marker: its
 *  generation is strictly greater than the arming `seq`. Everything the
 *  operator did not cause -- the mark's own read aside -- resolves `false`,
 *  and the marker stays armed for the next eligible read. */
export function canConsumeFlown(marker: FlownMarker, gen: number): marker is { id: string; seq: number } {
  return marker !== null && gen > marker.seq;
}

/** A read older than the active Flown moment's own read: it was issued before
 *  the mark that started the chain. It must never consume the marker, clear
 *  the settle, park itself or commit over the moment; the component drops it
 *  whole, and the moment's own read still commits at the end. */
export function isStaleForMoment(gen: number, momentGen: number | null): boolean {
  return momentGen !== null && gen < momentGen;
}

/** The whole Flown moment: settle + reading hold + existing dissolve.
 *  Reduced motion shows the reading at once, keeps the hold, same exit. */
export function flownHoldMs(reduced: boolean): number {
  return reduced ? FLOWN_COUNT_MS + ENTER_MS : SETTLE_MS + FLOWN_COUNT_MS + EXIT_MS;
}
