# One Account signs in through Supabase genericOAuth, or through Google/GitHub/email — never both

The planner's sign-in had one mode: Google, GitHub, or email and password,
chosen per Account at the button. The operator's Papyrus identity lives in
Supabase, and the ticket (#336) asks for one Account reached through it — a
single "Continue with your Papyrus account" button — while keeping today's
mode intact for any deployment that does not opt in.

Wiring three explicit endpoints (authorize, token, userinfo) was considered
and not built: one discovery URL constructed from `SUPABASE_URL`
(`<SUPABASE_URL>/auth/v1/.well-known/openid-configuration`) drifts less than
three separately configured URLs, and the ticket mandates discovery. The
stand-in serves that discovery document in tests so the production
URL-construction runs unmodified.

## Decision

**The Supabase trio selects the mode, exclusively.** Setting all three of
`SUPABASE_URL`, `SUPABASE_OAUTH_CLIENT_ID` and
`SUPABASE_OAUTH_CLIENT_SECRET` switches the deployment to Papyrus-only
sign-in at `providerId: "supabase"` (discovery URL above, confidential
client, PKCE on, scopes `openid email profile`); the built-in Google/GitHub
entries and email sign-in are off. With any of the three unset, construction
is byte-identical to today's. There is no fallback UI while configured, and
recovery is unset-the-trio plus redeploy.

**Linking rules do not change.** `trustedProviders` stays `[]` and the
verified-email gate stays on, so a verified Supabase email links to the
matching Account (owner and pending alike) while an unverified one refuses
with `account_not_linked` and creates nothing. Order is sub row first, then
verified email, then new: a verified email under a different `sub` links
to the existing Account, and a known `sub` with a changed email stays one row.

**Userinfo only.** Identity comes from the userinfo endpoint; no JWKS client
is built and nothing validates a JWT in this path. The stand-in
accepts-and-ignores PKCE verifiers for the same reason: genericOAuth here
consumes Bearer plus userinfo.

**Beta acceptance is the existing bar.** The new adapter is proven by the
same shapes as the old ones — pending copy, `OWNER_EMAIL` admin, verified
links, unverified refuses, plus a preserved session for a pre-existing
Google-linked Account — in a separate spec; the legacy spec runs trio-unset
and unmodified.

## Consequences

**Pre-launch gates stay human, not code** (accepted-or-pending at merge):
E-STRING (confirm `providerId "supabase"` and the production callback before
going live), E-MAU (headroom planned), E-KEYS (Supabase dashboard: OAuth
server on, RS256/ES256, exact redirect URIs), E-CONSENT (consent host choice
recorded here when made), E-PROVIDERS (confirm no fallback UI while
configured).

**The `CONTEXT.md` Account line is mode-agnostic.** It names no provider, so
a future sign-in change edits code and READMEs, not the glossary.
