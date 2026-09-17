# Mission status flows back through the same store

The Status tab answers "where is my mission" without ever reaching the field
host: the planner cannot open a connection to it (residential NAT, Tailscale
only), so the host reports into the store and the planner reads the store.
[ADR 0017](0017-mission-specs-through-object-storage-in-canada.md) chose the
store; this records what else lives in it and the one behaviour it changed.

## Decision

- **Drafts live at `specs/_drafts/<uuid>.json`.** A draft is a planner-side
  working copy with a server id: save, re-save by id, dispatch, delete.
  Re-saving updates only its own id, so two browsers never clobber each other.
  Delete removes the draft only; a Dispatched Spec from it stays immutable
  under `specs/` (ADR 0016 holds — supersession, never deletion).
- **The host manifest lives at `specs/_status/missions.json`.** One small JSON
  object keyed by Spec key: `collected_at`, and per verified Load `loaded_at`,
  `parts`, and `cards` (WAYFINDER name, mission name, waypoint count). The host
  is the manifest's only writer; the planner only reads. A missing manifest is
  "the host has not reported yet", never an error; a corrupt one degrades every
  Spec to Dispatched, never to nothing.
- **Both under `specs/`, underscore-prefixed, on purpose.** Store keys are
  confined to the `specs/` prefix, and Collect's Spec pattern only matches
  three-segment site/date/file keys — drafts and the manifest are invisible to
  Collect by construction, and no wider prefix was needed.
- **One plug-in Loads every waiting mission, oldest first**, each mission's
  parts into successive WAYFINDER cards. This replaces the old newest-wins
  rule (which silently skipped older unloaded Dispatches): supersession is the
  planner's visible job now, not the host's quiet guess. A queue that does not
  fit the cards is refused before any card is touched, and the refusal is
  written into the manifest so the tab shows it. A successful Load retires any
  past refusal.
- **Key scopes, amended.** The planner's key additionally needs `listFiles`
  and `readFiles`: drafts list, status join, and draft stamping all read.
  The host's status key carries `listFiles`, `readFiles`, `writeFiles` on the
  Specs bucket. B2 allows one name prefix per key, so its write scope covers
  `specs/` rather than just the manifest path — accepted because exactly one
  call site ever writes (`b2_status.upload_manifest`), and it writes exactly
  `STATUS_KEY`. Reports are bookkeeping, never the operation: without status
  credentials Collect and Load still succeed and say so loudly.
- **Freshness is cron-bound.** The host reports on Collect/Load runs (every
  minute while operating), so tab information lags reality by ~1–2 minutes.
  Waiting rows older than 15 minutes hint at an unplugged Controller or a
  quiet host; that is a hint, not an alarm.
