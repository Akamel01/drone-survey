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
│    *.rscmd  ·  export *.xml  ·  *.rcortho  ·  *.rsbox           │
│    *.parser (JSON-emitting report template)                     │
└─────────────────────────────────────────────────────────────────┘
```

**The boundary rule**: the engine receives a job-scoped working directory, a set
of versioned template files, and a command sequence. It returns artifacts and a
JSON report. **It makes no decisions.** Every decision — retry, placement,
pass/fail, what to deliver — belongs to the orchestration layer.

**Preferred integration surface: the Remote Command Plugin (gRPC/REST).**
Not the bare CLI. Three reasons: it is Epic's documented answer for
Docker/headless; it offers genuine process control including abort, which is
the only real defence against a hang; and it avoids the dialog-with-no-display
problem that is the reported cause of headless failures. The CLI remains the
fallback if the plugin proves tier-locked (T1.3).

### The Windows configuration seat

An unavoidable component, and the least comfortable part of this design:

```
Windows machine + RealityScan GUI
        │  authors, by hand, once per configuration
        ▼
  export *.xml · *.rcortho · *.parser templates
        │  committed to the repository, versioned
        ▼
  Linux production host replays them headlessly
```

It is **not on the per-job critical path**, so gate F3 holds. But it means
configuration changes require a human on a Windows box, which caps how
dataset-adaptive the pipeline can be to whatever the `-set` keys expose.

**Test early whether `.rcortho` and the export XML are hand-writable.** They are
very likely XML. If we can generate them from our own data — per-Site extents,
per-job GSD — the Windows dependency shrinks to bootstrapping, and the design
improves substantially. This is a cheap test with a large payoff.

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
| 9 | Georeferencing | RS | CRS commands + GCP/measurement CSV import | + control → georeferenced | bad GCP; wrong CRS | per-point residuals |
| 10 | Component selection | RS | `-selectMaximalComponent` / `-mergeComponents` | → one component | **silent discard of the rest** | share gate, again |
| 11 | Region | RS | `-setReconstructionRegion <Site>.rsbox` | → bounded region | region excludes Site | region vs Site boundary |
| 12 | Reconstruction | RS | `-calculateNormalModel` | → mesh | **hang (T1.2)**; OOM; empty | **external watchdog**; mesh loads, faces > 0 |
| 13 | Point cloud | RS | export from mesh vertices | → LAS/PLY | sparse coverage | PDAL completeness |
| 14 | Simplify | RS | `-simplify <N>` | → LoD mesh | over-decimation | triangle count |
| 15 | Mesh repair | **ext** | MeshLab / trimesh | → repaired | non-manifold | trimesh validity |
| 16 | Re-import | RS | Model Import into calibrated component | → mesh in project | wrong component | mesh present |
| 17 | Texturing | RS | `-calculateTexture` | → textured | ghosting; seams | Pillow/OpenCV sanity + calibration review |
| 18 | Ortho / DSM | RS | `-calculateOrthoProjection <f>.rcortho` → `-exportOrthoProjection` | → GeoTIFF | empty ortho; voids | **GDAL coverage ≥ 99%** |
| 19 | **DTM** | **ext** | PDAL SMRF/PMF ground filter | cloud → bare earth | misclassification | compare to control area |
| 20 | COG | **ext** | GDAL | GeoTIFF → COG | invalid COG | **existing COG validator** |
| 21 | Contours / sections | RS or ext | RS export, or GDAL | → SHP/DXF | CLI verb unconfirmed | opens in QGIS |
| 22 | Survey analysis | **ext** | rasterio / PDAL / Shapely | → Measurements | — | recompute independently |
| 23 | **COLMAP export** | RS | `-exportRegistration` | → cameras/images/points3D | distortion mismatch | camera count, model type |
| 24 | Splat fitting | **ext** | splatfacto / OpenSplat | COLMAP → splat | unchanged | existing gate |
| 25 | 3D export | RS | `-exportModel <m> <settings>.xml` | → OBJ/GLB/FBX/… | XML template drift | independent reader per format |
| 26 | 3D Tiles | RS or ext | LoD export (**verb unconfirmed**) or Cesium Reality Tiler | → tileset | **may be GUI-only** | tileset.json loads |
| 27 | Reports | RS | paRSer **JSON template** | → JSON + HTML | template drift | schema validation |
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
| **DTM** | survey | **no (heuristic)** | — | — | **yes** | **Cannot replace** | T3.4 | **high** |
| Contours | opt | yes | **verb ?** | ? | maybe | **Unknown** | — | med |
| **Orthomosaic** | yes | yes | yes | no | no | **With config** | **T3.5** | med |
| GSD / extent control | yes | yes | `.rcortho` | **authored in GUI** | no | **With config** | — | med |
| Volume measurement | opt | **yes** | **no** | **yes** | **yes** | **+ external** | — | med |
| Distance / area query | yes | no CLI | — | — | **yes** | **Cannot replace** | T3.2 | low |
| Checkpoint RMSE | survey | not found | — | — | **yes (ours)** | **Cannot replace** | T3.2 | **high** |
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
- **Unknown**: 4, of which **checkpoints, 3D Tiles CLI, and determinism** are
  the ones that can move the verdict.

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

**Phase 2 — Configuration foundation (≈2 weeks).** Stand up the Windows seat.
Author and commit: export XML templates per format, `.rcortho` templates,
`.rsbox` generation from Site boundaries, and the **JSON-emitting paRSer
template**. Test whether `.rcortho`/export XML are hand-writable — a yes here
materially improves the architecture. Retrieve the full Keys and Values
reference and pin the `-set` keys.

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

**Blocking unknowns** (any could change the verdict):

1. Whether headless reconstruction works at all on Linux without a display.
2. Whether free/standard tiers permit CLI/headless use.
3. Whether activation survives ephemeral rented GPUs non-interactively.
4. Whether output is deterministic — **no vendor statement found anywhere**.
5. Whether checkpoints (excluded-from-solve) are supported.
6. Whether 3D Tiles export has a CLI verb.

**Documentation gaps** (retrievable with working network access):

7. The literal `-set` key strings — the entire alignment/reconstruction config
   surface. Largest single gap.
8. Exact CLI verbs: GCP import, `-exportReport`, LoD/Tiles export.
9. Depth-map resolution and vertex-distance keys.
10. Whether a real JSON paRSer sample ships.
11. Exact GCP/checkpoint residual variable names.

**Assumptions made explicit** — each is a place this design could be wrong:

- That the Remote Command Plugin is available at an affordable tier. If it is
  enterprise-only, the headless story reverts to the CLI and its reported hangs.
- That `.rcortho` and export XML are hand-writable. If not, the Windows seat
  becomes a routine operational dependency rather than a bootstrap one.
- That the reported XMP-sidecar rewriting is real. We isolate inputs either way,
  because the cost of doing so is one copy.
- That paRSer can emit JSON. If not, QA rests on our own artifact computation
  alone — workable, but we lose the engine's internal statistics.
- That 12 GB VRAM suffices for a 500–800 image aerial Capture. **No documented
  image-count-per-VRAM guidance exists**, and the GPU is shared with ~40
  containers.

**Out of scope, deliberately**: LiDAR ingestion and LiDAR-derived workflows.

**The meta-uncertainty, stated plainly**: this document rests on search-engine
summaries of pages that were never opened, because the egress policy blocked
every primary source. The reasoning is sound given the inputs. The inputs are
one tier weaker than this decision deserves. **Phase 0 exists to fix that, and
nothing should be committed before it runs.**
