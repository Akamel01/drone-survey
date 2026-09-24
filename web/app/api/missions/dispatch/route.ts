import { authProblem } from "@/lib/auth";
import { downloadFile, uploadFile } from "@/lib/b2";
import { SUMMARIES_KEY, dispatchStamp, isSafeId, makeSpecKey } from "@/lib/keys";
import { preview } from "@/lib/mission";
import type { SpecSummary } from "@/lib/missions";
import { reserveCards, withRelease, withReservation, type CardLedger } from "@/lib/model";
import { deriveMissions, supersessionGroup, type MissionRecord } from "@/lib/missionRecords";
import {
  addSkipped,
  readLedger,
  readManifest,
  readMissions,
  sessions,
  storeFailure,
  updateLedger,
  writeMission,
} from "@/lib/missionStore";
import { dispatchProblem, type MissionSpec } from "@/lib/spec";

// Dispatch: put this Mission's Spec into the store, and reserve the Cards it
// will occupy.
//
// Reservation happens here, not at Load, so a Dispatch that cannot be
// satisfied is refused while the operator is still standing at the planner and
// can do something about it -- rather than at a plug-in they may be hundreds
// of kilometres from home for (ADR 0022).
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/**
 * POST /api/missions/dispatch  { id }
 *
 * Refuses: a Mission that is not Planned; a Spec that is not flyable; and a
 * Dispatch with no Card free, naming what is in the way.
 */
export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id }." }, { status: 400 });
  }
  const id = (raw as { id?: unknown })?.id;
  if (!isSafeId(id)) {
    return Response.json({ error: "That is not a Mission id. Reload the Mission list." }, { status: 400 });
  }

  const s = await sessions();
  if (s instanceof Response) return s;

  try {
    const [records, manifest, ledgerNow] = await Promise.all([
      readMissions(s.read, s.bucket),
      readManifest(s.read, s.bucket),
      readLedger(s.read, s.bucket),
    ]);
    const record = records.find((r) => r.id === id);
    const rows = deriveMissions(records, manifest, ledgerNow);
    const row = rows.find((m) => m.id === id);
    if (!record || !row) {
      return Response.json(
        { error: "That Mission is no longer in the store. Reload the Mission list." },
        { status: 404 },
      );
    }
    if (row.state !== "planned") {
      return Response.json(
        {
          error:
            `This Mission is ${row.state}, and only a Planned Mission is Dispatched. ` +
            "To change a Mission that has already been Dispatched, save it again -- that makes a new Mission, " +
            "and Dispatching it supersedes this one.",
          state: row.state,
        },
        { status: 409 },
      );
    }

    // The Spec carries the Site and date the Mission record holds: the record
    // is what the operator chose, and the two must not be able to disagree.
    const spec: MissionSpec = {
      ...record.spec,
      site: record.site,
      site_id: record.site_id,
      date: record.date,
    };
    const bad = dispatchProblem(spec);
    if (bad) {
      return Response.json(
        { error: `This Mission cannot be Dispatched: ${bad}. Fix it on the Plan tab and Dispatch again.` },
        { status: 400 },
      );
    }
    // A Site larger than one battery is flown as several Missions, and each
    // Mission occupies one Card (CONTEXT.md, Card).
    const summary = preview(spec);
    const needed = Math.max(1, summary.parts);

    const group = supersessionGroup(record);
    const replaced = rows.filter(
      (m) => m.id !== id && m.spec_key && supersessionGroup(m) === group && !m.archived,
    );
    const loaded = replaced.filter((m) => m.state === "loaded");
    if (loaded.length) {
      return Response.json(
        {
          error:
            `An earlier Mission of the same name is already Loaded onto ${loaded[0].cards.map((c) => c.card).join(", ") || "a Card"}, ` +
            "so superseding it cannot reach the file in the field. Fly it, or release its Card, then Dispatch this one.",
          state: loaded[0].state,
        },
        { status: 409 },
      );
    }

    // The Mission's id in the key: two Missions of one Site and day Dispatched
    // in the same second shared a key, so the second overwrote the first
    // Spec, and withdrawing one released both their Cards (#152).
    const stamp = dispatchStamp(new Date(), record.id);
    const key = makeSpecKey(record.site_id, record.date, stamp);

    // A superseded Spec is immutable and stays in the store, so the host must
    // be told not to Load it -- releasing its Card is not by itself a
    // cancellation.
    if (replaced.length) {
      const skipWhy = await addSkipped(
        s.read,
        s.write,
        s.bucket,
        replaced.map((m) => m.spec_key as string),
        new Date().toISOString(),
      );
      if (skipWhy) return Response.json({ error: skipWhy }, { status: 409 });
    }

    // Cards next, and the Spec only if they were granted: a refusal must leave
    // nothing behind for the host to Collect.
    let granted: string[] = [];
    const ledgerOrWhy = await updateLedger(s.read, s.write, s.bucket, (started: CardLedger) => {
      // Superseding releases what the older Specs held: what they hold is no
      // longer current (ADR 0022).
      // A second press, from another window or a direct call, sees the first
      // one's Reservation here and stops, rather than reserving a second Card
      // and writing a second Spec the host would Load (#152).
      const mine = Object.values(started.holdings).filter((h) => h.mission_id === record.id && !h.flown_at);
      if (mine.length) {
        return (
          `This Mission was Dispatched a moment ago: ${mine.map((h) => h.card).join(", ")} ` +
          `${mine.length === 1 ? "is" : "are"} reserved for it. Reload the Mission list.`
        );
      }
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
    if (typeof ledgerOrWhy === "string") {
      return Response.json({ error: ledgerOrWhy, needed }, { status: 409 });
    }

    try {
      await uploadFile(s.write, key, Buffer.from(JSON.stringify(spec, null, 2)));
    } catch (err) {
      // The Spec never landed, so the Cards must not stay held.
      await updateLedger(s.read, s.write, s.bucket, (started) => withRelease(started, key)).catch(() => {});
      throw err;
    }

    // The Status tab predicts nothing any more, but the host's own summaries
    // file still carries the figures the list shows, so it is kept current.
    try {
      const existing = await downloadFile(s.read, s.bucket, SUMMARIES_KEY);
      const summaries: Record<string, SpecSummary> = existing
        ? (JSON.parse(existing.toString()) as Record<string, SpecSummary>)
        : {};
      summaries[key] = {
        photo_count: summary.photo_count,
        path_length_m: summary.path_length_m,
        parts: summary.parts,
      };
      await uploadFile(s.write, SUMMARIES_KEY, Buffer.from(JSON.stringify(summaries, null, 2)));
    } catch (err) {
      // Bookkeeping, not the Dispatch: its failure must not claim the Spec is
      // not in the store when it is.
      console.error(`dispatch wrote ${key} but the summary update failed:`, err);
    }

    const dispatched: MissionRecord = {
      ...record,
      dispatched_key: key,
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await writeMission(s.write, dispatched);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      return Response.json(
        {
          error:
            `The Spec was Dispatched as ${key} and its Cards are reserved, but this Mission could not be ` +
            `stamped with it (${detail}), so the list will still show it as Planned. ` +
            "Do not Dispatch it again -- reload the list, and if it still reads Planned, withdraw " +
            `${key} from the store by hand.`,
          key,
          cards: granted,
        },
        { status: 502 },
      );
    }

    return Response.json({
      key,
      cards: granted,
      superseded: replaced.map((m) => m.id),
      mission: dispatched,
    });
  } catch (err) {
    return storeFailure(err);
  }
}
