import { timingSafeEqual } from "node:crypto";
import { pgMissionOwners } from "@/lib/missionOwners";
import { b2MissionStore } from "@/lib/missionStore";
import { hostEvent, hostNotices, notify } from "@/lib/push";

// The Linux host tells the phones what only it sees (PWA-5, #319): Collected,
// Loaded (with the Card to open) and a Load refused. The host has no session,
// so it carries a shared token of its own, `x-push-token`, set as
// PUSH_HOST_TOKEN here and in the host's ~/.config/wayfinder/push.env. The
// token can make the planner send notices, nothing else: it reads Mission
// names and owners to word them, and writes nothing to the store.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

function tokenOk(given: string | null): boolean {
  const want = process.env.PUSH_HOST_TOKEN;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/push/host  { event: "collected" | "loaded" | "refused", ... } */
export async function POST(request: Request) {
  if (!process.env.PUSH_HOST_TOKEN) {
    return Response.json({ error: "Host notifications are not set up: PUSH_HOST_TOKEN is not set." }, { status: 503 });
  }
  if (!tokenOk(request.headers.get("x-push-token"))) {
    return Response.json({ error: "That is not the host's push token." }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }
  const event = hostEvent(raw);
  if (!event) return Response.json({ error: "That is not an event the host sends." }, { status: 400 });

  // A refusal names no Mission and goes to the operator; the rest need the
  // Missions' names and owners. If the store cannot be read, the operator
  // is still told, by Spec key.
  let records: Awaited<ReturnType<ReturnType<typeof b2MissionStore>["readMissions"]>>["records"] = [];
  let owned = new Map<string, string>();
  if (event.event !== "refused") {
    try {
      [{ records }, owned] = await Promise.all([b2MissionStore().readMissions(), pgMissionOwners().read()]);
    } catch (error) {
      console.error("push/host: Missions not read; telling the operator by key:", error instanceof Error ? error.message : error);
    }
  }
  const told = hostNotices(event, records, owned);
  // Grouped by Workspace, so each is sent its notices in one pass.
  const byWorkspace = new Map<string | null, typeof told>();
  for (const t of told) byWorkspace.set(t.workspace, [...(byWorkspace.get(t.workspace) ?? []), t]);
  await Promise.all([...byWorkspace].map(([w, ts]) => notify(w, ts.map((t) => t.notice))));
  return Response.json({ told: told.length });
}
