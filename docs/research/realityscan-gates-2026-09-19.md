# RealityScan adoption — decision gates

Written **2026-09-19, before any research findings were read**, so that the
thresholds are not fitted to the answer. Evidence arrives after this file.

Scope: RealityScan as the core engine of the automated post-flight pipeline,
replacing OpenDroneMap (`solve`, `reconstruct`, `export-cog`) wherever it is
equivalent or better. LiDAR is out of scope for this phase.

## How the gates combine

Three states: **GO**, **CONDITIONAL GO**, **NO-GO**.

A gate marked *critical* forces **NO-GO on its own**, regardless of how every
other gate scores. There is no aggregate that rescues a critical failure — that
is the whole point of marking it.

A non-critical miss degrades the verdict to CONDITIONAL GO and must carry a
named mitigation, a named owner, and a documented limitation. CONDITIONAL GO
without a written mitigation is NO-GO.

## A. Blocking preconditions (critical)

These are not quality measures. Any one of them failing ends the evaluation.

| # | Gate | GO | NO-GO | Critical |
|---|---|---|---|---|
| A1 | Runs headless on Linux, or in a container we can run on Ubuntu 24.04 | Unattended run completes with no GUI session | GUI session required, or Windows-only with no supported path | yes |
| A2 | Licence permits commercial, automated, server-side use | Written permission in the licence terms | Terms forbid it, or silence plus no vendor answer | yes |
| A3 | Licence permits export of georeferenced outputs at the tier we can afford | Georeferenced ortho/DSM/mesh export included | Export gated behind a tier above budget | yes |
| A4 | Total cost of ownership at our volume | ≤ CAD 500/yr | > CAD 2,000/yr | yes |
| A5 | Fits 12 GB VRAM for a standard Capture, or degrades gracefully | Standard Capture completes locally | Requires > 24 GB for a standard Capture | no |
| A6 | Machine-readable success/failure per stage | Exit codes or parseable artifact, distinguishing success from silent partial output | Success cannot be distinguished from a bad result without a human | yes |

A4 is set against the existing constraint that software spend is approximately
zero (`docs/design.md` §2). A tool that is technically superior and costs more
than the business earns is still a NO-GO.

A6 is critical because of measured history in this repo: ODM once exited
cleanly having produced a 934-face mesh and an 87%-empty orthophoto, and
NodeODM reported success while writing a COG that failed GDAL's validator
(`docs/design.md` §4). A replacement engine that cannot be gated any better
than that buys nothing.

## B. Automation and reliability

| # | Gate | GO | CONDITIONAL GO | NO-GO | Critical |
|---|---|---|---|---|---|
| B1 | Unattended completion rate, standard Captures | ≥ 95% | 85–95% | < 85% | no |
| B2 | Crash rate | ≤ 2% | 2–10% | > 10% | no |
| B3 | Timeout rate at 3× expected runtime | ≤ 2% | 2–10% | > 10% | no |
| B4 | Manual intervention rate | ≤ 5% of jobs | 5–20% | > 20% | yes |
| B5 | Restart/resume after interruption | Resumes from last completed stage | Resumes only from stage boundaries we impose externally | Must restart from zero | no |
| B6 | Recovery success rate once resumed | ≥ 95% | 80–95% | < 80% | no |
| B7 | Duplicate execution is safe | Re-running a stage is idempotent | Idempotent only with external guards | Corrupts prior output | no |
| B8 | Concurrent jobs on one host | Supported or cleanly refused | Refused only by our lock | Silent corruption | no |

B4 is critical: the stated primary goal of the system is automation
(ADR 0015). An engine needing a human on one job in five is not a replacement
for one that does not, whatever its output quality.

B5 is deliberately non-critical — the existing Runner already provides
stage-level resume by splitting a long engine run into separately-resumable
Nodes, so an engine without native checkpointing can be wrapped the same way.

## C. Output completeness and integrity

| # | Gate | GO | CONDITIONAL GO | NO-GO | Critical |
|---|---|---|---|---|---|
| C1 | Output completeness — every declared artifact present | 100% | ≥ 98% with detection | < 98%, or gaps undetectable | yes |
| C2 | Invalid-output rate (file written but unusable) | ≤ 1% and always detected | ≤ 5% and always detected | Any undetected invalid output | yes |
| C3 | Coordinate-system correctness | 100% of outputs carry the expected CRS, verified by an external reader | — | Any silent CRS mismatch | yes |
| C4 | Georeferencing actually embedded, not assumed | GDAL/PDAL reads the CRS from the file | Sidecar only, documented | Output is local-coordinate while claiming georeferenced | yes |
| C5 | Report correctness | Report values match independently computed values | Minor cosmetic divergence | Report states a quality the artifact does not have | yes |

C2, C3, C4 and C5 are critical and all say one thing: **a wrong answer that
looks right is worse than a failure.** These deliverables are sold. C5 in
particular guards against a report that passes a job the artifact fails.

## D. Reproducibility and performance

| # | Gate | GO | CONDITIONAL GO | NO-GO | Critical |
|---|---|---|---|---|---|
| D1 | Reproducibility — same input, same config, same host | Bit-identical, or geometric agreement within 1/10 of the accuracy claim | Agreement within the accuracy claim | Divergence exceeds the accuracy claim | no |
| D2 | Processing-time ratio vs current ODM pipeline | ≤ 1.0× | ≤ 2.0× | > 3.0× | no |
| D3 | Peak VRAM, standard Capture | ≤ 10 GB | ≤ 12 GB | > 12 GB locally | no |
| D4 | Peak RAM | ≤ 32 GB | ≤ 48 GB | > 48 GB | no |

D1 is non-critical but its NO-GO band is real: an engine whose output moves by
more than its own stated accuracy between identical runs cannot support a
before-and-after comparison, which phase 2 depends on.

D3/D4 are bounded by the host being shared with a production stack — a job
that overcommits takes that service down (`docs/design.md` §3), so the ceiling
is a hard operational limit, not a preference.

## E. Geometric and product quality

Two tiers, because the business sells **visual-grade** today and wants
**survey-grade** to become reachable (`CONTEXT.md`).

### E-visual — required now

| # | Gate | GO | CONDITIONAL GO | NO-GO | Critical |
|---|---|---|---|---|---|
| EV1 | Orthomosaic — visually complete | ≥ 99% of Site area filled, no seam artifacts at delivery zoom | ≥ 95%, artifacts outside the Site boundary | < 95%, or artifacts inside the Site | yes |
| EV2 | Point-cloud completeness | ≥ 95% of Site area covered at expected density | ≥ 90% | < 90% | no |
| EV3 | 3D-model quality | Manifold enough to load in target viewers; no holes > 1 m² inside the Site | Holes present outside the Site | Non-loadable or holed inside the Site | no |
| EV4 | Texture quality | No visible blur, ghosting or exposure seams at delivery zoom | Minor seams outside the Site | Ghosting on the subject | no |
| EV5 | Relative geometric consistency | Repeat measurement of a fixed baseline within 1% | within 2% | worse than 2% | no |

### E-survey — required only to claim survey-grade

| # | Gate | GO | CONDITIONAL GO | NO-GO | Critical |
|---|---|---|---|---|---|
| ES1 | Horizontal accuracy at checkpoints (RMSE) | ≤ 2× GSD | ≤ 3× GSD | > 3× GSD | yes for survey-grade |
| ES2 | Vertical accuracy at checkpoints (RMSE) | ≤ 3× GSD | ≤ 5× GSD | > 5× GSD | yes for survey-grade |
| ES3 | Checkpoint error is actually reported per point | Machine-readable per-point residuals | HTML only, scrapeable | Not obtainable | yes for survey-grade |
| ES4 | DSM quality | ≤ ES2 vertical threshold, no interpolation voids inside the Site | Voids present and flagged | Unflagged voids | no |
| ES5 | DTM quality | Bare-earth surface with documented classification | Classification external | No ground classification available anywhere in the stack | no |

Failing an E-survey gate does **not** force overall NO-GO. It forces the
conclusion "adequate for visual-grade, cannot support survey-grade", which is
exactly the current position and therefore not a regression.

## F. Capability coverage

Of the 18 in-scope capability domains, each is scored: native and scriptable /
native but GUI-only / external tool required / not available.

| # | Gate | GO | CONDITIONAL GO | NO-GO | Critical |
|---|---|---|---|---|---|
| F1 | Domains that today's pipeline covers | All covered at parity or better | One covered worse, with mitigation | Any covered worse with no mitigation | yes |
| F2 | Domains newly required by the target pipeline | ≥ 80% native-and-scriptable | ≥ 60% | < 60% | no |
| F3 | GUI-only operations on the critical path | Zero | Zero, after redesign around them | Any GUI-only step the pipeline cannot avoid | yes |

F3 is critical and is the sharpest test in this document. A single unavoidable
GUI step ends full automation, which is the system's primary goal.

F1 is critical for a reason worth stating: this is a **replacement** decision,
not a greenfield one. An engine that is better at twelve things and worse at
one we already ship is not automatically an improvement.

## Evidence standard

No gate may be marked GO on `INFERRED` evidence alone. A gate resting on
`REQUIRES TEST` is CONDITIONAL GO at best until the test is run, and the test
must be named in the validation matrix.

A capability may not be recorded as available because the GUI can do it, because
a competitor can do it, or because a forum post says so.
