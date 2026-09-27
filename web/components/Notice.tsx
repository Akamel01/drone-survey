"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./Notice.module.css";

// The single reporting path for action results (D1): SummaryBar.runSave and
// MissionList.act() feed these through the page-owned slot (M2). `title` is
// the first sentence (compact pill); `body` the full verbatim text.
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

// Success timing (grilling §3): expanded ~4s → compact for a brief beat →
// 150–250ms `--ease-in` leave, then onDismiss. Failures carry no timers.
const COLLAPSE_MS = 4000;
const COMPACT_BEAT_MS = 250;
const LEAVE_MS = 200;

export default function Notice({ payload, onDismiss }: NoticeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // The control that ran the action, for Escape focus-return (spec §10).
  const opener = useRef<Element | null>(null);
  // Focusable fallback when opener gone/disabled (body.focus() no-op w/o tabindex).
  const box = useRef<HTMLDivElement | null>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  // Capture opener synchronously on commit (useLayoutEffect fires before
  // paint, earlier than useEffect) to shrink post-async focus-drift window.
  // Full press-time capture needs opener carried on payload (MissionList.act),
  // outside this file scope.
  useLayoutEffect(() => {
    opener.current = document.activeElement;
    if (!payload || payload.failed) return;
    const t1 = setTimeout(() => setCollapsed(true), COLLAPSE_MS);
    const t2 = setTimeout(() => setLeaving(true), COLLAPSE_MS + COMPACT_BEAT_MS);
    const t3 = setTimeout(() => dismiss.current(), COLLAPSE_MS + COMPACT_BEAT_MS + LEAVE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [payload]);

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
      dismiss.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [payload]);

  if (!payload) return null;

  const short = payload.title.replace(/[.!?…]+$/, "");
  return (
    <div
      ref={box}
      tabIndex={-1}
      role={payload.failed ? "alert" : "status"}
      className={`${styles.notice} ${collapsed ? styles.compact : styles.expanded} ${leaving ? styles.leaving : ""}`}
      onClick={() => setCollapsed((c) => !c)}
    >
      {collapsed ? (
        <span className={styles.short}>{short}…</span>
      ) : (
        <>
          <span className={styles.mission}>{payload.missionName}</span>
          <span className={styles.title}>{payload.title}</span>
          <p className={styles.body}>{payload.body}</p>
        </>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className={styles.close}
        onClick={(e) => {
          e.stopPropagation();
          dismiss.current();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
