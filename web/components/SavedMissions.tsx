"use client";

import type { MissionSpec } from "@/lib/spec";
import { downloadMission, toMissionSpec, type SavedMission } from "@/lib/savedMissions";
import styles from "./SavedMissions.module.css";

interface SavedMissionsProps {
  missions: SavedMission[];
  onLoad: (spec: MissionSpec) => void;
  onDelete: (saved_at: string) => void;
}

const coord = (p: [number, number] | null) => (p ? `${p[0].toFixed(5)}, ${p[1].toFixed(5)}` : null);

export default function SavedMissions({ missions, onLoad, onDelete }: SavedMissionsProps) {
  return (
    <details className={styles.details}>
      <summary>Saved missions ({missions.length})</summary>
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
                <button onClick={() => onLoad(toMissionSpec(m))}>Load</button>
                <button onClick={() => downloadMission(toMissionSpec(m))}>Download</button>
                <button onClick={() => onDelete(m.saved_at)}>Delete</button>
              </div>
            </div>
          );
        })
      )}
    </details>
  );
}
