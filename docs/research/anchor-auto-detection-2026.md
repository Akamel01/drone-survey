# Automatic Anchor detection and gcp_list.txt generation (2026)

Answers the automation question raised against [ADR 0007](/Users/akamel/Documents/Drone/docs/adr/0007-anchors-for-cross-capture-registration.md)
and the sizing baseline in [anchor-sizing-2026.md](/Users/akamel/Documents/Drone/docs/research/anchor-sizing-2026.md):
can Anchor tagging become fully automatic, and does that change the physical marker?
Ground sample distances used throughout (1.10 / 1.47 / 1.83 cm/px at 60/80/100 m) are the
figures already established in that sizing report.

## Recommendation

**Keep the 40 cm concrete slab size. Change what is painted on it, and replace manual
tagging with a classical computer-vision pipeline that detects an uncoded high-contrast
target, resolves its identity by projection against the Anchor's known placeholder
coordinate, and gates the result before it ever reaches `gcp_list.txt`.**

- **Do not use coded fiducials (ArUco/AprilTag).** The arithmetic in §3 is unambiguous:
  at this aircraft's GSD, every coded-marker dictionary and every reasonable pixel-per-module
  margin requires a physical marker between roughly 66 cm and 2.7 m on a side. The 40 cm
  slab is 1.65×–6.9× too small for a coded marker at every altitude tested. Making a coded
  marker big enough would mean a slab bigger than a standard patio stone, at several times
  the cost and with real storage/transport problems for a solo operator. Coded fiducials
  are the right tool at close range (robotics, tabletop calibration); they are the wrong
  tool at 60–100 m with an 8192×6144 consumer sensor.
- **Use an uncoded, shape-detected target**, keeping the 40 cm size the sizing report
  already justified. Change the painted pattern from a plain cross to a **black/white
  radial quadrant ("pie") target inside a circle** — see §7 for the printable design. This
  keeps the excellent GSD margin already computed (22×–36× GSD across 60–100 m) and gives a
  shape that is both easy to hand-paint accurately and easy to detect and sub-pixel-locate
  automatically (§2, §4).
- **Identity is resolved by projection, not by reading a code.** Each Anchor's one-time
  GPS placeholder coordinate is projected into each image using the Capture's own recovered
  camera geometry (an initial GPS/attitude-only pose, refined by OpenDroneMap's own
  structure-from-motion pass), and each detected blob is matched to its nearest projected
  Anchor. This works only if Anchors are spaced well clear of the projection uncertainty —
  see the widened spacing recommendation in §2 and §7.
- **A quality gate sits between detection and `gcp_list.txt`, not inside ODM.** ODM has no
  documented automatic outlier rejection for bad ground control (§5); a wrong detection is
  reported anecdotally in the OpenDroneMap community to either silently bias the solve or
  hard-fail the whole reconstruction. The gate in §6 must run before ODM sees the file.
- Net effect on the existing plan: **the 40 cm slab and its sourcing (§5 of the sizing
  report) do not change.** What changes is the paint pattern (cross → quadrant/bullseye,
  stencilled rather than freehand) and the fact that a program, not the operator, produces
  `gcp_list.txt`.

---

## 1. Existing tooling

**Open source / OpenDroneMap ecosystem**

- **Find-GCP** (`gcp_find.py`), maintained by the GeoForAll Lab at Budapest University of
  Technology and Economics, is the closest match to "automatic detector that outputs
  ODM-compatible `gcp_list.txt`." It uses OpenCV's ArUco module to find printed ArUco
  markers and writes `gcp_list.txt` directly in a format ODM/WebODM/VisualSfM/Meshroom
  accept; it also ships marker-generation scripts (`aruco_make.py`, `dict_gen_3x3.py`) and a
  GUI check tool (`gcp_check.py`) for visual QA. It runs headlessly on Linux via its CLI, is
  open source, and is actively referenced from OpenDroneMap's own site.
  [opendronemap.org/findgcp](https://opendronemap.org/findgcp/),
  repo: [github.com/zsiki/Find-GCP](https://github.com/zsiki/Find-GCP),
  community usage thread: [Automatic GCP points using ArUco markers](https://community.opendronemap.org/t/automatic-gcp-points-using-aruco-markers/8098),
  ODM's own writeup: [Automatize GCP image coordinate collection](https://opendronemap.org/2021/04/automatize-gcp-image-coordinate-collection/).
  Find-GCP is built for **coded** ArUco markers, so as shipped it inherits the size problem
  in §3; its detection/matching code is still a reasonable starting point to adapt for an
  uncoded target.
- **GCP Editor Pro** and **POSM GCPi**, referenced directly from ODM's own GCP
  documentation, are manual/semi-manual tagging UIs, not automatic detectors —
  [docs.opendronemap.org/gcp](https://docs.opendronemap.org/gcp/).
- Academic work exists on automatic GCP detection from UAV imagery (e.g. "Automatic GCP
  Detection on UAV Images," [ResearchGate](https://www.researchgate.net/publication/355042653_Automatic_GCP_Detection_on_UAV_Images))
  and a related OpenDroneMap community thread on the same goal
  ([Automating GCP detection on images](https://community.opendronemap.org/t/automating-gcp-detection-on-images/7122))
  confirms this is a known, only partially solved problem in the community: "there is work
  on automatically detecting GCP with some patterns, but not all GCPs have these patterns,
  so it may fail" — i.e., no turnkey uncoded-target detector ships with ODM today.

**Commercial systems**

- **Pix4D AutoGCP** automatically locates targets and their centers "with pixel-level
  accuracy" for three specific uncoded pattern families (square, diagonal, and Aeropoint
  Haar-like black/white patterns). Pix4D's own stated requirements: images geolocated to
  5–10 m, nadir or only slightly oblique, good image quality (blur/low contrast fail the
  algorithm), target size at least 20× average GSD, targets at least 10 m apart, and **only
  the targets in use visible in the image** (an unused target in frame can mislead it) —
  [Pix4D AutoGCP algorithm](https://support.pix4d.com/hc/en-us/articles/4402423894545),
  [Pix4D blog on automatic GCPs](https://www.pix4d.com/blog/automatic-ground-control-points).
  Pix4Dmapper is proprietary Windows/cloud desktop software; I could not confirm a
  standalone headless-Linux mode for AutoGCP specifically (flagged in §8).
- **Propeller AeroPoints** sidesteps visual detection almost entirely: the "target" is a
  battery-powered dual-frequency GPS receiver that records its own position and corrects it
  from Propeller's network, so there is no pixel-based identity problem to solve at all —
  [propelleraero.com/aeropoints](https://www.propelleraero.com/aeropoints/). This is a
  hardware/subscription product, not a detection algorithm, and not applicable to a
  consumer-GPS, ODM-based, self-hosted pipeline.
- **DroneDeploy Ground Control AI** automatically detects and tags **standard high-contrast
  checkerboard targets** (on by default), explicitly warning that non-standard targets will
  be skipped and that skipped targets can hurt accuracy —
  [DroneDeploy Automatic GCP Tagging](https://help.dronedeploy.com/hc/en-us/articles/33265623188375-Automatic-GCP-Tagging),
  [best practices](https://help.dronedeploy.com/hc/en-us/articles/11138616177047-Best-Practices-for-Ground-Control-Points-GCPs-and-Checkpoints).
  This is a cloud-only SaaS pipeline with no self-hosted/headless option, and it uses
  **uncoded** targets — independent confirmation that uncoded shape-detection is the
  commercially-proven approach at this end of the market, not coded fiducials.

**Bottom line for Q1:** no existing open-source tool detects uncoded targets and writes
`gcp_list.txt` out of the box. Find-GCP does the ODM-integration half (file format,
headless Linux, active maintenance) but for the wrong target type. The commercial systems
validate that uncoded high-contrast targets are what production automatic-GCP systems
actually use, and that Pix4D's own sizing rule (20× GSD) matches the sizing report's already
chosen design multiple. The practical path is: build a small detector (§7) using Find-GCP's
plumbing as a reference for the ODM-facing half, not its ArUco half.

## 2. Coded versus uncoded targets

**Coded fiducials (ArUco/AprilTag).** Identity is read directly from the bit pattern, so
there is no matching-ambiguity problem, and both families include error-correcting codes
that tolerate some bit corruption from partial occlusion or damage. Corner-based pose
recovery is a mature, well-studied pipeline
([OpenCV ArUco detection](https://docs.opencv.org/4.13.0/d5/dae/tutorial_aruco_detection.html)).
But reliability is gated hard by resolution (§3): a coded marker that is too small for its
dictionary simply fails to decode — it does not degrade gracefully to "probably this ID," it
returns nothing. Oblique viewing compounds this: the flat square modules become foreshortened
trapezoids, which both reduces contrast/edge sharpness in the compressed axis and shrinks the
effective per-module pixel count exactly where decoding margin is already thinnest. A
comparison study of ARTag/AprilTag/CALTag found meaningful differences between families in
robustness to exactly this kind of partial occlusion and rotation —
[ResearchGate comparison study](https://www.researchgate.net/publication/318871910_ARTag_AprilTag_and_CALTag_Fiducial_Marker_Systems_Comparison_in_a_Presence_of_Partial_Marker_Occlusion_and_Rotation).

**Uncoded targets (cross/circle/checkerboard).** Detection is by shape (Hough circle,
contour/corner finding, or template/normalized-cross-correlation matching), which is far
more forgiving of the resolution and viewing-angle limits above — a circle is still a
detectable ellipse well past the point a coded marker stops decoding. The cost is moved
entirely into identity resolution: a detected blob carries no ID, so it must be matched to
the correct Anchor by nearest-projected-position, using the Capture's camera geometry to
project each Anchor's known placeholder coordinate into the image. This is exactly how
Pix4D's AutoGCP and DroneDeploy's Ground Control AI work in production (§1), which is strong
independent evidence the approach is workable at this altitude band — but it inherits a
real risk this project's own constraints create: **the position used to disambiguate is only
as good as the pose it's projected with.** ADR 0007 and the sizing report both note consumer
smartphone GPS is only accurate to roughly 2–10 m
([PLOS ONE / PMC smartphone GPS accuracy study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6638960/)),
and if that raw GPS/attitude estimate is what's used to project Anchors into the image, a
projection error of several meters could sit closer to the wrong Anchor than the right one —
particularly at the 2 m minimum Anchor spacing the sizing report currently recommends. Two
mitigations, both cheap: (a) do projection using OpenDroneMap's own structure-from-motion
pass (relative camera geometry from feature matching is far more accurate than raw GPS, even
before any GCPs are added) rather than raw EXIF GPS, and (b) widen the minimum Anchor spacing
from the general-photogrammetry 2 m floor to something safely larger than the expected
projection error — 8–10 m is a reasonable margin given typical SfM-only positional accuracy,
though I could not find a source giving that exact spacing number for this specific pipeline
(flagged in §8).

**Robustness to shadow, dust, occlusion, rotation:**
- Coded markers: correction capacity is bounded by the dictionary's Hamming distance — a
  36h11 tag corrects a bounded number of flipped bits, but shadow or dust that changes many
  cells' apparent color at once (not just adds noise to a few) exceeds that budget and fails
  outright rather than degrading. Rotation is a non-issue by design (that's what the corner
  ordering and code are for).
- Uncoded shape targets: shadows and dust reduce contrast and can distort a fitted
  circle/cross into an asymmetric blob, but centroid-fitting methods (§4) tolerate partial
  degradation better than bit-decoding tolerates any degradation, because they're extracting
  one geometric center from many edge pixels rather than reading discrete bits. Partial
  occlusion of one arm of a cross, or one edge of a circle, still leaves enough geometry to
  fit a center — accuracy degrades gracefully rather than failing outright. Rotation is
  irrelevant to a circular target and only mildly relevant to a symmetric quadrant/cross
  pattern (§7 design is 180°-rotation-symmetric by construction, which is fine since no
  orientation information is needed, only a center).
- The one real risk unique to uncoded detection in this project: ADR 0007 deliberately
  places Anchors on **existing site clutter** — a kerb, a manhole cover, a wall — which is
  exactly the kind of background a generic circle/cross detector can false-positive on if
  the site has similar real-world features nearby. This argues for keeping the painted
  pattern high-contrast and geometrically distinctive (§7) and for a conservative detection
  threshold plus the quality gate in §6, rather than for switching to coded markers, which
  the size arithmetic in §3 rules out anyway.

## 3. Resolution requirements, with arithmetic

**How many pixels per module does reliable decoding need?** There is no single
universally-cited number, but the recurring figure across fiducial-marker literature and
AprilTag-specific discussion is **roughly 10 pixels per module (bit cell) as a bare floor**
for clean, sharp imagery — the actual per-source picture is thinner than that single number
suggests; see §8. Aerial JPEG stills add two degrading factors this floor doesn't account
for: JPEG's chroma subsampling and quantization near hard black/white edges, and drone motion
blur even at typical cruise/hover speeds. Applying the same kind of safety margin the sizing
report itself already uses (moving from a bare 5× GSD floor to a 20× design multiple, §3 of
that report) argues for a **15 px/module practical target**, not the 10 px/module floor —
this margin figure is my own reasoned extrapolation, not a single sourced number, and is
flagged as such in §8.

**How many modules does a coded marker have?** AprilTag 36h11 encodes 36 data bits in a 6×6
grid, surrounded by a black border; depending on border convention the total marker grid is
commonly rendered as either **8×8** (6×6 data + 1-module border each side) or **10×10** (the
convention used in the widely-distributed `apriltag-imgs` bitmap assets). I did not re-verify
the exact border width from the primary AprilTag paper this session (flagged in §8), so both
are computed below. Small ArUco dictionaries (e.g. 4×4_50) go as low as **6×6** total modules.

**Arithmetic.** Required marker pixel-width = modules × px/module. Required physical size
S(cm) = pixel-width × GSD(cm/px), using the sizing report's own GSD figures (1.10 / 1.47 /
1.83 cm/px at 60/80/100 m):

| Marker type | Modules | px/module | Pixel-width | S @ 60 m | S @ 80 m | S @ 100 m |
|---|---|---|---|---|---|---|
| ArUco 4×4 (smallest common dict.) | 6 | 10 (floor) | 60 px | 66 cm | 88 cm | 110 cm |
| ArUco 4×4 | 6 | 15 (margin) | 90 px | 99 cm | 132 cm | 165 cm |
| AprilTag 36h11 (8×8 convention) | 8 | 10 (floor) | 80 px | 88 cm | 118 cm | 146 cm |
| AprilTag 36h11 (8×8) | 8 | 15 (margin) | 120 px | 132 cm | 176 cm | 220 cm |
| AprilTag 36h11 (10×10 convention) | 10 | 10 (floor) | 100 px | 110 cm | 147 cm | 183 cm |
| AprilTag 36h11 (10×10) | 10 | 15 (margin) | 150 px | 165 cm | 221 cm | 275 cm |

**Every single combination exceeds 40 cm, at every altitude, including the smallest
practical dictionary at the bare-minimum pixel floor and the best-case (60 m) altitude.**
The closest case (ArUco 4×4, 10 px/module floor, 60 m) still needs 66 cm — 1.65× the current
slab. The worst realistic case (AprilTag 36h11, 15 px/module margin, 100 m) needs 2.2–2.75 m
— larger than the slab material itself, and impractical to fabricate, transport, or store for
a solo operator. **40 cm is enough for an uncoded target (already shown in the sizing
report's own 20×-GSD math: 36.6 cm required, 40 cm chosen with margin) but is not enough for
any coded fiducial at any tested altitude.** This conclusion is robust to the uncertainty in
exact module count and margin — the gap is 1.65×–6.9×, not a close call.

**Oblique passes.** ADR 0007's Captures include oblique passes, and both target types lose
apparent resolution off-nadir, but through different mechanisms. Slant range to the ground
point increases with off-nadir angle θ as H/cos(θ), which alone increases GSD proportionally;
foreshortening additionally compresses the marker's apparent size along the tilt axis by a
factor of cos(θ). At a representative 30° off-nadir angle, that's roughly a 1.15× GSD
increase compounded with a 0.87× foreshortening in one axis — around a one-third loss of
effective resolution in that axis versus a nadir shot at the same altitude. This is standard
projective geometry, not a value I found stated for this specific aircraft/mission, so I
cannot cite a URL for the 30° example — it's illustrative arithmetic, flagged in §8. The
practical consequence is the same for both marker types: oblique detections are lower
priority/lower confidence than nadir ones, which is exactly what the quality gate in §6
should weight for, and it makes the coded-fiducial size problem in the table above worse, not
better — another reason to rule coded fiducials out rather than try to split the difference.

## 4. Sub-pixel centre localisation

- **Corner detection + refinement (`cv2.cornerSubPix`-style iterative refinement)** is the
  standard method for chessboard/checkerboard-style corners and is reported to achieve
  clearly sub-pixel accuracy under good contrast and lighting; it is the accuracy baseline
  most camera-calibration pipelines are built on.
- **ArUco corner refinement** follows the same idea (find the marker, refine its four
  corners, take the centroid), but is documented to be **less precise than chessboard corner
  detection** because the corner is a single point where two edges meet rather than a
  well-constrained saddle point, and marker corners are "less resolvable than chessboard
  target" corners —
  [OpenCV ArUco detection docs](https://docs.opencv.org/4.13.0/d5/dae/tutorial_aruco_detection.html),
  general finding also discussed in a wide-angle camera calibration review
  ([arXiv 2306.09014](https://arxiv.org/pdf/2306.09014)) and an ArUco camera-calibration
  paper ([ResearchGate](https://www.researchgate.net/publication/278151699_Using_ARUCO_coded_targets_for_camera_calibration_automation)).
  This is a further point against coded markers even setting aside the size problem: the
  format that's hardest to make big enough is also the one with the noisier centroid.
- **Template matching / normalized cross-correlation** against an ideal target pattern is
  the classical photogrammetric approach for uncoded circular/cross targets, and is what a
  circle/quadrant detector for this project would use for the final centroid pass after a
  coarse shape-detection step locates candidates.
- **Fitted crossing lines**, for a cross-shaped target: fit a line through each arm's edge
  pixels and take the intersection. This degrades gracefully if one arm is partly shadowed
  or occluded, since the other arm(s) still constrain the fit — a practical advantage for
  a site where shadows move through the day across multiple visits.
- **Sub-pixel edge modelling along the edge normal** (fitting a sigmoid/transition-zone
  model to the grayscale profile crossing a target edge, rather than thresholding it) is
  used in recent long-distance AprilTag pose work specifically to correct for optical
  diffusion blurring the edge —
  [ScienceDirect, small AprilTag pose accuracy at long range](https://www.sciencedirect.com/science/article/abs/pii/S0031320326006485).
  The same edge-profile-fitting idea applies directly to a circular/quadrant uncoded target
  and is the most precise of the methods above for a target that's only a few tens of pixels
  across, which is the actual regime this project operates in (§3).
- **Circular targets have a known systematic bias under oblique viewing** (a circle
  photographs as an ellipse, and the ellipse centroid is not exactly the true 3D center's
  projection) that a pure cross does not have. Given this project explicitly flies oblique
  passes, that bias needs to be corrected for or accepted as noise; a quadrant/cross-in-circle
  design (§7) keeps the option of using the cross's line-intersection as the primary centroid
  and the circle only for coarse shape detection, sidestepping the ellipse-bias question for
  the precise measurement.

I could not find a single quoted numeric sub-pixel accuracy figure (e.g. "0.1 px" or "0.2
GSD") from a source I fetched this session that I'm confident applies to this specific
target/altitude combination; the qualitative ranking above (chessboard corners > ArUco
corners; edge-profile fitting > simple thresholding) is well supported, the exact achievable
sub-pixel number for a 40 cm quadrant target at 100 m through this specific camera is not
(flagged in §8).

## 5. How ODM consumes GCPs

**File format**, from [ODM's own GCP documentation](https://docs.opendronemap.org/gcp/):

- Header line: a coordinate system spec — a PROJ string (e.g.
  `+proj=utm +zone=10 +ellps=WGS84 +datum=WGS84 +units=m +no_defs`), an EPSG code, or
  `WGS84 UTM <zone>[N|S]`.
- Each following line: `geo_x geo_y geo_z im_x im_y image_name [gcp_name] [extra1] [extra2]`,
  tab- or space-separated — ground X/Y/Z, the pixel coordinates of that GCP in one image, and
  the image filename, plus optional label/extra fields.
- File must be named `gcp_list.txt` in the project's base folder; ODM detects and uses it
  automatically if present.
- Practical failure notes straight from the docs: don't use `NaN` for missing elevation, use
  `0.0` instead; reducing decimal precision on geo_x/geo_y can reduce processing failures.
  Targets themselves can be "purchased or built with an ample variety of materials ranging
  from bucket lids to floor tiles" — the docs assume uncoded, physically-built targets as the
  default case, not coded fiducials.

**Minimum images per GCP and minimum GCP count.** The docs give a worked example of "a
minimum of 15 lines after the header (5 points with 3 images to each point)" as the floor for
a workable file, alongside separate guidance elsewhere that each point should appear in
"at least 5 images" for best results — treat 3 images/GCP as the documented hard floor and 5
as the comfortable target, consistent with more images per point simply giving the bundle
adjustment more constraints. GCP count: 5 minimum, 8–10 for larger projects, matching the
sizing report's own §6 and Propeller's general guidance
([Propeller — Ground Sample Distance & Drone Data](https://www.propelleraero.com/blog/ground-sample-distance-gsd-calculate-drone-data/)).

**What happens if some detections are wrong — is there outlier rejection?** I found no
mention of automatic GCP outlier rejection in ODM's own documentation, and the OpenDroneMap
community forum has multiple independent threads where a malformed or bad GCP entry doesn't
get quietly down-weighted — it makes the **entire reconstruction fail outright**:
["Possible bug: GCP file causes reconstruction to fail"](https://community.opendronemap.org/t/possible-bug-gcp-file-causes-reconstruction-to-fail/21542),
["GCP file causing reconstruction to fail"](https://community.opendronemap.org/t/gcp-file-causing-reconstruction-to-fail/21076),
["Error: Processing stopped because of strange values in the reconstruction"](https://community.opendronemap.org/t/error-processing-stopped-because-of-strange-values-in-the-reconstruction/21309).
That is actually a useful property for this project — a badly wrong GCP tends to fail loud
rather than silently bias the registration — but it also means **the detector cannot rely on
ODM to catch its mistakes**; a wrong-but-plausible pixel coordinate (e.g. a detection matched
to the wrong Anchor because two projected positions were close together, §2) will not
necessarily crash anything, it will just quietly register the Capture wrong. This is exactly
why the standalone quality gate in §6 has to run before the file reaches ODM, not rely on
ODM's behavior after the fact. I could not independently confirm from a document fetched this
session whether ODM's own generated report (`report.pdf`/`stats.json`) exposes a per-GCP
reprojection-residual number after a successful solve; if it does, that number should feed
back into the gate as an additional post-hoc check (flagged in §8).

## 6. Automated quality gate

Given §5's finding — ODM offers no automatic protection against a bad-but-plausible GCP —
the gate has to live in the detection pipeline, before `gcp_list.txt` is written or handed to
ODM. Proposed checks, any one of which stops the pipeline and flags the Capture for a human
rather than proceeding:

1. **Detection count per Anchor.** Require each Anchor to be detected in at least the
   documented ODM floor of 3 images, with 5+ as the target (§5). Fewer than 3 clean
   detections for any Anchor that should be visible in the Capture (based on the flight plan
   and the Anchor's known rough position) → flag. This also catches an Anchor that's been
   damaged, buried, or occluded since the last visit.
2. **Detection-to-projection distance.** Each accepted detection must fall within a tight
   pixel-distance gate of where the Anchor's known placeholder coordinate projects to, given
   the Capture's recovered camera geometry (§2). A detection far from its expected projected
   position, or two Anchors whose projected positions land close enough together to make
   assignment ambiguous, is exactly the false-match risk called out in §2 — flag rather than
   guess.
3. **Reprojection residual after the solve.** Once ODM (or a pre-solve bundle check) has used
   the candidate GCPs, the residual error for each GCP should be expressed in GSD multiples,
   consistent with how the sizing report already reasons about tolerances — e.g., flag if any
   Anchor's residual exceeds a small multiple of GSD (on the order of 2–3× GSD, roughly 3–5 cm
   at these altitudes) rather than an arbitrary absolute pixel count, since GSD already varies
   2× across the 60–100 m operating band.
4. **Cross-image consistency.** Multiple detections of the same Anchor across different
   images of one Capture should triangulate to a tight cluster; large 3D scatter between them
   indicates a false match (a detector's answer resolved to the wrong Anchor in some frames)
   rather than genuine target motion, since Anchors are, by ADR 0007's own design, fixed and
   outside the changing part of the Site.
5. **Minimum accepted-Anchor count for the whole Capture.** Even if individual Anchors pass
   1–4, the Capture as a whole should not proceed with fewer accepted Anchors than the
   sizing report's own floor (5) — losing enough Anchors to drop below that floor is itself a
   signal something changed at the Site (an Anchor destroyed, moved, or a systematic
   detection failure) and warrants a human look before the Capture joins the timelapse.

Any failure above should produce a clear, specific flag (which Anchor, which check, which
image) rather than a generic "processing failed," since the whole point of automation here is
that a human is only pulled in for the exceptional case, and needs to be able to act on it
quickly.

## 7. Recommended marker design and detection method

**Marker:** keep the 40×40 cm concrete patio slab from the existing sizing report (§5 of that
report already covers sourcing, cost, and durability reasoning — nothing here changes that).
**Change the painted pattern** from a plain cross to a **black/white four-quadrant target
inside a circular border** (a standard photogrammetric "pie"/quadrant-cross GCP pattern):
a circle for fast, forgiving coarse detection (Hough-circle or contour-based, tolerant of
partial occlusion and shadow per §2), with the internal quadrant boundaries giving two
crossing high-contrast lines for the precise line-intersection centroid method (§4) that
resists the ellipse-bias problem plain circles have under the oblique passes this project
flies.

```
 ┌───────────────────────┐
 │      ▄▄▄▄▄▄▄▄▄▄▄      │
 │   ▄▄█ WHITE│BLACK █▄▄   │
 │  █    Q1   │  Q2    █  │
 │  █─────────┼─────────█ │   40 cm square slab
 │  █    Q3   │  Q4    █  │   circle inscribed, ~34 cm diameter
 │   ▀▀█ BLACK│WHITE █▀▀   │   (Q1=white,Q2=black,Q3=black,Q4=white —
 │      ▀▀▀▀▀▀▀▀▀▀▀      │    opposite quadrants match, adjacent differ)
 └───────────────────────┘
```

This is stencil-friendly (two straight cuts and a compass circle — no freehand curves needed
for the functional edges that matter to the detector, only the outer circle needs a curve and
that's forgiving since it's used for coarse detection only), and the design is 180°-rotation-
symmetric, which is fine since no orientation information is required, only a center.

**Detection method (headless Linux, ODM-compatible pipeline):**

1. Coarse candidate detection per image: adaptive threshold + Hough-circle/contour matching
   for the black/white circular silhouette (OpenCV, no proprietary dependency).
2. Identity assignment: project each Site's known Anchor placeholder coordinates into the
   image using the Capture's SfM-refined camera pose (preferred over raw EXIF GPS/gimbal, per
   §2) and match each candidate to its nearest projection within a tight gate.
3. Precise centroid: fit the two quadrant-boundary lines within the matched candidate region
   and take their intersection (§4), rather than relying on the coarse circle's own centroid.
4. Quality gate (§6) before writing anything.
5. Write `gcp_list.txt` in ODM's documented format (§5) only for Anchors/detections that
   passed the gate; anything that didn't, flag for a human rather than omit silently.

**What the operator does on site**, once, per Anchor, at Site onboarding (unchanged from the
sizing report's §7 procedure): place the slab, GPS-average its position over a few minutes,
photograph it for cross-reference, and record the coordinate. After that, the operator's only
job per Capture is client communication, driving, and flying — exactly the stated business
goal — because tagging is now the pipeline's job, not theirs.

**Off-the-shelf/cheap:** yes, unchanged. This is still a $5–9 CAD concrete patio slab with
spray paint and a stencil, not a fabricated or purchased coded-target product — the design
change is entirely in the paint pattern and the software, not the physical sourcing.

## 8. What I could not verify

- **The exact AprilTag 36h11 module grid size** (8×8 vs 10×10 border convention) — I did not
  fetch the primary AprilTag specification to pin this down this session; §3's arithmetic
  computes both, and the conclusion (40 cm is far too small for any coded marker) does not
  depend on which is correct.
- **A single authoritative "X pixels per module" decoding floor.** The commonly-repeated
  ~10 px/module figure came back from search rather than one pinned primary source, and the
  15 px/module "aerial JPEG + motion blur margin" figure in §3 is my own reasoned
  extrapolation from the sizing report's own floor-vs-design-multiple methodology, not a
  cited number. The size gap between 40 cm and what coded markers need is large enough
  (1.65×–6.9×) that this uncertainty doesn't change the recommendation.
- **A cited sub-pixel accuracy figure (e.g., in px or in GSD units) for a circular/quadrant
  target at 100 m through this specific camera.** §4's ranking of methods is well supported;
  a specific expected-accuracy number for this exact setup is not, and would be worth
  establishing empirically (fly a Capture, tag by both methods, compare) before fully trusting
  the automated pipeline's precision claims.
- **Whether ODM's generated report/stats output exposes a per-GCP reprojection residual
  after a successful solve.** I believe this exists from general familiarity with ODM's
  output but did not fetch or confirm the exact field/schema this session; if the field
  doesn't exist as described, the quality gate's residual check (§6, item 3) would need to
  compute the residual independently rather than reading it from ODM's own report.
- **Whether Pix4D AutoGCP or DroneDeploy Ground Control AI can run headlessly on Linux
  outside their respective GUI/cloud products.** Both are proprietary systems; I found
  feature descriptions but no confirmation either way, and it's moot for this project since
  ADR 0007 already commits to a self-hosted ODM pipeline rather than a commercial SaaS.
  I also could not retrieve Pix4Dtagger's technical detail beyond its existence.
  ([Pix4Dtagger reference](https://support.pix4d.com/hc/en-us/articles/210729106-Using-PIX4Dtagger-automatic-target-recognition))
- **The 8–10 m widened Anchor-spacing recommendation in §2** is my own reasoned mitigation
  for the GPS-projection-ambiguity risk, not a number found in any source for this specific
  pipeline or aircraft; it should be treated as a starting point to validate on the first
  automated Site, not a verified requirement.
- **The 30° oblique-angle GSD/foreshortening example in §3** is standard projective geometry
  applied by me to illustrate the effect, not a measured or sourced figure for this aircraft's
  actual oblique-pass geometry, which ADR 0007/the sizing report don't specify numerically.
- One WebFetch and one WebSearch call failed mid-session on a provider-side rate limit
  (Pix4D AutoGCP page fetch, and a Find-GCP license/README search); the material those would
  have added (finer AutoGCP failure-mode detail, Find-GCP's specific license text) was
  substantially recovered through the WebSearch summaries and the successful Find-GCP fetch
  cited in §1, but the license of Find-GCP specifically is described here as "open source per
  its GitHub presence" rather than a confirmed license name/version — worth checking the
  repo's `LICENSE` file directly before depending on it.
