import { dispatchProblem, isValidSiteId, slugSegment, type MissionSpec } from "@/lib/spec";
import { authProblem } from "@/lib/auth";
import { authorize, b2Env, b2ReadEnv, downloadFile, uploadFile, type B2Session } from "@/lib/b2";
import { SUMMARIES_KEY, draftKey, makeSpecKey } from "@/lib/keys";
import type { DraftRecord } from "@/lib/missions";
import { preview } from "@/lib/mission";

// The storage credential lives here and never reaches the browser, which is the
// whole reason this route exists (ADR 0017). Node, not edge: the B2 upload needs
// a SHA-1 of the body. Toronto, so the coordinates do not transit US compute on
// their way to a Toronto bucket.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/** Fallback for a Spec dispatched without a `site_id` — a saved Mission from
 *  before issue #39, or one never re-saved since. Slugging the name is the
 *  behaviour this replaces: renaming such a Site still orphans its old Specs,
 *  which is why every other Spec should carry an id instead (ADR 0017). */
function siteSlug(site: string): string {
  return slugSegment(site, 60);
}

export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  // A Dispatch from the Status tab carries the draft id alongside the Spec so
  // the draft can be stamped with the store key afterwards. Anything else in
  // the envelope is ignored; the Spec itself is validated exactly as before.
  const { draft_id, ...maybeSpec } = (raw ?? {}) as Record<string, unknown>;
  const spec = maybeSpec as unknown as MissionSpec;

  const bad = dispatchProblem(spec);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  // Computed once, after validation (preview reads spec.aoi/spec.flight and would
  // throw on a malformed Spec, turning a 400 into a 500), and outside the draft
  // branch so the planner's Dispatch (no draft_id) also records a summary.
  const summary = preview(spec);

  const env = b2Env();
  if (!env) {
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
  const key = makeSpecKey(siteKey, spec.date, stamp);
  const body = Buffer.from(JSON.stringify(spec, null, 2));

  try {
    const session = await authorize(env);
    await uploadFile(session, key, body);

    // Stamping the draft is bookkeeping, not the Dispatch: a failure here
    // must not pretend the upload did not happen.
    if (typeof draft_id === "string" && draft_id) {
      try {
        // Stamp the draft with the dispatch key and the parts preview if available
        const parts = summary.parts;
        await stampDraft(env.bucket, draft_id, key, parts);
      } catch (err) {
        console.error(`dispatch stamped ${key} but the draft update failed:`, err);
      }
    }

    // Also persist a host-wide summaries.json entry for this spec key
    try {
      const existingKey = SUMMARIES_KEY;
      const readEnv2 = b2ReadEnv();
      const env2 = b2Env();
      if (readEnv2 && env2) {
        const readSession: B2Session = await authorize(readEnv2);
        const writeSession: B2Session = readEnv2.keyId === env2.keyId ? readSession : await authorize(env2);
        const existingRaw = await downloadFile(readSession, env2.bucket, existingKey);
        const parsed: Record<string, unknown> = existingRaw ? JSON.parse(existingRaw.toString()) : {};
        // parts is what decides which card this Mission lands in: the Status tab
        // predicts the card by walking the waiting queue, and cannot place
        // anything behind a Mission whose split it does not know.
        parsed[key] = {
          photo_count: summary.photo_count,
          path_length_m: summary.path_length_m,
          parts: summary.parts,
        };
        await uploadFile(writeSession, existingKey, Buffer.from(JSON.stringify(parsed, null, 2)));
      }
    } catch (err) {
      console.error("dispatch summary update failed:", err);
    }

    return Response.json({ key, bytes: body.length });
  } catch (err) {
    // The planner must never show a Spec as Dispatched when it was not, so the
    // failure is returned plainly rather than softened into a success.
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}

async function stampDraft(bucket: string, draftId: string, key: string, parts?: number): Promise<void> {
  if (draftId.includes("/") || draftId.includes("..")) return;
  // The stamp reads through the list-and-read pair and writes through the
  // write pair; either may be the same session when one key does both.
  const env = b2Env();
  const readEnv = b2ReadEnv();
  if (!env || !readEnv) return;
  const read: B2Session = await authorize(readEnv);
  const write: B2Session = readEnv.keyId === env.keyId ? read : await authorize(env);
  const draftSpecKey = draftKey(draftId);
  const raw = await downloadFile(read, bucket, draftSpecKey);
  if (!raw) return;
  const record = JSON.parse(raw.toString()) as DraftRecord;
  record.dispatched_key = key;
  if (typeof parts === "number" && Number.isFinite(parts)) {
    record.parts = parts;
  }
  record.updated_at = new Date().toISOString();
  await uploadFile(write, draftSpecKey, Buffer.from(JSON.stringify(record, null, 2)));
}
