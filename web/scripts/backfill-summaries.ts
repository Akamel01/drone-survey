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
import { authorize, b2Env, b2ReadEnv, downloadFile, listFiles, uploadFile } from "../lib/b2.ts";
import { SPECS_PREFIX, SUMMARIES_KEY, parseSpecKey } from "../lib/keys.ts";
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

  const existingRaw = await downloadFile(read, writeEnv.bucket, SUMMARIES_KEY);
  const summaries: Record<string, SpecSummary> = existingRaw
    ? (JSON.parse(existingRaw.toString()) as Record<string, SpecSummary>)
    : {};

  const files = await listFiles(read, SPECS_PREFIX);
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
      console.error(`skipped (unexpected aoi shape): ${key}`);
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
    console.log(`${had ? "filled in" : "added"} ${p.photo_count} points · ${p.path_length_m.toFixed(1)} m · ${p.parts} part(s)  ${key}`);
  }

  // This uploads the whole file, so anything written while the loop was running
  // -- a Dispatch recording its own summary -- would be replaced by a copy that
  // predates it. Re-read immediately before writing and fold in anything new,
  // and refuse outright if a key we started with has gone. Recomputing is cheap;
  // silently dropping another writer's record is not, and nothing downstream
  // could tell that it happened.
  const beforeKeys = new Set(Object.keys(summaries));
  const latestRaw = await downloadFile(read, writeEnv.bucket, SUMMARIES_KEY);
  const latest: Record<string, SpecSummary> = latestRaw
    ? (JSON.parse(latestRaw.toString()) as Record<string, SpecSummary>)
    : {};

  const lost = Object.keys(latest).filter((k) => !beforeKeys.has(k) && summaries[k] == null);
  let folded = 0;
  for (const k of lost) {
    summaries[k] = latest[k];
    folded++;
  }
  const dropped = Object.keys(latest).filter((k) => summaries[k] == null);
  if (dropped.length) {
    console.error(`refusing to write: ${dropped.length} summaries would be lost, first ${dropped[0]}`);
    process.exit(1);
  }

  await uploadFile(write, SUMMARIES_KEY, Buffer.from(JSON.stringify(summaries, null, 2)));
  console.log(
    `summaries: ${Object.keys(summaries).length} total, ${added} written` +
      (folded ? `, ${folded} folded in from a concurrent write` : ""),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
