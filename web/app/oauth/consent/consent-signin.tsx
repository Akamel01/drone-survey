// Sign-in-then-return for the OAuth consent page (#335 M3, criterion 3): the
// return path arrives as a prop holding the fixed CONSENT_PATH, never a URL
// read from the request (H1). Google/GitHub go through Better Auth social
// sign-in, email through the shared EmailSignIn form — both land back here.
"use client";

import { useState } from "react";
import { authClient } from "@/lib/authClient";
import EmailSignIn from "@/components/EmailSignIn";

const buttonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 45,
  marginBottom: 8,
  padding: "0 32px",
  borderRadius: 999,
  border: "1px solid #666C6C",
  background: "#FFFFFF",
  color: "#0B0B0C",
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
};

export default function ConsentSignIn({ returnPath }: { returnPath: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [withEmail, setWithEmail] = useState(false);

  async function signIn(provider: "google" | "github") {
    setBusy(provider);
    setProblem(null);
    try {
      const { error } = await authClient.signIn.social({ provider, callbackURL: returnPath });
      if (error) setProblem(error.message || "Sign-in could not start. Try again.");
    } catch {
      setProblem("Sign-in could not start. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (withEmail) return <EmailSignIn onBack={() => setWithEmail(false)} callbackURL={returnPath} />;

  return (
    <div>
      {[
        { provider: "google" as const, label: "Continue with Google" },
        { provider: "github" as const, label: "Continue with GitHub" },
      ].map((option) => (
        <button
          key={option.provider}
          type="button"
          disabled={busy !== null}
          onClick={() => void signIn(option.provider)}
          style={buttonStyle}
        >
          {option.label}
        </button>
      ))}
      <button type="button" disabled={busy !== null} onClick={() => setWithEmail(true)} style={buttonStyle}>
        Continue with email
      </button>
      {problem && (
        <p role="status" style={{ fontSize: 15, color: "#000000", margin: "12px 0 0" }}>
          {problem}
        </p>
      )}
    </div>
  );
}
