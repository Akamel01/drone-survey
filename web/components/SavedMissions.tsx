"use client";

import type { MissionSpec } from "@/lib/spec";
import { downloadMission, toMissionSpec, savedMissionState, type SavedMission } from "@/lib/savedMissions";
import type { StatusRow } from "@/lib/missions";
import { noteMissionsChanged } from "@/lib/actions";
import React, { useState } from "react";
import styles from "./SavedMissions.module.css";

interface SavedMissionsProps {
  missions: SavedMission[];
  /** Stored entries the store could not read. Shown, never swallowed. */
  skipped: number;
  /** Mission status as last read, or null when it could not be read at all.
   *  Null is not "nothing is Dispatched" and is never treated as such. */
  rows: StatusRow[] | null;
  /** Why the status rows are missing, when they are. */
  rowsProblem: string | null;
  /** The saved entry the editor is currently editing, if any. */
  editing: string | null;
  onLoad: (spec: MissionSpec, saved_at: string) => void;
  onDelete: (saved_at: string) => void;
  /** Records that this Mission reached Mission status, and the draft id it
   *  became there — the only link back to what it is later Dispatched as. */
  onSent: (saved_at: string, draft_id?: string) => void;
}

const coord = (p: [number, number] | null) => (p ? `${p[0].toFixed(5)}, ${p[1].toFixed(5)}` : null);

const STATE_LABEL: Record<string, string> = {
  draft: "Not sent",
  sent: "Draft in Mission status",
  dispatched: "Dispatched",
  loaded: "Loaded onto the Controller",
  unknown: "State not known",
};

export default function SavedMissions({
  missions,
  skipped,
  rows,
  rowsProblem,
  editing,
  onLoad,
  onDelete,
  onSent,
}: SavedMissionsProps) {
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [sending, setSending] = useState<string | null>(null);

  const say = (saved_at: string, note: string) => {
    setErrors((e) => {
      const next = { ...e };
      delete next[saved_at];
      return next;
    });
    setNotes((n) => ({ ...n, [saved_at]: note }));
  };
  const fail = (saved_at: string, err: string) => {
    setNotes((n) => {
      const next = { ...n };
      delete next[saved_at];
      return next;
    });
    setErrors((e) => ({ ...e, [saved_at]: err }));
  };

  // Loading a Mission only ever writes the editor. It reads the saved list and
  // changes nothing in it — confirmed by hand for grid, orbit, circle-shaped
  // and pre-#39 entries (issue #125). The note exists because a Load whose
  // result already matches the editor is otherwise indistinguishable from a
  // Load that did nothing.
  const handleLoad = (m: SavedMission) => {
    onLoad(toMissionSpec(m), m.saved_at);
    say(m.saved_at, `Loaded “${m.site || "Untitled"}” into the editor. It is still saved here.`);
  };

  // Send to Mission status: POST the Spec to the drafts store, then mark the
  // local copy as sent. The local copy is kept on purpose — a 200 is the
  // writer's own word that the draft landed, which ADR 0018 says is not
  // evidence, and the operator's own copy is the fallback if it did not.
  const handleSend = async function (m: SavedMission) {
    const name = m.site || "Untitled";
    const agreed = window.confirm(
      `Send “${name}” to Mission status?\n\n` +
        "It is uploaded to the shared drafts store, where it appears as a draft.\n" +
        "Your saved copy stays in this list, marked as sent.",
    );
    if (!agreed) return;

    say(m.saved_at, `Sending “${name}” to Mission status…`);
    setSending(m.saved_at);
    try {
      const resp = await fetch("/api/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pass through Wayfinder key for authentication/routing
          "x-wayfinder-key": localStorage.getItem("drone-planner.wayfinder-key") ?? "",
        },
        body: JSON.stringify({ spec: toMissionSpec(m) }),
      });
      if (resp.ok) {
        // A Mission status view open in another window must show this draft
        // now, not at its next five-minute poll (issue #126).
        noteMissionsChanged();
        // The id the store minted is kept on the saved entry. It is the only
        // thing that will later tie this copy to the Spec it is Dispatched
        // as; nothing reconstructs it from the Site name and date (#127).
        let draftId: string | undefined;
        try {
          const body = await resp.json();
          if (typeof body?.draft?.id === "string") draftId = body.draft.id;
        } catch {
          // No id back: the entry records the send without the link, and
          // reads as "state not known" rather than as a free draft.
        }
        onSent(m.saved_at, draftId);
        say(m.saved_at, `“${name}” is now a draft under Mission status. Your saved copy is kept.`);
      } else {
        // The drafts route refuses a Spec it cannot file — an unnamed Site is
        // the common one. Say so and keep the local copy, which is the whole
        // point: this is the case the old code deleted on.
        let err = `Mission status refused it (HTTP ${resp.status})`;
        try {
          const data = await resp.json();
          if (data?.error) err = data.error;
        } catch {
          // No JSON body; the status line above is what we have.
        }
        fail(m.saved_at, `Not sent: ${err}. Your saved copy is untouched.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(m.saved_at, `Not sent: ${message}. Your saved copy is untouched.`);
    } finally {
      setSending(null);
    }
  };

  const handleDelete = (m: SavedMission) => {
    const name = m.site || "Untitled";
    const sent = m.sent_at ? "" : "\n\nIt has not been sent to Mission status, so this is the only copy.";
    if (window.confirm(`Delete “${name}” from this list? This cannot be undone.${sent}`)) {
      onDelete(m.saved_at);
    }
  };

  return (
    // A standing list, not a drawer. It was a <details> and closed itself on
    // every re-render, so the list the operator works from kept vanishing
    // (issue #127).
    <section className={styles.list}>
      {missions.length > 0 && (
        <p className={styles.heading}>
          {missions.length} saved {missions.length === 1 ? "mission" : "missions"}
        </p>
      )}
      {rowsProblem && <p className={styles.skipped}>{rowsProblem}</p>}
      {skipped > 0 && (
        <p className={styles.skipped}>
          {skipped} stored {skipped === 1 ? "entry" : "entries"} could not be read and{" "}
          {skipped === 1 ? "is" : "are"} not listed. Every readable Mission is shown, and nothing was
          overwritten.
          {missions.length === 0 && (
            <>
              {" "}
              The stored data is kept as it was, under{" "}
              <span className="mono">drone-planner.saved-missions.unreadable</span>.
            </>
          )}
        </p>
      )}
      {missions.length === 0 ? (
        <p className={styles.empty}>No saved missions yet.</p>
      ) : (
        missions.map((m) => {
          const home = coord(m.home);
          const isOrbit = m.mission_type === "orbit";
          const status = savedMissionState(m, rows);
          return (
            <div
              key={m.saved_at}
              className={`${styles.entry} ${editing === m.saved_at ? styles.editing : ""}`}
            >
              <div className={styles.entryHead}>
                <strong>{m.site || "Untitled"}</strong>
                <span className="mono">{m.date}</span>
              </div>
              <div className={styles.savedAt}>
                {isOrbit ? "Orbit" : "Grid"} · saved {new Date(m.saved_at).toLocaleString()}
                {editing === m.saved_at ? " · open in the editor" : ""}
              </div>
              {/* Whether this Mission has left the planner decides whether the
                  editor may save over it, so it is stated on the entry itself
                  rather than only in the Save control (issue #127). */}
              {status.state !== "draft" && (
                <div className={status.can_overwrite ? styles.sent : styles.locked}>
                  {STATE_LABEL[status.state]}
                  {status.why_not ? `. ${status.why_not}` : ""}{" "}
                  <a href="/plan/mission_status">open Mission status</a>
                </div>
              )}
              {m.sent_at && (
                <div className={styles.sent}>
                  Sent to Mission status {new Date(m.sent_at).toLocaleString()}
                </div>
              )}
              <div className={styles.meta}>
                {isOrbit ? (
                  <>
                    Subject {coord(m.orbit.center) ?? "not set"}, {m.orbit.target_height_m} m tall
                    <br />
                    Radius {m.orbit.radius_m} m · {m.orbit.altitudes_m.length} ring
                    {m.orbit.altitudes_m.length === 1 ? "" : "s"} at {m.orbit.altitudes_m.join(", ")} m ·{" "}
                    {m.orbit.photos_per_ring}/ring · {m.orbit.clockwise ? "clockwise" : "anticlockwise"}
                  </>
                ) : (
                  <>
                    Altitude {m.flight.altitude_m} m · Overlap {m.flight.forward_overlap_pct}%/
                    {m.flight.side_overlap_pct}%
                    <br />
                    Gimbal {m.flight.gimbal_pitch_deg} deg · {m.aoi.length} corners
                  </>
                )}
                <br />
                Speed {m.flight.speed_ms} m/s ·{" "}
                {m.flight.turn === "through" ? "Fly through" : "Stop at point"}
                <br />
                {m.camera.shutter}, ISO {m.camera.iso}, {m.camera.white_balance}
                {m.camera.white_balance_k ? ` (${m.camera.white_balance_k}K)` : ""}, {m.camera.format},{" "}
                {m.camera.exposure_lock ? "AE lock" : "AE unlocked"}, interval {m.camera.interval_s}s
              </div>
              {/* The take-off point decides whether DJI Fly will refuse the flight,
                  so it is worth seeing before loading the mission rather than after. */}
              <div className={home ? styles.home : styles.homeMissing}>
                {home ? `Home ${home}` : "No home point set"}
              </div>
              <div className={styles.entryActions}>
                <button onClick={() => handleLoad(m)}>Load</button>
                <button onClick={() => downloadMission(toMissionSpec(m))}>Download</button>
                <button onClick={() => handleDelete(m)}>Delete</button>
                <button onClick={() => handleSend(m)} disabled={sending === m.saved_at}>
                  {sending === m.saved_at ? "Sending…" : "Send to Mission status"}
                </button>
              </div>
              {notes[m.saved_at] && <div className={styles.note}>{notes[m.saved_at]}</div>}
              {errors[m.saved_at] && <div className={styles.error}>{errors[m.saved_at]}</div>}
            </div>
          );
        })
      )}
    </section>
  );
}
