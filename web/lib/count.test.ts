import { test } from "node:test";
import assert from "node:assert/strict";

import { countValue, easeCount } from "./count.ts";

test("countValue starts at `from` and ends at the value", () => {
  assert.equal(countValue(42, 0), 0);
  assert.equal(countValue(42, 1), 42);
  assert.equal(countValue(3.5, 0, 2), 2);
  assert.equal(countValue(3.5, 1, 2), 3.5);
});

test("countValue is monotonic non-decreasing across the count", () => {
  let prev = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const v = countValue(120, t);
    assert.ok(v >= prev, `t=${t}: ${v} < ${prev}`);
    prev = v;
  }
});

test("easeCount pins its endpoints and stays strictly inside (0,1) mid-count", () => {
  assert.equal(easeCount(0), 0);
  assert.equal(easeCount(1), 1);
  const mid = easeCount(0.5);
  assert.ok(mid > 0 && mid < 1, `easeCount(0.5)=${mid}`);
});

test("easeCount clamps outside [0,1]", () => {
  assert.equal(easeCount(-2), 0);
  assert.equal(easeCount(5), 1);
});
