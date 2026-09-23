# RealityScan — risk-focused validation program

Written 2026-09-19, alongside the decision gates and before the capability map
was assembled. Gate references are to
[`realityscan-gates-2026-09-19.md`](realityscan-gates-2026-09-19.md).

## Why this program is unusually load-bearing

This environment's egress policy returns 403 for `dev.epicgames.com`,
`rshelp.capturingreality.com`, `capturingreality.com`,
`forums.unrealengine.com` and `web.archive.org`. Every documentation-derived
claim in this evaluation therefore rests on search-engine summaries of pages
nobody opened, and **nothing reaches `VERIFIED`**.

That is not a footnote. It means the tests below are not the usual
belt-and-braces confirmation of a documented design — for most rows, the test
*is* the evidence. A row marked `REQUIRES TEST` here should be read as "we do
not currently know this", not as "we are being careful".

The tests are ordered so that the ones which can end the evaluation run first
and cheapest. **Do not run tier 2 until tier 1 passes.** Building a pipeline
around an engine that cannot run unattended is the most expensive mistake
available here, and tier 1 costs about a day.

## Severity scale

| Severity | Meaning |
|---|---|
| **S1** | Fails a critical gate. Forces NO-GO on its own. |
| **S2** | Degrades to CONDITIONAL GO. Requires a named mitigation. |
| **S3** | Quality or efficiency concern. Documented, not blocking. |

"Auto-detectable" means: can our pipeline determine this failure occurred,
unattended, from artifacts or exit state — **without a human looking at the
output.** This column is the single most important one in the document. A
failure mode that is severe but detectable is manageable; a failure mode that
is mild but silent is not, because it reaches a client.

---

## Tier 1 — Existence tests (run first; any S1 failure ends the evaluation)

### T1.1 Headless execution with no display server

- **Setup**: Ubuntu 24.04 container, no X11/Wayland, no `DISPLAY`, SSH-only
  session. Run the smallest possible command sequence: add a folder of 20
  images, align, quit.
- **Dataset**: `golden-capture`, first 20 frames.
- **Config**: `-headless`, `-silent <dir>`, `-set "appQuitOnError=true"`.
- **Expected**: process exits 0 within 10 minutes, having written an
  alignment.
- **Pass criterion**: exits on its own. **A hang is a failure, not a slow
  pass.** Wall-clock timeout 30 minutes, enforced externally.
- **Severity**: **S1** — gate A1.
- **Residual risk**: passing at 20 images does not prove passing at 800; T1.2
  exists for that reason.
- **Mitigation if failed**: retry via the Remote Command Plugin (T1.3) before
  concluding NO-GO. Epic's own guidance reportedly points headless users
  there, so a bare-CLI failure is not yet a product failure.
- **Auto-detectable**: yes — external watchdog on wall-clock time.

### T1.2 Headless reconstruction, not just alignment

- **Setup**: as T1.1, continuing to `-calculateNormalModel`.
- **Rationale**: two independent reports describe alignment succeeding while
  reconstruction hangs or fails with a misleading "No model is selected" in
  headless Linux. Alignment passing tells us nothing about reconstruction.
- **Expected**: a model exists and is exportable.
- **Pass criterion**: exits 0; exported mesh loads in an independent reader
  (trimesh/CloudCompare) with > 0 faces.
- **Severity**: **S1** — gates A1, F3.
- **Residual risk**: the failure is reported as intermittent; one pass is not
  proof. Run 10×.
- **Mitigation if failed**: Remote Command Plugin; if that also fails,
  RealityScan cannot be the engine.
- **Auto-detectable**: yes — exit code plus independent mesh read.

### T1.3 Remote Command Plugin as the automation surface

- **Setup**: deploy the plugin per its documentation; drive the same sequence
  over gRPC or REST from a Python client.
- **Expected**: equivalent results to T1.1/T1.2, with process control
  (abort/pause/resume) working.
- **Pass criterion**: full sequence completes; abort actually aborts.
- **Severity**: **S1** if T1.2 failed (it becomes the only path), otherwise
  **S2**.
- **Residual risk**: plugin availability may be tied to a licence tier.
- **Auto-detectable**: yes.

### T1.4 Licence permits unattended, commercial, server-side use

- **Setup**: read the actual EULA text, not a pricing page summary. Confirm
  in writing: commercial use at our revenue, CLI/headless use, georeferenced
  export, and operation on a rented ephemeral GPU.
- **Expected**: all four permitted at a tier costing ≤ CAD 500/yr.
- **Pass criterion**: written vendor confirmation for anything the EULA
  leaves ambiguous. **Silence is a failure, not a permission.**
- **Severity**: **S1** — gates A2, A3, A4.
- **Residual risk**: terms change; re-check annually.
- **Auto-detectable**: no. This is a reading task with a human owner.

### T1.5 Activation survives an ephemeral machine

- **Setup**: activate, run a job, destroy the container, recreate, activate
  again. Repeat 5×.
- **Rationale**: a fresh machine ID per rented GPU is the normal case in this
  system's compute ladder, and floating-licence reactivation is reported to
  sometimes require interactive confirmation.
- **Pass criterion**: 5/5 activations complete with no interactive prompt.
- **Severity**: **S1** — gate B4. An interactive prompt on the rented rung
  means the rented rung does not exist.
- **Auto-detectable**: yes — the prompt manifests as a hang.

### T1.6 Failure is distinguishable from success

- **Setup**: deliberately break a run (corrupt half the images) and compare
  exit state against a good run.
- **Pass criterion**: exit code differs, **and** the bad run does not produce
  an artifact that passes our own validators.
- **Severity**: **S1** — gate A6.
- **Residual risk**: this is the exact failure ODM produced here — a clean
  exit with a 934-face mesh and an 87%-empty orthophoto. Assume the engine
  will do it too until shown otherwise.
- **Auto-detectable**: this test *is* the auto-detection check.

---

## Tier 2 — Input and data-integrity failures

| # | Test | Setup / dataset | Expected | Pass criterion | Sev | Auto-detect | Residual risk & mitigation |
|---|---|---|---|---|---|---|---|
| T2.1 | Corrupt images | 5% of frames truncated mid-file | Rejected at validation, before the engine | Corrupt frames named in a report; job continues or fails cleanly | S2 | yes | Engine may accept a partially-readable JPEG. Validate with an independent decoder at ingest, not the engine. |
| T2.2 | Missing images | Remove 10% at random | Alignment completes with a gap, or fails clearly | Coverage reported; gap detected | S2 | yes | Small gaps are invisible in aggregate stats. Mitigate with per-region coverage, not a global count. |
| T2.3 | Incomplete flight | Truncate the last 30% of a grid | Detected before processing | Planned-vs-actual photo count compared | S2 | yes | The planner knows the expected count; compare against it. Cheap and reliable. |
| T2.4 | Low overlap | Re-fly or subsample to ~50/40% | Degraded or split result, detected | Component count > 1, or coverage below threshold | S1 | yes | **Silent partial success is the danger**, not failure. Gate on component count. |
| T2.5 | Repetitive imagery | Large uniform surface (asphalt, roof) | Misregistration detected | Reprojection error and component checks | S1 | partly | Misalignment can look locally plausible. Checkpoints are the only real defence. |
| T2.6 | Poor lighting | Capture at low sun, hard shadows | Degraded texture, geometry intact | Texture QA flags; geometry passes | S3 | partly | Already mitigated upstream by fixed Cadence time-of-day. |
| T2.7 | Difficult surfaces | Water, glass, vegetation | Holes or noise, confined and flagged | Holes detected and located | S3 | yes | Expected behaviour, not a defect. Report rather than fail. |
| T2.8 | Incorrect EXIF | Strip/alter focal length on some frames | Detected at audit | `exif-audit` fails the job | S2 | yes | Existing node already covers this. Confirm the engine does not silently substitute a default. |
| T2.9 | Incorrect GPS | Inject a 500 m outlier into 2% of frames | Outlier rejected, not averaged in | Outlier flagged; poses unaffected | S1 | yes | An accepted outlier drags the georeference silently. Test explicitly. |
| T2.10 | Wrong coordinate system | Declare a CRS from the wrong UTM zone | Detected before export | Bounding box vs. EPSG plausibility check fails the job | S1 | **only if we build it** | **No native wrong-CRS detection is reported to exist.** We must build the sanity check. Until we do, this failure is silent and reaches the client. Highest-priority own-code item. |
| T2.11 | Bad GCPs | Mislabel one control point by 2 m | Residual flags it | Per-point residual exceeds threshold | S1 | yes, if residuals are machine-readable | Depends on T3.1. If residuals are HTML-only, this becomes manual. |
| T2.12 | Missing GCPs | Remove all control | Job completes as visual-grade, clearly labelled | Output must not claim survey-grade | S1 | yes | Model-level: `Survey Result` cannot exist without checkpoints. |
| T2.13 | Poor camera priors | Degrade prior accuracy | Solve still converges | Alignment stats within band | S3 | yes | — |
| T2.14 | Disconnected components | Fly two disjoint areas as one Capture | Multiple components reported, not silently merged or dropped | Component count and per-component share reported | S1 | yes | `-selectMaximalComponent` silently discarding 40% of a site is the exact failure to prevent. Gate on the share, not the count alone. |
| T2.15 | XMP sidecar mutation | Run with read-only input folder | Engine does not require write access to inputs | Input folder unchanged, or run isolated | S2 | yes | A third-party pipeline reports RealityScan relocating/rewriting XMP sidecars in the input folder. **Never point the engine at the canonical image store** — always a job-scoped copy. |

---

## Tier 3 — Output, QA and reporting

| # | Test | Expected | Pass criterion | Sev | Auto-detect | Notes |
|---|---|---|---|---|---|---|
| T3.1 | Machine-readable QA extraction | Alignment stats, reprojection error, GCP and checkpoint residuals obtainable unattended | Values parse without HTML scraping | S1 | n/a | If only an HTML report exists, the entire QA subsystem is scraping, which is brittle across versions. Investigate whether paRSer templates can emit JSON — that answer decides the QA architecture. |
| T3.2 | Checkpoint accuracy | Independent points hit gates ES1/ES2 | RMSE ≤ 2× GSD horizontal, ≤ 3× vertical | S1 for survey-grade | yes | Only meaningful with points excluded from the solve. |
| T3.3 | DSM validity | No unflagged interpolation voids | Voids detected via GDAL nodata analysis | S2 | yes | External check; do not trust the engine's own view. |
| T3.4 | DTM is actually bare earth | Ground classification verifiable | Compare against manually classified control area | S2 | partly | **Expected to fail.** The reported "DTM" is a scene-type heuristic, not ground classification. Plan for PDAL/external classification. |
| T3.5 | Orthomosaic quality | ≥ 99% filled, no seams at delivery zoom | Coverage via GDAL; seams by inspection during calibration | S1 | coverage yes, seams partly | Coverage is the ODM failure that bit before. Automate it first. |
| T3.6 | Point-cloud completeness | ≥ 95% Site coverage at expected density | Grid-cell occupancy via PDAL | S2 | yes | — |
| T3.7 | Mesh validity | Loads, manifold enough, no interior holes > 1 m² | Independent reader + hole analysis | S2 | yes | — |
| T3.8 | Texture validity | No ghosting on the subject | Blur/variance metrics + calibration-period review | S3 | partly | Honest limit: ghosting is hard to detect automatically. Calibration period, as with the splat gate. |
| T3.9 | Georeferencing is embedded | GDAL/PDAL reads CRS from the file itself | CRS present and correct in-file | S1 | yes | Gate C4. Sidecar-only is CONDITIONAL. |
| T3.10 | Output-file integrity | Every declared artifact present and readable | Independent reader opens each | S1 | yes | Gate C1/C2. |
| T3.11 | Report correctness | Report values match independently computed ones | Agreement within tolerance | S1 | yes | Gate C5. A report that passes a job the artifact fails is the worst outcome in this document. |
| T3.12 | Export-format reality | Each claimed format actually written and readable | Independent reader per format | S2 | yes | Several formats are import-only in the evidence (E57, possibly LAZ). Do not promise a format until a file has been opened. |

---

## Tier 4 — Operational resilience

| # | Test | Expected | Pass criterion | Sev | Auto-detect | Notes |
|---|---|---|---|---|---|---|
| T4.1 | Process crash mid-reconstruction | Detected; job marked failed | Non-zero exit or watchdog fires; no partial artifact published | S1 | yes | Artifact lifecycle forbids publishing unvalidated output. |
| T4.2 | Timeout / indefinite hang | External watchdog kills at 3× expected | Job fails cleanly, resources freed | S1 | yes | **Mandatory given the reported hangs.** The engine will not self-terminate. |
| T4.3 | Interrupted job (host reboot) | Resume from last completed Node | Resumes without redoing completed work | S2 | yes | Existing Runner already does stage-level resume. Engine-native `-continueModelCalculation` is a bonus, not a dependency. |
| T4.4 | Restart/resume correctness | Resumed output matches uninterrupted output | Geometric agreement within D1 | S2 | yes | Resume that silently produces different output is worse than no resume. |
| T4.5 | Duplicate execution | Re-running a completed Node is safe | Idempotent, or refused | S2 | yes | Runner lock covers concurrency; idempotence is per-Node. |
| T4.6 | Insufficient VRAM | Fails fast and clearly, or degrades | No multi-hour run ending in OOM | S2 | yes | Pre-flight sizing already required by design.md §3. |
| T4.7 | Insufficient RAM | Does not take down the co-hosted production stack | Memory ceiling enforced externally | S1 | yes | The host runs an unrelated production service. A job that overcommits is an outage, not a failed job. Enforce with cgroups. |
| T4.8 | Concurrent jobs | Refused or safe | No cross-job corruption | S2 | yes | Up to 4 local instances are reported supported; our Runner permits one. Keep it that way until tested. |
| T4.9 | Large dataset | 800+ images completes within D2 | Completes; resource ceilings respected | S2 | yes | The scaling question tier 1 cannot answer. |
| T4.10 | Determinism | Same input + config + host → same output | Within D1 | S2 | yes | **No vendor statement on determinism was found.** Assume non-deterministic until measured; phase 2 comparison depends on the answer. |
| T4.11 | Batch processing | N captures unattended overnight | ≥ 95% complete without intervention | S2 | yes | The real test of gates B1/B4. |

---

## Test data

| Dataset | Purpose |
|---|---|
| `golden-capture` | The existing known-good reference. Every test that needs a baseline uses it, so results compare across engines. |
| `golden-capture-20` | First 20 frames. Tier 1 only — cheap existence tests. |
| Degraded variants | Programmatically derived from `golden-capture` (corrupt, decimate, strip EXIF, inject GPS outliers, wrong CRS). Generated by script so they are reproducible, not hand-made. |
| Controlled site | A Site with surveyed Control Points *and* independent Checkpoints. **Required for T3.2 and therefore for any survey-grade claim.** This does not exist yet and is the long-lead item — it is a field task, not an engineering one, and should be started before the software work if survey-grade is wanted. |

## What this program deliberately does not test

- LiDAR ingestion and LiDAR-derived workflows — out of scope this phase.
- GUI behaviour of any kind. If a capability needs the GUI, it fails F3 and
  the pipeline routes around it; there is nothing to measure.
- Comparative aesthetic quality against ODM beyond the stated gates. Worth
  doing, but it is a preference question and must not be allowed to override
  a critical gate failure.
