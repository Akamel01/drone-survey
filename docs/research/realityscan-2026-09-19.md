# RealityScan as the core processing engine — evaluation

2026-09-19. Investigation into replacing the existing OpenDroneMap-based
pipeline with RealityScan as the core engine of an automated post-flight
aerial-survey system. LiDAR out of scope this phase.

Drafted by a cloud session with no access to the primary sources.
**Re-verified the same day by a local session against 82 official
documentation pages**, saved under [`sources/`](sources/).

## Documents

| Deliverable | Where |
|---|---|
| Decision gates (GO / CONDITIONAL GO / NO-GO) | [gates](realityscan-gates-2026-09-19.md) |
| Domain model | [domain model](realityscan-domain-model-2026-09-19.md) |
| Capability map, all 18 domains; automation and config reference | [capability map](realityscan-capability-map-2026-09-19.md) |
| Architecture, replacement matrix, engine/external boundary, roadmap, gaps | [architecture](realityscan-architecture-2026-09-19.md) |
| Risk-focused validation program | [validation](realityscan-validation-2026-09-19.md) |
| Primary sources, fetched and dated | [`sources/`](sources/) |
| Proof of concept | [`scripts/measure/realityscan-probe.py`](../../scripts/measure/realityscan-probe.py) |
| Cloud→local handoff, and what it resolved | [handoff](realityscan-handoff.md) |

The gates and the domain model were written **before** any findings were read,
so the thresholds are not fitted to the answer. Re-verification did not touch
them.

---

## Executive conclusion

**Verdict: CONDITIONAL GO on a narrow adoption. NO-GO on wholesale replacement.
The documentation questions are now settled; the execution questions are not,
and tier 1 still gates everything.**

### What re-verification changed

The first draft was written blind — 403 on every primary source, so every claim
was a search summary of a page nobody had opened. Those pages are now fetched
and saved. **Sixteen claims were contradicted** by the official documentation;
they are tabulated in the capability map's [Demotions](realityscan-capability-map-2026-09-19.md#demotions)
section. Three of them change the verdict's shape:

1. **The Windows GUI seat is not a permanent component.** Parameter XML can be
   authored from "the RealityScan UI (**Windows or Linux Wine**)", and the Linux
   build ships a UI — discouraged, not absent. More importantly the XML is
   **optional on every command that accepts one**: without it, "current settings"
   apply, and current settings come from 116 documented `-set` keys, 57
   per-selection keys, and a portable `settings.rcconfig`.
2. **Checkpoints exist and are scriptable** — `-editControlPointSelection
   "gpType=2"`, value `2 – Ground test`. The draft said their absence would make
   a survey-grade claim impossible. They are not absent.
3. **Cesium 3D Tiles has a CLI verb** — `-export3dTiles`. The draft called this
   "the highest-value unknown in the second tier"; domain 13 stays in the
   automated pipeline.

Smaller but real: the `-set` key strings the draft called "the single largest
practical gap" are fully documented; `-closeHoles`, `-cutByBox` and `-cleanModel`
exist, so mesh hygiene stays in-engine; `-dtmClassify` plus
`-setSelectedClassAsGroundForDTM` is a real classification workflow rather than a
scene-type dropdown; volumes are readable unattended through paRSer; and
`-exportComponent`, which the draft cited twice, **does not exist**.

### What RealityScan is

It is a **reconstruction engine, not a survey system**. That single sentence
still predicts most of the result, but the boundary moved: more of the
reconstruction-adjacent work (mesh cleanup, classification, contours,
cross-sections, volumes) is scriptable than the draft allowed. What remains
irreducibly ours is **validation, CRS correctness, and delivery formats** — and
that is where this system's value lives. No external tool in the current stack
becomes redundant; three (MeshLab, PDAL for ground filtering, raster volume
maths) become optional.

### The three findings that matter most, restated

**1. Headless automation is parameterised, with a GUI-authored fallback.** Not
replay. `-set`/`-preset`, four `-edit*Selection` commands and
`-importGlobalSettings` cover the settings surface; a `params.xml` covers what
only a dialog exposes, and can be authored on the same Linux host. The
per-job critical path has no GUI step, so gate F3 passes, and the CONDITIONAL
loses one of its two main reasons.

**2. Headless reconstruction still may not work reliably.** This is now the
single biggest open question. No Epic page addresses the third-party reports of
`-calculateNormalModel` hanging under headless Linux — but Epic *does* document
Docker with GPU passthrough, a REST server, a gRPC server and a passive
notification mode for running `.rscmd` pipelines in a container with no server
loop. That is evidence for the supported path, not proof the bare CLI is safe.
And the headless-mode page states plainly that most dialogs can be suppressed
with `-silent` or `appQuitOnError=true` **but "certain dialogs (e.g., the login
window) will still require user interaction"** — a container blocking on a login
window is indistinguishable from a hang. T1.2 runs first and it now has a
sibling: a licence/login test.

**3. The most valuable adoption is still the smallest one.** `-exportRegistration`
is a real command, `-importColmap` is a real command, and RealityScan's native
distortion model is `sfmDistortionModel`, **default `Brown3`** — which is exactly
the `projection_type == "brown"` that `principal_point_survived()` in
[`nodes/solve/solve.py:114`](../../nodes/solve/solve.py) demands. What the
documentation does **not** state is whether the COLMAP writer preserves a
per-camera principal point or pins it to the image centre on the way out. That is
the same defect ADR 0004 records, one tool along. Epic publishes a PDF —
*"On the Coordinate Systems Employed in the Import, Estimation, and Export of
Camera Geometry by RealityScan"* — that settles it. **Get that PDF before
adopting this path**; the existing guard is the acceptance test either way.

### What would force NO-GO

Six critical gates, any one of which ends it regardless of aggregate results:
headless Linux execution; commercial and automated licensing; georeferenced
export at an affordable tier; total cost within budget; machine-readable failure
detection; and no GUI step on the per-job critical path.

After re-verification, **F3 (no GUI on the per-job critical path) is documented
as satisfied**, and machine-readable failure detection is documented
(`appQuitOnError=true`, exit codes, `-writeProgress`, `-getStatus`, `-stdConsole`)
though still unmeasured. **Headless execution and licensing remain genuinely
open**, and licensing is now conspicuous by its absence: none of the 82
documentation pages discuss entitlement at all. It lives behind
`realityscan.com/en-US/linux`, **which returns 403 from here**, and the EULA.
So licensing is the one critical gate this session could not advance at all.

Of the three further unknowns the draft named, two are closed (checkpoints, 3D
Tiles CLI) and **determinism remains unknown after an exhaustive search** — zero
occurrences of "determinis", "reproducib" or "random seed" across all 82 pages.
Phase 2 depends on comparing captures across dates, so this must be measured.

### What is genuinely good

Georeferencing needs no GUI clicking, and the verbs are now named:
`-importGroundControlPoints`, `-importControlPointsMeasurements`, with
`-selectMeasurementByError` for residual triage and `gpType=2` checkpoints for
independent accuracy evidence. Texture reprojection and `-importModel` allow an
externally repaired mesh to be re-textured from the **original photographs**.
paRSer is a text-substitution language across 22 documented function sets, so
**reports can emit JSON** and the QA subsystem avoids HTML scraping.
Orthomosaic generation is fully unattended, both of its parameter files optional.

### What is worse than it looks

The **dense point cloud is built from mesh vertices**, so there is no cheap
cloud-only path — unchanged, and still only `SUPPORTED`. **Export format lists
live in dialogs, not in the CLI documentation**, so E57, COG, LAZ, KMZ, UDIM and
plain `.gltf` are all `UNKNOWN` — not absent, but do not promise them. COG in
particular is not mentioned once, so `export-cog` stays and GDAL converts the
GeoTIFF.

The DTM finding softened but did not vanish: there *is* a classification step and
a ground-class switch, but nothing documents how well the classifier performs on
image-derived vertices. **Measure it against a PDAL SMRF/PMF baseline before
claiming bare earth for survey work.**

And RealityScan still reports plenty about what it did internally while reporting
**almost nothing about whether its artifacts are any good** — texture validity has
no mechanism at all, in any of the 82 pages.

That last point is the decisive architectural constraint, and it is not
RealityScan's fault so much as a general truth this repository has already paid
to learn: an engine exited cleanly here once having written a 934-face mesh and
an 87%-empty orthophoto. **The writer must never be the validator.** Every
artifact-level check stays ours, computed with independent readers — the pattern
already in `nodes/check_*.py` and ADR 0018.

### Recommendation

1. **Run tier-1 existence tests** — about a day of work, using
   `scripts/measure/realityscan-probe.py`. Stop everything if they fail. Add a
   licence/login-dialog test: the documentation says that dialog cannot be
   suppressed.
2. **Read the actual EULA** and get written vendor confirmation on commercial,
   headless, server-side and ephemeral-activation use. The documentation is
   silent on entitlement, and silence is not permission.
3. **Fetch the camera-geometry PDF** before committing to the COLMAP pose path.
   It is the one document that settles whether the principal point survives.
4. **Adopt the COLMAP pose path if it does**, as an isolated change with its own
   A/B against the current route, landing as a sibling Node to `solve`.
5. **Build the QA subsystem regardless of the RealityScan decision.** The CRS
   plausibility check and independent-reader artifact validation close a hole the
   current pipeline demonstrably has. This is the highest-value work identified by
   the entire investigation, and it is engine-independent.

The last point deserves emphasis, and re-verification strengthened it rather than
weakening it: **the most useful outcome of evaluating RealityScan may be what it
revealed about the pipeline we already run.**
