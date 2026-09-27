"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ARRIVAL_MS,
  COLLAPSE_MS,
  DISMISS_MS,
  LEAVE_MS,
  compactTitle,
  initialPhase,
  noticeRole,
  noticeTone,
  splitNotice,
  togglePhase,
  type NoticePhase,
} from "@/lib/notice";
import styles from "./Notice.module.css";

// The single reporting path for action results (D1): SummaryBar.runSave and
// MissionList.act() feed these through the page-owned slot (M2). `body` is
// the full verbatim text; the title and rest-only body come from
// splitNotice below, so the two never repeat a sentence.
export interface NoticePayload {
  title: string;
  body: string;
  missionName: string;
  failed: boolean;
  key: number;
}

interface NoticeProps {
  payload: NoticePayload | null;
  onDismiss: () => void;
}

function Badge({ failed }: { failed: boolean }) {
  return (
    <span className={`${styles.badge} ${failed ? styles.fail : ""}`} aria-hidden="true">
      {failed ? (
        <svg viewBox="0 0 24 24">
          <path d="M12 5v9" />
          <circle className={styles.dot} cx="12" cy="18" r="1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="M6.5 12.5l4 4 7-8.5" />
        </svg>
      )}
    </span>
  );
}

export default function Notice({ payload, onDismiss }: NoticeProps) {
  const [phase, setPhase] = useState<NoticePhase>(initialPhase);
  // The last phase that was not `leaving`. CR2: a leave entered from expanded
  // keeps rendering the expanded class through the dissolve, so the exit never
  // moves geometry; a leave from compact keeps the pill.
  const [lastNonLeaving, setLastNonLeaving] = useState<NoticePhase>(initialPhase);
  const changePhase = useCallback((next: NoticePhase) => {
    if (next !== "leaving") setLastNonLeaving(next);
    setPhase(next);
  }, []);
  // The control that ran the action, for Escape focus-return (spec §10).
  const opener = useRef<Element | null>(null);
  // Focusable fallback when opener gone/disabled (body.focus() no-op w/o tabindex).
  const box = useRef<HTMLDivElement | null>(null);
  // The compact pill layer's measured rect becomes the resting clip (D3).
  const pill = useRef<HTMLDivElement | null>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  // A dismissal is under way: close/Escape cannot schedule a second unmount
  // while the leave beat runs (D6).
  const leavingRef = useRef(false);
  const leaveTimer = useRef<number | null>(null);
  // Close button and Escape: enter `leaving` now, unmount one leave beat later.
  // Focus return stays synchronous at the key event (UI-8, grilling §6).
  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    changePhase("leaving");
    leaveTimer.current = window.setTimeout(() => dismiss.current(), LEAVE_MS);
  }, [changePhase]);

  // Capture opener synchronously on commit (useLayoutEffect fires before
  // paint, earlier than useEffect) to shrink post-async focus-drift window.
  // Full press-time capture needs opener carried on payload (MissionList.act),
  // outside this file scope.
  // Timing owns the lib (spec §9.1): every payload arrives compact; a failure
  // auto-expands at 200ms and carries no exit timer; a success leaves at 4s
  // and dismisses at 4.25s. The measurement + ResizeObserver keep the resting
  // clip's --px/--nx/--pb equal to the pill's real rect, through font swap.
  useLayoutEffect(() => {
    opener.current = document.activeElement;
    if (!payload) return;
    leavingRef.current = false;
    const measure = () => {
      const el = box.current;
      const p = pill.current;
      if (!el || !p) return;
      const boxRect = el.getBoundingClientRect();
      const pillRect = p.getBoundingClientRect();
      const px = (boxRect.width - pillRect.width) / 2;
      el.style.setProperty("--px", `${px}px`);
      // Arrival starts 20% inside the pill's final width (the D2 knob).
      el.style.setProperty("--nx", `${px + pillRect.width * 0.2}px`);
      el.style.setProperty("--pb", `${boxRect.height - pillRect.height}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (pill.current) ro.observe(pill.current);
    const timers: number[] = [];
    if (payload.failed) {
      timers.push(window.setTimeout(() => changePhase("expanded"), ARRIVAL_MS));
    } else {
      timers.push(
        window.setTimeout(() => {
          leavingRef.current = true;
          changePhase("leaving");
        }, COLLAPSE_MS),
      );
      timers.push(window.setTimeout(() => dismiss.current(), DISMISS_MS));
    }
    return () => {
      ro.disconnect();
      timers.forEach(clearTimeout);
      if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    };
  }, [payload, changePhase]);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A native modal dialog owns Escape while open (Sheet.tsx:40-43): the
      // browser closes it, and the Notice stays.
      if (document.querySelector("dialog[open]")) return;
      const back = opener.current as (HTMLElement & { disabled?: boolean }) | null;
      if (back instanceof HTMLElement && document.contains(back) && !back.disabled) back.focus();
      else box.current?.focus();
      leave();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [payload, leave]);

  if (!payload) return null;

  const failed = noticeTone(payload.failed) === "stop";
  const { title, rest } = splitNotice(payload.body);
  const short = compactTitle(title);
  const leaving = phase === "leaving";
  // CR2: leaving from expanded keeps the expanded geometry through the beat.
  const showExpanded = phase === "expanded" || (leaving && lastNonLeaving === "expanded");
  // D5: the full result is exposed to assistive tech from mount for every
  // outcome, so the expanded layer is never `aria-hidden`. The compact pill
  // layer is the decorative/visual copy (its badge is already `aria-hidden`);
  // a tap still reveals it visually, with no re-announcement on expand.
  // The layer names must not contain lowercase `notice`: `[class*="notice"]`
  // is the checker's single-root selector (architecture §4).
  return (
    <div
      ref={box}
      // One Tab stop (spec § 10): Enter or Space toggles it like a tap. It is
      // never focused on arrival, so a result never pulls focus from the work.
      tabIndex={leaving ? -1 : 0}
      role={noticeRole(payload.failed)}
      className={`press ${styles.notice} ${showExpanded ? styles.expanded : ""} ${leaving ? styles.leaving : ""}`}
      onClick={() => changePhase(togglePhase(phase))}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        changePhase(togglePhase(phase));
      }}
    >
      <div ref={pill} className={styles.compactLayer} aria-hidden="true">
        <Badge failed={failed} />
        <span className={styles.wipe}>
          <span className={styles.short}>{short}</span>
        </span>
        {payload.missionName ? <span className={styles.capsule}>{payload.missionName}</span> : null}
      </div>
      <div className={styles.expandedLayer}>
        <span className={styles.head}>
          <Badge failed={failed} />
          <span className={styles.title}>{short}</span>
        </span>
        {payload.missionName ? <span className={styles.mission}>{payload.missionName}</span> : null}
        {rest ? <p className={styles.body}>{rest}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className={styles.close}
        onClick={(e) => {
          e.stopPropagation();
          leave();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
