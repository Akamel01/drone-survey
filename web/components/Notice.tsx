"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  COLLAPSE_MS,
  COMPACT_BEAT_MS,
  DISMISS_MS,
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
  // Timing owns the lib (spec §9.1): expanded ~4s → compact for a brief beat
  // → 200ms `--ease-in` leave, then onDismiss. Failures carry no timers.
  useLayoutEffect(() => {
    opener.current = document.activeElement;
    if (!payload || payload.failed) return;
    const t1 = setTimeout(() => setPhase("compact"), COLLAPSE_MS);
    const t2 = setTimeout(() => setPhase("leaving"), COLLAPSE_MS + COMPACT_BEAT_MS);
    const t3 = setTimeout(() => dismiss.current(), DISMISS_MS);
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

  const failed = noticeTone(payload.failed) === "stop";
  const { title, rest } = splitNotice(payload.body);
  const short = compactTitle(title);
  const collapsed = phase !== "expanded";

  return (
    <div
      ref={box}
      tabIndex={-1}
      role={noticeRole(payload.failed)}
      className={`press ${styles.notice} ${collapsed ? styles.compact : styles.expanded} ${phase === "leaving" ? styles.leaving : ""}`}
      onClick={() => setPhase((p) => togglePhase(p))}
    >
      {collapsed ? (
        <>
          <Badge failed={failed} />
          <span className={styles.short}>{short}</span>
          {payload.missionName ? <span className={styles.capsule}>{payload.missionName}</span> : null}
        </>
      ) : (
        <>
          <span className={styles.head}>
            <Badge failed={failed} />
            <span className={styles.title}>{short}</span>
          </span>
          {payload.missionName ? <span className={styles.mission}>{payload.missionName}</span> : null}
          {rest ? <p className={styles.body}>{rest}</p> : null}
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
