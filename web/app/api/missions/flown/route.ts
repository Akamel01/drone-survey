import { requireCaller } from "@/lib/accountAccess";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
import { pgMissionOwners } from "@/lib/missionOwners";
import { b2MissionStore } from "@/lib/missionStore";

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
 * naming which. The lifecycle module owns the request shape and every refusal.
 */
export async function POST(request: Request) {
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id, flown }." }, { status: 400 });
  }
  return respond(await createMissionLifecycle(b2MissionStore(), pgMissionOwners()).setFlown(gate.caller, raw));
}
