# Working tickets with Claude Code subagents

Status: in use from 2026-09-26. It replaces the opencode trial (#196, #200,
#202), which was stopped before it proved itself: every piece of work now runs
inside Claude Code, with cheaper models for the parts that do not need the
most capable one.

Every piece of work still goes through a ticket, so every change traces to an
issue and a pull request.

## Roles

| Who | Model | Does |
|---|---|---|
| **Operator** | | Decides scope, and judges anything that is a matter of taste |
| **Orchestrator** | Opus | Picks the frontier, writes each worker's brief, gives the final verdict, merges |
| **Discovery** | Haiku | Finds the files, callers and tests a ticket touches; returns paths and lines, no judgement |
| **Planner, critic** | Sonnet | For a ticket too big to start on directly: one plans, a second attacks the plan before any code |
| **Worker** | Sonnet | One per ticket, in its own git worktree: builds test-first, runs the checks, pushes a branch |
| **Reviewer** | Sonnet | Fresh context, never the worker: the diff against the ticket's acceptance criteria, and against this repository's standards |
| **Validator** | Haiku | Re-runs the checks on the pushed branch; reports pass or fail with the shortest failing line |
| **UI critic** | Sonnet | Screenshots at 375 × 812 and 1440 × 900 with Playwright, judged with the impeccable and taste skills |

Haiku only runs things and reports on them. It never writes code and never
reviews it.

## The loop

```
tickets (to-tickets skill, ready-for-agent)
  → 1 pick      frontier: open, ready, every blocker closed, files don't overlap
  → 2 build     worker in a worktree, branch per ticket; planner and critic first if the ticket is big
  → 3 check     reviewer and validator; UI critic for anything on screen
  → 4 fix       findings go back to the same worker; after three failed rounds the operator hears why
  → 5 land      the orchestrator opens the pull request and merges; "Closes #N" closes the ticket
```

## This repository's rules

- **Base branch**: `main`.
- **Who merges**: the orchestrator, once its review passes and the checks are
  green, in the order the tickets' "Blocked by" implies (operator's decision,
  2026-09-25). A ticket whose result is a matter of taste is shown to the
  operator before it merges.
- **Checks**: `npm test`, `npm run lint` and `npm run build` in `web/`; the
  `--selftest` of every script a change touches; whatever the ticket adds.
- **Parallel workers**: only on tickets whose "What to build" names different
  files.
- **Tickets the loop does not take**: those labelled `ready-for-human`, and
  research tickets marked deferred (#195).

## Cloud sessions

A Claude Code session on the web starts in a fresh container. `.claude/settings.json`
declares the plugins every session gets: caveman, ponytail, impeccable,
taste-skill, frontend-design and Matt Pocock's skills.
`.claude/hooks/cloud-setup.sh` runs at startup in cloud sessions only and
installs any of them the session did not install by itself.

A cloud session has no GPU, no Blender and no golden Capture, so tickets that
render or reconstruct (the Showcase Pipeline, anything on the 4070) run on the
compute host.

GitHub goes through the GitHub connector. The session's proxy refuses
GitHub's GraphQL API, so `gh pr create`, `gh issue view` and the rest of gh's
porcelain fail in a cloud session.
