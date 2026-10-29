import { requireCaller } from "@/lib/accountAccess";
import { parseSpecKey } from "@/lib/keys";
import { downloadFile, authorize, b2ReadEnv } from "@/lib/b2";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
import { pgMissionOwners } from "@/lib/missionOwners";
import { b2MissionStore } from "@/lib/missionStore";

// Read-only: serve an immutable Spec body by key -- only a Spec Dispatched
// from one of the caller's Workspace's Missions; any other key is a 404.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

export async function GET(request: Request) {
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  const parsed = parseSpecKey(key);
  if (!parsed) return Response.json({ error: "Invalid spec key" }, { status: 404 });
  const read = await createMissionLifecycle(b2MissionStore(), pgMissionOwners()).list(gate.caller, { archived: true });
  if (!read.ok) return respond(read);
  if (!read.body.missions.some((m) => m.spec_key === key)) {
    return Response.json({ error: "Spec not found" }, { status: 404 });
  }

  const readEnv = b2ReadEnv();
  if (!readEnv) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  try {
    const session = await authorize(readEnv);
    const raw = await downloadFile(session, readEnv.bucket, key);
    if (!raw) return Response.json({ error: "Spec not found" }, { status: 404 });
    const obj = JSON.parse(raw.toString());
    return Response.json(obj);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}
