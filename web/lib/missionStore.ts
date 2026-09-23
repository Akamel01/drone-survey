// Reading and writing Missions and the Card Ledger in the store.
//
// The rules are in `model.ts` and `missionRecords.ts`; this file is only the
// plumbing that carries them to B2, kept in one place so the four Mission
// routes cannot drift apart about the store's shape (ADR 0017).
//
// Transaction budget (see the comment in `b2.ts`): every call here goes
// through the cached authorize session, and a whole read is one list plus one
// download per record. Nothing polls.

import { authorize, b2Env, b2ReadEnv, downloadFile, listFiles, uploadFile, type B2Session } from "./b2.ts";
import { LEDGER_KEY, MISSIONS_PREFIX, SKIPPED_KEY, STATUS_KEY, missionKey } from "./keys.ts";
import { EMPTY_LEDGER, type CardLedger } from "./model.ts";
import type { Manifest } from "./missions.ts";
import { mergeLedger, type MissionRecord } from "./missionRecords.ts";

/** The read session, the write session and the bucket, or a 503 response
 *  saying so. The write key cannot list, so reads go through the read pair --
 *  the two are the same session when one key does both. */
export async function sessions(): Promise<
  { read: B2Session; write: B2Session; bucket: string } | Response
> {
  const env = b2Env();
  const readEnv = b2ReadEnv();
  if (!env || !readEnv) {
    return Response.json(
      { error: "Storage is not configured. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET." },
      { status: 503 },
    );
  }
  const read = await authorize(readEnv);
  const write = readEnv.keyId === env.keyId ? read : await authorize(env);
  return { read, write, bucket: env.bucket };
}

function parseOr<T>(raw: Buffer | null, fallback: T, what: string): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw.toString()) as T;
  } catch {
    // Reading a corrupt shared file as empty would let the next write erase
    // it. A Mission list that cannot be read is a failure, not an empty list.
    throw new Error(`the stored ${what} is not valid JSON`);
  }
}

export async function readLedger(read: B2Session, bucket: string): Promise<CardLedger> {
  const raw = await downloadFile(read, bucket, LEDGER_KEY);
  const led = parseOr<CardLedger>(raw, EMPTY_LEDGER, "Card Ledger");
  return { pool: led.pool ?? [], holdings: led.holdings ?? {}, verified_at: led.verified_at };
}

export async function readManifest(read: B2Session, bucket: string): Promise<Manifest> {
  const raw = await downloadFile(read, bucket, STATUS_KEY);
  try {
    return parseOr<Manifest>(raw, {}, "host manifest");
  } catch {
    // Unlike the Ledger, nothing here is ever written back, so a corrupt
    // manifest costs only the host's own reporting: every Spec reads as
    // Dispatched, which is what it was before the host spoke.
    return {};
  }
}

/** Every Mission in the store. One listing, then one download per record. */
export async function readMissions(read: B2Session, bucket: string): Promise<MissionRecord[]> {
  const files = await listFiles(read, MISSIONS_PREFIX);
  const bodies = await Promise.all(
    files.filter((f) => f.fileName.endsWith(".json")).map((f) => downloadFile(read, bucket, f.fileName)),
  );
  return bodies.flatMap((raw) => {
    if (!raw) return [];
    try {
      return [JSON.parse(raw.toString()) as MissionRecord];
    } catch {
      // One hand-edited file that stopped parsing must not hide every Mission.
      return [];
    }
  });
}

export async function readMission(
  read: B2Session,
  bucket: string,
  id: string,
): Promise<MissionRecord | null> {
  const raw = await downloadFile(read, bucket, missionKey(id));
  return raw ? (JSON.parse(raw.toString()) as MissionRecord) : null;
}

export async function writeMission(write: B2Session, record: MissionRecord): Promise<void> {
  await uploadFile(write, missionKey(record.id), Buffer.from(JSON.stringify(record, null, 2)));
}

/**
 * Change the Ledger without losing a write that landed while we were thinking.
 *
 * The Ledger is one file, and B2 has no compare-and-swap, so this follows the
 * pattern `scripts/backfill-summaries.ts` set: read, compute, re-read
 * immediately before writing, fold in what someone else wrote, and refuse
 * outright when the two cannot be reconciled. `mergeLedger` holds that rule
 * and is unit-tested; this is the I/O around it.
 *
 * Returns the written Ledger, or a string saying what to do next.
 */
export async function updateLedger(
  read: B2Session,
  write: B2Session,
  bucket: string,
  change: (started: CardLedger) => CardLedger | string,
): Promise<CardLedger | string> {
  const started = await readLedger(read, bucket);
  const next = change(started);
  if (typeof next === "string") return next;
  const latest = await readLedger(read, bucket);
  const merged = mergeLedger(started, latest, next);
  if (!merged.ok) return merged.reason;
  await uploadFile(write, LEDGER_KEY, Buffer.from(JSON.stringify(merged.ledger, null, 2)));
  return merged.ledger;
}

/**
 * Tell the host not to Load these Specs.
 *
 * Releasing the Card is not by itself a cancellation: the Spec is immutable
 * and stays in the store, so without this the host would still Collect it and
 * Load it into whichever Card it was handed next. The skip list is what
 * `collect.py` already reads.
 *
 * Whole-file, so the same rule as the Ledger: re-read immediately before
 * writing, and refuse rather than silently un-withdraw a Spec someone else
 * added while this ran. Returns null on success, or what to do next.
 */
export async function addSkipped(
  read: B2Session,
  write: B2Session,
  bucket: string,
  keys: string[],
  at: string,
): Promise<string | null> {
  if (keys.length === 0) return null;
  const started = await readSkipList(read, bucket);
  const latest = await readSkipList(read, bucket);
  const lost = Object.keys(started).filter((k) => !(k in latest));
  if (lost.length) {
    return (
      `The skip list changed while this was being prepared -- ${lost[0]} is no longer in it. ` +
      "Nothing was written. Reload the Mission list and try again."
    );
  }
  for (const key of keys) latest[key] = { withdrawn_at: at };
  await uploadFile(write, SKIPPED_KEY, Buffer.from(JSON.stringify(latest, null, 2)));
  return null;
}

async function readSkipList(read: B2Session, bucket: string): Promise<Record<string, unknown>> {
  const raw = await downloadFile(read, bucket, SKIPPED_KEY);
  // A corrupt skip list is not an empty one: overwriting it would silently
  // un-withdraw every Spec already in it.
  const parsed = parseOr<Record<string, unknown>>(raw, {}, "skip list");
  return parsed && typeof parsed === "object" ? parsed : {};
}

/** The one shape a failed store call is reported in. No refusal is silent and
 *  none of them leave the operator without a next step. */
export function storeFailure(err: unknown): Response {
  const detail = err instanceof Error ? err.message : "unknown";
  return Response.json(
    { error: `Could not reach the store: ${detail}. Nothing was changed; try again.` },
    { status: 502 },
  );
}
