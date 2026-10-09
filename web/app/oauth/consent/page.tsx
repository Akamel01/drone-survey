// OAuth consent page (#335 M3): renders the client name and scopes ONLY from
// getAuthorizationDetails — this component takes no searchParams, so a forged
// link cannot put attacker text where the client name goes (H2). Unsigned-in
// Accounts get sign-in-then-return bound to the fixed CONSENT_PATH, never a
// caller URL (H1). Approve/deny are plain forms posting to the sibling route
// handlers, which redirect; the secret never leaves the server (D4).

import { getAccount } from "@/lib/accountAccess";
import { CONSENT_PATH, consentBase, getAuthorizationDetails } from "./consent";
import ConsentSignIn from "./consent-signin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const panel: React.CSSProperties = {
  maxWidth: 560,
  margin: "64px auto",
  padding: 32,
  borderRadius: 24,
  background: "#E7EDEF",
  color: "#0B0B0C",
  fontFamily: "system-ui, sans-serif",
};

const button: React.CSSProperties = {
  minHeight: 45,
  padding: "0 32px",
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 500,
};

export default async function ConsentPage() {
  const base = consentBase();
  // Unconfigured deployments name what is missing instead of rendering a
  // consent for an unknown server (same discipline as the 503 in accountEnv).
  if (!base) {
    return (
      <main style={panel}>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px" }}>Sign-in is not set up here yet</h1>
        <p style={{ fontSize: 16, color: "#666C6C", margin: 0 }}>
          This deployment is not configured for accounts, so OAuth consent cannot work: missing SUPABASE_URL.
        </p>
      </main>
    );
  }
  let details;
  try {
    details = await getAuthorizationDetails(base);
  } catch {
    return (
      <main style={panel}>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px" }}>Consent is unavailable</h1>
        <p style={{ fontSize: 16, color: "#666C6C", margin: 0 }}>
          The authorization server could not be reached. Try again later.
        </p>
      </main>
    );
  }
  const account = await getAccount();
  // Sign-in-then-return: the return path is the fixed CONSENT_PATH inside the
  // client component, never a URL from this request (H1).
  if (!account) {
    return (
      <main style={panel}>
        <p style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "#666C6C", margin: "0 0 8px" }}>
          Sign in first
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px" }}>{details.client_name} wants access</h1>
        <p style={{ fontSize: 16, color: "#666C6C", margin: "0 0 24px" }}>
          Sign in with Google, GitHub, or email first — then you return here to allow or deny.
        </p>
        <ConsentSignIn returnPath={CONSENT_PATH} />
      </main>
    );
  }
  return (
    <main style={panel}>
      <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px" }}>{details.client_name} wants access</h1>
      <p style={{ fontSize: 16, color: "#666C6C", margin: "0 0 8px" }}>
        Signed in as {account.email}. It is asking for:
      </p>
      <ul style={{ fontSize: 16, margin: "0 0 24px", paddingLeft: 20 }}>
        {details.scope
          .split(" ")
          .filter(Boolean)
          .map((scope) => (
            <li key={scope}>
              <code style={{ fontSize: 15 }}>{scope}</code>
            </li>
          ))}
      </ul>
      <div style={{ display: "flex", gap: 12 }}>
        <form method="post" action="/oauth/consent/approve">
          <button type="submit" style={{ ...button, background: "#000000", color: "#FFFFFF" }}>
            Allow
          </button>
        </form>
        <form method="post" action="/oauth/consent/deny">
          <button type="submit" style={{ ...button, background: "#D6DBDE", color: "#0B0B0C" }}>
            Deny
          </button>
        </form>
      </div>
    </main>
  );
}
