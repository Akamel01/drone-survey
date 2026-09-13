"use client";

import { useState } from "react";
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import { downloadMission } from "@/lib/savedMissions";
import styles from "./SummaryBar.module.css";

interface SummaryBarProps {
  spec: MissionSpec;
  preview: Preview;
  onSaveMission: () => void;
}

export default function SummaryBar({ spec, preview, onSaveMission }: SummaryBarProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasProblems = preview.problems.length > 0;

  function save() {
    onSaveMission();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function copy() {
    await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Stat label="GSD" value={preview.gsd_cm.toFixed(2)} unit="cm/px" />
        <Stat label="Photos" value={String(preview.photo_count)} />
        <Stat label="Lines" value={String(preview.line_count)} />
        <Stat label="Fwd spacing" value={preview.fwd_spacing_m.toFixed(1)} unit="m" />
        <Stat label="Side spacing" value={preview.side_spacing_m.toFixed(1)} unit="m" />
        <Stat
          label="Effective speed"
          value={preview.capped_speed_ms.toFixed(1)}
          unit="m/s"
          warn={preview.capped_speed_ms < spec.flight.speed_ms}
        />
        <Stat label="Flight time" value={preview.flight_time_min.toFixed(1)} unit="min" />
        <Stat label="Parts" value={String(preview.parts)} warn={preview.parts > 1} />
        <div className={styles.actions}>
          <button onClick={copy}>{copied ? "Copied" : "Copy spec"}</button>
          <button onClick={save}>{saved ? "Saved" : "Save mission"}</button>
          <button className="primary" onClick={() => downloadMission(spec)}>
            Download Mission Spec
          </button>
        </div>
      </div>
      {hasProblems && (
        <ul className={styles.problems}>
          {preview.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <span className={`mono ${styles.statValue} ${warn ? styles.warn : ""}`}>
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
