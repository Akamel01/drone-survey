"use client";

import type { MissionSpec } from "@/lib/spec";
import { downloadMission, toMissionSpec, type SavedMission } from "@/lib/savedMissions";
import React, { useState } from "react";
import styles from "./SavedMissions.module.css";

interface SavedMissionsProps {
  missions: SavedMission[];
  /** Stored entries the store could not read. Shown, never swallowed. */
  skipped: number;
  onLoad: (spec: MissionSpec) => void;
  onDelete: (saved_at: string) => void;
}

const coord = (p: [number, number] | null) => (p ? `${p[0].toFixed(5)}, ${p[1].toFixed(5)}` : null);

export default function SavedMissions({ missions, skipped, onLoad, onDelete }: SavedMissionsProps) {
  const [importErrors, setImportErrors] = useState<{ [key: string]: string }>({});
  const [importing, setImporting] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});

  // Loading a Mission only ever writes the editor: it reads the saved list and
  // changes nothing in it. The note exists because a Load whose result already
  // matches the editor is otherwise indistinguishable from a Load that did
  // nothing, which is how a Mission looked lost (issue #125).
  const handleLoad = (m: SavedMission) => {
    onLoad(toMissionSpec(m));
    setNotes((n) => ({
      ...n,
      [m.saved_at]: `Loaded “${m.site || "Untitled"}” into the editor. It is still saved here.`,
    }));
  };

  // Import handler
  const handleImport = async function (m: SavedMission) {
    // Clear previous error for this item when attempting import
    if (m?.saved_at) {
      setImportErrors((e) => {
        const next = { ...e };
        delete next[m.saved_at!];
        return next;
      });
      setImporting(m.saved_at);
    }
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
        onDelete(m.saved_at);
        // remove any error entry if present
        if (m.saved_at) {
          setImportErrors((e) => {
            const next = { ...e };
            delete next[m.saved_at!];
            return next;
          });
        }
      } else {
        let err = "Import failed";
        try {
          const data = await resp.json();
          err = data?.error ?? err;
        } catch {
          // ignore
        }
        if (m.saved_at) {
          setImportErrors((e) => ({ ...e, [m.saved_at]: err }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (m.saved_at) {
        setImportErrors((e) => ({ ...e, [m.saved_at]: `Import error: ${message}` }));
      }
    } finally {
      setImporting(null);
    }
  };

  return (
    <details className={styles.details}>
      <summary>Saved missions ({missions.length})</summary>
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
          return (
            <div key={m.saved_at} className={styles.entry}>
              <div className={styles.entryHead}>
                <strong>{m.site || "Untitled"}</strong>
                <span className="mono">{m.date}</span>
              </div>
              <div className={styles.savedAt}>
                {isOrbit ? "Orbit" : "Grid"} · saved {new Date(m.saved_at).toLocaleString()}
              </div>
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
                <button onClick={() => onDelete(m.saved_at)}>Delete</button>
                <button onClick={() => handleImport(m)} disabled={importing === m.saved_at}>Import</button>
              </div>
              {notes[m.saved_at] && <div className={styles.note}>{notes[m.saved_at]}</div>}
              {importErrors[m.saved_at] && (
                <div style={{ color: 'red', fontSize: 12, marginTop: 6 }}>{importErrors[m.saved_at]}</div>
              )}
            </div>
          );
        })
      )}
    </details>
  );
}
