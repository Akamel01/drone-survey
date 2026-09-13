"use client";

import type { ReactNode } from "react";
import type { MissionSpec, MissionType, TurnMode } from "@/lib/spec";
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

// Plain metric area: m² under a square kilometre, km² above.
function formatArea(areaHa: number): string {
  const m2 = areaHa * 10000;
  if (m2 > 1_000_000) return `${(m2 / 1_000_000).toFixed(3)} km²`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

const coord = (p: [number, number] | null) => (p ? `${p[0].toFixed(5)}, ${p[1].toFixed(5)}` : "—");

/**
 * Explanation on demand.
 *
 * These notes are worth reading once and then only when wondered about, so they
 * sit behind an icon rather than occupying the panel permanently. Hover or
 * keyboard focus reveals them, so the keyboard route works as well as the mouse.
 */
function Info({ children }: { children: ReactNode }) {
  return (
    <span className={styles.info} tabIndex={0} role="note">
      i<span className={styles.infoBubble}>{children}</span>
    </span>
  );
}

function Section({ title, info, children }: { title: string; info?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>
        {title}
        {info ? <Info>{info}</Info> : null}
      </h2>
      {children}
    </section>
  );
}

/** A mutually exclusive choice, which is what a segmented control means. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? styles.segmentOn : styles.segment}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  unit,
  info,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label>
          {label}
          {info ? <Info>{info}</Info> : null}
        </label>
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
  const orbit = spec.orbit;
  const isOrbit = spec.mission_type === "orbit";

  const setFlight = <K extends keyof MissionSpec["flight"]>(key: K, value: MissionSpec["flight"][K]) =>
    setSpec((s) => ({ ...s, flight: { ...s.flight, [key]: value } }));

  const setCamera = <K extends keyof MissionSpec["camera"]>(key: K, value: MissionSpec["camera"][K]) =>
    setSpec((s) => ({ ...s, camera: { ...s.camera, [key]: value } }));

  const setOrbit = <K extends keyof MissionSpec["orbit"]>(key: K, value: MissionSpec["orbit"][K]) =>
    setSpec((s) => ({ ...s, orbit: { ...s.orbit, [key]: value } }));

  // An empty preview caps nothing, so it must not read as a cap.
  const overridden = preview.photo_count > 0 && preview.capped_speed_ms < flight.speed_ms;

  const rings = orbit.altitudes_m;
  const setRing = (i: number, v: number) =>
    setOrbit("altitudes_m", rings.map((a, j) => (j === i ? v : a)));

  return (
    <aside className={styles.sidebar}>
      <Section title="Mission">
        <Segmented<MissionType>
          value={spec.mission_type}
          options={[
            { value: "grid", label: "Grid" },
            { value: "orbit", label: "Orbit" },
          ]}
          onChange={(v) => setSpec((s) => ({ ...s, mission_type: v }))}
        />
        <p className={styles.hint}>
          {isOrbit
            ? "Rings around a subject, the camera aimed at it."
            : "Parallel passes over an area, camera down."}
        </p>
      </Section>

      {isOrbit ? (
        <Section title="Subject">
          <div className={styles.group}>
            <button
              className={mode === "set-poi" ? "active" : ""}
              onClick={() => onModeChange(mode === "set-poi" ? "idle" : "set-poi")}
            >
              {mode === "set-poi" ? "Click the map…" : "Set point of interest"}
            </button>
            <button
              disabled={!orbit.center}
              onClick={() => setSpec((s) => ({ ...s, orbit: { ...s.orbit, center: null } }))}
            >
              Clear subject
            </button>
          </div>
          <div className={styles.readout}>
            <span>Subject</span>
            <span className="mono">{coord(orbit.center)}</span>
          </div>

          <Field label="Subject height" value={String(orbit.target_height_m)} unit="m">
            <input
              type="range"
              min={0}
              max={120}
              step={1}
              value={orbit.target_height_m}
              onChange={(e) => setOrbit("target_height_m", Number(e.target.value))}
            />
            <div className={styles.hint}>how tall it is, above where you take off</div>
          </Field>

          <Field
            label="Radius"
            value={String(orbit.radius_m)}
            unit="m"
            info="Drag the handle on the map to change this without leaving the map."
          >
            <input
              type="range"
              min={5}
              max={200}
              step={1}
              value={orbit.radius_m}
              onChange={(e) => setOrbit("radius_m", Number(e.target.value))}
            />
          </Field>

          <Field label="Photos per ring" value={String(orbit.photos_per_ring)}>
            <input
              type="range"
              min={6}
              max={72}
              step={1}
              value={orbit.photos_per_ring}
              onChange={(e) => setOrbit("photos_per_ring", Number(e.target.value))}
            />
          </Field>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label>Rings</label>
              <span className={`mono ${styles.value}`}>{rings.length}</span>
            </div>
            {rings.map((a, i) => (
              <div key={i} className={styles.ringRow}>
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={1}
                  value={a}
                  onChange={(e) => setRing(i, Number(e.target.value))}
                />
                <span className={styles.ringUnit}>m</span>
                <button
                  disabled={rings.length <= 1}
                  onClick={() => setOrbit("altitudes_m", rings.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setOrbit("altitudes_m", [...rings, Math.min(120, Math.max(...rings) + 20)])
              }
            >
              Add ring
            </button>
            <div className={styles.hint}>one pass per altitude, so a tall subject is covered</div>
          </div>

          <Field label="Direction" value={orbit.clockwise ? "Clockwise" : "Anticlockwise"}>
            <Segmented
              value={orbit.clockwise ? "cw" : "ccw"}
              options={[
                { value: "cw", label: "Clockwise" },
                { value: "ccw", label: "Anticlockwise" },
              ]}
              onChange={(v) => setOrbit("clockwise", v === "cw")}
            />
          </Field>
        </Section>
      ) : (
        <Section title="Area">
          <div className={styles.groupLabel}>Shape</div>
          {/* While drawing, the selector shows the tool in use; once idle it shows
              what the area actually is, so a finished circle does not read as a
              polygon. A rectangle is four corners once drawn and indistinguishable
              from a polygon, so it settles on Polygon. */}
          <Segmented<DrawMode>
            value={
              mode === "draw-rectangle" || mode === "draw-circle" || mode === "draw-polygon"
                ? mode
                : spec.shape
                  ? ("draw-circle" as DrawMode)
                  : ("draw-polygon" as DrawMode)
            }
            options={[
              { value: "draw-polygon" as DrawMode, label: "Polygon" },
              { value: "draw-rectangle" as DrawMode, label: "Rectangle" },
              { value: "draw-circle" as DrawMode, label: "Circle" },
            ]}
            onChange={(v) => onModeChange(v)}
          />

          <div className={styles.groupLabel}>Edit</div>
          <div className={styles.group}>
            <button
              className={mode === "append-polygon" ? "active" : ""}
              disabled={spec.aoi.length < 3 || !!spec.shape}
              onClick={() => onModeChange("append-polygon")}
            >
              Add points
            </button>
            <button
              disabled={spec.aoi.length === 0}
              onClick={() => setSpec((s) => ({ ...s, aoi: [], shape: null }))}
            >
              Clear area
            </button>
          </div>
          <div className={styles.hint}>
            Drag inside the shape to move it whole. Drag a corner to reshape it, or an amber
            midpoint to add one; right-click a corner to remove it.
          </div>

          <div className={styles.readout}>
            <span>Area</span>
            <span className="mono">{formatArea(areaHa)}</span>
          </div>
          <div className={styles.readout}>
            <span>{spec.shape ? "Radius" : "Corners"}</span>
            <span className="mono">
              {spec.shape ? `${Math.round(spec.shape.radius_m)} m` : spec.aoi.length}
            </span>
          </div>
        </Section>
      )}

      <Section
        title="Take-off"
        info="DJI Fly measures its maximum-distance limit from the take-off point and suspends the flight in the air if the mission exceeds it. That limit lives in the app and cannot be read from here, so check it against the furthest-waypoint figure before you fly."
      >
        <div className={styles.group}>
          <button
            className={mode === "set-home" ? "active" : ""}
            onClick={() => onModeChange(mode === "set-home" ? "idle" : "set-home")}
          >
            {mode === "set-home" ? "Click the map…" : "Set home point"}
          </button>
        </div>
        <div className={styles.readout}>
          <span>Home</span>
          <span className="mono">{coord(spec.home)}</span>
        </div>
        <div className={styles.readout}>
          <span>Furthest waypoint</span>
          <span className="mono">
            {spec.home && preview.photo_count ? `${Math.round(preview.home_distance_m)} m` : "—"}
          </span>
        </div>
      </Section>

      <Section
        title="Flight"
        info={
          isOrbit
            ? "An orbit is framed by its subject: the tilt is computed for each ring from the radius and the height, so the camera looks at what you are photographing. A heading aimed at a point of interest cancels a fixed gimbal angle, so there is nothing to set."
            : undefined
        }
      >
        {!isOrbit && (
          <>
            <Field label="Altitude" value={String(flight.altitude_m)} unit="m">
              <input
                type="range"
                min={20}
                max={120}
                step={1}
                value={flight.altitude_m}
                onChange={(e) => setFlight("altitude_m", Number(e.target.value))}
              />
              <div className={styles.hint}>
                one photograph covers {Math.round(preview.footprint_across_m)} ×{" "}
                {Math.round(preview.footprint_along_m)} m
              </div>
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
          </>
        )}

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

        <Field
          label="Movement through photo points"
          value={flight.turn === "through" ? "Fly through" : "Stop at point"}
        >
          <select value={flight.turn} onChange={(e) => setFlight("turn", e.target.value as TurnMode)}>
            <option value="through">Fly through</option>
            <option value="stop">Stop at point</option>
          </select>
        </Field>

        <Field
          label="Battery"
          value={flight.battery_minutes ? String(flight.battery_minutes) : "no limit"}
          unit={flight.battery_minutes ? "min" : undefined}
          info="Resuming a waypoint mission after a battery change is not possible on this aircraft, so a Site bigger than one battery is flown as several Missions. Each part ends by returning home; swap the battery and select the next part on the Controller. Consecutive parts share a waypoint, so nothing is missed at the seam."
        >
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={flight.battery_minutes}
            onChange={(e) => setFlight("battery_minutes", Number(e.target.value))}
          />
          <div className={styles.hint}>usable flying minutes on one battery</div>
        </Field>

        {preview.parts > 1 && (
          <div className={styles.readout}>
            <span>Parts</span>
            <span className="mono">
              {preview.part_minutes.map((m) => m.toFixed(1)).join(" · ")} min
            </span>
          </div>
        )}

        {!isOrbit && (
          <Field label="Margin passes" value={String(flight.margin_passes)}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.5}
              value={flight.margin_passes}
              onChange={(e) => setFlight("margin_passes", Number(e.target.value))}
            />
            <div className={styles.hint}>how far the grid runs beyond the boundary</div>
          </Field>
        )}
      </Section>

      <Section
        title="Camera"
        info="Camera settings are set by hand on the Controller before flight. They are recorded here so the flight is reproducible; they are not written into the mission file."
      >
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
          <select
            value={camera.white_balance}
            onChange={(e) => setCamera("white_balance", e.target.value)}
          >
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
      </Section>

      <Section title="Identification">
        <Field label="Site name" value={spec.site || "—"}>
          <input type="text" value={spec.site} onChange={(e) => setSpec((s) => ({ ...s, site: e.target.value }))} />
        </Field>
        <Field label="Date" value={spec.date || "—"}>
          <input type="date" value={spec.date} onChange={(e) => setSpec((s) => ({ ...s, date: e.target.value }))} />
        </Field>
        <div className={styles.readout}>
          <span>Path starts</span>
          <span className="mono">{preview.start_corner || "—"}</span>
        </div>
      </Section>

      <Section title="Saved missions">
        <SavedMissions missions={savedMissions} onLoad={onLoadMission} onDelete={onDeleteMission} />
      </Section>
    </aside>
  );
}
