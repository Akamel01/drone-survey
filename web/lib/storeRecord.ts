// One way to change a shared JSON record in the store (#350).
//
// The Card Ledger, the skip list and the Spec summaries are each one file that
// several writers change, and B2 has no compare-and-swap. They share one rule
// here, so no record can drift into a weaker discipline than another:
//
//  - Concurrency: read, decide, re-read just before writing (decide again if
//    anyone wrote meanwhile), write, wait, read back to check the change
//    survived; retry a few times, then say so in words.
//  - Corrupt file: a record that does not parse is a failure, never an empty
//    record. Reading it as empty would let the next write erase it.
//
// `change` must be pure: it is re-run on each fresh read.

import { downloadFile, uploadFile, type B2Session } from "./b2.ts";

export interface RecordSpec<T> {
  key: string;
  /** What the operator calls it, for errors: "Card Ledger", "skip list". */
  what: string;
  /** Value when the file does not exist yet. */
  empty: () => T;
  /** Shape a parsed file; defaults to the parsed value. */
  normalize?: (parsed: any) => T; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Whether our change is still in `after`, ignoring other writers' changes. */
  survived: (base: T, next: T, after: T) => boolean;
}

/** How long a write waits before checking it survived. Long enough for another
 *  writer's upload, already in flight when ours landed, to land too. */
const SETTLE_MS = Number(process.env.LEDGER_SETTLE_MS ?? 1000);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function readRecord<T>(read: B2Session, bucket: string, spec: RecordSpec<T>): Promise<T> {
  const raw = await downloadFile(read, bucket, spec.key);
  if (!raw) return spec.empty();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    throw new Error(`the stored ${spec.what} is not valid JSON`);
  }
  return spec.normalize ? spec.normalize(parsed) : (parsed as T);
}

/** For a record that is a map of independent entries: every entry we changed
 *  must read back as we wrote it; entries we left alone are not ours to check. */
export function mapSurvived<V>(base: Record<string, V>, next: Record<string, V>, after: Record<string, V>): boolean {
  for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (!same(base[k], next[k]) && !same(after[k], next[k])) return false;
  }
  return true;
}

/** Returns the record as read back, or a string saying what to do next. */
export async function updateRecord<T>(
  read: B2Session,
  write: B2Session,
  bucket: string,
  spec: RecordSpec<T>,
  change: (started: T) => T | string,
): Promise<T | string> {
  // ponytail: this narrows the race to the settle window; only a store with
  // compare-and-swap, or one writer, closes it.
  for (let attempt = 0; attempt < 3; attempt++) {
    let base = await readRecord(read, bucket, spec);
    let next = change(base);
    if (typeof next === "string") return next;
    const latest = await readRecord(read, bucket, spec);
    if (!same(latest, base)) {
      base = latest;
      next = change(base);
      if (typeof next === "string") return next;
    }
    await uploadFile(write, spec.key, Buffer.from(JSON.stringify(next, null, 2)));
    if (SETTLE_MS > 0) await new Promise((r) => setTimeout(r, SETTLE_MS));
    const after = await readRecord(read, bucket, spec);
    if (spec.survived(base, next, after)) return after;
  }
  return (
    `The ${spec.what} kept changing while this was being written, so it could not be confirmed. ` +
    "Nothing is certain to have been kept: reload the Mission list and try again."
  );
}
