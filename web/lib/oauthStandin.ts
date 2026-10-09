// A minimal OAuth2 authorization-code stand-in for google and github (D12/D14):
// node:http only, no dependencies, one process. Better Auth reaches it through
// the genericOAuth swap, so the plugin expects nothing beyond the standard
// endpoints and payloads.
//
// Contract (installed better-auth 1.7.6):
//  - GET /authorize?redirect_uri=...&state=...&code_challenge=... redirects to
//    redirect_uri with a code and the `state` echoed byte-for-byte. The raw
//    query string is parsed, never decoded/re-encoded, so the callback's
//    state binding cannot drift. code_challenge is accepted and ignored.
//  - POST /token (x-www-form-urlencoded) returns
//    { access_token, token_type, expires_in } -- getOAuth2Tokens
//    (@better-auth/core/dist/oauth2/utils.mjs:17) reads token_type/expires_in,
//    and the token's code_verifier is accepted but not checked.
//  - GET /auth/v1/.well-known/openid-configuration mirrors the Supabase
//    discovery path under the stand-in root (frozen #335 contract): issuer +
//    the authorize/token/userinfo endpoints it already serves.
//  - GET /oauth/authorization-details reports the client name/scopes without
//    consuming the identity queue (read-only peek for the consent page, which
//    renders client name/scopes ONLY from here, never query params).
//  - POST /oauth/approve consumes one queued identity and issues a code the
//    existing /token accepts (same byCode map); POST /oauth/deny consumes one
//    and issues nothing. Running out is a 400 either way, like /authorize.
//  - GET /userinfo (Authorization: Bearer <access_token>) returns
//    { id, sub (= id), name, email, image, email_verified } (the last from the identity's
//    emailVerified, absent meaning true); the plugin's default fetchUserInfo
//    (generic-oauth/index.mjs:37) maps picture->image and email_verified, and
//    the account subject falls back to `id` when there is no `sub`.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** One Account the stand-in will hand to the next authorization request. */
export type StandinIdentity = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  /** What /userinfo reports as `email_verified`; absent means true (the
   *  common case, and the pre-R2 behaviour). */
  emailVerified?: boolean;
};

export type OAuthStandin = {
  /** e.g. http://127.0.0.1:41234 -- build the six AUTH_TEST_* URLs from this. */
  baseUrl: string;
  /** Every request the stand-in served, in order, for debugging/test asserts. */
  requests: string[];
  stop(): Promise<void>;
};

/** Raw query-value lookup: no decode, so `state` survives byte-for-byte. */
function rawParam(query: string, name: string): string | undefined {
  for (const part of query.split("&")) {
    const eq = part.indexOf("=");
    if ((eq === -1 ? part : part.slice(0, eq)) === name) return eq === -1 ? "" : part.slice(eq + 1);
  }
  return undefined;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString()));
    request.on("error", reject);
  });
}

/** Starts the stand-in on a loopback free port. `identities` are consumed one
 *  per authorization request, in order; running out is a 500, so a test that
 *  drives more sign-ins than identities fails loudly instead of reusing an
 *  Account. */
export async function startOAuthStandin(identities: StandinIdentity[]): Promise<OAuthStandin> {
  const queue = [...identities];
  const byCode = new Map<string, StandinIdentity>();
  const byToken = new Map<string, StandinIdentity>();
  const requests: string[] = [];

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  };

  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    requests.push(`${request.method} ${url}`);
    const [path, query = ""] = url.split("?");
    void (async () => {
      if (request.method === "GET" && path === "/authorize") {
        // redirect_uri is a URL carried as a query value, so it is decoded;
        // state stays raw, echoed exactly as it arrived.
        const redirectRaw = rawParam(query, "redirect_uri");
        const state = rawParam(query, "state");
        let redirectUri: string | undefined;
        try {
          redirectUri = redirectRaw === undefined ? undefined : decodeURIComponent(redirectRaw);
        } catch {
          return json(response, 400, { error: "standin: redirect_uri is not decodable" });
        }
        const identity = queue.shift();
        if (!redirectUri || identity === undefined) {
          return json(response, 400, { error: "standin: missing redirect_uri or no identity left" });
        }
        const code = `code-${identity.id}-${byCode.size}`;
        byCode.set(code, identity);
        const join = redirectUri.includes("?") ? "&" : "?";
        // state echoed raw; code_challenge is accepted (in the query) and unused.
        response
          .writeHead(302, { location: `${redirectUri}${join}code=${encodeURIComponent(code)}&state=${state ?? ""}` })
          .end();
        return;
      }
      if (request.method === "POST" && path === "/token") {
        const form = new URLSearchParams(await readBody(request));
        const identity = byCode.get(form.get("code") ?? "");
        if (!identity) return json(response, 400, { error: "standin: unknown code" });
        const accessToken = `token-${identity.id}`;
        byToken.set(accessToken, identity);
        // code_verifier, if sent, is accepted and never checked.
        return json(response, 200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
      }
      if (request.method === "GET" && path === "/userinfo") {
        const token = (request.headers.authorization ?? "").replace(/^Bearer /i, "");
        const identity = byToken.get(token);
        if (!identity) return json(response, 401, { error: "standin: unknown access token" });
        return json(response, 200, {
          id: identity.id,
          sub: identity.id,
          name: identity.name,
          email: identity.email,
          image: identity.image ?? null,
          email_verified: identity.emailVerified ?? true,
        });
      }
      if (request.method === "GET" && path === "/auth/v1/.well-known/openid-configuration") {
        const issuer = `http://${request.headers.host ?? "127.0.0.1"}`;
        return json(response, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          authorization_details_endpoint: `${issuer}/oauth/authorization-details`,
          approve_endpoint: `${issuer}/oauth/approve`,
          deny_endpoint: `${issuer}/oauth/deny`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
        });
      }
      if (request.method === "GET" && path === "/oauth/authorization-details") {
        // Read-only: the queue is never touched here, so approve/deny still
        // consume one identity per flow in declaration order.
        return json(response, 200, {
          client_id: "standin-supabase-client",
          client_name: "Stand-in Supabase client",
          scope: "openid email profile",
          redirect_uri: "https://missions.papyrus-ai.net/api/auth/callback/supabase",
        });
      }
      if (request.method === "POST" && (path === "/oauth/approve" || path === "/oauth/deny")) {
        const identity = queue.shift();
        if (!identity) {
          return json(response, 400, { error: "standin: missing redirect_uri or no identity left" });
        }
        if (path === "/oauth/deny") return json(response, 200, { status: "denied" });
        const code = `code-${identity.id}-${byCode.size}`;
        byCode.set(code, identity);
        const raw = await readBody(request);
        let state: string | undefined;
        try {
          state = raw ? (JSON.parse(raw) as { state?: unknown }).state as string | undefined : undefined;
        } catch {
          const form = new URLSearchParams(raw);
          state = form.get("state") ?? undefined;
        }
        return json(response, 200, state === undefined ? { code } : { code, state });
      }
      return json(response, 404, { error: `standin: nothing at ${path}` });
    })().catch((error) => json(response, 500, { error: `standin: ${(error as Error).message}` }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    async stop() {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
