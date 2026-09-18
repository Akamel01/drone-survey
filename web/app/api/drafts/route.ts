import { randomUUID } from "node:crypto";
import { authProblem } from "@/lib/auth";
import { authorize, b2Env, b2ReadEnv, deleteFile, downloadFile, listFiles, uploadFile } from "@/lib/b2";
import { DRAFTS_PREFIX, type DraftRecord } from "@/lib/missions";
import type { MissionSpec } from "@/lib/spec";

// Server-side drafts: the mission list that survives a refresh, a closed
// browser, and a second browser. One JSON file per draft under
// specs/_drafts/<uuid>.json; Dispatched Specs are never stored here and
// this route only ever lists that prefix — delete is drafts-only by
// construction, which is what keeps ADR 0016 intact.
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/** A draft may be an unfinished plan (no area yet), so this checks shape, not
 *  flyability: an object with the Spec's required top-level shape. The gate
 *  that refuses unflyable plans stays at Dispatch. */
function draftProblem(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) return "Draft is not an object";
  const s = spec as Record<string, unknown>;
  if (s.version !== 1) return "Draft has no version";
  if (s.mission_type !== "grid" && s.mission_type !== "orbit") return "Draft has no mission type";
  if (typeof s.site !== "string") return "Draft has no site name";
  if (typeof s.date !== "string") return "Draft has no date";
  return null;
}

function draftIdOk(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && !id.includes("/") && !id.includes("..");
}

export async function GET(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const env = b2Env();
  if (!env) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  const readEnv = b2ReadEnv();
  if (!readEnv) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  try {
    const session = await authorize(readEnv);
    const files = await listFiles(session, DRAFTS_PREFIX);
    const drafts: DraftRecord[] = (
      await Promise.all(
        files
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
    drafts.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return Response.json({ drafts });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const env = b2Env();
  if (!env) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const { id, spec } = (raw ?? {}) as { id?: unknown; spec?: unknown };
  const bad = draftProblem(spec);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  const readEnv = b2ReadEnv();
  if (!readEnv) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  try {
    // Reads go through the list-and-read pair, writes through the write pair.
    const read = await authorize(readEnv);
    const write = readEnv.keyId === env.keyId ? read : await authorize(env);
    const now = new Date().toISOString();
    let record: DraftRecord;
    if (id === undefined) {
      // A new draft gets a server id: re-saving the same draft updates it, so
      // two browsers never clobber each other by accident.
      record = {
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        dispatched_key: null,
        spec: spec as MissionSpec,
      };
    } else {
      if (!draftIdOk(id)) return Response.json({ error: "Bad draft id" }, { status: 400 });
      const key = `${DRAFTS_PREFIX}${id}.json`;
      const existing = await downloadFile(read, env.bucket, key);
      if (!existing) return Response.json({ error: "Draft not found" }, { status: 404 });
      const prev = JSON.parse(existing.toString()) as DraftRecord;
      record = {
        ...prev,
        id,
        updated_at: now,
        spec: spec as MissionSpec,
      };
    }
    await uploadFile(write, `${DRAFTS_PREFIX}${record.id}.json`, Buffer.from(JSON.stringify(record, null, 2)));
    return Response.json({ draft: record });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const env = b2Env();
  if (!env) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (!draftIdOk(id)) return Response.json({ error: "Bad draft id" }, { status: 400 });
  const readEnv = b2ReadEnv();
  if (!readEnv) return Response.json({ error: "Storage is not configured" }, { status: 503 });
  try {
    const read = await authorize(readEnv);
    const write = readEnv.keyId === env.keyId ? read : await authorize(env);
    const key = `${DRAFTS_PREFIX}${id}.json`;
    const files = await listFiles(read, DRAFTS_PREFIX);
    const match = files.find((f) => f.fileName === key);
    if (!match) return Response.json({ error: "Draft not found" }, { status: 404 });
    // Deleting a draft never touches its Dispatched Spec: the Spec stays in
    // the store under specs/ and keeps its status. Only the draft goes.
    await deleteFile(write, match.fileId, key);
    return Response.json({ deleted: id });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Could not reach the store: ${detail}` }, { status: 502 });
  }
}
