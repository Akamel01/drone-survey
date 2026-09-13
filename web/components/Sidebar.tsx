"use client";

import type { ReactNode } from "react";
import type { MissionSpec, TurnMode } from "@/lib/spec";
import type { Preview } from "@/lib/mission";
import type { SavedMission } from "@/lib/savedMissions";
import type { DrawMode } from "./MapPane";
import SavedMissions from "./SavedMissions";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  spec: MissionSpec;
  setSpec: (updater: (s: MissionSpec) => MissionSpec) => void;
  mode: DrawMode;
  onModeChange: (m: DrawMode) => void;
  areaHa: number;
  preview: Preview;
  savedMissions: SavedMission[];
  onLoadMission: (spec: MissionSpec) => void;
  onDeleteMission: (saved_at: string) => void;
}

// Plain metric area: m² under 1,000,000, km² (3 decimals) above.
function formatArea(areaHa: number): string {
  const m2 = areaHa * 10000;
  if (m2 > 1_000_000) return `${(m2 / 1_000_000).toFixed(3)} km²`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  unit,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label>{label}</label>
        <span className={`mono ${styles.value}`}>
          {value}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function Sidebar({
  spec,
  setSpec,
  mode,
  onModeChange,
  areaHa,
  preview,
  savedMissions,
  onLoadMission,
  onDeleteMission,
}: SidebarProps) {
  const flight = spec.flight;
  const camera = spec.camera;

  const setFlight = <K extends keyof MissionSpec["flight"]>(key: K, value: MissionSpec["flight"][K]) =>
    setSpec((s) => ({ ...s, flight: { ...s.flight, [key]: value } }));

  const setCamera = <K extends keyof MissionSpec["camera"]>(key: K, value: MissionSpec["camera"][K]) =>
    setSpec((s) => ({ ...s, camera: { ...s.camera, [key]: value } }));

  // An empty preview caps nothing, so it must not read as a cap: before an area
  // is drawn the chosen speed stands, and claiming 0.0 m/s is overridden is a lie.
  const overridden = preview.photo_count > 0 && preview.capped_speed_ms < flight.speed_ms;

  return (
    <aside className={styles.sidebar}>
      <Section title="Area">
        <div className={styles.modeButtons}>
          <button className={mode === "draw-polygon" ? "active" : ""} onClick={() => onModeChange("draw-polygon")}>
            Polygon
          </button>
          <button className={mode === "draw-rectangle" ? "active" : ""} onClick={() => onModeChange("draw-rectangle")}>
            Rectangle
          </button>
          <button
            className={mode === "append-polygon" ? "active" : ""}
            disabled={spec.aoi.length < 3}
            onClick={() => onModeChange("append-polygon")}
          >
            Add points
          </button>
          <button onClick={() => setSpec((s) => ({ ...s, aoi: [] }))}>Clear area</button>
        </div>
        <div className={styles.readout}>
          <span>
            Area: <span className="mono">{formatArea(areaHa)}</span>
          </span>
          <span>
            Corners: <span className="mono">{spec.aoi.length}</span>
          </span>
        </div>
      </Section>

      <Section title="Flight">
        <Field label="Altitude" value={String(flight.altitude_m)} unit="m">
          <input
            type="range"
            min={20}
            max={120}
            step={1}
            value={flight.altitude_m}
            onChange={(e) => setFlight("altitude_m", Number(e.target.value))}
          />
        </Field>

        <Field label="Forward overlap" value={String(flight.forward_overlap_pct)} unit="%">
          <input
            type="range"
            min={60}
            max={92}
            step={1}
            value={flight.forward_overlap_pct}
            onChange={(e) => setFlight("forward_overlap_pct", Number(e.target.value))}
          />
        </Field>

        <Field label="Side overlap" value={String(flight.side_overlap_pct)} unit="%">
          <input
            type="range"
            min={50}
            max={88}
            step={1}
            value={flight.side_overlap_pct}
            onChange={(e) => setFlight("side_overlap_pct", Number(e.target.value))}
          />
        </Field>

        <Field label="Gimbal tilt" value={String(flight.gimbal_pitch_deg)} unit="deg">
          <input
            type="range"
            min={-90}
            max={55}
            step={1}
            value={flight.gimbal_pitch_deg}
            onChange={(e) => setFlight("gimbal_pitch_deg", Number(e.target.value))}
          />
          {flight.gimbal_pitch_deg >= -90 && flight.gimbal_pitch_deg <= -75 && (
            <div className={styles.hint}>Nadir</div>
          )}
        </Field>

        <Field
          label="Speed"
          value={overridden ? preview.capped_speed_ms.toFixed(1) : flight.speed_ms.toFixed(1)}
          unit="m/s"
        >
          <input
            type="range"
            min={0.1}
            max={15}
            step={0.1}
            value={flight.speed_ms}
            onChange={(e) => setFlight("speed_ms", Number(e.target.value))}
          />
          {overridden && (
            <div className={styles.warnHint}>
              Capped by shutter interval — chosen {flight.speed_ms.toFixed(1)} m/s overridden
            </div>
          )}
        </Field>

        <Field label="Movement through photo points" value={flight.turn === "through" ? "Fly through" : "Stop at point"}>
          <select value={flight.turn} onChange={(e) => setFlight("turn", e.target.value as TurnMode)}>
            <option value="through">Fly through</option>
            <option value="stop">Stop at point</option>
          </select>
        </Field>

        <Field label="Margin passes" value={String(flight.margin_passes)}>
          <input
            type="range"
            min={0}
            max={2}
            step={0.5}
            value={flight.margin_passes}
            onChange={(e) => setFlight("margin_passes", Number(e.target.value))}
          />
        </Field>
      </Section>

      <Section title="Camera">
        <Field label="Shutter interval" value={camera.interval_s.toFixed(1)} unit="s">
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={camera.interval_s}
            onChange={(e) => setCamera("interval_s", Number(e.target.value))}
          />
          <div className={styles.hint}>the slowest the camera can shoot</div>
        </Field>

        <Field label="Shutter speed" value={camera.shutter}>
          <select value={camera.shutter} onChange={(e) => setCamera("shutter", e.target.value)}>
            {["1/2000", "1/1600", "1/1250", "1/1000", "1/800", "1/640", "1/500"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ISO" value={camera.iso}>
          <select value={camera.iso} onChange={(e) => setCamera("iso", e.target.value)}>
            {["100", "200", "400", "800", "auto"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="White balance" value={camera.white_balance}>
          <select value={camera.white_balance} onChange={(e) => setCamera("white_balance", e.target.value)}>
            {["Sunny", "Cloudy", "Auto", "Manual"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Kelvin"
            disabled={camera.white_balance !== "Manual"}
            value={camera.white_balance_k ?? ""}
            onChange={(e) => setCamera("white_balance_k", e.target.value ? Number(e.target.value) : null)}
          />
        </Field>

        <Field label="Exposure lock" value={camera.exposure_lock ? "on" : "off"}>
          <input
            type="checkbox"
            checked={camera.exposure_lock}
            onChange={(e) => setCamera("exposure_lock", e.target.checked)}
          />
        </Field>

        <Field label="Format" value={camera.format}>
          <select value={camera.format} onChange={(e) => setCamera("format", e.target.value)}>
            <option value="JPEG">JPEG</option>
            <option value="JPEG+RAW">JPEG+RAW</option>
          </select>
        </Field>

        <p className={styles.note}>
          Camera settings are set by hand on the Controller before flight. They are recorded here so the flight is
          reproducible; they are not written into the mission file.
        </p>
      </Section>

      <Section title="Identification">
        <Field label="Site name" value={spec.site || "—"}>
          <input type="text" value={spec.site} onChange={(e) => setSpec((s) => ({ ...s, site: e.target.value }))} />
        </Field>
        <Field label="Date" value={spec.date}>
          <input type="date" value={spec.date} onChange={(e) => setSpec((s) => ({ ...s, date: e.target.value }))} />
        </Field>
        <div className={styles.readout}>
          <span>
            Start corner: <span className="mono">{preview.start_corner || "—"}</span>
          </span>
        </div>
      </Section>

      <section className={styles.section}>
        <SavedMissions missions={savedMissions} onLoad={onLoadMission} onDelete={onDeleteMission} />
      </section>
    </aside>
  );
}
