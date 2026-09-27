import { authProblem } from "@/lib/auth";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
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
  const denied = authProblem(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id, flown }." }, { status: 400 });
  }
  return respond(await createMissionLifecycle(b2MissionStore()).setFlown({ kind: "passphrase" }, raw));
}
