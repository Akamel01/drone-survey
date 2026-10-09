// Deny handler (#335 M3): the REAL cancel redirect (redirect_uri +
// error=access_denied), never a "denied" render. Ignores the request body and
// query entirely — the target comes only from server-fetched details (H1).
import { consentBase, denyAuthorization } from "../consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const base = consentBase();
  if (!base) return Response.json({ error: "consent: missing SUPABASE_URL" }, { status: 503 });
  try {
    return Response.redirect(await denyAuthorization(base), 303);
  } catch {
    return Response.json({ error: "consent: the authorization server could not be reached" }, { status: 502 });
  }
}
