"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { authClient, signOutToHome } from "@/lib/authClient";
import { markHomeEntrancePlayed, shouldPlayHomeEntrance, type HomeState } from "@/lib/home";
import EmailSignIn from "./EmailSignIn";
import HeroScene from "./HeroScene";
import styles from "./HomeScreen.module.css";

export interface HomeScreenProps {
  state: HomeState;
  /** Email and password is offered only where its mail can be sent (#247). */
  emailEnabled?: boolean;
  /** Supabase mode: Papyrus-only sign-in, decided server-side (#336). */
  supabaseOnly?: boolean;
  email?: string | null;
  name?: string | null;
}

const OPTIONS = [
  { provider: "google" as const, label: "Continue with Google" },
  { provider: "github" as const, label: "Continue with GitHub" },
];

const SUPABASE_OPTION = { provider: "supabase" as const, label: "Continue with your Papyrus account" };

export default function HomeScreen({ state, email, emailEnabled = false, supabaseOnly = false }: HomeScreenProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [withEmail, setWithEmail] = useState(false);

  useEffect(() => {
    if (!shouldPlayHomeEntrance(state)) return;
    markHomeEntrancePlayed();
    rootRef.current?.setAttribute("data-entrance", "play");
  }, [state]);

  useEffect(() => {
    if (state !== "approved") return;
    rootRef.current?.setAttribute("data-leaving", "");
    router.prefetch("/plan");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => router.replace("/plan"), reduced ? 150 : 400);
    return () => clearTimeout(timer);
  }, [state, router]);

  async function signIn(provider: "google" | "github" | "supabase") {
    setBusy(provider);
    setProblem(null);
    try {
      const { error } = await authClient.signIn.social({ provider, callbackURL: "/" });
      if (error) setProblem(error.message || "Sign-in could not start. Try again.");
    } catch {
      setProblem("Sign-in could not start. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const options = supabaseOnly ? [SUPABASE_OPTION] : OPTIONS;

  return (
    <main ref={rootRef} className={styles.root}>
      <HeroScene playing showOnWide />
      <div className={styles.content}>
        <h1 className={styles.title}>Mission Control</h1>
        {state === "signedout" && withEmail && <EmailSignIn onBack={() => setWithEmail(false)} />}
        {state === "signedout" && !withEmail && (
          <div className={styles.options}>
            {options.map((option, index) => (
              <button
                key={option.provider}
                type="button"
                className="glass-clear-strong"
                style={{ "--i": index } as CSSProperties}
                disabled={busy !== null}
                onClick={() => void signIn(option.provider)}
              >
                {option.label}
              </button>
            ))}
            {emailEnabled && (
              <button
                type="button"
                className="glass-clear-strong"
                style={{ "--i": options.length } as CSSProperties}
                disabled={busy !== null}
                onClick={() => {
                  setProblem(null);
                  setWithEmail(true);
                }}
              >
                Continue with email
              </button>
            )}
          </div>
        )}
        {state === "pending" && (
          <div className={styles.waiting}>
            <p className={styles.waitingCopy}>Your account is waiting for approval</p>
            <p className={styles.email}>{email}</p>
            <button
              type="button"
              className="glass-clear-strong"
              onClick={() => void signOutToHome()}
            >
              Sign out
            </button>
          </div>
        )}
        {state === "unconfigured" && (
          <div className={styles.quiet}>
            <p className={styles.quietCopy}>Sign-in is not set up on this deployment yet</p>
            <Link href="/plan" className={`glass-clear-strong ${styles.link}`}>
              Go to the planner
            </Link>
          </div>
        )}
        {problem && (
          <p className={styles.problem} role="status">
            {problem}
          </p>
        )}
      </div>
    </main>
  );
}
