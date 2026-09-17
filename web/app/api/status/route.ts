import { authProblem } from "@/lib/auth";
import { authorize, b2Env, b2ReadEnv, downloadFile, listFiles } from "@/lib/b2";
import {
  DRAFTS_PREFIX,
  STATUS_KEY,
  joinStatus,
  type DraftRecord,
  type Manifest,
} from "@/lib/missions";

// One row per mission: drafts from the server store, Dispatched Specs from
// the store's specs/ tree, Collected/Loaded from the host's manifest. Keyed
// by cloud identity, so any browser sees the same tab. A missing manifest is
// "the host has not reported yet", never an error.
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
    const [specFiles, draftFiles, manifestRaw] = await Promise.all([
      listFiles(session, "specs/"),
      listFiles(session, DRAFTS_PREFIX),
      downloadFile(session, env.bucket, STATUS_KEY),
    ]);
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
    return Response.json({
      rows: joinStatus(drafts, specFiles.map((f) => f.fileName), manifest),
      host_reported: manifestRaw !== null,
      // An atomic refusal (eg. the queue did not fit the cards): the host
      // reports it here so the tab shows it against the waiting missions.
      notice: (manifest as Record<string, unknown>)._notice ?? null,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}
