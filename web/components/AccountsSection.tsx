"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { AccountRow } from "@/lib/accountAdmin";
import { authClient } from "@/lib/authClient";
import { accountsClient } from "@/lib/accountsClient";
import type { NoticePayload } from "./Notice";
import Sheet from "./Sheet";
import styles from "./AccountsSection.module.css";

const PROVIDER: Record<string, string> = { google: "Google", github: "GitHub", credential: "email" };

function signedUp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Approval (#243): the operator's list of Accounts in Settings. Pending ones
 * first, with Approve and Remove; approved ones with Remove. Only the admin
 * sees it, and the API checks the role again on every call.
 */
export default function AccountsSection({ onNotice }: { onNotice?: (p: Omit<NoticePayload, "key">) => void }) {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string | null } | undefined)?.role === "admin";
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AccountRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const headingId = useId();

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    void accountsClient.list().then((result) => {
      if (!live) return;
      if (result.ok) setAccounts(result.accounts);
      else setProblem(result.text);
    });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  const act = useCallback(
    async (action: "approve" | "remove", row: AccountRow) => {
      setBusy(row.id);
      const result = await accountsClient.run(action, row.id);
      setBusy(null);
      const who = row.name || row.email;
      if (result.ok) {
        setAccounts(result.accounts);
        const text = action === "approve" ? `Approved: ${who} can now reach their Workspace.` : `Removed: ${who} is signed out everywhere.`;
        onNotice?.({ title: action === "approve" ? "Approved" : "Removed", body: text, missionName: row.email, failed: false });
      } else {
        onNotice?.({ title: action === "approve" ? "Not approved" : "Not removed", body: result.text, missionName: row.email, failed: true });
      }
    },
    [onNotice],
  );

  if (!isAdmin) return null;

  return (
    <section className={`${styles.section} glass-smoke`} aria-labelledby={`${headingId}-title`}>
      <h2 id={`${headingId}-title`}>Accounts</h2>
      {problem && <p className={styles.quiet}>{problem}</p>}
      {accounts === null && !problem && <p className={styles.quiet}>Reading the Accounts…</p>}
      {accounts !== null && accounts.length === 0 && <p className={styles.quiet}>No Accounts yet.</p>}
      {accounts !== null && accounts.length > 0 && (
        <ul className={styles.list}>
          {accounts.map((row) => (
            <li key={row.id} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>{row.name || row.email}</span>
                <span className={styles.meta}>
                  {row.email} · {row.providers.map((p) => PROVIDER[p] ?? p).join(", ") || "no sign-in"} · {signedUp(row.createdAt)}
                </span>
                <span className={styles.state}>{row.admin ? "Operator" : row.approved ? "Approved" : "Waiting for approval"}</span>
              </div>
              {!row.admin && (
                <div className={styles.actions}>
                  {!row.approved && (
                    <button type="button" className="primary" disabled={busy === row.id} onClick={() => void act("approve", row)}>
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => {
                      setConfirm(row);
                      setConfirmOpen(true);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} labelledBy={headingId}>
        {confirm && (
          <>
            <h3 id={headingId} className={styles.sheetTitle}>
              Remove {confirm.name || confirm.email}?
            </h3>
            <p className={styles.sheetText}>
              They are signed out everywhere and their Account and its empty Workspace are deleted. They can sign up
              again, and would wait for approval.
            </p>
            <div className={styles.sheetActions}>
              <button type="button" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setConfirmOpen(false);
                  void act("remove", confirm);
                }}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </Sheet>
    </section>
  );
}
