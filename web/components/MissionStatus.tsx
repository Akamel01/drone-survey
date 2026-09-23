"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import { stampToIso } from "@/lib/keys";
import type { MissionState, StatusRow } from "@/lib/missions";
import { isSpecWithdrawable, isWithdrawn, isDraftDeletable } from "@/lib/missions";
import {
  IDLE,
  MISSIONS_CHANGED_KEY,
  beginAction,
  endAction,
  isRunning,
  noteMissionsChanged,
  type ActionResult,
  type ActionState,
} from "@/lib/actions";
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
  | { kind: "ok"; rows: StatusRow[]; hostReported: boolean; notice: HostNotice | null; now: number }
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
  // One action at a time, reported where the operator pressed it.
  const [action, setAction] = useState<ActionState>(IDLE);
  const inFlight = useRef(false);
  // While one write is in flight no control takes a second one.
  const busy = action.running !== null;
  // Console controls (ticket #60): all client-side over the joined rows.
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "site">("newest");

  const load = useCallback(async (key: string) => {
    try {
      const res = await fetch("/api/status", { headers: { "x-wayfinder-key": key } });
      const body = await res.json();
      if (res.ok && Array.isArray(body.rows)) {
        setStatus({
          kind: "ok",
          rows: body.rows,
          hostReported: body.host_reported === true,
          notice: body.notice ?? null,
          // Fallback only for a response from before the server sent its clock.
          now: Number.isFinite(body.now) ? body.now : Date.now(),
        });
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
    // Every poll costs a Class C transaction on the storage account, and this
    // page is left open for hours. Five minutes is fresh enough for a pipeline
    // whose steps are minutes apart, and a hidden tab costs nothing at all.
    const refresh = () => {
      if (!document.hidden) load(key);
    };
    document.addEventListener("visibilitychange", refresh);
    // A write from another window of this planner (an Import from the map tab,
    // a second browser): react to the write instead of waiting out the
    // interval. `storage` fires only in the *other* windows, so this costs a
    // transaction only when something actually changed.
    const onWrite = (e: StorageEvent) => {
      if (e.key === MISSIONS_CHANGED_KEY) load(key);
    };
    window.addEventListener("storage", onWrite);
    const t = setInterval(refresh, 300000);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onWrite);
    };
  }, [load]);

  // The five-minute poll is far too slow to be an action's feedback, so every
  // action reports its own outcome on the row it was pressed on and refreshes
  // the view from the store the moment it finishes.
  async function act(label: string, on: string, fn: () => Promise<Response>) {
    if (!passphrase || inFlight.current) return;
    inFlight.current = true;
    setAction((s) => beginAction(s, label, on));
    let result: ActionResult;
    try {
      const res = await fn();
      const body = await res.json().catch(() => ({}));
      result = res.ok ? { ok: true, body } : { ok: false, status: res.status, body };
      if (res.ok) noteMissionsChanged();
    } catch (err) {
      result = { ok: false, threw: err instanceof Error ? err.message : "unknown" };
    }
    inFlight.current = false;
    setAction((s) => endAction(s, label, on, result));
    await load(passphrase);
  }

  const saveDraft = () =>
    act("Save draft", "", () =>
      fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
        body: JSON.stringify({ spec }),
      }),
    );

  const dispatchDraft = (id: string, draftSpec: MissionSpec) =>
    act("Dispatch", id, () =>
      fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
        body: JSON.stringify({ ...draftSpec, draft_id: id }),
      }),
    );

  const deleteDraft = (id: string, site: string) => {
    if (!window.confirm(`Delete the draft "${site}"? A Dispatched Spec from it stays in the store.`)) return;
    act("Delete", id, () =>
      fetch(`/api/drafts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-wayfinder-key": passphrase! },
      }),
    );
  };

  // Withdraw a spec from the queue (without deleting the immutable Spec). The API
  // accepts a key and returns the updated skipped.json; we refresh after action.
  const withdrawSpec = (id: string) => act("Withdraw", id, () =>
    fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wayfinder-key": passphrase! },
      body: JSON.stringify({ key: id }),
    }),
  );

  const unwithdrawSpec = (id: string) => act("Unwithdraw", id, () =>
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
        setAction((s) => endAction(s, "Edit", key, { ok: false, status: res.status, body: {} }));
        return;
      }
      onLoadMission((await res.json()) as MissionSpec);
    } catch (err) {
      const threw = err instanceof Error ? err.message : "unknown";
      setAction((s) => endAction(s, "Edit", key, { ok: false, threw }));
    }
  }

  // The message belongs next to the control that produced it: this view is
  // taller than a screen, and a message at the top of the list is a message
  // nobody reading a row halfway down will ever see (issue #126).
  const renderNotice = () =>
    action.notice && (
      <p className={action.notice.failed ? styles.error : styles.notice} role="status" aria-live="polite">
        {action.notice.text}
      </p>
    );

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
        {/* The rows are gone, but the operator still needs to hear what their
            last action did — losing it here is how a failure became silence. */}
        {renderNotice()}
        <p className={styles.error}>{status.message}</p>
        <button onClick={() => passphrase && load(passphrase)}>Retry</button>
      </div>
    );
  }

  const specsByKey = new Map(status.rows.filter((r) => r.kind === "spec").map((r) => [r.id, r]));
  // Effective state per row: a draft that was dispatched follows its live Spec.
  const decorated = status.rows.map((row) => {
    const live = row.kind === "draft" && row.dispatched_key ? specsByKey.get(row.dispatched_key) : null;
    return { row, state: live?.state ?? row.state };
  });
  const statesPresent = Array.from(new Set(decorated.map((d) => d.state))).sort();
  const needle = query.trim().toLowerCase();
  const filtering = needle !== "" || stateFilter !== "all";
  const visible = decorated
    .filter(({ row, state }) => {
      if (stateFilter !== "all" && state !== stateFilter) return false;
      if (!needle) return true;
      return (
        row.site.toLowerCase().includes(needle) ||
        row.date.toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      if (sortBy === "site") {
        const bySite = a.row.site.localeCompare(b.row.site);
        if (bySite !== 0) return bySite;
      }
      // Equal stamps must compare 0: dispatch stamps are second-precision, so a
      // non-zero tie-break would reorder equal rows away from joinStatus's order.
      if (a.row.stamp === b.row.stamp) return 0;
      if (sortBy === "oldest") return a.row.stamp < b.row.stamp ? -1 : 1;
      return a.row.stamp < b.row.stamp ? 1 : -1;
    });
  return (
    <div>
      <div className={styles.entryActions}>
        {allowSave && (
          <button onClick={saveDraft} disabled={busy}>
            {isRunning(action, "Save draft", "") ? "Saving…" : "Save current as draft"}
          </button>
        )}
      </div>
      {/* A message whose row is gone (a Delete) or filtered out still has to
          land somewhere the operator can see it. */}
      {action.notice && !visible.some((v) => v.row.id === action.notice!.on) && renderNotice()}
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
      {status.rows.length > 0 && (
        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search site, date or key"
            aria-label="Search missions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className={styles.control}>
            <span>State</span>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="all">All states</option>
              {statesPresent.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.control}>
            <span>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="site">Site A–Z</option>
            </select>
          </label>
          {filtering && (
            <span className={styles.count}>
              {visible.length} of {decorated.length} missions
            </span>
          )}
        </div>
      )}
      {filtering && visible.length === 0 && <p className={styles.empty}>Nothing matches that filter.</p>}
      {visible.map(({ row, state }) => {
        return (
          <div key={`${row.kind}:${row.id}`} className={styles.entry}>
            <div className={styles.entryHead}>
              <strong>{row.site || "Untitled"}</strong>
              <span className={`mono ${styles[state]}`}>{stateLabel(row, state)}</span>
            </div>
            <div className={styles.savedAt}>
              {row.kind === "draft" ? "Draft" : "Spec"} · {row.date} · updated {row.age ?? age(row.updated, status.now)}
              {row.queue ? ` · #${row.queue} in line` : ""}
            </div>
            { /* Metrics are the producer's, stored once at Dispatch: the browser
                 *  does not re-derive geometry on every render. */ }
            {(() => {
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
            {(row.state === "dispatched" || row.state === "queued") && row.stale && (
              <div className={styles.meta}>
                Waiting {row.age ?? age(row.updated, status.now)} — plug in the Controller or check the host.
              </div>
            )}
            {row.cards.length > 0 && (
              <div className={styles.meta}>
                {row.cards.map((c) => `${c.card}: ${c.name}${c.waypoints == null ? "" : ` (${c.waypoints})`}`).join(" · ")}
              </div>
            )}
            <details className={styles.detail}>
              <summary>Details</summary>
              <div className={`${styles.meta} mono`}>{row.id}</div>
              {row.kind === "draft" && row.dispatched_key && (
                <div className={`${styles.meta} mono`}>{shortKey(row.dispatched_key)}</div>
              )}
              <Timeline row={row} state={state} clock={status.now} />
              {row.queue ? <div className={styles.meta}>Queue position #{row.queue}</div> : null}
              {state === "superseded" && (
                <div className={styles.meta}>
                  A newer Spec for this Site/date is the one that loads; this row is kept as history.
                </div>
              )}
            </details>
            {row.dispatched_key && row.kind === "draft" && (
              <div className={`${styles.meta} mono`}>{shortKey(row.dispatched_key)}</div>
            )}
            {row.kind === "draft" && (
              <div className={styles.entryActions}>
                {!row.dispatched_key && (
                  <button onClick={() => dispatchDraft(row.id, draftSpec(row))} disabled={busy}>
                    {isRunning(action, "Dispatch", row.id) ? "Dispatching…" : "Dispatch"}
                  </button>
                )}
                <button onClick={() => onLoadMission(draftSpec(row))}>Edit</button>
                <button
                  onClick={() => deleteDraft(row.id, row.site)}
                  disabled={busy || !isDraftDeletable(row)}
                  title={
                    isDraftDeletable(row)
                      ? "Delete this draft"
                      : "Dispatched Specs are immutable — they can only be superseded by a newer Dispatch"
                  }
                >
                  {isRunning(action, "Delete", row.id) ? "Deleting…" : "Delete"}
                </button>
              </div>
            )}
            {row.kind === "spec" && (
              <div className={styles.entryActions}>
                {isWithdrawn(row) ? (
                  <button onClick={() => unwithdrawSpec(row.id)} disabled={busy}>
                    {isRunning(action, "Unwithdraw", row.id) ? "Unwithdrawing…" : "Unwithdraw"}
                  </button>
                ) : isSpecWithdrawable(row) ? (
                  <button onClick={() => withdrawSpec(row.id)} disabled={busy}>
                    {isRunning(action, "Withdraw", row.id) ? "Withdrawing…" : "Withdraw"}
                  </button>
                ) : null}
                <button onClick={() => editSpec(row.id)} disabled={busy}>
                  Edit as new draft
                </button>
              </div>
            )}
            {action.notice?.on === row.id && renderNotice()}
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

/** Draft → Dispatched → Collected → Loaded, with the stamps the store knows. */
function Timeline({ row, state, clock }: { row: StatusRow; state: MissionState; clock: number }) {
  const dispatchedAt = row.kind === "spec" ? stampToIso(row.stamp) : null;
  const lines: { label: string; at: string | null; done: boolean }[] = [
    { label: "Draft", at: row.kind === "draft" ? row.updated : null, done: row.kind === "draft" },
    { label: "Dispatched", at: dispatchedAt, done: row.kind === "spec" || !!row.dispatched_key },
    { label: "Collected", at: row.collected_at, done: !!row.collected_at },
    { label: "Loaded", at: row.loaded_at, done: !!row.loaded_at },
  ];
  if (state === "withdrawn") lines.push({ label: "Withdrawn", at: null, done: true });
  return (
    <div className={styles.meta}>
      {lines.map((l) => (
        <div key={l.label}>
          {l.done ? "●" : "○"} {l.label}
          {l.at ? ` · ${age(l.at, clock)}` : l.done ? "" : " — not yet"}
        </div>
      ))}
    </div>
  );
}

function shortKey(key: string): string {
  const parts = key.split("/");
  return parts.length >= 4 ? `${parts[1]}/${parts[2]}/${parts[3]}` : key;
}

// Formatted against the clock the server judged the rows with, never a second
// clock of the browser's that could disagree with it.
function age(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
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
