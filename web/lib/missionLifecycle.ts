// The Mission lifecycle, end to end, behind one interface.
//
// Every action an operator can take on a Mission lives here: the validation
// order, the write order, and every refusal in the operator's words. The
// routes parse the request and map a result to a status; nothing else
// (ADR 0021's one lifecycle, #259).
//
// The store sits behind `MissionStore`: eight operations, no HTTP. The B2
// adapter lives in `missionStore.ts`; the in-memory one in
// `memoryMissionStore.ts`. The module never sees fetch, a Response or an env
// var, which is what lets it be driven whole from a test.
//
// Workspace scoping lives here and only here (#244): every action sees only
// the Missions the Caller's Workspace owns, so a Mission of another Workspace
// is "not in the store" (404, never 403, so its existence does not leak).
// Ownership sits behind `MissionOwners` (the account database); a Mission
// with no ownership row belongs to the operator's Workspace.

import { randomUUID } from "node:crypto";

import { LOCAL_ID_PREFIX, dispatchStamp, isSafeId, makeSpecKey } from "./keys.ts";
import { preview } from "./mission.ts";
import { reserveCards, staleCards, withRelease, withReservation, type CardLedger, type CardHolding } from "./model.ts";
import type { HostDrift, HostNotice, LoadedCard, Manifest, SpecSummary } from "./missions.ts";
import { hostReport } from "./missions.ts";
import {
  actionProblem,
  deriveMissions,
  liveSpecKeys,
  missionNameTaken,
  missionProblem,
  siteNameTaken,
  supersessionGroup,
  withFlownMark,
  type MissionRecord,
  type MissionRow,
} from "./missionRecords.ts";
import { dispatchProblem, draftProblem, type MissionSpec } from "./spec.ts";

/** Who is asking: an approved Account, as its Workspace. Built by the one
 *  access gate (`accountAccess.requireCaller`), never from anything the page
 *  sends. `ownsUnclaimed` is true for the operator's Workspace, which owns
 *  every Mission that has no ownership row (the Missions from before #244). */
export type Caller = { readonly workspaceId: string; readonly ownsUnclaimed: boolean };

/** Which Workspace owns which Mission (#244). Adapters: `missionOwners.ts`. */
export interface MissionOwners {
  /** Mission id -> Workspace id, for every Mission with an ownership row. */
  read(): Promise<Map<string, string>>;
  /** Record a new Mission as this Workspace's. False when another Workspace
   *  already owns the id; true when it is (now) this Workspace's. */
  claim(missionId: string, workspaceId: string): Promise<boolean>;
}

/** Why an action was refused, in the only vocabulary the route needs to map
 *  to a status (`missionRoute.ts`). */
export type RefusalKind =
  | "invalid" // 400 request/domain validation
  | "not_found" // 404 the Mission is gone from the store
  | "refused" // 409 a state or rule says no
  | "partial" // 502 an ordered write stopped half-way, with advice
  | "unreachable" // 502 the store could not be reached; nothing changed
  | "store_refused" // 503 B2 403 cap or unreachable key
  | "not_configured"; // 503 B2 env missing

export interface Refusal {
  ok: false;
  kind: RefusalKind;
  message: string;
  /** The exact non-`error` fields today's routes emit with this refusal. */
  extras?: Record<string, unknown>;
}

export type Outcome<T> = { ok: true; body: T } | Refusal;

/** Success bodies: exactly the fields the routes returned before the module
 *  existed, because `describeResult`/`describeSave` read them by name. */
export interface SaveBody {
  mission: MissionRecord;
  forked_from: string | null;
  superseded_on_dispatch?: string | null;
}
export interface RemoveBody {
  archived: string;
  archived_at: string;
}
export interface DispatchBody {
  key: string;
  cards: string[];
  superseded: string[];
  mission: MissionRecord;
}
export interface WithdrawBody {
  id: string;
  /** Absent on the idempotent repeat, which never had a key to report. */
  key?: string;
  withdrawn_at: string | undefined;
  cards_released: string[];
}
export interface FlownBody {
  id: string;
  mission: MissionRow | undefined;
  cards: CardHolding[];
}
export interface LoadedBody {
  id: string;
  mission: MissionRow | undefined;
}
export interface ListBody {
  unreadable: string[];
  missions: MissionRow[];
  archived_count: number;
  ledger: CardLedger;
  stale_cards: CardHolding[];
  host: { notice: HostNotice | null; drift: HostDrift | null };
  now: number;
}

export type LedgerResult = { ok: true; ledger: CardLedger } | { ok: false; reason: string };
export type SkippedResult = { ok: true } | { ok: false; reason: string };

/** What the lifecycle needs from the store. Adapters implement it; the module
 *  never sees HTTP. Exactly eight operations. */
export interface MissionStore {
  readMissions(): Promise<{ records: MissionRecord[]; unreadable: string[] }>;
  readManifest(): Promise<Manifest>;
  readLedger(): Promise<CardLedger>;
  writeMission(record: MissionRecord): Promise<void>;
  /** `change` is pure and re-run on each fresh read; a refusal comes back as a
   *  reason string (`missionStore.ts`'s Ledger merge rule). */
  updateLedger(change: (started: CardLedger) => CardLedger | string): Promise<LedgerResult>;
  /** Whole-file skip list; `[]` is a success and writes nothing. */
  addSkipped(keys: string[], at: string): Promise<SkippedResult>;
  /** Serializes and uploads the immutable Spec. */
  writeSpec(key: string, spec: MissionSpec): Promise<void>;
  /** Read-merge-write of the host's summaries file. */
  updateSummaries(key: string, summary: SpecSummary): Promise<void>;
}

/** Thrown by an adapter when B2_KEY_ID/B2_APP_KEY/B2_BUCKET are missing. */
export class StoreNotConfigured extends Error {}

export interface MissionLifecycle {
  save(caller: Caller, input: unknown): Promise<Outcome<SaveBody>>;
  remove(caller: Caller, input: unknown): Promise<Outcome<RemoveBody>>;
  dispatch(caller: Caller, input: unknown): Promise<Outcome<DispatchBody>>;
  withdraw(caller: Caller, input: unknown): Promise<Outcome<WithdrawBody>>;
  setFlown(caller: Caller, input: unknown): Promise<Outcome<FlownBody>>;
  setLoaded(caller: Caller, input: unknown): Promise<Outcome<LoadedBody>>;
  list(caller: Caller, input: { archived: boolean }): Promise<Outcome<ListBody>>;
}

/** The Cards a Load reported, cut down to what the manifest holds, or null
 *  when the list is not one: one to six Cards, each named, with a point count. */
function loadedCards(raw: unknown): LoadedCard[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) return null;
  const out: LoadedCard[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    if (!c || typeof c.card !== "string" || typeof c.name !== "string" || !Number.isInteger(c.waypoints)) return null;
    out.push({ card: c.card.slice(0, 80), name: c.name.slice(0, 120), waypoints: c.waypoints as number });
  }
  return out;
}

/** The one shape a failed store call is reported in, HTTP removed from
 *  `missionStore.ts`'s `storeFailure`. */
function failure(err: unknown): Refusal {
  if (err instanceof StoreNotConfigured) {
    return no("not_configured", "Storage is not configured. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET.");
  }
  const detail = err instanceof Error ? err.message : "unknown";
  // B2 answers 403 when the free tier's daily transaction cap is spent, or
  // when a key cannot reach this bucket. "Try again" is the wrong advice for
  // either: the cap resets at 00:00 UTC, and a key does not fix itself (#152).
  if (/\b403\b/.test(detail)) {
    return no(
      "store_refused",
      `The store refused this request (${detail}). Either today's free transaction limit is used up -- ` +
        "it resets at 00:00 UTC -- or the storage key cannot reach this bucket. Nothing was changed.",
    );
  }
  return no("unreachable", `Could not reach the store: ${detail}. Nothing was changed; try again.`);
}

function no(kind: RefusalKind, message: string, extras?: Record<string, unknown>): Refusal {
  return extras ? { ok: false, kind, message, extras } : { ok: false, kind, message };
}

export function createMissionLifecycle(store: MissionStore, owners: MissionOwners): MissionLifecycle {
  /** The reads every action answers from, cut to the Caller's Workspace.
   *  States are derived over the whole store first -- the Ledger and the
   *  manifest are the Controller's, shared by every Workspace -- and only then
   *  narrowed, so a row's state never depends on who is asking. `taken` is
   *  every id in the store, so a phone-named create can never land on another
   *  Workspace's Mission. */
  async function reads(caller: Caller) {
    const [missions, manifest, ledger, owned] = await Promise.all([
      store.readMissions(),
      store.readManifest(),
      store.readLedger(),
      owners.read(),
    ]);
    // ponytail: the whole ownership table per call; read only this Workspace's rows plus the claimed ids if it grows large.
    const mine = (id: string | undefined) => {
      const owner = id === undefined ? undefined : owned.get(id);
      return owner === undefined ? caller.ownsUnclaimed : owner === caller.workspaceId;
    };
    const all = deriveMissions(missions.records, manifest, ledger);
    return {
      records: missions.records.filter((r) => mine(r.id)),
      rows: all.filter((m) => mine(m.id)),
      all,
      taken: new Set(missions.records.map((r) => r.id)),
      unreadable: missions.unreadable,
      manifest,
      ledger,
      mine,
    };
  }

  /** A new Mission's ownership row, written before the Mission itself: a
   *  Mission that landed with no row would fall to the operator's Workspace. */
  async function claim(caller: Caller, id: string): Promise<Refusal | null> {
    if (await owners.claim(id, caller.workspaceId)) return null;
    return no("not_found", "That Mission is no longer in the store. Reload the Mission list and save it again.");
  }

  /** The refusal for a name another live Mission already has at this Site and
   *  date, or null. The fork made by editing a Dispatched Mission never comes
   *  here: replacing is its purpose (#167). */
  function nameClash(
    rows: MissionRow[],
    candidate: { id: string | null; site_id: string; date: string; name: string; site: string },
  ): Refusal | null {
    const other = missionNameTaken(rows, candidate);
    if (!other) return null;
    return no(
      "refused",
      `“${other.name}” already exists at ${candidate.site} on ${candidate.date} (${other.state}). ` +
        "Give this Mission a different name, or open that one and edit it -- a second Mission under the " +
        "same Site, date and name would replace it when Dispatched.",
      { mission: other.id },
    );
  }

  return {
    /**
     * Save a Planned Mission. No `id`: a new one. With an `id`: Planned is
     * edited in place; Dispatched and later is saved as a NEW Mission with the
     * same Site, date and name (a Spec is never edited), carrying the new id
     * and `forked_from`; Loaded is refused. An id with `LOCAL_ID_PREFIX` that
     * the store has not seen creates under it, and a `base_updated_at` that is
     * not the stored version is refused with both versions (PWA-3).
     */
    async save(caller, input) {
      const body = (input ?? {}) as Record<string, unknown>;
      // The client enforces these too; this is the copy that counts.
      const bad = missionProblem(body);
      if (bad) return no("invalid", bad);
      const badSpec = draftProblem(body.spec);
      if (badSpec) return no("invalid", `This Mission cannot be saved: ${badSpec}.`);

      const now = new Date().toISOString();
      const fields = {
        site_id: body.site_id as string,
        site: (body.site as string).trim(),
        name: (body.name as string).trim(),
        date: (body.date as string).trim(),
        spec: body.spec as MissionSpec,
      };

      try {
        // Every branch answers from the whole set: a name is only taken
        // relative to the other Missions and Sites, and the state comes from
        // the shared derivation, which needs the whole set because
        // supersession does.
        const { records, rows, taken } = await reads(caller);

        const otherSite = siteNameTaken(records, fields.site_id, fields.site);
        if (otherSite) {
          return no(
            "refused",
            `There is already a Site called “${otherSite.site}”. Choose it from the Site list instead of ` +
              "naming a new one -- two Sites with one name split their Captures between them.",
            { site: otherSite },
          );
        }

        if (body.id === undefined || body.id === null) {
          const clash = nameClash(rows, { id: null, ...fields });
          if (clash) return clash;
          const record: MissionRecord = {
            id: randomUUID(),
            created_at: now,
            updated_at: now,
            dispatched_key: null,
            ...fields,
          };
          const unclaimed = await claim(caller, record.id);
          if (unclaimed) return unclaimed;
          await store.writeMission(record);
          return { ok: true, body: { mission: record, forked_from: null } };
        }

        if (!isSafeId(body.id)) {
          return no("invalid", "That is not a Mission id. Reload the Mission list.");
        }
        const existing = records.find((r) => r.id === body.id);
        const row = rows.find((m) => m.id === body.id);
        if (!existing || !row) {
          // A phone with no signal names the Missions it creates itself; the
          // first time that name reaches the store it is a create under it.
          // An id the store holds for another Workspace is never written over.
          if (body.id.startsWith(LOCAL_ID_PREFIX) && !taken.has(body.id)) {
            const clash = nameClash(rows, { id: null, ...fields });
            if (clash) return clash;
            const record: MissionRecord = { id: body.id, created_at: now, updated_at: now, dispatched_key: null, ...fields };
            const unclaimed = await claim(caller, record.id);
            if (unclaimed) return unclaimed;
            await store.writeMission(record);
            return { ok: true, body: { mission: record, forked_from: null } };
          }
          return no(
            "not_found",
            "That Mission is no longer in the store. Reload the Mission list and save it again.",
          );
        }

        // An edit made while the phone had no signal says which version it was
        // made against; if the store has moved on, nothing is written and both
        // versions go back, for the operator to choose (PWA-3).
        if (typeof body.base_updated_at === "string" && body.base_updated_at !== existing.updated_at) {
          return no(
            "refused",
            `“${existing.name}” changed in the store after you edited it here. Nothing was saved; ` +
              "choose which version to keep.",
            { conflict: existing, state: row.state },
          );
        }

        const notNow = actionProblem("Edit", row);
        if (notNow) return no("refused", notNow, { state: row.state });

        if (row.edit === "supersede") {
          // Edit-and-redispatch is the model's native move (ADR 0021): the
          // change becomes a new Mission, and Dispatching it supersedes this
          // one and releases its Cards.
          const forked: MissionRecord = {
            id: randomUUID(),
            created_at: now,
            updated_at: now,
            dispatched_key: null,
            ...fields,
          };
          const unclaimed = await claim(caller, forked.id);
          if (unclaimed) return unclaimed;
          await store.writeMission(forked);
          return {
            ok: true,
            body: { mission: forked, forked_from: existing.id, superseded_on_dispatch: row.spec_key },
          };
        }

        // An edit in place that renames onto another live Mission would make it
        // replaceable by this one; the fork above is the only deliberate replace.
        const clash = nameClash(rows, { id: existing.id, ...fields });
        if (clash) return clash;
        const updated: MissionRecord = { ...existing, ...fields, updated_at: now };
        await store.writeMission(updated);
        return { ok: true, body: { mission: updated, forked_from: null } };
      } catch (err) {
        return failure(err);
      }
    },

    /** Remove archives; nothing is ever deleted (ADR 0021). A Mission that
     *  still holds a Card is refused: withdraw it first. */
    async remove(caller, input) {
      const id = (input as { id?: unknown })?.id;
      if (!isSafeId(id)) return no("invalid", "That is not a Mission id. Reload the Mission list.");

      try {
        const { records, rows } = await reads(caller);
        const row = rows.find((m) => m.id === id);
        const record = records.find((r) => r.id === id);
        if (!row || !record) return no("not_found", "That Mission is not in the store.");
        const notNow = actionProblem("Remove", row);
        if (notNow) return no("refused", notNow, { state: row.state });
        const archived: MissionRecord = {
          ...record,
          archived_at: record.archived_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await store.writeMission(archived);
        return { ok: true, body: { archived: id, archived_at: archived.archived_at as string } };
      } catch (err) {
        return failure(err);
      }
    },

    /** Dispatch: put the Spec into the store and reserve the Cards it will
     *  occupy. Reservation happens here, not at Load, so a Dispatch that
     *  cannot be satisfied is refused while the operator is still at the
     *  planner (ADR 0022). */
    async dispatch(caller, input) {
      const id = (input as { id?: unknown })?.id;
      if (!isSafeId(id)) return no("invalid", "That is not a Mission id. Reload the Mission list.");

      try {
        const { records, rows } = await reads(caller);
        const record = records.find((r) => r.id === id);
        const row = rows.find((m) => m.id === id);
        if (!record || !row) {
          return no("not_found", "That Mission is no longer in the store. Reload the Mission list.");
        }
        const notNow = actionProblem("Dispatch", row);
        if (notNow) return no("refused", notNow, { state: row.state });

        // The Spec carries the Site and date the Mission record holds: the
        // record is what the operator chose, and the two must not disagree.
        const spec: MissionSpec = {
          ...record.spec,
          site: record.site,
          site_id: record.site_id,
          date: record.date,
        };
        const bad = dispatchProblem(spec);
        if (bad) {
          return no(
            "invalid",
            `This Mission cannot be Dispatched: ${bad}. Fix it in the planner and Dispatch again.`,
          );
        }
        // A plan with problems is saved as an unfinished Planned Mission (the
        // planner lists them beside Save), but it is never Dispatched: the
        // same problems the planner shows, named, until they are fixed.
        const summary = preview(spec);
        if (summary.problems.length) {
          return no(
            "invalid",
            `This Mission cannot be Dispatched: ${summary.problems.join("; ")}. Fix it in the planner and Dispatch again.`,
          );
        }
        // A Site larger than one battery is flown as several Missions, and each
        // Mission occupies one Card (CONTEXT.md, Card).
        const needed = Math.max(1, summary.parts);

        const group = supersessionGroup(record);
        const replaced = rows.filter(
          (m) => m.id !== id && m.spec_key && supersessionGroup(m) === group && !m.archived,
        );
        const loaded = replaced.filter((m) => m.state === "loaded");
        if (loaded.length) {
          return no(
            "refused",
            `An earlier Mission of the same name is already Loaded onto ${loaded[0].cards.map((c) => c.card).join(", ") || "a Card"}, ` +
              "so superseding it cannot reach the file in the field. Fly it, or release its Card, then Dispatch this one.",
            { state: loaded[0].state },
          );
        }

        // The Mission's id in the key: two Missions of one Site and day
        // Dispatched in the same second shared a key, so the second overwrote
        // the first Spec, and withdrawing one released both their Cards (#152).
        const stamp = dispatchStamp(new Date(), record.id);
        const key = makeSpecKey(record.site_id, record.date, stamp);

        // A superseded Spec is immutable and stays in the store, so the host
        // must be told not to Load it -- releasing its Card is not by itself a
        // cancellation.
        if (replaced.length) {
          const skipped = await store.addSkipped(
            replaced.map((m) => m.spec_key as string),
            new Date().toISOString(),
          );
          if (!skipped.ok) return no("refused", skipped.reason);
        }

        // Cards next, and the Spec only if they were granted: a refusal must
        // leave nothing behind for the host to Collect.
        let granted: string[] = [];
        const ledgerOrWhy = await store.updateLedger((started: CardLedger) => {
          // A second press, from another window or a direct call, sees the
          // first one's Reservation here and stops, rather than reserving a
          // second Card and writing a second Spec the host would Load (#152).
          const mine = Object.values(started.holdings).filter(
            (h) => h.mission_id === record.id && !h.flown_at,
          );
          if (mine.length) {
            return (
              `This Mission was Dispatched a moment ago: ${mine.map((h) => h.card).join(", ")} ` +
              `${mine.length === 1 ? "is" : "are"} reserved for it. Reload the Mission list.`
            );
          }
          // Superseding releases what the older Specs held (ADR 0022).
          let next = started;
          for (const old of replaced) next = withRelease(next, old.spec_key as string);
          const got = reserveCards(next, needed);
          if (!got.ok) {
            return (
              `${got.reason} ` +
              "Mark a Mission Flown, or withdraw one, to release its Card -- then Dispatch this one again."
            );
          }
          granted = got.cards;
          return withReservation(next, got.cards, key, new Date().toISOString(), record.id);
        });
        // Every reason from the Ledger step carries `needed`, exactly as the
        // route's one return line did (H1).
        if (!ledgerOrWhy.ok) return no("refused", ledgerOrWhy.reason, { needed });

        try {
          await store.writeSpec(key, spec);
        } catch (err) {
          // The Spec never landed, so the Cards must not stay held.
          await store.updateLedger((started) => withRelease(started, key)).catch(() => {});
          throw err;
        }

        // The list predicts nothing any more, but the host's own summaries
        // file still carries the figures the list shows, so it is kept current.
        try {
          await store.updateSummaries(key, {
            photo_count: summary.photo_count,
            path_length_m: summary.path_length_m,
            parts: summary.parts,
          });
        } catch (err) {
          // Bookkeeping, not the Dispatch: its failure must not claim the Spec
          // is not in the store when it is.
          console.error(`dispatch wrote ${key} but the summary update failed:`, err);
        }

        const dispatched: MissionRecord = {
          ...record,
          ...(replaced.length ? { supersedes: replaced.map((m) => m.id) } : {}),
          dispatched_key: key,
          dispatched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        try {
          await store.writeMission(dispatched);
        } catch (err) {
          const detail = err instanceof Error ? err.message : "unknown";
          return no(
            "partial",
            `The Spec was Dispatched as ${key} and its Cards are reserved, but this Mission could not be ` +
              `stamped with it (${detail}), so the list will still show it as Planned. ` +
              "Do not Dispatch it again -- reload the list, and if it still reads Planned, withdraw " +
              `${key} from the store by hand.`,
            { key, cards: granted },
          );
        }

        return {
          ok: true,
          body: {
            key,
            cards: granted,
            superseded: replaced.map((m) => m.id),
            mission: dispatched,
          },
        };
      } catch (err) {
        return failure(err);
      }
    },

    /** Withdraw: cancel a Dispatched Mission before it is Collected, and give
     *  its Cards back. A Loaded one is refused -- its file is already in the
     *  field (CONTEXT.md, Withdrawn). */
    async withdraw(caller, input) {
      const id = (input as { id?: unknown })?.id;
      if (!isSafeId(id)) return no("invalid", "That is not a Mission id. Reload the Mission list.");

      try {
        const { records, rows } = await reads(caller);
        const record = records.find((r) => r.id === id);
        const row = rows.find((m) => m.id === id);
        if (!record || !row) {
          return no("not_found", "That Mission is no longer in the store. Reload the Mission list.");
        }
        // The idempotent repeat comes before any state refusal: pressing
        // Withdraw twice is a harmless no-op, not a 409.
        if (row.state === "withdrawn") {
          return { ok: true, body: { id, withdrawn_at: record.withdrawn_at, cards_released: [] } };
        }
        const notNow = actionProblem("Withdraw", row);
        if (notNow) return no("refused", notNow, { state: row.state });

        const specKey = row.spec_key as string;
        const at = new Date().toISOString();

        // Stop the host first: the Spec is immutable and stays in the store, so
        // releasing its Card without this would leave the host free to Collect
        // it and Load it into whichever Card it was handed next.
        const skipped = await store.addSkipped([specKey], at);
        if (!skipped.ok) return no("refused", skipped.reason);

        // Then give the Cards back: a Card held by a Mission nobody is going
        // to fly is the failure this whole decision exists to end.
        const released = row.cards.map((c) => c.card);
        const ledgerOrWhy = await store.updateLedger((started) => withRelease(started, specKey));
        if (!ledgerOrWhy.ok) return no("refused", ledgerOrWhy.reason);

        const withdrawn: MissionRecord = {
          ...record,
          withdrawn_at: at,
          updated_at: new Date().toISOString(),
        };
        try {
          await store.writeMission(withdrawn);
        } catch (err) {
          const detail = err instanceof Error ? err.message : "unknown";
          return no(
            "partial",
            `${released.join(", ") || "Its Cards"} were released, but this Mission could not be marked ` +
              `Withdrawn (${detail}), so the list will still show it as Dispatched. Reload the list and withdraw it again.`,
          );
        }

        return {
          ok: true,
          body: { id, key: specKey, withdrawn_at: withdrawn.withdrawn_at, cards_released: released },
        };
      } catch (err) {
        return failure(err);
      }
    },

    /** Flown is asserted, not observed; the operator's answer decides it in
     *  both directions (ADR 0021). Repeats are accepted. */
    async setFlown(caller, input) {
      const { id, flown } = (input ?? {}) as { id?: unknown; flown?: unknown };
      if (!isSafeId(id)) return no("invalid", "That is not a Mission id. Reload the Mission list.");
      if (typeof flown !== "boolean") {
        return no("invalid", "Say whether this Mission was Flown: send { flown: true } or { flown: false }.");
      }

      try {
        const { records, rows, manifest, ledger } = await reads(caller);
        const record = records.find((r) => r.id === id);
        const row = rows.find((m) => m.id === id);
        if (!record || !row) {
          return no("not_found", "That Mission is no longer in the store. Reload the Mission list.");
        }
        // Only a Mission on the Controller can have been flown (#163), and only
        // a Flown one unmarked. Pressing either twice is a repeat, not a change.
        const repeat = flown ? row.state === "flown" : row.state === "loaded";
        const notNow = repeat ? null : actionProblem(flown ? "Mark Flown" : "Unmark Flown", row);
        if (notNow) return no("refused", notNow, { state: row.state });
        if (!record.dispatched_key) {
          return no(
            "refused",
            "This Mission has not been Dispatched, so there is nothing that could have been flown. " +
              "Dispatch it first.",
            { state: row.state },
          );
        }
        if (record.withdrawn_at) {
          return no(
            "refused",
            "This Mission was Withdrawn before it reached the Controller, so it cannot be marked Flown.",
            { state: row.state },
          );
        }

        const at = new Date().toISOString();
        const specKey = record.dispatched_key;

        // Unmarking takes the Card back, which is only honest if it is still
        // free. The Cards it was written to, not only the ones the Ledger still
        // says it holds: once a Card goes to another Mission this Mission's
        // holding is gone, and "unmarked, it holds its Card again" was said
        // while it held nothing (#152).
        if (!flown) {
          const had = new Set([...row.cards.map((h) => h.card), ...row.loaded_cards.map((c) => c.card)]);
          const taken = [...had]
            .map((card) => ledger.holdings[card])
            .filter((h) => h && h.spec_key !== specKey);
          if (taken.length) {
            return no(
              "refused",
              `${taken.map((h) => h.card).join(", ")} now holds another Mission, so unmarking this one ` +
                "would claim a Card that is not free. Withdraw that Mission first if it is the wrong one.",
            );
          }
        }

        const ledgerOrWhy = await store.updateLedger((started) =>
          withFlownMark(started, specKey, flown ? at : null),
        );
        if (!ledgerOrWhy.ok) return no("refused", ledgerOrWhy.reason);

        const marked: MissionRecord = { ...record, flown_mark: { flown, at }, updated_at: at };
        try {
          await store.writeMission(marked);
        } catch (err) {
          const detail = err instanceof Error ? err.message : "unknown";
          return no(
            "partial",
            `The Card Ledger was updated but this Mission's mark was not saved (${detail}), so the list and ` +
              "the Ledger now disagree. Reload the Mission list and set it again.",
          );
        }

        // The row is re-derived with the marked record substituted and the
        // Ledger just written -- never by re-reading the store.
        const after = deriveMissions(
          records.map((r) => (r.id === id ? marked : r)),
          manifest,
          ledgerOrWhy.ledger,
        ).find((m) => m.id === id);
        return { ok: true, body: { id, mission: after, cards: after?.cards ?? [] } };
      } catch (err) {
        return failure(err);
      }
    },

    /** The app reports a Load the board made, from the aircraft (PWA-4, #318).
     *  The host's own manifest wins once it speaks; this fills the gap when the
     *  board had no signal to say so. Repeats are accepted. */
    async setLoaded(caller, input) {
      const { id, cards } = (input ?? {}) as { id?: unknown; cards?: unknown };
      if (!isSafeId(id)) return no("invalid", "That is not a Mission id. Reload the Mission list.");
      const written = loadedCards(cards);
      if (!written) return no("invalid", "Send the Cards the board wrote: { id, cards: [{ card, name, waypoints }] }.");

      try {
        const { records, rows, manifest, ledger } = await reads(caller);
        const record = records.find((r) => r.id === id);
        const row = rows.find((m) => m.id === id);
        if (!record || !row) {
          return no("not_found", "That Mission is no longer in the store. Reload the Mission list.");
        }
        if (row.state === "loaded") return { ok: true, body: { id, mission: row } };
        if (row.state !== "dispatched" && row.state !== "collected") {
          return no(
            "refused",
            `This Mission is ${row.state}, so a Load of it cannot be recorded. Reload the Mission list.`,
            { state: row.state },
          );
        }

        const at = new Date().toISOString();
        const marked: MissionRecord = { ...record, loaded_mark: { at, cards: written }, updated_at: at };
        await store.writeMission(marked);
        const after = deriveMissions(
          records.map((r) => (r.id === id ? marked : r)),
          manifest,
          ledger,
        ).find((m) => m.id === id);
        return { ok: true, body: { id, mission: after } };
      } catch (err) {
        return failure(err);
      }
    },

    /** GET list: every Mission of the Caller's Workspace, newest first,
     *  behind the archived filter. The Ledger and the host's word are the
     *  Controller's: a Card holding is shown only to the Workspace whose
     *  Mission holds it, and the host's report only to the operator's. */
    async list(caller, input) {
      try {
        const { rows, all, unreadable, manifest, ledger, mine } = await reads(caller);
        const holdings = Object.fromEntries(Object.entries(ledger.holdings).filter(([, h]) => mine(h.mission_id)));
        return {
          ok: true,
          body: {
            unreadable: caller.ownsUnclaimed ? unreadable : [],
            missions: input.archived ? rows : rows.filter((m) => !m.archived),
            archived_count: rows.filter((m) => m.archived).length,
            ledger: { ...ledger, holdings },
            // A Card holding a Mission that is no longer current: the
            // Controller's own labels are frozen at creation, so the planner is
            // the only thing that can say do not fly this (ADR 0022).
            stale_cards: staleCards({ ...ledger, holdings }, liveSpecKeys(all)),
            host: caller.ownsUnclaimed ? hostReport(manifest) : { notice: null, drift: null },
            now: Date.now(),
          },
        };
      } catch (err) {
        return failure(err);
      }
    },
  };
}
