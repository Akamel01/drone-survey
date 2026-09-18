import { authProblem } from "@/lib/auth";
import { authorize, b2Env, b2ReadEnv, downloadFile, listFiles } from "@/lib/b2";
import { SUMMARIES_KEY, DRAFTS_PREFIX, STATUS_KEY, joinStatus, type DraftRecord, type Manifest, SpecSummary } from "@/lib/missions";

export const runtime = "nodejs";
export const preferredRegion = "yyz1";

export async function GET(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const env = b2Env();
  if (!env) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  // This route only ever reads; the write pair is not touched.
  const readEnv = b2ReadEnv();
  if (!readEnv) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  try {
    const session = await authorize(readEnv);
    // One listing covers both: drafts live under specs/ (ADR 0017), so the
    // drafts listing was a second Class C transaction on every poll.
    const [specFiles, manifestRaw, skippedRaw, summariesRaw] = await Promise.all([
      listFiles(session, "specs/"),
      downloadFile(session, env.bucket, STATUS_KEY),
      downloadFile(session, env.bucket, "specs/_status/skipped.json"),
      downloadFile(session, env.bucket, SUMMARIES_KEY),
    ]);
    const draftFiles = specFiles.filter((f) => f.fileName.startsWith(DRAFTS_PREFIX));
    const drafts: DraftRecord[] = (
      await Promise.all(
        draftFiles
          .filter((f) => f.fileName.endsWith(".json"))
          .map((f) => downloadFile(session, env.bucket, f.fileName)),
      )
    ).flatMap((raw) => {
      if (!raw) return [];
      try {
        return [JSON.parse(raw.toString()) as DraftRecord];
      } catch {
        // A hand-edited file that stopped parsing must not hide every draft.
        return [];
      }
    });
    let manifest: Manifest = {};
    if (manifestRaw) {
      try {
        manifest = JSON.parse(manifestRaw.toString()) as Manifest;
      } catch {
        // A corrupt manifest hides nothing: every Spec reads as Dispatched.
        manifest = {};
      }
    }
    // Read skipped map (withdrawn markers) for UI overlay
    let skipped: Record<string, unknown> = {};
    if (skippedRaw) {
      try {
        skipped = JSON.parse(skippedRaw.toString()) as Record<string, unknown>;
      } catch {
        skipped = {};
      }
    }
    // Summaries (metrics) attached to SPECs
    let summaries: Record<string, SpecSummary> = {};
    if (summariesRaw) {
      try {
        summaries = JSON.parse(summariesRaw.toString()) as Record<string, SpecSummary>;
      } catch {
        summaries = {};
      }
    }
    return Response.json({
      rows: joinStatus(drafts, specFiles.map((f) => f.fileName), manifest, skipped, summaries),
      host_reported: manifestRaw !== null,
      notice: (manifest as Record<string, unknown>)._notice ?? null,
      skipped: skipped ?? {},
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}
