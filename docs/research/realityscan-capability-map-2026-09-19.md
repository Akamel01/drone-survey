# RealityScan capability map — all 18 in-scope domains

Written 2026-09-19. Companion to
[gates](realityscan-gates-2026-09-19.md),
[domain model](realityscan-domain-model-2026-09-19.md) and
[validation program](realityscan-validation-2026-09-19.md).

## Evidence health — read this before anything else

This environment's egress policy returned **403 for every primary source**:
`dev.epicgames.com`, `rshelp.capturingreality.com`, `capturingreality.com`,
`forums.unrealengine.com`, `web.archive.org`, and text-extraction proxies.
Only `github.com` and search were reachable.

Consequently **no claim in this document is tagged `VERIFIED` unless a file was
actually fetched.** Exactly one was. Everything else derived from documentation
is `SUPPORTED` — meaning a search engine summarised a page that no one opened.

Tags used: **VERIFIED** (fetched and read) · **SUPPORTED** (official page
summarised, not opened) · **INFERRED** (follows logically, not stated) ·
**REQUIRES TEST** (must be measured) · **UNKNOWN** (no evidence found).

The honest summary of this document's status: it is a **well-founded hypothesis
about RealityScan, not a verified account of it.** It is sufficient to decide
whether to run the tier-1 tests. It is not sufficient to commit to a migration.

## The one thing that was actually verified

`github.com/EpicGames/RealityScan` is **not** the RealityScan engine, SDK, or
CLI source. It is `pano2views`, a small JavaScript/WebGL2 utility converting
360° panoramas to cubemap faces — roughly eight files. **VERIFIED** (fetched).

The brief's instruction not to assume the repository holds the core engine was
correct, and stronger than it needed to be: it holds nothing relevant to this
evaluation at all. No official open-source engine, CLI or SDK exists on GitHub.

## The structural finding

Two separately-reported facts combine into the defining constraint:

1. Export settings are supplied to the CLI as an XML block extracted from an
   `.rcinfo` file that the **GUI Export dialog** writes. Ortho-projection
   parameters likewise come from a `.rcortho` file produced by ticking "Export
   projection parameters file" **in the GUI**. *(SUPPORTED)*
2. The Linux build is reported to be a Windows binary inside a bundled Wine
   environment, positioned as **CLI-only with no full desktop UI**. *(SUPPORTED)*

Therefore: **RealityScan's headless mode is not parameterised automation, it is
replay of configuration authored in a GUI — and that GUI is not available on the
platform we would run production on.** *(INFERRED, high confidence)*

The consequences are concrete and shape every later section:

- A **Windows GUI seat is a permanent component of the system**, not a migration
  aid. It exists to author and version configuration templates.
- Configuration templates become **first-class versioned artifacts** checked
  into the repository, which fits the existing Profile-versioning model well.
- **Any parameter not anticipated at authoring time requires a human, a Windows
  machine and a GUI session.** Dataset-adaptive behaviour is limited to the
  subset of parameters expressible through `-set` keys.
- This does not fail gate F3, because no GUI step sits on the **per-job**
  critical path. It is a CONDITIONAL GO shape: acceptable with the constraint
  documented and the template library maintained.

This is also why "can the CLI do X?" is the wrong question throughout. The right
question is: **"can X be expressed in a template authored once, or does it need
to vary per dataset?"**

---

## Domain-by-domain

Columns: **Native** · **CLI/scriptable** · **GUI-only** · **External tool
needed** · **Evidence**.

### 1. Input

| Capability | Native | CLI | GUI-only | External | Evidence |
|---|---|---|---|---|---|
| Add image folder | yes | `-addFolder <path>` | no | no | SUPPORTED |
| Add individual images / image list | yes | `-add <path>` | no | no | SUPPORTED |
| Image + explicit calibration | yes | `-addImageWithCalibration` | no | no | SUPPORTED |
| EXIF / XMP metadata read | yes | automatic on add | no | no | SUPPORTED |
| GPS/GNSS priors | yes | from EXIF/XMP | no | no | SUPPORTED |
| Camera position/orientation priors | yes | XMP sidecar | no | no | SUPPORTED |
| Image masking (assignment) | yes | filename convention `<name>.mask.png` | no | no | SUPPORTED |
| Image mask **generation** (AI) | yes | — | **yes** | yes | SUPPORTED |
| Multiple flights in one project | yes | repeated `-addFolder` | no | no | INFERRED |
| Multiple cameras/lenses | yes | per-camera calibration groups | no | no | SUPPORTED |
| Import existing component | yes | `-importComponent` | no | no | SUPPORTED |
| Project file inspectable | yes | `.rcproj`/`.rsinfo` are XML | no | no | SUPPORTED |
| Video-derived frames | partial | — | 360° workflow is a manual tutorial | yes | SUPPORTED |
| **Pre-processing image validation** | **no** | — | — | **yes** | INFERRED |
| **Behaviour on missing/invalid EXIF** | — | — | — | — | **UNKNOWN — T2.8** |

**Read**: ingestion is genuinely scriptable and the masking convention is a gift
— externally generated masks are picked up with zero interaction. Two gaps
matter. There is no documented input-validation stage, so ours stays
(`exif-audit`, `filter` are not replaced). And the engine's behaviour on bad
metadata is undocumented — it must be measured, because a silent default
focal-length substitution would corrupt a survey quietly.

**One undocumented hazard**, from a third-party production pipeline: RealityScan
reportedly **rewrites and relocates XMP sidecars inside the input folder** during
alignment. *(SUPPORTED, non-Epic source.)* If true, the input folder is not
read-only. **Never point the engine at the canonical image store** — always a
job-scoped copy. This is cheap insurance regardless of whether it is true.

### 2. Alignment

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Feature detection / matching / SfM | yes | `-align` | SUPPORTED |
| Alignment settings | yes | `-set <key> <value>`, presets | SUPPORTED |
| Image downscale factor | yes | `-set` key **name unconfirmed** | SUPPORTED / REQUIRES TEST |
| Detector sensitivity | yes | `-set` key **name unconfirmed** | SUPPORTED / REQUIRES TEST |
| Max features per image / per Mpx | yes | `-set` key **name unconfirmed** | SUPPORTED / REQUIRES TEST |
| Preselector features | yes | `-set` key **name unconfirmed** | SUPPORTED / REQUIRES TEST |
| Max reprojection error | yes | `-set` key **name unconfirmed** | SUPPORTED / REQUIRES TEST |
| Component creation | yes | automatic | SUPPORTED |
| Select largest component | yes | `-selectMaximalComponent` | SUPPORTED |
| Merge components | yes | `-mergeComponents` | SUPPORTED (third-party corroborated) |
| Export/import component | yes | `-exportComponent` / `-importComponent` | SUPPORTED |
| Alignment statistics export | probable | see domain 14 | REQUIRES TEST |

**Read**: the *capabilities* are confirmed; the **literal `-set` key strings are
not**. Every human-readable setting label is known and not one exact key is.
That is the single largest practical gap in this document, because the keys are
the entire configuration surface. First task with working network access:
retrieve the Keys and Values page in full.

**`-selectMaximalComponent` is a loaded gun.** Taking the largest component
silently discards everything else. If a Capture splits 60/40, the pipeline
produces a confident, clean, half-site deliverable. Gate on the selected
component's *share* of registered images, not merely on component count
(T2.14).

### 3. Georeferencing

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| GPS/GNSS camera positions | yes | from EXIF/XMP | SUPPORTED |
| GCP 3D positions from CSV | yes | file-driven import | SUPPORTED |
| **GCP 2D image measurements from file** | **yes** | Control Points Measurements Import CSV | **SUPPORTED** |
| Per-point accuracy / weights | yes | column in the control file; `groundcontrol.xml` | SUPPORTED |
| Checkpoints (excluded from solve) | probable | — | REQUIRES TEST |
| Set project / output CRS | yes | `-setProjectCoordinateSystem`, `-setOutputCoordinateSystem` (EPSG) | SUPPORTED |
| Geoid / vertical datum | probable | — | UNKNOWN |
| GCP residuals, numeric | probable | GUI shows orange vectors; numeric export unconfirmed | REQUIRES TEST |
| **Wrong-CRS detection** | **no** | — | SUPPORTED (absence) |
| Exact CLI verb for GCP import | — | — | **UNKNOWN** |

**Read — and this is the good news of the whole evaluation**: the question that
would have ended it doesn't. GCP *image observations* can be supplied from a
CSV (image, point name, pixel X, pixel Y). GCP placement does **not** inherently
require GUI clicking. Fully automated georeferencing is achievable in principle.
The exact CLI verb triggering the import is unconfirmed, which is a detail, not
a blocker.

**The bad news is symmetrical**: there is **no wrong-CRS detection**. The
reported failure mode is that a mismatched project/output CRS surfaces as an
invalid `.obj` at export — downstream, after hours of compute, and in a form
that may not be obviously wrong. Gate C3 treats silent CRS mismatch as
critical, so **we must build the plausibility check ourselves**: compare the
GNSS bounding box against the declared EPSG before processing starts. It is a
few lines of `pyproj` and it is the highest-value piece of own-code in this
design.

### 4. Point clouds (non-LiDAR)

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Sparse / tie-point cloud | yes | export via registration / sparse export | SUPPORTED |
| **Dense point cloud** | yes, **derived from mesh vertices** | downstream of meshing | SUPPORTED |
| Export LAS | yes | via export settings | SUPPORTED |
| Export PLY / XYZ / PTS / PTX / CSV | yes | via export settings | SUPPORTED |
| Export LAZ | probable | seen in import context | REQUIRES TEST |
| **Export E57** | **import only in evidence** | — | **UNKNOWN — do not promise** |
| Point filtering / outlier removal | GUI | no CLI found | SUPPORTED (absence) |
| Ground classification from imagery | **doubtful** | built around ASPRS LiDAR classes | UNKNOWN — T3.4 |
| Reconstruction region | yes | `-setReconstructionRegionAuto`, `-setReconstructionRegion <f>.rsbox`, `-exportReconstructionRegion`, `-setReconstructionRegionOnCPs` | SUPPORTED |

**Read**: the dense cloud being **made of mesh vertices** inverts the normal
pipeline. There is no cheap "dense cloud only" path — meshing must be paid for
first. That changes runtime estimates and stage ordering, and it means point
density is governed by meshing parameters rather than by a depth-map density
setting.

Point-level filtering has **no CLI equivalent** — this goes to PDAL/CloudCompare
and is not a loss, since those tools are better at it anyway.

### 5. 3D reconstruction

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Quality tiers | yes | `-calculatePreviewModel` / `-calculateNormalModel` / `-calculateHighModel` | SUPPORTED |
| Reconstruction region | yes | as above, `.rsbox` file | SUPPORTED |
| Depth-map resolution key | probable | **key name not found** | UNKNOWN |
| Min/max vertex distance | probable | **key name not found** | UNKNOWN |
| Failure detection | partial | `-set "appQuitOnError=true"`; crash → exit 3 | SUPPORTED |
| Resume model calculation | yes | autosave ≈15 min; `-continueModelCalculation`, `-load … recoverAutosave` | SUPPORTED |
| **Alignment-stage resume** | **no evidence** | — | **UNKNOWN — assume none** |

**Read**: the three quality tiers are confirmed and are the main standardised
config choice. The sub-parameters beneath them are not retrievable and must be
treated as unknown.

**Reconstruction is the reported failure point for headless operation** — two
independent reports of `-calculateNormalModel`/`-calculateHighModel` hanging
indefinitely or failing with a misleading "No model is selected" in headless
Docker/Linux. This is exactly where T1.2 aims. A hang does not self-terminate,
so an **external watchdog is mandatory**, not optional.

### 6. 3D editing

| Capability | CLI | Evidence |
|---|---|---|
| Simplify / decimate | `-simplify <N>` | SUPPORTED |
| Smooth | `-smooth` (params unconfirmed) | SUPPORTED |
| Select model / maximal component | `-selectModel`, `-selectMaximalComponent` | SUPPORTED |
| Reconstruction-region crop | `.rsbox` before reconstruction | SUPPORTED |
| **Close holes** | **none found** | SUPPORTED (absence) |
| **Post-hoc mesh crop (Cut By Box)** | **none found** | UNKNOWN |
| **Fine geometry removal** | **none found** | SUPPORTED (absence) |
| **Mesh splitting / tiling** | **none found** | SUPPORTED (absence) |
| **Retopology** | **feature appears absent entirely** | SUPPORTED (absence) |
| Model import (external mesh) | yes, into the aligned component | SUPPORTED |

**Read**: this is the weakest domain and the answer is clean — **crop before
reconstruction via `.rsbox`, do all post-hoc editing externally.** The region
box is scriptable and exportable, so the Site boundary can drive it directly
from our own data. Hole-filling, fine cleanup, splitting and retopology go to
MeshLab/CloudCompare/Instant Meshes. That is not a defeat; those tools are
purpose-built and free.

The **Model Import** capability is what makes the round-trip viable — see
domain 7.

### 7. Texturing

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| UV unwrap (Geometric, Mosaicing) | yes | via settings | SUPPORTED |
| Texel size, gutter (default 2px) | yes | settings | SUPPORTED |
| Max texture resolution to 16384² | yes | settings | SUPPORTED |
| Texture count / tiling style | yes | settings | SUPPORTED |
| **UDIM** | **yes** | tile-type option | SUPPORTED |
| Calculate texture | yes | `-calculateTexture` | SUPPORTED |
| Colour correction during texturing | yes | settings | SUPPORTED |
| **Texture reprojection** | **yes** | documented retexture path | SUPPORTED |
| Normal / displacement baking | yes | via reprojection | SUPPORTED |
| Ambient occlusion baking | **not found** | — | UNKNOWN — do not claim |
| **Re-texture an external mesh from original photos** | **yes** | Model Import into the calibrated component, then `-calculateTexture` | SUPPORTED |

**Read**: the strongest domain, and it resolves the hardest architectural
question in the brief. An externally retopologised or repaired mesh can be
imported into the component holding the calibrated cameras and textured from the
**original imagery** — not resampled from an existing texture. That makes a
genuine external round-trip possible rather than lossy:

```
RealityScan mesh → MeshLab/Instant Meshes (repair, retopo) → Model Import
  → -calculateTexture from original photographs → export
```

UDIM being real is worth noting because it is commonly assumed absent.

### 8. Terrain

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| DSM | yes — mesh altitude layer via ortho pipeline | `-calculateOrthoProjection` | SUPPORTED |
| **DTM** | **scene-type heuristic, not bare-earth classification** | `.rcortho` `DTMParams`/`ClassificationParams`, `modelType` enum | SUPPORTED |
| Contours / isolines | yes | export path exists; **CLI flag unconfirmed** | SUPPORTED / UNKNOWN |
| Cross-sections | yes | SHP/DXF export | SUPPORTED |
| Terrain QA | **none** | — | SUPPORTED (absence) |

**Read**: **this is the trap the brief warned about, and it is real.** The
"DTM" is driven by a `modelType` enum — `industrial_complex`, `mixed`, `city`,
`nature`, `meadows`, `countryside`, `mountains` — which is a scene-type
heuristic, not a ground-filtering algorithm over image-derived points. No
documentation describes an actual ground-vs-object classification.

**Do not treat RealityScan's DTM as bare earth for survey work.** If a genuine
DTM is required, ground classification belongs in PDAL (SMRF/PMF filters) over
an exported point cloud. Gate ES5 is CONDITIONAL at best.

### 9. Mapping

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Ortho projection | yes | `-calculateOrthoProjection <params>.rcortho` | SUPPORTED |
| Ortho export | yes | `-exportOrthoProjection <out>.tiff <exportParams>.xml` | SUPPORTED |
| GSD / resolution | yes | in `.rcortho` | SUPPORTED |
| Extent | yes | in `.rcortho` | SUPPORTED |
| Output CRS | yes | project/output CRS settings | SUPPORTED |
| Map Wizard CLI equivalent | **yes — the above is it** | GUI writes the params file, CLI replays it | SUPPORTED |

**Read**: orthomosaic generation is **fully unattended** — the strongest
replacement case against the current ODM path. The caveat is the structural
one: `.rcortho` is authored in the GUI and replayed. Per-Site extents and GSD
would need either a template per configuration or the params file generated by
us, if its schema turns out to be writable by hand. **Worth testing early**
(the file is likely XML), because hand-writable params would remove the Windows
dependency for this domain entirely.

### 10. Survey analysis

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| **Volume / cut-fill / stockpile** | **yes** | GUI; no CLI found | SUPPORTED |
| Ground Test precision validation | yes | GUI | SUPPORTED |
| GCP residual visualisation | yes | GUI (orange vectors) | SUPPORTED |
| Distance / coordinate / area query | **no CLI** | — | SUPPORTED (absence) |
| Checkpoint RMSE report | **not found** | — | UNKNOWN |
| Contours, cross-sections | export only | SHP/DXF | SUPPORTED |

**Read**: **RealityScan is a reconstruction engine with measurement tools bolted
on, not a survey-analysis platform.** Native volume measurement is a real and
pleasant surprise, but it is GUI-driven, which makes it useless to an automated
pipeline.

Essentially all of domain 10 moves to external tooling: GDAL/rasterio for
raster maths, PDAL for cloud analysis, Shapely/pyproj for geometry, our own code
for checkpoint RMSE. That is not a weakness of the proposal — it is where this
work belongs anyway, because these are the computations that must be auditable
and version-controlled.

### 11. 3D delivery

**Export mechanism**: `-exportModel <modelName> <exportSettingsXML>`.
**There is no inline-flag export configuration.** The XML is extracted from an
`.rcinfo` written by the GUI Export dialog. *(SUPPORTED.)*

Formats reported in Epic's export-formats KB *(all SUPPORTED)*: **OBJ** (+MTL),
**PLY**, **XYZ**, **FBX** (FBX201100–FBX2019, binary and ASCII), **GLB**,
**USD**, **USDZ**, **STL**, **DXF**, **Alembic** `.abc`, **Collada** `.dae`,
**3MF**, **PTX**, **LAS**, texture-only export, part-list metadata export.

Not evidenced — **do not promise**: plain `.gltf` (only `.glb` confirmed),
**KMZ from the model exporter**, VRML, X3D, **E57 export**.

Coordinate handling: output CRS under Settings; "Shifted project output" centres
geometry at origin and records the georeferenced offset in `.rcinfo`. LoD export
offers relative (%) or absolute (triangle count) simplification and preserves
geolocation when the source is georeferenced. *(SUPPORTED.)*

**Read**: format coverage is excellent and comfortably exceeds the current
pipeline. The constraint is again structural — **a checked-in library of export
XML templates, one per format/configuration**, each authored once on Windows.

### 12. GIS delivery

| Format | Status | Evidence |
|---|---|---|
| GeoTIFF / TIFF (LZW, BigTIFF) | supported | SUPPORTED |
| World file `.tfw` | supported | SUPPORTED |
| Embedded CRS in raster | supported, user-selectable | SUPPORTED |
| DSM / orthophoto raster | supported | SUPPORTED |
| "DTM" raster | supported, **but see domain 8** | SUPPORTED |
| Contours SHP/DXF | supported | SUPPORTED |
| Cross-sections SHP/DXF | supported | SUPPORTED |
| LAS / LAZ point cloud | supported (LAZ less certain) | SUPPORTED |
| KML/KMZ with tiling | supported **from the ortho/LoD paths** | SUPPORTED |
| **Cloud-Optimized GeoTIFF** | **not documented** | UNKNOWN |
| GeoPackage | not documented | UNKNOWN |
| E57 export | import only in evidence | UNKNOWN |

**Read**: the current pipeline delivers a **COG**, read directly by MapLibre over
HTTP range requests with no tile server (ADR 0011). COG is **not evidenced** as a
RealityScan output. So `export-cog` **stays** — GDAL converts the GeoTIFF.
That is a one-line node we already have, and it is also where the existing
COG-validation check lives, which we need regardless.

### 13. Web 3D

| Capability | Status | Evidence |
|---|---|---|
| LoD generation | yes, relative % or absolute triangle count | SUPPORTED |
| **Cesium 3D Tiles** | **yes — via the separate Level of Detail export dialog** | SUPPORTED |
| 3D Tiles version | **1.0 only** — `tileset.json` + `.b3dm` folder | SUPPORTED |
| 3D Tiles 1.1 (glTF content, implicit tiling) | **no** | SUPPORTED (absence) |
| Draco compression | **no** — Cesium's separate Reality Tiler | SUPPORTED |
| KTX2 / Basis textures | **no** — same | SUPPORTED |
| CLI verb for LoD/Tiles export | **unconfirmed** — may not be `-exportModel` | **UNKNOWN — top domain-13 risk** |

**Read**: native 3D Tiles is a genuine capability the current pipeline lacks —
but it is **1.0 b3dm**, a decade-old tile format without modern geometry or
texture compression. For client-facing web delivery over object storage, payload
size is the binding constraint, so b3dm without Draco/KTX2 is a meaningful
limitation. Reaching 1.1 + Draco + KTX2 needs Cesium's Reality Tiler or an
equivalent external step.

And the **CLI verb is unconfirmed** — if 3D Tiles export turns out to be
GUI-only, domain 13 fails F3 and drops out of the automated pipeline entirely.
That is the highest-value unknown in the second tier of testing.

### 14. QA

| Metric | Obtainable unattended | Mechanism | Evidence |
|---|---|---|---|
| Alignment statistics | yes | paRSer `$ComponentStats` | SUPPORTED |
| Registered vs unregistered cameras | yes | `$IterateCameras`, component stats | SUPPORTED |
| Reprojection error — mean/median/max, px | yes | `$ComponentStats` | SUPPORTED |
| Reprojection error — per camera | yes | `$CameraErrors` | SUPPORTED |
| Control-point measurements / residuals | yes | `$ExportControlPointsMeasurements` + control-point functions | SUPPORTED; **exact variable names unconfirmed** |
| Checkpoint errors | probable | same family | REQUIRES TEST |
| Georeferencing accuracy | yes | "Registration and Georeferencing Accuracy Report" | SUPPORTED |
| Point / component counts | yes | paRSer iteration | SUPPORTED |
| Exit state | yes | exit 0 / code with `appQuitOnError=true` / 3 on crash | SUPPORTED |
| **Point-cloud completeness** | **no** | external — PDAL/laspy/open3d | SUPPORTED (absence) |
| **Reconstruction completeness** | **no** | external | SUPPORTED (absence) |
| **Mesh validity (manifold, holes)** | **no CLI** | GUI "Check Topology"; external trimesh/MeshLab | SUPPORTED (absence) |
| **Texture validity** | **no mechanism found at all** | external Pillow/OpenCV | SUPPORTED (absence) |
| **DSM/DTM/ortho raster validity** | **no** | external GDAL/rasterio | SUPPORTED (absence) |
| **Output-file integrity** | **no**, beyond "exited 0" | external readers | SUPPORTED (absence) |
| **Coordinate-system correctness** | **no** — engine's own check is a visual map-drag | external pyproj bounds check | SUPPORTED (absence) |

**Read**: the split is clean and it validates the domain model's separation of
Processing from Assurance. RealityScan is genuinely good at reporting **what it
did internally** — reprojection error, camera registration, control-point
measurements. It reports **almost nothing about whether the artifacts it wrote
are any good**. Texture validity has no mechanism whatsoever.

That is exactly the failure class this repo has already been burned by: an
engine exiting cleanly having written an 87%-empty orthophoto. **Every
artifact-level QA check must be ours, computed with independent readers.** The
engine's statistics are an input to the verdict, never the verdict — which is
what gate C5 and the Report entity already require.

Gate construction on what is genuinely available:

- **FAIL** — non-zero exit; registered-camera ratio below threshold; mean or
  checkpoint reprojection error above threshold; any artifact-level external
  check failing; CRS bounds check failing.
- **PASS WITH WARNING** — borderline registration ratio; completeness within
  tolerance but trending; artifact present but suboptimal.
- **REQUIRES MANUAL REVIEW** — **zero-checkpoint projects**, where no
  independent accuracy evidence exists at all; and the dangerous combination of
  *low reprojection error with a coverage gap*, which is the signature of a
  confident reconstruction of the wrong subset of the Site.
- **PASS** — all of the above clear.

That third category deserves emphasis. **Low reprojection error is not evidence
of a good result** — it measures self-consistency, not correctness. A split
component reconstructed beautifully will report excellent error. Only coverage
and checkpoints catch it.

### 15. Automation

| Mechanism | Status | Evidence |
|---|---|---|
| CLI, sequential hyphenated args | yes | SUPPORTED |
| `-headless` (UI to tray icon) | yes | SUPPORTED |
| `-silent <dir>` suppresses crash dialogs | yes | SUPPORTED |
| `.rscmd` files via `-execrscmd <path>` | yes; comments `#`/`//`/`REM`, continuation `^`, vars `$(cmdStartDir)`, `$(arg1..9)` | SUPPORTED |
| `-set <key> <value>` | yes; **key strings largely unconfirmed** | SUPPORTED |
| Exit code 0 = success | yes | SUPPORTED |
| **Non-zero propagation requires `-set "appQuitOnError=true"`** | yes | SUPPORTED |
| Crash → exit 3 + minidump | yes | SUPPORTED |
| `results_<instance>.log` / `errors_<instance>.txt` | yes | SUPPORTED |
| `-writeProgress <file> <timeout>` | yes | SUPPORTED |
| Local parallelism: up to 4 instances | yes; `-delegateTo`, `-setInstanceName` | SUPPORTED |
| **Remote Command Plugin (gRPC/REST), 2.1+** | yes; abort/pause/resume, fleet offload, Docker documented | SUPPORTED |
| Model-stage resume | yes; autosave ≈15 min | SUPPORTED |
| Alignment-stage resume | **no evidence** | UNKNOWN |
| Determinism | **no statement found anywhere** | **UNKNOWN — T4.10** |
| Free-tier CLI entitlement | **unconfirmed** | **UNKNOWN — T1.4** |

**Read**: `appQuitOnError=true` is the most important single string in this
document. **Without it, a failed command does not propagate a non-zero exit
code** — the pipeline would read failure as success. It belongs in every
invocation, unconditionally, and its absence should be a lint error in our own
code.

**The Remote Command Plugin is probably the correct integration surface**, not
the bare CLI: it is Epic's documented answer for Docker/headless, it offers real
process control (abort matters when jobs hang), and it sidesteps the dialog
problem that has no display server to draw on.

### 16. External processing

No capability was classified **redundant-because-RealityScan-does-it**. Full
table in the boundary section below.

### 17. Gaussian splatting

**RealityScan does not natively support Gaussian Splatting** — no training, no
native 3DGS export, no GUI/CLI feature — as of 2.1.1/2.2, evidence through
≈June 2026. *(SUPPORTED, leaning confirmed-absent.)*

The strongest evidence is structural rather than textual: an Epic Developer
Community thread requesting 3DGS sits under **Feedback & Requests**. Users do
not request features that exist. Release notes for 2.1, 2.1.1 and 2.2 describe
COLMAP/XMP export improvements, AMD GPU support and 360° capture — no 3DGS.

**Disambiguation, explicitly flagged**: an Epic tutorial "Introduction to
Gaussian Splatting in Unreal Engine" carries a `realityscan-*` URL slug but
concerns rendering splats *inside Unreal* via Niagara. It is not a RealityScan
desktop capability and must not be cited as one.

**But the integration story is strong.** RealityScan exports camera registration
in **COLMAP format** (`cameras.txt`, `images.txt`, `points3D.txt`) — present
since RealityCapture 1.5 and **substantially expanded in 2.1.1**: flat-folder or
standard COLMAP layout, binary and ASCII, mask handling, and **automatic
filtering of low-accuracy points**. Release notes reportedly frame this as
feeding downstream training pipelines directly. CLI mechanism is
`-exportRegistration`; exact syntax REQUIRES TEST.

Provisional distortion-model mapping *(needs confirmation)*: Division →
SIMPLE_PINHOLE, Brown3 → SIMPLE_RADIAL, Brown4 → OPENCV_FISHEYE,
Brown3+tangential2 → OPENCV, Brown3/4+tangential2 → FULL_OPENCV.

**This matters more than it first appears.** ADR 0004 records a real defect in
the current path: the ODM→nerfstudio conversion **forces the principal point to
the image centre and degrades silently**, and the native importer needs files
ODM writes only at the end of a full run — so ODM cannot be stopped early. A
proper COLMAP export with a real distortion model would fix both problems at
once. **RealityScan replacing COLMAP/ODM as the pose provider for splatting is
the single most attractive, lowest-risk adoption in this entire evaluation**,
and it can be trialled without touching anything else.

### 18. Reports

**paRSer** is a text-substitution templating language — `$(variable)` and
`$FunctionName(...)` — **not a fixed report format**. The shipped default
templates are HTML, but a template is literal text with substitutions dropped
in, so **the output format is a template-authoring choice**. *(SUPPORTED.)*

This is the answer the QA subsystem needed. **JSON and CSV emission are
achievable by writing a template that emits them.** Epic's 2.1 messaging
reportedly states the rebuilt templating system lets teams output structured
project metadata in JSON, with samples included. *(SUPPORTED — the single
highest-value unconfirmed claim in this evaluation; confirm hands-on.)*

| Item | Status | Evidence |
|---|---|---|
| Built-in templates | Overview; Registration and Georeferencing Accuracy; Selected Component | SUPPORTED |
| HTML output | yes (default templates) | SUPPORTED |
| PDF output | not found | UNKNOWN |
| Custom templates | yes | SUPPORTED |
| **Arbitrary output format incl. JSON** | **yes, by template** | SUPPORTED |
| Statistical variables | `$ComponentStats`, `$CameraErrors`, `$IterateComponents`, `$IterateCameras`, control-point functions | SUPPORTED |
| CLI verb (`-exportReport`?) | **exact syntax unconfirmed** | UNKNOWN |

**Read**: write **one paRSer template that emits JSON**, treat it as a versioned
artifact in the repository beside the export XML templates, and have the
pipeline parse its output into QA Results. This removes HTML scraping — which
would have been brittle across engine versions — from the design entirely.

A human-readable HTML report is still generated for the client deliverable, but
it is **derived from the same data**, not the source of truth. The client's
report and the pipeline's gate then cannot disagree, which is what gate C5 is
protecting against.
