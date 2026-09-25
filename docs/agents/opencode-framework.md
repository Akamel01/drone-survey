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
| **Operator** | Decides scope and judges anything that is a matter of taste |
| **Claude Code** (orchestrator) | Writes tickets, picks the frontier, dispatches, reviews each pull request against its ticket, sends changes back, and merges |
| **opencode** (worker) | One session per ticket, running `/autoforge`: reads the ticket, plans, builds, tests, and opens one pull request that closes it |

The orchestrator never does a ticket's work itself. When opencode cannot finish
a ticket, the orchestrator writes why on the ticket and tells the operator.

## Models

| | Muse Spark 1.3 free | DeepSeek V4.1 Flash |
|---|---|---|
| Provider, id | OpenCode Zen, `opencode/muse-spark-1.3-contributor-free` | OpenCode Go, `opencode-go/deepseek-v4.1-flash` |
| Cost | Free | $0.15 in / $0.60 out per million tokens, against Go's quotas |
| Quota | Daily | 5-hour, weekly and monthly |
| Window, output | 1M, 131k | 1M, 384k |
| Strengths | Reasoning; reads images, video and PDF, so it can check UI screenshots itself | Reasoning up to "max"; very large output; reads images |
| Used | Every session while it has quota | Only while Muse is out |

**The rule: Muse whenever it is available, otherwise DeepSeek.** Each call to
`dispatch.sh` takes the first model in the registry that is not marked out of
quota. When a model runs out mid-ticket, the same session continues on the
next one, so no context is lost.

**Quota memory.** A model that runs out is marked in
`~/.opencode-runs/_models/` with the time it is worth trying again, and the
provider's message. Reset times are not published, so the quota cycle sets how
often to probe rather than a predicted reset:
- Muse: every 60 minutes.
- DeepSeek: every 30 minutes; 12 hours when its message says weekly, 24 hours
  when it says monthly.

When every model is out, dispatch waits for the earliest probe instead of
failing. `status.sh` lists which models are out and until when.

**The watcher.** A limit can be hit by the ticket's main session or by any of
its autoforge child sessions, and in the middle of a run. `watch.py`, one per
machine and started by `dispatch.sh`, tails opencode's own log
(`~/.local/share/opencode/log/opencode.log`), where every session, main or
child, reports its provider errors with the model that failed:
- An explicit quota message ("quota", "daily", "usage limit", "credits", a
  region or plan refusal) marks the model at once.
- Rate-limit and outage errors mark it only when they keep coming for 15
  minutes. Throttling is normal under load: on 2026-09-25 three parallel
  sessions logged 11 `Rate limit exceeded. Please retry after a brief wait.`
  errors on Muse in ten minutes, and all of them cleared through opencode's own
  retry.

On a mark, the watcher stops every `opencode run` on that model. Each
`dispatch.sh` sees the mark and continues its session on the next model. Its
decisions are logged in `~/.opencode-runs/_models/watch.log`, and
`python3 watch.py --selftest` tests them without spending tokens.

**Capabilities.** The registry (`models.json` in the skill) holds each model's
window, output limit, reasoning variant (`high` for both) and strengths.
autoforge's own registry has both models too, so its per-task budgets use their
real 1M windows (an 80k cap) instead of a 19k fallback.

**Every autoforge role inherits the session's model.** Five of its agents used
to pin `gpt-5-nano`. The pins were removed and its model policy says `inherit`,
so child agents follow the same quota rule as the session. A backup of the
earlier autoforge configuration is in `~/.config/opencode/_backup-2026-09-25/`.

## The loop

```
tickets (to-tickets skill, ready-for-agent)
  → 1 pick      frontier: open, ready, every blocker closed, files don't overlap
  → 2 dispatch  dispatch.sh <issue> [base] — worktree oc/<issue>, opencode /autoforge
  → 3 review    PR against the ticket's acceptance criteria; feedback → same session
  → 4 land      the orchestrator merges; "Closes #N" closes the ticket
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
| The model registry | `…/models.json` | Factory |
| Each model's quota state, and the watcher's log | `~/.opencode-runs/_models/` | Product |
| The quota watcher | `…/scripts/watch.py` | Factory |
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

- **Base branch**: `main`. (#177 and #179 were cut from the planning branch
  before #175 merged; #175 was merged with a merge commit so their diffs stay
  clean.)
- **Who merges**: the orchestrator, once its review passes and the checks are
  green, in the order the tickets' "Blocked by" implies (operator's decision,
  2026-09-25). A ticket whose result is a matter of taste is shown to the
  operator before it merges.
- **Checks**: `npm test`, `npm run lint` and `npm run build` in `web/`; the
  `--selftest` of every script a change touches; whatever the ticket adds.
- **Parallel runs**: only tickets whose "What to build" names different files.
- **Tickets opencode does not take**: those labelled `ready-for-human`, and
  research tickets marked deferred (#195).

## Proven when

- Ten tickets have landed through it, and at most one of them needed more than
  one round of review feedback.
- A model switch has happened for real, mid-ticket, and the session carried on.
  Until then the quota check matches on wording, not on a message seen in
  practice; the first real one gets pinned in `dispatch.sh`.
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
