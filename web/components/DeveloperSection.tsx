"use client";

import { useEffect, useId, useState } from "react";
import { authClient } from "@/lib/authClient";
import { CATALOGUE, type CutRequest, type Region } from "@/lib/mapRegions";
import { formatBytes } from "@/lib/siteMap";
import { mapsClient } from "@/lib/mapsClient";
import styles from "./AccountsSection.module.css";

const cutOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const WAITING: Record<CutRequest["status"], string> = {
  queued: "Queued: the host cuts it the next time its map job runs.",
  cutting: "Cutting on the host now.",
  failed: "Failed",
};

/**
 * Developer (PWA-2, #315): the regions the offline street map can be kept
 * from, the cuts waiting on the host, and a catalogue to add from. Only the
 * admin sees it (and the API checks the role again on every call); with
 * accounts off there is no session, so nobody does.
 */
export default function DeveloperSection() {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string | null } | undefined)?.role === "admin";
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [requests, setRequests] = useState<CutRequest[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const headingId = useId();

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    void mapsClient.list().then((r) => {
      if (!live) return;
      if (r.ok) {
        setRegions(r.regions);
        setRequests(r.requests);
      } else setProblem(r.text);
    });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const run = async (action: "add" | "remove", id: string) => {
    setBusy(true);
    setProblem(null);
    const r = await mapsClient.run(action, id);
    setBusy(false);
    if (r.ok) {
      setRegions(r.regions);
      setRequests(r.requests);
      if (action === "add") setPick("");
    } else setProblem(r.text);
  };

  const taken = new Set([...(regions ?? []).map((r) => r.id), ...requests.map((r) => r.id)]);
  const groups = ["Canada", "Countries"] as const;

  return (
    <section className={`${styles.section} glass-smoke`} aria-labelledby={`${headingId}-title`}>
      <h2 id={`${headingId}-title`}>Developer</h2>
      <p className={styles.quiet}>Offline map regions: where Sites can keep a street map from.</p>
      {problem && <p className={styles.quiet} role="alert">{problem}</p>}
      {regions === null && !problem && <p className={styles.quiet}>Reading the regions…</p>}
      {regions !== null && regions.length === 0 && <p className={styles.quiet}>No region has been cut yet.</p>}
      {(regions?.length ?? 0) + requests.length > 0 && (
        <ul className={`${styles.list} ${styles.gap}`} aria-label="Map regions">
          {regions?.map((r) => (
            <li key={r.id} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>{r.name}</span>
                <span className={styles.meta}>
                  {formatBytes(r.bytes)} · cut {cutOn(r.cut_at)}
                </span>
              </div>
              <div className={styles.actions}>
                <button type="button" disabled={busy} aria-label={`Remove ${r.name}`} onClick={() => void run("remove", r.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
          {requests.map((r) => (
            <li key={`request-${r.id}`} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>{r.name}</span>
                <span className={styles.state}>{r.status === "failed" ? `Failed: ${r.message ?? "see the host log"}` : WAITING[r.status]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className={`${styles.actions} ${styles.gap}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (pick) void run("add", pick);
        }}
      >
        <select aria-label="Region to add" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a region…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {CATALOGUE.filter((c) => c.group === g && !taken.has(c.id)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="submit" className="primary" disabled={busy || !pick}>
          Add region
        </button>
      </form>
    </section>
  );
}
