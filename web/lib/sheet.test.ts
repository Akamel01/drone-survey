import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldDismissSheet, SHEET_DISMISS_PX } from "./sheet.ts";

test("short of the threshold snaps back", () => {
  assert.equal(shouldDismissSheet(SHEET_DISMISS_PX - 1), false);
});

test("at or past the threshold dismisses", () => {
  assert.equal(shouldDismissSheet(SHEET_DISMISS_PX), true);
  assert.equal(shouldDismissSheet(SHEET_DISMISS_PX + 40), true);
});

test("dragging up, or not at all, never dismisses", () => {
  assert.equal(shouldDismissSheet(0), false);
  assert.equal(shouldDismissSheet(-50), false);
});
