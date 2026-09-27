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
