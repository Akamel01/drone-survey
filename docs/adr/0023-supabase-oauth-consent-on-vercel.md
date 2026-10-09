# Supabase OAuth consent page on Vercel, Site URL to missions

Date: 2026-10-09. Issue #335. Companion: `.autoforge/architecture/decisions.md`
(D1–D6), `.autoforge/architecture/report.md`, `.autoforge/requirements/grilling.md`.

The planner needs one shared sign-in with retrieval, and Supabase's OAuth 2.1
server is that seam (#334). The load-bearing question was where Supabase's
redirect host — the Supabase Site URL — points, because flipping it can break
retrieval's auth returns.

## Decision

**Recommend option (1), conditional**: Supabase Site URL →
`https://missions.papyrus-ai.net`, with the OAuth consent page as a route in
this app under the existing Vercel deploy contract (`web/README.md`). The
stand-in (`web/lib/oauthStandin.ts`) is extended, not forked, so both tickets
assert against one e2e contract.

Conditions: the retrieval resend one-liner
(`emailRedirectTo: ${window.location.origin}/login` at `LoginPage.tsx:205`),
the allowlist extended never replaced, and the operator confirming the current
Supabase Site URL value (E1).

**Trust-zone split**: `SUPABASE_OAUTH_CLIENT_SECRET` stays server-side in the
#336 callback; the OAuth consent page never sees it. Stand-in URLs obey the
existing `VERCEL_ENV`-refusal (`web/lib/accountAuth.ts:192-208`): test
stand-ins are ignored on Vercel, real credentials used.

**Preview strategy**: production-only Supabase provider, env-scoped, no code
branching. Exact-match redirect URIs mean previews cannot share the
production confidential client.

**Terminology guard**: "Supabase Site URL" / "OAuth consent" / "operator
Approval" in full, everywhere — bare "Site" collides with the surveyed
location, bare "approval" with the operator's Account gate. See CONTEXT.md.

## Interface contract (#335/#336, frozen)

Discovery at `<SUPABASE_URL>/auth/v1/.well-known/openid-configuration`;
`/userinfo` gains OIDC `sub`; `/token` shape unchanged; stand-in serves
discovery, authorization-details, approve, deny; redirect URI exactly
`https://missions.papyrus-ai.net/api/auth/callback/supabase`; new
consent tests append queue slots; `trustedProviders: []` discipline kept.

## Open questions (operator authority)

E1 current Supabase Site URL + allowlist contents. E2 authorize the flip.
E3 accept OAuth-server beta + RS256/ES256 migration (tracked #240). E4
retrieval `supabase_sub` gap audit. E5 confirm production-only preview
strategy. E6 if E2 refused: portfolio-site timeline or retrieval rework. E7
provider set (Google/GitHub/email both sides vs single password) — shapes the
consent sign-in-first UX.

## Operator checklist draft (for the #335 PR)

1. Enable the Supabase OAuth server; migrate signing keys to RS256/ES256.
2. Set the Supabase Site URL to `https://missions.papyrus-ai.net` (extend the
   redirect allowlist, never replace it).
3. Register the confidential client with exactly
   `https://missions.papyrus-ai.net/api/auth/callback/supabase`.
4. Set the twelve Vercel env vars (README table), same `OAUTH_PROXY_SECRET`
   everywhere; Supabase provider live on production only.
