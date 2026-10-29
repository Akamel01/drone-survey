// One-off backfill: Specs Dispatched before dispatch-time summaries existed have
// no entry in specs/_status/summaries.json, so the Status tab shows no point
// count or distance for them, and a summary written before part counts
// existed leaves the Status tab unable to predict which card a waiting
// Mission will Load into (#128). This recomputes those numbers from each Spec body
// using the same preview() the planner uses — never a second implementation.
//
//   cd web && node --env-file=.env.local scripts/backfill-summaries.ts
//
// Reads Specs; writes only specs/_status/summaries.json. Safe to re-run: it
// skips keys whose summary already carries a part count.
import { authorize, b2Env, b2ReadEnv, downloadFile, listFiles } from "../lib/b2.ts";
import { readRecord } from "../lib/storeRecord.ts";
import { SUMMARIES_SPEC, updateSummaries } from "../lib/missionStore.ts";
import { SPECS_PREFIX, parseSpecKey } from "../lib/keys.ts";
import type { SpecSummary } from "../lib/missions.ts";
import { preview } from "../lib/mission.ts";
import type { MissionSpec } from "../lib/spec.ts";

async function main(): Promise<void> {
  const readEnv = b2ReadEnv();
  const writeEnv = b2Env();
  if (!readEnv || !writeEnv) {
    console.error("Set B2_READ_KEY_ID/B2_READ_APP_KEY and B2_KEY_ID/B2_APP_KEY/B2_BUCKET.");
    process.exit(1);
  }

  const read = await authorize(readEnv);
  const write = readEnv.keyId === writeEnv.keyId ? read : await authorize(writeEnv);

  // Only to know which keys to skip; the write below re-reads and folds in.
  const summaries: Record<string, SpecSummary> = await readRecord(read, writeEnv.bucket, SUMMARIES_SPEC);

  const files = await listFiles(read, SPECS_PREFIX);
  const touched = new Set<string>();
  let added = 0;
  for (const f of files) {
    const key = f.fileName;
    if (!parseSpecKey(key)) continue; // drafts and _status are not Specs
    // A summary written before part counts existed is the whole reason the
    // Status tab cannot predict a card for an already-Dispatched Mission, so
    // "already has a summary" is not a reason to skip it -- "already has a
    // part count" is.
    if (summaries[key]?.parts != null) continue;
    const raw = await downloadFile(read, writeEnv.bucket, key);
    if (!raw) continue;
    let spec: MissionSpec;
    try {
      spec = JSON.parse(raw.toString()) as MissionSpec;
    } catch {
      console.error(`skipped (unparseable): ${key}`);
      continue;
    }
    // A grid Spec's AOI must be [lat, lon] pairs. Anything else predates the
    // current schema; skip it rather than guess, and say so.
    const aoiPairs =
      Array.isArray(spec.aoi) && spec.aoi.every((p) => Array.isArray(p) && p.length >= 2);
    if (spec.mission_type !== "orbit" && !aoiPairs) {
      // A Spec from before the current schema: its area is {lat,lng} objects
      // and its flight settings are flat, with no gimbal pitch, margin passes,
      // speed or battery. Points and distance cannot be derived from that
      // without inventing the missing inputs, and a card prediction certainly
      // cannot. Record why rather than skipping in silence — a blank row with
      // no explanation is the failure this whole set of fixes is about.
      summaries[key] = { unavailable: "Dispatched before the current Mission format" };
      added++;
      touched.add(key);
      console.log(`no figures (pre-schema Spec)  ${key}`);
      continue;
    }
    const had = summaries[key] != null;
    const p = preview(spec);
    summaries[key] = {
      photo_count: p.photo_count,
      path_length_m: Math.round(p.path_length_m * 100) / 100,
      parts: p.parts,
    };
    added++;
    touched.add(key);
    console.log(`${had ? "filled in" : "added"} ${p.photo_count} points · ${p.path_length_m.toFixed(1)} m · ${p.parts} part(s)  ${key}`);
  }

  // Fold only what we computed into whatever is stored now, so a Dispatch
  // recording its own summary while the loop ran is never dropped.
  const computed = Object.fromEntries(Object.entries(summaries).filter(([k]) => touched.has(k)));
  const result = await updateSummaries(read, write, writeEnv.bucket, computed, (cur, k) => cur[k]?.parts == null);
  if (typeof result === "string") {
    console.error(`refusing to write: ${result}`);
    process.exit(1);
  }
  console.log(`summaries: ${Object.keys(result).length} total, ${added} written`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
