import { authProblem } from "@/lib/auth";
import { b2Env, b2ReadEnv, uploadFile, downloadFile, authorize } from "@/lib/b2";
import { parseSpecKey } from "@/lib/missions";
import type { Manifest } from "@/lib/missions";

// Withdraw API: mark a spec as withdrawn (skipped.json) or un-withdraw if requested later
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const key = (body as Record<string, unknown>)?.["key"] as string | undefined;
  if (!key || typeof key !== "string") {
    return Response.json({ error: "Missing or invalid key" }, { status: 400 });
  }

  // Validate key shape
  const parsed = parseSpecKey(key);
  if (!parsed) {
    return Response.json({ error: "Invalid spec key" }, { status: 400 });
  }

  const statKey = `specs/_status/skipped.json`;
  const manifestKey = `specs/_status/missions.json`;
  const env = b2Env();
  if (!env) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }
  const readEnv = b2ReadEnv();
  if (!readEnv) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }

  // Guard: read manifest and reject if the key has been collected or loaded
  try {
    const sessionRead = await (async () => {
      const s = await (await import("@/lib/b2")).authorize(readEnv);
      return s;
    })();
    const manifestRaw = await downloadFile(sessionRead, readEnv.bucket, manifestKey);
    if (manifestRaw) {
      const manifest = JSON.parse(manifestRaw.toString()) as Manifest;
      if (manifest?.[key]?.collected_at || manifest?.[key]?.loaded_at) {
        return Response.json({ error: "Cannot withdraw/unwithdraw a spec that has been collected or loaded" }, { status: 403 });
      }
    }
  } catch {
    // Ignore manifest read failures; we'll still attempt to update the skipped store
  }

  // Determine undo path
  const requestAny = body as Record<string, unknown>;
  const unwithdraw = (requestAny?.["withdraw"] === false) || (requestAny?.["action"] === "unwithdraw");
  const isUndo = (requestAny?.["undo"] === true) || unwithdraw;
  if (isUndo) {
    // Read current skipped.json
    try {
      const sessionRead2 = await (async () => {
        const s = await (await import("@/lib/b2")).authorize(readEnv);
        return s;
      })();
      const existingRaw2 = await downloadFile(sessionRead2, readEnv.bucket, statKey);
      let existing2: Record<string, unknown> = {};
      if (existingRaw2) {
        try {
          existing2 = JSON.parse(existingRaw2.toString()) as Record<string, unknown>;
        } catch {
          existing2 = {};
        }
      }
      if (existing2.hasOwnProperty(key)) {
        delete existing2[key];
      }
      const payload2 = Buffer.from(JSON.stringify(existing2, null, 2));
      const writeSession2 = await authorize(env);
      await uploadFile(writeSession2, statKey, payload2);
    } catch {
      // If anything goes wrong, continue to respond
    }
    return Response.json({ key, withdrawn: false });
  }

  // Withdraw path: mark as withdrawn
  // Read existing skipped.json
  const readSession = await (async () => {
    const s = await (await import("@/lib/b2")).authorize(readEnv);
    return s;
  })();
  const existingRaw = await downloadFile(readSession, readEnv.bucket, statKey);
  let existing: Record<string, unknown> = {};
  if (existingRaw) {
    try {
      existing = JSON.parse(existingRaw.toString()) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const withdrawnAt = new Date().toISOString();
  existing[key] = { withdrawn_at: withdrawnAt };
  const payload = Buffer.from(JSON.stringify(existing, null, 2));
  const writeSession = await authorize(env);
  await uploadFile(writeSession, statKey, payload);

  return Response.json({ key, withdrawn_at: withdrawnAt });
}
