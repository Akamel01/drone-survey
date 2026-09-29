import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STATE_LABEL,
  actionsFor,
  asOfStamp,
  cardList,
  checkedAgo,
  copyOf,
  figuresMismatch,
  flightReason,
  flightTimeDelta,
  flights,
  hostLines,
  localDate,
  metres,
  orbitAreaHectares,
  rowView,
  saveProblem,
  sitesFrom,
  CACHE_KEY,
  cacheRead,
  cachedRead,
  type Figures,
  type KeyValue,
} from "./missionView.ts";
import type { MissionRow } from "./missionRecords.ts";
import type { CardHolding } from "./model.ts";
import { DEFAULT_SPEC } from "./spec.ts";

const KEY = "specs/rehearsal-1/2026-09-23/20260923T120000Z.json";

function holding(over: Partial<CardHolding> & { card: string }): CardHolding {
  return {
    spec_key: KEY,
    flight: 1,
    flights: 1,
    reserved_at: "2026-09-23T12:00:00Z",
    ...over,
  };
}

function row(over: Partial<MissionRow> = {}): MissionRow {
  return {
    id: "a",
    site_id: "rehearsal-1",
    site: "Rehearsal Field",
    name: "north half",
    date: "2026-09-23",
    state: "planned",
    archived: false,
    spec_key: null,
    spec: DEFAULT_SPEC,
    cards: [],
    loaded_cards: [],
    superseded_by: null,
    flown_marked: null,
    flown_evidence_at: null,
    flown_disagreement: null,
    collected_at: null,
    loaded_at: null,
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z",
    edit: "in-place",
    ...over,
  };
}

const FIGS: Figures = { photo_count: 202, path_length_m: 2370, parts: 2 };

// --- the words on the screen ------------------------------------------------

test("every state label is the glossary's own word", () => {
  // There is no "draft" and no "queued": they were invented at the rendering
  // layer, and a word in the UI that is not in CONTEXT.md is a bug (ADR 0021).
  const labels = Object.values(STATE_LABEL).map((l) => l.toLowerCase());
  assert.deepEqual(labels.sort(), [
    "collected",
    "dispatched",
    "flown",
    "loaded",
    "planned",
    "superseded",
    "withdrawn",
  ]);
  for (const forbidden of ["draft", "queued", "pending", "sent"]) {
    assert.equal(labels.includes(forbidden), false, `"${forbidden}" is not a Mission State`);
  }
});

test("distance reads in metres below a kilometre and kilometres above", () => {
  assert.equal(metres(900), "900 m");
  assert.equal(metres(2370), "2.37 km");
});

// --- flights ----------------------------------------------------------------

test("the reason a Mission is several flights is stated once, with its figures", () => {
  assert.equal(flightReason(FIGS), "202 points, 2.37 km — more than one battery, so it flies as two.");
});

test("one battery says so rather than saying nothing", () => {
  assert.equal(
    flightReason({ photo_count: 62, path_length_m: 900, parts: 1 }),
    "62 points, 900 m — one battery, so it flies as one.",
  );
});

test("a Mission with no drawn area has no figures to state", () => {
  assert.equal(flightReason({ photo_count: 0, path_length_m: 0, parts: 0 }), null);
  assert.equal(flightReason(null), null);
});

test("reserved Cards are named as flights, in order", () => {
  const held = [
    holding({ card: "way finder 1", flight: 1, flights: 2 }),
    holding({ card: "way finder 2", flight: 2, flights: 2, written_at: "t" }),
  ];
  assert.deepEqual(
    flights(held).map((f) => f.label),
    ["Flight 1 of 2 — way finder 1", "Flight 2 of 2 — way finder 2"],
  );
  assert.deepEqual(
    flights(held).map((f) => f.written),
    [false, true],
    "a reservation the host has not written is not a Card that holds it yet",
  );
});

test("a single flight is named by its Card alone, not \"Flight 1 of 1\"", () => {
  assert.equal(flights([holding({ card: "way finder 3" })])[0].label, "way finder 3");
});

test("before Dispatch no Card is named, because none is reserved yet", () => {
  // The old screen predicted one here and had three Missions heading for two
  // Cards with no contradiction detected (ADR 0022). The count of flights is
  // carried by the reason line instead, stated once.
  assert.deepEqual(flights([]), []);
  assert.match(flightReason(FIGS) as string, /flies as two/);
});

// --- the mismatch that blocks readiness -------------------------------------

test("a point count that disagrees with what the host wrote is a mismatch", () => {
  const why = figuresMismatch(FIGS, [
    { card: "way finder 1", name: "x", waypoints: 100 },
    { card: "way finder 2", name: "y", waypoints: 60 },
  ]);
  assert.equal(why, "202 points planned, 160 written");
});

test("a distance within measurement noise is not a mismatch", () => {
  const agree = figuresMismatch(FIGS, [
    { card: "way finder 1", name: "x", waypoints: 202, path_length_m: 2400 },
  ]);
  assert.equal(agree, null, "two geodesic sums of one path differ slightly and always will");
  const differ = figuresMismatch(FIGS, [
    { card: "way finder 1", name: "x", waypoints: 202, path_length_m: 1500 },
  ]);
  assert.equal(differ, "2.37 km planned, 1.50 km written");
});

test("a host report with no figures is not evidence of a difference", () => {
  assert.equal(figuresMismatch(FIGS, [{ card: "way finder 1", name: "x" }]), null);
  assert.equal(figuresMismatch(null, [{ card: "way finder 1", name: "x", waypoints: 5 }]), null);
  assert.equal(figuresMismatch(FIGS, []), null);
});

test("a mismatch withholds \"open way finder 2\" instead of noting it underneath", () => {
  // A grey note on a row is how this gets missed; it must withhold the
  // affirmation (ADR 0022).
  const loaded = row({
    state: "loaded",
    spec_key: KEY,
    cards: [holding({ card: "way finder 2", written_at: "t" })],
    loaded_cards: [{ card: "way finder 2", name: "north half", waypoints: 9 }],
  });
  const view = rowView(loaded, FIGS);
  assert.equal(view.headline.tone, "stop");
  assert.equal(view.headline.text, "Do not fly this Mission");
  assert.equal(view.blockers.length, 1);
  assert.match(view.blockers[0], /202 points planned, 9 written/);
});

test("a Loaded Mission whose figures agree names the Card to open", () => {
  const loaded = row({
    state: "loaded",
    spec_key: KEY,
    cards: [holding({ card: "way finder 2", written_at: "t" })],
    loaded_cards: [{ card: "way finder 2", name: "north half", waypoints: 202, path_length_m: 2370 }],
  });
  const view = rowView(loaded, FIGS);
  assert.equal(view.headline.tone, "go");
  assert.equal(view.headline.text, "Open way finder 2");
  assert.deepEqual(view.blockers, []);
});

test("two Cards are both named in the affirmation", () => {
  const loaded = row({
    state: "loaded",
    spec_key: KEY,
    cards: [
      holding({ card: "way finder 1", flight: 1, flights: 2, written_at: "t" }),
      holding({ card: "way finder 2", flight: 2, flights: 2, written_at: "t" }),
    ],
  });
  assert.equal(rowView(loaded, null).headline.text, "Open way finder 1 and way finder 2");
});

// --- the stale Card alarm ---------------------------------------------------

test("a stale Card is an alarm that says plainly not to fly", () => {
  const stale = [holding({ card: "way finder 4", written_at: "t" })];
  const view = rowView(row({ state: "loaded", spec_key: KEY }), null, stale);
  assert.equal(view.headline.tone, "stop");
  assert.match(view.blockers[0], /way finder 4 holds a Mission that is no longer current/);
  assert.match(view.blockers[0], /Do not fly this/);
});

test("a stale Card belonging to another Spec is not this row's alarm", () => {
  const stale = [holding({ card: "way finder 4", spec_key: "specs/other/1.json", written_at: "t" })];
  assert.deepEqual(rowView(row({ state: "loaded", spec_key: KEY }), null, stale).blockers, []);
});

// --- what each state leads with ---------------------------------------------

test("a Planned Mission offers Dispatch and names no Card", () => {
  const view = rowView(row(), FIGS);
  assert.equal(view.headline.text, "Dispatch to reserve a Card");
  assert.ok(view.actions.includes("Dispatch"));
  assert.equal(cardList([]), "No Card");
});

test("a Dispatched Mission says what it is waiting for, and can be withdrawn", () => {
  const view = rowView(
    row({ state: "dispatched", spec_key: KEY, cards: [holding({ card: "way finder 1" })] }),
    FIGS,
  );
  assert.equal(view.headline.tone, "wait");
  assert.match(view.headline.detail, /way finder 1 reserved/);
  assert.ok(view.actions.includes("Withdraw"));
});

test("Flown can be unmarked, and a Mission not yet Dispatched cannot be marked Flown", () => {
  assert.ok(actionsFor(row({ state: "flown" })).includes("Unmark Flown"));
  assert.ok(actionsFor(row({ state: "loaded" })).includes("Mark Flown"));
  assert.equal(actionsFor(row({ state: "planned" })).includes("Mark Flown"), false);
});

test("a disagreement about Flown is carried to the row, never resolved silently", () => {
  const view = rowView(
    row({ state: "dispatched", spec_key: KEY, flown_disagreement: "Marked Flown, but no imagery." }),
    null,
  );
  assert.equal(view.disagreement, "Marked Flown, but no imagery.");
});

// --- the list around the rows ------------------------------------------------

test("Sites are offered from what is already in the store, one entry per id", () => {
  // Typing a Site name per Mission quietly created a new Site every time and
  // broke Capture accumulation (ADR 0021), so the list is what exists.
  const sites = sitesFrom([
    row({ id: "a", site_id: "quarry-7a", site: "West Quarry" }),
    row({ id: "b", site_id: "rehearsal-1", site: "Rehearsal Field" }),
    row({ id: "c", site_id: "quarry-7a", site: "Quarry (old label)" }),
  ]);
  assert.deepEqual(sites, [
    { site_id: "rehearsal-1", site: "Rehearsal Field" },
    { site_id: "quarry-7a", site: "West Quarry" },
  ]);
});

test("the list always says how old what it shows is", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  assert.equal(checkedAgo(now - 20_000, now), "checked just now");
  assert.equal(checkedAgo(now - 4 * 60_000, now), "checked 4 min ago");
  assert.equal(checkedAgo(now - 3 * 3_600_000, now), "checked 3 h ago");
  assert.equal(checkedAgo(now - 5 * 86_400_000, now), "checked 5 d ago");
  // The boundaries it promises (#94): each unit starts exactly where the last stops.
  assert.equal(checkedAgo(now - 59_999, now), "checked just now");
  assert.equal(checkedAgo(now - 60_000, now), "checked 1 min ago");
  assert.equal(checkedAgo(now - 59 * 60_000, now), "checked 59 min ago");
  assert.equal(checkedAgo(now - 60 * 60_000, now), "checked 1 h ago");
  assert.equal(checkedAgo(now - 47 * 3_600_000, now), "checked 47 h ago");
  assert.equal(checkedAgo(now - 48 * 3_600_000, now), "checked 2 d ago");
  // A clock that runs ahead of the read is not a negative age.
  assert.equal(checkedAgo(now + 5_000, now), "checked just now");
});

test("a cached read is stamped so it cannot be read as live", () => {
  const at = new Date(2026, 8, 23, 7, 5).getTime();
  assert.equal(asOfStamp(at), "as of 07:05, not live");
});

// --- the last read, kept for when the store cannot be reached ---------------

function fakeStore(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

test("the last good read comes back with the instant it was taken", () => {
  const store = fakeStore();
  cacheRead(store, { missions: [row()], archived_count: 3, stale_cards: [], now: 1 }, 1_700_000_000_000);
  const back = cachedRead(store);
  assert.equal(back?.read_at, 1_700_000_000_000);
  assert.equal(back?.read.missions[0].id, "a");
  assert.equal(back?.read.archived_count, 3);
});

test("a cache that cannot be trusted is no cache, never a half-filled list", () => {
  const store = fakeStore();
  assert.equal(cachedRead(store), null, "nothing stored");
  store.map.set(CACHE_KEY, "{ not json");
  assert.equal(cachedRead(store), null, "corrupt");
  store.map.set(CACHE_KEY, JSON.stringify({ read: { missions: [] } }));
  assert.equal(cachedRead(store), null, "no instant, so nothing could be stamped");
});

test("storage that refuses a write loses the fallback and nothing else", () => {
  const refusing: KeyValue = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.doesNotThrow(() =>
    cacheRead(refusing, { missions: [], archived_count: 0, stale_cards: [], now: 0 }, 1),
  );
});

// --- the operator's check inside the Card (#155) ------------------------------

test("a Loaded Mission says how many points its Card must show once opened", () => {
  const loaded = row({
    state: "loaded",
    spec_key: KEY,
    cards: [holding({ card: "way finder 1", written_at: "t" })],
    loaded_cards: [{ card: "way finder 1", name: "Ortho", waypoints: 184, path_length_m: 1426 }],
  });
  const view = rowView(loaded, { photo_count: 184, path_length_m: 1426, parts: 1 });
  assert.equal(view.headline.text, "Open way finder 1");
  assert.match(view.headline.detail, /check it shows 184 points before you fly/);
  assert.match(view.headline.detail, /do not fly/);
  assert.equal(view.flights[0].points, 184);
});

test("several Cards each carry their own count to check", () => {
  const fs = flights(
    [
      holding({ card: "way finder 1", flight: 1, flights: 2, written_at: "t" }),
      holding({ card: "way finder 2", flight: 2, flights: 2, written_at: "t" }),
    ],
    [
      { card: "way finder 1", name: "a", waypoints: 101 },
      { card: "way finder 2", name: "b", waypoints: 99 },
    ],
  );
  assert.deepEqual(fs.map((f) => f.points), [101, 99]);
});

// --- nothing on the Controller yet (#163, #165) --------------------------------

test("a Mission not yet on the Controller can be withdrawn and cannot be marked Flown", () => {
  for (const state of ["dispatched", "collected"] as const) {
    const actions = actionsFor(row({ state }));
    assert.ok(actions.includes("Withdraw"), state);
    assert.equal(actions.includes("Mark Flown"), false, state);
  }
  assert.equal(actionsFor(row({ state: "loaded" })).includes("Withdraw"), false);
});

// --- a Load the host refused (#162) --------------------------------------------

const NOTICE = {
  type: "card-ledger",
  at: "2026-09-24T07:20:00Z",
  waiting: [KEY],
  reason: "no Card is reserved for specs/old.json; nothing was touched.",
};

test("a Collected row the host is refusing says so, instead of promising a Load", () => {
  const collected = row({ state: "collected", spec_key: KEY, cards: [holding({ card: "way finder 1" })] });
  const view = rowView(collected, FIGS, [], NOTICE);
  assert.equal(view.headline.tone, "stop");
  assert.equal(view.headline.text, "Not being Loaded");
  assert.match(view.headline.detail, /No Card is reserved/);
  assert.equal(rowView(collected, FIGS, [], null).headline.text, "Collected, not yet on the Controller");
});

test("a refusal is said above the list, and nothing is said without one", () => {
  assert.match(hostLines({ notice: NOTICE, drift: null })[0], /refused the last Load/);
  assert.deepEqual(hostLines({ notice: null, drift: null }), []);
  assert.deepEqual(hostLines(undefined), []);
  const drift = { at: "t", cards: [{ card: "way finder 3", expected: "a", found: "b" }] };
  assert.match(hostLines({ notice: null, drift })[0], /Do not fly way finder 3/);
});

// --- one Site, one name (#166) -------------------------------------------------

test("a new Site cannot take an existing Site's name, whatever its case or spacing", () => {
  const sites = [{ site_id: "g-z2m4tx", site: "GeorgeTown2" }];
  const spec = { site: " georgetown2 ", site_id: "g-new001", date: "2026-09-24" };
  assert.match(saveProblem(spec, "Ortho", sites)!, /already a Site called “GeorgeTown2”/);
  assert.equal(saveProblem({ ...spec, site_id: "g-z2m4tx" }, "Ortho", sites), null, "the Site itself is fine");
});

// --- copying a Mission ----------------------------------------------------------

test("every Mission can be copied, whatever became of it", () => {
  for (const state of ["planned", "dispatched", "collected", "loaded", "flown", "withdrawn", "superseded"] as const) {
    assert.ok(actionsFor(row({ state })).includes("Copy"), state);
  }
});

test("a copy is a new Mission with today's date, the same Site and Name, and the original's plan", () => {
  const flown = row({ state: "flown", name: "Ortho", site: "GeorgeTown2", site_id: "g-z2m4tx", date: "2026-09-24" });
  const { spec, editing } = copyOf(flown, "2026-10-01");
  assert.equal(editing.id, null, "no id: saving creates a Mission and replaces nothing");
  assert.equal(editing.name, "Ortho");
  assert.equal(spec.date, "2026-10-01");
  assert.equal(spec.site_id, "g-z2m4tx");
  assert.deepEqual(spec.aoi, flown.spec.aoi);
  assert.match(editing.copied_from, /Ortho, GeorgeTown2 2026-09-24/);
});

test("today is the operator's calendar day, not Greenwich's", () => {
  assert.equal(localDate(new Date(2026, 8, 24, 23, 30)), "2026-09-24");
});

// --- the summary's flight-time delta (#183) --------------------------------

test("the delta line names every flight's own time, not just the total", () => {
  assert.equal(flightTimeDelta(2, [11.2, 9.8]), "2 flights · 11.2 + 9.8 min");
});

test("one battery states its own minutes rather than repeating a plural", () => {
  assert.equal(flightTimeDelta(1, [21.0]), "1 flight · 21.0 min");
});

test("no drawn area yet has nothing to add up, and still reads as a sentence", () => {
  assert.equal(flightTimeDelta(0, []), "0 flights · 0.0 min");
});

// --- the orbit's area in Details (#292) --------------------------------------

test("an orbit's area is πr² in hectares, read from its radius", () => {
  // areaHectares returns 0 for an orbit (its aoi is empty by design), so
  // Details reads the radius instead. Worked examples, never the formula.
  assert.equal(orbitAreaHectares(40).toFixed(4), "0.5027");
  assert.equal(orbitAreaHectares(25).toFixed(4), "0.1963");
  assert.equal(orbitAreaHectares(0), 0);
});

// --- the row leads with the answer; Details carries the reason (#292) --------

test("only a stop-tone or Loaded row shows its detail; the rest keep it for Details", () => {
  // The component gates headline.detail on tone === "stop" or state ===
  // "loaded" (the Row in MissionList); this pins the data side of that
  // contract. A Planned detail exists in the view but is wait-tone, so the
  // row hides it and Details shows it.
  const planned = rowView(row(), FIGS);
  assert.equal(planned.headline.tone, "wait");
  assert.ok(planned.headline.detail.length > 0, "the reason exists — it is just not the row's to say");

  const waiting = rowView(
    row({ state: "dispatched", spec_key: KEY, cards: [holding({ card: "way finder 1" })] }),
    FIGS,
  );
  assert.equal(waiting.headline.tone, "wait", "waiting rows keep the row short");

  const held = rowView(
    row({ state: "collected", spec_key: KEY, cards: [holding({ card: "way finder 1" })] }),
    FIGS,
    [],
    NOTICE,
  );
  assert.equal(held.headline.tone, "stop", "a refused Load is said on the row");

  const loaded = rowView(
    row({
      state: "loaded",
      spec_key: KEY,
      cards: [holding({ card: "way finder 2", written_at: "t" })],
      loaded_cards: [{ card: "way finder 2", name: "north half", waypoints: 202, path_length_m: 2370 }],
    }),
    FIGS,
  );
  assert.equal(loaded.state, "loaded");
  assert.ok(loaded.headline.detail.length > 0, "the points check stays on a Loaded row");
});

test("a held row that is also blocked keeps its refusal apart from its blockers", () => {
  // Details renders headline.detail above the blockers list exactly when the
  // two differ; this pins the data side of that branch. A mismatch blocker
  // (100 written of 202 planned) plus the host refusal is the conjunction.
  const both = row({
    state: "collected",
    spec_key: KEY,
    cards: [holding({ card: "way finder 1" })],
    loaded_cards: [{ card: "way finder 1", name: "north half", waypoints: 100, path_length_m: 2370 }],
  });
  const heldBlocked = rowView(both, FIGS, [], NOTICE);
  assert.equal(heldBlocked.blockers.length, 1);
  assert.match(heldBlocked.headline.detail, /refused the Load/);
  assert.notEqual(heldBlocked.headline.detail, heldBlocked.blockers[0]);

  // Blocked alone: the headline just is the first blocker, so Details showing
  // the list alone drops nothing.
  const blocked = rowView(both, FIGS, [], null);
  assert.equal(blocked.headline.detail, blocked.blockers[0]);
});
