# One papyrus-ai.net account across all projects

Research for [issue #334](https://github.com/Akamel01/drone-survey/issues/334):
the operator wants **one account** that works across every project under
papyrus-ai.net — Mission Control at missions.papyrus-ai.net, the retrieval chat
site now at papyrus-ai.net (moving to papyrus-ai.net/retrieval), and future
projects — with credits and billing shared across them later.

Every web source was read **2026-10-09** unless dated otherwise; the sources
list at the end carries each URL. Anything inferred rather than read or measured
is marked **INFERRED**. No secret values were printed or copied at any point:
host inspection used env-var *names*, file listings, and source code only.

## Bottom line

**Recommendation: (a) Supabase as the single identity provider, via its OAuth
2.1 / OIDC server mode, with Mission Control as a confidential OAuth client.**
The retrieval site's users already live in Supabase Auth; Mission Control joins
the same user pool instead of building a second one. Host the OAuth consent UI
on Vercel (not on the Linux host) so Mission Control sign-in never depends on
that one machine. Keep Better Auth sessions, Workspaces, and Approval inside
Mission Control, linking on verified email. Revisit (b), a central
accounts.papyrus-ai.net, only when shared credits land or if the Supabase beta
bites.

Why (a) wins:

1. **The user pool already exists.** Retrieval sign-in is Supabase Auth (hosted)
   as credential authority since ADR-0008; Google, GitHub, and email/password
   are all enabled there. There is no second pool to merge — only Mission
   Control to attach.
2. **The "does Supabase have server mode" question is now yes.** Supabase Auth
   ships a documented OAuth 2.1 Server with OIDC discovery, `openid`/`email`/
   `profile` scopes, JWKS, and confidential/public client registration [S1][S2].
   It is beta, on all plans, at no separate charge; OAuth sign-ins count toward
   project MAUs [S2].
3. **Mission Control already speaks generic OAuth.** `web/lib/accountAuth.ts`
   uses Better Auth's `genericOAuth` plugin (today for the test stand-ins,
   `:11`, `:52`–`:53`, `:192`–`:208`); pointing a real entry at Supabase's
   authorize/token/userinfo endpoints is the same mechanism, not a new
   integration.
4. **It is the smallest migration.** Retrieval changes ~zero (enable OAuth
   server in the Supabase dashboard, register one client, build one consent
   page). Mission Control adds one provider entry plus verified-email linking —
   linking discipline it already enforces (`trustedProviders: []`,
   `requireEmailVerification`, `accountAuth.ts:77`–`:101`).
5. **Shared credits hang off it cleanly later.** The billing research already
   decided Stripe with Better Auth's Stripe plugin billing against the
   organization-as-Workspace [S6]; a Supabase `sub` → Account link is the only
   identity key a future credits service needs.

What you accept: Mission Control sign-in depends on Supabase cloud (beta
feature), and the consent UI must be built and hosted somewhere you control
(see §5 for placing it on Vercel to avoid Linux-host coupling).

## 1. How the retrieval site signs people in today

- **Credential authority: Supabase Auth (hosted cloud), not self-hosted
  GoTrue.** `~/sme/docs/adr/0008-supabase-auth-with-identity-broker.md`
  (accepted 2026-07-06, read 2026-10-09 on host `akamel-linux`) adopted
  "Supabase Auth (hosted free tier) as the credential authority". `SUPABASE_URL`
  is set in the deployment environment (verified set-but-value-masked,
  2026-10-09), so the broker path is live.
- **Providers: email/password, Google, GitHub.** The login page calls
  `supabase.auth.signInWithPassword`, `signUp`, and `signInWithOAuth`
  (`dashboard/frontend/src/pages/LoginPage.tsx:142,179,225`); the social button
  list is exactly Google + GitHub
  (`dashboard/frontend/src/lib/supabase.ts:18`–`:21`). The operator's GitHub
  OAuth app "Supabase-Papyrus" is, **INFERRED**, the GitHub OAuth app whose
  client id/secret are entered in the Supabase dashboard's GitHub provider
  configuration (standard Supabase social-login setup; no other GitHub OAuth
  configuration exists anywhere in `services/auth` — a repo-wide grep for
  "github" in `services/auth/*.py` returns nothing).
- **Local session layer: custom FastAPI service `sme_auth`.** Image built from
  `services/auth/Dockerfile` (compose `~/sme/docker-compose.yml:710`–`:714`);
  SQLite at `sqlite:////app/data/auth.db` on the shared `sme_db_data` volume
  (`:722`–`:729`); tables `users`, `user_api_keys`, `user_preferences`,
  `sessions`, `audit_logs` (`services/auth/models.py:16`–`:95`).
  `POST /api/auth/exchange` verifies a Supabase JWT (RS256 via JWKS) and mints
  the internal token pair, linking `users.supabase_sub` on first exchange
  (`routes_identity.py:338`–`:420`; `supabase_broker.py:1`–`:52`).
- **User count: ~20 at last record; current count not established.** ADR-0008
  says "Only ~20 users exist" (2026-07-06). A current count needs one
  read-only query against Supabase Auth or `auth.db`; host access rules for
  this ticket (config/compose/`docker inspect` only, never touch `sme-*`
  volumes) forbade it — see open questions.
- **Repo and deploy config.** Repo `~/sme` on `akamel-linux`, remote
  `git@github.com:Akamel01/papyrus-ai.git` (`git remote -v`, 2026-10-09);
  compose files `docker-compose.yml` plus `docker-compose.{prod,host}.yml`
  (`ls ~/sme`, 2026-10-09); Caddy (`sme_caddy`) reverse-proxies
  `sme_auth:8000` under `/api/auth/*` and the dashboard UI under `/login`
  (`services/caddy/Caddyfile:75`–`:143`); TLS terminates at Cloudflare —
  papyrus-ai.net resolves to Cloudflare addresses (`dig papyrus-ai.net`,
  2026-10-09: 216.198.79.65, 64.29.17.65, 172.64.80.1).

## 2. Mission Control's auth today

- **Better Auth 1.7.6 self-hosted, users in our own database**
  (`web/package.json:24`; map #239 Notes; issue #241 closed).
- **Providers Google, GitHub, email/password** with OAuth-proxy plugin for
  previews, organization (= Workspace) plugin, admin plugin, strict
  verified-email account linking (`web/lib/accountAuth.ts:62`–`:159`).
- **Approval gate:** new Accounts sign in but every planner API refuses them
  until approved; owner bootstrap via verified `OWNER_EMAIL`
  (`accountAuth.ts:226`–`:282`; `CONTEXT.md:21`–`:37`).
- **Hosting: Vercel + Neon Postgres.** `web/README.md:94`–`:103` (Deploy on
  Vercel), `README.md:134` (Neon in production), `web/lib/accountDb.ts:1`–`:15`
  (Neon URL carries its own sslmode). missions.papyrus-ai.net resolves to
  Vercel (`dig`, 2026-10-09: `0554d6476352fda2.vercel-dns-017.com`).
- **Sessions are opaque server-side rows in Neon**, not self-validating JWTs
  (Better Auth default `session_token` cookie; cf. [S4] "primary
  `session_token` cookie remains an opaque, secret-signed session identifier").

## 3. Options

| | (a) Supabase OAuth/OIDC server | (b) Central accounts.papyrus-ai.net (Better Auth IdP) | (c) Separate auth, link by verified email later |
|---|---|---|---|
| What changes | Enable OAuth server in Supabase dashboard; build one consent page; register Mission Control as confidential client; add one `genericOAuth` entry in `accountAuth.ts` | New Vercel service with OAuth-provider plugin; Mission Control becomes its client; retrieval LoginPage re-implemented as custom OIDC code flow + broker rework; migrate ~20 users | Nothing now; each app keeps its own pool; later match on verified email |
| Effort (INFERRED) | S — days. No retrieval backend change; Mission Control change is one provider entry + linking, a mechanism already in the tree | L — weeks across two repos. New service, consent/login UI, DB migration for its client/consent tables, retrieval frontend rewrite of login, user migration with `supabase_sub`/internal-`user_id` mapping | Zero now; M later (linking UI, verified-email audit both sides, conflict resolution) |
| Migration | None for retrieval users — they are already Supabase users. Mission Control has ~no users yet (accounts backend merged unwired, #264); link on verified email/sub | Move retrieval's Supabase identities into Better Auth (passwords cannot be exported from Supabase — **INFERRED**: GoTrue has no password-export; users would reset or use provider sign-in; social-only users migrate cleanly) | No migration, but every user holds two identities; guests/anon rows (`auth.py` guest mode, `supabase_broker` anon upgrade) complicate matching |
| Uptime coupling | Mission Control login needs Supabase cloud + wherever the consent UI lives (put it on Vercel — §5). Retrieval unchanged | Everything needs accounts.papyrus-ai.net (Vercel+Neon: same class as Mission Control today). Retrieval login becomes host+cloud+Vercel dependent | No new coupling |
| Cost | $0 extra (OAuth server on all plans, no separate charge [S2]); MAU quota is the ceiling; free-tier project pausing already accepted in ADR-0008 | $0 extra (Vercel+Neon already paid); engineering time is the cost | $0 |
| Credits/billing fit | Future credits service keys on Supabase `sub` ↔ Workspace mapping; Stripe-against-organization decision [S6] unaffected | Cleanest long-term: Workspace org already the billing unit; credits live next to identity | Worst: two pools to reconcile before any shared balance |
| Key risk | **Beta** [S2]; OIDC `id_token` **requires asymmetric (RS256/ES256) signing keys** — HS256 fails ID-token issuance [S2]; Supabase cloud dependence extends to Mission Control | `@better-auth/oauth-provider` is a **separate package**, and the pinned better-auth **1.7.6 has no server-side OIDC/OAuth-provider plugin in core** (verified: plugin listing at tag v1.7.6 contains `generic-oauth`, `jwt`, `organization`… but no `oidc-provider`/`sso` [S5]); version/compat check required. Retrieval's supabase-js **cannot** do third-party OAuth-server flows — "not available in the @supabase/supabase-js library", custom implementation required [S3] | Drift: two passwords, two social connects, two approval states; email-linking is only as trustworthy as the weaker side's verification |

## 4. Shared session cookie on `.papyrus-ai.net` (alternative, not recommended as the answer)

Technically supported: `advanced.crossSubDomainCookies: { enabled: true,
domain: "papyrus-ai.net" }` plus `trustedOrigins` ([S4]). Same-root
subdomains are first-party, so Safari ITP is not the blocker it is for
cross-site setups ([S4]). But: (i) Better Auth sessions are opaque Neon rows,
so the Linux host would have to validate every request against Mission
Control's session API — a new runtime dependency of the host on Vercel/Neon
with failure semantics to design; (ii) any `papyrus-ai.net` subdomain,
present or future, receives the session cookie — token-theft scope widens
([S4] warns exactly this); (iii) it authenticates without unifying identity —
account linking (option c's work) is still required, plus cross-infra logout.
Useful later as SSO-smoothing *on top of* (a); not a substitute for one
account.

## 5. Recommendation and what it takes

**Adopt (a).** Concrete steps:

1. **Operator (Supabase dashboard, ~30 min):** enable OAuth 2.1 server;
   migrate JWT signing to RS256/ES256 (required for OIDC `id_token` [S2]);
   set the project's Site URL to the consent host below; register Mission
   Control as a confidential client with exact redirect URIs
   (`https://missions.papyrus-ai.net/api/auth/callback/supabase` or equivalent
   — exact match, no wildcards [S2]).
2. **Consent UI on Vercel, not the Linux host.** The authorization path is
   Site-URL + path [S2]; serve it from Vercel (a tiny route on Mission Control
   or a static page) using `getAuthorizationDetails` / `approveAuthorization`
   / `denyAuthorization` [S2]. This keeps Mission Control sign-in independent
   of the Linux host's uptime. (If the consent page instead lives at
   papyrus-ai.net, every Mission Control login couples to that one machine.)
3. **Mission Control (one ticket):** add a `genericOAuth` entry pointing at
   Supabase's authorize/token/userinfo endpoints ([S2] endpoint table;
   `accountAuth.ts` already proves the mechanism); link to the existing
   Account on verified email, preserving `trustedProviders: []` discipline;
   keep Workspace-per-Account, Approval, and sessions exactly as they are.
4. **Tests:** extend the existing OAuth stand-in (`lib/oauthStandin.ts`,
   `e2e/accounts.test.mjs`) to mimic Supabase's discovery document — no live
   Supabase in CI.

**Decisions the operator must make:**

1. Accept a **beta** Supabase feature on Mission Control's sign-in path, and
   Supabase-cloud dependence for both projects (retrieval already accepted it
   in ADR-0008).
2. RS256/ES256 signing-key migration (one-way-ish operational change; new
   projects default asymmetric [S2] — confirm current project state).
3. Consent UI host: Vercel (recommended) vs papyrus-ai.net (Linux host).
4. Provider set stays Google/GitHub/email — or drop email on one side to keep
   exactly one password per human.
5. MAU headroom: which Supabase plan the project is on and its quota.

**Follow-up tickets to create:**

1. Operator: enable Supabase OAuth server + RS256, register Mission Control
   client (checklist with exact URLs).
2. Build consent UI on Vercel (AFK, `ready-for-agent` shape).
3. Mission Control: Supabase `genericOAuth` entry + verified-email linking +
   stand-in e2e (AFK).
4. Audit: confirm every retrieval `users` row has a Supabase identity
   (bcrypt-import stragglers, guest/anon rows) before announcing one account.
5. Later: shared credits design on Workspace (Stripe, per [S6]) keyed on the
   Supabase-`sub` ↔ Account link.

## 6. Open questions (could not be answered read-only)

1. Current retrieval user count and how many rows lack `supabase_sub` — needs
   one read-only count the ticket's host rules forbade.
2. Supabase project plan + MAU usage/quota headroom.
3. Whether the Supabase project's JWT signing is still HS256 (decides if step
   5.1's migration applies).
4. Self-hosted GoTrue parity for OAuth-server mode (escape hatch; CLI/local
   config supports `[auth.oauth_server]` [S2], classic docker-image parity
   unverified).
5. `@better-auth/oauth-provider` compatibility with pinned 1.7.6 — only
   matters if (b) is ever revived.

## Sources

- [S1] Supabase docs, OAuth 2.1 Server overview (endpoints, scopes, JWKS,
  client types) — https://supabase.com/docs/guides/auth/oauth-server — read
  2026-10-09.
- [S2] Supabase docs, OAuth 2.1 Server getting started (beta status, pricing/
  MAU, RS256 requirement for OIDC, consent-UI contract, exact-match redirect
  URIs, CLI `[auth.oauth_server]`) —
  https://supabase.com/docs/guides/auth/oauth-server/getting-started — read
  2026-10-09.
- [S3] Supabase docs, OAuth 2.1 Flows ("not available in the
  @supabase/supabase-js library") —
  https://supabase.com/docs/guides/auth/oauth-server/oauth-flows — read
  2026-10-09 (via search excerpt, full page not fetched).
- [S4] Better Auth docs, Cookies (opaque `session_token`, `crossSubDomainCookies`,
  Safari ITP) — https://www.better-auth.com/docs/concepts/cookies — read
  2026-10-09.
- [S5] better-auth source at tag v1.7.6, `packages/better-auth/src/plugins`
  listing (no `oidc-provider`/`sso` in core) —
  https://api.github.com/repos/better-auth/better-auth/contents/packages/better-auth/src/plugins?ref=v1.7.6 —
  read 2026-10-09. OIDC Provider deprecation note + `@better-auth/oauth-provider`
  package — https://www.better-auth.com/docs/plugins/oauth-provider and
  https://better-auth.com/docs/plugins/oidc-provider — read 2026-10-09 (via
  search excerpts).
- [S6] `docs/research/billing-provider.md` on `origin/research/billing-provider`
  (Stripe direct, Better Auth Stripe plugin vs organization-as-Workspace) —
  read 2026-10-09.
- Host sources (all read 2026-10-09 via read-only SSH, secrets masked):
  `~/sme/docs/adr/0008-supabase-auth-with-identity-broker.md`;
  `~/sme/docker-compose.yml:710`–`:740`; `~/sme/services/auth/models.py:16`–`:95`;
  `~/sme/services/auth/routes_identity.py:31`–`:420`;
  `~/sme/services/auth/supabase_broker.py:1`–`:52`;
  `~/sme/dashboard/frontend/src/pages/LoginPage.tsx:142`–`:225`;
  `~/sme/dashboard/frontend/src/lib/supabase.ts:9`–`:21`;
  `~/sme/services/caddy/Caddyfile:75`–`:143`; `docker inspect sme_auth`
  (env names only); `git -C ~/sme remote -v`.
- This repo: `web/lib/accountAuth.ts` (1.7.6, plugins, linking, Approval);
  `web/lib/accountDb.ts:1`–`:15`; `web/README.md:27`–`:103`;
  `README.md:128`–`:136`; `CONTEXT.md:21`–`:37`; map #239 and issue #241
  bodies (via `gh api`, 2026-10-09).
- DNS: `dig missions.papyrus-ai.net` → Vercel; `dig papyrus-ai.net` →
  Cloudflare — run 2026-10-09 on the worktree Mac.
