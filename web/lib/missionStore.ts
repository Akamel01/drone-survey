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
import { LEDGER_KEY, MISSIONS_PREFIX, SKIPPED_KEY, STATUS_KEY, SUMMARIES_KEY, missionKey } from "./keys.ts";
import { StoreNotConfigured, type LedgerResult, type MissionStore, type SkippedResult } from "./missionLifecycle.ts";
import { EMPTY_LEDGER, type CardLedger } from "./model.ts";
import type { Manifest, SpecSummary } from "./missions.ts";
import { changeSurvived, isMissionRecord, type MissionRecord } from "./missionRecords.ts";
import { mapSurvived, readRecord, updateRecord, type RecordSpec } from "./storeRecord.ts";

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

const LEDGER: RecordSpec<CardLedger> = {
  key: LEDGER_KEY,
  what: "Card Ledger",
  empty: () => EMPTY_LEDGER,
  normalize: (led) => ({ pool: led.pool ?? [], holdings: led.holdings ?? {}, verified_at: led.verified_at }),
  survived: changeSurvived,
};

// A corrupt skip list is not an empty one: overwriting it would silently
// un-withdraw every Spec already in it. Same for summaries.
const SKIPPED: RecordSpec<Record<string, unknown>> = {
  key: SKIPPED_KEY,
  what: "skip list",
  empty: () => ({}),
  normalize: (p) => (p && typeof p === "object" ? p : {}),
  survived: mapSurvived,
};

export const SUMMARIES_SPEC: RecordSpec<Record<string, SpecSummary>> = {
  key: SUMMARIES_KEY,
  what: "Spec summaries",
  empty: () => ({}),
  normalize: (p) => (p && typeof p === "object" ? p : {}),
  survived: mapSurvived,
};

/** Fold summaries into the store without dropping a concurrent writer's.
 *  `take` says whether an entry may replace the one stored (default: always). */
export function updateSummaries(
  read: B2Session,
  write: B2Session,
  bucket: string,
  add: Record<string, SpecSummary>,
  take: (stored: Record<string, SpecSummary>, key: string) => boolean = () => true,
): Promise<Record<string, SpecSummary> | string> {
  return updateRecord(read, write, bucket, SUMMARIES_SPEC, (cur) => ({
    ...cur,
    ...Object.fromEntries(Object.entries(add).filter(([k]) => take(cur, k))),
  }));
}

export const readLedger = (read: B2Session, bucket: string) => readRecord(read, bucket, LEDGER);

export async function readManifest(read: B2Session, bucket: string): Promise<Manifest> {
  try {
    return await readRecord<Manifest>(read, bucket, { key: STATUS_KEY, what: "host manifest", empty: () => ({}), survived: () => true });
  } catch {
    // Unlike the Ledger, nothing here is ever written back, so a corrupt
    // manifest costs only the host's own reporting: every Spec reads as
    // Dispatched, which is what it was before the host spoke.
    return {};
  }
}

/** Every Mission in the store. One listing, then one download per record.
 *
 *  A record that does not parse, or does not have a Mission's shape, is left
 *  out and its key pushed onto `unreadable` if given: one hand-edited file
 *  must neither hide every Mission nor vanish without a word (#152). */
export async function readMissions(
  read: B2Session,
  bucket: string,
  unreadable?: string[],
): Promise<MissionRecord[]> {
  const files = (await listFiles(read, MISSIONS_PREFIX)).filter((f) => f.fileName.endsWith(".json"));
  const bodies = await Promise.all(files.map((f) => downloadFile(read, bucket, f.fileName)));
  return bodies.flatMap((raw, i) => {
    if (!raw) return [];
    try {
      const record: unknown = JSON.parse(raw.toString());
      if (isMissionRecord(record)) return [record];
    } catch {
      // Falls through to being reported.
    }
    unreadable?.push(files[i].fileName);
    return [];
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
 * Change the Ledger without losing a write that landed while we were thinking
 * (#152; the rule is `storeRecord.ts`'s). Returns the Ledger as read back, or a
 * string saying what to do next.
 */
export const updateLedger = (
  read: B2Session,
  write: B2Session,
  bucket: string,
  change: (started: CardLedger) => CardLedger | string,
) => updateRecord(read, write, bucket, LEDGER, change);

/**
 * Tell the host not to Load these Specs.
 *
 * Releasing the Card is not by itself a cancellation: the Spec is immutable
 * and stays in the store, so without this the host would still Collect it and
 * Load it into whichever Card it was handed next. The skip list is what
 * `collect.py` already reads. Returns null on success, or what to do next.
 */
export async function addSkipped(
  read: B2Session,
  write: B2Session,
  bucket: string,
  keys: string[],
  at: string,
): Promise<string | null> {
  if (keys.length === 0) return null;
  const r = await updateRecord(read, write, bucket, SKIPPED, (cur) => ({
    ...cur,
    ...Object.fromEntries(keys.map((k) => [k, { withdrawn_at: at }])),
  }));
  return typeof r === "string" ? r : null;
}

/** The one shape a failed store call is reported in. No refusal is silent and
 *  none of them leave the operator without a next step. */
export function storeFailure(err: unknown): Response {
  const detail = err instanceof Error ? err.message : "unknown";
  // B2 answers 403 when the free tier's daily transaction cap is spent, or
  // when a key cannot reach this bucket. "Try again" is the wrong advice for
  // either: the cap resets at 00:00 UTC, and a key does not fix itself (#152).
  if (/\b403\b/.test(detail)) {
    return Response.json(
      {
        error:
          `The store refused this request (${detail}). Either today's free transaction limit is used up -- ` +
          "it resets at 00:00 UTC -- or the storage key cannot reach this bucket. Nothing was changed.",
      },
      { status: 503 },
    );
  }
  return Response.json(
    { error: `Could not reach the store: ${detail}. Nothing was changed; try again.` },
    { status: 502 },
  );
}

/**
 * The store as the Mission lifecycle needs it: the eight operations of
 * `MissionStore`, wrapping the free functions above.
 *
 * The seam is HTTP-free, so a missing credential is a thrown
 * `StoreNotConfigured` rather than a 503 `Response`; every other failure
 * keeps its `b2.ts` wording, because the module classifies on it (`\b403\b`
 * is the daily-cap signal, #152).
 */
export function b2MissionStore(): MissionStore {
  const session = async () => {
    const s = await sessions();
    if (s instanceof Response) throw new StoreNotConfigured();
    return s;
  };
  return {
    async readMissions() {
      const s = await session();
      const unreadable: string[] = [];
      const records = await readMissions(s.read, s.bucket, unreadable);
      return { records, unreadable };
    },
    async readManifest() {
      const s = await session();
      return readManifest(s.read, s.bucket);
    },
    async readLedger() {
      const s = await session();
      return readLedger(s.read, s.bucket);
    },
    async writeMission(record) {
      const s = await session();
      await writeMission(s.write, record);
    },
    async updateLedger(change) {
      const s = await session();
      const result = await updateLedger(s.read, s.write, s.bucket, change);
      if (typeof result === "string") return { ok: false, reason: result } satisfies LedgerResult;
      return { ok: true, ledger: result } satisfies LedgerResult;
    },
    async addSkipped(keys, at) {
      const s = await session();
      const result = await addSkipped(s.read, s.write, s.bucket, keys, at);
      if (result !== null) return { ok: false, reason: result } satisfies SkippedResult;
      return { ok: true } satisfies SkippedResult;
    },
    async writeSpec(key, spec) {
      const s = await session();
      await uploadFile(s.write, key, Buffer.from(JSON.stringify(spec, null, 2)));
    },
    async updateSummaries(key, summary) {
      const s = await session();
      const entry = { photo_count: summary.photo_count, path_length_m: summary.path_length_m, parts: summary.parts };
      const result = await updateSummaries(s.read, s.write, s.bucket, { [key]: entry });
      if (typeof result === "string") throw new Error(result);
    },
  };
}
