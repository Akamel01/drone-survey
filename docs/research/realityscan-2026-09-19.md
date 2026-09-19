# RealityScan as the core processing engine — evaluation

2026-09-19. Investigation into replacing the existing OpenDroneMap-based
pipeline with RealityScan as the core engine of an automated post-flight
aerial-survey system. LiDAR out of scope this phase.

## Documents

| Deliverable | Where |
|---|---|
| Decision gates (GO / CONDITIONAL GO / NO-GO) | [gates](realityscan-gates-2026-09-19.md) |
| Domain model | [domain model](realityscan-domain-model-2026-09-19.md) |
| Capability map, all 18 domains; automation and config reference | [capability map](realityscan-capability-map-2026-09-19.md) |
| Architecture, replacement matrix, engine/external boundary, roadmap, gaps | [architecture](realityscan-architecture-2026-09-19.md) |
| Risk-focused validation program | [validation](realityscan-validation-2026-09-19.md) |
| Proof of concept | [`scripts/measure/realityscan-probe.py`](../../scripts/measure/realityscan-probe.py) |

The gates and the domain model were written **before** any findings were read,
so the thresholds are not fitted to the answer.

---

## Executive conclusion

**Verdict: CONDITIONAL GO on a narrow adoption. NO-GO on wholesale replacement,
on the evidence available. Neither conclusion is safe to act on yet, because
the evidence is one tier weaker than this decision deserves.**

### The evidence problem comes first

This environment's egress policy returned **403 for every primary source** —
`dev.epicgames.com`, `rshelp.capturingreality.com`, `capturingreality.com`,
`forums.unrealengine.com`, `web.archive.org`. Exactly one fetch succeeded, and
it disproved a premise of the brief: `github.com/EpicGames/RealityScan` is not
the engine, SDK or CLI source. It is `pano2views`, an eight-file JavaScript
panorama converter.

Everything else rests on search-engine summaries of pages nobody opened. So
**nothing here is `VERIFIED`**, and the pre-written evidence standard — no gate
may be marked GO on inferred evidence — means the honest aggregate verdict is
*not yet determinable*. What follows is a well-founded hypothesis and a test
plan to settle it, not a finding.

### What RealityScan is

It is a **reconstruction engine, not a survey system**. That single sentence
predicts nearly every result below.

Of roughly 45 capabilities assessed, about 24 are direct replacements or
replacements-with-configuration — and they are all reconstruction: alignment,
meshing, texturing, ortho, DSM, export formats. About 11 cannot be replaced at
all, and **every one of them is validation, survey analysis, or delivery-format
work**. That is also the layer where most of this system's value and hard-won
knowledge lives. No external tool in the current stack becomes redundant.

### The three findings that matter most

**1. Headless automation is replay of GUI-authored configuration.** Export
settings come from an XML block the GUI writes; ortho parameters come from a
`.rcortho` file the GUI writes. But the Linux build is reported CLI-only with
no desktop UI. Those combine into a permanent requirement for a **Windows GUI
seat** to author configuration templates that the Linux host replays. It does
not fail the no-GUI-on-the-critical-path gate — no GUI step is per-job — but it
caps how dataset-adaptive the pipeline can be. Worth testing early whether
those files are hand-writable; a yes would substantially improve the design.

**2. Headless reconstruction may not work at all.** Multiple reports describe
`-calculateNormalModel`/`-calculateHighModel` hanging indefinitely or failing
with a misleading "No model is selected" under headless Linux, and Epic's own
guidance reportedly steers headless users to the **Remote Command Plugin
(gRPC/REST)** rather than the bare CLI. If reconstruction cannot run without a
display and the plugin is tier-locked, the evaluation ends there. This is the
cheapest thing to test and it runs first.

**3. The most valuable adoption is the smallest one.** RealityScan exports
camera registration in **COLMAP format**, expanded in 2.1.1 with real
distortion models and automatic low-accuracy-point filtering. ADR 0004 records
that the current ODM→nerfstudio path **forces the principal point to the image
centre and degrades silently**, and cannot stop ODM early. Swapping in
RealityScan as the pose provider for the splatting pipeline fixes a known
defect, touches nothing else, and is independently shippable. **If everything
else stalls, this is still worth doing.**

### What would force NO-GO

Six critical gates, any one of which ends it regardless of aggregate results:
headless Linux execution; commercial and automated licensing; georeferenced
export at an affordable tier; total cost within budget; machine-readable
failure detection; and no GUI step on the per-job critical path. Four remain
genuinely open.

Three further unknowns can move the verdict: whether checkpoints
(excluded-from-solve validation points) are supported at all, whether 3D Tiles
export has a CLI verb, and **whether output is deterministic** — for which no
vendor statement was found anywhere. Phase 2 of the product roadmap depends on
comparing captures across dates, and a non-deterministic engine undermines that.

### What is genuinely good

The pipeline-blocking worry did not materialise: **GCP image observations can be
supplied from a CSV**, so georeferencing needs no GUI clicking. Texture
reprojection allows an externally repaired or retopologised mesh to be
re-textured from the **original photographs**, making a real round-trip
possible. paRSer is a text-substitution templating language, so **reports can
emit JSON** and the QA subsystem avoids HTML scraping. Export-format coverage
comfortably exceeds the current pipeline. Orthomosaic generation is fully
unattended.

### What is worse than it looks

The **DTM is not bare earth** — it is a scene-type heuristic (`nature`, `city`,
`mountains`…), not ground classification over image-derived points. This is
exactly the trap the brief warned about and it appears to be real; genuine
ground classification belongs in PDAL. The **dense point cloud is built from
mesh vertices**, so there is no cheap cloud-only path. **Cesium 3D Tiles is
1.0 b3dm** with no Draco or KTX2, which matters for payload size over object
storage. And RealityScan reports plenty about what it did internally while
reporting **almost nothing about whether its artifacts are any good** — texture
validity has no mechanism at all.

That last point is the decisive architectural constraint, and it is not
RealityScan's fault so much as a general truth this repository has already paid
to learn: an engine exited cleanly here once having written a 934-face mesh and
an 87%-empty orthophoto. **The writer must never be the validator.** Every
artifact-level check stays ours, computed with independent readers.

### Recommendation

1. **Run tier-1 existence tests this week** — about a day of work, using
   `scripts/measure/realityscan-probe.py`. Stop everything if they fail.
2. **Read the actual EULA** and get written vendor confirmation on commercial,
   headless, server-side and ephemeral-activation use. Silence is not
   permission.
3. **Adopt the COLMAP pose path regardless**, as an isolated change with its
   own A/B against the current route.
4. **Build the QA subsystem regardless of the RealityScan decision.** The CRS
   plausibility check and independent-reader artifact validation close a hole
   the current pipeline demonstrably has. This is the highest-value work
   identified by the entire investigation, and it is engine-independent.

The last point deserves emphasis: **the most useful outcome of evaluating
RealityScan may be what it revealed about the pipeline we already run.**
