import { requireCaller } from "@/lib/accountAccess";
import { ntfyTopic, pushConfig, setNtfy, subscribe, subscriptionOf, unsubscribe } from "@/lib/push";

// This Account's notifications (PWA-5, #319): turn them on or off for the
// device asking, and the ntfy.sh fallback on or off for the Account. A
// subscription belongs to the Account that made it.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

async function state(accountId: string) {
  const config = pushConfig();
  const topic = await ntfyTopic(accountId);
  return {
    // Public by design: the browser needs it to subscribe. Null when the
    // operator has not set the VAPID keys, so the page can say so.
    publicKey: config.vapid?.publicKey ?? null,
    ntfy: topic ? { topic, url: `${config.ntfyUrl}/${topic}` } : null,
  };
}

/** GET /api/push -- { publicKey, ntfy } */
export async function GET(request: Request) {
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;
  return Response.json(await state(gate.accountId));
}

/**
 * POST /api/push
 *   { subscription: PushSubscriptionJSON }  this device is told from now on;
 *   { ntfy: boolean }                       the ntfy fallback on or off.
 */
export async function POST(request: Request) {
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;
  let raw: { subscription?: unknown; ntfy?: unknown };
  try {
    raw = (await request.json()) ?? {};
  } catch {
    return Response.json({ error: "Body is not JSON. Send { subscription } or { ntfy }." }, { status: 400 });
  }
  if (typeof raw.ntfy === "boolean") {
    await setNtfy(gate.accountId, gate.caller.workspaceId, raw.ntfy);
    return Response.json(await state(gate.accountId));
  }
  const sub = subscriptionOf(raw.subscription);
  if (!sub) {
    return Response.json(
      { error: "That is not a push subscription this planner can send to. Turn notifications off and on again." },
      { status: 400 },
    );
  }
  await subscribe(gate.accountId, gate.caller.workspaceId, sub);
  return Response.json({ subscribed: true });
}

/** DELETE /api/push  { endpoint } -- this device is told nothing more. */
export async function DELETE(request: Request) {
  const gate = await requireCaller(request);
  if (!gate.ok) return gate.response;
  let raw: { endpoint?: unknown };
  try {
    raw = (await request.json()) ?? {};
  } catch {
    return Response.json({ error: "Body is not JSON. Send { endpoint }." }, { status: 400 });
  }
  if (typeof raw.endpoint !== "string") return Response.json({ error: "Send the device's endpoint." }, { status: 400 });
  await unsubscribe(gate.accountId, raw.endpoint);
  return Response.json({ subscribed: false });
}
