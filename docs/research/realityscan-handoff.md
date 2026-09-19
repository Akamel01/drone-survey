# Handoff — RealityScan evaluation, cloud session → local session

Written 2026-09-19 by a Claude Code **web/cloud** session on branch
`claude/cool-ptolemy-deu71j`. Addressed to a local session that has the
project's plugins, skills and `CLAUDE.md`.

```
git fetch origin claude/cool-ptolemy-deu71j
git checkout claude/cool-ptolemy-deu71j
```

## Why this handoff exists

The cloud session hit a hard constraint it could not work around, and the
local session probably does not have it.

**The cloud environment's egress policy returned HTTP 403 for every primary
source**: `dev.epicgames.com`, `rshelp.capturingreality.com`,
`capturingreality.com`, `forums.unrealengine.com`, `web.archive.org`, and
text-extraction proxies. Only `github.com` and `WebSearch` were reachable.
`WebSearch` returns search-engine summaries of pages, not the pages.

Consequence: **every documentation-derived claim in the existing work is
`SUPPORTED` at best. Nothing is `VERIFIED`.** The user's brief demanded
evidence tiers, and the tier the decision deserves was not reachable.

**The single highest-value thing the local session can do is re-verify the
primary sources by actually opening them.** If your egress is unrestricted,
that converts a hypothesis into a finding.

## What exists on the branch

| File | What it is | Confidence |
|---|---|---|
| `docs/research/realityscan-2026-09-19.md` | Index + executive conclusion | — |
| `docs/research/realityscan-gates-2026-09-19.md` | GO / CONDITIONAL GO / NO-GO thresholds | Written **before** any findings; sound as-is |
| `docs/research/realityscan-domain-model-2026-09-19.md` | Domain model, reconciled against `CONTEXT.md` | Written before findings; sound as-is |
| `docs/research/realityscan-capability-map-2026-09-19.md` | All 18 domains, per-capability tables | **All `SUPPORTED` — needs verification** |
| `docs/research/realityscan-architecture-2026-09-19.md` | Architecture, replacement matrix, boundary, roadmap, gaps | Reasoning sound; rests on the above |
| `docs/research/realityscan-validation-2026-09-19.md` | Risk-focused validation program, tiers 1–4 | Sound as-is |
| `scripts/measure/realityscan-probe.py` | Tier-1 probe. `--selftest` passes | Runnable now |

Method: eight parallel sonnet sub-agents, one per capability cluster, each
required to tag every claim and cite a URL. Their raw reports were written to
the cloud session's scratchpad and are **gone** — the container is ephemeral.
The capability map is the surviving synthesis.

## Current conclusion, and how much to trust it

**CONDITIONAL GO on narrow adoption; NO-GO on wholesale replacement; neither
safe to act on until tier-1 tests run.**

Three load-bearing findings:

1. **RealityScan's headless mode is replay of GUI-authored configuration.**
   Export settings come from XML written by the GUI Export dialog; ortho
   parameters from a `.rcortho` the GUI writes. The Linux build is reported
   CLI-only with no desktop UI. Therefore a **Windows GUI seat is a permanent
   component**. This is `INFERRED` from two `SUPPORTED` facts — it is the most
   important claim in the evaluation and the least directly evidenced.
2. **Headless reconstruction may not work on Linux at all.** Reports of
   `-calculateNormalModel` hanging indefinitely or failing with "No model is
   selected" with no display server; Epic reportedly steers headless users to
   the **Remote Command Plugin (gRPC/REST)**. Unverified. Decides everything.
3. **The best adoption is the smallest.** `-exportRegistration` → COLMAP
   format would replace the pose provider for the splatting pipeline, fixing
   the defect ADR 0004 records (principal point forced to image centre,
   degrading silently). Isolated and independently shippable.

One thing **is** `VERIFIED`, by a fetch that succeeded:
`github.com/EpicGames/RealityScan` is **not** the engine, SDK or CLI source —
it is `pano2views`, an ~8-file JS/WebGL panorama-to-cubemap converter. The
brief assumed it might hold the engine. It holds nothing relevant.

## What the local session should do, in order

### 1. Verify the primary sources (highest value)

Open these **directly** — not via search — and record for each whether it
resolved:

- `https://dev.epicgames.com/documentation/realityscan/all-commands`
- `https://dev.epicgames.com/documentation/realityscan/keys-and-values`
- `https://dev.epicgames.com/documentation/realityscan/command-line-operations`
- `https://dev.epicgames.com/documentation/realityscan/rscmd-command-file`
- `https://dev.epicgames.com/documentation/realityscan/installation-linux`
  — **confirm this page exists at all**
- the Remote Command Plugin / REST / gRPC documentation
- `https://rshelp.capturingreality.com/` — headless mode page
- the RealityScan EULA and current pricing

Then **re-tag the capability map**, promoting `SUPPORTED` → `VERIFIED` where a
page confirms it and **demoting anything the docs contradict**. Demotions are
the valuable output; do not let the existing text anchor you.

### 2. Close the named documentation gaps

In priority order — these are listed in the architecture doc §7:

1. **The literal `-set` key strings.** Every human-readable setting label is
   known and not one exact key is. This is the entire configuration surface
   and the largest single gap.
2. Exact CLI verbs for: GCP/control-point import, `-exportReport`, the
   LoD/Cesium-3D-Tiles export (**if this one is GUI-only, domain 13 drops out
   of the automated pipeline**).
3. Whether **checkpoints** — control points excluded from the solve — are
   supported. Without them there is no independent accuracy evidence and no
   survey-grade claim is possible.
4. Whether **paRSer ships a real JSON sample**. The QA architecture assumes
   JSON emission is achievable.
5. Whether **`.rcortho` and the export XML are hand-writable.** A yes shrinks
   the Windows dependency to bootstrapping and materially improves the design.
6. Any vendor statement on **determinism**. None was found anywhere. Phase 2
   (cross-date comparison) depends on the answer.

### 3. Run the skills the user will trigger

The user will invoke `/grill-with-docs`, `/wayfinder` and `/domain-modeling`
themselves — **they are not installed in the cloud session**, so their intent
was applied by hand and the outputs have not been through the real skills.

- **`/grill-with-docs`** — point it at the capability map. Its job is to
  attack every `SUPPORTED` claim now that the docs are reachable. Assume the
  cloud session was wrong somewhere; find where.
- **`/wayfinder`** — the architecture doc is a first pass written without
  verified inputs. Re-derive the topology once the docs are confirmed,
  especially the CLI-vs-Remote-Command-Plugin boundary.
- **`/domain-modeling`** — the domain model deliberately extends `CONTEXT.md`
  rather than adopting the brief's entity list verbatim (Dataset *is* Capture,
  Processing Stage *is* Node). **Preserve that reconciliation**; a parallel
  vocabulary would be worse than no model.

### 4. Only then, run tier 1

`python3 scripts/measure/realityscan-probe.py --selftest` works now. The real
run needs a RealityScan binary and images:

```
python3 scripts/measure/realityscan-probe.py \
  --images <capture>/images --workdir /tmp/rs-probe --rs <path-to-RealityScan>
```

It refuses to build an invocation without `-set "appQuitOnError=true"` (without
which a failed command exits 0), kills hangs rather than waiting on them, and
opens every claimed artifact with a reader that did not write it. A blocked
probe never reads as a pass.

## Things not to undo

- **Gates and domain model were written before any findings were read**, on
  purpose, so thresholds were not fitted to the answer. Revise them only on
  their merits, never to make a result fit.
- **The writer must never be the validator.** Every artifact-level QA check is
  ours, via independent readers. This repo has already measured an engine
  exiting cleanly with a 934-face mesh and an 87%-empty orthophoto.
- **`appQuitOnError=true` in every invocation**, enforced in code.
- **Never point the engine at the canonical image store** — a third-party
  report says RealityScan rewrites and relocates XMP sidecars in the input
  folder. Always a job-scoped copy; the cost is one copy either way.
- **`-selectMaximalComponent` silently discards everything else.** Gate on the
  selected component's *share* of registered images, not component count alone.

## The recommendation that outlived the question

Build the QA subsystem — CRS plausibility check, independent-reader artifact
validation — **regardless of the RealityScan decision**. It is
engine-independent, it closes a hole the current pipeline demonstrably has,
and it was the highest-value finding of the whole investigation.

## Open question for the user

The cloud session used sonnet sub-agents via the Agent tool rather than remote
child sessions, because remote sessions' reports cannot be collected directly.
If the local session has working child-session delegation and the user wants
that shape, it is available there.
