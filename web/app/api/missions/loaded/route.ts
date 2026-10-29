import { requireCaller } from "@/lib/accountAccess";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
import { pgMissionOwners } from "@/lib/missionOwners";
import { b2MissionStore } from "@/lib/missionStore";

// The app at the aircraft reports a Load the board made (PWA-4, #318). The
// board tells the store itself when it has signal; this is for when it had none.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/** POST /api/missions/loaded  { id, cards: [{ card, name, waypoints }] } */
export async function POST(request: Request) {
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id, cards }." }, { status: 400 });
  }
  return respond(await createMissionLifecycle(b2MissionStore(), pgMissionOwners()).setLoaded(gate.caller, raw));
}
