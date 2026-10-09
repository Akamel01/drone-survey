// The OAuth consent trust-zone split (M3, #335): everything here runs on the
// server. Client name and scopes are read ONLY from getAuthorizationDetails
// (never query params — anti-phishing H2); approve/deny redirect targets come
// ONLY from the server-fetched redirect_uri (never a caller URL —
// open-redirect guard H1). SUPABASE_OAUTH_CLIENT_SECRET is read here at call
// time and sent as an Authorization header server-to-server; it never reaches
// the browser (D4). No @supabase/* import: plain fetch covers the stand-in
// and the Supabase OAuth server alike, so web/package.json gains nothing.
//
// H6 bend, stated up front: this is a security page, so clarity beats theme —
// no photograph, no blur, no lead figure. Plain high-contrast panel.

/** The consent page path: sign-in-then-return binds here, a fixed constant,
 *  never a caller-supplied URL (H1). */
export const CONSENT_PATH = "/oauth/consent";

/** Production confidential-client callback, exact match, no wildcards
 *  (frozen #335 contract item 4; Vercel deploy contract). */
export const SUPABASE_CALLBACK = "https://missions.papyrus-ai.net/api/auth/callback/supabase";

export type AuthorizationDetails = {
  client_id: string;
  client_name: string;
  scope: string;
  redirect_uri: string;
};

/** Server-to-server auth for the approve/deny calls: HTTP Basic over the
 *  confidential client id/secret when both are set (production Supabase);
 *  absent against the M2 stand-in, which checks nothing. Built here, on the
 *  server, at call time — never constructed in browser code. */
function consentAuthHeader(): Record<string, string> {
  const id = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const secret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) return {};
  return { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` };
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...consentAuthHeader() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

/** The authorization server root: SUPABASE_URL in deployments, the M2
 *  stand-in baseUrl in tests. Read at call time, like accountEnv. */
export function consentBase(): string | undefined {
  return process.env.SUPABASE_URL || undefined;
}

/** Client name/scopes for the consent page — the page's ONLY source for
 *  them. Throws when the server omits the fields or when redirect_uri is not
 *  the exact registered callback (exact-match, no wildcards). */
export async function getAuthorizationDetails(base: string): Promise<AuthorizationDetails> {
  const response = await fetch(`${base}/oauth/authorization-details`, {
    headers: consentAuthHeader(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`consent: authorization-details answered ${response.status}`);
  const details = (await response.json()) as Partial<AuthorizationDetails>;
  if (!details.client_name || !details.scope || !details.redirect_uri || !details.client_id) {
    throw new Error("consent: authorization-details omitted client name, scopes, or redirect_uri");
  }
  if (details.redirect_uri !== SUPABASE_CALLBACK) {
    throw new Error("consent: redirect_uri is not the registered callback; refusing to render");
  }
  return details as AuthorizationDetails;
}

/** Approve: consumes one queued identity server-side and returns the callback
 *  redirect (code + echoed state) the browser must follow. */
export async function approveAuthorization(base: string, state?: string): Promise<string> {
  const details = await getAuthorizationDetails(base);
  const response = await postJson(`${base}/oauth/approve`, state === undefined ? {} : { state });
  if (!response.ok) throw new Error(`consent: approve answered ${response.status}`);
  const { code, state: echoed } = (await response.json()) as { code?: unknown; state?: unknown };
  if (typeof code !== "string" || code === "") throw new Error("consent: approve issued no code");
  const join = details.redirect_uri.includes("?") ? "&" : "?";
  const kept = typeof echoed === "string" && echoed !== "" ? echoed : state;
  return `${details.redirect_uri}${join}code=${encodeURIComponent(code)}${kept ? `&state=${kept}` : ""}`;
}

/** Deny: consumes one queued identity server-side and returns the REAL cancel
 *  redirect (redirect_uri + error=access_denied) — never a "denied" render. */
export async function denyAuthorization(base: string): Promise<string> {
  const details = await getAuthorizationDetails(base);
  const response = await postJson(`${base}/oauth/deny`, {});
  if (!response.ok) throw new Error(`consent: deny answered ${response.status}`);
  const join = details.redirect_uri.includes("?") ? "&" : "?";
  return `${details.redirect_uri}${join}error=access_denied`;
}
