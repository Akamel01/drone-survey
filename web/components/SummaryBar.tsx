"use client";

import { useState } from "react";
import type { MissionSpec } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import styles from "./SummaryBar.module.css";

interface SummaryBarProps {
  spec: MissionSpec;
  preview: Preview;
}

function slug(s: string) {
  return (s || "site").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function download(spec: MissionSpec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(spec.site)}-${spec.date}.mission.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SummaryBar({ spec, preview }: SummaryBarProps) {
  const [copied, setCopied] = useState(false);
  const hasProblems = preview.problems.length > 0;

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
          <button className="primary" onClick={() => download(spec)}>
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
