"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/authClient";
import { emailSignInProblem, passwordProblem, PASSWORD_MIN } from "@/lib/emailSignIn";
import styles from "./HomeScreen.module.css";

type Mode = "sign-in" | "sign-up" | "reset" | "check-verify" | "check-reset";

/**
 * Email and password on the home page (#247), on the same glass as the
 * provider pills. Sign-up sends a confirming link; the link signs the Account
 * in. The reset form answers the same way whether or not the email has an
 * Account, so it never tells anyone who is registered.
 */
export default function EmailSignIn({ onBack, callbackURL = "/" }: { onBack: () => void; callbackURL?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const go = (next: Mode) => {
    setMode(next);
    setProblem(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (mode === "sign-up") {
      const weak = passwordProblem(password);
      if (weak) return setProblem(weak);
    }
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email, password, callbackURL });
        if (error) setProblem(emailSignInProblem(error.code, error.message));
        else router.refresh(); // the home page re-reads the session and moves on
      } else if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0],
          callbackURL,
        });
        if (error) setProblem(emailSignInProblem(error.code, error.message));
        else go("check-verify");
      } else if (mode === "reset") {
        // The answer is the same whatever the server says about the address.
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => null);
        go("check-reset");
      }
    } catch {
      setProblem("That did not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "check-verify" || mode === "check-reset") {
    return (
      <div className={styles.emailForm}>
        <p className={styles.waitingCopy}>
          {mode === "check-verify"
            ? `Check ${email}: open the link we sent to confirm it and sign in.`
            : `If ${email} has an Account, a link to choose a new password is on its way.`}
        </p>
        <button type="button" className="glass-clear-strong" onClick={() => go("sign-in")}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form className={styles.emailForm} onSubmit={(e) => void submit(e)} noValidate>
      {mode === "sign-up" && (
        <label className={styles.field}>
          <span>Name</span>
          <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className={styles.field}>
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {mode !== "reset" && (
        <label className={styles.field}>
          <span>Password{mode === "sign-up" ? ` (at least ${PASSWORD_MIN} characters)` : ""}</span>
          <input
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            minLength={mode === "sign-up" ? PASSWORD_MIN : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <button type="submit" className="primary" disabled={busy}>
        {mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
      </button>
      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}
      <div className={styles.emailLinks}>
        {mode === "sign-in" ? (
          <>
            <button type="button" className={styles.textButton} onClick={() => go("sign-up")}>
              Create an account
            </button>
            <button type="button" className={styles.textButton} onClick={() => go("reset")}>
              Forgot password?
            </button>
          </>
        ) : (
          <button type="button" className={styles.textButton} onClick={() => go("sign-in")}>
            I have an account
          </button>
        )}
        <button type="button" className={styles.textButton} onClick={onBack}>
          Other ways to sign in
        </button>
      </div>
    </form>
  );
}
