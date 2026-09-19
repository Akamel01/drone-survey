import { authProblem } from "@/lib/auth";
import { b2Env, b2ReadEnv, uploadFile, downloadFile, authorize } from "@/lib/b2";
import { SKIPPED_KEY, STATUS_KEY, parseSpecKey } from "@/lib/keys";
import type { Manifest } from "@/lib/missions";

// Withdraw marks a Dispatched Spec as one the host must not Load, by writing
// it into the skip list. Un-withdraw removes that mark. A Spec that is already
// Collected or Loaded is past the point a mark can help, so it is refused.
//
// Both paths report what actually happened: a storage failure is a failure
// response, never a cheerful "withdrawn: false" over a write that never landed.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/** The skip list as stored, or {} when it does not exist yet. */
async function readSkipList(bucket: string, token: Awaited<ReturnType<typeof authorize>>): Promise<Record<string, unknown>> {
  const raw = await downloadFile(token, bucket, SKIPPED_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw.toString());
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    // A corrupt skip list is not an empty one: overwriting it would silently
    // un-withdraw every Spec already in it.
    throw new Error("the stored skip list is not valid JSON");
  }
}

export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const key = fields["key"];
  if (typeof key !== "string" || !parseSpecKey(key)) {
    return Response.json({ error: "Missing or invalid key" }, { status: 400 });
  }

  const env = b2Env();
  const readEnv = b2ReadEnv();
  if (!env || !readEnv) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const undo = fields["withdraw"] === false || fields["action"] === "unwithdraw" || fields["undo"] === true;

  try {
    const readSession = await authorize(readEnv);

    // The guard reads the Manifest. If that read fails we refuse rather than
    // proceed: an unread Manifest is not proof that nothing was Collected.
    const manifestRaw = await downloadFile(readSession, readEnv.bucket, STATUS_KEY);
    if (manifestRaw) {
      const manifest = JSON.parse(manifestRaw.toString()) as Manifest;
      const row = manifest?.[key];
      if (row?.collected_at || row?.loaded_at) {
        return Response.json(
          { error: "That Mission is already Collected or Loaded, so it cannot be withdrawn" },
          { status: 409 },
        );
      }
    }

    const skipList = await readSkipList(readEnv.bucket, readSession);
    const withdrawnAt = new Date().toISOString();
    if (undo) {
      delete skipList[key];
    } else {
      skipList[key] = { withdrawn_at: withdrawnAt };
    }

    const writeSession = await authorize(env);
    await uploadFile(writeSession, SKIPPED_KEY, Buffer.from(JSON.stringify(skipList, null, 2)));

    return undo ? Response.json({ key, withdrawn: false }) : Response.json({ key, withdrawn_at: withdrawnAt });
  } catch (error) {
    return Response.json(
      { error: `The skip list was not updated: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
