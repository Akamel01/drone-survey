# Target architecture, replacement matrix and roadmap

Written 2026-09-19. Reads with
[capability map](realityscan-capability-map-2026-09-19.md),
[gates](realityscan-gates-2026-09-19.md),
[domain model](realityscan-domain-model-2026-09-19.md),
[validation program](realityscan-validation-2026-09-19.md).

All evidence is `SUPPORTED` or weaker — see the capability map's evidence-health
section. This is a design to test, not a design to build.

---

## 1. What does not change

The existing **Manifest / Node / Runner** model is engine-agnostic by
construction (ADR 0006). A Manifest declares Nodes and edges; a Node is a named
step with declared inputs and outputs; the Runner sequences them and writes
`state.json` after each so an interrupted run resumes at the first incomplete
Node.

**This is already the right orchestration layer for RealityScan**, and it is
better suited to it than to ODM, for a reason worth stating: RealityScan has
model-stage autosave resume but **no evidenced alignment-stage resume**, and a
reported tendency to hang. A Runner that splits a long engine run into
separately-resumable Nodes with external watchdogs is precisely the mitigation
that failure profile calls for. The existing design anticipated this need for
ODM's sake and it transfers intact.

**Nothing in the Capture, Assurance or Delivery contexts should change.** If
adopting RealityScan forces a change there, the abstraction has leaked and that
is a finding, not something to absorb.

## 2. The engine boundary

```
┌─────────────────────────────────────────────────────────────────┐
│  OUR ORCHESTRATION LAYER  (unchanged in kind)                   │
│                                                                 │
│  Manifest · Runner · Node state · watchdogs · placement         │
│  Profile versioning · Job Config · provenance · QA gates        │
└───────────────┬─────────────────────────────────────────────────┘
                │  process boundary: gRPC/REST, or CLI + rscmd
┌───────────────▼─────────────────────────────────────────────────┐
│  REALITYSCAN ENGINE                                             │
│                                                                 │
│  alignment · reconstruction · texturing · ortho · DSM           │
│  exports · paRSer reports                                       │
│                                                                 │
│  configured ONLY by versioned template files:                   │
│    *.rscmd · settings.rcconfig · export *.xml · *.rsortho       │
│    *.rsbox · -set "key=value"                                    │
│    *.parser (JSON-emitting report template)                     │
└─────────────────────────────────────────────────────────────────┘
```

**The boundary rule**: the engine receives a job-scoped working directory, a set
of versioned template files, and a command sequence. It returns artifacts and a
JSON report. **It makes no decisions.** Every decision — retry, placement,
pass/fail, what to deliver — belongs to the orchestration layer.

**Preferred integration surface: the Remote Command Plugin (gRPC/REST).**
Not the bare CLI. Re-verification made this concrete rather than probable —
[`realityscan-for-linux`](sources/realityscan-for-linux.md) documents Docker
with GPU passthrough, a REST server, a gRPC server, **and a passive
notification mode**: *"you provide a notification address and receive
asynchronous events (progress, completion, errors) without polling … useful
when running existing pipelines—such as .rscmd command files—inside a container
without an active server loop."*

That passive mode matches this repo's Runner almost exactly: a Node shells a
command, the engine reports asynchronously, nothing polls. It is the first
choice; the full server is the second; the bare CLI is the fallback if the
plugin proves tier-locked (T1.3).

The plugin also supplies the process control a hang needs — `-abortInstance`,
`-pauseInstance`, `-unpauseInstance`, `-getStatus`, `-waitCompleted` are all
documented CLI verbs with plugin equivalents.

### The configuration seat

**Revised 2026-09-19 after re-verification. The first draft made this a
permanent Windows machine; the documentation does not.**

Two facts from [`installation-linux`](sources/installation-linux.md) and
[`keys-and-values`](sources/keys-and-values.md) change its shape:

- Parameter XML is authored from "the RealityScan UI (**Windows or Linux
  Wine**)". The Linux build ships a UI — "available for troubleshooting only",
  discouraged, but present. No separate Windows machine is required.
- **The parameter file is optional on every command that accepts one.** Without
  it, "current settings" apply, and current settings come from 116 documented
  `-set` / `-preset` keys, 57 per-selection keys across `-editInputSelection`,
  `-editControlPointSelection`, `-editConstraintSelection` and
  `-editOrthoProjectionSelection`, and a portable `settings.rcconfig` moved with
  `-exportGlobalSettings` / `-importGlobalSettings`.

So the configuration flow is:

```
  -set keys + settings.rcconfig                 (the normal path: text, in git)
        │
        ├── covers alignment, reconstruction, texturing, per-item settings
        │
  Wine UI on the same Linux host, rarely        (the fallback path)
        │  authors what only a dialog exposes
        ▼
  export *.xml · *.rsortho · *.parser templates
        │  committed to the repository, versioned
        ▼
  Linux production host runs headlessly
```

Gate F3 holds for the same reason as before — no GUI step is per-job — but the
cap on dataset-adaptive behaviour is much weaker than the draft assumed: 173
documented keys, not "whatever the `-set` keys expose" read as a remainder.

Still worth testing, at lower priority than before: whether `.rsortho` and the
export XML are hand-writable. `-editOrthoProjectionSelection` may make the
question moot for the ortho case.

## 3. Stage-by-stage pipeline

Stages marked **[ours]** are our code; **[RS]** RealityScan; **[ext]** external
tools. Runtimes are order-of-magnitude for a ~500-image Capture on the 4070 and
are **INFERRED** — no measurements exist.

| # | Stage | Owner | Command / mechanism | In → Out | Failure modes | Validation |
|---|---|---|---|---|---|---|
| 1 | Flight data landing | ours | existing | card → store | missing files | count vs Mission Spec |
| 2 | Input validation | ours | `exif-audit`, `filter` | images → verdict | corrupt, bad EXIF, low count | **T2.1/2.3/2.8** |
| 3 | **CRS plausibility** | **ours** | `pyproj` bounds vs EPSG | GNSS + EPSG → verdict | wrong zone | **T2.10 — no native equivalent** |
| 4 | Job registration | ours | Runner | → Job + Job Config | — | config completeness |
| 5 | Working-copy isolation | ours | copy to job dir | → job images | — | **mandatory: engine may rewrite XMP sidecars (T2.15)** |
| 6 | Correction | ours | `correct` | images → images | EXIF loss | EXIF preserved |
| 7 | Ingestion | RS | `-addFolder` (+ masks by convention) | images → project | metadata rejected | image count in project |
| 8 | Alignment | RS | `-align` + `-set` keys | project → components | hang; split; misregistration | **component share ≥ threshold**, reprojection error |
| 9 | Georeferencing | RS | `-setProjectCoordinateSystem`/`-setOutputCoordinateSystem`, `-importGroundControlPoints`, `-importControlPointsMeasurements`, `gpType=2` checkpoints | + control → georeferenced | bad GCP; wrong CRS | per-point residuals |
| 10 | Component selection | RS | `-selectMaximalComponent` / `-mergeComponents` | → one component | **silent discard of the rest** | share gate, again |
| 11 | Region | RS | `-setReconstructionRegion <Site>.rsbox` | → bounded region | region excludes Site | region vs Site boundary |
| 12 | Reconstruction | RS | `-calculateNormalModel` | → mesh | **hang (T1.2)**; **login dialog**; OOM; empty | **external watchdog**; mesh loads, faces > 0 |
| 13 | Point cloud | RS | export from mesh vertices | → LAS/PLY | sparse coverage | PDAL completeness |
| 14 | Simplify | RS | `-simplify <N>` | → LoD mesh | over-decimation | triangle count |
| 15 | Mesh repair | **RS** | `-cleanModel`, `-closeHoles [maxEdges]`, `-cutByBox inner\|outer [fillHoles]` | → repaired | over-aggressive cleanup | trimesh validity, **independent reader** |
| 16 | Re-import (retopo only) | RS | `-importModel` into calibrated component | → mesh in project | wrong component | mesh present |
| 17 | Texturing | RS | `-calculateTexture` | → textured | ghosting; seams | Pillow/OpenCV sanity + calibration review |
| 18 | Ortho / DSM | RS | `-calculateOrthoProjection [<f>.rsortho] [<r>.rsbox]`, then `-exportOrthoProjection` | → GeoTIFF | empty ortho; voids | **GDAL coverage ≥ 99%** |
| 19 | **DTM** | RS **or** ext | `-dtmClassify` + `-setSelectedClassAsGroundForDTM true`, **or** PDAL SMRF/PMF | cloud → bare earth | misclassification | **A/B the two on one Capture before choosing** |
| 20 | COG | **ext** | GDAL | GeoTIFF → COG | invalid COG | **existing COG validator** |
| 21 | Contours / sections | RS | `-computeContours` / `-exportContours`; `-calculateCrossSections` / `-exportCrossSections` | → SHP/DXF | format list is dialog-side | opens in QGIS |
| 22 | Survey analysis | **ext** | rasterio / PDAL / Shapely | → Measurements | — | recompute independently |
| 23 | **COLMAP export** | RS | `-exportRegistration <file> [params.xml]` | → cameras/images/points3D | **principal point pinned to image centre** | `principal_point_survived()`, `nodes/solve/solve.py:114` |
| 24 | Splat fitting | **ext** | splatfacto / OpenSplat | COLMAP → splat | unchanged | existing gate |
| 25 | 3D export | RS | `-exportModel <m> <file> [params.xml]` | → OBJ/GLB/FBX/… | XML template drift | independent reader per format |
| 26 | 3D Tiles | RS | `-export3dTiles <file>.json [params.xml]` (`-exportLod` for linear LoD) | → tileset | payload size; compression unknown | tileset.json loads, **measure bytes** |
| 27 | Reports | RS | `-exportReport <out> <template>` with a **JSON-emitting paRSer template** | → JSON + HTML | template drift | schema validation |
| 28 | QA gate | **ours** | independent readers + thresholds | → QA Results | — | this *is* the validation |
| 29 | Package / deliver | ours | `bundle`, `publish` | → Delivery Bundle | — | existing |

### Three design rules this table encodes

**Every artifact is validated by a reader that did not write it.** GDAL reads
the rasters, PDAL the clouds, trimesh the meshes. The engine's opinion of its
own output is evidence, never a verdict.

**Every engine call is wrapped in a watchdog.** Given reported hangs and no
self-termination, a wall-clock kill at 3× expected runtime is mandatory
infrastructure, not defensive garnish.

**`-set "appQuitOnError=true"` appears in every invocation.** Without it, a
failed command does not propagate a non-zero exit code. This should be enforced
in our wrapper so it cannot be forgotten.

---

## 4. Replacement matrix

Levels: **Direct** · **With config** · **+ external utility** · **Partial** ·
**Cannot replace** · **Unknown**.

| Capability | Required | RS native | CLI | GUI-only | External | Level | Validation | Risk |
|---|---|---|---|---|---|---|---|---|
| Image ingestion | yes | yes | yes | no | no | **Direct** | T2.x | low |
| Input validation | yes | no | — | — | **yes (ours)** | **Cannot replace** | existing | low |
| Masking (assignment) | opt | yes | convention | no | no | **Direct** | — | low |
| Mask generation | opt | yes | no | **yes** | yes | **+ external** | — | low |
| Alignment / SfM | yes | yes | yes | no | no | **With config** | T1.1, T2.4/5 | **med — `-set` keys unknown** |
| Component merge/select | yes | yes | yes | no | no | **Direct** | T2.14 | **med — silent discard** |
| GPS priors | yes | yes | yes | no | no | **Direct** | T2.9 | low |
| GCP import (3D + 2D) | yes | yes | yes | no | no | **With config** | T2.11 | med — verb unknown |
| Checkpoints | survey | probable | ? | ? | maybe | **Unknown** | T3.2 | **high** |
| CRS set | yes | yes | yes | no | no | **Direct** | — | low |
| **CRS validation** | yes | **no** | — | — | **yes (ours)** | **Cannot replace** | **T2.10** | **high if unbuilt** |
| Dense point cloud | yes | yes (via mesh) | yes | no | no | **Partial** | T3.6 | med — ordering |
| Point filtering | yes | GUI | no | yes | **yes** | **+ external** | — | low |
| Ground classification | DTM | **heuristic only** | — | — | **yes (PDAL)** | **Cannot replace** | T3.4 | **high** |
| Mesh reconstruction | yes | yes | yes | no | no | **With config** | **T1.2** | **high — hangs** |
| Region crop | yes | yes | `.rsbox` | no | no | **Direct** | — | low |
| Simplify | yes | yes | `-simplify` | no | no | **Direct** | — | low |
| Hole filling | yes | GUI | **no** | yes | **yes** | **+ external** | T3.7 | low |
| Retopology | opt | **absent** | — | — | **yes** | **Cannot replace** | — | low |
| Mesh split / tile | opt | no | no | — | yes | **Cannot replace** | — | med |
| UV + texturing | yes | yes | yes | no | no | **With config** | T3.8 | low |
| **Re-texture external mesh** | yes | **yes** | yes | no | no | **Direct** | — | low |
| DSM | yes | yes | yes | no | no | **With config** | T3.3 | med |
| **DTM** | survey | **yes — `-dtmClassify` + `-setSelectedClassAsGroundForDTM`** | yes | no | maybe | **With config, pending A/B vs PDAL** | **T3.4** | **high** |
| Contours | opt | yes | `-computeContours` / `-exportContours` | no | no | **With config** | — | low |
| **Orthomosaic** | yes | yes | yes | no | no | **With config** | **T3.5** | med |
| GSD / extent control | yes | yes | `.rsortho`, or `-editOrthoProjectionSelection` | GUI only for the file | no | **With config** | — | low |
| Volume measurement | opt | **yes** | **paRSer `$OrthoProjectionVolume`** | no | maybe | **With config** | — | low |
| Distance / area query | yes | no CLI | — | — | **yes** | **Cannot replace** | T3.2 | low |
| Checkpoint RMSE | survey | **`gpType=2` Ground test points** | yes, via paRSer | no | **yes (ours, for the arithmetic)** | **With config + ours** | T3.2 | med |
| OBJ/PLY/FBX/GLB/USD/STL/DXF | yes | yes | XML template | template from GUI | no | **With config** | T3.12 | low |
| **COG** | yes | **not documented** | — | — | **yes (GDAL)** | **Cannot replace** | existing | low |
| LAS/LAZ | yes | yes | yes | no | no | **Direct** | T3.12 | low |
| E57 | opt | **import only** | — | — | yes | **Unknown** | T3.12 | low |
| KML/KMZ | opt | yes | yes | no | no | **Direct** | — | low |
| **Cesium 3D Tiles** | opt | **yes, 1.0 b3dm** | **verb ?** | possibly | for 1.1 | **Partial** | — | **high — may be GUI-only** |
| Draco / KTX2 | opt | **no** | — | — | **yes** | **Cannot replace** | — | med |
| Alignment statistics | yes | yes | paRSer | no | no | **Direct** | T3.1 | low |
| Reprojection error | yes | yes | paRSer | no | no | **Direct** | T3.1 | low |
| GCP residuals | yes | yes | paRSer | no | no | **With config** | T2.11 | med — vars unknown |
| **Artifact validity (all kinds)** | yes | **no** | — | — | **yes (ours)** | **Cannot replace** | T3.3–3.10 | **high if unbuilt** |
| **Machine-readable reports** | yes | **yes via paRSer** | yes | template from GUI | no | **With config** | T3.11 | med |
| **Gaussian splatting** | yes | **no** | — | — | **yes (existing)** | **Cannot replace** | existing gate | low |
| **COLMAP export for splatting** | yes | **yes** | `-exportRegistration` | no | no | **Direct** | T-COLMAP | **low — best case in evaluation** |
| Restart / resume | yes | model stage only | partly | — | **yes (Runner)** | **+ external** | T4.3/4.4 | med |
| Job monitoring | yes | `-writeProgress` | yes | no | ours | **With config** | — | low |
| Determinism | yes | **no statement** | — | — | — | **Unknown** | **T4.10** | **high** |

### Summary count

- **Direct / With config**: ~24 capabilities — the reconstruction core, and it
  is genuinely strong.
- **+ external utility**: ~6.
- **Cannot replace**: ~11 — and **every one of them is validation, survey
  analysis, or delivery-format work**, not reconstruction.
- **Unknown**: 2. Re-verification closed **checkpoints** (`gpType=2`) and the
  **3D Tiles CLI verb** (`-export3dTiles`), and moved **DTM**, **contours**,
  **volume measurement** and **checkpoint RMSE** out of "cannot replace" into
  "with config" — so the counts above shift by roughly four toward replaceable.
  **Determinism** is the unknown that can still move the verdict, and
  **licensing** is the gate that remains entirely untested.

The shape of that distribution is the finding. **RealityScan is a
reconstruction engine, not a survey system.** It would replace the
reconstruction core well and replace essentially none of the validation,
analysis or delivery layer — which is also the layer where most of this
system's actual value and hard-won knowledge lives.

---

## 5. RealityScan vs external processing

| Function | Classification | Tool | Why |
|---|---|---|---|
| Alignment / SfM | **RealityScan** | — | Core strength |
| Mesh + texture | **RealityScan** | — | Core strength; texture reprojection is excellent |
| Ortho + DSM | **RealityScan** | — | Confirmed CLI-driven |
| COLMAP export | **RealityScan** | — | Better than the current conversion path |
| Advanced point cloud | **REQUIRED external** | PDAL, CloudCompare | No CLI filtering in RS |
| **Ground classification / DTM** | **REQUIRED external** | PDAL SMRF/PMF | RS "DTM" is a scene heuristic |
| GIS operations | **REQUIRED external** | GDAL, QGIS, pyproj | Not an RS domain |
| Raster manipulation / **COG** | **REQUIRED external** | GDAL | COG not documented in RS |
| Mesh repair | **REQUIRED external** | MeshLab, trimesh | No CLI hole-filling |
| Retopology | **REQUIRED external** | Instant Meshes | Absent from RS |
| Format conversion | **PREFERABLE external** | GDAL, trimesh | RS covers most; external fills gaps |
| **Output validation** | **REQUIRED external** | GDAL, PDAL, trimesh, Pillow | **Non-negotiable: the writer must not be the validator** |
| Statistical analysis | **REQUIRED external** | numpy, our code | Must be auditable and versioned |
| Reporting | **HYBRID** | paRSer JSON → our renderer | RS supplies internals; we own the verdict |
| Cloud / object storage | **REQUIRED external** | B2 | Not an RS domain |
| Client delivery | **REQUIRED external** | existing bundle/publish | Not an RS domain |
| Web visualisation | **REQUIRED external** | MapLibre, SuperSplat, Potree, Cesium | RS emits 3D Tiles 1.0 only |
| **Gaussian splatting** | **REQUIRED external** | splatfacto, OpenSplat | Not native to RS |
| Orchestration | **REQUIRED external** | existing Runner | RS makes no decisions |

**No function was classified redundant-because-RealityScan-does-it.** Every
external tool in the current stack keeps its job. What changes is the
reconstruction core underneath them.

---

## 6. Productionization roadmap

Ordered so the cheapest thing that can kill the idea runs first.

**Phase 0 — Existence (≈1 week, S1 gates).** Tier-1 tests: headless alignment,
headless reconstruction ×10, Remote Command Plugin, EULA read with written
vendor confirmation, ephemeral activation ×5, failure-distinguishable-from-
success. **Stop here if any fails.** No integration work until this passes.

**Phase 1 — Narrow adoption (≈2 weeks, highest value per unit risk).** Adopt
RealityScan **only** as the COLMAP/pose provider for the splatting pipeline.
`-exportRegistration` → existing splatfacto path. A/B against the current ODM
route on camera count, reprojection error, and trained-splat quality. This
targets a defect ADR 0004 already records — the conversion forcing the principal
point to image centre and degrading silently — and touches nothing else. **If
the whole evaluation stalls, this piece is still worth shipping.**

**Phase 2 — Configuration foundation (≈1 week, revised down).** No Windows seat
to stand up. Author and commit: a `settings.rcconfig` pinning the `-set` keys we
depend on, export XML templates per format where a dialog exposes something
`-set` does not, `.rsortho` templates, `.rsbox` generation from Site boundaries,
and the **JSON-emitting paRSer template**. The Keys and Values reference is
already retrieved and saved to [`sources/keys-and-values.md`](sources/keys-and-values.md)
— 116 global keys — with 57 per-item keys in
[`sources/configure-selected-items.md`](sources/configure-selected-items.md).
Test whether `.rsortho`/export XML are hand-writable, at lower priority than the
draft gave it: `-editOrthoProjectionSelection` may make the question moot.

**Phase 3 — Orthomosaic parity (≈3 weeks).** Full ortho path behind a feature
flag, running **in parallel with ODM on the same Captures**, compared on
coverage, GSD accuracy, checkpoint residuals and runtime. Ship nothing to
clients from it until it matches or beats ODM on our own gates.

**Phase 4 — QA subsystem (≈2 weeks, in parallel).** Independent-reader
validation for every artifact type; CRS bounds check; paRSer JSON parsed into
QA Results; PASS/WARN/FAIL/REVIEW gate wired into the Runner. **This is
valuable regardless of the RealityScan decision** and should be built even on a
NO-GO, because it closes the silent-bad-output hole the current pipeline
demonstrably has.

**Phase 5 — Extended capabilities (as needed).** 3D Tiles (resolve the CLI
verb first), DTM via PDAL, survey analysis, volume workflows.

**Phase 6 — Cutover or stand-down.** Decide per capability, not globally. A
split outcome — RealityScan for poses and mesh, ODM retired from splatting only
— is a perfectly good result and more likely than a clean sweep.

---

## 7. Known gaps, uncertainties and assumptions

**Revised 2026-09-19.** Five of the eleven gaps the first draft listed were
closed by reading the documentation; the rest are restated, and two new ones
appeared.

**Blocking unknowns** (any could change the verdict):

1. **Whether headless reconstruction works reliably on Linux without a display.**
   Unchanged and now the largest open question. No Epic page addresses the
   reported hangs; Epic does document Docker with GPU passthrough as supported.
2. **The login dialog.** *New.* [`headless-mode`](sources/headless-mode.md)
   states that `-silent` and `appQuitOnError=true` suppress most interruptions
   "but certain dialogs (e.g., the login window) will still require user
   interaction". A container blocking on a login window is indistinguishable
   from a hang. Needs its own tier-1 test, including token expiry mid-run.
3. Whether free/standard tiers permit CLI/headless use. **Not one of the 82
   documentation pages discusses entitlement**; it lives behind
   `realityscan.com/en-US/linux`, which **returns 403** from this network, and
   the EULA. The one critical gate re-verification could not advance.
4. Whether activation survives ephemeral rented GPUs non-interactively.
5. **Whether output is deterministic.** Still no vendor statement — zero
   occurrences of "determinis", "reproducib" or "random seed" across all 82
   pages. The search is now exhaustive rather than incidental.
6. **What `-exportRegistration`'s COLMAP writer emits.** *The deciding question
   for the splat adoption.* Half of it is now answered: the camera-geometry
   reference is retrieved and saved to
   [`sources/camera-geometry-reference.md`](sources/camera-geometry-reference.md),
   and it confirms RealityScan holds a **genuine per-camera principal point**,
   so the engine does not structurally reproduce ADR 0004's defect. But that
   document **never mentions COLMAP as an output format** — no `cameras.txt`, no
   COLMAP model names — so the `sfmDistortionModel` mapping remains unknown and
   only a real export settles it. It also surfaced a trap worth more than the
   original question: **RealityScan's tangential coefficients `t1, t2` are
   OpenCV's `t2, t1`**, swapped, while radial coefficients match.

**Closed by re-verification** (was: "retrievable with working network access"):

| Was gap | Answer |
|---|---|
| The literal `-set` key strings — "largest single gap" | 116 global keys in `keys-and-values`, 57 per-item keys in `configure-selected-items` |
| Exact CLI verb for GCP import | `-importGroundControlPoints`, `-importControlPointsMeasurements` |
| Exact CLI verb for `-exportReport` | `-exportReport <out> <template> [true OR false]`; also `-printReport` |
| Exact CLI verb for LoD / 3D Tiles export | `-exportLod`, **`-export3dTiles`** — domain 13 stays in the pipeline |
| Depth-map resolution key | `-setDownscaleForDepthMaps`, `mvsPreviewDownscaleFactor`, `mvsNormalDownscaleFactor` |
| Whether checkpoints are supported | Yes — `-editControlPointSelection "gpType=2"`, `2 – Ground test` |

**Documentation gaps that remain:**

7. **Export format lists.** They live in dialogs, not in the CLI pages. E57,
   COG, LAZ, KMZ, UDIM and plain `.gltf` are `UNKNOWN` — not absent, but do not
   promise them. COG in particular is unmentioned, which is why `export-cog`
   stays.
8. **Whether a real JSON paRSer sample ships.** The templating language is fully
   documented across 22 function sets and the default templates live in
   `installation folder\Reports`; nothing says one of them is JSON. A
   five-minute check on a real install, and it does not change the design.
9. **Whether `.rsortho` and the export XML are hand-writable.** Lower priority
   than the draft gave it: `-editOrthoProjectionSelection` may make it moot.
10. **DTM classification quality.** `-dtmClassify` and
    `-setSelectedClassAsGroundForDTM` exist; nothing documents how the
    classifier performs on image-derived vertices, or what its pre-defined
    classes are. A/B against PDAL SMRF/PMF before claiming bare earth.
11. **3D Tiles payload characteristics** — tile version, Draco, KTX2. Unmentioned
    in the CLI documentation. Measure the bytes of a real `-export3dTiles`.

**Assumptions made explicit** — each is a place this design could be wrong:

- That the Remote Command Plugin is available at an affordable tier. If it is
  enterprise-only, the headless story reverts to the CLI and its reported hangs.
  Note the passive notification mode is documented on the same page, so the
  fallback may be better than the draft assumed.
- That the reported XMP-sidecar rewriting is real. No Epic page addresses it
  either way. We isolate inputs regardless, because the cost is one copy.
- That paRSer can emit JSON. This is now *by construction* rather than by
  assumption — a template is literal text with substitutions — but no sample has
  been seen.
- That 12 GB VRAM suffices for a 500–800 image aerial Capture. The draft called
  this undocumented; it is not.
  [`hardware-and-software-requirements`](sources/hardware-and-software-requirements.md)
  states that *"Most processing tasks utilize advanced out-of-core techniques,
  meaning system RAM is not a performance-limiting factor"*, that *"16 GB of RAM
  is typically sufficient for processing thousands of high-resolution images,
  provided a component workflow is used"*, and — the actionable knob — that
  *"Reducing feature count per image from the default (e.g., 40,000) to a lower
  value (e.g., 20,000) can double the number of images processed within the same
  memory limits"*, which is `sfmMaxFeaturesPerImage`. Note the two pages disagree
  on the GPU floor: this page says "At least 1 GB of VRAM" while
  [`realityscan-for-linux`](sources/realityscan-for-linux.md) requires "NVIDIA GPU
  with at least 8 GB VRAM" — take the Linux figure. The GPU is shared with ~40
  containers, so the component workflow and a tuned `sfmMaxFeaturesPerImage` are
  the levers, not more VRAM.

**Out of scope, deliberately**: LiDAR ingestion and LiDAR-derived workflows.

**The meta-uncertainty, restated**: the first draft rested on search-engine
summaries of pages nobody opened. Those pages have now been fetched and saved to
[`sources/`](sources/), and sixteen of the draft's claims were contradicted. What
remains is a *documented* account of RealityScan's CLI surface, which is not the
same as a *measured* account of the engine's behaviour. **Tier 1 still gates
everything, and nothing should be committed before it runs.**
