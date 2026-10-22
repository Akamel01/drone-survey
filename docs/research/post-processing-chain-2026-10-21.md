# The complete photogrammetry post-processing chain — 2026-10-21

Written for ticket Akamel01/drone-survey#365, on the AutoForge orchestrator session, 2026-10-21.
It covers the chain from a Site's images to a finished Orthomosaic and Reconstruction: the eleven
stages the ticket names, the manual edit a professional makes at each, how that edit is detected,
how it is fixed, and whether a tool already fixes it. It does not choose an engine (that is ticket
#366), does not decide which editor ships first (that is #367), and does not plan the work — the
parent map #364 does that. Every claim is traceable to a saved page under `docs/research/sources/`.

## Evidence health

The stages were researched against the primary sources the ticket names that could be fetched: the
RealityScan documentation, the Pix4D manual, the Agisoft Metashape manual, the OpenDroneMap
documentation, the ASPRS Positional Accuracy Standards, and peer-reviewed work on automated mesh
cleanup, seamline optimisation and artefact removal. No RealityCapture page and no vendor tutorial
page was saved. Seventy-two pages are cited, each saved under
[`sources/`](sources/) with its URL, HTTP status and fetch time in a header comment, and every row in
the tables below names at least one saved page or rests on this repo's own code (three rows do the
latter and say so); the `fix` and `automatable by us` columns are the author's own judgement. The `sources/` directory also holds pages saved for
earlier tickets; they are not cited here, not listed in [Sources](#sources) and not counted in that total.

Tags used:

- **VERIFIED** — a saved primary source states it.
- **CONTRADICTED** — a saved primary source says otherwise than an earlier draft did. A difference between two editions of the same standard is not a contradiction and is tagged SUPPORTED.
- **SUPPORTED** — a page was opened but leaves it ambiguous, or the only source is not the vendor.
- **INFERRED** — follows logically from what a source states; it is not stated.
- **REQUIRES TEST** — documentation cannot settle it; it has to be measured on a real Capture.
- **UNKNOWN** — not found in any source.

Two limits on this document, stated up front. First, a saved page is not the same as a read page:
where a vendor PDF or a paper's full text could not be fetched, the cell says so and the item is
carried into [What I could not verify](#what-i-could-not-verify). Second, the `automatable by us`
column is a judgement about the chain this repo runs today — the Nodes in
`pipeline/manifests/orthomosaic.json`, the ODM stages they call, and the Gaussian Splatting Pipeline — not a
promise that a particular edit is easy.

## How to read these tables

One table per stage, eleven tables, in the order the ticket names them.

- **manual step** — the edit a professional makes by hand, in their words. One row is one edit, not
  one stage: the same edit done in three tools is one operation, so it takes one row.
- **detection signal** — what tells you the edit is needed: a named metric, a named threshold, or
  the visual symptom a tool's own documentation describes. A cell with no signal is a cell you
  cannot gate on, and is a weakness of the row.
- **fix** — what the operator does, or the tool does, to undo it.
- **automated today by** — the tool and its version, or the paper and its year, that already does
  this. A bare tool name, or a bare "yes", is not acceptable: the version or year has to be
  visible on the page this cell cites. Where the automating party is this repo's own code, no
  version is shown, because repo code carries none.
- **automatable by us (yes / partly / no and why)** — our verdict, the reason, and the condition
  that would change it. `yes` means a rule could do it today against the chain we run; `partly`
  means the operation is automatable but the decision of when or whether is ours; `no` means the
  tool leaves it to a person, and the cell says which person and what it costs.

Every row carries an evidence tag. Where a row rests on the absence of a feature — "ODM documents no
image filter" — the tag says so rather than claiming the tool has it.

## Vocabulary

The ticket's stage words map onto this repo's terms, which are used verbatim in the tables and come
from [`CONTEXT.md`](../../CONTEXT.md).

| the ticket says | this repo says |
|---|---|
| capture QA | the Capture's frames, checked by the `exif-audit` and `filter` Nodes before the solve |
| alignment | Structure from Motion — the `solve` Node. Registration across Captures is a different thing and lives in the `register` Node, which detects Anchors and writes ODM's ground control file `gcp_list.txt` from them |
| GCP/checkpoints (the ticket's word) | Ground Control Point (GCP), and Anchor for our own repeatable points; a check point is a Ground Control Point held back to check the fit |
| dense cloud, mesh, texture, ortho | the Reconstruction, its mesh, its texture, and the Orthomosaic |
| cleanup, seamlines, export | no home in `CONTEXT.md` yet — this document uses them as the ticket does and flags the gap |
| export | the Delivery Bundle and the files in it |
| the repo's `correct` Node, and any later colour treatment | **Correction** — the deterministic per-image adjustment made before reconstruction, which is the `correct` Node (`pipeline/manifests/orthomosaic.json:23-26`); **Grading** — the aesthetic treatment applied to rendered output, which never alters the Reconstruction it was rendered from |

The word "alignment" is not a term this repo uses: the stage heading above keeps the ticket's word,
and the prose means Structure from Motion. "GCP" appears only as the ticket's own stage name and in
a vendor's UI string; the repo's term, Ground Control Point, is used everywhere else. The Stage 3
heading keeps the ticket's word for the same reason `alignment` does. The product grades are the
repo's own — a **Visual-grade** deliverable carries no stated absolute accuracy, a **Survey-grade**
deliverable is anchored by Ground Control Points and states its accuracy in centimetres.

## Stage 1 — capture QA

Capture QA turns a Capture's frames into an accept/reject list before the Structure from Motion solve — the blurred, blown-out, duplicated and uncovered frames a professional deletes by hand — because a frame that survives the gate is one the solve will trust for the rest of the chain.

**Where this sits in our chain:** two Nodes and no ODM stage: the `exif-audit` gate (`pipeline/manifests/orthomosaic.json:11-15`, `nodes/exif-audit/exif_audit.py:2-9`) and the `filter` Node (`pipeline/manifests/orthomosaic.json:17-20`, `nodes/filter/filter.py:2`), whose own docstring says "ODM does not do this itself (#21)" (`nodes/filter/filter.py:4`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Delete the blurred frames before processing | Laplacian variance under 20.0; our measured DJI stills gave sharp 59-105, blurred <1 (`nodes/filter/filter.py:29`) | Drop the photo from the set; Metashape disables it from the Photos pane (`metashape-qa-manual-2-2.md`) | Metashape 2.2 / Estimate Image Quality — quality under 0.5 units "recommended to be disabled" (`metashape-qa-manual-2-2.md`); our `filter` Node / Laplacian variance (`nodes/filter/filter.py:29`) | yes — we already reject on Laplacian variance; condition: the 20.0 floor moves only against measured false-reject rates on a real Capture, not by feel. VERIFIED |
| Delete the misexposed frames | mean grayscale brightness outside 25-230 (`nodes/filter/filter.py:30-31`); no vendor per-frame exposure threshold found (`odm-filter-odm-outputs.md`) | Drop the frame; re-time the Capture if the band is hit (`nodes/filter/filter.py:30-31`) | Metashape 2.2 / no per-frame exposure rejection is documented in the saved Image quality section (`metashape-qa-manual-2-2.md`); our `filter` Node / brightness band | partly — the band is already checked; the Metashape side is an absence, read off the saved section list rather than a statement; condition: if the band must follow the Capture's own light, a fixed 25-230 becomes partly. INFERRED |
| Delete the near-duplicate frames the aircraft shot twice | average-hash Hamming distance 4 of 64 bits or less against the previous kept frame (`nodes/filter/filter.py:32`, `nodes/filter/filter.py:100-102`) | Keep one frame of the pair, drop the other before the solve | OpenDroneMap 3.6.0 / none documented — its outputs list has no image-filter stage (`odm-filter-odm-outputs.md`); our `filter` Node / average-hash check | yes — already automated; condition: only the previous kept frame is compared, so non-adjacent duplicates survive, which needs a real-Capture sweep. VERIFIED / REQUIRES TEST |
| Check the Overlap map and re-fly where the Overlap is thin | red and yellow areas are low overlap "for which poor results may be generated"; green is overlap over 5 images per pixel (`pix4d-qa-quality-report-specifications.md`) | Re-fly the Site with more Overlap, or add flight lines | Pix4Dmapper 4.1 / Quality Report check "All the checks are green" (`pix4d-qa-manual-4-1.md`) | partly — we can gate on the frame count and the calibrated-image share; condition: the Overlap map itself is a per-pixel product of the solve, so a test on a real Capture with thin Overlap would settle what we can read from our own output. REQUIRES TEST |
| Re-shoot the Site when the frames cannot be repaired | the Capture is refused at the gate, or the solve leaves a part of the Site with no images (nodes/exif-audit/exif_audit.py:91-92) | Send the Site back and fly it again with the same Grid Mission (nodes/exif-audit/exif_audit.py:91-92) | our `exif-audit` Node, which refuses a Capture that cannot be repaired (nodes/exif-audit/exif_audit.py:91-92) | yes — the refusal already happens in the gate; condition: nothing in the chain can tell a Site that needs re-flying from one that is merely hard, so the operator still decides; this row rests on this repo's own code and cites no vendor page (VERIFIED for the repo's own gate; no vendor page is cited for this row) |
| Fail the Capture when the frames carry no GPS or were not shot with the same locked settings | missing GPSLatitude/GPSLongitude, or Make/Model/ExposureTime/FNumber/FocalLength differing across the set (`nodes/exif-audit/exif_audit.py:38`, `nodes/exif-audit/exif_audit.py:46-57`) | Send the Capture back to the operator; re-fly if the light or settings were off | our `exif-audit` Node / exact-match gate, non-zero exit (`nodes/exif-audit/exif_audit.py:91-92`); Pix4Dmapper 4.1 / dataset images and their geolocation must be obtained on the field first (`pix4d-qa-manual-4-1-dataset.md`) | yes — the gate already runs; condition: ISO stays out of the locked set by design, so an auto-ISO Capture passes (`nodes/exif-audit/exif_audit.py:15-27`). VERIFIED |

Sources:

- `docs/research/sources/metashape-qa-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21
- `docs/research/sources/pix4d-qa-quality-report-specifications.md` — https://support.pix4d.com/hc/en-us/articles/202558679 — fetched 2026-10-21
- `docs/research/sources/pix4d-qa-manual-4-1.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21
- `docs/research/sources/pix4d-qa-manual-4-1-dataset.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21
- `docs/research/sources/odm-filter-odm-outputs.md` — https://docs.opendronemap.org/outputs/ — fetched 2026-10-21

## Stage 2 — alignment

The ticket's `alignment` stage covers Structure from Motion in this repo: the step that recovers each frame's camera pose and the sparse point cloud for one Capture, which is what an operator inspects when a Reconstruction comes out wrong or fragmented.

**Where this sits in our chain:** the `solve` Node (`pipeline/manifests/orthomosaic.json:29-42`, `nodes/solve/solve.py:2`); Registration across Captures is a different thing and lives in the `register` Node, which detects Anchors and writes ODM's ground control file `gcp_list.txt` from them (`pipeline/manifests/orthomosaic.json:44-56`, `nodes/register/register.py:2-9`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Read the reprojection error and the camera-optimization number, then re-optimize the camera | Mean Reprojection Error [pixels]; Camera Optimization is the difference between initial and optimized focal length: under 5% good, 5-20% warning, over 20% error (the thresholds are VERIFIED; good/warning/error are the report's colour coding, not in the saved text) (`pix4d-qa-quality-report-specifications.md`) | Re-run the optimization on the corrected camera model; Metashape's Optimize Cameras "performs a full bundle adjustment procedure" (`metashape-qa-manual-2-2.md`) | Pix4Dmapper 4.1 / Quality Report checks "All the checks are green" and "below 5%" (`pix4d-qa-manual-4-1.md`); Metashape 2.2 / reprojection error as root mean square over all tie points (`metashape-qa-manual-2-2.md`) | partly — the numbers are not in what our `solve` reads: `nodes/solve/solve.py:220-241` returns camera poses and shots only, with no residual and no reprojection error; condition: ODM must expose per-shot residuals before we can gate on them. VERIFIED for the thresholds, INFERRED for the good/warning/error labels, REQUIRES TEST |
| Disable the frames that did not solve, then run the solve again | fewer than 60% of enabled images calibrated is the red case (`pix4d-qa-quality-report-specifications.md`); our solve runs ODM at feature-quality=low against ODM's default of high (`pipeline/manifests/orthomosaic.json:33`, `odm-filter-feature-quality.md`) | Disable the unaligned photos and re-run Align Photos (`metashape-qa-manual-2-2.md`); Pix4D requires Reoptimize after enabling or disabling images (`pix4d-qa-manual-4-1-tie-points.md`) | OpenDroneMap 3.6.0 / `opensfm/` holds "Tie Points and camera positions here in JSON format" (`odm-filter-odm-outputs.md`); our `solve` exits with "solve failed to align any shots" on zero components (`nodes/solve/solve.py:229`) | yes — a frame with no entry in OpenSfM's shots did not solve, so the drop is mechanical; condition: a frame that alone saw part of the Site needs the operator's call, which makes that case partly. INFERRED |
| Delete the tie points with high reprojection error, then re-optimize | Metashape's maximum reprojection error in normalized units; high error is also typical for false matches (`metashape-qa-manual-2-2.md`); RealityScan reports Maximal, Median and Mean reprojection error in pixels (`available-functions-componentfunctionset.md`) | Tools > Tie Points > Clean Tie Points, pick the Reprojection error criterion, set the threshold slider, Delete Selection, then Optimize Cameras (`metashape-qa-manual-2-2.md`) | Metashape 2.2 / Clean Tie Points with the Reprojection error criterion (`metashape-qa-manual-2-2.md`); RealityScan 2.2 / ReprojectionError function set, version in `realityscan-2-2.md` | partly — the criterion and the deletion are parameterised, and the lever is the feature and robust-estimation choice benchmarked by Jin et al. 2020 (`paper-qa-image-matching-wide-baselines.md`); condition: ODM must expose per-point residuals, which the `register` Node already records as unverified (`nodes/register/register.py:287-292`). INFERRED |
| Mark a Manual Tie Point on the same feature in several frames to bridge two blocks | Pix4D reports Projection Error [pixel] per Manual Tie Point — the average distance between where it was marked and where it was reprojected; no pass/fail threshold is published (`pix4d-qa-quality-report-specifications.md`) | Mark the point in each overlapping frame, then Reoptimize (`pix4d-qa-manual-4-1-tie-points.md`) | Pix4Dmapper 4.1 / Manual Tie Points "improve the reconstruction and help to properly adjust the model" (`pix4d-qa-manual-4-1-tie-points.md`) | partly — our `register` Node already projects Anchors and gates them (`nodes/register/register.py:283-314`), but marking a point in a frame is an operator act; condition: a real Anchor detector makes it yes. INFERRED |
| Merge or discard the blocks the solve split into | RealityScan keeps components apart and reports their reprojection error in pixels (`available-functions-componentfunctionset.md`); `setMinComponentSize` defaults to 5 (`alignment-commands.md`) | Merge the components, or keep the best one and re-fly the rest (`alignment-commands.md`) | RealityScan, version unconfirmed on the saved page / mergeComponents and selectComponentWithLeastReprojectionError, "the smallest reprojection error, based on the calculated Mean error [pixels]" (`alignment-commands.md`, `all-commands.md`) | no — which block of the Site to keep is the operator's call; condition: a rule that keeps the component with the lowest mean error and re-flies the rest would make it partly. INFERRED |

Sources:

- `docs/research/sources/pix4d-qa-quality-report-specifications.md` — https://support.pix4d.com/hc/en-us/articles/202558679 — fetched 2026-10-21
- `docs/research/sources/pix4d-qa-manual-4-1.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21
- `docs/research/sources/pix4d-qa-manual-4-1-tie-points.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21
- `docs/research/sources/metashape-qa-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21
- `docs/research/sources/odm-filter-odm-outputs.md` — https://docs.opendronemap.org/outputs/ — fetched 2026-10-21
- `docs/research/sources/paper-qa-image-matching-wide-baselines.md` — https://arxiv.org/abs/2003.01587 — fetched 2026-10-21 — Jin, Mishkin, Mishchuk, Matas, Fua, Yi, Trulls, "Image Matching across Wide Baselines: From Paper to Practice", 2020, DOI 10.1007/s11263-020-01385-0 (the peer-reviewed benchmark behind the outlier-tie-point row)
- `docs/research/sources/alignment-commands.md`, `docs/research/sources/all-commands.md`, `docs/research/sources/available-functions-componentfunctionset.md`, `docs/research/sources/realityscan-2-2.md` — RealityScan documentation already saved under `docs/research/sources/`, fetched 2026-09-19 (read-only, not re-saved)

## Stage 3 — GCP/checkpoints

Ground Control Points and check points are what turn a Reconstruction that is only internally consistent into one anchored to real-world coordinates, so they are the difference between a Visual-grade deliverable and a Survey-grade one for a Site; in our chain the same slot is filled by Anchors, whose real-world coordinates we do not know.

**Where this sits in our chain:** `register` detects Anchors and writes ODM's ground control file `gcp_list.txt` (`pipeline/manifests/orthomosaic.json:44-56`, `:55`), and `solve-final` feeds it back to ODM (`pipeline/manifests/orthomosaic.json:58-70`, `:61`); the Manifest still declares `"ground_control_points": false` (`pipeline/manifests/orthomosaic.json:3`) and the Anchor gates sit at `nodes/register/register.py:86-88`.

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Import surveyed Ground Control Point coordinates and mark each point on the images | Pix4D: a point marked in fewer than 2 images, or fewer than 3 points, is not taken into account by the reconstruction (pix4d-gcp-minimum-number-and-distribution.md) | load a 4- or 6-column CSV (label, easting, northing, altitude) and mark it on the images (pix4d-gcp-input-files-format.md) | Pix4Dmapper 4.1 / Import GCPs in the GCP/MTP Manager (pix4d-gcp-input-files-format.md, pix4d-gcp-minimum-number-and-distribution.md) | partly — the CSV is machine-emittable and our `register` Node already writes ODM's `gcp_list.txt` (`pipeline/manifests/orthomosaic.json:55`), but marking each point in the frames is an operator act; changes if a detector that finds the Ground Control Points does it (SUPPORTED) |
| Lay the Ground Control Points out over the Site: how many, where, how far from the edge | ODM: 5 minimum, 8-10 for larger jobs, each in 5 images, 10-30 m from the perimeter (odm-dem-map-accuracy-ground-control.md) | survey and mark the Ground Control Points on the Site before the Capture | Pix4Dmapper 4.1 / no placement tool, it documents the count and distribution rules only (pix4d-gcp-minimum-number-and-distribution.md) | no — placing and surveying the Ground Control Points is field work no tool does; changes if we detect the Ground Control Points ourselves (INFERRED) |
| Hold some points back as check points so the solve is judged, not fitted | ASPRS 2023: checkpoints at least 2x more accurate than the product, 30 minimum (7.12, 7.13); the 2014 edition said 3x and 20 (SUPPORTED — the two editions differ from each other, not from an earlier draft) (asprs-gcp-positional-accuracy-standards-edition2-2023.md, asprs-gcp-checkpoint-requirements-edition1-2014.md) | uncheck the entry on the Reference pane and read the Errors tab (metashape-gcp-reference-pane-and-errors.md) | Agisoft Metashape 2.2 / Reference pane, View Errors, control point against check point (metashape-gcp-reference-pane-and-errors.md) | partly — Metashape separates the two roles and reports error per coordinate, ODM has no documented check point role; changes if ODM documents one (SUPPORTED for the two editions, UNKNOWN for the ODM check-point role) |
| Judge the residuals against the target accuracy class, then re-solve once a blunder is removed | ASPRS: a checkpoint discrepancy over three times the target RMSE in any of x, y, z is a blunder (7.2); Pix4D: the Quality Report state is a GCP error under 2 times the average GSD (asprs-gcp-positional-accuracy-standards-edition2-2023.md, pix4d-qa-quality-report-specifications.md) | investigate and correct the point, then re-optimize before the new report (pix4d-qa-manual-4-1-tie-points.md) | Pix4Dmapper, version unconfirmed on the saved page / Quality Report GCP error: its own state above 2x the average GSD, failed above 4x (pix4d-qa-quality-report-specifications.md) | partly — the metrics are reported and thresholded, the verdict is a human reading; changes if we script the report (INFERRED) |
| State the accuracy class the Site must meet, and survey the Ground Control Points to suit it | ASPRS Table 7.1: an X-cm Horizontal Accuracy Class means RMSEH <= X; Table 7.2: NVA RMSEV <= X with VVA as found; Table 7.3: RMSE3D <= X (asprs-gcp-positional-accuracy-standards-edition2-2023.md) | survey the control twice as accurate as the product: RMSEH(GCP) <= 0.5 x RMSEH(MAP), RMSEV(GCP) <= 0.5 x RMSEV(DEM) (7.9) (asprs-gcp-positional-accuracy-standards-edition2-2023.md) | Pix4Dmapper, version unconfirmed on the saved page / per-point Accuracy columns carried into the Quality Report (pix4d-gcp-input-files-format.md, pix4d-qa-quality-report-specifications.md) | partly — the class and the survey accuracy are recorded, choosing the class per Site is the operator's call; changes if a client names the class (INFERRED) |
| Import the Ground Control Points headlessly, in the same run as the solve | RealityScan selectMeasurementByError flags any measurement at or above a pixel error (all-commands.md) | importGroundControlPoints <gcpFileName> [params.xml] (all-commands.md) | RealityScan 2.2 / importGroundControlPoints and exportGroundControlPoints (all-commands.md, realityscan-2-2.md) | partly — a documented CLI verb exists for import and for export, but it is a RealityScan verb and our chain runs ODM; condition: a RealityScan step in our chain, or an ODM equivalent, would make it yes (SUPPORTED) |

Sources: (inline citations are file names under `docs/research/sources/`)
- `docs/research/sources/pix4d-gcp-minimum-number-and-distribution.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:34:40Z
- `docs/research/sources/pix4d-gcp-input-files-format.md` — https://support.pix4d.com/hc/en-us/articles/202558539 — fetched 2026-10-21T12:35:43Z
- `docs/research/sources/metashape-gcp-reference-pane-and-errors.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:34:42Z
- `docs/research/sources/asprs-gcp-positional-accuracy-standards-edition2-2023.md` — https://aagsmo.org/wp-content/uploads/2023/03/ASPRS_PosAcc_Edition2_MainBody.pdf — fetched 2026-10-21T12:37:24Z
- `docs/research/sources/asprs-gcp-checkpoint-requirements-edition1-2014.md` — http://florida.asprs.org/images/documents/ASPRS_Positional_Accuracy_Standards_Edition1_Version100_November2014.pdf — fetched 2026-10-21T12:37:24Z
- `docs/research/sources/odm-dem-map-accuracy-ground-control.md` — https://docs.opendronemap.org/map-accuracy/ — fetched 2026-10-21T12:33:31Z
- `docs/research/sources/pix4d-qa-quality-report-specifications.md` — https://support.pix4d.com/hc/en-us/articles/202558679 — fetched 2026-10-21T12:16:21Z (already saved before this ticket)
- `docs/research/sources/pix4d-qa-manual-4-1-tie-points.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:09:03Z (already saved before this ticket)
- `docs/research/sources/pix4d-qa-manual-4-1.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:09:03Z (already saved before this ticket)
- `docs/research/sources/all-commands.md` — https://dev.epicgames.com/documentation/en-us/realityscan/all-commands — fetched 2026-09-19T01:51:32Z (already saved before this ticket)
- `docs/research/sources/realityscan-2-2.md` — https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-2-2 — fetched 2026-09-19T01:50:00Z (already saved before this ticket)

## Stage 4 — dense cloud

The dense cloud is the dense point cloud ODM builds from one Capture's depth maps — the measured surface every later stage of the Pipeline is cut from — and the operator cares because floaters, thin noise and misclassified ground show up here first, in the frames the Capture's Nadir pass and Overlap gave us.

**Where this sits in our chain:** the `reconstruct-dense` Node (`pipeline/manifests/orthomosaic.json:72-81`), which reruns ODM from `opensfm` to `odm_filterpoints` (`pipeline/manifests/orthomosaic.json:76`, `nodes/reconstruct/reconstruct.py:24`) with `--option pc-quality=low` (`pipeline/manifests/orthomosaic.json:77`); there is no `nodes/reconstruct-dense/` directory — all four reconstruct Nodes are the one script `nodes/reconstruct/reconstruct.py:2-3`.

**Source coverage:** no RealityScan dense-cloud page was fetched for this document, so this stage names no RealityScan source, and no claim is made about RealityScan's dense-cloud defaults (UNKNOWN).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Strip the floaters and noisy points out of the dense cloud | ODM removes points deviating more than N standard deviations from the local mean; N default 5, 0 disables (odm-dense-pc-filter.md); PIX4Dmapper: deactivating Multiscale "produces less noise in the Point Cloud", and Minimum Number of Matches 4 "reduces the noise and improves the quality of the point cloud" (pix4d-clean-point-cloud-processing-options.md) | ODM `--pc-filter N`; Metashape Tools > Point Cloud > Filter by Confidence (metashape-dense-editing-point-cloud.md) | OpenDroneMap 3.6.0 / `--pc-filter`, default 5 (odm-dense-pc-filter.md); Agisoft Metashape 2.2 / Filter by Confidence (metashape-dense-editing-point-cloud.md); PIX4Dmapper, version unconfirmed on the saved page / Multiscale off and Minimum Number of Matches (pix4d-clean-point-cloud-processing-options.md); our own statistical outlier removal on the Gaussian Splatting path, k=8, std_ratio=2.0, repo code with no version tag (`nodes/clean-splat/clean_splat.py:65-66`, `:185`) | partly — ODM already filters, but the threshold is ODM's default, not one we chose for a Site; condition: a per-Site value settled by a run over a real Capture. INFERRED |
| Thin the cloud down to a workable point spacing, so the mesh and the Orthomosaic can be built | ODM `--pc-sample` keeps one point around a radius N metres, default 0 (odm-dense-pc-sample.md); Metashape reduces the count by a point spacing in metres (metashape-dense-editing-point-cloud.md); PIX4Dmapper's Point Density computes "A 3D point is computed for every (4/ Image Scale) pixel." (pix4d-clean-point-cloud-processing-options.md) | ODM `--pc-sample N`; Metashape Filter Point Cloud, Point spacing (metashape-dense-editing-point-cloud.md) | OpenDroneMap 3.6.0 / `--pc-sample`, default 0 (odm-dense-pc-sample.md); Agisoft Metashape 2.2 / point spacing (metashape-dense-editing-point-cloud.md); PIX4Dmapper, version unconfirmed on the saved page / Point Density, Optimal default (pix4d-clean-point-cloud-processing-options.md) | yes — the tools expose it as one number and we already hold the Capture's GSD; condition: the GSD-to-spacing rule is ours to write, the knob is not. VERIFIED |
| Choose how dense the cloud is, and pay the time for it | ODM `--pc-quality` takes ultra, high, medium, low or lowest, default medium, each step up roughly 4x the time (odm-dense-pc-quality.md); Metashape's Quality setting: "image size downscaling by factor of 4 (2 times by each side)" (metashape-dense-build-point-cloud.md); PIX4Dmapper's Point Density High requires up to 4 times more processing time and RAM (pix4d-clean-point-cloud-processing-options.md) | raise `--pc-quality`; re-run Build Point Cloud at a higher Quality | OpenDroneMap 3.6.0 / `--pc-quality`, default medium (odm-dense-pc-quality.md); Agisoft Metashape 2.2 / Build Point Cloud Quality (metashape-dense-build-point-cloud.md); PIX4Dmapper, version unconfirmed on the saved page / Point Density, Optimal default (pix4d-clean-point-cloud-processing-options.md); our chain pins `pc-quality=low` (`pipeline/manifests/orthomosaic.json:77`) | partly — the knob exists and we already set it, but "low" is a blanket choice rather than one made from the Site; condition: a rule reading image count and GSD would make it yes. VERIFIED |
| Filter the depth maps so outliers never enter the cloud | Metashape depth filtering Mild/Moderate/Aggressive/Disabled, done by a connected component filter whose preset caps the discarded component size; Aggressive is "normally recommended for aerial data processing" (metashape-dense-build-point-cloud.md) | set the depth filtering mode before Build Point Cloud; ODM's published option list holds no depth filter (odm-mesh-options-and-flags.md) | Agisoft Metashape 2.2 / Depth filtering modes, four presets (metashape-dense-build-point-cloud.md); OpenDroneMap 3.6.0 / no depth-filtering option published (odm-mesh-options-and-flags.md) | no — ODM exposes no depth-map control, so on our chain this step is not ours to automate; condition: an ODM option, or our own pre-filter Node, would make it partly. VERIFIED |
| State the density a Site's ground sampling should give, and judge the cloud against it | no tool states a points-per-area target for a GSD; Metashape gives point spacing (m) and an estimated point count, ODM gives neither (metashape-dense-build-point-cloud.md, odm-dense-pc-quality.md) | derive the spacing from the Capture's GSD, then set `--pc-sample` to it | Agisoft Metashape 2.2 / Uniform point spacing (m) and Estimated point count (metashape-dense-build-point-cloud.md); OpenDroneMap 3.6.0 / no documented density target (odm-dense-pc-quality.md) | partly — the GSD is ours from the solve and the knob is documented, so the rule is ours to write; condition: a published points-per-area figure to copy instead of inventing one. UNKNOWN |

Sources:

- `docs/research/sources/odm-dense-pc-filter.md` — https://docs.opendronemap.org/arguments/pc-filter — fetched 2026-10-21T12:46:05Z
- `docs/research/sources/odm-dense-pc-sample.md` — https://docs.opendronemap.org/arguments/pc-sample — fetched 2026-10-21T12:46:05Z
- `docs/research/sources/odm-dense-pc-quality.md` — https://docs.opendronemap.org/arguments/pc-quality — fetched 2026-10-21T12:46:05Z
- `docs/research/sources/odm-dense-pc-rectify.md` — https://docs.opendronemap.org/arguments/pc-rectify — fetched 2026-10-21T12:46:05Z
- `docs/research/sources/odm-dense-pc-classify.md` — https://docs.opendronemap.org/arguments/pc-classify — fetched 2026-10-21T12:46:06Z
- `docs/research/sources/odm-mesh-options-and-flags.md` — https://docs.opendronemap.org/arguments/ — fetched 2026-10-21T12:48:42Z
- `docs/research/sources/metashape-dense-build-point-cloud.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z
- `docs/research/sources/metashape-dense-editing-point-cloud.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z
- `docs/research/sources/pix4d-clean-point-cloud-processing-options.md` — https://support.pix4d.com/hc/en-us/articles/202557799 — fetched 2026-10-21T14:55:22Z

## Stage 5 — mesh

The mesh is the triangulated surface ODM builds from the dense cloud and then textures — the visible body of the Reconstruction — and the operator cares because holes, floating fragments and a runaway polygon count are what make a deliverable unusable; a Survey-grade claim still needs Ground Control Points we do not supply (`pipeline/manifests/orthomosaic.json:3`), so today's mesh is Visual-grade at best.

**Where this sits in our chain:** the `reconstruct-mesh` Node (`pipeline/manifests/orthomosaic.json:83-91`), which reruns ODM from `odm_meshing` to `mvs_texturing` (`pipeline/manifests/orthomosaic.json:87`, `nodes/reconstruct/reconstruct.py:25`); there is no `nodes/reconstruct-mesh/` directory — the same script `nodes/reconstruct/reconstruct.py:2-3` runs it, and the texturing half of the stage shares that Node.

**Source coverage:** no RealityScan 3D mesh page was fetched for this document, so this stage names no RealityScan source, and no claim is made about RealityScan's mesh defaults (UNKNOWN).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Cut the polygon count down so the deliverable opens | "Metashape tends to produce 3D models with excessive geometry resolution", and it recommends decimating to 100000-200000 polygons for PDF export (metashape-mesh-editing-model-geometry.md); PIX4Dmapper discards spurious triangles by a Decimation Criteria, quantitative to a Maximum Number of Triangles or qualitative against the original geometry (pix4d-texture-3d-textured-mesh-processing-options.md) | Metashape Decimate Model with a target polygon count; ODM `--mesh-size` | Agisoft Metashape 2.2 / Decimate Model, target polygon count (metashape-mesh-editing-model-geometry.md); OpenDroneMap 3.6.0 / `--mesh-size`, default 200000 vertices (odm-mesh-mesh-size.md); PIX4Dmapper, version unconfirmed on the saved page / Decimation Criteria and Maximum Number of Triangles (pix4d-texture-3d-textured-mesh-processing-options.md) | yes — both are a single number we can set from the deliverable we are about to ship; condition: the budget has to follow the deliverable, one global cap will not do. VERIFIED |
| Delete the small disconnected fragments floating round the Reconstruction | Metashape's Connected component size criterion selects isolated fragments by polygon count, the largest component taken as 100% (metashape-mesh-editing-model-geometry.md); PIX4Dmatic's deghosting "adjusts the parameters used during mesh generation to handle outliers", Weak by default and Strong for significant motion (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md); our own gate fails the stage when faces fall below 0.0005 per cloud point (`nodes/reconstruct/reconstruct.py:54`, `:143-151`) | Metashape Tools > Model > Clean Model with the Connected component size criterion, then Delete Selection; ODM's option list holds no component removal (odm-mesh-options-and-flags.md) | Agisoft Metashape 2.2 / Clean Model, Connected component size criterion (metashape-mesh-editing-model-geometry.md); OpenDroneMap 3.6.0 / no component-removal option published (odm-mesh-options-and-flags.md); PIX4Dmatic, version not stated on the saved page (its 2.4.0 note concerns pause and resume, not the deghosting) / Deghosting, Weak default and Strong (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md) | partly — we already gate the mesh against the cloud but do not remove fragments; condition: no mesh file reaches disk today — `nodes/reconstruct/reconstruct.py:86-90` extracts only the orthophoto, the report and the shots, the mesh is only counted inside the zip (`:129`) and the zip is deleted (`:130`) — so a Node that extracts and filters the mesh would be needed, and a run over a real Capture would settle it. INFERRED |
| Close the holes the Reconstruction left in the surface | Metashape's Close Holes tool takes the maximum hole size to cover, given as the maximum size of a hole to be covered, set in relation to the size of the whole model surface (metashape-mesh-editing-model-geometry.md); automated hole detection in edge-manifold meshes is published — Yip, Stahl & Schellewald, 2023 preprint of a 2024 journal paper, DOI 10.1016/j.cad.2024.103696 (paper-mesh-robust-hole-detection-triangular-meshes.md) | Metashape Tools > Model > Close Holes; the Extrapolated interpolation mode builds a holeless model outright (metashape-mesh-build-model.md) | Agisoft Metashape 2.2 / Close Holes tool (metashape-mesh-editing-model-geometry.md); OpenDroneMap 3.6.0 / no hole-filling option published (odm-mesh-options-and-flags.md) | partly — the operation is named and parameterised, but only in a vendor tool we do not run; condition: if ODM's mesh is already watertight we may never need it — Poisson surface reconstruction is watertight by construction (Kazhdan & Hoppe 2013, DOI 10.1145/2487228.2487237, paper-mesh-screened-poisson-kazhdan-hoppe-2013.md), and the saved ODM page names no reconstruction method. INFERRED |
| Smooth the surface and repair its topology | Metashape's Smooth Model takes a Strength slider and a Fix borders option; View Model Statistics reports the mesh parameters and offers a Fix Topology button when there are topological problems (metashape-mesh-editing-model-geometry.md) | Metashape Tools > Model > Smooth Model, then View Model Statistics > Fix Topology | Agisoft Metashape 2.2 / Smooth Model and Fix Topology (metashape-mesh-editing-model-geometry.md); OpenDroneMap 3.6.0 / no smoothing or topology option published (odm-mesh-options-and-flags.md) | partly — both are parameterised but vendor-only, so we would script Metashape or implement them on a mesh we do not have on disk today; condition: a run showing topology faults in our own meshes would make them worth building. INFERRED |
| Build the surface from the cloud and choose the method and its limits | octree depth default 11, recommended 8-12 (odm-mesh-mesh-octree-depth.md); the saved ODM page names no reconstruction method, so the Poisson attribution rests on Kazhdan & Hoppe, not on ODM's own documentation; PIX4Dmapper's Maximum Octree Depth sets how many times the project is subdivided, "more regions will be created, hence each region will be small" (pix4d-texture-3d-textured-mesh-processing-options.md); Metashape's Build Model takes the source, the surface type (Arbitrary or Height field) and a face count limit (metashape-mesh-build-model.md) | set `--mesh-octree-depth` and `--mesh-size`; in Metashape choose Build Model source, surface type and Face count (1/5, 1/15 or 1/45 of the source point count) | OpenDroneMap 3.6.0 / `odm_meshing`, octree depth default 11 (odm-mesh-mesh-octree-depth.md); Agisoft Metashape 2.2 / Build Model (metashape-mesh-build-model.md); PIX4Dmapper, version unconfirmed on the saved page / Maximum Octree Depth (pix4d-texture-3d-textured-mesh-processing-options.md); Kazhdan & Hoppe 2013, Screened Poisson Surface Reconstruction, DOI 10.1145/2487228.2487237 (paper-mesh-screened-poisson-kazhdan-hoppe-2013.md, paper-mesh-screened-poisson-crossref-record.md) | yes — our chain already runs this stage (`pipeline/manifests/orthomosaic.json:87`); condition: the octree depth and the vertex cap stay at ODM's defaults unless a per-Site rule is written. VERIFIED for the octree default, INFERRED for the Poisson attribution |

Sources:

- `docs/research/sources/odm-mesh-mesh-size.md` — https://docs.opendronemap.org/arguments/mesh-size — fetched 2026-10-21T12:46:06Z
- `docs/research/sources/odm-mesh-mesh-octree-depth.md` — https://docs.opendronemap.org/arguments/mesh-octree-depth — fetched 2026-10-21T12:46:06Z
- `docs/research/sources/odm-mesh-use-3dmesh.md` — https://docs.opendronemap.org/arguments/use-3dmesh — fetched 2026-10-21T12:46:06Z
- `docs/research/sources/odm-mesh-options-and-flags.md` — https://docs.opendronemap.org/arguments/ — fetched 2026-10-21T12:48:42Z
- `docs/research/sources/metashape-mesh-build-model.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z
- `docs/research/sources/metashape-mesh-editing-model-geometry.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z
- `docs/research/sources/paper-mesh-screened-poisson-kazhdan-hoppe-2013.md` — https://www.cs.jhu.edu/~misha/MyPapers/ToG13.pdf — fetched 2026-10-21T12:47:10Z — Kazhdan & Hoppe, "Screened Poisson Surface Reconstruction", 2013, DOI 10.1145/2487228.2487237
- `docs/research/sources/paper-mesh-screened-poisson-crossref-record.md` — https://api.crossref.org/works/10.1145/2487228.2487237 — fetched 2026-10-21T12:48:42Z — the Crossref DOI record carrying the title, the venue and the year 2013
- `docs/research/sources/paper-mesh-robust-hole-detection-triangular-meshes.md` — https://arxiv.org/abs/2311.12466 — fetched 2026-10-21T12:47:10Z — Yip, Stahl & Schellewald, "Robust Hole-Detection in Triangular Meshes Irrespective of the Presence of Singular Vertices", 2023 preprint of Computer-Aided Design, DOI 10.1016/j.cad.2024.103696 (the preprint page carries the related journal DOI)
- `docs/research/sources/pix4d-texture-3d-textured-mesh-processing-options.md` — https://support.pix4d.com/hc/en-us/articles/208194103 — fetched 2026-10-21T14:55:21Z
- `docs/research/sources/pix4d-clean-mesh-outlier-filtering-and-sky-mask.md` — https://support.pix4d.com/hc/en-us/articles/4407652056593 — fetched 2026-10-21T14:55:23Z

## Stage 6 — cleanup

Cleanup is the stage that turns a Reconstruction that is geometrically plausible into one a client can be shown. The parent map names the five artefact classes that block a deliverable — floaters, holes, sky/water artefacts, seamline ghosts, moving objects — and each gets a row below.

**Where this sits in our chain:** the mesh and its texture come out of the `reconstruct-mesh` Node (`pipeline/manifests/orthomosaic.json:83-91`) and nothing between that Node and `export-cog` cleans the mesh; the repo's automated cleanups are `clean-splat` on the Gaussian Splatting path, which removes floaters and crops to the Site polygon (`nodes/clean-splat/clean_splat.py:185`, and the research at `docs/research/splat-auto-cleaning-2026.md`), and `cut-island`, which trims a Reconstruction to the Site boundary (`nodes/cut-island/cut_island.py:2-13`, wired at `pipeline/manifests/showcase.json:10-21`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Remove floaters — disconnected geometry hanging off the surface | a connected component of the mesh smaller than the largest one — RealityScan's `selectLargestModelComponent` selects triangles that belong to the largest connected component of the model (model-tools.md) | RealityScan `selectLargestModelComponent` then `removeSelectedTriangles`; `cleanModel` removes non-manifold edges and vertices and closes small holes (model-tools.md) | RealityScan 2.2 `cleanModel`, `selectLargestModelComponent` (model-tools.md); the repo's own `clean-splat` removes floaters by statistical outlier removal and crops to the Site polygon when one is given (nodes/clean-splat/clean_splat.py:185, nodes/clean-splat/clean_splat.py:9-10) | partly — component size is measurable, but the repo removes floaters on the splat path by statistical outlier removal, not by component size (nodes/clean-splat/clean_splat.py:65-66, nodes/clean-splat/clean_splat.py:185), and no mesh file reaches disk today (nodes/reconstruct/reconstruct.py:86-90), so a Node that extracts and filters the mesh would be needed; condition: a Site's deliberate small structure may be smaller than any threshold we pick (INFERRED) |
| Close holes in the mesh | gaps in the surface where the dense cloud had no points (model-tools.md, paper-mesh-robust-hole-detection-triangular-meshes.md) | RealityScan `closeHoles` with `maxEdgesCount`; Metashape mesh `Fill holes` (model-tools.md, metashape-mesh-editing-model-geometry.md) | RealityScan 2.2 `closeHoles` (model-tools.md); Poisson reconstruction produces a watertight surface from a noisy point set (paper-mesh-screened-poisson-kazhdan-hoppe-2013.md) | partly — hole detection can be automated, and Yip, Stahl & Schellewald (2023 preprint of a 2024 journal paper) automate hole detection in triangular meshes (paper-mesh-robust-hole-detection-triangular-meshes.md), but the fill itself is a vendor operation our chain does not run, as Stage 5's row records; the open question is whether a detected hole is a hole or a real opening (INFERRED) |
| Remove sky and water artefacts | a Sky mask that is only available if the Sky filter was enabled during densification; no surveyed VENDOR TOOL states a rule for a water surface; the peer-reviewed literature does segment water from other surfaces in RGB imagery (paper-artefact-water-segmentation.md) | PIX4Dmatic `Sky filter` at densification plus `Sky mask` at meshing; point-cloud classification and masks (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md, metashape-clean-manual-2-2.md) | PIX4Dmatic, version not stated on the saved page (its 2.4.0 note concerns pause and resume, not the Sky mask) (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md); Agisoft Metashape 2.2 point-cloud filtering and masks (metashape-clean-manual-2-2.md); Akiyama et al. 2020, "DEEP LEARNING APPLIED TO WATER SEGMENTATION", DOI 10.5194/isprs-archives-XLIII-B2-2020-1189-2020 / SegNet semantic segmentation (paper-artefact-water-segmentation.md) | partly — sky is separable by geometry, and water is separable by appearance: the literature segments water in RGB imagery with a learned classifier (paper-artefact-water-segmentation.md), but a flat dark surface may still be a legitimate DTM, and no surveyed VENDOR TOOL we run states a rule for telling a pond from a roof (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md documents a mask, not a rule); condition: the classifier is published, not shipped in a tool we run (VERIFIED for the literature's separation, UNKNOWN for the tools) |
| Remove seamline ghosts — the artefacts a join leaves in the Orthomosaic | moving objects, and oblique aerial imagery of high buildings or facades shot from too oblique positions, cause artefacts which interfere with visual quality of the Orthomosaic (metashape-seam-manual-2-2.md) | Metashape's ghosting filter, and seamline editing to re-texture the area from one image (metashape-ortho-manual-2-2.md, metashape-seam-manual-2-2.md) | Agisoft Metashape 2.2 ghosting filter (metashape-ortho-manual-2-2.md) | partly — the ghosting filter is a parameter Metashape ships, but the artefacts that survive it are exactly the ones a human re-textures by hand; the seamlines stage owns the placement (VERIFIED for the filter, INFERRED for the residue) |
| Remove moving objects — cars, trains, people that did not reconstruct | artefacts around thin structures (e.g., cables, antennae) or moving objects when the deghosting is left at its Weak default (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md); moving objects that failed to be reconstructed as part of the polygonal model (metashape-ortho-manual-2-2.md); a moving object leaves a hole or a smear, not a sign on the ground — the literature detects and removes vehicles from a photogrammetric mesh (paper-artefact-vehicle-removal-photogrammetric-meshes.md), and a depth-learning paper that learns structure-from-motion from motion treats moving objects as an error source in its unsupervised optimisation and cites residual-optical-flow exclusion as prior work (paper-artefact-depth-learning-moving-object-error.md), but nothing in our chain runs either | Metashape's ghosting filter excludes moving objects from the texture; PIX4Dmatic's Weak/Strong outlier filtering (`Strong` filters more aggressively) (metashape-ortho-manual-2-2.md, pix4d-clean-mesh-outlier-filtering-and-sky-mask.md) | Agisoft Metashape 2.2 (metashape-ortho-manual-2-2.md); PIX4Dmatic, version not stated on the saved page (its 2.4.0 note concerns pause and resume, not the deghosting) (pix4d-clean-mesh-outlier-filtering-and-sky-mask.md); Zhu, Shang, Hua, Yu & Zhong, "Structure-aware Completion of Photogrammetric Meshes in Urban Road Environment", arXiv:2011.11210 (paper-artefact-vehicle-removal-photogrammetric-meshes.md) / Faster R-CNN vehicle detection and removal | partly — a moving object leaves a hole or a smear, not a sign on the ground, so nothing in our chain tells us it was there; the signal exists in the literature (paper-artefact-vehicle-removal-photogrammetric-meshes.md) but no tool we run computes it, and comparing a Capture with a second Capture of the same Site, which the repo has no node for, remains one way to find it (VERIFIED for the vehicle-detection paper, SUPPORTED for the depth-learning paper's prior-work half, UNKNOWN for the tools we run) |
| Edit the point cloud by hand before the mesh is built | isolated points and noise in the densified cloud; PIX4Dmapper notes the mesh can carry artefacts from point-cloud noise (pix4d-clean-point-cloud-processing-options.md) | PIX4Dmapper `Edit Densified Point Cloud`: polygon-select points, assign them to point groups, `Disabled` points are excluded from step 3 (pix4d-clean-edit-point-cloud-in-raycloud.md) | PIX4Dmapper, version unconfirmed on the saved page (pix4d-clean-edit-point-cloud-in-raycloud.md); Agisoft Metashape 2.2 / `Filter point cloud` by point spacing and `Smooth Point Cloud` by radius (metashape-clean-manual-2-2.md) | yes — filtering by spacing and classifying ground is deterministic and the repo's `odm_filterpoints` already runs in the `reconstruct-dense` Node (`pipeline/manifests/orthomosaic.json:72-81`); the hand edit is the part we would replace with a rule (INFERRED) |
| Classify the point cloud so ground and objects are separable | a lot of noise visible in the Point Cloud, with artefacts present in the 3D Textured Mesh, DSM or Orthomosaic (pix4d-clean-point-cloud-processing-options.md) | PIX4Dmapper point-cloud classification, and Metashape ground classification for the DEM (pix4d-clean-point-cloud-processing-options.md, metashape-dem-build-dem-and-ground-classification.md) | PIX4Dmapper, version unconfirmed on the saved page (pix4d-clean-point-cloud-processing-options.md); Agisoft Metashape 2.2 (metashape-dem-build-dem-and-ground-classification.md) | partly — ODM can classify (`--pc-classify`, `odm-dense-pc-classify.md`) but our `reconstruct-dense` Node stops at `odm_filterpoints` and passes only `pc-quality=low` (`pipeline/manifests/orthomosaic.json:76-77`), so the classification is not in our chain today; condition: a Node that runs `odm_filterpoints` with `--pc-classify` (VERIFIED for the option, VERIFIED for the manifest) |

**Sources:**

- `docs/research/sources/model-tools.md` — RealityScan Model Tools: `cleanModel`, `closeHoles`, `smooth`, `simplify`, `selectLargestModelComponent`, `removeSelectedTriangles`, `cutByBox` (https://dev.epicgames.com/documentation/en-us/realityscan/model-tools, fetched 2026-09-19)
- `docs/research/sources/paper-mesh-screened-poisson-kazhdan-hoppe-2013.md` — Kazhdan & Hoppe, *Screened Poisson Surface Reconstruction*, ACM ToG 2013, DOI 10.1145/2487228.2487237 (https://www.cs.jhu.edu/~misha/MyPapers/ToG13.pdf, fetched 2026-10-21)
- `docs/research/sources/paper-mesh-robust-hole-detection-triangular-meshes.md` — Yip, Stahl & Schellewald, automated hole detection in triangular meshes, Computer-Aided Design 2024, DOI 10.1016/j.cad.2024.103696 (fetched 2026-10-21)
- `docs/research/sources/metashape-mesh-editing-model-geometry.md` — Agisoft Metashape 2.2, editing model geometry: fill holes, smooth, decimate (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/metashape-clean-manual-2-2.md` — Agisoft Metashape 2.2, filter point cloud, smooth point cloud, editing masks (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/metashape-ortho-manual-2-2.md` — Agisoft Metashape 2.2, ghosting filter for thin structures and moving objects (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/metashape-seam-manual-2-2.md` — Agisoft Metashape 2.2, seamlines editing (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/pix4d-clean-mesh-outlier-filtering-and-sky-mask.md` — PIX4Dmatic Mesh: Weak/Strong outlier filtering, Sky filter, Sky mask (https://support.pix4d.com/hc/en-us/articles/4407652056593, fetched 2026-10-21)
- `docs/research/sources/pix4d-clean-edit-point-cloud-in-raycloud.md` — PIX4Dmapper, editing the point cloud in the rayCloud, Disabled point group (https://support.pix4d.com/hc/en-us/articles/202560499, fetched 2026-10-21)
- `docs/research/sources/pix4d-clean-point-cloud-processing-options.md` — PIX4Dmapper point cloud densification and classification options (https://support.pix4d.com/hc/en-us/articles/202557799, fetched 2026-10-21)
- `docs/research/sources/metashape-dem-build-dem-and-ground-classification.md` — Agisoft Metashape 2.2, building the DEM and ground classification (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/odm-dense-pc-filter.md` — OpenDroneMap 3.6.0 `--pc-filter` (https://docs.opendronemap.org/arguments/pc-filter, fetched 2026-10-21)
- `docs/research/sources/odm-dense-pc-classify.md` — OpenDroneMap 3.6.0 `--pc-classify` (https://docs.opendronemap.org/arguments/pc-classify, fetched 2026-10-21)
- `docs/research/sources/paper-artefact-vehicle-removal-photogrammetric-meshes.md` — Zhu, Shang, Hua, Yu & Zhong, *Structure-aware Completion of Photogrammetric Meshes in Urban Road Environment*, arXiv:2011.11210 — vehicle detection with Faster R-CNN and removal from the mesh's geometry and texture (https://arxiv.org/pdf/2011.11210, fetched 2026-10-21)
- `docs/research/sources/paper-artefact-depth-learning-moving-object-error.md` — Pinard, Chevalley, Manzanera & Filliat, *Learning structure-from-motion from motion* — moving objects as an error source in the paper's unsupervised depth-training optimisation, with the residual-optical-flow exclusion reported as prior work the paper cites (https://openaccess.thecvf.com/content_ECCVW_2018/papers/11131/Pinard_Learning_structure-from-motion_from_motion_ECCVW_2018_paper.pdf, fetched 2026-10-21)
- `docs/research/sources/paper-artefact-water-segmentation.md` — Akiyama et al., *Deep Learning Applied to Water Segmentation*, ISPRS Archives XLIII-B2-2020, DOI 10.5194/isprs-archives-XLIII-B2-2020-1189-2020 — a water surface separated from other surfaces in RGB imagery by a learned classifier (https://isprs-archives.copernicus.org/articles/XLIII-B2-2020/1189/2020/isprs-archives-XLIII-B2-2020-1189-2020.pdf, fetched 2026-10-21)

## Stage 7 — texture

Texturing is where a Reconstruction stops being geometry and starts being a picture: the mesh is wrapped and coloured from the Capture's images, and every defect in that wrap — a patch that did not reconstruct, a ghost of a car, a seam — becomes visible on the deliverable.

**Where this sits in our chain:** the `reconstruct-mesh` Node runs ODM from `odm_meshing` to `mvs_texturing` (`pipeline/manifests/orthomosaic.json:83-91`), so the textured mesh is produced inside that Node and no separate texturing Node exists; the Gaussian Splatting Pipeline reaches its own colouring in `fit-splat` (`pipeline/manifests/splat.json:22-45`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Re-texture an area that did not reconstruct | salt-and-pepper speckle or untextured facets where thin parts shade the surface (metashape-texture-manual-2-2.md) | Metashape's `Enable hole filling`, on by default (metashape-texture-manual-2-2.md) | Agisoft Metashape 2.2 `Enable hole filling` (metashape-texture-manual-2-2.md) | partly — the fill is a deterministic post-process, but it is Metashape's option and our chain does not run it, and we would still need to know which facets failed, which no tool reports; condition: an ODM texturing option, or our own Node, would make it yes (INFERRED) |
| Remove ghosting from thin structures or moving objects | ghosting — a semi-transparent smear where an object did not reconstruct (metashape-texture-manual-2-2.md) | Metashape's `Enable ghosting filter` (metashape-texture-manual-2-2.md) | Agisoft Metashape 2.2 ghosting filter (metashape-texture-manual-2-2.md) | partly — a parameter Metashape ships rather than an edit, but one our chain does not expose; the risk is that it also erases real thin structure, so the gate has to compare before/after; condition: an ODM texturing option would make it yes (VERIFIED) |
| Choose a blending mode to hide brightness steps | visible tone steps where two images meet (metashape-texture-manual-2-2.md) | Metashape blending modes: Mosaic, Average, Max Intensity, Min Intensity, Disabled (metashape-texture-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-texture-manual-2-2.md); OpenDroneMap 3.6.0 `texturing-skip-global-seam-leveling` (odm-texture-arguments-options-and-flags.md) | partly — the mode is a parameter, but choosing between them per Site is a judgement no tool automates (VERIFIED for the modes, INFERRED for the choice) |
| Re-map the texture after the mesh is decimated | stretched or missing texture after a simplification (metashape-texture-manual-2-2.md) | Metashape `Transfer texture`, and `Keep uv` mapping to rebuild the atlas at a new resolution (metashape-texture-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-texture-manual-2-2.md); RealityScan `reprojectTexture` (model-tools.md) | partly — the operation is a script, the decision of when to re-map is ours (VERIFIED) |
| Reject bad images from the texture only | a blurry frame still colours part of the mesh (metashape-texture-manual-2-2.md) | exclude poorly focused images before texturing (metashape-texture-manual-2-2.md); RealityScan `calculateQualityTexture` uses mesh quality values (model-tools.md) | Agisoft Metashape 2.2 (metashape-texture-manual-2-2.md); RealityScan 2.2 `calculateQualityTexture` (model-tools.md) | yes — it is the same quality signal the `filter` Node already computes (`pipeline/manifests/orthomosaic.json:17-20`), so it is a policy, not new research (INFERRED) |
| Relight or repaint a texture defect by hand | a patch of wrong colour on a surface that reconstructed correctly (metashape-texture-manual-2-2.md) | Metashape's `Remove Lighting` tool for texture improvement; otherwise an external editor (metashape-texture-manual-2-2.md) | Agisoft Metashape 2.2 / `Remove Lighting` (metashape-texture-manual-2-2.md) | partly — relighting is a tool, repainting is a person with an editor; condition: our `correct` Node already evens exposure before the solve (`pipeline/manifests/orthomosaic.json:23-26`), which removes most of the reason to repaint (INFERRED) |
| Set the texture resolution and atlas size | coarse or over-large texture, RAM failures on a single page (metashape-texture-manual-2-2.md) | Metashape `Texture size`, `Pixel size (m)`, `Page count` (metashape-texture-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-texture-manual-2-2.md) | yes — a resolution policy keyed to Overlap and GSD; condition: the repo has no texture-resolution or GSD knob to start from, its `correct` Node being radiometric only (`nodes/correct/correct.py:2`, `pipeline/manifests/orthomosaic.json:23-26`), so the policy is ours to write (INFERRED) |

**Sources:**

- `docs/research/sources/metashape-texture-manual-2-2.md` — Agisoft Metashape User Manual 2.2, texture generation, atlas, blending modes, ghosting filter, hole filling (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/model-tools.md` — RealityScan Model Tools: `calculateTexture`, `calculateQualityTexture`, `reprojectTexture`, `unwrap`, `correctColors` (https://dev.epicgames.com/documentation/en-us/realityscan/model-tools, fetched 2026-09-19)
- `docs/research/sources/odm-texture-arguments-options-and-flags.md` — OpenDroneMap 3.6.0 options: `texturing-keep-unseen-faces`, `texturing-single-material`, `texturing-skip-global-seam-leveling` (https://docs.opendronemap.org/arguments/, fetched 2026-10-21)
- `docs/research/sources/pix4d-texture-3d-textured-mesh-processing-options.md` — PIX4Dmapper 3D Textured Mesh generation settings (https://support.pix4d.com/hc/en-us/articles/208194103, fetched 2026-10-21)

## Stage 8 — DSM/DTM

The DSM and the DTM are the two elevation surfaces a client can ask for off a Site: the DSM keeps everything standing on the ground, the DTM is the bare earth under it, and neither one exists in our chain today.

**Where this sits in our chain:** no Node today — `odm_dem` appears only in the list of ODM's own stage names (`nodes/reconstruct/reconstruct.py:18`), our chain runs `odm_georeferencing` to `odm_orthophoto` and skips it (`pipeline/manifests/orthomosaic.json:93-101`, `nodes/reconstruct/reconstruct.py:26`), and the dense cloud it would need ends at `odm_filterpoints` (`pipeline/manifests/orthomosaic.json:72-81`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Build a DSM and a bare-earth DTM off the dense cloud | neither output exists: our chain runs odm_georeferencing to odm_orthophoto and never odm_dem (pipeline/manifests/orthomosaic.json:93-101) | run ODM with --dsm (progressive morphological filter) and --dtm (simple morphological filter) at --dem-resolution cm per pixel (odm-dem-dsm-option.md, odm-dem-dtm-option.md, odm-dem-dem-resolution-option.md) | OpenDroneMap 3.6.0 / --dsm and --dtm, outputs odm_dem/dsm.tif and odm_dem/dtm.tif (odm-filter-odm-outputs.md) | yes — ODM builds both surfaces from the cloud we already produce; changes if the cloud carries no ground returns (REQUIRES TEST) |
| Classify the cloud, then move the points the classifier put in the wrong group | Pix4D: five predefined groups, Ground, Road Surface, High Vegetation, Building, Human Made Object (pix4d-dem-point-cloud-classification.md) | Edit Densified Point Cloud to reallocate points, then Generate DTM (pix4d-dem-point-cloud-classification.md, pix4d-dem-dtm-generation.md) | Pix4Dmapper (version unconfirmed on the saved page) / Run Point Cloud Classification (pix4d-dem-point-cloud-classification.md) | partly — the classification is automatic, the corrections are hand edits point by point; changes if a second classifier covers our terrain (INFERRED) |
| Fill the holes the ground filter leaves in the DTM | ODM --dem-euclidean-map reports the distance from each cell to the nearest NODATA value (odm-dem-euclidean-map-option.md) | --dem-gapfill-steps N, inverse distance weighted from the output resolution, then nearest neighbour merge (odm-dem-gapfill-steps-option.md) | OpenDroneMap 3.6.0 / --dem-gapfill-steps, default 3 (version on `odm-filter-odm-outputs.md`, default on `odm-dem-gapfill-steps-option.md`) | yes — the tool fills the gaps and reports which cells it filled; changes if the filled ground is not true ground (REQUIRES TEST) |
| Tune the ground classifier until the DTM stops climbing over buildings | Metashape Classify Ground Points exposes Max angle (default 15 deg), Max distance, Max terrain slope and Cell size (metashape-dem-build-dem-and-ground-classification.md) | Classify Ground Points with those parameters, then Build DEM from the Ground Points class to get a DTM (metashape-dem-build-dem-and-ground-classification.md) | Agisoft Metashape 2.2 / Classify Ground Points and Build DEM (metashape-dem-build-dem-and-ground-classification.md) | partly — the parameters are documented and settable, the tuning is judgement on our Site; changes if we can measure it against check points (REQUIRES TEST) |
| Cut contour lines off the DSM or the DTM | RealityScan: a contour set records whether it was made on the DSM or the DTM layer, and its interval (available-functions-contoursfunctionset.md) | ExportContourSet(orthoGuid, setId, epsilon) over the chosen layer (available-functions-contoursfunctionset.md) | RealityScan 2.2 / ContoursFunctionSet, ExportContourSet (available-functions-contoursfunctionset.md, realityscan-2-2.md) | partly — contour sets and interval are scriptable, the interval per deliverable is the operator's; changes if the client fixes it (INFERRED) |
| State the vertical accuracy the DTM actually has | no vendor states a vertical accuracy for its own DTM; ASPRS gives the class instead, NVA RMSEV <= X cm and VVA as found (Table 7.2) (asprs-gcp-positional-accuracy-standards-edition2-2023.md) | measure it: RMSEV from the per-checkpoint differences, NVA from checkpoints in open terrain and VVA from checkpoints in vegetated terrain (§7.4), on no less than thirty checkpoints each (§7.13) (asprs-gcp-positional-accuracy-standards-edition2-2023.md) | ASPRS Positional Accuracy Standards Edition 2 Version 1.0 (2023) / vertical accuracy class and checkpoint test (asprs-gcp-positional-accuracy-standards-edition2-2023.md) | partly — the class is quotable, the measurement needs check points we do not have; changes if we survey them (INFERRED) |

Sources: (inline citations are file names under `docs/research/sources/`)
- `docs/research/sources/odm-dem-dsm-option.md` — https://docs.opendronemap.org/arguments/dsm/ — fetched 2026-10-21T12:33:31Z
- `docs/research/sources/odm-dem-dtm-option.md` — https://docs.opendronemap.org/arguments/dtm/ — fetched 2026-10-21T12:33:32Z
- `docs/research/sources/odm-dem-dem-resolution-option.md` — https://docs.opendronemap.org/arguments/dem-resolution/ — fetched 2026-10-21T12:33:32Z
- `docs/research/sources/odm-dem-gapfill-steps-option.md` — https://docs.opendronemap.org/arguments/dem-gapfill-steps/ — fetched 2026-10-21T12:33:32Z
- `docs/research/sources/odm-dem-euclidean-map-option.md` — https://docs.opendronemap.org/arguments/dem-euclidean-map/ — fetched 2026-10-21T12:33:32Z
- `docs/research/sources/metashape-dem-build-dem-and-ground-classification.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:34:42Z
- `docs/research/sources/pix4d-dem-dtm-generation.md` — https://support.pix4d.com/hc/en-us/articles/202560579 — fetched 2026-10-21T12:34:52Z
- `docs/research/sources/pix4d-dem-point-cloud-classification.md` — https://support.pix4d.com/hc/en-us/articles/115005737903 — fetched 2026-10-21T12:34:41Z
- `docs/research/sources/asprs-gcp-positional-accuracy-standards-edition2-2023.md` — https://aagsmo.org/wp-content/uploads/2023/03/ASPRS_PosAcc_Edition2_MainBody.pdf — fetched 2026-10-21T12:37:24Z
- `docs/research/sources/odm-filter-odm-outputs.md` — https://docs.opendronemap.org/outputs/ — fetched 2026-10-21T12:16:22Z (already saved before this ticket)
- `docs/research/sources/available-functions-contoursfunctionset.md` — https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-contoursfunctionset — fetched 2026-09-19T01:50:17Z (already saved before this ticket)
- `docs/research/sources/realityscan-2-2.md` — https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-2-2 — fetched 2026-09-19T01:50:00Z (already saved before this ticket)

## Stage 9 — ortho

The Orthomosaic is the deliverable a client measures off, so every stage error shows up here as geometry, not as colour.

**Where this sits in our chain:** the `reconstruct-georef` Node runs ODM from `odm_georeferencing` to `odm_orthophoto` and emits `odm_orthophoto.tif` (`pipeline/manifests/orthomosaic.json:93-101`), and the `export-cog` Node turns that into the Cloud-Optimized GeoTIFF the client opens (`pipeline/manifests/orthomosaic.json:114-125`); `nodes/export-cog/export_cog.py:2-13` states why a second explicit conversion exists.

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Choose the surface the Orthomosaic is projected onto | warping or double edges where the surface is wrong (metashape-ortho-manual-2-2.md) | Metashape `Surface data` type: mesh or DEM (metashape-ortho-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-ortho-manual-2-2.md) | partly — the choice between mesh and DEM is a deliverable decision (a DEM surface flattens buildings), and ODM fixes it for us today (INFERRED) |
| Re-run the Orthomosaic above the GSD cap | soft or over-sampled pixels where the GSD estimate caps the output (odm-ortho-orthophoto-resolution-option.md) | ODM `--orthophoto-resolution` (default 5 cm/px, capped by GSD) and `--ignore-gsd` (odm-ortho-orthophoto-resolution-option.md, odm-ortho-ignore-gsd-option.md) | OpenDroneMap 3.6.0 (odm-ortho-orthophoto-resolution-option.md); PIX4Dmapper, version unconfirmed on the saved page / resolution in multiples of the GSD (pix4d-ortho-dsm-and-orthomosaic-processing-options.md) | yes — a parameter, but ODM itself warns `ignore-gsd` is memory-hungry and says do not use it (odm-ortho-ignore-gsd-option.md), so the gate must own the trade (VERIFIED) |
| Fill holes in the Orthomosaic | holes in the Orthomosaic, for the area for which there is no additional images (metashape-seam-manual-2-2.md) | Metashape `Edit Orthomosaic > Fill`; PIX4Dmatic `Interpolation` in DSM options (metashape-seam-manual-2-2.md, pix4d-ortho-orthomosaic-processing-matic.md) | Agisoft Metashape 2.2 (metashape-seam-manual-2-2.md); PIX4Dmatic, version not stated on the saved page (its version notes concern pause and resume at 2.4.0 and the ROI at 2.7.0) (pix4d-ortho-orthomosaic-processing-matic.md) | partly — filling is deterministic, but Metashape's `Edit Orthomosaic > Fill` and PIX4Dmatic's `Interpolation` are tools we do not run, and deciding what counts as a hole is ours; condition: our own fill Node, and a rule for what counts as a hole, would make it yes (VERIFIED) |
| Even out brightness before the Orthomosaic is built | banded or mismatched tiles where the light changed during the Capture (metashape-ortho-manual-2-2.md) | Metashape `Calibrate colors` before Build Orthomosaic (metashape-ortho-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-ortho-manual-2-2.md) | yes — the repo already has a `correct` Node for exactly this, running before the solve (`pipeline/manifests/orthomosaic.json:23-26`); the Orthomosaic step only has to make sure it ran (INFERRED) |
| Crop the Orthomosaic to the Site and drop the outside | fringe of low-quality pixels around the reconstruction (odm-texture-arguments-options-and-flags.md) | ODM `--boundary` GeoJSON; `--orthophoto-png`; `--orthophoto-kmz` (odm-texture-arguments-options-and-flags.md) | OpenDroneMap 3.6.0 (odm-texture-arguments-options-and-flags.md); PIX4Dmatic, version not stated on the saved page (its version notes concern pause and resume at 2.4.0 and the ROI at 2.7.0) / ROI (pix4d-ortho-orthomosaic-processing-matic.md) | partly — the Gaussian Splatting crop is applied when a Site polygon is given (`nodes/clean-splat/clean_splat.py:9-10`); the node that emits that polygon is not cited here, so the crop is not yet wired to one (INFERRED) |
| Choose the compression of the delivered raster | a raster that opens slowly, or a codec that has baked artefacts into the image (nodes/export-cog/export_cog.py:15-19) | ODM `--orthophoto-compression` takes JPEG, LZW, PACKBITS, DEFLATE, LZMA or NONE, default DEFLATE (odm-ortho-orthophoto-compression-option.md); our `export-cog` Node writes DEFLATE with PREDICTOR=2 (nodes/export-cog/export_cog.py:9-19) | OpenDroneMap 3.6.0 `--orthophoto-compression` (odm-ortho-orthophoto-compression-option.md) | yes — the codec is one flag, and a lossy codec would bake visible block artefacts into a map sold for measuring, so the choice is DEFLATE (nodes/export-cog/export_cog.py:15-19) (VERIFIED) |
| Split the Orthomosaic into tiles for delivery | one file too large to serve (pix4d-ortho-dsm-and-orthomosaic-processing-options.md) | PIX4Dmapper per-tile GeoTIFF and `Merge Tiles`; ODM `build-overviews` (pix4d-ortho-dsm-and-orthomosaic-processing-options.md, odm-ortho-build-overviews-option.md) | PIX4Dmapper, version unconfirmed on the saved page (pix4d-ortho-dsm-and-orthomosaic-processing-options.md); OpenDroneMap 3.6.0 (odm-ortho-build-overviews-option.md) | yes — but the storage and streaming format for the web is still open in the parent map #364, so we name the formats without choosing one (INFERRED) |

**Sources:**

- `docs/research/sources/metashape-ortho-manual-2-2.md` — Agisoft Metashape 2.2, Building orthomosaic, surface type, projection, calibrate colors (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/metashape-seam-manual-2-2.md` — Agisoft Metashape 2.2, Seamlines editing, `Edit Orthomosaic > Fill` (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-orthophoto-resolution-option.md` — OpenDroneMap 3.6.0 `--orthophoto-resolution` (https://docs.opendronemap.org/arguments/orthophoto-resolution/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-ignore-gsd-option.md` — OpenDroneMap 3.6.0 `--ignore-gsd` (https://docs.opendronemap.org/arguments/ignore-gsd/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-build-overviews-option.md` — OpenDroneMap 3.6.0 `--build-overviews` (https://docs.opendronemap.org/arguments/build-overviews/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-orthophoto-compression-option.md` — OpenDroneMap 3.6.0 `--orthophoto-compression` (https://docs.opendronemap.org/arguments/orthophoto-compression/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-fast-orthophoto-option.md` — OpenDroneMap 3.6.0 `--fast-orthophoto` (https://docs.opendronemap.org/arguments/fast-orthophoto/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-orthophoto-png-option.md` — OpenDroneMap 3.6.0 `--orthophoto-png` (https://docs.opendronemap.org/arguments/orthophoto-png/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-orthophoto-kmz-option.md` — OpenDroneMap 3.6.0 `--orthophoto-kmz` (https://docs.opendronemap.org/arguments/orthophoto-kmz/, fetched 2026-10-21)
- `docs/research/sources/odm-texture-arguments-options-and-flags.md` — OpenDroneMap 3.6.0 options and flags, `--boundary` and the texturing flags (https://docs.opendronemap.org/arguments/, fetched 2026-10-21)
- `docs/research/sources/pix4d-ortho-dsm-and-orthomosaic-processing-options.md` — PIX4Dmapper DSM and Orthomosaic processing options (https://support.pix4d.com/hc/en-us/articles/202557769, fetched 2026-10-21)
- `docs/research/sources/pix4d-ortho-orthomosaic-processing-matic.md` — PIX4Dmatic Orthomosaic, algorithm, blending, interpolation (https://support.pix4d.com/hc/en-us/articles/360048200292, fetched 2026-10-21)
- `docs/research/sources/pix4d-ortho-photo-stitching-vs-orthomosaic.md` — PIX4Dmapper, ortho generation is orthorectification against the DSM (https://support.pix4d.com/hc/en-us/articles/202558869, fetched 2026-10-21)

## Stage 10 — seamlines

Seamlines are where the Orthomosaic is stitched: the boundaries that decide which image owns each patch. The repo had no research on this stage at all — the author's own survey of `docs/research/*.md` before this ticket found no seamline material — so this table leans on the peer-reviewed seamline literature and on the two vendor manuals that describe the operation.

**Where this sits in our chain:** no Node today. The Orthomosaic is produced by ODM's `odm_orthophoto` inside the `reconstruct-georef` Node (`pipeline/manifests/orthomosaic.json:93-101`), and the seams are a by-product of that step — nothing in the repo stores, shows or edits them. The parent map places ortho seamline editing in editor stage 2 (`gh issue view 364 --repo Akamel01/drone-survey`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Re-texture a polygon from a chosen image | moving objects, or oblique aerial imagery of high buildings and facades, cause artefacts which interfere with visual quality of the Orthomosaic (metashape-seam-manual-2-2.md) | Metashape `Edit Orthomosaic > Assign Images...`, with `Exclude selected images` as the alternative (metashape-seam-manual-2-2.md) | Agisoft Metashape 2.2 — the tool is manual, and the manual says moving objects and oblique facades are what it is for (metashape-seam-manual-2-2.md) | no — not in the tools: Metashape ships this as a per-polygon human action (metashape-seam-manual-2-2.md); the placement itself is computable (see the seamline papers below), so we could automate a *recommendation*, but the edit is the operator's (VERIFIED) |
| Fill a hole or exclude an object present in every image | a hole in the Orthomosaic, or an object that cannot be removed by choosing another image (metashape-seam-manual-2-2.md) | Metashape `Edit Orthomosaic > Fill`, which fills with the colours used nearby (metashape-seam-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-seam-manual-2-2.md) | partly — filling with nearby colour is a deterministic inpaint, but it is a Metashape tool our chain does not run, and it cannot be undone after `Update Orthomosaic` (metashape-seam-manual-2-2.md), so the gate has to record the patch (VERIFIED) |
| Draw seamlines that bypass buildings and complex objects | a seam cutting through a building, which reads as a defect in the deliverable (metashape-ortho-manual-2-2.md) | Metashape `Refine seamlines`, recommended for DTM-based Orthomosaics so automatically created seamlines bypass buildings (metashape-ortho-manual-2-2.md) | Agisoft Metashape 2.2 `Refine seamlines` (metashape-ortho-manual-2-2.md) | partly — the option exists and is documented, but Metashape's own wording calls the alternative "time consuming manual orthomosaic patching" (metashape-ortho-manual-2-2.md), which is the cost we are trying to remove (VERIFIED) |
| Choose where the seam falls automatically | seams that cut through a roof — the graph-cut paper casts seamline detection as a graph-cut problem over colour differences and gradient magnitude derived from a DSM; the abstract does not mention moving objects (paper-seam-crossref-graph-cuts-seamline-optimisation-2018.md) | seamline placement computed rather than drawn, by four different published methods (paper-seam-crossref-graph-cuts-seamline-optimisation-2018.md, paper-seam-crossref-semantic-segmentation-seamline-2015.md, paper-seam-crossref-edge-detection-uav-seamline-2018.md, paper-seam-crossref-road-probability-seamline-2020.md) | Zhang (2018) graph-cut optimisation for urban aerial ortho-image mosaicking, DOI 10.1111/phor.12232; Saito (2015) semantic-segmentation seamlines, DOI 10.1109/access.2015.2508921; Nguyen (2018) edge-detection seamlines for UAV mosaicking, DOI 10.1080/2150704x.2018.1475772; Yuan (2020) road-probability seamlines, DOI 10.3390/s20071832 | partly — the placement is automatable and the literature does it, but every one of these is a research algorithm rather than a shipped tool; we would be implementing it, not configuring it (SUPPORTED) |
| Remove the ghosting a seam leaves behind | ghosting on the resulting texture, where thin structures or moving objects failed to be reconstructed as part of the polygonal model (metashape-ortho-manual-2-2.md) | Metashape's ghosting filter in the Orthomosaic build, which the manual recommends when the scene has thin structures or moving objects (metashape-ortho-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-ortho-manual-2-2.md) | partly — it is a parameter Metashape ships, and the manual names the case it is for (thin structures and moving objects), but our chain does not run it; condition: an ODM texturing option would make it yes (VERIFIED) |
| Show the seams to see where they run | an operator needs to see the boundaries before judging the Orthomosaic (metashape-seam-manual-2-2.md) | Metashape's `Show Seamlines` button in the Ortho view, which displays the automatic seamlines for inspection (metashape-seam-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-seam-manual-2-2.md) | yes — but ODM does not expose the seams it used, so we would have to produce them ourselves; storing them is the first step toward the editor in stage 2; the saved outputs page lists no seam artefact in ODM's output tree, and the saved options page carries only `texturing-skip-global-seam-leveling` (colour normalization) and `orthophoto-cutline`, neither of which stores the seams the stage used (`odm-filter-odm-outputs.md`, `odm-texture-arguments-options-and-flags.md`) — this is an absence observed in those pages, not a statement in them (INFERRED) |

**Sources:**

- `docs/research/sources/metashape-seam-manual-2-2.md` — Agisoft Metashape 2.2, Seamlines editing: Assign Images, Exclude selected images, Fill, Draw Patch, Show Seamlines (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/metashape-ortho-manual-2-2.md` — Agisoft Metashape 2.2, Building orthomosaic, `Refine seamlines`, ghosting filter (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/paper-seam-crossref-graph-cuts-seamline-optimisation-2018.md` — Zhang (2018), *Seamline optimisation for urban aerial ortho-image mosaicking using graph cuts*, The Photogrammetric Record, DOI 10.1111/phor.12232 (https://api.crossref.org/works/10.1111/phor.12232, fetched 2026-10-21)
- `docs/research/sources/paper-seam-crossref-semantic-segmentation-seamline-2015.md` — Saito (2015), *Seamline Determination Based on Semantic Segmentation for Aerial Image Mosaicking*, IEEE Access, DOI 10.1109/access.2015.2508921 (https://api.crossref.org/works/10.1109/access.2015.2508921, fetched 2026-10-21)
- `docs/research/sources/paper-seam-crossref-edge-detection-uav-seamline-2018.md` — Nguyen (2018), *Efficient seamline determination for UAV image mosaicking using edge detection*, Remote Sensing Letters, DOI 10.1080/2150704x.2018.1475772 (https://api.crossref.org/works/10.1080/2150704x.2018.1475772, fetched 2026-10-21)
- `docs/research/sources/paper-seam-crossref-road-probability-seamline-2020.md` — Yuan (2020), *Automatic Seamline Determination for Urban Image Mosaicking Based on Road Probability*, Sensors, DOI 10.3390/s20071832 (https://api.crossref.org/works/10.3390/s20071832, fetched 2026-10-21)
- `docs/research/sources/pix4d-ortho-orthomosaic-processing-matic.md` — PIX4Dmatic Orthomosaic, blending algorithm (https://support.pix4d.com/hc/en-us/articles/360048200292, fetched 2026-10-21)

## Stage 11 — export (the ticket's word; the repo's term is the Delivery Bundle)

The Delivery Bundle is the last link a client touches: the Reconstruction and the Orthomosaic leave our machines as files a browser or a GIS can open, so what is missing here is a delivery that needs something running behind it.

**Where this sits in our chain:** the `export-cog` Node converts `odm_orthophoto.tif` into a Cloud-Optimized GeoTIFF (`pipeline/manifests/orthomosaic.json:114-125`), and `nodes/export-cog/export_cog.py:2-13` records why a second explicit conversion exists rather than an ODM flag; the Delivery Bundle is assembled by the `deliver` Pipeline (`pipeline/manifests/deliver.json`).

| manual step | detection signal | fix | automated today by | automatable by us (yes / partly / no and why) |
|---|---|---|---|---|
| Choose a format the client's software can open | a file the client cannot open, or one that needs our tooling to read (metashape-export-manual-2-2.md) | Metashape model export: OBJ, 3DS, VRML, COLLADA, PLY, X3D, STL, Alembic, FBX, DXF, OSG, GLB, U3D, PDF, KMZ; tiled model export: Cesium 3D Tiles, SLPK, PhotoMesh, TLS, tile archive, OSG (metashape-export-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-export-manual-2-2.md); RealityScan `exportModel` and `exportModelToZip` (model-tools.md) | yes — the format list is finite and each format is a flag; what we choose for the web is still open in the parent map #364, so the document names the formats without choosing one (VERIFIED) |
| Keep the texture beside the geometry | the model opens untextured because the texture file is missing (metashape-export-manual-2-2.md) | Metashape states that OBJ, 3DS, VRML, COLLADA, PLY and FBX save the texture in a separate file that must stay in the same directory, and that geometry alone is exported when no atlas was built (metashape-export-manual-2-2.md) | Agisoft Metashape 2.2 (metashape-export-manual-2-2.md) | yes — the Delivery Bundle has to carry the texture with the geometry; the repo already assembles a bundle (`pipeline/manifests/deliver.json`) so this is a rule about what the Delivery Bundle must carry (INFERRED) |
| Export the point cloud in a form a GIS accepts | a cloud that opens with no colour, or in a format the client cannot read (pix4d-export-point-cloud-export-formats.md) | PIX4Dmapper exports LAS, LAZ, PLY and XYZ, with `Save Colors` off for PLY and XYZ, and the LAS/LAZ files always carrying colour (pix4d-export-point-cloud-export-formats.md) | PIX4Dmapper, version unconfirmed on the saved page (pix4d-export-point-cloud-export-formats.md); OpenDroneMap 3.6.0 writes `odm_georeferenced_model.ply/laz/csv` (odm-filter-odm-outputs.md) | partly — one format per client type; the repo does **not** write a georeferenced cloud today — ODM writes `odm_georeferenced_model.ply/laz/csv` inside its own output zip (`odm-filter-odm-outputs.md`) and `nodes/reconstruct/reconstruct.py:86-90` extracts only the orthophoto, the report and the shots, so exporting a cloud needs a new extract; condition: a new extract in `nodes/reconstruct/reconstruct.py` makes it yes; the choice of format is a product decision the parent map has not made (VERIFIED for the formats, VERIFIED for the repo's own state) |
| Produce a cloud-optimized raster a map viewer can stream | the COG validator fails: wrong main-IFD offset, image blocks before their IFD, strips instead of tiles, no overviews (nodes/export-cog/export_cog.py:4-6) | `gdal_translate -of COG` with DEFLATE, PREDICTOR=2, BLOCKSIZE=512, OVERVIEW_RESAMPLING=AVERAGE, BIGTIFF=IF_SAFER, then GDAL's own COG validator (nodes/export-cog/export_cog.py:9-13) | the repo's own `export-cog` Node, run in the GDAL container, with the validator as the check (nodes/export-cog/export_cog.py:26-35) | yes — it is already automated and already checked; the note that the fallback is `gdalinfo -json` layout inspection, a weaker check than the validator, is the one gap (nodes/export-cog/export_cog.py:26-35); this row rests on this repo's own code and cites no vendor page (VERIFIED) |
| Give the client a map without the whole file | a raster too large to serve (odm-ortho-build-overviews-option.md) | ODM `--build-overviews`; `--orthophoto-png`; `--orthophoto-kmz`; `--fast-orthophoto` builds an Orthomosaic straight from the sparse reconstruction for when only a map is needed (odm-ortho-build-overviews-option.md, odm-ortho-fast-orthophoto-option.md) | OpenDroneMap 3.6.0 (odm-ortho-build-overviews-option.md, odm-ortho-fast-orthophoto-option.md) | partly — the formats exist, but the storage and streaming format for the web is explicitly still open in the parent map #364, so the document does not choose (VERIFIED) |
| Keep the export reproducible for a later Capture | a bundle that cannot be regenerated from the same inputs (nodes/export-cog/export_cog.py:2-13) | the `bundle` Node exists, but it is fed by environment variables (`BUNDLE_ORTHO`, `BUNDLE_SPLAT_SCENE`) and not by the orthomosaic Manifest (`pipeline/manifests/deliver.json:8`), so wiring the chain into it is open work | the repo's own Manifest and Node contract (pipeline/manifests/orthomosaic.json:1-4) | yes — this is the repo's own design; what a client can open without our stack running is what the Delivery Bundle must guarantee; this row rests on this repo's own code and cites no vendor page (VERIFIED) |
| Export a 3D model for a viewer | a model that a browser cannot show, or one exported with the texture detached (metashape-export-manual-2-2.md) | RealityScan `exportModel` with `params.xml`, and `exportModelToZip` with a model format such as `.obj` or `.fbx` (model-tools.md); Metashape's tiled model formats (metashape-export-manual-2-2.md) | RealityScan 2.2 (model-tools.md); Agisoft Metashape 2.2 (metashape-export-manual-2-2.md); ODM writes `odm_textured_model.obj` and `odm_textured_model_geo.obj`, and `--gltf` writes a single binary glTF (model-tools.md, odm-filter-odm-outputs.md, odm-texture-arguments-options-and-flags.md) | partly — exporting is automated, but the Gaussian Splatting and mesh delivery formats for the web are a product decision the parent map has not made (VERIFIED) |
| Set the coordinate reference system and the vertical datum on the export | the file opens in the wrong place, or a height is ellipsoidal where the client expects orthometric (metashape-export-manual-2-2.md) | Metashape's Export Model and Export Orthomosaic dialogs both ask for the coordinate system, and `Write KML` is available only when the export coordinate system is WGS84 (metashape-export-manual-2-2.md); ODM's `--gps-z-offset` shifts the Z of the GPS EXIF and exists to adjust from ellipsoidal to orthometric height (odm-texture-arguments-options-and-flags.md) | Agisoft Metashape 2.2 (metashape-export-manual-2-2.md); OpenDroneMap 3.6.0 `--gps-z-offset`, default 0 (odm-texture-arguments-options-and-flags.md) | partly — the horizontal reference system comes from the Site's Ground Control Points and our georeferencing, but the vertical datum is a choice the client fixes, and the parent map still has accuracy reporting open (VERIFIED for the two tools, INFERRED for the split) |
| Deliver the accuracy report with the deliverable | the client asks for the accuracy and there is nothing to hand over (pix4d-qa-quality-report-specifications.md) | hand over the report beside the file: the Quality Report carries the GCP error state (less than 2 times the average GSD passes, more than 2 times warns, more than 4 times fails — the three states are on the saved page, but passes/warns/fails are the report's colour coding, not in the saved text) and the checkpoint residuals (pix4d-qa-quality-report-specifications.md) | PIX4Dmapper, version unconfirmed on the saved page (pix4d-qa-quality-report-specifications.md); our own `reconstruct-report` Node runs ODM's `odm_report` stage (pipeline/manifests/orthomosaic.json:103-111) | partly — the report is produced, and the ASPRS class it supports is defined (asprs-gcp-positional-accuracy-standards-edition2-2023.md), but stating the class on the deliverable is a decision the parent map has not made (VERIFIED for the report and its thresholds, INFERRED for the passes/warns/fails labels, UNKNOWN for our own report's contents) |

**Sources:**

- `docs/research/sources/metashape-export-manual-2-2.md` — Agisoft Metashape 2.2, 3D model export, tiled model export, point cloud export, orthomosaic export (https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf, fetched 2026-10-21)
- `docs/research/sources/model-tools.md` — RealityScan Model Tools: `exportModel`, `exportModelToZip`, `importModel` (https://dev.epicgames.com/documentation/en-us/realityscan/model-tools, fetched 2026-09-19)
- `docs/research/sources/pix4d-export-point-cloud-export-formats.md` — PIX4Dmapper, exporting the point cloud: LAS, LAZ, PLY, XYZ, Save Colors (https://support.pix4d.com/hc/en-us/articles/203890769, fetched 2026-10-21)
- `docs/research/sources/pix4d-texture-3d-textured-mesh-processing-options.md` — PIX4Dmapper 3D Textured Mesh export formats (https://support.pix4d.com/hc/en-us/articles/208194103, fetched 2026-10-21)
- `docs/research/sources/pix4d-qa-quality-report-specifications.md` — PIX4Dmapper Quality Report: the GCP error state and the checkpoint residuals (https://support.pix4d.com/hc/en-us/articles/202558679, fetched 2026-10-21)
- `docs/research/sources/asprs-gcp-positional-accuracy-standards-edition2-2023.md` — ASPRS Positional Accuracy Standards Edition 2, Version 1.0 (2023): the accuracy classes a report can support (https://aagsmo.org/wp-content/uploads/2023/03/ASPRS_PosAcc_Edition2_MainBody.pdf, fetched 2026-10-21)
- `docs/research/sources/odm-filter-odm-outputs.md` — OpenDroneMap output tree: `odm_orthophoto/odm_orthophoto.tif`, `odm_georeferencing/odm_georeferenced_model.ply/laz/csv`, `odm_texturing/odm_textured_model.obj` (https://docs.opendronemap.org/outputs/, fetched 2026-10-21)
- `docs/research/sources/odm-texture-arguments-options-and-flags.md` — OpenDroneMap 3.6.0 options, `--gltf`, `--gps-z-offset`, `--texturing-single-material` (https://docs.opendronemap.org/arguments/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-build-overviews-option.md` — OpenDroneMap 3.6.0 `--build-overviews` (https://docs.opendronemap.org/arguments/build-overviews/, fetched 2026-10-21)
- `docs/research/sources/odm-ortho-fast-orthophoto-option.md` — OpenDroneMap 3.6.0 `--fast-orthophoto` (https://docs.opendronemap.org/arguments/fast-orthophoto/, fetched 2026-10-21)

## The ranked list of edits that most often block a client-ready deliverable

An entry is an *edit* — one thing a person does to a Reconstruction or an Orthomosaic to make it
deliverable. The ticket asked for the edits that **most often** block a client-ready deliverable,
and no frequency evidence was gathered by any source: this document holds no incident counts, no
operator survey and no vendor issue statistics, so the order below is by **documented severity**
— how badly the artefact damages the deliverable as the sources describe it — and not by how often
the edit happens. Each entry says which basis it rests on, and the basis is one of two: a
documented severity (a source states the artefact stops the deliverable) or this repo's own
recorded history (this repo has already built for that artefact). Rank 1 is the most **severe**
edit on this list, not the most frequent one — there is no frequency to compare it against: it is
the edit whose artefact class the parent map names and whose tool the vendors ship a dedicated
operation for. Every entry names the source that states its basis, and each entry's detection signal
is reused word for word from the stage row it rests on. The five artefact classes the
parent map names — floaters, holes, sky/water artefacts, seamline ghosts and moving objects — are
the classes covered across these entries; the moving-object edit in particular appears inside
entries 1 and 2 rather than as an entry of its own.

**1. Re-texture a polygon because a moving object or an oblique facade ghosted across the join.**
Why it blocks: an artefact left by a moving object or by an oblique facade is the first thing a
client sees on the Orthomosaic, and the Orthomosaic is the deliverable they measure off. Detection
signal: moving objects, or oblique aerial imagery of high buildings and facades, cause artefacts
which interfere with visual quality of the Orthomosaic. Automatable by us: no — Metashape ships
this as a per-polygon human action (`Assign Images`), and its manual says the tool is for exactly
this case. Rank basis: documented severity — rank 1 is the most severe edit on this list, and no
frequency is claimed for it because no source states one; the tool exists, is documented, and is
scoped to the moving-object and oblique-facade artefact; the parent map places ortho seamline
editing in editor stage 2, which says the same thing from the product side. Source:
`docs/research/sources/metashape-seam-manual-2-2.md`.

**2. Remove the ghosting a moving object or a thin structure leaves in the texture.**
Why it blocks: ghosting appears in the texture of the Reconstruction and in the Orthomosaic built
from it, and the manual names thin structures and moving objects as its cause. Detection signal:
ghosting on the resulting texture, where thin structures or moving objects failed to be
reconstructed as part of the polygonal model. Automatable by us: partly — the ghosting filter
is a parameter Metashape ships, and the manual states the case it is for (thin structures and moving
objects), but what survives the filter is what a person re-textures. Rank basis: documented severity — the manual names the case
for the filter and the parent map names the artefact class itself. Source:
`docs/research/sources/metashape-ortho-manual-2-2.md`,
`docs/research/sources/pix4d-clean-mesh-outlier-filtering-and-sky-mask.md`.

**3. Remove floaters — disconnected geometry hanging off the surface.**
Why it blocks: floaters are visible on the Reconstruction and cast into the texture, and they read
as broken geometry to anyone who opens the Reconstruction. Detection signal: a connected component of the
mesh smaller than the largest one — RealityScan's `selectLargestModelComponent` selects the
triangles that belong to the largest connected component of the model. Automatable by us: partly —
component size is measurable, and the repo already
removes floaters on the Gaussian Splatting path, but by statistical outlier removal rather than by
component size, and no mesh file reaches disk today (`nodes/reconstruct/reconstruct.py:86-90`).
Rank basis: this repo's own recorded history —
`clean-splat` and the research behind it exist for this artefact alone; that is a record of what
this repo has had to build for, not a measurement of how often the edit blocks a deliverable.
Source: `nodes/clean-splat/clean_splat.py:185` (statistical outlier removal) and `nodes/clean-splat/clean_splat.py:9-10` (the Site-polygon crop),
`nodes/reconstruct/reconstruct.py:86-90` (the mesh never reaches disk),
`docs/research/sources/model-tools.md`.

**4. Fill the holes the dense cloud left in the mesh.**
Why it blocks: a hole in the surface is a hole in the deliverable, and the Orthomosaic inherits it
as a hole to fill. Detection signal: gaps in the surface where the dense cloud had no points.
Automatable by us: partly — hole detection is automated in the literature, but the fill is
Metashape's operation, which our chain does not run, as Stage 5's row records; the open question
is whether a detected hole is a hole or a real opening.
Rank basis: documented severity — the vendor ships the operation for this case: Metashape ships
hole filling enabled by default, and PIX4Dmatic tells the operator to turn on interpolation when
holes appear; that is a vendor behaviour, not a frequency. Source:
`docs/research/sources/metashape-texture-manual-2-2.md`,
`docs/research/sources/pix4d-ortho-orthomosaic-processing-matic.md`.

**5. Remove sky and water artefacts.**
Why it blocks: PIX4D's own guidance ties visible noise in the Point Cloud to artefacts in the 3D
Textured Mesh, the DSM and the Orthomosaic, and a Site with water is where the second half of this
artefact class bites — a flat dark surface may be a legitimate DTM. Detection signal: a Sky mask
that is only available if the Sky filter was enabled during densification; no surveyed VENDOR TOOL
states a rule for a water surface; the peer-reviewed literature does segment water from other
surfaces in RGB imagery (paper-artefact-water-segmentation.md). Automatable by us: partly — sky is
separable by geometry, and water is separable by appearance: the literature segments water in RGB
imagery with a learned classifier, but no surveyed VENDOR TOOL we run states a rule for telling a
pond from a roof. Rank basis: documented severity — the tool states the
artefact and ships a dedicated filter and mask for it. Source:
`docs/research/sources/pix4d-clean-mesh-outlier-filtering-and-sky-mask.md`,
`docs/research/sources/paper-artefact-water-segmentation.md`.

**6. Delete the blurred, misexposed and duplicated frames before the solve.**
Why it blocks: every frame that survives the gate is one the solve trusts, so a bad frame becomes
a bad Reconstruction that is far more expensive to fix downstream than to drop now. Detection
signal: Laplacian variance under the threshold, brightness outside the band, average-hash distance
to the previous kept frame. Automatable by us: yes — the repo's `filter` Node already does this,
and its own docstring records that ODM does not do it at all. Rank basis: this repo's own
recorded history — the `filter` Node and the ticket that created it (#21); that is the repo's own
record, not a measurement of how often the edit blocks a deliverable. Source:
`docs/research/sources/metashape-qa-manual-2-2.md` (the image-quality estimate and the quality
threshold the row rests on), `docs/research/sources/odm-filter-odm-outputs.md` (ODM's outputs list,
which holds no image-filter stage), `nodes/filter/filter.py:4`, `nodes/filter/filter.py:29-32`.

**7. Re-run the solve after removing a frame, or repair a fragmented block.**
Why it blocks: an unsolved or mis-registered frame leaves a hole in the Reconstruction that no
later stage can fill, so it has to be caught at the solve. Detection signal: reprojection error
above the threshold, or a frame that did not solve at all. Automatable by us: partly — dropping the unsolved frame is already automatable (Stage 2, row 2,
verdict yes), but which block of the Site to keep and re-fly is the operator's (Stage 2, row 5,
verdict no). Rank basis: documented severity — the tools report the error and re-solve when an
image is removed, so the artefact is one the vendors expect. Source:
`docs/research/sources/pix4d-qa-quality-report-specifications.md`.

**8. Judge the Ground Control Point residuals and state the accuracy class.**
Why it blocks: a client-ready deliverable claims an accuracy, and that claim is only as good as the
residual on the points that were held back. Detection signal: per-axis RMSE on the checkpoints.
Automatable by us: partly — the residuals are computed for us, and the standards give the classes
and their tolerances, but declaring the class is a decision with a legal weight. Rank basis: documented severity — the ASPRS standards exist to make that claim checkable. Source:
`docs/research/sources/asprs-gcp-positional-accuracy-standards-edition2-2023.md`.

## What this means for us

The chain is not one step. It is eleven, and the research says the operator's hands are needed in
different places along it — some of them because a tool has no rule, some because the rule is
judgement, and some because the tool has the button and we have not wired it up.

The clearest result is that most of the edits on the ranked list are a parameter in the tool that
ships it, not an operation: the ghosting filter, the hole filling, the outlier filtering, the
resolution caps. Two of those ship in tools we do not run and two are ODM flags whose value we have
not settled per Site. What is missing is not the mechanism but the gate that decides when to turn
each one on, and the measurement that says whether turning it on helped. That is the shape of the
quality gate the parent map asks for, one per link.

The second result is the seamline stage, which this repo had no research on at all before this
ticket. The placement of a seam is automatable — the peer-reviewed literature does it four
different ways — but the tools that ship it do it by hand, one polygon at a time. That is why the
parent map puts ortho seamline editing in editor stage 2: the human action is real, and it is the
one edit on this list with no parameter behind it.

The third is what we cannot automate without new work: telling a moving object from a hole, and
telling water from a roof. Neither has a measured signal in any tool we surveyed — the
peer-reviewed literature now offers a signal for both, but no tool we run computes it — and both
are decided today by an operator looking at the Reconstruction.

- The gates come before the work: each of the eleven stages needs a measurement that says "this
  link is sound", and most of the measurements already exist in the tools' own output.
- Three of the five artefact classes the parent names are parameters a vendor ships rather than
  edits we make (ghosting filter, hole filling, outlier filtering): the first two ship only in tools
  we do not run, the third is an ODM flag at its default; two need a signal no tool we run computes
  (moving objects, water).
- The seamlines stage is the one with a research answer and no product answer: the algorithms
  exist, the tools are manual, and the parent map's stage-2 editor is where that decision lands.
- The ASPRS standards and the checkpoint residuals are what turn a deliverable from a picture into
  a claim about measurement, and that is a separate decision from the edits above.
- The accuracy class, the web formats and the editor staging stay where the parent map put them:
  undecided, and decided in #366, #367 and the map itself.

## Sources

### RealityScan documentation

- `docs/research/sources/alignment-commands.md` — https://dev.epicgames.com/documentation/en-us/realityscan/alignment-commands — fetched 2026-09-19T01:49:49Z — http 200
- `docs/research/sources/all-commands.md` — https://dev.epicgames.com/documentation/en-us/realityscan/all-commands — fetched 2026-09-19T01:51:32Z — http 200
- `docs/research/sources/model-tools.md` — https://dev.epicgames.com/documentation/en-us/realityscan/model-tools — fetched 2026-09-19T01:49:54Z — http 200
- `docs/research/sources/realityscan-2-2.md` — https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-2-2 — fetched 2026-09-19T01:50:00Z — http 200

### Pix4D manual and documentation

- `docs/research/sources/pix4d-clean-edit-point-cloud-in-raycloud.md` — https://support.pix4d.com/hc/en-us/articles/202560499 — fetched 2026-10-21T14:55:22Z — http 200
- `docs/research/sources/pix4d-clean-mesh-outlier-filtering-and-sky-mask.md` — https://support.pix4d.com/hc/en-us/articles/4407652056593 — fetched 2026-10-21T14:55:23Z — http 200
- `docs/research/sources/pix4d-clean-point-cloud-processing-options.md` — https://support.pix4d.com/hc/en-us/articles/202557799 — fetched 2026-10-21T14:55:22Z — http 200
- `docs/research/sources/pix4d-dem-dtm-generation.md` — https://support.pix4d.com/hc/en-us/articles/202560579 — fetched 2026-10-21T12:34:52Z — http 200
- `docs/research/sources/pix4d-dem-point-cloud-classification.md` — https://support.pix4d.com/hc/en-us/articles/115005737903 — fetched 2026-10-21T12:34:41Z — http 200
- `docs/research/sources/pix4d-export-point-cloud-export-formats.md` — https://support.pix4d.com/hc/en-us/articles/203890769 — fetched 2026-10-21T14:55:23Z — http 200
- `docs/research/sources/pix4d-gcp-input-files-format.md` — https://support.pix4d.com/hc/en-us/articles/202558539 — fetched 2026-10-21T12:35:43Z — http 200
- `docs/research/sources/pix4d-gcp-minimum-number-and-distribution.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:34:40Z — http 200
- `docs/research/sources/pix4d-ortho-dsm-and-orthomosaic-processing-options.md` — https://support.pix4d.com/hc/en-us/articles/202557769 — fetched 2026-10-21T14:54:54Z — http 200
- `docs/research/sources/pix4d-ortho-orthomosaic-processing-matic.md` — https://support.pix4d.com/hc/en-us/articles/360048200292 — fetched 2026-10-21T14:54:54Z — http 200
- `docs/research/sources/pix4d-ortho-photo-stitching-vs-orthomosaic.md` — https://support.pix4d.com/hc/en-us/articles/202558869 — fetched 2026-10-21T14:54:55Z — http 200
- `docs/research/sources/pix4d-qa-manual-4-1-dataset.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:09:03Z — http 200
- `docs/research/sources/pix4d-qa-manual-4-1-tie-points.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:09:03Z — http 200
- `docs/research/sources/pix4d-qa-manual-4-1.md` — https://data.pix4d.com/misc/manual_pdf/manual_4_1.pdf — fetched 2026-10-21T12:09:03Z — http 200
- `docs/research/sources/pix4d-qa-quality-report-specifications.md` — https://support.pix4d.com/hc/en-us/articles/202558679 — fetched 2026-10-21T12:16:21Z — http 200
- `docs/research/sources/pix4d-texture-3d-textured-mesh-processing-options.md` — https://support.pix4d.com/hc/en-us/articles/208194103 — fetched 2026-10-21T14:55:21Z — http 200

### Agisoft Metashape manual

- `docs/research/sources/metashape-clean-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T14:53:12Z — http 200
- `docs/research/sources/metashape-dem-build-dem-and-ground-classification.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:34:42Z — http 200
- `docs/research/sources/metashape-dense-build-point-cloud.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z — http 200
- `docs/research/sources/metashape-dense-editing-point-cloud.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z — http 200
- `docs/research/sources/metashape-export-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T14:53:12Z — http 200
- `docs/research/sources/metashape-gcp-reference-pane-and-errors.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:34:42Z — http 200
- `docs/research/sources/metashape-mesh-build-model.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z — http 200
- `docs/research/sources/metashape-mesh-editing-model-geometry.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:47:10Z — http 200
- `docs/research/sources/metashape-ortho-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T14:54:10Z — http 200
- `docs/research/sources/metashape-qa-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T12:05:57Z — http 200
- `docs/research/sources/metashape-seam-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T14:53:12Z — http 200
- `docs/research/sources/metashape-texture-manual-2-2.md` — https://www.agisoft.com/pdf/metashape-pro_2_2_en.pdf — fetched 2026-10-21T14:53:12Z — http 200

### OpenDroneMap documentation

- `docs/research/sources/odm-dem-dem-resolution-option.md` — https://docs.opendronemap.org/arguments/dem-resolution/ — fetched 2026-10-21T12:33:32Z — http 200
- `docs/research/sources/odm-dem-dsm-option.md` — https://docs.opendronemap.org/arguments/dsm/ — fetched 2026-10-21T12:33:31Z — http 200
- `docs/research/sources/odm-dem-dtm-option.md` — https://docs.opendronemap.org/arguments/dtm/ — fetched 2026-10-21T12:33:32Z — http 200
- `docs/research/sources/odm-dem-euclidean-map-option.md` — https://docs.opendronemap.org/arguments/dem-euclidean-map/ — fetched 2026-10-21T12:33:32Z — http 200
- `docs/research/sources/odm-dem-gapfill-steps-option.md` — https://docs.opendronemap.org/arguments/dem-gapfill-steps/ — fetched 2026-10-21T12:33:32Z — http 200
- `docs/research/sources/odm-dem-map-accuracy-ground-control.md` — https://docs.opendronemap.org/map-accuracy/ — fetched 2026-10-21T12:33:31Z — http 200
- `docs/research/sources/odm-dense-pc-classify.md` — https://docs.opendronemap.org/arguments/pc-classify — fetched 2026-10-21T12:46:06Z — http 200
- `docs/research/sources/odm-dense-pc-filter.md` — https://docs.opendronemap.org/arguments/pc-filter — fetched 2026-10-21T12:46:05Z — http 200
- `docs/research/sources/odm-dense-pc-quality.md` — https://docs.opendronemap.org/arguments/pc-quality — fetched 2026-10-21T12:46:05Z — http 200
- `docs/research/sources/odm-dense-pc-rectify.md` — https://docs.opendronemap.org/arguments/pc-rectify — fetched 2026-10-21T12:46:05Z — http 200
- `docs/research/sources/odm-dense-pc-sample.md` — https://docs.opendronemap.org/arguments/pc-sample — fetched 2026-10-21T12:46:05Z — http 200
- `docs/research/sources/odm-filter-feature-quality.md` — https://docs.opendronemap.org/arguments/feature-quality/ — fetched 2026-10-21T12:16:22Z — http 200
- `docs/research/sources/odm-filter-odm-outputs.md` — https://docs.opendronemap.org/outputs/ — fetched 2026-10-21T12:16:22Z — http 200
- `docs/research/sources/odm-mesh-mesh-octree-depth.md` — https://docs.opendronemap.org/arguments/mesh-octree-depth — fetched 2026-10-21T12:46:06Z — http 200
- `docs/research/sources/odm-mesh-mesh-size.md` — https://docs.opendronemap.org/arguments/mesh-size — fetched 2026-10-21T12:46:06Z — http 200
- `docs/research/sources/odm-mesh-options-and-flags.md` — https://docs.opendronemap.org/arguments/ — fetched 2026-10-21T12:48:42Z — http 200
- `docs/research/sources/odm-mesh-use-3dmesh.md` — https://docs.opendronemap.org/arguments/use-3dmesh — fetched 2026-10-21T12:46:06Z — http 200
- `docs/research/sources/odm-ortho-build-overviews-option.md` — https://docs.opendronemap.org/arguments/build-overviews/ — fetched 2026-10-21T14:52:15Z — http 200
- `docs/research/sources/odm-ortho-fast-orthophoto-option.md` — https://docs.opendronemap.org/arguments/fast-orthophoto/ — fetched 2026-10-21T14:52:15Z — http 200
- `docs/research/sources/odm-ortho-ignore-gsd-option.md` — https://docs.opendronemap.org/arguments/ignore-gsd/ — fetched 2026-10-21T14:52:16Z — http 200
- `docs/research/sources/odm-ortho-orthophoto-compression-option.md` — https://docs.opendronemap.org/arguments/orthophoto-compression/ — fetched 2026-10-21T14:52:17Z — http 200
- `docs/research/sources/odm-ortho-orthophoto-kmz-option.md` — https://docs.opendronemap.org/arguments/orthophoto-kmz/ — fetched 2026-10-21T14:52:17Z — http 200
- `docs/research/sources/odm-ortho-orthophoto-png-option.md` — https://docs.opendronemap.org/arguments/orthophoto-png/ — fetched 2026-10-21T14:52:16Z — http 200
- `docs/research/sources/odm-ortho-orthophoto-resolution-option.md` — https://docs.opendronemap.org/arguments/orthophoto-resolution/ — fetched 2026-10-21T14:52:14Z — http 200
- `docs/research/sources/odm-texture-arguments-options-and-flags.md` — https://docs.opendronemap.org/arguments/ — fetched 2026-10-21T14:52:26Z — http 200

### ASPRS Positional Accuracy Standards

- `docs/research/sources/asprs-gcp-checkpoint-requirements-edition1-2014.md` — http://florida.asprs.org/images/documents/ASPRS_Positional_Accuracy_Standards_Edition1_Version100_November2014.pdf — fetched 2026-10-21T12:37:24Z — http 200
- `docs/research/sources/asprs-gcp-positional-accuracy-standards-edition2-2023.md` — https://aagsmo.org/wp-content/uploads/2023/03/ASPRS_PosAcc_Edition2_MainBody.pdf — fetched 2026-10-21T12:37:24Z — http 200

### Peer-reviewed work

- `docs/research/sources/paper-artefact-vehicle-removal-photogrammetric-meshes.md` — https://arxiv.org/pdf/2011.11210 — fetched 2026-10-21T22:53:16Z — http 200 — Zhu, Shang, Hua, Yu & Zhong, "Structure-aware Completion of Photogrammetric Meshes in Urban Road Environment", arXiv:2011.11210 — vehicles detected with Faster R-CNN and removed from the mesh's geometry and texture
- `docs/research/sources/paper-artefact-depth-learning-moving-object-error.md` — https://openaccess.thecvf.com/content_ECCVW_2018/papers/11131/Pinard_Learning_structure-from-motion_from_motion_ECCVW_2018_paper.pdf — fetched 2026-10-21T22:53:16Z — http 200 — Pinard, Chevalley, Manzanera & Filliat, "Learning structure-from-motion from motion" — moving objects as an error source in the paper's unsupervised depth-training optimisation, with the residual-optical-flow exclusion reported as prior work the paper cites
- `docs/research/sources/paper-artefact-water-segmentation.md` — https://isprs-archives.copernicus.org/articles/XLIII-B2-2020/1189/2020/isprs-archives-XLIII-B2-2020-1189-2020.pdf — fetched 2026-10-21T22:53:17Z — http 200 — Akiyama, Marcato Junior, Gonçalves, Bressan, Eltner, Binder & Singer, "DEEP LEARNING APPLIED TO WATER SEGMENTATION", ISPRS Archives XLIII-B2-2020, 2020, DOI 10.5194/isprs-archives-XLIII-B2-2020-1189-2020 — a water surface separated from other surfaces in RGB imagery by a learned classifier
- `docs/research/sources/paper-mesh-robust-hole-detection-triangular-meshes.md` — https://arxiv.org/abs/2311.12466 — fetched 2026-10-21T12:47:10Z — http 200
- `docs/research/sources/paper-mesh-screened-poisson-crossref-record.md` — https://api.crossref.org/works/10.1145/2487228.2487237 — fetched 2026-10-21T12:48:42Z — http 200
- `docs/research/sources/paper-mesh-screened-poisson-kazhdan-hoppe-2013.md` — https://www.cs.jhu.edu/~misha/MyPapers/ToG13.pdf — fetched 2026-10-21T12:47:10Z — http 200
- `docs/research/sources/paper-qa-image-matching-wide-baselines.md` — https://arxiv.org/abs/2003.01587 — fetched 2026-10-21T12:18:48Z — http 200
- `docs/research/sources/paper-seam-crossref-edge-detection-uav-seamline-2018.md` — https://api.crossref.org/works/10.1080/2150704x.2018.1475772 — fetched 2026-10-21T14:54:56Z — http 200
- `docs/research/sources/paper-seam-crossref-graph-cuts-seamline-optimisation-2018.md` — https://api.crossref.org/works/10.1111/phor.12232 — fetched 2026-10-21T14:54:55Z — http 200
- `docs/research/sources/paper-seam-crossref-road-probability-seamline-2020.md` — https://api.crossref.org/works/10.3390/s20071832 — fetched 2026-10-21T14:54:56Z — http 200
- `docs/research/sources/paper-seam-crossref-semantic-segmentation-seamline-2015.md` — https://api.crossref.org/works/10.1109/access.2015.2508921 — fetched 2026-10-21T14:54:57Z — http 200

### Other documentation already in the repo

- `docs/research/sources/available-functions-componentfunctionset.md` — https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-componentfunctionset — fetched 2026-09-19T01:50:16Z — http 200
- `docs/research/sources/available-functions-contoursfunctionset.md` — https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-contoursfunctionset — fetched 2026-09-19T01:50:17Z — http 200

## What I could not verify

- OpenDroneMap's own image-quality filtering: the ODM docs publish no blur or duplicate-frame rejection stage, and https://docs.opendronemap.org/filter/ returned HTTP 404 when observed on 2026-10-21 (not re-fetched since), so the "no vendor equivalent" claims in the capture QA rows rest on absence of evidence (INFERRED). A run of ODM on a real Capture would settle it.
- The current Pix4Dmapper manual: https://data.pix4d.com/misc/manual_pdf/manual_4_8.pdf returned HTTP 403 when observed on 2026-10-21 (not re-fetched since), so only the 4.1 Getting Started guide (manual_4_1.pdf, HTTP 200) could be saved. Every Pix4D version claim in this fragment is therefore Pix4Dmapper 4.1.
- The Pix4D support article on the Quality Report carries no version string, so thresholds quoted only from `pix4d-qa-quality-report-specifications.md` rest on a page with no visible version; the 4.1 guide is the version-bearing page.
- Pix4D's pass/fail bands for Manual Tie Point and control-point projection error (for example 1 px and 3 px) appear on the PIX4Dmatic quality-report page, https://support.pix4d.com/hc/en-us/articles/360040686852, which was not fetched here; the Manual Tie Point row therefore cites no pass/fail threshold, only Pix4D's Projection Error [pixel].
- Metashape's gradual-selection criterion order (rotation, resolution, blur, coverage): the Metashape 2.2 manual documents point-cloud filtering criteria — Reprojection error, Reconstruction uncertainty, Projection accuracy — under the command Clean Tie Points (`metashape-qa-manual-2-2.md`), but not that ordering, and no current page states whether removing an image re-runs the solve on its own.
- Trulls et al., "Understanding Blindness in 3D Reconstruction", 2017, DOI 10.1109/CVPRW.2017.106: the DOI could not be confirmed through Crossref, so it is not cited; only Jin et al. (2020) is.
- OpenDroneMap check point role: no page in the ODM documentation (fetched 2026-10-21) documents a check point held separate from the ground control file, so the row that asks for one is tagged UNKNOWN.
- ASPRS standard host: asprs.org's own URLs for the standard returned HTTP 404 on 2026-10-21, and the Edition 2, Version 2 (June 2024) PDF was only reachable as an HTML maintenance page, so the accuracy classes quoted here come from Edition 1 (November 2014) and Edition 2, Version 1.0 (February 2023) mirror copies, fetched 2026-10-21.
- Pix4D version: the saved Pix4D support pages carry no version string, so rows relying on them say "version unconfirmed" and are tagged SUPPORTED; "Pix4Dmapper 4.1" is visible only in the source URL of the saved manual page.
- OpenDroneMap version: the saved `--dsm`, `--dtm`, `--dem-resolution`, `--dem-gapfill-steps` and `--dem-euclidean-map` option pages carry no version string either, so the OpenDroneMap 3.6.0 in the DSM/DTM rows rests on `odm-filter-odm-outputs.md`; the other saved ODM pages carry 3.6.0 themselves.
- PDAL ground-filter baseline was not researched here, so whether the ODM DTM is a true ground surface stays REQUIRES TEST.
- The peer-reviewed work cited in this document is metadata-only (Crossref bibliographic records) except Kazhdan & Hoppe's full text, the Yip, Stahl & Schellewald preprint and the three artefact-removal papers, whose full text was read, so the algorithm details behind the seamline and hole-detection rows were not read in full (SUPPORTED).
- Which ODM stage consumes `--pc-filter` and `--pc-sample`: the options list documents the flags and their defaults but not the stage that applies them, and ODM's filter implementation (FPCFilter) was not fetched, so the link between `odm_filterpoints` and these flags is inferred from the stage names alone (INFERRED).
- A target points-per-area for a given GSD: neither OpenDroneMap 3.6.0 nor Metashape 2.2 states one, so the density row above is tagged UNKNOWN and no row claims a published figure.
- Whether our own ODM meshes actually contain holes, floating fragments or topology faults: no run of `reconstruct-mesh` over a real Capture was made, so the mesh rows' verdicts are INFERRED (REQUIRES TEST).
- The Kazhdan & Hoppe year: the author's PDF carries the placeholder venue line "Vol. VV, No. N", so the year 2013 comes from the saved Crossref record, not from the saved paper text.
- The Yip, Stahl & Schellewald year: the saved page is the 2023 arXiv preprint, and it carries the three author names and the related journal DOI in its Related DOI field (Computer-Aided Design 2024, DOI 10.1016/j.cad.2024.103696); the journal issue itself was not fetched.
- The Zhu et al. year: the saved arXiv PDF carries no year for the paper itself — the only years on the page are the publication years of other papers it cites — and 2020 exists only in the arXiv identifier 2011.11210, so the citation gives the authors, the title and the arXiv id and drops the year (paper-artefact-vehicle-removal-photogrammetric-meshes.md).
- The Pinard et al. venue and year: the saved page carries neither, and ECCV 2018 Workshops and 2018 appear only in the source URL, so the citation gives the authors and the title and drops the venue and the year (paper-artefact-depth-learning-moving-object-error.md).
- The symptom wording for a hole in the Orthomosaic: no saved page describes such a hole as blank or transparent patches. The Metashape seamlines page describes the fill operation instead — "fill the holes, for the area for which there is no additional" (metashape-seam-manual-2-2.md) — and PIX4Dmatic tells the operator to enable Interpolation when holes are present (pix4d-ortho-orthomosaic-processing-matic.md), so the row quotes the page's own wording (UNKNOWN).
- Pix4Dmapper and RealityScan dense cloud and 3D mesh documentation were not fetched for this document, so no claim is made about their dense cloud or mesh defaults (UNKNOWN).
- The `pc-rectify` and `pc-classify` ODM options were saved (odm-dense-pc-rectify.md, odm-dense-pc-classify.md) but they govern ground classification for DTMs, so they are not counted as dense cloud stages here.
- No surveyed tool states a numeric definition of "small" for a floater, a hole or a ghost — RealityScan takes `maxEdgesCount` for `closeHoles` and the rest are left to the operator (model-tools.md) (UNKNOWN).
- No surveyed VENDOR TOOL documents automatic detection of moving objects; every one of them offers a filter or a mask to hide the symptom after the fact. The peer-reviewed literature does detect and remove them (`paper-artefact-vehicle-removal-photogrammetric-meshes.md`; no tool we run exposes it) (UNKNOWN for the tools, VERIFIED for the literature).
- No surveyed tool distinguishes a water surface from a legitimate flat surface; PIX4Dmatic only exposes a Sky mask (`pix4d-clean-mesh-outlier-filtering-and-sky-mask.md`); the literature separates water by appearance, not by geometry (`paper-artefact-water-segmentation.md`) (UNKNOWN for the tools, VERIFIED for the literature).
- The Structure from Motion paper saved for the moving-object row reports the residual-optical-flow exclusion of moving objects as prior work it cites, not as its own contribution, so that half of the claim is SUPPORTED rather than VERIFIED (`paper-artefact-depth-learning-moving-object-error.md`).
- The Metashape PDF and the Pix4D support pages give no numeric threshold for "hole" or "ghosting" — the manual names the operations, not a size cut-off, so any gate we write has to set its own number (UNKNOWN).
- The RealityScan model-cleanup page was fetched with `http: 200` but contains only a navigation table of contents, so no RealityScan cleanup wording could be quoted from it; the page is therefore not counted among the cited pages, and the cleanup wording used above comes from the saved RealityScan Model Tools page instead (UNKNOWN).
- ODM's documentation does not publish a texturing resolution policy or a per-facet quality flag (UNKNOWN).
- The full text of the peer-reviewed seamline papers was not fetched: the MDPI page for Yuan (2020) returned `http: 403` and was not saved, and the Wiley and IEEE pages were not attempted. What is cited is the Crossref record — title, venue, year, DOI — and the Zhang (2018) record carries the publisher abstract as well, which is what the cell above quotes; the Yuan (2020) record carries an abstract, and the Saito (2015) and Nguyen (2018) records carry bibliographic metadata only. Any claim about what a given algorithm optimises beyond those records needs the full text (SUPPORTED).
- Pan (2014) segmentation seamlines, DOI 10.1109/lgrs.2013.2293197 — the DOI appears only inside the reference list of three saved Crossref records, never as a saved record of the paper itself, so it is not cited here.
- The RealityScan ortho-projection API pages are saved, but neither of them states the choice of the surface the Orthomosaic is projected onto, so Stage 9 cites no RealityScan page.
- Esri's arcpy documentation lists its own seamline computation methods (Disparity, Voronoi, Radiometry, Edge Detection, Geometry). That page was not fetched for this document, so no cell above cites it (UNKNOWN).
- PIX4Dmapper exposes no manual seamline editing; PIX4Dmatic exposes a blending algorithm instead. Whether that counts as seamline control is a reading, not a quote (UNKNOWN).
- RealityScan's `exportModel` documentation names the command but the repo's saved page does not list the model formats it accepts; only `exportModelToZip` names `.obj` and `.fbx` as examples (model-tools.md) (UNKNOWN).
- No surveyed source states a delivery format requirement for a client; what the client can open is a product decision the parent map has not made (UNKNOWN).
