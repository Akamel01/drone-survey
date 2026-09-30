"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { isDrawing, type DrawMode } from "@/lib/areaEditing";
import { coord, formatArea } from "@/lib/missionView";
import type { MissionSpec } from "@/lib/spec";
import styles from "./MapToolbar.module.css";

// The drawing and map-editing tools, on the map where the drawing happens
// (UI-29). They used to live in Settings, which on a phone meant leaving the map
// to pick a tool and coming back to use it. One component serves both layouts:
// a strip under the map on a phone, a floating glass block above the Summary on
// a wide screen. It follows the Mission type chosen in Settings.

interface MapToolbarProps {
  spec: MissionSpec;
  mode: DrawMode;
  areaHa: number;
  /** A tool pick. The page's own `selectMode`: choosing a shape starts a fresh
   *  area, and any other mode leaves the area alone. */
  onTool: (m: DrawMode) => void;
  onClearArea: () => void;
  onClearSubject: () => void;
}

/** The tab bar's line style: 24 px grid, 1.5 px stroke, round caps and joins. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  polygon: <path d="M12 3.5 20 9l-3 10.5H7L4 9Z" />,
  rectangle: <rect x="4" y="6.5" width="16" height="11" rx="1.5" />,
  circle: <circle cx="12" cy="12" r="8" />,
  addPoints: (
    <>
      <path d="M4 17 7 6l8 2 4 6" />
      <path d="M17 16v6M14 19h6" />
    </>
  ),
  clearArea: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5.5M14 11v5.5" />,
  home: <path d="M3.5 11.5 12 4l8.5 7.5M6 10.3V20h12v-9.7M10 20v-5h4v5" />,
  subject: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  clearSubject: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="8" />
      <path d="M5 5l14 14" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.75h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/** One tool. The icon carries it on a phone and the word joins it on a wide
 *  screen; the accessible name is the word either way, and `pressed` (a tool
 *  that is on) reads as pressed. */
function Tool({
  label,
  icon,
  pressed,
  disabled,
  title,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={pressed ? `${styles.tool} active` : styles.tool}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <Icon>{icon}</Icon>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

const HOW_GRID =
  "Drag inside the shape to move it whole. Drag a corner to reshape it, or an amber midpoint to add one; right-click a corner to remove it. On touch: drag a handle with your fingertip, or tap a corner and then Remove corner. While drawing, Enter finishes the area and Escape cancels.";
const HOW_ORBIT =
  "Set the point of interest, then click the map on what you are photographing. Drag its centre to move it, or the handle on its edge to change the radius.";

export default function MapToolbar({ spec, mode, areaHa, onTool, onClearArea, onClearSubject }: MapToolbarProps) {
  const isOrbit = spec.mission_type === "orbit";
  const drawing = isDrawing(mode);
  const toggle = (m: DrawMode) => onTool(mode === m ? "idle" : m);

  const [howOpen, setHowOpen] = useState(false);
  const howId = useId();
  const dockRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  // The how-to closes on a press outside and on Escape. Escape is caught on
  // capture and stopped there, so the map's own Escape (which cancels a draw)
  // does not also fire, the way MapPane's menus do it.
  useEffect(() => {
    if (!howOpen) return;
    const closeOutside = (e: PointerEvent) => {
      if (!readoutRef.current?.contains(e.target as Node)) setHowOpen(false);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setHowOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [howOpen]);

  // On a wide screen the toolbar floats above the Summary, whose tallest size
  // stops short of it (plan.module.css reads this). A phone's dock has no box.
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() =>
      root.style.setProperty("--map-toolbar-h", `${el.getBoundingClientRect().height}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--map-toolbar-h");
    };
  }, []);

  // On a phone the readout sits at the map's top-left beside the Base map and
  // Overlays buttons, and the drawing panel starts under whichever is taller
  // (MapPane.module.css reads this).
  useEffect(() => {
    const el = readoutRef.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() =>
      root.style.setProperty("--map-readout-h", `${el.getBoundingClientRect().height}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--map-readout-h");
    };
  }, []);

  // A placement mode says what the next click on the map will do; the tool
  // itself is only an icon on a phone.
  const prompt =
    mode === "set-home"
      ? "Click the map to place the home point."
      : mode === "set-poi"
        ? "Click the map to place the subject."
        : null;

  return (
    <div ref={dockRef} className={styles.dock}>
      <div ref={readoutRef} className={styles.status}>
        <div className={`${styles.readout} glass-smoke`}>
          {/* Announced once when a placement starts; the figures change with
              every drag and are not live. */}
          <span className="visually-hidden" role="status">
            {prompt}
          </span>
          <span className={styles.readoutText}>
            {prompt ??
              (isOrbit ? (
                <>
                  Subject <span className="mono">{spec.orbit.center ? coord(spec.orbit.center) : "not set"}</span>
                </>
              ) : (
                <>
                  <span className="mono">{formatArea(areaHa)}</span>
                  {" · "}
                  {spec.shape
                    ? `radius ${Math.round(spec.shape.radius_m)} m`
                    : `${spec.aoi.length} ${spec.aoi.length === 1 ? "corner" : "corners"}`}
                </>
              ))}
          </span>
          <button
            type="button"
            className={styles.how}
            aria-expanded={howOpen}
            aria-controls={howId}
            aria-label="How to use the map tools"
            onClick={() => setHowOpen((o) => !o)}
          >
            <Icon>{ICONS.info}</Icon>
          </button>
        </div>
        {howOpen && (
          <p id={howId} role="note" className={`${styles.howText} glass-smoke`}>
            {isOrbit ? HOW_ORBIT : HOW_GRID}
          </p>
        )}
      </div>

      {/* Keyed on the Mission type, so a swap in Settings fades the other set in. */}
      <div key={isOrbit ? "orbit" : "grid"} className={`${styles.bar} glass-smoke`} role="group" aria-label="Map tools">
        {isOrbit ? (
          <div className={styles.group}>
            <Tool
              label="Set point of interest"
              icon={ICONS.subject}
              pressed={mode === "set-poi"}
              onClick={() => toggle("set-poi")}
            />
            <Tool label="Clear subject" icon={ICONS.clearSubject} disabled={!spec.orbit.center} onClick={onClearSubject} />
          </div>
        ) : (
          <>
            <div className={styles.group} role="group" aria-label="Shape">
              <Tool label="Polygon" icon={ICONS.polygon} pressed={mode === "draw-polygon"} onClick={() => onTool("draw-polygon")} />
              <Tool label="Rectangle" icon={ICONS.rectangle} pressed={mode === "draw-rectangle"} onClick={() => onTool("draw-rectangle")} />
              <Tool label="Circle" icon={ICONS.circle} pressed={mode === "draw-circle"} onClick={() => onTool("draw-circle")} />
            </div>
            <div className={styles.group}>
              {/* Switching to "Add points" halfway through a shape was a silent
                  mode change, and the corners already placed made it look like
                  nothing had happened. Finish or cancel the draw first. */}
              <Tool
                label="Add points"
                icon={ICONS.addPoints}
                pressed={mode === "append-polygon"}
                disabled={(drawing && mode !== "append-polygon") || spec.aoi.length < 3 || !!spec.shape}
                title={drawing && mode !== "append-polygon" ? "Finish or cancel the shape you are drawing first" : undefined}
                onClick={() => onTool("append-polygon")}
              />
              <Tool label="Clear area" icon={ICONS.clearArea} disabled={spec.aoi.length === 0} onClick={onClearArea} />
            </div>
          </>
        )}
        <div className={styles.group}>
          <Tool label="Set home point" icon={ICONS.home} pressed={mode === "set-home"} onClick={() => toggle("set-home")} />
        </div>
      </div>
    </div>
  );
}
