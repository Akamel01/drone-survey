# RealityScan capability map — all 18 in-scope domains

Written 2026-09-19 by a cloud session working from search summaries.
**Re-verified 2026-09-19 by a local session against the official documentation.**
Companion to
[gates](realityscan-gates-2026-09-19.md),
[domain model](realityscan-domain-model-2026-09-19.md) and
[validation program](realityscan-validation-2026-09-19.md).

## Evidence health — read this before anything else

The cloud session that wrote the first draft had an egress policy that returned
403 for `dev.epicgames.com`, `rshelp.capturingreality.com`, `capturingreality.com`,
`forums.unrealengine.com` and `web.archive.org`. Only `github.com` and search were
reachable, so every documentation-derived claim was a search-engine summary of a
page nobody had opened.

This session's egress is unrestricted. **82 official documentation pages were
fetched and saved** under [`sources/`](sources/), each with its URL, HTTP status
and fetch time in a header comment. Every `VERIFIED` tag below is backed by a
string that can be grepped out of one of those files.

Tags used:

- **VERIFIED** — an official page in `sources/` states it. Command names are
  checked against [`sources/all-commands.md`](sources/all-commands.md), setting
  keys against [`sources/keys-and-values.md`](sources/keys-and-values.md).
- **CONTRADICTED** — an official page says otherwise than the first draft did.
  These are listed together in [Demotions](#demotions) and are the most valuable
  output of the re-verification.
- **SUPPORTED** — a page was opened but leaves it ambiguous, or the only source
  is non-Epic.
- **INFERRED** — follows logically, not stated.
- **REQUIRES TEST** — documentation cannot settle it; it must be measured.
- **UNKNOWN** — not found in any of the 82 pages. Stronger than the first draft's
  `UNKNOWN`, which meant "not found in search results".

Two structural facts about the documentation shape everything below:

1. **The `-set "key=value"` keys are documented.** `keys-and-values` lists 116
   global setting keys with value types and defaults; `configure-selected-items`
   lists a further 57 per-item keys for inputs, control points, constraints and
   ortho projections. The first draft called the missing key strings "the single
   largest practical gap in this document". They were a page away.
2. **Nearly every export and tool command takes an *optional* `params.xml`**,
   described as "using the **current settings** or the settings from the
   `params.xml`". Current settings are what `-set` and
   `-importGlobalSettings <settings.rcconfig>` define. The XML is a convenience,
   not a precondition — see [The structural finding](#the-structural-finding).

Status of this document after re-verification: **a documented account of what
RealityScan's CLI exposes.** It is still not a measured account of what the
engine does when run — that is what the tier-1 probe is for, and no amount of
documentation substitutes for it.

## The one thing that was verified before

`github.com/EpicGames/RealityScan` is **not** the RealityScan engine, SDK, or
CLI source. It is `pano2views`, a small JavaScript/WebGL2 utility converting
360° panoramas to cubemap faces — roughly eight files. **VERIFIED** (fetched by
the cloud session, still true).

## The structural finding

The first draft's defining claim was:

> RealityScan's headless mode is not parameterised automation, it is replay of
> configuration authored in a GUI — and that GUI is not available on the platform
> we would run production on. Therefore a **Windows GUI seat is a permanent
> component of the system**.

**Half of this survives. The half that fails is the half the architecture rested
on.**

What the documentation confirms:

- Parameter files are real and are GUI-authored. *"Use the RealityScan UI
  (Windows or Linux Wine) to create and save an XML file containing export
  parameters and settings. This file can then be referenced and reused in CLI
  commands."* — [`installation-linux`](sources/installation-linux.md). **VERIFIED.**
- The ortho parameters file is the same story: *"You can obtain params.rsortho by
  exporting an orthographic projection in the GUI and setting Export projection
  parameters file to True."* — [`model-tools`](sources/model-tools.md).
  **VERIFIED** (note the extension is `.rsortho`, not `.rcortho`).

What the documentation contradicts:

- **The parameter file is optional on every command that accepts one.**
  `-exportModel modelName fileName [params.xml]`, `-simplify [targetTriangleCount
  OR params.xml]`, `-calculateOrthoProjection [.rsortho] [.rsbox]`,
  `-dtmClassify [params.xml]` — all documented as "using the **current settings**
  or the settings from the params.xml file (optional parameter)".
  **CONTRADICTED.**
- **Current settings are settable headlessly**: 116 global `-set` / `-preset` keys, plus
  `-editInputSelection`, `-editControlPointSelection`, `-editConstraintSelection`
  and `-editOrthoProjectionSelection` for per-item settings, plus
  `-exportGlobalSettings settings.rcconfig` / `-importGlobalSettings
  settings.rcconfig` for the whole application state as one checked-in file.
  **VERIFIED.**
- **The authoring UI runs on Linux.** *"The desktop UI can be launched, but its
  use is not recommended due to graphical glitches, window focus issues, and
  unsupported HTML dialogs"* — [`realityscan-for-linux`](sources/realityscan-for-linux.md);
  *"The UI is available for troubleshooting only"* —
  [`installation-linux`](sources/installation-linux.md). A UI exists on Linux; it
  is discouraged, not absent. **CONTRADICTED** (the draft said "no full desktop UI").

So the corrected shape is:

> Headless RealityScan is parameterised automation through `-set` and a
> `.rcconfig`, **plus** an optional per-dialog XML for the settings that only a
> dialog exposes. A GUI is needed to author those XML files, and that GUI can be
> the bundled Wine one on the same Linux host. **No Windows machine is required.**

The consequences change accordingly:

- A Windows GUI seat is **not** a permanent component. Worst case is an
  occasional, discouraged Wine UI session on the processing host to regenerate a
  template.
- Configuration templates are still first-class versioned artifacts — a
  `.rcconfig`, a small set of `params.xml` files, one `.rsortho` per ortho
  configuration. That still fits the Profile-versioning model.
- **Dataset-adaptive behaviour is much wider than the draft allowed**: 116 global
  keys plus 57 per-selection keys across four edit commands, not "the subset
  expressible through `-set` keys" understood as a small remainder.
- Gate F3 is unaffected — no GUI step sits on the per-job critical path — but the
  CONDITIONAL in the recommendation loses one of its two main reasons.

---

## Demotions

Every place the official documentation contradicts the first draft. Ordered by
how much rested on the claim.

| # | First draft said | Documentation says | Consequence |
|---|---|---|---|
| D1 | A **Windows GUI seat is a permanent component**; the Linux build has no full desktop UI | The Linux (Wine) build ships a UI, "available for troubleshooting only"; parameter XML can be authored from "the RealityScan UI (**Windows or Linux Wine**)" | The permanent-Windows-seat constraint falls. One less reason for CONDITIONAL |
| D2 | Export is **XML-only**: "There is no inline-flag export configuration" | `params.xml` is optional on every command that takes it; "current settings" apply otherwise, and current settings come from 116 documented `-set` keys and `-importGlobalSettings` | Headless operation is parameterised, not pure replay |
| D3 | "**The literal `-set` key strings are not** [confirmed] … the single largest practical gap" | [`keys-and-values`](sources/keys-and-values.md) documents 116 keys with types and defaults, and [`configure-selected-items`](sources/configure-selected-items.md) a further 57 | The largest stated gap did not exist |
| D4 | **Checkpoints** (control points excluded from the solve) — `REQUIRES TEST`, and without them "no survey-grade claim is possible" | `-editControlPointSelection "gpType=2"` — `0 – Tie point`, `1 – Ground control`, **`2 – Ground test`**; plus `gpEnabled` to exclude a point from alignment | Independent accuracy evidence is obtainable unattended. Survey-grade claim is back on the table |
| D5 | Domain 8: the DTM is "**a scene-type heuristic, not a ground-filtering algorithm**"; "no documentation describes an actual ground-vs-object classification" | `-dtmClassify` "Classify vertices of the selected model into pre-defined classes"; `-setSelectedClassAsGroundForDTM true`; `-setSelectedClassAsGroundForExport`; `-transferClassification` from AI label images | A real classify-then-nominate-ground workflow exists and is scriptable. Whether it is *good* is still `REQUIRES TEST` |
| D6 | Domain 13: "the **CLI verb is unconfirmed** — if 3D Tiles export turns out to be GUI-only, domain 13 … drops out of the automated pipeline entirely. That is the highest-value unknown in the second tier" | `-export3dTiles fileName [params.xml]` | Domain 13 stays in. The highest-value second-tier unknown was already answered |
| D7 | Domain 6 is "**the weakest domain**": close holes, post-hoc crop, mesh cleanup "none found" | `-closeHoles [maxEdgesCount]`, `-cutByBox inner OR outer [fillHoles]`, `-cleanModel` ("remove non-manifold edges and vertices, close small holes"), `-removeSelectedTriangles`, `-selectLargeTrianglesAbs/Rel`, `-selectMarginalTriangles` | Domain 6 is mid-strength, not weakest. Less work leaves for MeshLab |
| D8 | Domain 10: volume measurement is "**GUI-driven, which makes it useless to an automated pipeline**" | paRSer `$OrthoProjectionVolume( orthoGuid, anyText )` "Outputs the calculated volumes and surface areas of an ortho projection" | Volumes are obtainable unattended through a report template |
| D9 | Domain 1: AI mask **generation** is GUI-only | `-generateAIMasks` "Use AI Masking to generate masks by isolating the object of interest in your images" | Scriptable |
| D10 | Domain 5: depth-map resolution key "**key name not found**" | `-setDownscaleForDepthMaps integer`, plus `mvsPreviewDownscaleFactor` / `mvsNormalDownscaleFactor` family in `keys-and-values` | Closed |
| D11 | Domain 8/12: contours "export path exists; **CLI flag unconfirmed**" | `-computeContours [params.xml]`, `-exportContours fileName [params.xml]`, `-calculateCrossSections [step axis]`, `-exportCrossSections` | Closed |
| D12 | Domain 2/6: `-exportComponent` | **No such command.** The real ones are `-exportSelectedComponentFile`, `-exportSelectedComponentDir`, `-exportLatestComponents` (gated by `-setMinComponentSize`) | A verb that would have failed at runtime |
| D13 | Domain 18: paRSer CLI verb "`-exportReport`? **exact syntax unconfirmed**" | `-exportReport outputFileName templateFileName [true OR false]`; also `-printReport reportString` writing to the console | Closed |
| D14 | Domain 9: the ortho parameter file is `.rcortho` | `.rsortho` (`.rcortho` appears only in a legacy example) | Cosmetic, but it is the filename a script would pass |
| D15 | Domain 3: "**Exact CLI verb for GCP import** — UNKNOWN" | `-importGroundControlPoints gcpFileName [params.xml]` and `-importControlPointsMeasurements cpmFileName [params.xml]`, with `-exportGroundControlPoints` / `-exportControlPointsMeasurements` returning | Closed |
| D16 | "**No documented image-count-per-VRAM guidance exists**" | `hardware-and-software-requirements` documents out-of-core processing, "16 GB of RAM is typically sufficient for processing thousands of high-resolution images, provided a component workflow is used", and that halving `sfmMaxFeaturesPerImage` from 40,000 to 20,000 "can double the number of images processed within the same memory limits" | Sizing has a documented lever. The two requirement pages disagree on the VRAM floor (1 GB vs 8 GB); take the Linux figure |
| D17 | Domain 18: Epic "reportedly states the rebuilt templating system lets teams output structured project metadata in JSON, **with samples included**" — "the single highest-value unconfirmed claim in this evaluation" | The install's `Reports/` directory contains **only HTML templates**. No JSON sample ships | The design is unchanged — paRSer can still emit JSON by construction — but nobody hands us one. Budget for writing it |
| D18 | Domain 17 assumed the splat path must go **through COLMAP**, with a provisional distortion-model mapping to verify | `calibration.xml` ships a **`Radiance Fields Transformation File`** exporter writing nerfstudio-style `transforms.json` directly, with `"camera_model": "SIMPLE_RADIAL"`, real per-camera `cx`/`cy`, and the axis-flip already applied | The shortest adoption may skip COLMAP entirely. Re-opens #112 as a choice between three exporters rather than a yes/no on one |
| D19 | "Headless reconstruction **may not work on Linux at all**" — the claim the evaluation called decisive | **10/10 reconstructions completed** headless on an SSH-only host. The reported hangs are reproducible and explained: no framebuffer, or POSIX paths silently parsed as commands so `-quit` never runs | The load-bearing worry is retired. A1 passes on measurement |
| D20 | The first-run login dialog was a documented risk with unknown impact | It is **the** blocker, and it is one-time. An invisible `MessageOverlay` with a "Skip for now" link; dismissing it persists across runs | F3 holds — the click is bootstrap, not per-job — but it must be stated explicitly in the ADR |
| D21 | Determinism was `UNKNOWN`, framed as a documentation gap to be closed by finding a vendor statement | There is no statement, **and the engine is measurably non-deterministic at the coverage level** — alignment splits into a different number of components run to run | D1 degrades the verdict to CONDITIONAL GO with a named mitigation. The mitigation is component-share gating, which stops being optional |

Two claims the documentation **upheld** against attack, which is worth recording
because the point of the exercise was to find the draft wrong:

- Parameter files are genuinely GUI-authored (the D1/D2 correction is about them
  being optional and the GUI being available on Linux, not about their origin).
- The Linux build genuinely is a bundled Wine environment and genuinely is
  labelled experimental: *"RealityScan for Linux (Wine) 2.1 … built on a bundled
  Wine environment"*, *"The Linux (Wine) release is experimental"*. The cloud
  session got this right from search summaries alone.

---

## Domain-by-domain

Columns: **Native** · **CLI/scriptable** · **GUI-only** · **External tool
needed** · **Evidence**.

### 1. Input

| Capability | Native | CLI | GUI-only | External | Evidence |
|---|---|---|---|---|---|
| Add image folder | yes | `-addFolder <path>` | no | no | VERIFIED |
| Add individual images / image list | yes | `-add <path>` | no | no | VERIFIED |
| Image + explicit calibration | yes | `-addImageWithCalibration` | no | no | VERIFIED |
| Calibration group from EXIF | yes | `-setCalibrationGroupByExif`, `-setConstantCalibrationGroups`, `-setPriorCalibrationGroup`, `-setPriorLensGroup` | no | no | VERIFIED |
| EXIF / XMP metadata read | yes | automatic on add | no | no | SUPPORTED |
| GPS/GNSS priors | yes | from EXIF/XMP; `sfmEnableCameraPrior` and the `sfmCameraPriorAccuracy*` keys | no | no | VERIFIED |
| Camera position/orientation priors | yes | XMP sidecar; `-editInputSelection "inpPose=…"`, `inpTx/inpTy/inpTz`, `inpRx/inpRy/inpRz` | no | no | VERIFIED |
| Image masking (assignment) | yes | filename convention `<name>.mask.png`; `-editInputSelection "inpMaskOpts=…"` | no | no | VERIFIED |
| Image mask **generation** (AI) | yes | **`-generateAIMasks`** | **no** | no | **CONTRADICTED (D9)** |
| Mask export | yes | `-exportMasks`, `-generateMaskFromMesh`, `-exportMapsAndMask` | no | no | VERIFIED |
| Multiple flights in one project | yes | repeated `-addFolder` | no | no | INFERRED |
| Multiple cameras/lenses | yes | per-camera calibration groups | no | no | VERIFIED |
| Import existing component | yes | `-importComponent` | no | no | VERIFIED |
| Import laser scan / Leica BLK3D / video | yes | `-importLaserScan`, `-importLaserScanFolder`, `-importLeicaBlk3D`, `-importVideo` | no | no | VERIFIED |
| Import flight log | yes | `-importFlightLog <flFileName> [params.xml]` | no | no | VERIFIED |
| Project file inspectable | yes | `.rsproj`/`.rsinfo` are XML | no | no | SUPPORTED |
| Video-derived frames | partial | `-importVideo`, `extractedVideoFramesLocation` | 360° workflow is a manual tutorial | yes | SUPPORTED |
| **Pre-processing image validation** | **no** | — | — | **yes** | VERIFIED (absence — searched 82 pages) |
| **Behaviour on missing/invalid EXIF** | — | — | — | — | **UNKNOWN — T2.8** |

**Read**: ingestion is genuinely scriptable and the masking convention is a gift
— externally generated masks are picked up with zero interaction, and AI mask
generation turns out to be scriptable too. Two gaps matter. There is no
documented input-validation stage, so ours stays (`exif-audit`, `filter` are not
replaced). And the engine's behaviour on bad metadata is undocumented — it must
be measured, because a silent default focal-length substitution would corrupt a
survey quietly.

**One undocumented hazard**, from a third-party production pipeline: RealityScan
reportedly **rewrites and relocates XMP sidecars inside the input folder** during
alignment. *(SUPPORTED, non-Epic source; no Epic page addresses it either way.)*
If true, the input folder is not read-only. **Never point the engine at the
canonical image store** — always a job-scoped copy. This is cheap insurance
regardless of whether it is true.

### 2. Alignment

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Feature detection / matching / SfM | yes | `-align`, `-detectFeatures`, `-draft` | VERIFIED |
| Alignment settings | yes | `-set "key=value"`, `-preset "key=value"` | VERIFIED |
| Image downscale factor | yes | `sfmImageDownscaleFactor` (and `sfmImageDownscaleFactorDraftMode`) | **VERIFIED (D3)** |
| Detector sensitivity | yes | `sfmDetectorSensitivity` | **VERIFIED (D3)** |
| Max features per image / per Mpx | yes | `sfmMaxFeaturesPerImage`, `sfmMaxFeaturesPerMpx` | **VERIFIED (D3)** |
| Preselector features | yes | `sfmPreselectorFeatures` | **VERIFIED (D3)** |
| Max reprojection error | yes | `sfmMaxFeatureReprojectionError` | **VERIFIED (D3)** |
| Image overlap model | yes | `sfmImagesOverlap`, `sfmImagesOverlapDraftMode` | VERIFIED |
| Distortion model | yes | `sfmDistortionModel` — `Division`, `Brown3` (default), `Brown4`, `Brown3WithTangential2`, `Brown4WithTangential2`, `KplusBrown3WithTangential2`, `KplusBrown4WithTangential2` | **VERIFIED** — see domain 17 |
| Component creation | yes | automatic; `sfmForceComponentRematch`, `sfmMergeGeoreferencedComponents` | VERIFIED |
| Select largest component | yes | `-selectMaximalComponent` | VERIFIED |
| Select best-error component | yes | `-selectComponentWithLeastReprojectionError` | VERIFIED |
| Merge components | yes | `-mergeComponents` | VERIFIED |
| Export component | yes | `-exportSelectedComponentFile`, `-exportSelectedComponentDir`, `-exportLatestComponents` + `-setMinComponentSize` | **CONTRADICTED (D12)** — `-exportComponent` does not exist |
| Import component | yes | `-importComponent` | VERIFIED |
| Marker detection | yes | `-detectMarkers` | VERIFIED |
| Alignment statistics export | yes | paRSer, see domain 14 | VERIFIED |

**Read**: the capabilities are confirmed **and so are the keys**. The first
draft's largest stated gap — the literal `-set` strings — was one page away; the
116 global keys are in [`sources/keys-and-values.md`](sources/keys-and-values.md)
with value types and defaults, and 57 per-item keys in
[`sources/configure-selected-items.md`](sources/configure-selected-items.md).
Configuration is a solved problem, not a risk.

`-selectMaximalComponent` is still a loaded gun, and it is no longer a
hypothetical one. **Measured (#110): identical input produces a different number
of components run to run — 3/2/2 at 20 images, 6/7 at 122 — so the "largest"
component is not stable, and ten runs reconstructed measurably different parts of
the same scene while every one of them exited 0 with a clean million-face mesh.**
The documentation says only "Select the largest component for further
processing", with no warning and no threshold. If a
Capture splits 60/40, the pipeline produces a confident, clean, half-site
deliverable. Gate on the selected component's *share* of registered images, not
merely on component count (T2.14). `-selectComponentWithLeastReprojectionError`
is a second trap with the same shape — smallest mean error can mean smallest
component.

### 3. Georeferencing

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| GPS/GNSS camera positions | yes | from EXIF/XMP | VERIFIED |
| GCP 3D positions from file | yes | **`-importGroundControlPoints <gcpFileName> [params.xml]`** | **VERIFIED (D15)** |
| GCP 2D image measurements from file | yes | **`-importControlPointsMeasurements <cpmFileName> [params.xml]`** | **VERIFIED (D15)** |
| GCP export (round-trip) | yes | `-exportGroundControlPoints`, `-exportControlPointsMeasurements`, `-listControlPoints <fileName>` | VERIFIED |
| Per-point accuracy / weights | yes | `-editControlPointSelection "gpWeight=…"`; `sfmControlPointXAccuracy` / `Y` / `Z`, `sfmControPointImageMeasAccuracy` | VERIFIED |
| **Checkpoints (excluded from solve)** | **yes** | **`-editControlPointSelection "gpType=2"`** — `2 – Ground test`; `gpEnabled=false` to drop from alignment entirely | **CONTRADICTED (D4)** |
| Control-point management | yes | `-selectControlPoint`, `-renameControlPoint`, `-deleteControlPoint`, `-invertControlPointSelection`, `-selectMeasurementByError <px> [name]`, `-selectMeasurementByIndex`, `-deleteControlPointMeasurement` | VERIFIED |
| Set project / output CRS | yes | `-setProjectCoordinateSystem`, `-setOutputCoordinateSystem` | VERIFIED |
| Geoid / vertical datum | probable | not documented in the CLI pages | UNKNOWN |
| GCP residuals, numeric | yes | paRSer control-point function set; `-selectMeasurementByError` proves per-measurement pixel error is held numerically | VERIFIED |
| Defined distances / constraints | yes | `-defineDistance`, `-editConstraintSelection`, `-deleteConstraint`; `sfmDefinedDistanceAccuracy` | VERIFIED |
| **Wrong-CRS detection** | **no** | — | VERIFIED (absence — searched 82 pages) |

**Read — and this is still the good news of the evaluation, now with the verb
attached**: GCP *image observations* can be supplied from a file and imported by
`-importGroundControlPoints` / `-importControlPointsMeasurements`. GCP placement
does **not** require GUI clicking. Fully automated georeferencing is achievable.

**Checkpoints are the material change.** `gpType=2 – Ground test` is exactly a
control point excluded from the solve and used as independent accuracy evidence,
and it is settable from the command line. The first draft's warning that "without
them there is no independent accuracy evidence and no survey-grade claim is
possible" is answered: the mechanism exists. Whether the numbers it produces are
good enough is `REQUIRES TEST`, not `UNKNOWN`.

**The bad news is unchanged**: there is **no wrong-CRS detection** anywhere in 81
pages. Gate C3 treats silent CRS mismatch as critical, so **we build the
plausibility check ourselves**: compare the GNSS bounding box against the declared
EPSG before processing starts. A few lines of `pyproj`, and the highest-value
piece of own-code in this design.

### 4. Point clouds (non-LiDAR)

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Sparse / tie-point cloud | yes | **`-exportSparsePointCloud <fileName> [params.xml]`** | VERIFIED |
| **Dense point cloud** | yes, **derived from mesh vertices** | downstream of meshing | SUPPORTED |
| Point-cloud export formats | yes | via export settings / `params.xml` | SUPPORTED — the format list is in a dialog, not in the CLI docs |
| **Export E57 / LAZ** | — | — | **UNKNOWN** — no mention in 82 pages; do not promise |
| Point filtering / outlier removal | partial | `-selectLargeTrianglesAbs/Rel`, `-selectMarginalTriangles`, `-removeSelectedTriangles` operate on the mesh, not the cloud | SUPPORTED |
| Classification | yes | `-dtmClassify`, `-selectClassification`, `-transferClassification`, `-selectVerticesOfSelectedClass`, `-setSelectedClassLasFormat`, `-setSelectedClassAsGroundForExport` | **CONTRADICTED (D5)** |
| Reconstruction region | yes | `-setReconstructionRegionAuto`, `-setReconstructionRegion <f>.rsbox`, `-setReconstructionRegionByDensity`, `-setReconstructionRegionOnCPs`, `-exportReconstructionRegion`, `-moveReconstructionRegion`, `-rotateReconstructionRegion`, `-scaleReconstructionRegion`, `-offsetReconstructionRegion` | VERIFIED |

**Read**: the dense cloud being **made of mesh vertices** inverts the normal
pipeline — no Epic page contradicts this, and none confirms it either, so it
stays `SUPPORTED`. If true there is no cheap "dense cloud only" path, meshing
must be paid for first, and point density is governed by meshing parameters. That
is a runtime-estimate question and belongs in tier 2.

Point-level filtering still has no cloud-domain CLI equivalent — this goes to
PDAL/CloudCompare and is not a loss, since those tools are better at it anyway.
What did change is classification: it is scriptable (D5).

### 5. 3D reconstruction

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Quality tiers | yes | `-calculatePreviewModel` / `-calculateNormalModel` / `-calculateHighModel` | VERIFIED |
| Reconstruction region | yes | as above, `.rsbox` file | VERIFIED |
| Depth-map downscale | yes | **`-setDownscaleForDepthMaps <integer>`**; `mvsPreviewDownscaleFactor` (default 4), `mvsNormalDownscaleFactor`, and the 19-key `mvs*` family | **CONTRADICTED (D10)** |
| Ground plane | yes | `-resetGround`, `-setGroundPlaneFromReconstructionRegion`, `-setCamerasGravityDirection` | VERIFIED |
| Failure detection | partial | `-set "appQuitOnError=true"`; crash → exit 3 | SUPPORTED |
| Resume model calculation | yes | `-continueModelCalculation`, `-lockPoseForContinue`, `-recoverAutosave`, `-deleteAutosave` | VERIFIED |
| **Alignment-stage resume** | **no** | — | **UNKNOWN** — no such command in `all-commands` |

**Read**: the three quality tiers are confirmed and are the main standardised
config choice, and the sub-parameters beneath them are now documented rather than
unknown.

**Reconstruction was the reported failure point, and it has now been measured.**
T1.2 ran `-calculateNormalModel` ten times on an SSH-only host with no desktop:
**10/10 completed, every mesh readable by an independent reader, no hangs.**
Headless reconstruction on Linux works.

The reported hangs were real, but they were not the engine failing. Three
environment requirements, none of which appear together in any Epic page:

1. **A virtual framebuffer.** Wine's DXGI cannot enumerate adapters with no X
   connection; without one the engine dies in ~5s with `application
   initialization failed with code 0x887a0004` (`DXGI_ERROR_UNSUPPORTED`) and
   writes nothing to stdout.
2. **Wine `Z:\` paths.** A POSIX path loses its leading slash and is parsed as a
   command — *"An unknown command 'home/akamel/…'. Is it a feature request or a
   typo?"* — after which `-quit` never executes and the process **idles
   forever**: CPU decaying to 4%, GPU at 0%, log frozen after two lines.
   **This is almost certainly what the third-party "hangs indefinitely" reports
   were**, and plausibly the misleading "No model is selected" as well.
3. **A one-time sign-in dismissal.** See domain 15. A hang does not
self-terminate, so an **external watchdog is mandatory**, not optional. Note that
Epic now documents Docker with GPU passthrough as a supported Linux deployment
(`realityscan-for-linux`), which is evidence against the strong form of the
report but not against the intermittent form.

### 6. 3D editing

| Capability | CLI | Evidence |
|---|---|---|
| Simplify / decimate | `-simplify [targetTriangleCount OR params.xml]` | VERIFIED |
| Smooth | `-smooth [params.xml]` | VERIFIED |
| Select model / maximal component | `-selectModel`, `-selectMaximalComponent`, `-selectLargestModelComponent` (largest connected component of the mesh) | VERIFIED |
| Reconstruction-region crop | `.rsbox` before reconstruction | VERIFIED |
| **Close holes** | **`-closeHoles [maxEdgesCount]`** | **CONTRADICTED (D7)** |
| **Post-hoc mesh crop (Cut By Box)** | **`-cutByBox inner OR outer [fillHoles]`**, plus `-selectTrianglesInsideReconReg` / `-selectTrianglesOutsideReconReg` | **CONTRADICTED (D7)** |
| **Mesh cleanup** | **`-cleanModel`** — "remove non-manifold edges and vertices, close small holes, etc." | **CONTRADICTED (D7)** |
| Triangle selection / removal | `-selectLargeTrianglesAbs`, `-selectLargeTrianglesRel`, `-selectMarginalTriangles`, `-invertTrianglesSelection`, `-removeSelectedTriangles`, `-deselectModelTriangles` | VERIFIED |
| Model management | `-duplicateSelectedModel`, `-renameSelectedModel`, `-deleteSelectedModel` | VERIFIED |
| **Mesh splitting / tiling** | none found | UNKNOWN |
| **Retopology** | none found in 82 pages | VERIFIED (absence) |
| Model import (external mesh) | `-importModel` | VERIFIED |

**Read**: **this domain was mis-called.** The first draft's "crop before
reconstruction, do all post-hoc editing externally" was built on three rows that
are wrong: hole closing, box cropping and non-manifold cleanup all have CLI
verbs, and `-cleanModel` is precisely the mesh-hygiene pass the pipeline would
otherwise have shelled out to MeshLab for. Retopology genuinely is absent.

The corrected read: **do mesh hygiene in-engine (`-cleanModel`, `-closeHoles`,
`-cutByBox`), send only retopology out.** That is a smaller external surface than
the draft designed for, and it removes a whole tool from the dependency list.

The **Model Import** capability is what makes the round-trip viable — see
domain 7.

### 7. Texturing

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| UV unwrap | yes | `-unwrap`; `unwrapStyle`, `unwrapGutter` (default 2), texel-size and resolution keys | VERIFIED |
| Texture calculation | yes | `-calculateTexture`, `-calculateQualityTexture` | VERIFIED |
| Vertex colours | yes | `-calculateVertexColors`, `-calculatePreviewVertexColors`, `-calculateQualityColors` | VERIFIED |
| Texturing method / style | yes | `txtMethod` and the `txt*` key family | VERIFIED |
| Colour correction | yes | `-correctColors`, `-enableColorNormalization`, `-enableColorNormalizationReference`; `-editInputSelection "inpColorRef"/"inpColorNorm"` | VERIFIED |
| Per-image texturing weight | yes | `-setWeightInTexturing`, `-editInputSelection "inpImageColorsWeight"` | VERIFIED |
| **Texture reprojection** | **yes** | **`-reprojectTexture <sourceModel> <resultModel> [params.xml]`** | VERIFIED |
| Normal / displacement / ST maps | yes | `-exportSTMap`, `-exportMapsAndMask` | VERIFIED |
| **UDIM** | — | not mentioned in the CLI docs | **UNKNOWN** — the draft claimed it; no Epic page in `sources/` supports it |
| Ambient occlusion baking | — | not found | UNKNOWN |
| **Re-texture an external mesh from original photos** | **yes** | `-importModel` into the calibrated component, then `-unwrap` + `-calculateTexture` | VERIFIED |

**Read**: still the strongest domain, and it resolves the hardest architectural
question in the brief. An externally retopologised or repaired mesh can be
imported into the component holding the calibrated cameras and textured from the
**original imagery** — not resampled from an existing texture:

```
RealityScan mesh → external retopo → -importModel
  → -unwrap → -calculateTexture from original photographs → -exportModel
```

`-reprojectTexture` makes the lossy variant available too, when the source
textures are the thing worth keeping.

**UDIM is demoted to UNKNOWN.** The draft flagged it as "worth noting because it
is commonly assumed absent" — but no page in `sources/` mentions UDIM at all. Do
not promise it.

### 8. Terrain

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| DSM | yes — mesh altitude layer via the ortho pipeline | `-calculateOrthoProjection` | VERIFIED |
| **Classification into classes** | **yes** | **`-dtmClassify [params.xml]`** — "Classify vertices of the selected model into pre-defined classes" | **CONTRADICTED (D5)** |
| **Nominate a class as ground** | **yes** | **`-setSelectedClassAsGroundForDTM true`**, `-setSelectedClassAsGroundForExport` (Export class LAS → Ground (2)) | **CONTRADICTED (D5)** |
| Classification from AI image labels | yes | `-transferClassification [params.xml]`, the `DETECT_IMAGE_LABELS` process id, `-setImageLayer`/`-setImagesLayer` | VERIFIED |
| Classification management | yes | `-selectClassification`, `-selectClass`, `-deselectClass`, `-renameSelectedClass`, `-colorModelBySelectedClassification`, `-importClassificationFormat` / `-exportClassificationFormat`, `-importClassificationSettings` / `-exportClassificationSettings` | VERIFIED |
| Contours / isolines | yes | **`-computeContours [params.xml]`**, **`-exportContours <fileName> [params.xml]`**, `-renameContours`, `-selectContours` | **CONTRADICTED (D11)** |
| Cross-sections | yes | **`-calculateCrossSections [step axis]`**, `-exportCrossSections`, `-renameCrossSections`, `-selectCrossSections` | **CONTRADICTED (D11)** |
| **DTM quality vs a true ground filter** | — | — | **REQUIRES TEST** |
| Terrain QA | none | — | VERIFIED (absence) |

**Read**: **the trap the brief warned about is smaller than the draft thought,
but it has not vanished — it has changed category.** There *is* a documented
classification step (`-dtmClassify`) and an explicit "use this class as ground for
DTM" switch, both scriptable. That is a real ground-classification workflow, not
a scene-type dropdown.

What the documentation does **not** say is how good the classifier is on
image-derived vertices, or what its pre-defined classes are. So the honest status
is `REQUIRES TEST`, not `SUPPORTED (absence)`: **measure it against a PDAL
SMRF/PMF baseline on the same Capture before claiming bare earth for survey
work.** Gate ES5 moves from "CONDITIONAL at best" to "conditional on a
measurement we can now actually design".

### 9. Mapping

| Capability | Native | CLI | Evidence |
|---|---|---|---|
| Ortho projection | yes | `-calculateOrthoProjection [params.rsortho] [region.rsbox]` | VERIFIED |
| Ortho export | yes | `-exportOrthoProjection <out>.tiff [exportParams.xml]` | VERIFIED |
| Ortho selection / settings | yes | `-selectOrthoProjection`, `-editOrthoProjectionSelection "key=value"` | VERIFIED |
| GSD / resolution / extent | yes | in `.rsortho`, or current settings | VERIFIED |
| Output CRS | yes | `-setOutputCoordinateSystem` | VERIFIED |
| Shapes into ortho | yes | `-importShapesToOrtho`, `-importShapesToSelectedOrtho`, `-exportShapes`, `-selectShape`, `-addShapeToSelection` | VERIFIED |
| `.rsortho` origin | GUI-authored | *"You can obtain params.rsortho by exporting an orthographic projection in the GUI and setting Export projection parameters file to True"* | VERIFIED |
| **`.rsortho` hand-writable** | — | docs link to a structure description but do not inline it | **REQUIRES TEST** — fetch one, read it, try editing it |

**Read**: orthomosaic generation is **fully unattended** and both parameters are
optional (`-calculateOrthoProjection` with no arguments uses current settings),
which is the strongest replacement case against the current ODM path. The
remaining question is narrower than the draft's: not "must a GUI author this"
but "can we edit the file a GUI once authored". Since `-editOrthoProjectionSelection`
exists, per-Site extent and GSD may not need the file at all.

Note the extension is **`.rsortho`** (D14). `.rcortho` appears only in a legacy
example line.

### 10. Survey analysis

| Capability | Native | CLI / unattended | Evidence |
|---|---|---|---|
| **Volume / surface area** | **yes** | **paRSer `$OrthoProjectionVolume(orthoGuid, anyText)`** — "Outputs the calculated volumes and surface areas of an ortho projection" | **CONTRADICTED (D8)** |
| Ortho measurements | yes | paRSer `OrthoMeasurementFunctionSet` | VERIFIED |
| Checkpoint / Ground Test precision | yes | `gpType=2` (D4) + paRSer control-point functions | VERIFIED |
| GCP residuals, numeric | yes | paRSer `ControlPointsExportFunctionSet`; `-selectMeasurementByError` | VERIFIED |
| Camera error statistics | yes | paRSer `CameraErrorsExportFunctionSet`, `RelativeCameraUncertaintyFunctionSet`, `MisalignmentFunctionSet` | VERIFIED |
| Contours, cross-sections | yes | `-computeContours` / `-calculateCrossSections` and their exports | VERIFIED (D11) |
| Distance / coordinate / area query | partial | `-defineDistance` constraints; general ad-hoc query has no CLI | SUPPORTED |
| Checkpoint RMSE report | yes, by template | paRSer over control-point functions; no built-in RMSE variable found | SUPPORTED |

**Read**: **the draft's verdict — "a reconstruction engine with measurement tools
bolted on, useless to an automated pipeline" — is half wrong.** The measurement
tools are GUI-driven, but their *results* are exposed to paRSer, and paRSer runs
headlessly through `-exportReport`. Volumes, ortho measurements, camera errors
and control-point residuals are all obtainable unattended as structured output.

Some of domain 10 still moves to external tooling — GDAL/rasterio for raster
maths, PDAL for cloud analysis, Shapely/pyproj for geometry. But **checkpoint
RMSE is now computable from engine data** rather than reconstructed from scratch,
and that was the number the survey-grade claim needed.

### 11. 3D delivery

**Export mechanism**: `-exportModel <modelName> <fileName> [params.xml]` and
`-exportSelectedModel <fileName> [params.xml]`, plus `-exportModelToZip`.
**The params XML is optional** (D2) — without it the current settings apply, and
current settings are `-set`-driven and `.rcconfig`-portable.

Format coverage: the CLI pages document the *mechanism*, not the format list. The
format list lives in the Export dialog and in Epic's KB, which is **not** among
the 82 pages fetched. So every specific format the first draft listed — OBJ, PLY,
XYZ, FBX, GLB, USD, USDZ, STL, DXF, Alembic, Collada, 3MF, PTX, LAS — remains
`SUPPORTED`, not `VERIFIED`, and the not-evidenced list (plain `.gltf`, KMZ from
the model exporter, VRML, X3D, E57) remains **do not promise**.

One verified addition: `-uploadToSketchfab` exists as a CLI verb. Irrelevant to
this pipeline, noted so nobody rediscovers it as a surprise.

**Read**: the constraint the draft drew from this domain — "a checked-in library
of export XML templates, one per format/configuration, each authored once on
Windows" — is weakened twice over: the XML is optional, and where it is wanted it
can be authored on Linux (D1, D2). A template library is still the right shape;
it is no longer a Windows dependency.

### 12. GIS delivery

| Format | Status | Evidence |
|---|---|---|
| GeoTIFF / TIFF ortho raster | yes | `-exportOrthoProjection <out>.tiff` | VERIFIED |
| DSM raster | yes | ortho pipeline altitude layer | VERIFIED |
| "DTM" raster | yes, and see domain 8 | VERIFIED |
| Contours SHP/DXF | yes | `-exportContours` (format by extension/params) | VERIFIED (D11) |
| Cross-sections | yes | `-exportCrossSections` | VERIFIED (D11) |
| Embedded CRS in raster | yes | `-setOutputCoordinateSystem` | VERIFIED |
| World file `.tfw` | probable | export-dialog setting, not in the CLI pages | SUPPORTED |
| LAS class assignment | yes | `-setSelectedClassLasFormat`, `-setSelectedClassAsGroundForExport` | VERIFIED |
| **Cloud-Optimized GeoTIFF** | **not documented in 82 pages** | **UNKNOWN** |
| GeoPackage | not documented in 82 pages | UNKNOWN |
| E57 export | not documented in 82 pages | UNKNOWN |
| KML/KMZ | not documented in 82 pages | UNKNOWN |

**Read**: unchanged and load-bearing. The current pipeline delivers a **COG**,
read directly by MapLibre over HTTP range requests with no tile server (ADR
0011), and COG appears nowhere in the RealityScan documentation. So `export-cog`
**stays** — GDAL converts the GeoTIFF. That is a one-line node we already have,
and it is where the existing COG-validation check lives, which we need
regardless.

### 13. Web 3D

| Capability | Status | Evidence |
|---|---|---|
| LoD generation | yes | `-exportLod <fileName> [params.xml]` — linear LoD | VERIFIED |
| **Cesium 3D Tiles** | **yes, and scriptable** | **`-export3dTiles <fileName> [params.xml]`** — hierarchical LoD to `.json` | **CONTRADICTED (D6)** |
| 3D Tiles version | `tileset.json` + `.b3dm` | SUPPORTED — the CLI page does not state the version; the first draft's "1.0 only" came from search |
| Draco / KTX2 compression | not mentioned in 82 pages | UNKNOWN |

**Read**: **the top second-tier risk is retired.** `-export3dTiles` is a
documented CLI command, so domain 13 does not drop out of the automated pipeline.
Native 3D Tiles is a genuine capability the current pipeline lacks.

What is now unverified is the *quality* claim rather than the *existence* claim:
the tile version, and whether Draco/KTX2 are available, are not in the
documentation. Payload size is the binding constraint for client-facing delivery
over object storage, so measure an actual `-export3dTiles` output before
committing — that is a tier-2 test, not a blocker.

### 14. QA

| Metric | Obtainable unattended | Mechanism | Evidence |
|---|---|---|---|
| Alignment / component statistics | yes | paRSer `ComponentFunctionSet`, `SfmExportFunctionSet`, `SfmHistogramExportFunctionSet` | VERIFIED |
| Registered vs unregistered cameras | yes | paRSer `InputsFunctionSet`, `IteratorsFunctionSet` | VERIFIED |
| Reprojection error, aggregate and per camera | yes | paRSer `CameraErrorsExportFunctionSet` | VERIFIED |
| Relative camera uncertainty | yes | paRSer `RelativeCameraUncertaintyFunctionSet` | VERIFIED |
| Misalignment | yes | paRSer `MisalignmentFunctionSet` | VERIFIED |
| Control-point measurements / residuals | yes | paRSer `ControlPointsExportFunctionSet`; `-listControlPoints`, `-exportControlPointsMeasurements` | VERIFIED |
| Checkpoint errors | yes | `gpType=2` points, read back through the same functions | VERIFIED (D4) |
| Ortho volumes / measurements | yes | paRSer `OrthoProjectionFunctionSet`, `OrthoMeasurementFunctionSet` | VERIFIED (D8) |
| Progress / process state | yes | `-writeProgress <file> <timeout>`, `-printProgress`, `-getStatus <instance OR *>`, documented process IDs | VERIFIED |
| Exit state | yes | exit 0 / non-zero with `appQuitOnError=true`; crash → exit 3 | SUPPORTED |
| Console capture | yes | `-stdConsole` "enables console redirection to the application standard output" | VERIFIED |
| **Point-cloud completeness** | **no** | external — PDAL/laspy/open3d | VERIFIED (absence) |
| **Reconstruction completeness** | **no** | external | VERIFIED (absence) |
| **Mesh validity (manifold, holes)** | partial | `-cleanModel` *fixes* non-manifold geometry but reports nothing; validity measurement is external (trimesh) | **CONTRADICTED in part (D7)** |
| **Texture validity** | **no mechanism found in 82 pages** | external Pillow/OpenCV | VERIFIED (absence) |
| **DSM/DTM/ortho raster validity** | **no** | external GDAL/rasterio | VERIFIED (absence) |
| **Output-file integrity** | **no**, beyond "exited 0" | external readers | VERIFIED (absence) |
| **Coordinate-system correctness** | **no** | external pyproj bounds check | VERIFIED (absence) |

**Read**: the split is clean and it validates the domain model's separation of
Processing from Assurance — and re-verification **strengthened** it. RealityScan
is genuinely good at reporting **what it did internally**, and paRSer exposes
more of that than the draft knew (uncertainty, misalignment, histograms, ortho
volumes). It reports **almost nothing about whether the artifacts it wrote are
any good**. Texture validity has no mechanism whatsoever.

That is exactly the failure class this repo has already been burned by: an engine
exiting cleanly having written an 87%-empty orthophoto, and a 934-face mesh from
a 5.4M-point cloud. **Every artifact-level QA check must be ours, computed with
independent readers** — the pattern already in `nodes/check_*.py` and ADR 0018.
The engine's statistics are an input to the verdict, never the verdict.

Gate construction on what is genuinely available:

- **FAIL** — non-zero exit; registered-camera ratio below threshold; mean or
  checkpoint reprojection error above threshold; any artifact-level external
  check failing; CRS bounds check failing.
- **PASS WITH WARNING** — borderline registration ratio; completeness within
  tolerance but trending; artifact present but suboptimal.
- **REQUIRES MANUAL REVIEW** — **zero-checkpoint projects**, and the dangerous
  combination of *low reprojection error with a coverage gap*, which is the
  signature of a confident reconstruction of the wrong subset of the Site.
- **PASS** — all of the above clear.

That third category deserves emphasis. **Low reprojection error is not evidence
of a good result** — it measures self-consistency, not correctness. A split
component reconstructed beautifully will report excellent error. Only coverage
and checkpoints catch it, and checkpoints are now available (D4).

### 15. Automation

| Mechanism | Status | Evidence |
|---|---|---|
| CLI, sequential hyphenated args | yes | VERIFIED |
| **`-headless`** | yes — "Hides user interface", tray icon on Windows. **On Linux it does not suppress the first-run sign-in modal** | VERIFIED — measured |
| **First-run Epic sign-in modal** | A `MessageOverlay` window reading *"Sign in to RealityScan — Use your Epic Games account or create a new one"*, with **"Skip for now"**. Drawn invisibly under a framebuffer; the process idles until it is dismissed. **One click, and the dismissal persists across later runs** | **VERIFIED — measured.** This is the documentation's "certain dialogs (e.g., the login window) will still require user interaction", made concrete |
| **A display is required even headless** | Wine's DXGI needs an X connection; `Xvfb :77 -screen 0 1280x1024x24 -ac` is sufficient | **VERIFIED — measured** |
| **Paths must be in Wine `Z:\` form** | a POSIX path is parsed as a command and the run never reaches `-quit` | **VERIFIED — measured** |
| `-hideUI` / `-showUI` | yes — "Unlike headless, this command doesn't need to be run at startup and does not suppress actions that require user interaction" | VERIFIED |
| `-silent` | yes | VERIFIED |
| `-stdConsole` | yes — console redirection to standard output | VERIFIED |
| `.rscmd` files | **`-execRSCMD <Commands.rscmd>`**, `-execRSCMDIndirect`; up to nine `$(arg1)–$(arg9)` variables | VERIFIED |
| **`-set "key=value"` / `-preset "key=value"`** | yes; **116 documented global keys** | **VERIFIED (D3)** |
| Per-selection settings | `-editInputSelection`, `-editControlPointSelection`, `-editConstraintSelection`, `-editOrthoProjectionSelection`; 57 documented keys | VERIFIED |
| Whole-application settings as a file | `-exportGlobalSettings settings.rcconfig`, `-importGlobalSettings settings.rcconfig` | VERIFIED |
| Exit code 0 = success | yes, **but only if the project was saved** | SUPPORTED |
| **`-save` is required before `-quit`** | **MEASURED.** A completed 122-image alignment followed by a bare `-quit` emits `Processing failed: Operation aborted.` and **exits 4**; the identical run with `-save` before `-quit` exits 0. With `appQuitOnError=true` mandatory, an unsaved quit turns a good run into a reported failure — the mirror image of the A6 hazard, and just as silent | **VERIFIED — measured** |
| **Non-zero propagation requires `-set "appQuitOnError=true"`** | yes — and headless-mode docs name it as the way to suppress blocking dialogs | VERIFIED |
| Crash → exit 3 + minidump | yes; `-crashReportPath` | SUPPORTED |
| Logging | `appLog`, `operationLog` keys; `results_*`/`errors_*` files | VERIFIED |
| `-writeProgress <file> <timeout>`, `-printProgress` | yes | VERIFIED |
| Instance control | `-setInstanceName`, `-delegateTo <name OR *>`, `-getStatus`, `-waitCompleted`, `-abortInstance`, `-pauseInstance`, `-unpauseInstance` | VERIFIED |
| **Remote Command Plugin (gRPC/REST)** | yes; fleet, master/worker, real-time notifications. **Ships inside the free-tier package** (`Plugins/RealityScan.RemoteCommandPlugin/`, gRPC 1.40.0 linked in), not a separate download or tier | VERIFIED — installed 2.2.0.119430 |
| Plugin command surface | `RsRemoteStartREST`/`GRPC` (`serverUrl`), `RsRemoteStartNotifyREST` (`notifyUrl`, optional base64 `notifyUrlHeaders`), `RsRemoteStartNotifyGRPC`, **`RsRemoteStartNotifyToFile` (`filePath`)**, and a `Stop` for each | VERIFIED — from the shipped `.rsplugin` manifest |
| **Docker with GPU passthrough** | yes — "RealityScan Linux can run fully inside a Docker container with GPU passthrough" | VERIFIED |
| **Passive notification mode** | yes — "you provide a notification address and receive asynchronous events (progress, completion, errors) without polling … useful when running existing pipelines—such as .rscmd command files—inside a container without an active server loop" | VERIFIED |
| Model-stage resume | yes; `-continueModelCalculation`, `-recoverAutosave` | VERIFIED |
| Alignment-stage resume | no such command | UNKNOWN |
| **Determinism** | **The engine is not deterministic, and the instability is in alignment rather than meshing.** Identical input finalized **3/2/2 components** at 20 images and **6/7** at full Capture size. `-selectMaximalComponent` then selects a different component per run, so ten runs reconstructed **different parts of the scene**: 17.6% mean bounding-box extent drift, worst median surface deviation **5.07%** against gate EV5's 1% GO bar. Every run exited 0 and wrote a clean ~1M-face mesh | **MEASURED — #110.** No seed or determinism control exists anywhere in the 82 pages. Confounded by an unrepresentative dataset, so D1 needs re-measuring on a real Capture; the component-share gate is required regardless |
| **Free-tier entitlement** | **Free under $1,000,000 USD gross revenue over the last 12 months, with "All RealityScan features"** — no capability gating between tiers; CA$1,697 per seat per year above it | **VERIFIED** — [`eula`](sources/eula.md) §2(b)(i), [`licensing-and-pricing`](sources/licensing-and-pricing.md) |
| Whether the CLI, headless operation or the Remote Command Plugin are separately entitled | neither the EULA nor the licensing page mentions the CLI, "headless" or "automated" at all | **UNKNOWN — T1.4**; silence in the direction we want, but silence |

**Read**: `appQuitOnError=true` is still the most important single string in this
document, and the headless-mode page now backs it directly: interruptions "can be
suppressed by using the `-silent` or `-set "appQuitOnError=true"` options, but
certain dialogs (e.g., the login window) will still require user interaction."
**The login dialog is the one interaction the documentation says cannot be
suppressed** — that belongs in the tier-1 test plan, because a container that
blocks on a login window is indistinguishable from a hang.

**The Remote Command Plugin is the documented integration surface for our case**,
and re-verification made this much more concrete than "probably": Epic documents
Docker with GPU passthrough, a REST server, a gRPC server, *and* a passive
notification mode explicitly aimed at running `.rscmd` pipelines in a container
with no server loop. That last one matches this repo's Runner shape almost
exactly — a Node shells a command, the engine reports asynchronously, nothing
polls.

**Determinism remains unknown after an exhaustive search.** Zero occurrences of
"determinis", "reproducib" or "random seed" across 82 pages. Phase 2
(cross-date comparison) has to measure it.

### 16. External processing

Revised. The first draft classified nothing as redundant-because-RealityScan-
does-it; three things now are:

- **Mesh hygiene** — `-cleanModel`, `-closeHoles`, `-cutByBox` replace the
  MeshLab step the draft planned (D7).
- **Ground classification** — `-dtmClassify` + `-setSelectedClassAsGroundForDTM`
  is at least a candidate to replace the PDAL SMRF/PMF step, pending the
  measurement in domain 8 (D5).
- **Volume computation** — paRSer `$OrthoProjectionVolume` replaces raster maths
  for stockpile volumes (D8).

Still external and not in dispute: COG conversion and validation (GDAL),
retopology, point-cloud-domain filtering, CRS plausibility checking, and every
artifact-level QA read.

### 17. Gaussian splatting

**RealityScan does not natively support Gaussian Splatting** — no training, no
native 3DGS export, no GUI or CLI feature. Neither `all-commands` nor
`keys-and-values` contains a single splat-related name. **VERIFIED (absence)**, upgraded from the draft's structural
argument.

**Disambiguation, still worth flagging**: an Epic tutorial "Introduction to
Gaussian Splatting in Unreal Engine" carries a `realityscan-*` URL slug but
concerns rendering splats *inside Unreal* via Niagara. Not a RealityScan desktop
capability.

**The integration story is what matters, and it firmed up:**

| Fact | Status |
|---|---|
| `-exportRegistration <fileName> [params.xml]` exists | **VERIFIED** |
| `-exportUndistortedImages <folderName> [params.xml]` exists, sharing the Export Registration dialog's settings | **VERIFIED** |
| `-importColmap <filePath> [params.xml]` — "any of the three text files" — exists | **VERIFIED** |
| RealityScan's own distortion model is `sfmDistortionModel`, default **`Brown3`**, options `Division`, `Brown3`, `Brown4`, `Brown3WithTangential2`, `Brown4WithTangential2`, `KplusBrown3WithTangential2`, `KplusBrown4WithTangential2` | **VERIFIED** |
| **`-exportRegistration` emits COLMAP format** | **VERIFIED that the exporter exists** — `calibration.xml` declares `desc="COLMAP" writer="RealityScan.Export.COLMAP" undistortImages="1" exportImages="1"`. **But it is not reachable by file extension**: several exporters share the `*.txt` mask, and `-exportRegistration out.txt` silently produced a plain **image list** instead. Selecting COLMAP needs the Export Registration dialog's `params.xml` |
| **`-exportRegistration out.json` writes a real nerfstudio `transforms.json`** | **VERIFIED — measured.** `camera_model: SIMPLE_RADIAL`, per-camera intrinsics, 4×4 `transform_matrix`. The `.json` mask is unique to the Radiance Fields exporter, so extension alone selects it |
| **The undistorted export is geometrically correct, not ADR 0004's defect** | **VERIFIED — measured.** Principal point sits exactly at the image centre in 9/9 frames and all distortion coefficients are zero — because the exporter **undistorts per camera**: each frame has its own image dimensions (w/2 = 2290, 2287.5, 2276.5, 2304 …) and its own focal length (2904.58, 2931.24, 2932.93 …), and `file_path` points at the exported images. Calibration is *applied*, not discarded |
| Cost of that export | ~28 MB of lossless PNG per image — 250 MB for nine frames, roughly **3.4 GB for a 122-image Capture** | MEASURED |
| **A native radiance-fields exporter exists**: `desc="Radiance Fields Transformation File"`, `mask="*.json"`, writing nerfstudio-style `transforms.json` with `"camera_model": "SIMPLE_RADIAL"`, per-camera `cx`/`cy`, `k1..k4`, and an inverted axis-flipped `transform_matrix` | **VERIFIED** — template body readable in `calibration.xml`. This may remove the need to route through COLMAP at all |
| An exporter that **preserves** calibration: `desc="OpenCV-compliant Internal/External Camera Parameters"`, `undistortImages="0"`, fields `f_pix,px_pix,py_pix,k1,k2,t2,t1,k3,k4` | **VERIFIED** — and its field order independently confirms the t1/t2 swap |
| The provisional distortion-model mapping (Brown3 → `SIMPLE_RADIAL`, Brown3+tangential2 → `OPENCV`, …) | **UNKNOWN** — no Epic page states it |
| RealityScan holds and exports a **genuine per-camera principal point** — normalized coordinates centred on the image centre, so zero means centre and non-zero means off-centre; `$px`/`$py` per camera in paRSer; `xcr:PrincipalPointU`/`V` in XMP, defaulting to centre only when *absent* | **VERIFIED** — [`camera-geometry-reference`](sources/camera-geometry-reference.md) |
| **RealityScan's tangential coefficients `t1, t2` are OpenCV's `t2, t1`** — the orderings are swapped, while radial `k1..k4` match | **VERIFIED** — an importer passing them through unchanged is silently wrong |
| The `sfmDistortionModel` → COLMAP model mapping | **UNKNOWN.** The authoritative PDF *"On the Coordinate Systems Employed in the Import, Estimation, and Export of Camera Geometry by RealityScan"* is now retrieved and saved, and it **never mentions COLMAP as an output format** — no `cameras.txt`, no COLMAP model names, and no `KplusBrown*` identifiers at all. Only a real `-exportRegistration` run settles this |

**Why this matters, restated against the code.** ADR 0004 records a real defect in
the current path: the ODM→nerfstudio conversion **forces the principal point to
the image centre and degrades silently**, and the native importer needs files ODM
writes only at the end of a full run — so ODM cannot be stopped early. The guard
that catches it is `principal_point_survived()` in
[`nodes/solve/solve.py:114`](../../nodes/solve/solve.py), which requires
`projection_type == "brown"` with `c_x`/`c_y` present and not both exactly `0.0`,
enforced at `solve.py:339-347`.

RealityScan's native model **is** Brown, by default, and the camera-geometry
reference confirms the principal point is a first-class per-camera value rather
than a centred constant — so the engine does not structurally reproduce ADR
0004's defect. What is still unresolved is what the **COLMAP writer** does with
it, because that document never mentions COLMAP as an output format. **Only a
real `-exportRegistration` run answers that**, and when it is trialled the
existing guard is the acceptance test, unchanged.

Carry one more thing into that trial: the reference states that RealityScan's
tangential coefficients `t1, t2` are OpenCV's `t2, t1`, swapped, while the radial
coefficients match. An importer that passes them through unchanged produces a
plausible-looking and wrong reconstruction, which is precisely the failure class
this repo gates against. Assert the ordering; do not assume it.

Note the direction of travel, from ADR 0005: there is no supported way to feed
ODM an external camera solve, so a RealityScan pose provider serves the **splat
chain only**. The smallest landing site is a sibling Node to `solve` emitting the
same three files in the same frame convention (`camera.json`, `poses.json`,
`cameras.json`, written at `solve.py:335-337`), because `register.py` and
`fit-splat` are already coded against that contract.

### 18. Reports

**paRSer** is a text-substitution templating language — `$(variable)` and
`$FunctionName(...)` — **not a fixed report format**. The output format is a
template-authoring choice. **VERIFIED**: [`syntax-overview`](sources/syntax-overview.md)
and [`function-sets`](sources/function-sets.md), with 22 documented function sets
harvested into `sources/`.

| Item | Status | Evidence |
|---|---|---|
| CLI verb | **`-exportReport <outputFileName> <templateFileName> [true OR false]`** | **VERIFIED (D13)** |
| Console variant | `-printReport <reportString>` — "Write out report texts in the Command Prompt … does not work with delegation" | VERIFIED |
| Built-in templates | shipped in `installation folder\Reports` | VERIFIED |
| HTML output | yes (default templates) | SUPPORTED |
| Custom templates | yes | VERIFIED |
| **Arbitrary output format incl. JSON** | **yes, by template** — a template is literal text with substitutions | VERIFIED (by construction) |
| **A shipped JSON sample** | **no** | **VERIFIED (absence)** — the install's `Reports/` directory holds only HTML templates (`Overview.html`, `ComponentAccuracyReport.html`, `SelectedComponent.html`, `Misalignment.html`, `MapView.html`, …) plus localisations. No `.json`, no `.parser` sample anywhere. We write our own |
| Function sets | 22 documented, incl. `ComponentFunctionSet`, `CameraErrorsExportFunctionSet`, `ControlPointsExportFunctionSet`, `OrthoProjectionFunctionSet`, `OrthoMeasurementFunctionSet`, `MisalignmentFunctionSet`, `RelativeCameraUncertaintyFunctionSet`, `SfmHistogramExportFunctionSet`, `IteratorsFunctionSet` | VERIFIED |

**Read**: write **one paRSer template that emits JSON**, treat it as a versioned
artifact in the repository beside the export XML templates, and have the pipeline
parse its output into QA Results. This removes HTML scraping — brittle across
engine versions — from the design entirely.

The one thing the draft assumed that documentation does not confirm is that Epic
**ships** a JSON sample. It ships templates; nothing says one of them is JSON.
That is a five-minute check on a real install, and it does not change the design
either way, because the templating language is documented well enough to write
one.

A human-readable HTML report is still generated for the client deliverable, but
it is **derived from the same data**, not the source of truth. The client's
report and the pipeline's gate then cannot disagree, which is what gate C5 is
protecting against.

---

## What is still not known after reading every page

Ordered by how much rests on it.

1. **What does `-exportRegistration`'s COLMAP writer emit?** The engine's own
   principal point is per-camera and real (verified), but the authoritative
   camera-geometry reference never mentions COLMAP as an output format, so the
   model mapping is unknown and only a real export settles it. *(Domain 17.)*
2. **Does headless reconstruction complete on Linux, repeatedly?** No Epic page
   addresses the reported hangs; Epic documents Docker + GPU passthrough as
   supported, which is evidence but not proof. **T1.2 stands unchanged.**
3. **The login dialog.** Headless-mode docs state it cannot be suppressed. A
   container blocking on it looks exactly like a hang. Needs a tier-1 test of its
   own, including what happens when a licence token expires mid-run.
4. **Determinism.** Zero mentions in 82 pages. *(T4.10.)*
5. **Whether §1.2(d) permits this business.** The EULA is now read and saved.
   The grant is "for any lawful purpose" and commercial use is plainly priced
   rather than forbidden, but §1.2 prohibits making the Software "available to
   third parties on a software-as-a-service, hosted service, time-sharing,
   **service bureau** or similar basis". A pipeline that ingests a client's site
   and returns a deliverable is not obviously that — the client never touches the
   Software — but "service bureau" is a term of art close enough to the shape of
   this business to want a written answer. *(#108.)*
6. **DTM classification quality** against a PDAL baseline. *(Domain 8.)*
7. **Is `.rsortho` hand-writable?** Less important than the draft thought, since
   `-editOrthoProjectionSelection` exists. *(Domain 9.)*
8. **Export format lists** for models, point clouds and rasters — they live in
   dialogs, not in the CLI documentation. E57, COG, LAZ, KMZ, UDIM and plain
   `.gltf` are all **UNKNOWN**, not absent. Do not promise them.
