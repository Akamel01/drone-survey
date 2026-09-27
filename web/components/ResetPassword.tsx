"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/authClient";
import { emailSignInProblem, passwordProblem, PASSWORD_MIN } from "@/lib/emailSignIn";
import HeroScene from "./HeroScene";
import styles from "./HomeScreen.module.css";

/** Choosing a new password from a reset link (#247), on the hero like the
 *  home page. A used or expired link says so and offers a new one. */
export default function ResetPassword({ token, linkError }: { token: string | null; linkError: string | null }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(
    !token || linkError ? emailSignInProblem("INVALID_TOKEN") : null,
  );
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const weak = passwordProblem(password);
    if (weak) return setProblem(weak);
    if (password !== again) return setProblem("The two passwords are not the same.");
    setBusy(true);
    setProblem(null);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) setProblem(emailSignInProblem(error.code, error.message));
      else setDone(true);
    } catch {
      setProblem("That did not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.root}>
      <HeroScene playing showOnWide />
      <div className={styles.content}>
        <h1 className={styles.title}>Mission Control</h1>
        {done ? (
          <div className={styles.emailForm}>
            <p className={styles.waitingCopy}>Your password is changed. Sign in with it.</p>
            <Link href="/" className={`glass-clear-strong ${styles.link}`}>
              Sign in
            </Link>
          </div>
        ) : token && !linkError ? (
          <form className={styles.emailForm} onSubmit={(e) => void submit(e)} noValidate>
            <label className={styles.field}>
              <span>New password (at least {PASSWORD_MIN} characters)</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>The same password again</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              Change password
            </button>
            {problem && (
              <p className={styles.problem} role="status">
                {problem}
              </p>
            )}
          </form>
        ) : (
          <div className={styles.emailForm}>
            <p className={styles.problem} role="status">
              {problem}
            </p>
            <Link href="/" className={`glass-clear-strong ${styles.link}`}>
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
