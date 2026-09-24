import { authProblem } from "@/lib/auth";
import { isSafeId } from "@/lib/keys";
import { withRelease } from "@/lib/model";
import { actionProblem, deriveMissions, type MissionRecord } from "@/lib/missionRecords";
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

// Withdraw: cancel a Dispatched Mission before it is Collected, and give its
// Cards back. Nothing reached the Controller, so nothing has to be undone
// there (CONTEXT.md, Withdrawn).
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/**
 * POST /api/missions/withdraw  { id }
 *
 * A Dispatched or Collected Mission can be withdrawn: neither has reached the
 * Controller. The host re-reads the skip list at the start of every Load and
 * Loads only Specs that hold a Reservation (#161), so releasing the Card stops
 * a Collected Spec too (#165). A Loaded one is refused -- its file is already
 * in the field, and withdrawing cannot reach it.
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
    if (row.state === "withdrawn") {
      return Response.json({ id, withdrawn_at: record.withdrawn_at, cards_released: [] });
    }
    const notNow = actionProblem("Withdraw", row);
    if (notNow) return Response.json({ error: notNow, state: row.state }, { status: 409 });

    const specKey = row.spec_key as string;
    const at = new Date().toISOString();

    // Stop the host first. A Spec is immutable and stays in the store, so
    // releasing its Card without this would leave the host free to Collect it
    // and Load it into whichever Card it was handed next.
    const skipWhy = await addSkipped(s.read, s.write, s.bucket, [specKey], at);
    if (skipWhy) return Response.json({ error: skipWhy }, { status: 409 });

    // Then give the Cards back: a Card held by a Mission nobody is going to
    // fly is the failure this whole decision exists to end.
    const released = row.cards.map((c) => c.card);
    const ledgerOrWhy = await updateLedger(s.read, s.write, s.bucket, (started) =>
      withRelease(started, specKey),
    );
    if (typeof ledgerOrWhy === "string") {
      return Response.json({ error: ledgerOrWhy }, { status: 409 });
    }

    const withdrawn: MissionRecord = {
      ...record,
      withdrawn_at: at,
      updated_at: new Date().toISOString(),
    };
    try {
      await writeMission(s.write, withdrawn);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      return Response.json(
        {
          error:
            `${released.join(", ") || "Its Cards"} were released, but this Mission could not be marked ` +
            `Withdrawn (${detail}), so the list will still show it as Dispatched. Reload the list and withdraw it again.`,
        },
        { status: 502 },
      );
    }

    return Response.json({
      id,
      key: specKey,
      withdrawn_at: withdrawn.withdrawn_at,
      cards_released: released,
    });
  } catch (err) {
    return storeFailure(err);
  }
}
