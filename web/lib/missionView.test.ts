import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STATE_LABEL,
  actionsFor,
  asOfStamp,
  cardList,
  checkedAgo,
  figuresMismatch,
  flightReason,
  flights,
  metres,
  rowView,
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
