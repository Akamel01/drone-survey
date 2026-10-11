"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AccountMenu.module.css";
import { accountLabel, initialOf } from "../lib/home";
import { signOutToHome } from "../lib/authClient";

// The Account's own identity and its way out (#358): one avatar button that
// opens a glass menu with where to manage the account, and Sign out. Mounted
// by both chrome surfaces; no session, no menu.
export default function AccountMenu({ name, email }: { name: string | null; email: string | null }) {
  // No session means no initial, no name and no address, and both surfaces
  // already offer Sign in on their own (Q1).
  if (!accountLabel(name, email)) return null;
  return <Menu name={name} email={email} label={accountLabel(name, email)} />;
}

function Menu({ name, email, label }: { name: string | null; email: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFirstOnOpen = useRef(false);

  const openMenu = (focusFirst: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setClosing(false);
    focusFirstOnOpen.current = focusFirst;
    setOpen(true);
  };
  const closeMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
    setClosing(true);
    closeTimer.current = setTimeout(() => setClosing(false), 260);
    btnRef.current?.focus();
  };

  // Tap-outside and Escape close; the keydown listener is on capture so an
  // Escape here does not also reach whatever else the surface handles it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // A keyboard-opened menu starts on its first item (spec §10).
  useEffect(() => {
    if (!open || !focusFirstOnOpen.current) return;
    focusFirstOnOpen.current = false;
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open]);

  // Arrow keys move within the menu and wrap; Home and End jump to the ends.
  // The items are links and one button, so Space and Enter activate natively.
  const menuKeys = (e: React.KeyboardEvent) => {
    const root = menuRef.current;
    const items = root ? [...root.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : [];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (items[i + 1] ?? items[0]).focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (items[i - 1] ?? items[items.length - 1]).focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };
  const btnKeys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(true);
    }
  };

  return (
    <div className={styles.wrap}>
      <button
        ref={btnRef}
        className={styles.avatar}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${label}`}
        onClick={() => (open ? closeMenu() : openMenu(false))}
        onKeyDown={btnKeys}
      >
        <span className={styles.initial} aria-hidden="true">
          {initialOf(name, email)}
        </span>
      </button>

      {(open || closing) && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className={`glass-smoke ${styles.menu} ${closing ? styles.menuClosing : ""}`}
          onKeyDown={menuKeys}
        >
          <div className={styles.identity}>
            <span className={styles.name} title={label}>
              {label}
            </span>
            {email && (
              <span className={styles.email} title={email}>
                {email}
              </span>
            )}
          </div>
          <a role="menuitem" className={styles.item} href="https://papyrus-ai.net/account" style={{ animationDelay: "calc(var(--stagger) * 0)" }}>
            Profile
          </a>
          <a role="menuitem" className={styles.item} href="https://papyrus-ai.net/account/billing" style={{ animationDelay: "calc(var(--stagger) * 1)" }}>
            Plans &amp; billing
          </a>
          <div className={styles.divider} role="separator" />
          <button
            role="menuitem"
            className={`${styles.item} ${styles.danger}`}
            style={{ animationDelay: "calc(var(--stagger) * 2)" }}
            onClick={() => void signOutToHome()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}