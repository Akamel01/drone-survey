import { requireCaller } from "@/lib/accountAccess";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { afterResponse, respond } from "@/lib/missionRoute";
import { pgMissionOwners } from "@/lib/missionOwners";
import { b2MissionStore } from "@/lib/missionStore";
import { notify, withdrawNotice } from "@/lib/push";

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
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id }." }, { status: 400 });
  }
  const outcome = await createMissionLifecycle(b2MissionStore(), pgMissionOwners()).withdraw(gate.caller, raw);
  // The repeat carries no name and tells nobody: it changed nothing (#319).
  if (outcome.ok && outcome.body.name !== undefined) {
    const { workspaceId } = gate.caller;
    const { id, name, cards_released } = outcome.body;
    afterResponse(() => notify(workspaceId, [withdrawNotice({ id, name, cards_released })]));
  }
  return respond(outcome);
}
