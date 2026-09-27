import { authProblem } from "@/lib/auth";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
import { b2MissionStore } from "@/lib/missionStore";

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
 * Dispatch with no Card free, naming what is in the way. The lifecycle module
 * owns the ordered writes and every refusal.
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
  return respond(await createMissionLifecycle(b2MissionStore()).dispatch({ kind: "passphrase" }, raw));
}
