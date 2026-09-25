import { test } from "node:test";
import assert from "node:assert/strict";

import { insertCorner, isTap, moveCorner, removeCorner, TAP_PX, trimDoubleClick, type LL } from "./aoi.ts";

const square: LL[] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
];

test("a corner lands where it is dropped", () => {
  assert.deepEqual(moveCorner(square, 0, [5, 5]), [
    [5, 5],
    [0, 1],
    [1, 1],
    [1, 0],
  ]);
});

test("moving a corner leaves the original alone", () => {
  moveCorner(square, 2, [9, 9]);
  assert.deepEqual(square[2], [1, 1]);
});

// The drag index is captured on mousedown and used on the next mousemove; a
// render in between can shorten the ring. Writing past its end would grow the
// array with an undefined corner and take the whole preview down with it.
test("an index off the end of the ring changes nothing", () => {
  assert.equal(moveCorner(square, 4, [5, 5]), square);
  assert.equal(moveCorner(square, -1, [5, 5]), square);
  assert.equal(insertCorner(square, 4, [5, 5]), square);
  assert.equal(removeCorner(square, 4), square);
});

test("a corner is inserted on the edge it was clicked", () => {
  assert.deepEqual(insertCorner(square, 1, [0, 0.5]), [
    [0, 0],
    [0, 1],
    [0, 0.5],
    [1, 1],
    [1, 0],
  ]);
});

test("the last edge wraps back to the first corner", () => {
  assert.deepEqual(insertCorner(square, 3, [0.5, 0]), [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0.5, 0],
  ]);
});

test("a corner can be removed", () => {
  assert.deepEqual(removeCorner(square, 1), [
    [0, 0],
    [1, 1],
    [1, 0],
  ]);
});

test("a polygon refuses to drop below three corners", () => {
  const triangle = removeCorner(square, 1);
  assert.equal(removeCorner(triangle, 0), triangle);
});

// The two clicks a double-click fires first are corners the operator never
// placed, so finishing a draw has to take them back off again.
test("a double-click takes back the corners it planted", () => {
  const five: LL[] = [[0, 0], [0, 1], [1, 1], [1, 0], [2, 2]];
  assert.equal(trimDoubleClick([...five, [3, 3]]).length, 4);
  assert.equal(trimDoubleClick(five).length, 3);
  assert.equal(trimDoubleClick(square).length, 3);
});

// Trimming must never manufacture a shape that is not one: from three corners
// down there is nothing to give back, and the caller has to refuse the finish.
test("a draw too short to finish is left untrimmed", () => {
  const three = square.slice(0, 3);
  assert.equal(trimDoubleClick(three), three);
  assert.equal(trimDoubleClick([]).length, 0);
});
// Tap-vs-drag displacement predicate (M1): a touch that moves less than
// TAP_PX is a tap (selects a corner); anything more is a drag.
test("isTap treats displacement within TAP_PX as a tap", () => {
  assert.equal(isTap(0, 0), true);
  assert.equal(isTap(5, 0), true);
  assert.equal(isTap(0, 7), true);
});

test("isTap treats displacement at the boundary as a tap", () => {
  assert.equal(isTap(TAP_PX, 0), true);
  assert.equal(isTap(0, TAP_PX), true);
  assert.equal(isTap(5.65, 5.65), true);
});

test("isTap treats displacement over the threshold as a drag", () => {
  assert.equal(isTap(TAP_PX + 0.01, 0), false);
  assert.equal(isTap(0, TAP_PX + 0.01), false);
  assert.equal(isTap(TAP_PX + 1, TAP_PX + 1), false);
});
