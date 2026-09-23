import { authorize, type B2Env } from "@/lib/b2";
import { bundleKey } from "@/lib/delivery";

export const runtime = "nodejs";
export const preferredRegion = "yyz1";

// The delivery gate. ADR 0011 wanted the client to open a Bundle with no login
// and no signed URL, which assumed a public bucket; the bucket is private, and
// a B2 download token authorises only the one URL it is pasted into, so a page
// whose assets are relative gets 401 on every one of them. This route holds the
// credential and proxies reads instead, so the Bundle stays unlisted-but-open
// exactly as the design intended, without the bucket being world-readable.
//
// Deliberately NOT behind authProblem(): every planner route is gated by the
// operator's passphrase, and this is the one route a client must reach without
// it. What stands in for a login is the same thing the public-bucket design
// relied on -- the opaque per-Bundle id.
//
// Range requests pass through untouched. The Orthomosaic is a COG that the
// viewer reads a few tiles at a time; buffering it here would mean holding
// ~300 MB per request and would defeat the format.

function deliveryEnv(): B2Env | null {
  const keyId = process.env.B2_DELIVERY_KEY_ID;
  const appKey = process.env.B2_DELIVERY_APP_KEY;
  const bucket = process.env.B2_DELIVERY_BUCKET;
  return keyId && appKey && bucket ? { keyId, appKey, bucket } : null;
}

// Headers worth forwarding from B2: what the file is, how big, whether ranges
// work, and the validators a browser caches on. Its authorization and internal
// x-bz-* headers are not the client's business.
const PASS_THROUGH = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

async function serve(request: Request, segments: string[], method: "GET" | "HEAD"): Promise<Response> {
  const env = deliveryEnv();
  if (!env) return new Response("Delivery storage is not configured", { status: 503 });

  const key = bundleKey(segments);
  if (!key) return new Response("Not found", { status: 404 });

  const session = await authorize(env);
  const url = `${session.downloadUrl}/file/${env.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const headers: Record<string, string> = { Authorization: session.token };
  const range = request.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(url, { method, headers });
  if (upstream.status === 401 || upstream.status === 403) {
    // Never surface the store's own auth failure as the client's: it is our
    // credential that is wrong, not their request.
    return new Response("Delivery storage rejected our credential", { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }

  const out = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // A Bundle file never changes: its id is content-addressed per publish, and a
  // correction is published as a new Bundle rather than by overwriting one.
  out.set("cache-control", "public, max-age=3600");
  out.set("x-robots-tag", "noindex, nofollow");

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return serve(request, (await params).path, "GET");
}

export async function HEAD(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return serve(request, (await params).path, "HEAD");
}
