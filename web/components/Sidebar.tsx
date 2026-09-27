"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { newSiteId, type MissionSpec, type MissionType, type TurnMode } from "@/lib/spec";
import { orbitTilt, type Preview } from "@/lib/mission";
import { MISSION_NAME_MAX, missionNameProblem } from "@/lib/missionRecords";
import { siteTwin, type SiteChoice } from "@/lib/missionView";
import type { Editing } from "@/app/plan/page";
import { isDrawing, type DrawMode } from "./MapPane";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  spec: MissionSpec;
  setSpec: (updater: (s: MissionSpec) => MissionSpec) => void;
  mode: DrawMode;
  onModeChange: (m: DrawMode) => void;
  areaHa: number;
  preview: Preview;
  /** The Sites already in the store. A Site is chosen from these, never typed
   *  fresh: a Site is the unit a client buys work about, identified once at
   *  onboarding, and typing a name per Mission was quietly creating a new one
   *  every time (ADR 0021). */
  sites: SiteChoice[];
  /** The stored Mission the editor is working on, and its Mission Name. */
  editing: Editing;
  onNameChange: (name: string) => void;
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
 * sit behind an icon rather than occupying the panel permanently. Hover and
 * keyboard focus reveal them for a mouse or a keyboard; a tap opens and closes
 * them explicitly, since neither hover nor focus is guaranteed on a touch
 * screen (Safari in particular does not focus a plain element on tap).
 */
function Info({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span className={styles.infoWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.info}
        aria-expanded={open}
        aria-label="More information"
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      <span className={styles.infoBubble} role="note" data-open={open || undefined}>
        {children}
      </span>
    </span>
  );
}

function Section({ title, info, children }: { title: string; info?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${styles.section} glass-smoke`}>
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
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "active" : undefined}
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
  sites,
  editing,
  onNameChange,
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

  // A draw in progress is a different state from a finished area, and every
  // control below that a click would mean something else in has to say so.
  const drawing = isDrawing(mode);

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
            {rings.map((a, i) => {
              const { deg, clamped } = orbitTilt(a, orbit.target_height_m, orbit.radius_m);
              const finite = Number.isFinite(deg);
              // Sign taken from the rounded value, so a ring level with the
              // subject — or a hair below it, where raw deg is in (-0.5, 0) —
              // reads "tilt 0°", never "tilt −0°" (griller DP3).
              const rounded = Math.round(deg);
              const tilt = finite ? `${rounded < 0 ? "−" : ""}${Math.abs(rounded)}°` : "—";
              const tiltLabel = finite
                ? `tilt ${rounded} degrees${clamped ? ", at the gimbal's limit" : ""}`
                : "tilt unknown";
              return (
                <Fragment key={i}>
                  <div className={styles.ringRow}>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      step={1}
                      value={a}
                      onChange={(e) => setRing(i, Number(e.target.value))}
                    />
                    <span className={styles.ringUnit}>m</span>
                    <span className={styles.ringTilt} aria-label={tiltLabel}>
                      tilt {tilt}
                      {clamped ? " at limit" : ""}
                    </span>
                    <button
                      disabled={rings.length <= 1}
                      onClick={() => setOrbit("altitudes_m", rings.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                  {clamped && (
                    // The full sentence sits outside the flex row so it cannot
                    // fight the input for space (plan §3, griller DP3); exact
                    // wording preserved.
                    <div className={styles.warnHint}>
                      {"at the gimbal's limit: raise the ring or widen the radius"}
                    </div>
                  )}
                </Fragment>
              );
            })}
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
          <div className={styles.groupLabel}>
            Shape{drawing ? " — drawing on the map" : ""}
          </div>
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
            {/* Switching to "Add points" halfway through a shape was a silent
                mode change, and the corners already placed made it look like
                nothing had happened. Finish or cancel the draw first. */}
            <button
              className={mode === "append-polygon" ? "active" : ""}
              disabled={(drawing && mode !== "append-polygon") || spec.aoi.length < 3 || !!spec.shape}
              title={
                drawing && mode !== "append-polygon"
                  ? "Finish or cancel the shape you are drawing first"
                  : undefined
              }
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
          {/* The reshape hint is false while drawing: there a map click adds a
              corner, and the midpoint handles it names are not on screen. */}
          {drawing ? (
            <div className={styles.warnHint}>
              {mode === "draw-polygon" || mode === "append-polygon"
                ? "Each click on the map adds a corner. Finish the area from the panel on the map, or press Enter; Escape cancels."
                : mode === "draw-rectangle"
                  ? "Click one corner on the map, then the opposite one. Escape cancels."
                  : "Click the centre on the map, then drag out the radius. Escape cancels."}
            </div>
          ) : (
            <div className={styles.hint}>
              Drag inside the shape to move it whole. Drag a corner to reshape it, or an amber
              midpoint to add one; right-click a corner to remove it. On touch: drag a handle
              with your fingertip, or tap a corner and then Remove corner.
            </div>
          )}

        <div className={styles.readout}>
          <span>Area</span>
          <span className="mono">{formatArea(areaHa)}</span>
        </div>
        <div className={styles.readout}>
          <span>{spec.shape ? "Radius" : "Corners"}</span>
          <span className="mono">{spec.shape ? `${Math.round(spec.shape.radius_m)} m` : spec.aoi.length}</span>
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

      <Section
        title="Identification"
        info="The Site is the place, chosen once and reused so its Captures accumulate under it. The Mission Name tells two Missions of one Site on one day apart."
      >
        <SiteField
          sites={sites}
          site={spec.site}
          site_id={spec.site_id}
          onChoose={(choice) => setSpec((s) => ({ ...s, site: choice.site, site_id: choice.site_id }))}
        />
        <Field label="Mission Name" value={editing.name.trim() || "—"}>
          <input
            type="text"
            value={editing.name}
            maxLength={MISSION_NAME_MAX}
            placeholder="north half, orbit"
            onChange={(e) => onNameChange(e.target.value)}
          />
          <div className={styles.hint}>
            {missionNameProblem(editing.name) ??
              (editing.copied_from
                ? `A copy of ${editing.copied_from}. Saving makes a new Mission; that one is not changed.`
                : "Two Missions may share a Site and a date when their names differ — that is two deliberate flights, not a correction.")}
          </div>
        </Field>
        <Field label="Date" value={spec.date || "—"}>
          <input type="date" value={spec.date} onChange={(e) => setSpec((s) => ({ ...s, date: e.target.value }))} />
        </Field>
        <div className={styles.readout}>
          <span>Path starts</span>
          <span className="mono">{preview.start_corner || "—"}</span>
        </div>
      </Section>

    </aside>
  );
}

/**
 * Choosing the Site, or naming a new one.
 *
 * The field this replaces was labelled "Site name" and typed fresh for every
 * Mission, which minted a new Site id each time and broke Capture accumulation
 * before the 3D Timelapse was ever built (ADR 0021). A new Site is still
 * possible -- it is how the first one exists -- but it is a deliberate act with
 * its own control, not what happens by default.
 */
function SiteField({
  sites,
  site,
  site_id,
  onChoose,
}: {
  sites: SiteChoice[];
  site: string;
  site_id?: string;
  onChoose: (choice: SiteChoice) => void;
}) {
  const known = site_id != null && sites.some((s) => s.site_id === site_id);
  const naming = !known;
  const twin = naming ? siteTwin(sites, site_id, site) : null;
  return (
    <Field label="Site" value={site.trim() || "—"}>
      <select
        value={known ? (site_id as string) : "new"}
        onChange={(e) => {
          if (e.target.value === "new") {
            onChoose({ site_id: newSiteId(""), site: "" });
            return;
          }
          const chosen = sites.find((s) => s.site_id === e.target.value);
          if (chosen) onChoose(chosen);
        }}
      >
        {sites.map((s) => (
          <option key={s.site_id} value={s.site_id}>
            {s.site}
          </option>
        ))}
        <option value="new">New Site…</option>
      </select>
      {naming && (
        <input
          type="text"
          value={site}
          placeholder="Name the new Site"
          onChange={(e) =>
            onChoose({
              site: e.target.value,
              // The id is minted once, when the Site first gets a name, and
              // never again: renaming a Site must not change the place it is.
              site_id: site_id && site.trim() ? site_id : newSiteId(e.target.value),
            })
          }
        />
      )}
      {twin && (
        // Naming a "new" Site after an existing one is the accident that
        // splits a Site's Captures in two (#166). Offer the real one.
        <div className={styles.hint}>
          There is already a Site called “{twin.site}”.{" "}
          <button type="button" onClick={() => onChoose(twin)}>
            Use it
          </button>
        </div>
      )}
      <div className={styles.hint}>
        {/* The hint follows whether this Site has an identifier, not whether it
            is in the list: the list is empty when the store could not be read,
            and telling the operator a Site they have flown before is about to
            be created is exactly the confusion this field exists to end. */}
        {site_id && site.trim()
          ? `Identified as ${site_id}. Captures accumulate under it.`
          : "A new Site is created when this Mission is saved. Its identifier never changes, even if the name does."}
      </div>
    </Field>
  );
}
