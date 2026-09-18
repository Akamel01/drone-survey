// Runnable check for the Site id logic (issue #39, ADR 0017): a renamed Site
// must keep the same id, and the server must not trust a client-supplied id
// blindly. Run with: node --test lib/spec.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPEC, dispatchProblem, ensureSiteId, isValidSiteId, newSiteId, slugSegment, type MissionSpec } from "./spec.ts";

// dispatchProblem also requires a flyable area; a small triangle is enough to
// isolate what these tests are actually about, the site_id checks.
const FLYABLE: Pick<MissionSpec, "aoi"> = {
  aoi: [
    [45, -75],
    [45.001, -75],
    [45.001, -75.001],
  ],
};

test("newSiteId is a single safe path segment", () => {
  const id = newSiteId("Rehearsal Field");
  assert.ok(isValidSiteId(id), `${id} should be valid`);
  assert.ok(id.startsWith("rehearsal-"));
  assert.equal(id.includes("/"), false);
});

test("newSiteId falls back to 'site' for a name with no word characters", () => {
  assert.ok(isValidSiteId(newSiteId("  ")));
  assert.ok(isValidSiteId(newSiteId("!!!")));
});

test("ensureSiteId assigns an id once and keeps it across a rename", () => {
  const named = ensureSiteId({ ...DEFAULT_SPEC, site: "Rehearsal Field" });
  assert.ok(named.site_id);

  const renamed = ensureSiteId({ ...named, site: "River Bend" });
  assert.equal(renamed.site_id, named.site_id);
});

test("ensureSiteId assigns nothing while the Site has no name", () => {
  assert.equal(ensureSiteId({ ...DEFAULT_SPEC, site: "" }).site_id, undefined);
});

test("dispatchProblem accepts a Spec with no site_id (pre-#39 compatibility)", () => {
  const spec = { ...DEFAULT_SPEC, ...FLYABLE, site: "Rehearsal Field", date: "2026-09-13" };
  assert.equal(dispatchProblem(spec), null);
});

test("dispatchProblem accepts a well-formed site_id", () => {
  const spec = {
    ...DEFAULT_SPEC,
    ...FLYABLE,
    site: "Rehearsal Field",
    site_id: "rehearsal-a1b2c3",
    date: "2026-09-13",
  };
  assert.equal(dispatchProblem(spec), null);
});

test("dispatchProblem rejects a site_id that is not a single safe path segment", () => {
  for (const bad of ["../escape", "has/slash", "", "a".repeat(65)]) {
    const spec = { ...DEFAULT_SPEC, ...FLYABLE, site: "Rehearsal Field", site_id: bad, date: "2026-09-13" };
    assert.notEqual(dispatchProblem(spec), null, `${JSON.stringify(bad)} should be rejected`);
  }
});

test("slugSegment always yields something the server would accept as a Site id", () => {
  const names = [
    "Rehearsal Field",
    "  spaced  out  ",
    "A-1 Site",
    "!!!",
    "Ünïcôdé Fïeld",
    "x".repeat(200),
    "dash-".repeat(40),
    "",
  ];
  for (const name of names) {
    const slug = slugSegment(name, 60);
    assert.ok(slug.length <= 60, `${name}: too long`);
    assert.ok(!slug.startsWith("-") && !slug.endsWith("-"), `${name}: dangling dash in ${slug}`);
    if (slug) assert.ok(isValidSiteId(slug), `${name}: ${slug} is not a valid Site id`);
  }
  assert.equal(slugSegment("Rehearsal Field", 60), "rehearsal-field");
  assert.equal(slugSegment("A-1 Site", 60).slice(0, 3), "a-1");
});
