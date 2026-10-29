import { requireAdmin } from "@/lib/accountAccess";
import { regionsAction, regionsView } from "@/lib/mapRegionsApi";
import { b2MapStore } from "@/lib/mapStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Developer section's regions (PWA-2, #315): the offline map archives in B2,
// and the cuts queued for the host. The operator (admin) only, checked on the
// server from the session's role.

const noStorage = () =>
  Response.json({ error: "This deployment has no storage credential, so it cannot reach the map regions." }, { status: 503 });

function failed(err: unknown) {
  const detail = err instanceof Error ? err.message : "unknown";
  return Response.json({ error: `The map regions could not be reached: ${detail}` }, { status: 502 });
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const store = b2MapStore();
  if (!store) return noStorage();
  try {
    return Response.json(await regionsView(store));
  } catch (err) {
    return failed(err);
  }
}

/** { action: "add" | "remove", id }. */
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const store = b2MapStore();
  if (!store) return noStorage();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { action, id }." }, { status: 400 });
  }
  try {
    const answer = await regionsAction(store, body, gate.session.user.email);
    return Response.json(answer.body, { status: answer.status });
  } catch (err) {
    return failed(err);
  }
}
