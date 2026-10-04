// The Load view's side of the board's Load service (PWA-4, #318).
//
// The board is the small Linux computer next to the Controller; the phone
// reaches it over the phone's own hotspot, straight from the browser, with no
// help from the planner's server (#252). Its interface is described in
// scripts/board/README.md: /health, /missions, POST /loads, /loads/<id>. This
// file is that interface as the app uses it, and the sentences the Load view
// says about what came back. Pure but for `fetch`, so a test can drive it.

import { SPECS_PREFIX } from "./keys.ts";
import type { MissionRow } from "./missionRecords.ts";
import { countCheck } from "./missionView.ts";
import { safeStorage } from "./actions.ts";

/** The name the board answers to on an iPhone (it resolves mDNS). Android
 *  Chrome does not resolve `.local`, so the operator types the board's address. */
export const DEFAULT_BOARD = "https://board.local:8787";
export const BOARD_ADDRESS_KEY = "drone-planner.board-address";
const BOARD_PORT = "8787";
/** How long one call to the board may take before it counts as unreachable. */
const CALL_MS = 8000;

/** What the operator typed as the board's address, as an origin; null when it
 *  is not one. "192.168.43.1" is https on the board's port, which is what the
 *  board serves; `http://` is kept only when typed (the board's development
 *  mode, and Android's exemption for private addresses). */
export function boardAddress(typed: string): string | null {
  const text = typed.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    // Browsers differ on what else a host may hold; a board is a name or an IP.
    if (!/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:]+\]$/i.test(url.hostname)) return null;
    return `${url.protocol}//${url.hostname}:${url.port || BOARD_PORT}`;
  } catch {
    return null;
  }
}

export function readBoardAddress(): string {
  return boardAddress(safeStorage()?.getItem(BOARD_ADDRESS_KEY) ?? "") ?? DEFAULT_BOARD;
}

export function saveBoardAddress(address: string): void {
  try {
    safeStorage()?.setItem(BOARD_ADDRESS_KEY, address);
  } catch {
    // Storage full or off: the address works for this visit only.
  }
}

export interface BoardMission {
  /** The Spec's path under specs/, which is also how the store names it. */
  id: string;
  site: string;
  date: string;
  stamp: string;
  /** The Cards reserved for it, or null when the board could not read the Ledger. */
  cards: string[] | null;
}

export interface BoardCard {
  card: string;
  mission: string;
  waypoints: number;
}

export type LoadState = "starting" | "running" | "loaded" | "refused" | "failed";

export interface BoardLoad {
  id: string;
  mission: string;
  state: LoadState;
  reason: string | null;
  cards: BoardCard[];
}

export interface BoardRead {
  controller: boolean;
  busy: string | null;
  missions: BoardMission[];
  /** Why the list is empty, or why its Cards are unknown, in the board's words. */
  note: string | null;
}

/** An answer from the board, a refusal it gave in words, or nothing at all.
 *  A browser reports a certificate it does not trust, a refused origin, a
 *  denied local-network permission and a board that is off the same way, as a
 *  failed fetch, so they are one case here and the checklist covers them all. */
export type BoardReply<T> =
  | { ok: true; body: T }
  | { ok: false; unreachable: true }
  | { ok: false; unreachable?: false; status: number; error: string; reason: string };

async function call<T>(base: string, path: string, init?: RequestInit): Promise<BoardReply<T>> {
  let res: Response;
  try {
    res = await globalThis.fetch(base + path, { ...init, signal: AbortSignal.timeout(CALL_MS) });
  } catch {
    return { ok: false, unreachable: true };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, body: body as T };
  const reason = typeof body.reason === "string" ? body.reason : `The board answered HTTP ${res.status}.`;
  return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : "error", reason };
}

/** Is the board there, is the Controller plugged in, and what is ready to Load. */
export async function readBoard(base: string): Promise<BoardReply<BoardRead>> {
  const [health, missions] = await Promise.all([
    call<{ controller: boolean; busy: string | null }>(base, "/health"),
    call<{ missions: BoardMission[]; note?: string; ledger_error?: string }>(base, "/missions"),
  ]);
  if (!health.ok) return health;
  if (!missions.ok) return missions;
  const { controller, busy } = health.body;
  const { note, ledger_error } = missions.body;
  return {
    ok: true,
    body: { controller, busy, missions: missions.body.missions, note: note ?? ledger_error ?? null },
  };
}

export function startLoad(base: string, mission: string): Promise<BoardReply<BoardLoad>> {
  return call(base, "/loads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission }),
  });
}

/**
 * Follow a Load until the board says how it ended. A call that fails on the way
 * is not the end: the Load goes on at the board whether or not the phone can
 * hear it, so this keeps asking and tells `onLost` while it cannot. Returns
 * null only when `signal` stops it.
 */
export async function followLoad(
  base: string,
  id: string,
  { signal, every = 1500, onLost }: { signal: AbortSignal; every?: number; onLost?: (lost: boolean) => void },
): Promise<BoardLoad | null> {
  while (!signal.aborted) {
    const reply = await call<BoardLoad>(base, `/loads/${encodeURIComponent(id)}`);
    if (signal.aborted) return null;
    onLost?.(!reply.ok && !!reply.unreachable);
    if (reply.ok && reply.body.state !== "running" && reply.body.state !== "starting") return reply.body;
    // The board forgot this Load (it restarted): nothing more will ever come.
    if (!reply.ok && !reply.unreachable && reply.status === 404) {
      return { id, mission: "", state: "failed", reason: reply.reason, cards: [] };
    }
    await new Promise((resolve) => setTimeout(resolve, every));
  }
  return null;
}

// ---------------------------------------------------------------------------
// What the view says
// ---------------------------------------------------------------------------

/** The Mission a board entry is, in the store's own list, if the app has read it. */
export function rowFor(rows: MissionRow[], boardId: string): MissionRow | null {
  return rows.find((r) => r.spec_key === SPECS_PREFIX + boardId) ?? null;
}

/** How a Mission waiting to Load is named: by its Mission Name when the store's
 *  list is at hand, otherwise by what the board knows. */
export function missionLabel(m: BoardMission, row: MissionRow | null): { title: string; detail: string } {
  const place = `${row?.site ?? m.site}, ${m.date}`;
  const cards = m.cards?.length ? `Reserved: ${m.cards.join(", ")}` : "Cards unknown";
  return { title: row ? row.name : place, detail: row ? `${place}. ${cards}` : cards };
}

/** The answer on screen once a Load has ended, in the planner's own terms
 *  (missionView.headlineFor): what to open and what to check inside it, or why
 *  nothing changed. */
export interface LoadAnswer {
  tone: "go" | "stop";
  headline: string;
  detail: string;
  /** One line per Card written: its name and the points to check inside it. */
  cards: { card: string; points: number }[];
}

export function answerFor(load: BoardLoad): LoadAnswer {
  if (load.state === "loaded") {
    const names = load.cards.map((c) => c.card);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    return {
      tone: "go",
      headline: `Open ${list}`,
      detail: countCheck(load.cards.map((c) => ({ points: c.waypoints }))),
      cards: load.cards.map((c) => ({ card: c.card, points: c.waypoints })),
    };
  }
  if (load.state === "refused") {
    return {
      tone: "stop",
      headline: "Not Loaded. The Controller was left as it was.",
      detail: load.reason ?? "The loader refused and gave no reason.",
      cards: [],
    };
  }
  return {
    tone: "stop",
    headline: "The Load failed. Do not fly this Mission.",
    detail:
      `${load.reason ?? "The loader stopped without saying why."} The Controller may not hold this Mission: ` +
      "Load it again, or check each Card before flying.",
    cards: [],
  };
}

/** What to try when the board does not answer, most likely first. */
export const UNREACHABLE_CHECKLIST: readonly string[] = [
  "The hotspot is on, on the phone you are holding, and the board has joined it.",
  "The board has power and has finished starting (about a minute after power-on).",
  "The board's certificate is trusted. iPhone: Settings, General, About, Certificate Trust Settings, switch on Wayfinder board CA. Android: install the CA certificate once.",
  "Android only: when Chrome asks to look for and connect to devices on your local network, tap Allow. If it was refused, allow it in Chrome's Site settings for this app.",
  "The address below is the board's. An iPhone finds board.local; Android cannot, so type the board's address, such as 192.168.43.1.",
  "The board lists this app's address as allowed (BOARD_ALLOW_ORIGIN on the board).",
];

/** Chrome's local-network permission, when this browser has one and it was
 *  refused. Unknown names and browsers without the permission read as not refused. */
export async function localNetworkRefused(): Promise<boolean> {
  for (const name of ["local-network-access", "local-network"]) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state === "denied";
    } catch {
      // Not a permission this browser knows.
    }
  }
  return false;
}
