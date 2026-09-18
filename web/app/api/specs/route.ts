import { authProblem } from "@/lib/auth";
import { parseSpecKey } from "@/lib/missions";
import { downloadFile, authorize, b2ReadEnv } from "@/lib/b2";

// Read-only: serve immutable Spec body by key
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

export async function GET(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  const parsed = parseSpecKey(key);
  if (!parsed) return Response.json({ error: "Invalid spec key" }, { status: 404 });

  const readEnv = b2ReadEnv();
  if (!readEnv) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  try {
    const session = await authorize(readEnv);
    const raw = await downloadFile(session, readEnv.bucket, key);
    if (!raw) return Response.json({ error: "Spec not found" }, { status: 404 });
    const obj = JSON.parse(raw.toString());
    return Response.json(obj);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}
