// Runnable check for the Site id logic (issue #39, ADR 0017): a renamed Site
// must keep the same id, and the server must not trust a client-supplied id
// blindly. Run with: node --test lib/spec.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPEC, dispatchProblem, draftProblem, ensureSiteId, isValidSiteId, newSiteId, slugSegment, type MissionSpec } from "./spec.ts";

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

// The two gates derive from one description, so the only thing that separates
// them is what a stage requires — and the field rules cannot drift apart.
test("a draft may be an unfinished plan that Dispatch refuses", () => {
  const halfDrawn = { ...DEFAULT_SPEC, site: "Rehearsal Field", date: "2026-01-01", aoi: [] } as MissionSpec;
  assert.equal(draftProblem(halfDrawn), null, "an unfinished plan is savable as a draft");
  assert.notEqual(dispatchProblem(halfDrawn), null, "the same plan is not dispatchable");
});

test("a draft may be blank where Dispatch requires a value", () => {
  // The drafts route has always judged shape, not readiness: an operator saves a
  // Mission before it has a name or a date, and Dispatch is where blanks are fatal.
  for (const spec of [
    { ...DEFAULT_SPEC, site: "" },
    { ...DEFAULT_SPEC, site: "Field", date: "" },
  ] as MissionSpec[]) {
    assert.equal(draftProblem(spec), null, `savable as a draft: ${JSON.stringify(spec.site)}`);
    assert.notEqual(dispatchProblem(spec), null, `not dispatchable: ${JSON.stringify(spec.site)}`);
  }
});

test("a version neither gate knows is refused by both", () => {
  const wrong = { ...DEFAULT_SPEC, site: "Field", date: "2026-01-01", version: 2 } as unknown as MissionSpec;
  assert.notEqual(draftProblem(wrong), null);
  assert.notEqual(dispatchProblem(wrong), null);
});

test("the Site id is Dispatch's trust boundary, not the draft's", () => {
  const badId = { ...DEFAULT_SPEC, site: "Field", date: "2026-01-01", site_id: "../etc/passwd" } as MissionSpec;
  assert.equal(draftProblem(badId), null, "a draft has no storage key yet, so an id is not judged");
  assert.notEqual(dispatchProblem(badId), null, "the id becomes a storage path at Dispatch");
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

test("the draft gate keeps the verdicts it replaced", () => {
  const base = { ...DEFAULT_SPEC, site: "Field", date: "2026-01-01" };
  // Blank fields are a draft in progress: the old route accepted them.
  assert.equal(draftProblem({ ...base, site: "", date: "" }), null, "a blank draft is still a draft");
  assert.equal(draftProblem({ ...base, site_id: "not a legal id" }), null, "a draft needs no storage-safe id");
  // Shape rules it did enforce, and still does.
  assert.notEqual(draftProblem({ ...base, version: 2 }), null);
  assert.notEqual(draftProblem({ ...base, mission_type: "circus" }), null);
  assert.notEqual(draftProblem({ ...base, site: 7 }), null, "a non-string site must be refused, not thrown over");
  assert.notEqual(draftProblem({ ...base, date: 7 }), null, "a non-string date must be refused, not thrown over");
});
