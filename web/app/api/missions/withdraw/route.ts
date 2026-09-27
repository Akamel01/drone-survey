import { authProblem } from "@/lib/auth";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
import { b2MissionStore } from "@/lib/missionStore";

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
  return respond(await createMissionLifecycle(b2MissionStore()).withdraw({ kind: "passphrase" }, raw));
}
