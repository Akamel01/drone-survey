// The phone is told when a Mission changes (PWA-5, #319; decided in #232).
//
// Web Push from the installed app, with ntfy.sh as the fallback an Account can
// switch on. The planner sends what it changes (Dispatched, Withdrawn,
// Superseded) from its own routes; the Linux host sends what only it sees
// (Collected, Loaded, a Load refused) by POSTing to /api/push/host, and this
// module turns that into words and sends them. Flown is never announced: it
// stays the operator's own mark (CONTEXT.md, Flown).
//
// Subscriptions belong to an Account and are kept in the account database
// (`push_subscription`), one row per device, plus one row per Account for its
// ntfy topic. A notice goes to every device of every Account in the Workspace
// that owns the Mission; a host refusal goes to the operator's Workspace only,
// because the Controller is the operator's (ADR 0025).
//
// Sending is bookkeeping, never the operation: nothing here throws to its
// caller, and a Mission change never fails because a phone was not told.
//
// Explicit .ts on relative imports: scripts/migrate.mjs loads this file with
// no test hooks in front of it.

import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import webpush from "web-push";
import { getPool } from "./accountDb.ts";
import { ownerWorkspaceSlug } from "./accountAuth.ts";
import type { MissionRecord } from "./missionRecords.ts";

/** What a phone shows: a title, one or two sentences, and a tag so a newer
 *  notice about the same Mission replaces the older one on the Lock Screen. */
export interface Notice {
  title: string;
  body: string;
  tag: string;
}

/** One place a notice goes: a Web Push subscription, or (`p256dh` null) an
 *  ntfy topic stored as `ntfy:<topic>`. */
export interface PushTarget {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

/** What the host reports (POST /api/push/host). Spec keys only: the planner
 *  knows which Mission and Workspace each key belongs to. */
export type HostEvent =
  | { event: "collected"; keys: string[] }
  | { event: "loaded"; loads: { key: string; cards: string[] }[] }
  | { event: "refused"; keys: string[]; reason: string };

const NTFY = "ntfy:";

// --- the words -------------------------------------------------------------

const list = (cards: string[]) => cards.join(", ");

/** A Dispatch: the new Mission, and the earlier one of the same name it
 *  Superseded (same Site, date and name, so its words need nothing else). */
export function dispatchNotices(body: {
  mission: Pick<MissionRecord, "id" | "name" | "site" | "date">;
  cards: string[];
  superseded: string[];
}): Notice[] {
  const { mission: m, cards } = body;
  const out: Notice[] = [
    {
      title: "Dispatched",
      body: `${m.name} is Dispatched for ${m.site} ${m.date}. ${cards.length ? `${list(cards)} ${cards.length === 1 ? "is" : "are"} reserved for it.` : ""}`.trim(),
      tag: `mission-${m.id}`,
    },
  ];
  for (const id of body.superseded) {
    out.push({
      title: "Superseded",
      body: `The earlier ${m.name} for ${m.site} ${m.date} was Superseded by a newer one. Its Card is free.`,
      tag: `mission-${id}`,
    });
  }
  return out;
}

export function withdrawNotice(body: { id: string; name: string; cards_released: string[] }): Notice {
  return {
    title: "Withdrawn",
    body: `${body.name} was Withdrawn. ${body.cards_released.length ? `${list(body.cards_released)} ${body.cards_released.length === 1 ? "is" : "are"} free.` : "It held no Card."}`,
    tag: `mission-${body.id}`,
  };
}

/** The request body the host sent, checked, or null. Bounded so a stray
 *  caller with the token cannot make the planner loop or send essays. */
export function hostEvent(raw: unknown): HostEvent | null {
  const r = raw as Record<string, unknown> | null;
  const keys = (v: unknown) =>
    Array.isArray(v) && v.length >= 1 && v.length <= 50 && v.every((k) => typeof k === "string" && k.length <= 300)
      ? (v as string[])
      : null;
  if (r?.event === "collected") {
    const k = keys(r.keys);
    return k && { event: "collected", keys: k };
  }
  if (r?.event === "refused") {
    const k = Array.isArray(r.keys) && r.keys.length === 0 ? [] : keys(r.keys);
    if (!k || typeof r.reason !== "string" || !r.reason.trim()) return null;
    return { event: "refused", keys: k, reason: r.reason.trim().slice(0, 600) };
  }
  if (r?.event === "loaded" && Array.isArray(r.loads) && r.loads.length >= 1 && r.loads.length <= 50) {
    const loads: { key: string; cards: string[] }[] = [];
    for (const l of r.loads as Record<string, unknown>[]) {
      const k = keys([l?.key]);
      const cards = Array.isArray(l?.cards) && l.cards.length <= 6 && l.cards.every((c) => typeof c === "string") ? (l.cards as string[]) : null;
      if (!k || !cards) return null;
      loads.push({ key: k[0], cards: cards.map((c) => c.slice(0, 80)) });
    }
    return { event: "loaded", loads };
  }
  return null;
}

/** Who to tell what, for one host report. `workspace` null is the operator's.
 *  A key no Mission was Dispatched as (rehearsal data, a hand-made Spec) is
 *  told to the operator by its key. A Mission with no ownership row is the
 *  operator's (ADR 0025). */
export function hostNotices(
  event: HostEvent,
  records: Pick<MissionRecord, "id" | "name" | "dispatched_key">[],
  owned: Map<string, string>,
): { workspace: string | null; notice: Notice }[] {
  if (event.event === "refused") {
    return [{ workspace: null, notice: { title: "Load refused", body: event.reason, tag: "load-refused" } }];
  }
  const byKey = (key: string) => records.find((r) => r.dispatched_key === key);
  const who = (key: string) => {
    const m = byKey(key);
    return { workspace: (m && owned.get(m.id)) ?? null, name: m?.name ?? key, tag: m ? `mission-${m.id}` : key };
  };
  if (event.event === "collected") {
    return event.keys.map((key) => {
      const w = who(key);
      return {
        workspace: w.workspace,
        notice: { title: "Collected", body: `${w.name} is Collected. It will Load when the Controller is plugged in.`, tag: w.tag },
      };
    });
  }
  return event.loads.map(({ key, cards }) => {
    const w = who(key);
    return {
      workspace: w.workspace,
      notice: {
        title: "Loaded",
        body: cards.length
          ? `${w.name} is Loaded into ${list(cards)}. Open ${cards[0]}.`
          : `${w.name} is Loaded. Open the app to see which Card.`,
        tag: w.tag,
      },
    };
  });
}

// --- the registry (account database) ---------------------------------------

/** Forward-only and re-runnable, like mission_workspace. No foreign key to the
 *  Account: removing one leaves rows nobody is sent to, pruned on the next
 *  send that answers 404/410 or never matched again. */
export async function migratePush(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS push_subscription (
       endpoint text PRIMARY KEY,
       account_id text NOT NULL,
       workspace_id text NOT NULL,
       p256dh text,
       auth text,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

async function pool(): Promise<Pool> {
  const p = await getPool();
  if (!p) throw new Error("the account database is not configured (DATABASE_URL)");
  return p;
}

/** A browser's PushSubscription as JSON, checked, or null. https only: the
 *  planner POSTs to it, so it must be a push service, not anything on a LAN. */
export function subscriptionOf(raw: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const s = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const b64 = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1000) return null;
  try {
    if (new URL(s.endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (!b64(s.keys?.p256dh, 200) || !b64(s.keys?.auth, 100)) return null;
  return { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth };
}

/** This device now belongs to this Account: a phone handed to someone else
 *  who signs in and subscribes is theirs from then on. */
export async function subscribe(accountId: string, workspaceId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  await (await pool()).query(
    `INSERT INTO push_subscription (endpoint, account_id, workspace_id, p256dh, auth) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET account_id = $2, workspace_id = $3, p256dh = $4, auth = $5`,
    [sub.endpoint, accountId, workspaceId, sub.p256dh, sub.auth],
  );
}

export async function unsubscribe(accountId: string, endpoint: string) {
  await (await pool()).query("DELETE FROM push_subscription WHERE endpoint = $1 AND account_id = $2", [endpoint, accountId]);
}

/** This Account's ntfy topic, or null when the fallback is off. */
export async function ntfyTopic(accountId: string): Promise<string | null> {
  const { rows } = await (await pool()).query<{ endpoint: string }>(
    "SELECT endpoint FROM push_subscription WHERE account_id = $1 AND p256dh IS NULL LIMIT 1",
    [accountId],
  );
  return rows[0] ? rows[0].endpoint.slice(NTFY.length) : null;
}

/** Switch the ntfy fallback on (a fresh random topic; the topic is the only
 *  secret ntfy has) or off. On again keeps the topic the phone subscribed to. */
export async function setNtfy(accountId: string, workspaceId: string, on: boolean): Promise<string | null> {
  const p = await pool();
  if (!on) {
    await p.query("DELETE FROM push_subscription WHERE account_id = $1 AND p256dh IS NULL", [accountId]);
    return null;
  }
  const existing = await ntfyTopic(accountId);
  if (existing) return existing;
  const topic = `mission-control-${randomBytes(18).toString("base64url")}`;
  await p.query(
    "INSERT INTO push_subscription (endpoint, account_id, workspace_id) VALUES ($1, $2, $3)",
    [NTFY + topic, accountId, workspaceId],
  );
  return topic;
}

async function targets(workspaceId: string | null): Promise<PushTarget[]> {
  const p = await pool();
  const { rows } =
    workspaceId === null
      ? await p.query<PushTarget>(
          `SELECT s.endpoint, s.p256dh, s.auth FROM push_subscription s
             JOIN "organization" o ON o.id = s.workspace_id WHERE o.slug = $1`,
          [ownerWorkspaceSlug()],
        )
      : await p.query<PushTarget>("SELECT endpoint, p256dh, auth FROM push_subscription WHERE workspace_id = $1", [workspaceId]);
  return rows;
}

// --- sending ---------------------------------------------------------------

export interface PushConfig {
  vapid: { subject: string; publicKey: string; privateKey: string } | null;
  ntfyUrl: string;
}

/** The VAPID trio (all three, or Web Push is off) and the ntfy server. The
 *  private key lives only in the Vercel environment (the operator sets it). */
export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig {
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env;
  return {
    vapid:
      VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
        ? { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY }
        : null,
    ntfyUrl: (env.NTFY_URL || "https://ntfy.sh").replace(/\/+$/, ""),
  };
}

/** Send one notice to each target. Returns the endpoints the push service
 *  says are gone (404/410), for pruning. Never throws. */
export async function deliver(
  to: PushTarget[],
  notice: Notice,
  config: PushConfig,
  send: typeof fetch = fetch,
): Promise<{ sent: number; gone: string[] }> {
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    to.map(async (t) => {
      try {
        let response: Response;
        if (t.p256dh === null) {
          // ntfy: plain text, title in a header (https://docs.ntfy.sh/publish/).
          response = await send(`${config.ntfyUrl}/${t.endpoint.slice(NTFY.length)}`, {
            method: "POST",
            headers: { Title: notice.title, Tags: "helicopter" },
            body: notice.body,
            signal: AbortSignal.timeout(5000),
          });
        } else {
          if (!config.vapid) return;
          const request = webpush.generateRequestDetails(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth ?? "" } },
            JSON.stringify({ ...notice, url: "/plan" }),
            { vapidDetails: config.vapid, TTL: 86400, urgency: "high" },
          );
          response = await send(request.endpoint, {
            method: request.method,
            headers: request.headers as Record<string, string>,
            body: new Uint8Array(request.body),
            signal: AbortSignal.timeout(5000),
          });
        }
        if (response.status === 404 || response.status === 410) gone.push(t.endpoint);
        else if (response.ok) sent++;
        else console.error(`push: ${notice.title} was not sent to one device (${response.status})`);
      } catch (error) {
        console.error(`push: ${notice.title} was not sent to one device:`, error instanceof Error ? error.message : error);
      }
    }),
  );
  return { sent, gone };
}

/** Tell a Workspace (null: the operator's). Never throws; a device the push
 *  service has forgotten is removed so it stops costing a request. */
export async function notify(workspaceId: string | null, notices: Notice[]): Promise<void> {
  try {
    const config = pushConfig();
    let to = await targets(workspaceId);
    for (const notice of notices) {
      if (!to.length) return;
      const { gone } = await deliver(to, notice, config);
      if (!gone.length) continue;
      await (await pool()).query("DELETE FROM push_subscription WHERE endpoint = ANY($1)", [gone]);
      to = to.filter((t) => !gone.includes(t.endpoint));
    }
  } catch (error) {
    console.error("push: nobody was told:", error instanceof Error ? error.message : error);
  }
}
