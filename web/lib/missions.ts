import type { MissionSpec } from "./spec";
// Server-side mission records. Drafts live under specs/_drafts/<id>.json in
// the same bucket as Specs; Dispatched Specs stay immutable under specs/ and
// are only ever superseded, never edited or deleted (ADR 0016).

export const DRAFTS_PREFIX = "specs/_drafts/";
export const STATUS_KEY = "specs/_status/missions.json";
// Underscore-prefixed inside specs/ on purpose: the server key is confined to
// the specs/ prefix, and collect.py's Spec pattern only matches three-segment
// site/date/file keys, so drafts and the manifest are invisible to Collect.

export interface DraftRecord {
  id: string;
  created_at: string;
  updated_at: string;
  dispatched_key: string | null;
  spec: MissionSpec;
}

export interface LoadedCard {
  card: string;
  name: string;
  waypoints: number;
}

export interface ManifestEntry {
  collected_at?: string;
  loaded_at?: string;
  parts?: number;
  cards?: LoadedCard[];
}

export type Manifest = Record<string, ManifestEntry>;

export type MissionState = "draft" | "dispatched" | "queued" | "collected" | "loaded";

export interface StatusRow {
  kind: "draft" | "spec";
  /** Draft id or full Spec key. */
  id: string;
  site: string;
  date: string;
  state: MissionState;
  /** Lexical dispatch stamp for Specs; updated_at for drafts. */
  stamp: string;
  dispatched_key: string | null;
  collected_at: string | null;
  loaded_at: string | null;
  cards: LoadedCard[];
  /** 1-based position among missions still waiting on the host, if waiting. */
  queue: number | null;
  /** The draft body, on draft rows only — the tab Dispatches and edits from it. */
  spec?: MissionSpec;
}

/** Parse specs/<site>/<date>/<stamp>.json; null for anything else. */
export function parseSpecKey(key: string): { site: string; date: string; stamp: string } | null {
  const m = /^specs\/([^/]+)\/([^/]+)\/([^/]+)\.json$/.exec(key);
  return m ? { site: m[1], date: m[2], stamp: m[3] } : null;
}

/** Pure join of drafts + Dispatched keys + host manifest into status rows. */
export function joinStatus(
  drafts: DraftRecord[],
  specKeys: string[],
  manifest: Manifest,
): StatusRow[] {
  const rows: StatusRow[] = drafts.map((d) => ({
    kind: "draft" as const,
    id: d.id,
    site: d.spec.site ?? "Untitled",
    date: d.spec.date ?? "",
    state: (d.dispatched_key ? "dispatched" : "draft") as MissionState,
    stamp: d.updated_at,
    dispatched_key: d.dispatched_key,
    collected_at: null,
    loaded_at: null,
    cards: [],
    queue: null,
    spec: d.spec,
  }));

  const specs = specKeys
    .map((key) => ({ key, parsed: parseSpecKey(key) }))
    .filter((s) => s.parsed !== null)
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  const waiting = specs.filter(({ key }) => !manifest[key]?.collected_at);
  for (const { key, parsed } of specs) {
    const entry = manifest[key] ?? {};
    // The head of the waiting line is what the host takes next: Dispatched.
    // Everything behind it is Queued. Collected/Loaded come from the manifest.
    const waitIndex = waiting.findIndex((w) => w.key === key);
    rows.push({
      kind: "spec",
      id: key,
      site: parsed!.site,
      date: parsed!.date,
      state:
        entry.loaded_at ? "loaded" : entry.collected_at ? "collected" : waitIndex <= 0 ? "dispatched" : "queued",
      stamp: parsed!.stamp,
      dispatched_key: key,
      collected_at: entry.collected_at ?? null,
      loaded_at: entry.loaded_at ?? null,
      cards: entry.cards ?? [],
      queue: waitIndex < 0 ? null : waitIndex + 1,
    });
  }
  // Newest first: the mission the operator cares about is on top.
  return rows.sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
}
