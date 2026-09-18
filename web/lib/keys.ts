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
export const STATUS_KEY = "specs/_status/missions.json";
export const SUMMARIES_KEY = "specs/_status/summaries.json";
export const SKIPPED_KEY = "specs/_status/skipped.json";

/** A Spec's key: specs/<site>/<date>/<dispatch stamp> (ADR 0016). */
export function makeSpecKey(site: string, date: string, stamp: string): string {
  return `specs/${site}/${date}/${stamp}.json`;
}

/** Parse specs/<site>/<date>/<stamp>.json; null for anything else. */
export function parseSpecKey(key: string): { site: string; date: string; stamp: string } | null {
  const m = /^specs\/([^/]+)\/([^/]+)\/([^/]+)\.json$/.exec(key);
  return m ? { site: m[1], date: m[2], stamp: m[3] } : null;
}

/** A draft's key: one JSON file per draft, under the drafts prefix. */
export function draftKey(id: string): string {
  return `${DRAFTS_PREFIX}${id}.json`;
}

/** Dispatch stamps sort lexically; this turns one back into an instant. */
export function stampToIso(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : stamp;
}
