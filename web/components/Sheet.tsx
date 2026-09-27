"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { shouldDismissSheet } from "@/lib/sheet";
import styles from "./Sheet.module.css";

// A layer over its parent: the native <dialog>, shown with showModal(), so
// the focus trap, Escape and the inert background underneath are the
// browser's, not ours (spec § 8, § 10). What is ours: the shape (a bottom
// sheet on a phone, a centred panel on a wide screen, both § 11 / § 10), the
// entrance and exit (§ 9.1, CSS only, below), and the one gesture a touch
// sheet adds -- drag the handle down far enough and it goes.
//
// Closing always goes through the element itself (`dialog.close()`), never
// through `onClose` directly: that keeps every dismissal -- Escape, the
// close control, a drag past the threshold -- funnelled through the same
// native `close` event, which is the one place this reports back.

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** id of a heading inside `children`; the dialog's accessible name. */
  labelledBy: string;
  children: ReactNode;
}

export default function Sheet({ open, onClose, labelledBy, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

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
  // -- so whichever caused it, this is where the parent finds out.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = () => onClose();
    dialog.addEventListener("close", handle);
    return () => dialog.removeEventListener("close", handle);
  }, [onClose]);

  // Drag-to-dismiss, phone only (the handle is display:none above 999px --
  // see Sheet.module.css -- so this never arms on a wide screen). One
  // pointer, tracked from the handle itself: content inside the sheet keeps
  // its own scrolling and its own clicks.
  const drag = useRef<{ startY: number } | null>(null);

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Safari has occasionally thrown for a pointer id it does not
      // recognise; the drag still works from the move/up listeners already
      // on this element, just without capture outside its bounds.
    }
    drag.current = { startY: e.clientY };
    ref.current?.classList.add(styles.dragging);
  };

  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    ref.current.style.transform = `translateY(${dy}px)`;
  };

  const onHandleUp = (e: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current;
    const started = drag.current;
    drag.current = null;
    if (!dialog || !started) return;
    dialog.classList.remove(styles.dragging);
    const dy = Math.max(0, e.clientY - started.startY);
    dialog.style.transform = "";
    if (shouldDismissSheet(dy)) dialog.close();
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
        onPointerCancel={onHandleUp}
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
