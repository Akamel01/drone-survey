// The in-memory adapter for the Mission lifecycle (#259, D5).
//
// Tests drive the real module -- every check order, write order and message --
// with only the store replaced. `calls` records what the module asked for, in
// order, so write orders can be asserted; `failNext` makes one operation throw
// on demand, so every partial-failure tail is reachable without a network.
//
// `fakeStore.ts` stays what it is: a fetch-level fake for the B2 adapter's own
// tests (checksums, transaction classes, interleaving). This is the other
// adapter: the store seam's contract, no HTTP at all.

import { MISSIONS_PREFIX, missionKey } from "./keys.ts";
import type { LedgerResult, MissionStore, SkippedResult } from "./missionLifecycle.ts";
import { isMissionRecord, type MissionRecord } from "./missionRecords.ts";
import type { Manifest, SpecSummary } from "./missions.ts";
import { EMPTY_LEDGER, type CardLedger } from "./model.ts";
import type { MissionSpec } from "./spec.ts";

export type StoreOp =
  | "readMissions"
  | "readManifest"
  | "readLedger"
  | "writeMission"
  | "updateLedger"
  | "addSkipped"
  | "writeSpec"
  | "updateSummaries";

export interface MemorySeed {
  ledger?: CardLedger;
  manifest?: Manifest;
  records?: readonly unknown[];
  specs?: Record<string, MissionSpec>;
  summaries?: Record<string, SpecSummary>;
}

export interface MemoryMissionStore extends MissionStore {
  /** Ordered operation log, with a discriminator: `writeMission:<id>`,
   *  `addSkipped:<key,key>`, `writeSpec:<key>`, `updateSummaries:<key>`, and
   *  the bare name for reads and `updateLedger`. */
  calls: string[];
  /** Queue one error for `op`; it throws before any change, once. */
  failNext(op: StoreOp, error: Error): void;
  ledger(): CardLedger;
  manifest(): Manifest;
  records(): MissionRecord[];
  specs(): Map<string, MissionSpec>;
  summaries(): Record<string, SpecSummary>;
  putLedger(ledger: CardLedger): void;
  putManifest(manifest: Manifest): void;
  putRecords(records: readonly unknown[]): void;
}

/** Clone in and out, as a JSON round trip does over the wire, so a caller's
 *  later mutation is invisible to the store and vice versa. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function memoryMissionStore(seed: MemorySeed = {}): MemoryMissionStore {
  let ledgerState = clone(seed.ledger ?? EMPTY_LEDGER);
  let manifestState = clone(seed.manifest ?? {});
  const missions = new Map<string, unknown>();
  const specState = new Map<string, MissionSpec>();
  let summariesState = clone(seed.summaries ?? {});
  const skipped: Record<string, { withdrawn_at: string }> = {};
  const faults = new Map<StoreOp, Error[]>();
  let broken = 0;

  const calls: string[] = [];

  /** Log first, then throw: a failed attempt is still a call the module made. */
  function enter(op: StoreOp, entry: string): void {
    calls.push(entry);
    const queued = faults.get(op);
    const err = queued?.shift();
    if (err) throw err;
  }

  function putRecords(records: readonly unknown[]): void {
    for (const value of records) {
      const id = (value as { id?: unknown })?.id;
      const key =
        typeof id === "string" ? `${MISSIONS_PREFIX}${id}.json` : `${MISSIONS_PREFIX}broken-${++broken}.json`;
      missions.set(key, clone(value));
    }
  }

  for (const [key, spec] of Object.entries(seed.specs ?? {})) specState.set(key, clone(spec));
  if (seed.records) putRecords(seed.records);

  return {
    calls,

    failNext(op, error) {
      const queued = faults.get(op) ?? [];
      queued.push(error);
      faults.set(op, queued);
    },

    async readMissions(): Promise<{ records: MissionRecord[]; unreadable: string[] }> {
      enter("readMissions", "readMissions");
      // One hand-edited record is reported, never dropped: mirrors the B2
      // adapter's read (missionStore.ts).
      const unreadable: string[] = [];
      const records: MissionRecord[] = [];
      for (const [key, value] of missions) {
        let parsed: unknown = value;
        if (typeof value === "string") {
          try {
            parsed = JSON.parse(value);
          } catch {
            parsed = undefined;
          }
        }
        if (isMissionRecord(parsed)) records.push(clone(parsed));
        else unreadable.push(key);
      }
      return { records, unreadable };
    },

    async readManifest(): Promise<Manifest> {
      enter("readManifest", "readManifest");
      return clone(manifestState);
    },

    async readLedger(): Promise<CardLedger> {
      enter("readLedger", "readLedger");
      return clone(ledgerState);
    },

    async writeMission(record: MissionRecord): Promise<void> {
      enter("writeMission", `writeMission:${record.id}`);
      missions.set(missionKey(record.id), clone(record));
    },

    /** One read, one run of the pure change, one write: no settle loop. The
     *  interleaved races are the B2 adapter's job (`missionStore.test.ts`). */
    async updateLedger(change: (started: CardLedger) => CardLedger | string): Promise<LedgerResult> {
      enter("updateLedger", "updateLedger");
      const started = clone(ledgerState);
      const next = change(started);
      if (typeof next === "string") return { ok: false, reason: next };
      ledgerState = clone(next);
      return { ok: true, ledger: clone(next) };
    },

    async addSkipped(keys: string[], at: string): Promise<SkippedResult> {
      // `[]` is a success and writes nothing, exactly as the B2 adapter does.
      if (keys.length === 0) return { ok: true };
      enter("addSkipped", `addSkipped:${keys.join(",")}`);
      for (const key of keys) skipped[key] = { withdrawn_at: at };
      return { ok: true };
    },

    async writeSpec(key: string, spec: MissionSpec): Promise<void> {
      enter("writeSpec", `writeSpec:${key}`);
      specState.set(key, clone(spec));
    },

    async updateSummaries(key: string, summary: SpecSummary): Promise<void> {
      enter("updateSummaries", `updateSummaries:${key}`);
      summariesState = { ...summariesState, [key]: clone(summary) };
    },

    ledger() {
      return clone(ledgerState);
    },
    manifest() {
      return clone(manifestState);
    },
    records() {
      return [...missions.values()].filter(isMissionRecord).map(clone);
    },
    specs() {
      return new Map(specState);
    },
    summaries() {
      return clone(summariesState);
    },
    putLedger(ledger) {
      ledgerState = clone(ledger);
    },
    putManifest(manifest) {
      manifestState = clone(manifest);
    },
    putRecords,
  };
}
