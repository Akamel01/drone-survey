"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import type { StatusRow } from "@/lib/missions";
import { preview } from "@/lib/mission";
import { isSpecWithdrawable, isWithdrawn, isDraftDeletable } from "@/lib/missions";
import styles from "./MissionStatus.module.css";

// The mission console: every mission from the server store and every
// Dispatched Spec from the cloud, actionable and identical after a refresh, a
// closed browser, or a second browser. Same passphrase the Dispatch button
// uses, read from the same browser storage.
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

interface MissionStatusProps {
  spec: MissionSpec;
  onLoadMission: (spec: MissionSpec) => void;
  /** The standalone status page has no planner Spec to save; it hides Save. */
  allowSave?: boolean;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; rows: StatusRow[]; hostReported: boolean; notice: HostNotice | null }
  | { kind: "error"; message: string };

interface HostNotice {
  type: string;
  at: string;
  waiting?: string[];
  parts_needed?: number;
  cards_have?: number;
  action?: string;
}

export default function MissionStatus({ spec, onLoadMission, allowSave = true }: MissionStatusProps) {
  // Draft previews cache removed: compute inline previews during render.
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [status, setStatus] = useState<FetchState>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    try {
      const res = await fetch("/api/status", { headers: { "x-wayfinder-key": key } });
      const body = await res.json();
      if (res.ok && Array.isArray(body.rows)) {
        setStatus({ kind: "ok", rows: body.rows, hostReported: body.host_reported === true, notice: body.notice ?? null });
      } else {
        setStatus({ kind: "error", message: body.error ?? `Status failed (${res.status})` });
      }
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Status failed" });
    }
  }, []);

  useEffect(() => {
    const key = localStorage.getItem(PASSPHRASE_KEY) ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of localStorage
    setPassphrase(key);
    if (!key) return;
    load(key);
    const t = setInterval(() => load(key), 30000);
    return () => clearInterval(t);
  }, [load]);

  async function act(label: string, fn: () => Promise<Response>) {
    if (!passphrase) return;
    setBusy(label);
    setNotice(null);
    try {
      const res = await fn();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`${label} failed: ${body.error ?? res.status}`);
      } else if (body.key) {
        setNotice(`${label}: ${body.key}`);
      } else if (body.deleted) {
        setNotice(`${label}: draft removed (its Dispatched Spec, if any, stays in the store)`);
      } else if (body.draft) {
        setNotice(`${label}: draft saved`);
      }
      await load(passphrase);
    } catch (err) {
      setNotice(`${label} failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setBusy(null);
    }
  }

  const saveDraft = () =>
    act("Save draft", () =>
      fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
        body: JSON.stringify({ spec }),
      }),
    );

  const dispatchDraft = (id: string, draftSpec: MissionSpec) =>
    act("Dispatch", () =>
      fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
        body: JSON.stringify({ ...draftSpec, draft_id: id }),
      }),
    );

  const deleteDraft = (id: string, site: string) => {
    if (!window.confirm(`Delete the draft "${site}"? A Dispatched Spec from it stays in the store.`)) return;
    act("Delete", () =>
      fetch(`/api/drafts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-wayfinder-key": passphrase! },
      }),
    );
  };

  // Withdraw a spec from the queue (without deleting the immutable Spec). The API
  // accepts a key and returns the updated skipped.json; we refresh after action.
  const withdrawSpec = (id: string) => act("Withdraw", () =>
    fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
      body: JSON.stringify({ key: id }),
    }),
  );

  const unwithdrawSpec = (id: string) => act("Unwithdraw", () =>
    fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
      body: JSON.stringify({ key: id, undo: true }),
    }),
  );

  // Edit on a Spec row (#57): the full Spec body is served by /api/specs and
  // handed to the planner as a new draft. The immutable Spec is never edited.
  async function editSpec(key: string) {
    try {
      const res = await fetch(`/api/specs?key=${encodeURIComponent(key)}`);
      if (!res.ok) {
        setNotice(`Edit failed: ${res.status}`);
        return;
      }
      onLoadMission((await res.json()) as MissionSpec);
    } catch (err) {
      setNotice(`Edit failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Before the client-only read lands there is nothing to show yet; an empty
  // passphrase afterwards means the operator never typed one.
  if (passphrase === null) {
    return <p className={styles.empty}>Loading status…</p>;
  }
  if (passphrase === "") {
    return <p className={styles.empty}>Type the dispatch passphrase below the map to see mission status.</p>;
  }
  if (status.kind === "loading") return <p className={styles.empty}>Loading status…</p>;
  if (status.kind === "error") {
    return (
      <div>
        <p className={styles.error}>{status.message}</p>
        <button onClick={() => passphrase && load(passphrase)}>Retry</button>
      </div>
    );
  }

  const specsByKey = new Map(status.rows.filter((r) => r.kind === "spec").map((r) => [r.id, r]));
  return (
    <div>
      <div className={styles.entryActions}>
        {allowSave && (
          <button onClick={saveDraft} disabled={busy !== null}>
            {busy === "Save draft" ? "Saving…" : "Save current as draft"}
          </button>
        )}
      </div>
      {notice && <p className={styles.notice}>{notice}</p>}
      {status.kind === "ok" && status.notice && (
        <p className={styles.error}>
          The host refused a Load ({status.notice.at}): {status.notice.parts_needed} parts waiting,{" "}
          {status.notice.cards_have} cards. Nothing was written. {status.notice.action}
        </p>
      )}
      {!status.hostReported && (
        <p className={styles.empty}>The host has not reported yet — states stop at Dispatched.</p>
      )}
      {status.rows.length === 0 && <p className={styles.empty}>No drafts, no Dispatched missions yet.</p>}
      {status.rows.map((row) => {
        const live = row.kind === "draft" && row.dispatched_key ? specsByKey.get(row.dispatched_key) : null;
        const state = live?.state ?? row.state;
        return (
          <div key={`${row.kind}:${row.id}`} className={styles.entry}>
            <div className={styles.entryHead}>
              <strong>{row.site || "Untitled"}</strong>
              <span className={`mono ${styles[state]}`}>{stateLabel(row, state)}</span>
            </div>
            <div className={styles.savedAt}>
              {row.kind === "draft" ? "Draft" : "Spec"} · {row.date} · updated {age(row.updated)}
              {row.queue ? ` · #${row.queue} in line` : ""}
            </div>
            { /* Metrics line: show per-row metrics if available */ }
            {(() => {
              // draft metrics (recomputed inline)
              if (row.kind === "draft") {
                const dp = preview(draftSpec(row));
                if (dp?.photo_count != null && dp?.path_length_m != null) {
                  const dist = dp.path_length_m;
                  const s = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(2)} km`;
                  return (
                    <div className={styles.meta}>
                      {dp.photo_count} points · {s}
                    </div>
                  );
                }
              }
              // spec metrics (host-provided)
              if (row.metrics) {
                const { photo_count, path_length_m } = row.metrics;
                const dist = path_length_m;
                const s = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(2)} km`;
                return (
                  <div className={styles.meta}>
                    {photo_count} points · {s}
                  </div>
                );
              }
              return null;
            })()}
            {(row.state === "dispatched" || row.state === "queued") && waitingLong(row.updated) && (
              <div className={styles.meta}>
                Waiting {age(row.updated)} — plug in the Controller or check the host.
              </div>
            )}
            {row.cards.length > 0 && (
              <div className={styles.meta}>
                {row.cards.map((c) => `${c.card}: ${c.name}${c.waypoints == null ? "" : ` (${c.waypoints})`}`).join(" · ")}
              </div>
            )}
            {state === "superseded" && (
              <details className={styles.meta}>
                <summary>Superseded — show details</summary>
                <div className={`${styles.meta} mono`}>{row.id}</div>
                <div className={styles.meta}>Dispatched {age(row.updated)}; a newer Spec for this Site/date is the one that loads.</div>
              </details>
            )}
            {row.dispatched_key && row.kind === "draft" && (
              <div className={`${styles.meta} mono`}>{shortKey(row.dispatched_key)}</div>
            )}
            {row.kind === "draft" && (
              <div className={styles.entryActions}>
                {!row.dispatched_key && (
                <button onClick={() => dispatchDraft(row.id, draftSpec(row))} disabled={busy !== null}>
                    {busy === "Dispatch" ? "Dispatching…" : "Dispatch"}
                  </button>
                )}
                <button onClick={() => onLoadMission(draftSpec(row))}>Edit</button>
                <button
                  onClick={() => deleteDraft(row.id, row.site)}
                  disabled={busy !== null || !isDraftDeletable(row)}
                  title={
                    isDraftDeletable(row)
                      ? "Delete this draft"
                      : "Dispatched Specs are immutable — they can only be superseded by a newer Dispatch"
                  }
                >
                  Delete
                </button>
              </div>
            )}
            {row.kind === "spec" && (
              <div className={styles.entryActions}>
                {isWithdrawn(row) ? (
                  <button onClick={() => unwithdrawSpec(row.id)} disabled={busy !== null}>
                    Unwithdraw
                  </button>
                ) : isSpecWithdrawable(row) ? (
                  <button onClick={() => withdrawSpec(row.id)} disabled={busy !== null}>
                    Withdraw
                  </button>
                ) : null}
                <button onClick={() => editSpec(row.id)} disabled={busy !== null}>
                  Edit as new draft
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function stateLabel(row: StatusRow, state: StatusRow["state"]): string {
  if (row.kind === "draft" && !row.dispatched_key) return "draft";
  return state;
}

function shortKey(key: string): string {
  const parts = key.split("/");
  return parts.length >= 4 ? `${parts[1]}/${parts[2]}/${parts[3]}` : key;
}

// A waiting mission the host has not picked up in 15 minutes is worth a nudge:
// cron runs every minute, so anything older means the Controller is unplugged
// or the host is quiet — both are the operator's call, hence a hint, not an alarm.
const WAITING_WARN_MS = 15 * 60 * 1000;

function age(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function waitingLong(iso: string): boolean {
  const ms = Date.now() - Date.parse(iso);
  return Number.isFinite(ms) && ms > WAITING_WARN_MS;
}

/** A draft may predate fields the live editor requires; fill from defaults. */
function draftSpec(row: StatusRow): MissionSpec {
  const full = (row.spec ?? { site: row.site, date: row.date }) as MissionSpec;
  return {
    ...DEFAULT_SPEC,
    ...full,
    flight: { ...DEFAULT_SPEC.flight, ...(full.flight ?? {}) },
    orbit: { ...DEFAULT_SPEC.orbit, ...(full.orbit ?? {}) },
    camera: { ...DEFAULT_SPEC.camera, ...(full.camera ?? {}) },
  };
}
