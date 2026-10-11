import { requireCaller } from "@/lib/accountAccess";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { afterResponse, respond } from "@/lib/missionRoute";
import { pgMissionOwners } from "@/lib/missionOwners";
import { b2MissionStore } from "@/lib/missionStore";
import { dispatchNotices, notify } from "@/lib/push";

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
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id }." }, { status: 400 });
  }
  const outcome = await createMissionLifecycle(b2MissionStore(), pgMissionOwners()).dispatch(gate.caller, raw);
  // Dispatched, and Superseded for the earlier one it replaced: told to the
  // Workspace's phones after the answer has gone (#319).
  if (outcome.ok) {
    const { workspaceId } = gate.caller;
    afterResponse(() => notify(workspaceId, dispatchNotices(outcome.body)));
  }
  return respond(outcome);
}
