# Working tickets through opencode

Status: in trial from 2026-09-25 (#196). Documented here until it has proved
stable and reliable; see [Proven when](#proven-when).

Claude Code orchestrates and opencode does the work. The point is to spend the
orchestrator's tokens on judgement (what to build, whether it is right) and the
free models' tokens on the building. Every piece of work goes through a ticket,
so every change traces to an issue and a pull request.

## Roles

| Who | Does |
|---|---|
| **Operator** | Decides scope, judges anything that is a matter of taste, and merges during the trial |
| **Claude Code** (orchestrator) | Writes tickets, picks the frontier, dispatches, reviews each pull request against its ticket, sends changes back, lands |
| **opencode** (worker) | One session per ticket, running `/autoforge`: reads the ticket, plans, builds, tests, and opens one pull request that closes it |

The orchestrator never does a ticket's work itself. When opencode cannot finish
a ticket, the orchestrator writes why on the ticket and tells the operator.

## Models

opencode uses these models in this order. When one runs out of tokens, the same
session continues on the next, so no context is lost:

1. **Muse Spark 1.3 free**, from OpenCode Zen: `opencode/muse-spark-1.3-contributor-free`
2. **DeepSeek V4.1 Flash**, from OpenCode Go: `opencode-go/deepseek-v4.1-flash`

Every call starts at the first model again, because free quotas reset and a
model that is still exhausted fails in seconds. The order lives in one place:
the `OC_MODELS` default in `dispatch.sh`. `/autoforge` normally pins its child
agents to other models; the dispatch prompt overrides that for the run, without
editing opencode's own configuration.

## The loop

```
tickets (to-tickets skill, ready-for-agent)
  → 1 pick      frontier: open, ready, every blocker closed, files don't overlap
  → 2 dispatch  dispatch.sh <issue> [base] — worktree oc/<issue>, opencode /autoforge
  → 3 review    PR against the ticket's acceptance criteria; feedback → same session
  → 4 land      merge (operator during the trial); "Closes #N" closes the ticket
```

Each step's inputs, job, outputs and human check are in the skill's
`CONTEXT.md`.

## Where things live

The framework is organised the ICM way (the `icm-architect` skill): a small
entry file that routes, a contract per step, reference material apart from
the work, and state kept as files, never only in a conversation.

| What | Where | ICM role |
|---|---|---|
| The skill: `SKILL.md` (entry and routing), `CONTEXT.md` (the four steps) | `~/.claude/skills/opencode-orchestrate/` | Catalog, contract |
| The dispatch prompt | `…/templates/prompt.md` | Factory |
| `dispatch.sh`, `status.sh` | `…/scripts/` | Factory |
| One run: `prompt.md`, `events.jsonl`, `log`, `session`, `model`, `status` | `~/.opencode-runs/<owner>-<repo>/<issue>/` | Product, one record per ticket |
| The ticket's working copy, branch `oc/<issue>` | `~/.opencode-runs/<owner>-<repo>/<issue>/worktree/` | Product |
| `/autoforge`'s own notes | `.autoforge/` in that worktree, kept out of git by the repo's `info/exclude` | Product |
| Tickets and pull requests | GitHub | State |

A run's state can be read without opening anything but its folder: `status`
ends as `pr <url>`, `stopped, no pull request`, `failed <code>` or
`exhausted`. `status.sh` prints one line per run.

The skill lives under `~/.claude/skills/` so it works in any repository with a
GitHub remote. That folder is not under version control. Once the framework has
proved itself it moves to a repository of its own.

## This repository's rules

- **Base branch**: `main`. Until the planning pull request #175 merges, the
  UI theme and Showcase tickets are cut from its branch
  (`claude/ui-redesign-video-specs-e0a912`), because their "Read first"
  documents are there. Their pull requests still target `main`.
- **Who merges**: the operator, during the trial. The orchestrator reviews
  first and says what it checked.
- **Checks**: `npm test`, `npm run lint` and `npm run build` in `web/`; the
  `--selftest` of every script a change touches; whatever the ticket adds.
- **Parallel runs**: only tickets whose "What to build" names different files.
- **Tickets opencode does not take**: those labelled `ready-for-human`, and
  research tickets marked deferred (#195).

## Proven when

- Ten tickets have landed through it, and at most one of them needed more than
  one round of review feedback.
- A model switch has happened for real, mid-ticket, and the session carried on.
  Until then the token-exhaustion check matches on wording, not on a message
  seen in practice.
- No run has lost its state: each can be resumed from its folder alone.

Then the skill moves to its own repository and this document becomes a pointer
to it.

## Known limits

- `/autoforge` runs its full lifecycle even for a small ticket: discovery,
  grilling, architecture, planning, critique, work, review and validation. It
  is slow, but it runs on free tokens.
- A fresh worktree has no `node_modules`; the session installs them.
- A run is non-interactive. When a ticket needs the operator, the session
  writes the question on the ticket and stops. The orchestrator relays it.
