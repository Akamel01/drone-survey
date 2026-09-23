// The three edits an operator can make to an area's corners.
//
// They live apart from the map because the map's event wiring is not testable
// and these rules are: a corner lands where it is dropped, an edge gains a
// corner on the edge it was clicked, and a polygon never drops below three
// corners. An index that no longer matches the ring — a handle pressed while a
// render was in flight — leaves the area alone rather than punching a hole in
// it.

export type LL = [number, number];

const inRing = (aoi: LL[], i: number) => Number.isInteger(i) && i >= 0 && i < aoi.length;

/** Move corner `i` to `p`. */
export function moveCorner(aoi: LL[], i: number, p: LL): LL[] {
  if (!inRing(aoi, i)) return aoi;
  const next = aoi.slice();
  next[i] = p;
  return next;
}

/** Add a corner at `p` on the edge that runs from corner `edgeIndex` to the next. */
export function insertCorner(aoi: LL[], edgeIndex: number, p: LL): LL[] {
  if (!inRing(aoi, edgeIndex)) return aoi;
  const next = aoi.slice();
  next.splice(edgeIndex + 1, 0, p);
  return next;
}

/** Remove corner `i`, unless that would leave fewer than the three a polygon needs. */
export function removeCorner(aoi: LL[], i: number): LL[] {
  if (!inRing(aoi, i) || aoi.length <= 3) return aoi;
  return aoi.filter((_, j) => j !== i);
}
