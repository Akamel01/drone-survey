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

**Verdict: CONDITIONAL GO on a narrow adoption. NO-GO on wholesale replacement.**
Locked 2026-09-22 as
[ADR 0020](../adr/0020-realityscan-for-poses-not-for-the-ortho-chain.md): adopt
RealityScan as the splat pose provider, keep ODM for the ortho chain, gate on
component share, and put the engine version in Job provenance.

Worth stating plainly, because this document could read as more negative than it
is: **RealityScan passed every gate that was actually tested.** The CONDITIONAL
is about the tier-2 gates that were never run, not about failures.

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

**2. Headless reconstruction works. Measured, ten times.** This was the single
biggest open question and it closed in RealityScan's favour: `-calculateNormalModel`
ran ten times on an SSH-only host and produced ten readable meshes, no hangs.

The reported failures were real but environmental, and all three causes are now
identified: no virtual framebuffer (Wine's DXGI fails `0x887a0004` without an X
connection), POSIX paths silently parsed as commands so `-quit` never runs and
the process idles forever, and an invisible first-run Epic sign-in modal that
`-headless` does not suppress. The documentation's own warning — *"certain
dialogs (e.g., the login window) will still require user interaction"* — turned
out to be the literal blocker, and dismissing it once persists.

**3. The most valuable adoption is still the smallest one, and it is measured.**
`-exportRegistration <name>.json` writes a nerfstudio `transforms.json` directly
— not COLMAP-then-convert — so `ns-process-data odm` leaves the chain entirely,
and with it the conversion ADR 0004 records as degrading silently. Principal
point sits at the image centre in 9/9 frames with zero distortion, which looks
like ADR 0004's defect and is its opposite: the exporter undistorts per camera,
so each frame carries its own dimensions and focal length and the calibration is
applied to the pixels rather than discarded.

Two consequences. `principal_point_survived()` does **not** apply to this output
and must not be relaxed to fit it — it needs a sibling keyed on whether the
images were undistorted. And the export inherits the coverage instability in
finding 4, having carried 9 of 20 images from an unstable component split.

**4. The engine is non-deterministic, and it varies coverage rather than
tessellation.** Ten identical runs produced ten meshes spanning 17.6% mean
bounding-box drift, because alignment splits into a different number of
components each run (3/2/2 at 20 images, 6/7 at 122) and `-selectMaximalComponent`
takes whichever is largest. Every run exited 0 with a clean million-face mesh.
Gating on the selected component's **share of registered images** is the single
most valuable thing this investigation produced.

### What would force NO-GO

Six critical gates, any one of which ends it regardless of aggregate results:
headless Linux execution; commercial and automated licensing; georeferenced
export at an affordable tier; total cost within budget; machine-readable failure
detection; and no GUI step on the per-job critical path.

After re-verification, **F3 (no GUI on the per-job critical path) is documented
as satisfied**, and machine-readable failure detection is documented
(`appQuitOnError=true`, exit codes, `-writeProgress`, `-getStatus`, `-stdConsole`)
though still unmeasured.

**Licensing moved a long way.** The 403 on `realityscan.com/en-US/linux` was an
Epic account gate on the *download*, not a block on the terms: the EULA and the
licensing page are public and are now saved as
[`sources/eula.md`](sources/eula.md) and
[`sources/licensing-and-pricing.md`](sources/licensing-and-pricing.md).
RealityScan is **free under $1,000,000 USD gross revenue over the last 12
months, with "All RealityScan features"** — no capability gating between tiers —
and CA$1,697 per seat per year above that. A4 reads as GO at our volume and A3
as GO on the face of it. What is left on A2 is one clause: §1.2 forbids making
the Software available to third parties on a "service bureau or similar basis",
and whether selling processed deliverables is that needs a written answer rather
than a confident reading.

**Headless execution is therefore the last wholly-open critical gate**, and the
only one that still needs a machine.

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
