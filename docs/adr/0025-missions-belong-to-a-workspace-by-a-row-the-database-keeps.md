# A Mission belongs to a Workspace by a row the database keeps; no row means the operator's

Until #244 the planner had one credential, a passphrase shared by everyone who
had it, and every Mission in the store was visible to every holder. Accounts
(ADR 0023, 0024) gave each person a Workspace, but the Missions themselves live
in B2 (ADR 0021) and the Linux host reads that layout directly (ADR 0019), so
changing the store to carry an owner would have reached the host.

## Decision

**Ownership is a table in the account database, `mission_workspace`
(mission id, Workspace id), written when a Mission is created.** The B2 layout
and the Mission record do not change; the host is untouched.

**A Mission with no row belongs to the operator's Workspace** (the verified
`OWNER_EMAIL` Account's, slug `OWNER_WORKSPACE_SLUG`, default `operator`).
Every Mission from before #244 stays the operator's with no data migration.

**One gate, one scope.** Every planner route asks `requireCaller`
(`web/lib/accountAccess.ts`) and nothing else: no session is a 401, a pending
Account a 403, an approved one becomes the Caller (its Workspace). The Mission
lifecycle (`web/lib/missionLifecycle.ts`) is the only place that narrows by
Workspace: states are derived over the whole store, then cut to the Caller's
Missions, so a Mission outside the Workspace is a 404 (never a 403: its
existence does not leak). Names, Sites and supersession are per Workspace.

**The Controller stays the operator's.** The Card Ledger and the host's notices
are about one physical Controller. A Card holding is shown only to the
Workspace whose Mission holds it (a holding with no Mission id counts as
unowned); the host's report and the list of unreadable records go only to the
operator's Workspace. Reservation still draws from the one shared pool.

**No foreign key to the Workspace.** Removing an Account deletes its Workspace;
its Missions then belong to nobody rather than blocking the removal or falling
to the operator.

**The row is written before the Mission.** A Mission that landed in B2 with no
row would be the operator's; an orphan row for a Mission that never landed is
harmless.

## Consequences

- The passphrase, its header and `DISPATCH_SECRET` are gone; the session cookie
  is the only credential, sent by the browser itself.
- Rolling back is reverting the change and keeping `DISPATCH_SECRET` set: the
  old code ignores the table. Missions made by other Workspaces in between
  would then show to every passphrase holder.
- Several Workspaces sharing one Controller's Cards, inviting people into a
  Workspace, and what happens to a removed Workspace's Missions are not
  specified (#239).
- Each call reads the whole ownership table; read only the rows that matter
  if it grows large.
