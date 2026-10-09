// Approve handler (#335 M3): consumes one authorization server-side and 303s
// to the exact registered callback with code + state. Ignores the request
// body and query entirely — the target comes only from server-fetched details
// (H1), and the secret stays server-side (D4).
import { approveAuthorization, consentBase } from "../consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const base = consentBase();
  if (!base) return Response.json({ error: "consent: missing SUPABASE_URL" }, { status: 503 });
  try {
    return Response.redirect(await approveAuthorization(base), 303);
  } catch {
    return Response.json({ error: "consent: the authorization server could not be reached" }, { status: 502 });
  }
}
