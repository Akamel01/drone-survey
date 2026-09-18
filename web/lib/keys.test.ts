import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFTS_PREFIX, SKIPPED_KEY, STATUS_KEY, SUMMARIES_KEY, draftKey, makeSpecKey, parseSpecKey, stampToIso } from "./keys.ts";

test("makeSpecKey and parseSpecKey round-trip", () => {
  const key = makeSpecKey("field", "2026-09-17", "20260917T000000Z");
  assert.equal(key, "specs/field/2026-09-17/20260917T000000Z.json");
  assert.deepEqual(parseSpecKey(key), {
    site: "field",
    date: "2026-09-17",
    stamp: "20260917T000000Z",
  });
});

test("parseSpecKey accepts Spec keys and rejects everything else", () => {
  assert.deepEqual(parseSpecKey("specs/field/2026-09-17/20260917T000000Z.json"), {
    site: "field",
    date: "2026-09-17",
    stamp: "20260917T000000Z",
  });
  assert.equal(parseSpecKey("specs/_drafts/abc.json"), null);
  assert.equal(parseSpecKey("specs/_status/missions.json"), null);
  assert.equal(parseSpecKey("specs/field/2026-09-17/20260917T000000Z.json.bak"), null);
  assert.equal(parseSpecKey("specs/field/2026-09-17.json"), null);
  assert.equal(parseSpecKey("other/field/2026-09-17/20260917T000000Z.json"), null);
  assert.equal(parseSpecKey(""), null);
});

test("draftKey and the status keys cannot be mistaken for Spec keys", () => {
  assert.equal(DRAFTS_PREFIX, "specs/_drafts/");
  assert.equal(draftKey("abc-123"), `${DRAFTS_PREFIX}abc-123.json`);
  for (const key of [draftKey("abc"), STATUS_KEY, SUMMARIES_KEY, SKIPPED_KEY]) {
    assert.equal(parseSpecKey(key), null, `${key} must not parse as a Spec`);
  }
});

test("stampToIso turns a dispatch stamp into an instant", () => {
  assert.equal(stampToIso("20260917T004057Z"), "2026-09-17T00:40:57Z");
  assert.equal(stampToIso("not-a-stamp"), "not-a-stamp");
});
