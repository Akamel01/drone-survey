// Every store key the web app builds or parses. One home for the layout, so the
// producer and the consumer cannot drift: keys are made here and read here, and
// no route holds a literal (ADR 0017).
//
// Underscore-prefixed paths inside specs/ are on purpose: the server key is
// confined to the specs/ prefix and collect.py's Spec pattern matches only
// three-segment site/date/file keys, so drafts and status records are invisible
// to Collect (ADR 0016).

export const SPECS_PREFIX = "specs/";
export const DRAFTS_PREFIX = "specs/_drafts/";
/** One file per Mission, so two Missions saved at once cannot overwrite each
 *  other -- the whole-file hazard is confined to the Ledger, which has a
 *  merge rule of its own (ADR 0021). */
export const MISSIONS_PREFIX = "specs/_missions/";
/** The Card Ledger: written by the planner at Dispatch and by the host at
 *  Load, read by both (ADR 0022). */
export const LEDGER_KEY = "specs/_status/card-ledger.json";
export const STATUS_KEY = "specs/_status/missions.json";
export const SUMMARIES_KEY = "specs/_status/summaries.json";
export const SKIPPED_KEY = "specs/_status/skipped.json";

/** A Spec's key: specs/<site>/<date>/<dispatch stamp> (ADR 0016). */
export function makeSpecKey(site: string, date: string, stamp: string, prefix?: string): string {
  const pre = prefix ?? SPECS_PREFIX;
  return `${pre}${site}/${date}/${stamp}.json`;
}

/** Parse specs/<site>/<date>/<stamp>.json; null for anything else. */
export function parseSpecKey(
  key: string,
  prefix?: string
): { site: string; date: string; stamp: string } | null {
  const preRaw = prefix ?? SPECS_PREFIX;
  const pre = preRaw.endsWith("/") ? preRaw.slice(0, -1) : preRaw;
  // Escape the prefix for RegExp construction, including the path separator
  // so we can safely append the following path components
  const esc = pre.replace(/[.*+?^${}()|[\\]\/]/g, "\\$&");
  const re = new RegExp(`^${esc}\/([^/]+)\/([^/]+)\/([^/]+)\\.json$`);
  const m = re.exec(key);
  return m ? { site: m[1], date: m[2], stamp: m[3] } : null;
}

/** A draft's key: one JSON file per draft, under the drafts prefix. */
export function draftKey(id: string): string {
  return `${DRAFTS_PREFIX}${id}.json`;
}

/** A Mission record's key. The id is a server-minted uuid; this still refuses
 *  anything that could climb out of the prefix, because the id arrives from
 *  the browser on every call after the first. */
export function missionKey(id: string): string {
  if (!isSafeId(id)) throw new Error(`unsafe mission id: ${id}`);
  return `${MISSIONS_PREFIX}${id}.json`;
}

/** What a phone with no signal names a Mission it saves: the store's own ids
 *  are uuids and can never start with this, so the two cannot meet (PWA-3). */
export const LOCAL_ID_PREFIX = "local-";

export function isSafeId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
}

/** A Dispatch stamp: the instant, to the second, then the Mission's own id so
 *  two Missions Dispatched in one second never share a key (#152). Still sorts
 *  by time, because the instant comes first. */
export function dispatchStamp(at: Date, missionId: string): string {
  const instant = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${instant}-${missionId.replace(/[^a-z0-9]/gi, "").slice(0, 8)}`;
}

/** Dispatch stamps sort lexically; this turns one back into an instant. */
export function stampToIso(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-[a-z0-9]+)?$/i.exec(stamp);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : stamp;
}
