// The Wayfinder passphrase, held in this browser's storage and shown by two
// fields on the same page: the Missions view's own (plan decision 17) and the
// Summary's, beside Save. They are one stored value, not two -- so a change in
// either has to reach the other while the tab is open.
//
// localStorage's own `storage` event fires only in *other* tabs of the same
// origin, never the one that made the write (MDN), so two fields in one tab
// need a signal of their own to agree without a reload. This is that signal:
// a tiny in-page publish/subscribe, kept here rather than in either component
// so neither field owns the other.

import { safeStorage } from "./actions";

export const PASSPHRASE_KEY = "drone-planner.wayfinder-key";

type Listener = (value: string) => void;
const listeners = new Set<Listener>();

/** The stored passphrase; `""` once storage works but nothing is typed yet;
 *  `null` when storage itself is blocked outright, so nothing can be kept
 *  anywhere and no field can be trusted to remember what is typed into it. */
export function readPassphrase(): string | null {
  const ls = safeStorage();
  return ls ? (ls.getItem(PASSPHRASE_KEY) ?? "") : null;
}

/** Store a value and tell every field showing it in this tab, in the order
 *  they subscribed. Storage failing (private mode, a full quota) still reaches
 *  every subscriber -- the field typed into keeps what was typed even though
 *  only this tab will remember it, exactly as a single field already did. */
export function writePassphrase(value: string): void {
  try {
    safeStorage()?.setItem(PASSPHRASE_KEY, value);
  } catch {
    // Unavailable: persistence no-ops. The field typed into still shows it.
  }
  for (const notify of listeners) notify(value);
}

/** Called with every value written from here on, in this tab, wherever it was
 *  typed. Returns the unsubscribe. */
export function subscribePassphrase(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
