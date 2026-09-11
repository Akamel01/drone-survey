# Automating splat cleaning without losing quality — 2026-09-10

Answers issue #29. Scope: nerfstudio 1.1.5 / gsplat 1.4.0 splatfacto output from DJI Mini 5
Pro imagery, cleaned automatically instead of by hand in SuperSplat. Every claim below is
cited; a few of the flag names and behaviors were checked directly against the nerfstudio
1.1.5 wheel (`pip download nerfstudio==1.1.5`) rather than a blog post, and are marked
"(source)" where that matters.

## Recommended pipeline (ordered)

1. **Pre-flight sanity check, before training starts.** Read ODM's own reconstruction
   report (reprojection error, GCP RMSE) for the same Capture. If the photogrammetry solve
   itself is bad, no amount of splat cleanup fixes it — fail fast here, not after 15,000
   steps.
2. **Train with the source-reduction settings from Q3 already on** (fragmentation-resistant
   allocator, `cull_alpha_thresh` lowered, antialiased rasterization, scale regularization)
   rather than cleaning purely as post-processing. This is cheaper than removing the same
   floaters later.
3. **Compose the geographic-to-model transform once per Capture**, from three known pieces:
   the camera/GCP georegistration from the ODM solve, nerfstudio's `applied_transform` /
   `applied_scale` recorded in `transforms.json`, and the additional recentering/scale in
   `dataparser_transforms.json` written at the end of training. This gives a matrix from
   the site boundary polygon's real-world coordinates into the trained model's local
   coordinate frame.
4. **Crop to the site volume.** Extrude the boundary polygon to a prism (bottom/top from the
   known ground elevation ± a margin) and mask gaussian centers with a point-in-polygon +
   z-range test in that transformed space. Do this as a standalone script (`numpy` +
   `plyfile` + `shapely`) rather than forcing the polygon into `ns-export`'s oriented
   *box*, which cannot represent a non-rectangular boundary — see Q1.
5. **Statistical outlier removal** on the surviving gaussian centers (k-NN distance, drop
   far outliers) to catch floaters that are inside the site box but spatially isolated —
   Open3D's `remove_statistical_outlier` is the standard, license-clean tool for this.
6. **Opacity/scale pruning** as a final pass: drop gaussians below a low opacity threshold
   and above a huge-scale threshold. This overlaps with training-time culling but catches
   what training left behind.
7. **Run the quality gate** (below) against the cleaned splat. Pass → publish. Fail → queue
   for the one human review step that ADR 0015 still allows.

## The quality gate (recommended, with confidence caveat)

No published, validated threshold set exists for "is this aerial construction splat good
enough to ship" — this is the one area where I could not find production evidence, only
general 3DGS benchmark conventions. Recommend a **composite gate**, calibrated empirically
against this business's own first N human-reviewed deliveries rather than trusted from
generic numbers on day one:

| Check | Metric | Suggested starting threshold | Confidence |
|---|---|---|---|
| Held-out view fidelity | PSNR / SSIM / LPIPS on views withheld from training | PSNR is scene-dependent (typical published 3DGS results cluster 25–35 dB); SSIM > 0.85; LPIPS < 0.2 are commonly treated as "good" in the literature | Low — these are cross-scene research norms, not validated on this pipeline or resolution |
| Site-boundary discipline | fraction of gaussians culled by the polygon crop | flag if crop removes an unusually large fraction of total gaussians vs. the Capture's historical baseline — a spike suggests training put mass outside the site (drift, bad pose) | Not independently verified; a reasonable proxy, not a published standard |
| Residual floaters | count/volume of isolated gaussian clusters after SOR (step 5) | flag if SOR removes more than a per-Capture-type historical baseline | No published threshold found |
| Depth consistency | render splat depth from the same camera poses ODM used; compare to ODM's mesh depth (RMSE or a sampled-point Chamfer distance) | no threshold found in the literature for this exact comparison; treat as a strong secondary signal, not a hard gate, until baselined | Not verified — mentioned in the ADR/issue as a candidate, not something I found used in production |
| Visual regression | rendered novel views vs. the original photographs at nearby poses, structural diff | qualitative in most pipelines I found; no numeric bar | Not verified |

Practical recommendation: run the gate as an ensemble, log all metrics for every delivery
regardless of pass/fail, and only tighten numeric thresholds once a few dozen human-reviewed
splats give you a real pass/fail distribution for *this* camera, altitude, and site type.
Nothing found in research literature or open-source pipelines substitutes for that
calibration step.

---

## 1. Automatic cropping to the site polygon

**`ns-export gaussian-splat` supports headless cropping to an oriented bounding box today.**
Confirmed by reading `nerfstudio/scripts/exporter.py` in the 1.1.5 wheel directly (not just
docs): `ExportGaussianSplat` takes `--obb-center`, `--obb-rotation` (RPY radians), and
`--obb-scale` as CLI dataclass fields; at export time it builds an `OrientedBox` and masks
gaussian positions with `crop_obb.within(positions)` before writing the PLY — a hard
include/exclude, no feathering. This is a *box*, not an arbitrary polygon, so a
non-rectangular site boundary needs a bounding box loose enough to contain it, followed by a
second, polygon-exact cull. There is a known bug report that `--obb-rotation` sometimes
doesn't visibly rotate the crop in some downstream viewers ([nerfstudio-project/nerfstudio
#3267](https://github.com/nerfstudio-project/nerfstudio/issues/3267)) — worth a smoke test
before relying on it. nerfstudio is Apache 2.0 (confirmed from the package metadata).

**PlayCanvas's `splat-transform` CLI** ([github.com/playcanvas/splat-transform](https://github.com/playcanvas/splat-transform),
MIT license, confirmed by reading `LICENSE` directly) is a standalone Node CLI/library for
post-hoc splat editing, independent of nerfstudio. Cropping-relevant flags: `-B/--filter-box
<x,y,z,X,Y,Z>` (axis-aligned box), `-S/--filter-sphere <x,y,z,radius>`, `-V/--filter-value
<name,cmp,value>` (arbitrary attribute threshold — usable for opacity/scale pruning too),
`-N/--filter-nan`, plus `-t/-r/-s` for translate/rotate/scale of the whole splat. Like
`ns-export`, its geometric filters are box/sphere primitives, not polygons. SuperSplat's
browser-based "Convert" tool is a front end to the same library. ([README](https://github.com/playcanvas/splat-transform/blob/main/README.md),
[blog announcement](https://blog.playcanvas.com/introducing-splat-transform-cli-tool/))

**Coordinate transform, geographic polygon → splat space.** Nerfstudio does not store
geographic coordinates internally — it works in a scene-local frame. To carry a real-world
site polygon into it: nerfstudio records `applied_transform`/`applied_scale` in
`transforms.json` (documented behavior: this converts COLMAP/ODM's raw camera-pose
coordinates into nerfstudio's convention) and a further recentering/scale factor in
`dataparser_transforms.json` written after training, needed to "reverse-transform your
exports back to real-world coordinates" ([nerfstudio dataparser source](https://docs.nerf.studio/_modules/nerfstudio/data/dataparsers/nerfstudio_dataparser.html);
practical writeup: [aerocartwright.com georeferenced NeRF tutorial](https://aerocartwright.com/library/georeferenced-nerf-tutorial/)).
Composing (a) the known geographic→ODM-local transform from the photogrammetry solve/GCPs
with (b) `applied_transform`/`applied_scale` and (c) `dataparser_transforms.json` gives the
matrix from the polygon into model space. **No off-the-shelf tool does this composition or
exact-polygon cropping for you** — it is a straightforward but custom script (matrix compose
+ `shapely` point-in-polygon + z-range clip on gaussian centers), layered on top of either
`ns-export`'s OBB machinery or `splat-transform`'s `--filter-value`.

## 2. Automatic floater removal (post- or during-training)

Concrete implementations found:

- **Statistical Outlier Removal (SOR)** on gaussian centers — a k-D tree k-NN distance
  method borrowed straight from point-cloud processing (Open3D implements this as a
  standard, headless, permissively-licensed function; used explicitly for splat cleanup per
  [3dgsviewers.com](https://www.3dgsviewers.com/blog/remove-floaters-outliers) and
  [Polyvia3D's writeup](https://www.polyvia3d.com/splat-cleanup)). Runs headlessly on a
  `.ply`, no training-time changes needed.
- **Opacity/scale thresholding** — drop gaussians below an opacity cutoff or above a huge
  relative-scale ratio; same sources describe this as complementary to SOR. This is exactly
  what splatfacto already does at *training* time via `cull_alpha_thresh` /
  `cull_scale_thresh` (Q3) — post-hoc thresholding is the same idea applied again after the
  fact, useful if you want a stricter cutoff for delivery than for training stability.
- **Clean-GS** ([github.com/smlab-niser/clean-gs](https://github.com/smlab-niser/clean-gs),
  **MIT license**) — semantic floater/background removal using as few as 3 segmentation
  masks (~1% of training views): projects gaussians onto masked "whitelist" regions,
  validates with depth-buffered color checks, then does k-NN outlier removal. Runs as a
  headless Python CLI script (input point cloud + mask directory + output path — no GUI).
  This is the closest thing found to a general-purpose, license-clean, headless floater
  remover, but it needs a handful of per-view masks — for this use case, an automatic sky/
  off-site segmenter (e.g., zero-shot SAM-family models) would need to supply those masks;
  I did not find that combination already built and verified for drone/construction
  imagery.
- **absGS / "floater-free-gaussian-splatting"** ([github.com/ingra14m/floater-free-gaussian-splatting](https://github.com/ingra14m/floater-free-gaussian-splatting))
  is training-time, not post-hoc (see Q3) — listed here because it's commonly cited
  alongside post-hoc tools; licence not fully confirmed (has a `LICENSE.md` but this is an
  unofficial fork of the Inria codebase, so it likely inherits the Inria non-commercial
  terms — treat as unusable for a paid-deliverable business until the license file is read
  directly and says otherwise).

Not license-safe: results that are direct derivatives of the original
`graphdeco-inria/gaussian-splatting` codebase generally carry Inria's research-only license
(see Q4) — Clean-GS and Open3D SOR avoid this because they operate on the exported `.ply`
independent of that codebase.

## 3. Prevention during training (splatfacto / gsplat 1.4.0 in nerfstudio 1.1.5)

Confirmed directly from `nerfstudio/models/splatfacto.py` in the 1.1.5 wheel:

- `cull_alpha_thresh` (default 0.1) — opacity culling threshold; the in-code comment says
  "one can set it to a lower value (e.g. 0.005) for higher quality," i.e. keep more
  low-opacity gaussians at the cost of more potential floaters, or raise it to cull harder.
- `cull_scale_thresh` (default 0.5) — culls oversized gaussians (a common floater/spike
  signature).
- `densify_grad_thresh` (default 0.0008), `use_absgrad` (default `True`) — controls how
  aggressively new gaussians are spawned; using absolute-value gradient (`absGS`-style) is
  already the nerfstudio default, not an opt-in extra.
- `use_scale_regularization` (default **`False`**) — a PhysGaussian-derived penalty against
  "huge spikey gaussians" (`max_gauss_ratio`, default 10.0). **Off by default** — turning it
  on is a candidate lever this pipeline isn't using yet.
- `stop_split_at` (default 15,000) and `reset_alpha_every` — govern how long densification
  runs; a community-documented tactic is lowering the alpha-cull threshold and disabling
  culling after step 15k for extra quality ([nerfstudio discussion #3563](https://github.com/nerfstudio-project/nerfstudio/discussions/3563)),
  though that specific `continue_cull_post_densification` flag has since been removed from
  the codebase in a refactor ([PR #3376](https://github.com/nerfstudio-project/nerfstudio/pull/3376)) — don't assume it still exists in 1.1.5 without checking.
- `rasterize_mode`: `"classic"` (default) vs `"antialiased"` — antialiased applies the
  Mip-Splatting view-dependent opacity compensation, reducing aliasing-driven floaters on
  out-of-distribution views, at a cost: it "might slightly hurt the metrics on
  in-distribution views" and known community reports show small/thin gaussians (bicycle
  spokes, foliage) can disappear ([gsplat #840](https://github.com/nerfstudio-project/gsplat/issues/840)).
  PLY exported in antialiased mode is not classic-mode-viewer-compatible — check the
  delivery viewer supports it before switching.
- **Strategy**: `splatfacto.py` imports and hardcodes `gsplat.strategy.DefaultStrategy`
  (source, line `from gsplat.strategy import DefaultStrategy`) — **the MCMC densification
  strategy (3DGS-as-MCMC) is not wired into nerfstudio 1.1.5's splatfacto model**, even
  though gsplat 1.4.0 ships `gsplat.strategy.mcmc.MCMCStrategy` as a library class under
  gsplat's own Apache 2.0 license ([docs.gsplat.studio MCMC module](https://docs.gsplat.studio/main/_modules/gsplat/strategy/mcmc.html)).
  Using it means either patching `splatfacto.py` to swap strategies, or moving off
  nerfstudio's model wrapper straight to gsplat's own trainer. The MCMC approach (paper:
  [3D Gaussian Splatting as Markov Chain Monte Carlo, arXiv:2404.09591](https://arxiv.org/abs/2404.09591))
  removes densify/prune heuristics in favor of deterministic relocation of low-opacity
  ("dead") gaussians, which by construction reduces stray floaters — but note the *paper's
  own reference implementation*, [ubc-vision/3dgs-mcmc](https://github.com/ubc-vision/3dgs-mcmc/blob/main/LICENSE.md),
  is under a research-only license (it forks the Inria codebase); gsplat's independent
  reimplementation of the strategy is the commercially-usable path.
- **Background/masking**: no dedicated "mask out the sky/background" option in the
  splatfacto model itself, but nerfstudio's data pipeline supports per-frame `mask_path` in
  `transforms.json` generally (confirmed in `nerfstudio_dataparser.py`) — masked pixels are
  excluded from the photometric loss. This is infrastructure already present, not something
  built for this use case; generating the masks (e.g., segmenting sky/off-site regions per
  frame) is the missing piece, and I found no evidence this is commonly done for
  splatfacto specifically (most sky-masking work cited below is on other codebases).

Cost summary: `cull_alpha_thresh`/`cull_scale_thresh`/`use_scale_regularization` are close
to free (small quality trade at worst, per the in-code documentation); antialiasing trades a
small metric hit for fewer edge artifacts and has a compatibility cost; switching strategy to
MCMC is a real engineering cost (patching a hardcoded import) with an unquantified quality
trade-off not measured on this pipeline's real stills.

## 4. Newer methods (2025–2026) for clean aerial/drone splats

- **DroneSplat** (CVPR 2025) — targets "in-the-wild" drone imagery robustness via stereo
  priors and visibility prediction to handle dynamic distractors; two repos exist
  ([BITyia/DroneSplat](https://github.com/BITyia/DroneSplat), [PanoptiqAI/DroneSplat](https://github.com/PanoptiqAI/DroneSplat))
  and I could not confirm either's license from search results — **check the LICENSE file
  directly before use**; paper: [arXiv:2503.16964](https://arxiv.org/pdf/2503.16964).
- **Horizon-GS** (CVPR 2025, [InternRobotics/HorizonGS](https://github.com/InternRobotics/HorizonGS))
  — unified aerial-to-ground large-scale splatting. The repo explicitly says to follow the
  license of the original 3D-GS project, i.e. **Inria's non-commercial license — unusable
  for this business's paid deliverables.**
  ([arXiv:2412.01745](https://arxiv.org/pdf/2412.01745))
- **GaRe** (2025) — relightable outdoor splatting that explicitly extracts sky masks via
  Depth Anything V2 as a preprocessing step for outdoor/unconstrained photo collections
  ([arXiv:2507.20512](https://arxiv.org/pdf/2507.20512)) — relevant technique (automatic
  sky segmentation via an off-the-shelf depth model) even if the full relighting pipeline is
  more than this business needs. License not checked.
- Broader survey: **Awesome-3DGS-Applications** ([heshuting555/Awesome-3DGS-Applications](https://github.com/heshuting555/Awesome-3DGS-Applications),
  TPAMI 2026) catalogs segmentation/editing/cleanup methods — useful as a index to check
  before committing to any one paper's code, but is a list, not itself a tool.

**Licensing pattern to watch for**: any repo built directly on `graphdeco-inria/gaussian-splatting`'s
CUDA rasterizer/training loop inherits its non-commercial research license (confirmed by
reading [graphdeco-inria/gaussian-splatting LICENSE.md](https://github.com/graphdeco-inria/gaussian-splatting/blob/main/LICENSE.md):
"used non-commercially, i.e., for research and/or evaluation purposes only... prior and
explicit consent of licensors" required for commercial use). Since this business already
runs on nerfstudio/gsplat (Apache 2.0, an independent reimplementation, not a fork of the
Inria code), the safe rule is: **prefer methods built on gsplat/nerfstudio, or post-hoc
scripts that only touch the exported `.ply`, over anything that says "based on the official
3DGS repo."**

## 5. The automated quality gate — see table above

Repeated here for emphasis: I found no published, production-validated threshold set for
"ship this splat without a human." What exists is (a) generic PSNR/SSIM/LPIPS conventions
from the broader 3DGS research literature, evaluated on held-out training views, and (b)
scattered per-paper geometric accuracy comparisons against LiDAR/mesh ground truth using
Chamfer distance, none of which target aerial construction sites or this camera. The
depth-vs-ODM-mesh comparison and gaussians-outside-boundary fraction are reasonable signals
this business already has the ingredients for (ODM mesh, known site polygon), but they are
recommendations, not confirmed industry practice.

## 6. What still needs a human, and what retires it

- **Tuning the gate's own thresholds.** Until there's a corpus of this business's own
  Captures with known-good/known-bad outcomes, the numeric thresholds above are guesses.
  Retire this by logging every metric on every delivery from day one and recalibrating after
  the first few dozen human-reviewed splats — a data problem, not an engineering one.
- **Anything the gate flags as failed**, by design (ADR 0015: humans by exception). This
  is not debt — it's the intended shape of the system.
- **Supplying segmentation masks for semantic floater/sky removal** (Clean-GS-style, or
  masking sky before training). I found no evidence this is already automated end-to-end
  for drone/construction footage; a zero-shot segmenter could plausibly close this gap, but
  it needs prototyping and its own quality check, not an off-the-shelf answer.
- **Trusting the upstream photogrammetry solve.** No splat-side gate catches a systematically
  wrong GCP registration; that has to be checked against ODM's own solve-quality report
  before splat training even starts (step 1 of the pipeline above), which is not a new human
  step — ODM already produces this report — but it's not currently wired into an automated
  gate either.

## What I could not verify

- A production-grade, published quality-gate threshold set for aerial/construction Gaussian
  splats specifically — not found; the table above is an informed starting point, not a
  cited standard.
- The exact license of the `absGS`/`floater-free-gaussian-splatting` repo and of both
  `DroneSplat` mirrors — each has a license file present but its terms weren't retrievable
  through search; read the file directly before depending on either.
- Whether `--obb-rotation` in `ns-export gaussian-splat` actually works correctly end-to-end
  in the current release — a GitHub issue reports it not visibly applying in at least one
  downstream viewer ([#3267](https://github.com/nerfstudio-project/nerfstudio/issues/3267));
  worth a direct smoke test on real output before relying on rotated OBBs for cropping.
- Whether depth-consistency-against-ODM-mesh is used by anyone in production as a splat
  quality gate — not found; it's a sound idea given what this business already has, not a
  confirmed practice.
