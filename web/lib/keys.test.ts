import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DRAFTS_PREFIX,
  SKIPPED_KEY,
  STATUS_KEY,
  SUMMARIES_KEY,
  draftKey,
  makeSpecKey,
  parseSpecKey,
  stampToIso,
  SPECS_PREFIX,
} from "./keys.ts";

test("makeSpecKey and parseSpecKey round-trip", () => {
  const key = makeSpecKey("field", "2026-09-17", "20260917T000000Z", SPECS_PREFIX);
  assert.equal(key, "specs/field/2026-09-17/20260917T000000Z.json");
  assert.deepEqual(parseSpecKey(key, SPECS_PREFIX), {
    site: "field",
    date: "2026-09-17",
    stamp: "20260917T000000Z",
  });
});

test("parseSpecKey accepts Spec keys and rejects everything else", () => {
  assert.deepEqual(parseSpecKey("specs/field/2026-09-17/20260917T000000Z.json", SPECS_PREFIX), {
    site: "field",
    date: "2026-09-17",
    stamp: "20260917T000000Z",
  });
  assert.equal(parseSpecKey("specs/_drafts/abc.json", SPECS_PREFIX), null);
  assert.equal(parseSpecKey("specs/_status/missions.json", SPECS_PREFIX), null);
  assert.equal(parseSpecKey("specs/field/2026-09-17/20260917T000000Z.json.bak", SPECS_PREFIX), null);
  assert.equal(parseSpecKey("specs/field/2026-09-17.json", SPECS_PREFIX), null);
  assert.equal(parseSpecKey("other/field/2026-09-17/20260917T000000Z.json", SPECS_PREFIX), null);
  assert.equal(parseSpecKey("", SPECS_PREFIX), null);
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

// The committed fixture is the contract both languages read: if this grammar and
// scripts/mission/keys.py ever disagree, one of the two suites fails.
test("the golden key fixture parses exactly as the host's grammar does", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../fixtures/store-keys.json", import.meta.url), "utf8")) as {
    spec_keys: { key: string; site: string; date: string; stamp: string }[];
    not_spec_keys: string[];
    drafts_prefix: string;
    draft_key: { id: string; key: string };
    status_keys: { missions: string; skipped: string; summaries: string };
  };
  for (const entry of fixture.spec_keys) {
    assert.deepEqual(parseSpecKey(entry.key, SPECS_PREFIX), { site: entry.site, date: entry.date, stamp: entry.stamp }, entry.key);
    assert.equal(makeSpecKey(entry.site, entry.date, entry.stamp, SPECS_PREFIX), entry.key);
  }
  for (const key of fixture.not_spec_keys) {
    assert.equal(parseSpecKey(key), null, `${key} must not parse as a Spec`);
  }
  assert.equal(DRAFTS_PREFIX, fixture.drafts_prefix);
  assert.equal(draftKey(fixture.draft_key.id), fixture.draft_key.key);
  assert.equal(STATUS_KEY, fixture.status_keys.missions);
  assert.equal(SKIPPED_KEY, fixture.status_keys.skipped);
  assert.equal(SUMMARIES_KEY, fixture.status_keys.summaries);
});
