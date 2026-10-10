# A verified email is its own Approval; only an unverified one waits for the operator

ADR 0023 made Supabase genericOAuth the sign-in surface. It left Approval alone:
every Account that reached a Workspace's Missions had the operator's decision
behind it. Ticket #341 removes that wait for one case only — a Papyrus identity
whose email the provider has verified — and records, here, what that decision is
made of, what it deliberately does not cover, and where sign-out goes when the
account leaves.

This ADR adds to 0023. It does not restate it: discovery-derived userinfo-only
identity, `trustedProviders: []`, the verified-email linking gate, and the
trio-selects-the-mode rule all stand as written there.

## Trust root

**Papyrus's userinfo endpoint is the sole proof of verification.** Identity comes
from `<SUPABASE_URL>/auth/v1/userinfo` (ADR 0023: userinfo only — no JWKS client,
no JWT validation, no id_token). `email_verified` from that endpoint is what
auto-approves; nothing else in the deployment is consulted, and no second
provider is trusted to assert it.

**One writer.** A single predicate, `autoApprove(userId, emailVerified)`
(`web/lib/accountAuth.ts`), is the only automatic path to `approved = true`.
Amended after the operator's follow-up ("no need for me to approve every single
account creation; we need email verification"): it fires when the email is
strictly `emailVerified === true`, the Account owns a `supabase`, `google` or
`github` provider row, and the user is not `banned`, in every mode. Google's
`email_verified` and GitHub's verified primary email arrive through the same
`userInfo.emailVerified`. Email/password Accounts have no provider row and are
not matched. It only ever sets `approved = true`: role is never touched, so an
owner stays `admin` and nothing is downgraded. The model has no "revoked" state
(`approved = false` is both pending and the only other value; Remove deletes the
Account), so `banned` is the one block honoured.

It runs from three places: `user.create.after` (first sign-in), `account.create.after`
(a verified provider linking to an existing Account), and the
`user.validateUserInfo` gate on every returning provider sign-in
(`action: "sign-in"`), which is the one hook that sees the fresh provider claim.
That third path is what lets a pending Account, such as the operator's own
stuck Gmail one, self-heal on its next verified sign-in. Nothing else UPDATEs
`approved` except the operator's `setAccountApproval`
(`web/lib/accountAccess.ts:96`).

## Hook ordering (M1, better-auth 1.7.6 exact-pinned)

Verified against installed source before any line was written
(`.autoforge/execution/M1-findings.md`):

- `user.create.after` fires **after commit, with the `account` (provider) row
  already present**: `create.after` is queued, not awaited inline
  (`db/with-hooks.mjs:34`), and pending hooks drain after
  `adapter.transaction` resolves (`@better-auth/core/dist/context/transaction.mjs:78-85`),
  while user and account are created inside one transaction
  (`oauth2/link-account.mjs:274-289`). M1 findings:42-44, :48-51. So the
  predicate's provider-row lookup is sound on the fresh-registration path, and
  it runs on a separate pool after commit, so it reads no uncommitted rows.
- `user.update.after` **does not fire** when a provider links to an already
  verified local Account: the user update is guarded by
  `!dbUser.user.emailVerified` (`oauth2/link-account.mjs:188`), and
  `applyUpdateUserInfoOnLink` is a no-op here (`link-account.mjs:189`). The
  pending-non-owner case this ticket must approve is exactly that shape. M1
  findings:67-74, :76-82.
- Therefore the third call site is `databaseHooks.account.create.after`
  (`db/internal-adapter.mjs:594-600`), gated to `providerId === "supabase"`.
  It fires only when a provider row was just written, so a verified Account
  with no Papyrus row stays unapproved. `approveOnProviderLink`
  (`web/lib/accountAuth.ts:325`) is that hook.

This amended the plan's earlier "exactly two call sites" pin; the predicate
itself is unchanged.

## O1–O5 (operator silent; these defaults stand)

- **O1 — absent `email_verified` refuses.** Fail-closed on a strict
  `=== true`. Worth recording why it is reachable: genericOAuth maps
  `userInfo.data.email_verified ?? false` (`generic-oauth/index.mjs:52-59`), so
  an absent claim lands as `false`, never as `true`. M1 findings:132-134.
- **O2 — a fresh unverified Papyrus email creates nothing.** No `user` row, no
  `account` row, no Workspace row, and no Approval — owner email included; the
  owner bootstraps on a later verified sign-in. The refusal is a distinct
  `email_not_verified` code produced by a custom `user.validateUserInfo`
  returning `{ error }` for the `supabase` provider only (`refuseUnverifiedPapyrus`
  in `lib/accountAuth.ts`), which runs at `db/internal-adapter.mjs:147-167` —
  **before** the user insert, inside the transaction opened at
  `link-account.mjs:274`, so the rollback leaves zero rows. The built-in
  `requireEmailVerification` route was rejected for exactly that reason: it
  fires after `createUser` + `createAccount` have committed
  (`link-account.mjs:314-321`) and sends a verification email first. The code
  survives the redirect because `callback.mjs:191-193` forwards
  `APIError.body.code` verbatim into `?error=`. `account_not_linked` is a
  different site (`link-account.mjs:139-145`) and is untouched. M1 findings:88-124.
  Refusal copy ("Confirm your email first; check your inbox.") keys off that callback code (`email_not_verified`, or `account_not_linked` for the existing-Account case), never off `approved`, so a
  fresh refusal and a pre-341 pending Account stay distinguishable.
- **O3 — a verified Papyrus link to an existing pending non-owner approves.**
- **O4 — pre-341 pending rows self-heal.** No migration: a pending Account with
  a verified provider email is approved by its next sign-in (see One writer).
  Superseded the first draft, which left them for manual approval.
- **O5 — open registration with no per-email throttle is accepted.** Anyone with
  a Papyrus account and a verified email reaches a Workspace. The ceiling is
  recorded, not built: at the point that matters, a per-email or per-Workspace
  creation rate limit belongs here, and until then the honest bound is operator
  cost of `setAccountApproval` plus `u-<id>` Workspace rows.

## Sign-out reaches Papyrus in Papyrus mode

`signOutToHome()` stays a zero-argument seam: `signOut({disableRedirect:true})`
and then the mode is read from `GET /api/papyrus-sign-out` (`{enabled}`, true
only when the Supabase trio is set; the client cannot know the server env).
Navigation is in the `finally`, so the departure still happens if either call
throws. `lib/papyrusSignOut.signOutDestination` is the whole mapping:

| Deployment | Target |
|---|---|
| Supabase trio set | `https://papyrus-ai.net/sign-out?next=<origin>/` (production: `https://missions.papyrus-ai.net/`) |
| anything else | `/` |

The client `signOut` deletes only the current session
(`api/routes/sign-out.mjs:44-54`) and offers no genericOAuth logout URL
(`sign-out.mjs:56-60`), so the provider has to be visited in the browser. The
`papyrus-ai.net/sign-out` route is provided by papyrus-home in a separate ticket.

## Consequences

**Legacy changes in one way only.** With the Supabase trio unset, construction
and sign-out (`/`) are unchanged (ADR 0023), but a verified Google or GitHub
Account is now approved rather than pending, per the amendment above. Legacy
e2e identities that must stay pending are marked `emailVerified: false`; the
Supabase e2e's first test changed from "pending" to "approved".

**The `CONTEXT.md` Approval entry is now qualified.** "The operator's
decision" is exact only for an unverified email; the entry says so
in one sentence rather than the glossary being wrong for one mode. The term
itself, and its _Avoid_ list, are unchanged — an automatic approval is still
not "verification", not "activation", not a "whitelist".