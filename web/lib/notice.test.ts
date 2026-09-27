import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COLLAPSE_MS,
  COMPACT_BEAT_MS,
  COMPACT_TITLE,
  DISMISS_MS,
  LEAVE_MS,
  compactTitle,
  dismissAt,
  firstSentence,
  initialPhase,
  noticeRole,
  noticeTone,
  phaseAt,
  splitNotice,
  togglePhase,
} from "./notice.ts";
import { describeResult } from "./actions.ts";
import { describeSave } from "./missionView.ts";

// --- timing: spec §9.1, mirrored from Notice.tsx -------------------------------

test("collapse delay is 4s, leave is 200ms", () => {
  assert.equal(COLLAPSE_MS, 4000);
  assert.equal(COMPACT_BEAT_MS, 250);
  assert.equal(LEAVE_MS, 200);
  assert.equal(DISMISS_MS, 4450);
});

test("success starts expanded and collapses at 4s", () => {
  assert.equal(initialPhase(), "expanded");
  assert.equal(phaseAt(0, false), "expanded");
  assert.equal(phaseAt(COLLAPSE_MS - 1, false), "expanded");
  assert.equal(phaseAt(COLLAPSE_MS, false), "compact");
});

test("compact holds a brief beat, then the notice leaves and dismisses", () => {
  assert.equal(phaseAt(COLLAPSE_MS + COMPACT_BEAT_MS - 1, false), "compact");
  assert.equal(phaseAt(COLLAPSE_MS + COMPACT_BEAT_MS, false), "leaving");
  assert.equal(phaseAt(DISMISS_MS - 1, false), "leaving");
  assert.equal(dismissAt(false), DISMISS_MS);
});

test("failure never times out: expanded at any age, no dismiss scheduled", () => {
  assert.equal(phaseAt(0, true), "expanded");
  assert.equal(phaseAt(COLLAPSE_MS, true), "expanded");
  assert.equal(phaseAt(30000, true), "expanded");
  assert.equal(dismissAt(true), null);
});

test("a superseding payload restarts from expanded (timers are per payload)", () => {
  // phaseAt is pure in elapsed-since-payload: a new payload means elapsed 0,
  // which is how the component's cleared timers + key remount reset the cycle.
  assert.equal(phaseAt(0, false), "expanded");
  assert.equal(phaseAt(0, true), "expanded");
});

test("tap toggles compact/expanded; a leaving notice stays leaving", () => {
  assert.equal(togglePhase("expanded"), "compact");
  assert.equal(togglePhase("compact"), "expanded");
  assert.equal(togglePhase("leaving"), "leaving");
});

// --- tone + role per outcome ---------------------------------------------------

test("success reports politely, failure assertively", () => {
  assert.equal(noticeRole(false), "status");
  assert.equal(noticeRole(true), "alert");
  assert.equal(noticeTone(false), "quiet");
  assert.equal(noticeTone(true), "stop");
});

test("every row action's outcome maps to its tone and role", () => {
  const dispatch = describeResult("Dispatch", { ok: true, body: { cards: ["way finder 1"] } });
  assert.match(dispatch, /^Dispatched\./);
  assert.equal(noticeRole(false), "status");

  // Mark Flown answers with `cards` too; it must still read as Flown (#164).
  const flown = describeResult("Mark Flown", { ok: true, body: { cards: ["way finder 1"] } });
  assert.match(flown, /^Marked Flown\./);
  assert.equal(noticeRole(false), "status");

  const withdrawn = describeResult("Withdraw", { ok: true, body: { cards_released: ["way finder 1"] } });
  assert.match(withdrawn, /^Withdrawn\./);

  const removed = describeResult("Remove", { ok: true, body: { archived: "m5" } });
  assert.match(removed, /archived, not deleted/);

  const failed = describeResult("Dispatch", {
    ok: false,
    status: 503,
    body: { error: "No Card is free; 2 needed, 0 available." },
  });
  assert.match(failed, /failed/);
  assert.equal(noticeRole(true), "alert");
  assert.equal(noticeTone(true), "stop");
});

test("save outcomes map the same way", () => {
  const saved = describeSave({ mission: { name: "north half" } });
  assert.match(saved, /is saved/);
  assert.equal(noticeRole(false), "status");
  assert.equal(noticeTone(false), "quiet");
});

// --- title/body split ----------------------------------------------------------

test("first sentence is the compact title", () => {
  assert.equal(firstSentence("Dispatched. way finder 1 is reserved for it."), "Dispatched.");
  assert.equal(firstSentence("Marked Flown. Its Card is free for the next Mission."), "Marked Flown.");
  assert.equal(firstSentence("Store full."), "Store full.");
  assert.equal(firstSentence("no punctuation here"), "no punctuation here");
});

test("title says what happened, rest carries only what the title does not", () => {
  assert.deepEqual(splitNotice("Dispatched. way finder 1 is reserved for it."), {
    title: "Dispatched.",
    rest: "way finder 1 is reserved for it.",
  });
  // One sentence leaves nothing over: title and body agree, never duplicate.
  assert.deepEqual(splitNotice("Store full."), { title: "Store full.", rest: "" });
});

test("compact pill strips trailing punctuation before the ellipsis", () => {
  assert.equal(compactTitle("Dispatched."), "Dispatched");
  assert.equal(compactTitle("Not saved"), "Not saved");
  assert.equal(COMPACT_TITLE, "…");
});
