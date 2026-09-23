import { authProblem } from "@/lib/auth";
import { isSafeId } from "@/lib/keys";
import { deriveMissions, withFlownMark, type MissionRecord } from "@/lib/missionRecords";
import {
  readLedger,
  readManifest,
  readMissions,
  sessions,
  storeFailure,
  updateLedger,
  writeMission,
} from "@/lib/missionStore";

// Flown is asserted, not merely observed. Imagery arriving for a Site and date
// is evidence the system infers from; the operator's own mark is what decides
// it, in both directions, and where the two disagree both are recorded rather
// than the difference being resolved silently (ADR 0021).
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/**
 * POST /api/missions/flown  { id, flown: boolean }
 *
 * Marking Flown releases this Mission's Cards; unmarking takes them back, and
 * is refused when another Mission has been given one of them in the meantime,
 * naming which.
 */
export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id, flown }." }, { status: 400 });
  }
  const { id, flown } = (raw ?? {}) as { id?: unknown; flown?: unknown };
  if (!isSafeId(id)) {
    return Response.json({ error: "That is not a Mission id. Reload the Mission list." }, { status: 400 });
  }
  if (typeof flown !== "boolean") {
    return Response.json(
      { error: "Say whether this Mission was Flown: send { flown: true } or { flown: false }." },
      { status: 400 },
    );
  }

  const s = await sessions();
  if (s instanceof Response) return s;

  try {
    const [records, manifest, ledger] = await Promise.all([
      readMissions(s.read, s.bucket),
      readManifest(s.read, s.bucket),
      readLedger(s.read, s.bucket),
    ]);
    const record = records.find((r) => r.id === id);
    const row = deriveMissions(records, manifest, ledger).find((m) => m.id === id);
    if (!record || !row) {
      return Response.json(
        { error: "That Mission is no longer in the store. Reload the Mission list." },
        { status: 404 },
      );
    }
    if (!record.dispatched_key) {
      return Response.json(
        {
          error:
            "This Mission has not been Dispatched, so there is nothing that could have been flown. " +
            "Dispatch it first.",
          state: row.state,
        },
        { status: 409 },
      );
    }
    if (record.withdrawn_at) {
      return Response.json(
        {
          error: "This Mission was Withdrawn before it reached the Controller, so it cannot be marked Flown.",
          state: row.state,
        },
        { status: 409 },
      );
    }

    const at = new Date().toISOString();
    const specKey = record.dispatched_key;

    // Unmarking takes the Card back, which is only honest if it is still free.
    if (!flown) {
      const taken = row.cards
        .map((h) => ledger.holdings[h.card])
        .filter((h) => h && h.spec_key !== specKey);
      if (taken.length) {
        return Response.json(
          {
            error:
              `${taken.map((h) => h.card).join(", ")} now holds another Mission, so unmarking this one ` +
              "would claim a Card that is not free. Withdraw that Mission first if it is the wrong one.",
          },
          { status: 409 },
        );
      }
    }

    const ledgerOrWhy = await updateLedger(s.read, s.write, s.bucket, (started) =>
      withFlownMark(started, specKey, flown ? at : null),
    );
    if (typeof ledgerOrWhy === "string") {
      return Response.json({ error: ledgerOrWhy }, { status: 409 });
    }

    const marked: MissionRecord = { ...record, flown_mark: { flown, at }, updated_at: at };
    try {
      await writeMission(s.write, marked);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      return Response.json(
        {
          error:
            `The Card Ledger was updated but this Mission's mark was not saved (${detail}), so the list and ` +
            "the Ledger now disagree. Reload the Mission list and set it again.",
        },
        { status: 502 },
      );
    }

    const after = deriveMissions(
      records.map((r) => (r.id === id ? marked : r)),
      manifest,
      ledgerOrWhy,
    ).find((m) => m.id === id);
    return Response.json({ id, mission: after, cards: after?.cards ?? [] });
  } catch (err) {
    return storeFailure(err);
  }
}
