# The planner is the only push sender; the host asks it to send

#232 decided that the phone is told when a Mission changes by Web Push from
the installed app, with ntfy.sh as the fallback, and split the senders: the
planner's routes for what the planner changes, the Linux host for what only it
sees. The research behind it sketched the host holding the VAPID private key
and sending with `pywebpush`, and a subscription registry in the store.
Building it (#319) changed two of those parts.

## Decision

**The planner sends every notice; the host only reports.** The host POSTs
`{event: "collected" | "loaded" | "refused", ...}` with Spec keys and Card
names to `/api/push/host`, carrying `x-push-token` (the planner's
`PUSH_HOST_TOKEN`, the host's `~/.config/wayfinder/push.env`). The planner
looks the keys up in the Missions it already reads, words the notice in the
glossary's terms, and sends it to the owning Workspace. So:

- the VAPID private key lives in one place, the Vercel environment;
- the host stays stdlib-only (ADR 0016) — no `pywebpush`, no `cryptography`;
- the words live in one module (`web/lib/push.ts`), not in two languages;
- the host never needs to know which Workspace a Mission belongs to (ADR 0025).

The token can make the planner send notices and nothing else: the route reads
Missions to word them and writes nothing to the store.

**Subscriptions are rows in the account database (`push_subscription`), not
a store file.** They belong to an Account (#244), the database was already
there, and it has the compare-and-swap the store lacks — the per-sender
dedupe files the research needed to avoid read-then-write races are not needed
when nothing is written to the store.

**Sending is bookkeeping, never the operation.** A Dispatch or a Load never
fails because a phone was not told: the planner sends after it answers
(`after`), the host prints one line and carries on. A device the push service
has forgotten (404/410) is deleted. The host says a repeated refusal once per
half hour, as it already did for the manifest.

**What is told.** Dispatched, Withdrawn and Superseded (the ticket asks for
Dispatched too, where the research would not have told an operator their own
action — the field device cannot tell who pressed it); Collected; Loaded, naming
the Card to open; a Load refused, to the operator's Workspace only. Flown is
never announced.

## Consequences

- If the planner is down, the host's notices are lost (printed in the cron
  log). The manifest still carries the state, and the app shows it on open.
- Rotating the VAPID pair turns every device off until it is turned on again;
  rotating `PUSH_HOST_TOKEN` is two env edits.
- The iPhone half is still vendor statements, not a device: the field test in
  the #232 research settles it.
