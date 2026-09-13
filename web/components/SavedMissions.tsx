"use client";

import type { MissionSpec } from "@/lib/spec";
import { downloadMission, toMissionSpec, type SavedMission } from "@/lib/savedMissions";
import styles from "./SavedMissions.module.css";

interface SavedMissionsProps {
  missions: SavedMission[];
  onLoad: (spec: MissionSpec) => void;
  onDelete: (saved_at: string) => void;
}

export default function SavedMissions({ missions, onLoad, onDelete }: SavedMissionsProps) {
  return (
    <details className={styles.details}>
      <summary>Saved missions ({missions.length})</summary>
      {missions.length === 0 ? (
        <p className={styles.empty}>No saved missions yet.</p>
      ) : (
        missions.map((m) => (
          <div key={m.saved_at} className={styles.entry}>
            <div className={styles.entryHead}>
              <strong>{m.site || "Untitled"}</strong>
              <span className="mono">{m.date}</span>
            </div>
            <div className={styles.savedAt}>saved {new Date(m.saved_at).toLocaleString()}</div>
            <div className={styles.meta}>
              Altitude {m.flight.altitude_m} m · Overlap {m.flight.forward_overlap_pct}%/{m.flight.side_overlap_pct}%
              <br />
              Gimbal {m.flight.gimbal_pitch_deg} deg · Speed {m.flight.speed_ms} m/s ·{" "}
              {m.flight.turn === "through" ? "Fly through" : "Stop at point"}
              <br />
              {m.camera.shutter}, ISO {m.camera.iso}, {m.camera.white_balance}
              {m.camera.white_balance_k ? ` (${m.camera.white_balance_k}K)` : ""}, {m.camera.format},{" "}
              {m.camera.exposure_lock ? "AE lock" : "AE unlocked"}, interval {m.camera.interval_s}s
            </div>
            <div className={styles.entryActions}>
              <button onClick={() => onLoad(toMissionSpec(m))}>Load</button>
              <button onClick={() => downloadMission(toMissionSpec(m))}>Download</button>
              <button onClick={() => onDelete(m.saved_at)}>Delete</button>
            </div>
          </div>
        ))
      )}
    </details>
  );
}
