import { createHash, timingSafeEqual } from "node:crypto";
import { dispatchProblem, isValidSiteId, type MissionSpec } from "@/lib/spec";

// The storage credential lives here and never reaches the browser, which is the
// whole reason this route exists (ADR 0017). Node, not edge: the B2 upload needs
// a SHA-1 of the body. Toronto, so the coordinates do not transit US compute on
// their way to a Toronto bucket.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

const B2_AUTH = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account";

/** Constant-time compare that does not leak the secret's length. */
function secretMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Fallback for a Spec dispatched without a `site_id` — a saved Mission from
 *  before issue #39, or one never re-saved since. Slugging the name is the
 *  behaviour this replaces: renaming such a Site still orphans its old Specs,
 *  which is why every other Spec should carry an id instead (ADR 0017). */
function siteSlug(site: string): string {
  return site
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  const expected = process.env.DISPATCH_SECRET;
  if (!expected) {
    return Response.json({ error: "Dispatch is not configured" }, { status: 503 });
  }
  const given = request.headers.get("x-wayfinder-key") ?? "";
  if (!given || !secretMatches(given, expected)) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }

  let spec: MissionSpec;
  try {
    spec = (await request.json()) as MissionSpec;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }

  const bad = dispatchProblem(spec);
  if (bad) return Response.json({ error: bad }, { status: 400 });

  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  const bucket = process.env.B2_BUCKET;
  if (!keyId || !appKey || !bucket) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }

  // A Spec is immutable and named by Site and date (ADR 0016). The timestamp
  // makes supersession explicit and sorts lexically, so the host can take the
  // newest without parsing anything. Parts are build output, produced on the
  // host by the writer, so they do not appear here.
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  // dispatchProblem already rejected a malformed site_id, so an id that is
  // present here is safe to use as-is; a Spec dispatched without one falls
  // back to the old slug-of-the-name behaviour (issue #39).
  const siteKey = isValidSiteId(spec.site_id) ? spec.site_id : siteSlug(spec.site);
  const key = `specs/${siteKey}/${spec.date}/${stamp}.json`;
  const body = Buffer.from(JSON.stringify(spec, null, 2));

  try {
    const auth = await fetch(B2_AUTH, {
      headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
    });
    if (!auth.ok) throw new Error(`authorize failed: ${auth.status}`);
    const { apiUrl, authorizationToken, allowed } = await auth.json();

    const up = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: "POST",
      headers: { Authorization: authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId: allowed.bucketId }),
    });
    if (!up.ok) throw new Error(`upload url failed: ${up.status}`);
    const { uploadUrl, authorizationToken: uploadToken } = await up.json();

    const put = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: uploadToken,
        "X-Bz-File-Name": encodeURIComponent(key),
        "Content-Type": "application/json",
        "X-Bz-Content-Sha1": createHash("sha1").update(body).digest("hex"),
      },
      body,
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);

    return Response.json({ key, bytes: body.length });
  } catch (err) {
    // The planner must never show a Spec as Dispatched when it was not, so the
    // failure is returned plainly rather than softened into a success.
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}
