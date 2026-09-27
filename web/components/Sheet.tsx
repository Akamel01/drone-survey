"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import {
  flickVelocity,
  rubberBand,
  shouldDismissSheet,
  SHEET_SAMPLE_CAP,
  SHEET_SETTLE_MS,
  type DragSample,
} from "@/lib/sheet";
import styles from "./Sheet.module.css";

// A layer over its parent: the native <dialog>, shown with showModal(), so
// the focus trap, Escape and the inert background underneath are the
// browser's, not ours (spec § 8, § 10). What is ours: the shape (a bottom
// sheet on a phone, a centred panel on a wide screen, both § 11 / § 10), the
// entrance and exit (§ 9.1, CSS only, below), and the one gesture a touch
// sheet adds -- drag the handle down far enough, or flick it down fast, and
// it goes.
//
// Closing always goes through the element itself (`dialog.close()`), never
// through `onClose` directly: that keeps every dismissal -- Escape, the
// close control, a drag past the threshold, a flick -- funnelled through the
// same native `close` event, which is the one place this reports back.
//
// The drag's numbers (threshold, flick velocity, rubber-band limit) live in
// lib/sheet.ts, where the tests and the motion harness share them (#256).

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** id of a heading inside `children`; the dialog's accessible name. */
  labelledBy: string;
  children: ReactNode;
}

/** Push a sample, keeping the drag's memory bounded (SHEET_SAMPLE_CAP). */
function pushSample(samples: DragSample[], y: number, t: number) {
  samples.push({ y, t });
  if (samples.length > SHEET_SAMPLE_CAP) samples.shift();
}

export default function Sheet({ open, onClose, labelledBy, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ startY: number; samples: DragSample[] } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleEnd = useRef<((ev: TransitionEvent) => void) | null>(null);

  // Leave the spring-back state, wherever it is: used by the transitionend
  // listener, the SHEET_SETTLE_MS backstop, a rapid re-grab and the close
  // listener. Refs only, so its identity never changes.
  const endSettle = useCallback((dialog: HTMLDialogElement) => {
    dialog.classList.remove(styles.settling);
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    if (settleEnd.current) {
      dialog.removeEventListener("transitionend", settleEnd.current);
      settleEnd.current = null;
    }
  }, []);

  // Open and close follow the prop; nothing here decides to do either on its
  // own. `showModal`/`close` are no-ops when already in that state, which
  // matters because the `close` event below also runs through this render.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The single source of truth that the sheet is gone: Escape fires the
  // browser's own `close` (after its `cancel`), the close button and a
  // drag-dismiss both call `dialog.close()` themselves rather than `onClose`
  // -- so whichever caused it, this is where the parent finds out. A close
  // mid-spring-back also drops the settle class and the inline offset here,
  // so the exit keeps the closed rule's --dur-base / --ease-in and a stale
  // transform can never leak into the next open.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = () => {
      endSettle(dialog);
      dialog.classList.remove(styles.dragging);
      dialog.style.transform = "";
      onClose();
    };
    dialog.addEventListener("close", handle);
    return () => dialog.removeEventListener("close", handle);
  }, [onClose, endSettle]);

  // Spring back from a released drag over --dur-base / --ease-out: the class
  // carries the transition, the flush makes the cleared inline transform
  // animate from the drag offset, and the filtered transitionend ends the
  // state. The SHEET_SETTLE_MS timeout is the backstop for when no
  // transitionend comes (reduced motion zeroes transitions; O5, #256).
  const settle = (dialog: HTMLDialogElement) => {
    dialog.classList.remove(styles.dragging);
    dialog.classList.add(styles.settling);
    void dialog.offsetHeight;
    dialog.style.transform = "";
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== dialog || ev.propertyName !== "transform") return;
      endSettle(dialog);
    };
    settleEnd.current = onEnd;
    dialog.addEventListener("transitionend", onEnd);
    settleTimer.current = setTimeout(() => endSettle(dialog), SHEET_SETTLE_MS);
  };

  // Drag-to-dismiss, phone only (the handle is display:none above 999px --
  // see Sheet.module.css -- so this never arms on a wide screen). One
  // pointer, tracked from the handle itself: content inside the sheet keeps
  // its own scrolling and its own clicks.
  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current;
    // A re-grab during a spring-back cancels it: the sheet snaps to rest, the new drag tracks from 0.
    if (dialog) endSettle(dialog);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Safari has occasionally thrown for a pointer id it does not
      // recognise; the drag still works from the move/up listeners already
      // on this element, just without capture outside its bounds.
    }
    drag.current = { startY: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }] };
    dialog?.classList.add(styles.dragging);
  };

  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    const started = drag.current;
    const dialog = ref.current;
    if (!started || !dialog) return;
    pushSample(started.samples, e.clientY, e.timeStamp);
    // Only `transform`, and damped: upward travel resists towards the
    // rubber-band limit, it is never clamped flat to zero.
    dialog.style.transform = `translateY(${rubberBand(e.clientY - started.startY)}px)`;
  };

  const onHandleUp = (e: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current;
    const started = drag.current;
    drag.current = null;
    if (!dialog || !started) return;
    pushSample(started.samples, e.clientY, e.timeStamp);
    const dy = e.clientY - started.startY; // raw, signed
    if (shouldDismissSheet(dy, flickVelocity(started.samples))) {
      dialog.classList.remove(styles.dragging);
      dialog.style.transform = "";
      dialog.close();
      return;
    }
    if (dy !== 0) {
      settle(dialog);
      return;
    }
    // Move-and-return with no net travel: no settle, but the moves may have
    // left an inline translateY(0px) that still has to go.
    dialog.classList.remove(styles.dragging);
    dialog.style.transform = "";
  };

  // pointercancel is not a user decision (O2, #256): settle, never dismiss.
  const onHandleCancel = (e: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current;
    const started = drag.current;
    drag.current = null;
    if (!dialog || !started) return;
    if (e.clientY - started.startY !== 0) settle(dialog);
    else dialog.classList.remove(styles.dragging);
  };

  return (
    <dialog
      ref={ref}
      className={`glass-smoke ${styles.sheet}`}
      aria-labelledby={labelledBy}
    >
      <div
        className={styles.handle}
        role="presentation"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleCancel}
      />
      <button type="button" className={styles.close} aria-label="Close" onClick={() => ref.current?.close()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
