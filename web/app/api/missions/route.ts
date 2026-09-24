import { randomUUID } from "node:crypto";
import { authProblem } from "@/lib/auth";
import { isSafeId } from "@/lib/keys";
import { staleCards } from "@/lib/model";
import {
  actionProblem,
  deriveMissions,
  liveSpecKeys,
  missionNameTaken,
  missionProblem,
  siteNameTaken,
  type MissionRecord,
  type MissionRow,
} from "@/lib/missionRecords";
import { hostReport } from "@/lib/missions";
import {
  readLedger,
  readManifest,
  readMissions,
  sessions,
  storeFailure,
  writeMission,
} from "@/lib/missionStore";
import { draftProblem, type MissionSpec } from "@/lib/spec";

// The Mission list, and saving one. Missions live in the shared store rather
// than in browser local storage: the operator lost sight of their saved
// Missions simply by opening a different deployment URL, and a cleared cache
// would have destroyed them with no warning (ADR 0021). The browser keeps the
// edit in progress and nothing else.
//
// The storage credential lives here and never reaches the browser (ADR 0017).
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/**
 * GET /api/missions
 *
 * Every Mission, newest first, each with the one derived state, the Cards it
 * holds, and both answers about Flown. `?archived=1` includes Missions that
 * are Flown, Withdrawn, Superseded or removed -- nothing is deleted, so they
 * are behind a filter rather than absent.
 */
export async function GET(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const s = await sessions();
  if (s instanceof Response) return s;
  const wantArchived = new URL(request.url).searchParams.get("archived") === "1";
  try {
    const unreadable: string[] = [];
    const [records, manifest, ledger] = await Promise.all([
      readMissions(s.read, s.bucket, unreadable),
      readManifest(s.read, s.bucket),
      readLedger(s.read, s.bucket),
    ]);
    const all = deriveMissions(records, manifest, ledger);
    return Response.json({
      unreadable,
      missions: wantArchived ? all : all.filter((m) => !m.archived),
      archived_count: all.filter((m) => m.archived).length,
      ledger,
      // A Card holding a Mission that is no longer current: the Controller's
      // own labels are frozen at creation, so the planner is the only thing
      // that can say do not fly this (ADR 0022).
      stale_cards: staleCards(ledger, liveSpecKeys(all)),
      // A refused Load is about the Controller, not one row, and the rows it
      // held up cannot say so on their own: without this the list promised
      // "plug in and it is written" while the host refused every minute (#162).
      host: hostReport(manifest),
      now: Date.now(),
    });
  } catch (err) {
    return storeFailure(err);
  }
}

/**
 * POST /api/missions
 *
 * Saves a Planned Mission. With no `id`, a new one. With an `id`:
 *  - Planned          edited in place;
 *  - Dispatched and   saved as a NEW Mission with the same Site, date and
 *    later             name, because a Spec is never edited -- a change is a
 *                      new Spec that supersedes the earlier one. The response
 *                      carries the new id and `forked_from`;
 *  - Loaded           refused: a file is already in the field.
 */
export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send the Mission as JSON." }, { status: 400 });
  }
  const body = (raw ?? {}) as Record<string, unknown>;

  // The client enforces these too; this is the copy that counts.
  const bad = missionProblem(body);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  const badSpec = draftProblem(body.spec);
  if (badSpec) return Response.json({ error: `This Mission cannot be saved: ${badSpec}.` }, { status: 400 });

  const s = await sessions();
  if (s instanceof Response) return s;

  const now = new Date().toISOString();
  const fields = {
    site_id: body.site_id as string,
    site: (body.site as string).trim(),
    name: (body.name as string).trim(),
    date: (body.date as string).trim(),
    spec: body.spec as MissionSpec,
  };

  try {
    // Every branch answers from the whole set: a name is only taken relative
    // to the other Missions and Sites, and the state comes from the shared
    // derivation, which needs the whole set because supersession does.
    const [records, manifest, ledger] = await Promise.all([
      readMissions(s.read, s.bucket),
      readManifest(s.read, s.bucket),
      readLedger(s.read, s.bucket),
    ]);
    const rows = deriveMissions(records, manifest, ledger);

    const otherSite = siteNameTaken(records, fields.site_id, fields.site);
    if (otherSite) {
      return Response.json(
        {
          error:
            `There is already a Site called “${otherSite.site}”. Choose it from the Site list instead of ` +
            "naming a new one -- two Sites with one name split their Captures between them.",
          site: otherSite,
        },
        { status: 409 },
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
      await writeMission(s.write, record);
      return Response.json({ mission: record, forked_from: null });
    }

    if (!isSafeId(body.id)) {
      return Response.json({ error: "That is not a Mission id. Reload the Mission list." }, { status: 400 });
    }
    const existing = records.find((r) => r.id === body.id);
    const row = rows.find((m) => m.id === body.id);
    if (!existing || !row) {
      return Response.json(
        { error: "That Mission is no longer in the store. Reload the Mission list and save it again." },
        { status: 404 },
      );
    }

    const notNow = actionProblem("Edit", row);
    if (notNow) return Response.json({ error: notNow, state: row.state }, { status: 409 });

    if (row.edit === "supersede") {
      // Edit-and-redispatch is the model's native move (ADR 0021): the change
      // becomes a new Mission, and Dispatching it supersedes this one and
      // releases its Cards.
      const forked: MissionRecord = {
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        dispatched_key: null,
        ...fields,
      };
      await writeMission(s.write, forked);
      return Response.json({ mission: forked, forked_from: existing.id, superseded_on_dispatch: row.spec_key });
    }

    // An edit in place that renames onto another live Mission would make it
    // replaceable by this one; the fork above is the only deliberate replace.
    const clash = nameClash(rows, { id: existing.id, ...fields });
    if (clash) return clash;
    const updated: MissionRecord = { ...existing, ...fields, updated_at: now };
    await writeMission(s.write, updated);
    return Response.json({ mission: updated, forked_from: null });
  } catch (err) {
    return storeFailure(err);
  }
}

/** The refusal for a name another live Mission already has at this Site and
 *  date, or null. The fork made by editing a Dispatched Mission never comes
 *  here: replacing is its purpose (#167). */
function nameClash(
  rows: MissionRow[],
  candidate: { id: string | null; site_id: string; date: string; name: string; site: string },
): Response | null {
  const other = missionNameTaken(rows, candidate);
  if (!other) return null;
  return Response.json(
    {
      error:
        `“${other.name}” already exists at ${candidate.site} on ${candidate.date} (${other.state}). ` +
        "Give this Mission a different name, or open that one and edit it -- a second Mission under the " +
        "same Site, date and name would replace it when Dispatched.",
      mission: other.id,
    },
    { status: 409 },
  );
}

/**
 * DELETE /api/missions?id=<id>
 *
 * Removing a Mission archives it. Nothing is ever deleted (ADR 0021), so the
 * record stays and is hidden behind the archived filter. A Mission that still
 * holds a Card is refused: withdraw it first, so the Card comes back.
 */
export async function DELETE(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isSafeId(id)) {
    return Response.json({ error: "That is not a Mission id. Reload the Mission list." }, { status: 400 });
  }
  const s = await sessions();
  if (s instanceof Response) return s;
  try {
    const [records, manifest, ledger] = await Promise.all([
      readMissions(s.read, s.bucket),
      readManifest(s.read, s.bucket),
      readLedger(s.read, s.bucket),
    ]);
    const row = deriveMissions(records, manifest, ledger).find((m) => m.id === id);
    const record = records.find((r) => r.id === id);
    if (!row || !record) {
      return Response.json({ error: "That Mission is not in the store." }, { status: 404 });
    }
    const notNow = actionProblem("Remove", row);
    if (notNow) return Response.json({ error: notNow, state: row.state }, { status: 409 });
    const archived: MissionRecord = {
      ...record,
      archived_at: record.archived_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await writeMission(s.write, archived);
    return Response.json({ archived: id, archived_at: archived.archived_at });
  } catch (err) {
    return storeFailure(err);
  }
}
