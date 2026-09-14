# Full quality on the 4070 host: techniques, a test dataset, and an experiment plan — 2026-09-14

Research for issue #40. Nothing in this document was run on the Linux host; it
is desk research over official documentation, source code, papers, issue
trackers and forums, plus arithmetic on the measurements already recorded in
this repo. It is written so the host agents can pick experiments off the end of
it and run them.

**How numbers are marked.** Every number is tagged either **[sourced]** with a
link, **[measured here]** when it comes from an earlier run recorded in this
repo (with the file named), **[code]** when it was read directly from a
project's source, or **[estimate]** when it is my own arithmetic or judgement.
Estimates are there to rank experiments, not to make placement decisions.

The hardware being planned for: RTX 4070 SUPER with 12,282 MiB total, of which
about 1,500 MiB is held permanently by the production chat worker, so roughly
10.5 GB is usable **[measured here, `4070-placement-thresholds-2026-09-13.md`]**;
62 GB of RAM with about 18 GB used by production services, so roughly 40 GB
usable; 28 threads; about 38 GB of scratch disk. The Capture is DJI Mini 5 Pro
stills at 8192×6144 (50.3 MP) **[measured here, `splat-first-runs-2026-09-10.md`]**,
hundreds per Site, nadir plus some oblique.

---

## 0. The five findings that change the plan

1. **OpenSplat decodes every training image to 32-bit float in system RAM, all
   at once, before training starts [code].** `Camera::loadImage` is called for
   every camera in a `parallel_for` at startup
   ([opensplat.cpp](https://github.com/pierotofy/OpenSplat/blob/main/opensplat.cpp),
   line 143), and `imageToTensor` stores the image as `kFloat32`
   ([cv_utils.cpp](https://github.com/pierotofy/OpenSplat/blob/main/cv_utils.cpp),
   line 32). That is 12 bytes per pixel. One 50.3 MP still is therefore about
   600 MB in RAM, and 300 of them are about 180 GB **[estimate, arithmetic from
   the code]**. **Unmodified OpenSplat cannot load a full-resolution Site on
   this host at all**, independent of the GPU. This is almost certainly the
   "killed by running out of ordinary system memory" failure the 2026-09-12
   research mentioned.

2. **OpenSplat's GPU image cache takes up to half of the card's free memory,
   and that probably explains the bellus out-of-memory failure [code +
   estimate].** The cache budget is `freeB / 2` at first use
   ([input_data.cpp](https://github.com/pierotofy/OpenSplat/blob/main/input_data.cpp),
   `gpuCacheBudget`, lines 170–192), and cached images are float32. On bellus
   (122 images × 12.3 MP × 12 bytes ≈ 18 GB of image data) the cache fills to
   its budget of roughly 5 GB, leaving roughly 5 GB for training; the recorded
   failure was a 914 MiB allocation with 9.48 GiB already in use
   **[measured here]**. The three-resolution table in
   `opensplat-first-run-2026-09-12.md` also fits this: at 1920×1080 the whole
   image set is about 4.5 GB and fits in the cache, at 960×540 about 1.1 GB
   **[estimate]**. The one measurement that seems to contradict it (turning the
   cache off saved only 137 MiB on the 8.3 MP video) is most likely an artefact
   of reading `nvidia-smi`, which reports what PyTorch's caching allocator has
   *reserved*, not what the run *needs*. That is itself a methodology problem
   for every VRAM number in this repo — see section 4.0.

3. **ODM's "ultra" is not full resolution for 50 MP images, and neither are
   ODM's defaults for the orthophoto [code].** For images above 42 MP, ODM
   halves both scales: feature extraction at `ultra` runs at 4,096 px on the
   long side (`feature_quality_scale['ultra'] = 1`, multiplied by 0.5, capped at
   4,480) ([opendm/osfm.py](https://github.com/OpenDroneMap/ODM/blob/master/opendm/osfm.py),
   lines 205–231), and depth maps at `pc-quality ultra` are 8192 × 0.5 × 0.5 =
   **2,048 px** on the long side
   ([opendm/utils.py](https://github.com/OpenDroneMap/ODM/blob/master/opendm/utils.py),
   `get_depthmap_resolution`). Separately, the undistorted images used for
   texturing the orthophoto are downscaled in powers of two unless
   `--orthophoto-resolution` is at or below the estimated GSD
   ([opendm/gsd.py](https://github.com/OpenDroneMap/ODM/blob/master/opendm/gsd.py),
   `image_scale_factor`). With the default 5 cm and a GSD around 1–2 cm, the
   texture source images are cut to half or a quarter **[code + estimate]**.
   "Full original quality" in ODM therefore means: `--feature-quality ultra
   --pc-quality ultra --orthophoto-resolution` set to the real GSD (so the
   texture images stay at 8,192 px). Going beyond ODM's 2,048 px depth maps
   requires running OpenMVS directly, and section 1 shows disk, not VRAM, is
   what stops that.

4. **For splats at 50 MP, per-pixel memory, not Gaussian count, is the first
   wall, and the full-quality fix is to render each training image in pieces
   rather than to shrink it [estimate, supported by sources].** gsplat's
   profiling shows the Gaussian side can be made very small
   ([gsplat profiling](https://docs.gsplat.studio/main/tests/profile.html):
   packed mode plus sparse gradients held a 107 M Gaussian scene in 2.31 GB
   **[sourced]**), while per-pixel buffers (rendered colours, alphas, the loss
   and its gradients) grow linearly with pixels
   ([Grendel paper](https://arxiv.org/html/2406.18533v1) **[sourced]**). A
   50 MP frame needs several GB of per-pixel buffers **[estimate, section
   1.2]**. Two ways around it keep full resolution: random crops at full
   resolution (gsplat's `--patch_size`, marked experimental) and tiled
   rendering with gradient accumulation, which is mathematically the same loss
   as the whole image (GS-Scale ships a "split mode" that "does not affect
   training quality" [sourced, [GS-Scale README](https://github.com/SNU-ARC/GS-Scale)]).

5. **There is a public, downloadable 45 MP drone dataset that fits the disk:
   Esri's Trakai Island Castle, 360 DJI Zenmuse P1 images, 4.94 GB, GPS in
   EXIF [sourced].** Details in section 3. There is also a CC BY 4.0 dataset
   shot on the operator's exact aircraft (DJI Mini 5 Pro), but at the
   12 MP binned readout rather than 50 MP.

---

## 1. Where each resource binds, step by step

### 1.1 Reconstruction (ODM / OpenMVS)

| Step | Binding resource | How it scales | Evidence |
|---|---|---|---|
| Image loading, EXIF | Disk I/O, trivial | Linear in images | — |
| Feature extraction (OpenSfM, DSP-SIFT default) | CPU; RAM about 1 GB per thread at high resolution | Linear in images; per image roughly linear in the pixels of the feature image (4,096 px for 50 MP at ultra) | ODM docs: "Peak memory requirement is ~1GB per thread and 2 megapixel image resolution" for `--max-concurrency` **[sourced, [ODM options](https://docs.opendronemap.org/arguments/)]**; the 4,096 px cap **[code]** |
| GPU feature extraction (PopSift, only if `--feature-type sift`) | VRAM, but bounded by the 4,480 px cap; ODM checks `fits_texture` and falls back to CPU if not | Per image | **[code, [opendm/gpu.py](https://github.com/OpenDroneMap/ODM/blob/master/opendm/gpu.py)]**; the default DSP-SIFT never uses the GPU **[code]** |
| Matching (FLANN, GPS neighbours) | CPU; RAM moderate | Pairs ≈ images × neighbours (with GPS), so roughly linear | **[code]** |
| SfM, bundle adjustment (Ceres) | CPU and RAM | Grows with tracks × observations; for a few hundred images a few GB **[estimate]** | Community: 550 × 20 MP at ultra used about half of 32 GB during dense reconstruction, not SfM **[sourced, [ODM forum](https://community.opendronemap.org/t/estimating-memory-requirements-out-of-memory-with-ultra-settings/9376)]** |
| Undistortion | Disk (TIFF at `undist_image_max_size`) | Linear in images × pixels. At 8,192 px, uncompressed RGB TIFF is about 150 MB per image, 300 images ≈ 45 GB **[estimate]** | `undistorted_image_format: tif` **[code, osfm.py]** |
| Dense MVS depth maps (OpenMVS PatchMatch, CUDA in the GPU image) | GPU speed, VRAM per image; **disk** for depth-map files; RAM during fusion | Per image; each depth map ∝ depth-map pixels. OpenMVS CUDA uses 8 neighbour views by default | `nNumViewsDefault(8)` with CUDA **[code, [DensifyPointCloud.cpp](https://github.com/cdcseacave/openMVS/blob/master/apps/DensifyPointCloud/DensifyPointCloud.cpp)]**; ~10× faster than CPU **[sourced, [ODM blog](https://opendronemap.org/2021/11/gpu-point-cloud-densification-lands-in-odm-and-its-fast/)]** |
| Depth-map fusion and filtering | **RAM** (all depth maps plus the growing cloud) | Roughly linear in total depth-map pixels | ODM retries with `--fusion-mode 1` and `--sub-scene-area 660000` on exit code 137/143 **[code, [stages/openmvs.py](https://github.com/OpenDroneMap/ODM/blob/master/stages/openmvs.py)]**; a level-0 run on huge images failed on 192 and 264 GB machines **[sourced, [openMVS #743](https://github.com/cdcseacave/openMVS/issues/743)]** |
| Point cloud post-processing (PDAL filter, EPT when via NodeODM) | RAM | Linear in points | NodeODM path used 15.7 GiB vs 4.15 GiB for the bare CLI on bellus **[measured here]** |
| Meshing (Poisson, octree 11 default, 2.5D for orthophoto) | CPU, RAM | ∝ points and octree depth | **[code, odm_meshing.py]** |
| Texturing (mvs-texturing) | **RAM** | Grows with number of views × view resolution; "over 32 GB" reported; ODM raises max texture size ×3 for images over 8,000 px | **[sourced, [ODM forum](https://community.opendronemap.org/t/how-to-reduce-memory-usage-during-texturing/23358)]**; **[code, stages/mvstex.py]**; a scalable replacement was still unmerged as of ODM 3.6.2 **[sourced, [ODM forum](https://community.opendronemap.org/t/adding-scalable-texturing-to-openmvs-and-removing-a-memory-bottleneck/25571), [ODM releases](https://github.com/OpenDroneMap/ODM/releases)]** |
| Orthophoto rendering | **RAM** | ∝ orthophoto pixels (area ÷ resolution²) | "Couldn't allocate enough memory to render the orthophoto" at 165k × 165k px **[sourced, [ODM #1020](https://github.com/OpenDroneMap/ODM/issues/1020)]** |

**The disk problem with full-resolution depth maps.** An OpenMVS `.dmap`
stores depth, normal, confidence and view indices per pixel. The one public
data point is a 700 MB image producing a 5 GB `.dmap` **[sourced,
[openMVS #743](https://github.com/cdcseacave/openMVS/issues/743)]**, which
works out to roughly 20–25 bytes per pixel if the 700 MB was uncompressed RGB
**[estimate]**. On that basis:

| Depth-map long side | Pixels | Per `.dmap` | 300 images |
|---|---|---|---|
| 2,048 px (ODM ultra at 50 MP) | 3.1 MP | ≈ 70 MB | ≈ 21 GB |
| 4,096 px (OpenMVS `--resolution-level 1`) | 12.6 MP | ≈ 300 MB | ≈ 90 GB |
| 8,192 px (level 0, native) | 50.3 MP | ≈ 1.2 GB | ≈ 360 GB |

All three rows are **[estimate]** and the first host experiment on MVS must
measure the real `.dmap` size. If they hold, native-resolution depth maps are
impossible on 38 GB of disk without a sub-scene pipeline that fuses and deletes
as it goes, and even ODM's own ultra is tight next to the undistorted TIFFs.

### 1.2 Gaussian Splat Fitting

| Step | Binding resource | How it scales | Evidence |
|---|---|---|---|
| Data loading | **RAM** if images are pre-decoded (OpenSplat: 12 B/px float32, all images); CPU decode time if lazy | OpenSplat: images × pixels × 12 bytes. gsplat's example trainer: lazy, decodes per step with 4 workers | **[code]** for both ([gsplat simple_trainer.py](https://github.com/nerfstudio-project/gsplat/blob/main/examples/simple_trainer.py), `DataLoader(num_workers=4)`; `Dataset.__getitem__` reads from disk) |
| GPU image cache | VRAM | OpenSplat: up to half of free VRAM | **[code]** |
| Projection and tile intersection | VRAM ∝ visible Gaussians × tiles each covers | A Gaussian of fixed world size covers 4× the tiles when resolution doubles, so intersections grow with pixel count | splatfacto died in `isect_tiles` allocating 778 MB **[measured here, splat-first-runs]** |
| Rasterisation forward and backward | **VRAM per pixel** | Linear in rendered pixels per step | Grendel: per-pixel memory "linear in the number of pixels" and can be cut by "rendering tiles instead of the whole image" **[sourced, [arXiv 2406.18533](https://arxiv.org/html/2406.18533v1)]** |
| Loss (L1 + SSIM) and its gradient | VRAM per pixel | Linear in pixels; fused SSIM kernels are the cheap option | gsplat's trainer uses `fused_ssim` **[code]**; LichtFeld Studio rewrote fused L1+SSIM to reach 8K training **[sourced, [LFS PR #1164](https://github.com/MrNeRF/LichtFeld-Studio/pull/1164)]** |
| Densification | VRAM spikes (new Gaussians plus optimizer rows) | Transient; the peak arrives mid-run | Peak at 47–66% of the run **[measured here, opensplat-first-run]** |
| Parameters, gradients, Adam state | VRAM ∝ Gaussians | 59 floats per Gaussian at SH degree 3 [sourced, [GS-Scale paper](https://arxiv.org/abs/2509.15645)], so about 236 B parameters + 236 B gradients + 472 B Adam ≈ **0.9 KB per Gaussian**, 5 M Gaussians ≈ 4.4 GiB **[estimate]** | Parameters, gradients and optimizer state are about 90% of GPU memory in large 1K–4K scenes **[sourced, GS-Scale fig. 3b]** |
| Evaluation | VRAM per pixel, plus LPIPS network activations | A full 50 MP LPIPS pass is very large | splatfacto's first failure was the evaluation pass **[measured here]** |

**What a 50 MP training step needs, roughly.** Per rendered pixel, gsplat keeps
colours (12 B), alpha (4 B), last contributor id (4 B), plus the ground-truth
image as float (12 B), the gradients of colours and alpha (16 B), and the loss
intermediates (fused SSIM keeps a few 3-channel maps, call it 40–80 B)
**[estimate, from reading the kernels' saved tensors]**. That is 90–130 B per
pixel, or **4.5–6.5 GB for one 50.3 MP frame**, before any Gaussians
**[estimate]**. With about 10.5 GB usable, a whole-frame step leaves roughly
4–6 GB for Gaussians, i.e. about 4–6 M Gaussians at SH degree 3 **[estimate]**.
A 4,096 × 4,096 crop or tile (16.8 MP) cuts the per-pixel part to roughly a
third; a 2,048 × 2,048 tile to about a twelfth **[estimate]**. These estimates
are exactly what experiment G2 measures directly with
`torch.cuda.max_memory_allocated`.

---

## 2. Techniques that cut peak memory without cutting quality

Quality effects are marked "none by construction" only where the method is
mathematically equivalent. Licence matters here: ADR 0003 allows only
permissively licensed splat engines in the pipeline, so each row says which
side of that line it falls on.

### 2.1 ODM / OpenMVS

| Technique | Peak saving | Quality effect | Speed cost | Maturity / Docker CUDA 12 |
|---|---|---|---|---|
| **`opendronemap/odm:3.6.2-gpu`** (OpenMVS CUDA depth maps; PopSift only for `--feature-type sift`) | Not a memory saving; moves depth maps to the GPU | Different PatchMatch implementation from CPU; ODM falls back to CPU on GPU failure (exit code 1) **[code]**. An open issue discusses possible CUDA artefacts **[sourced, [openMVS #708](https://github.com/cdcseacave/openMVS/issues/708)]** | About 10× faster densification **[sourced, ODM blog]** | Released; image is 3.1 GB, built on `nvidia/cuda:12.9.1-runtime-ubuntu24.04` **[sourced, [Docker Hub](https://hub.docker.com/r/opendronemap/odm/tags), [gpu.Dockerfile @ v3.6.2](https://github.com/OpenDroneMap/ODM/blob/v3.6.2/gpu.Dockerfile)]**. Host driver must support CUDA 12.9 user space — check `nvidia-smi` first |
| **`--orthophoto-resolution` at the GSD** (not a saving; a correctness fix) | Uses more RAM and disk, not less | Keeps texture source images at native 8,192 px; otherwise halved or quartered **[code]** | Slower texturing | Stable |
| **`--max-concurrency`** lower (e.g. 8 instead of 28) | RAM ∝ threads in feature extraction, depth maps (CPU path), texturing: about 1 GB per thread at 2 MP per the docs **[sourced]** | None | Roughly proportional slowdown in the parallel stages **[estimate]** | Stable |
| **Split-merge locally** (`--split N --split-overlap M`) | Peak RAM ∝ submodel size instead of Site size; submodels run sequentially on one machine **[sourced, [ODM large datasets](https://docs.opendronemap.org/large/)]** | Orthophoto, DEM and point cloud are merged; **textured meshes are not merged** **[sourced]**; each submodel needs its own GCPs if GCPs are used **[sourced]**; seams possible at cutlines **[estimate]**. Failures reported combining split with ultra/high **[sourced, [ODM forum](https://community.opendronemap.org/t/split-merge-fails/23136)]** | Extra alignment and merge time; per-submodel overhead | Stable but fussy; community advice is 100–200 images per submodel **[sourced, ODM forum thread above]** |
| **OpenMVS sub-scenes** (`--fusion-mode 1` then `--sub-scene-area`) | Fusion RAM bounded per sub-scene | ODM's automatic OOM retry disables geometric iterations in sub-scene fusion (`Estimation Geometric Iters = 0`) **[code]**, which is a quality change | Some | Automatic in ODM on OOM |
| **`--optimize-disk-space`** | Deletes depth maps and heavy intermediates after use | None | Cannot restart mid-pipeline | Stable |
| **Direct OpenMVS at `--resolution-level 1` or `0`** | Higher VRAM per depth map, far more disk | Finer DSM; unclear benefit to the orthophoto, whose sharpness comes from texture images, not cloud density **[estimate]** | 4× or 16× the depth-map work | Needs custom invocation outside ODM; disk is the blocker (section 1.1) |
| **Swap on fast disk** | Converts OOM kills into slow runs | None | Can be very slow | Needs sudo on the host (available per memory notes); competes for the tight disk |
| **NodeODM extras off** (`pc-ept`, `cog`, `gltf` are added by NodeODM) | NodeODM used ~3.8× the RAM of the bare CLI on bellus **[measured here]** | These are delivery formats, not quality | Faster | Which of the three costs the RAM is not yet isolated |

**What commercial tools do, for context.** Metashape defines "Ultra High" depth
maps as the original photos, with each lower level halving both sides
**[sourced, [Metashape manual](https://www.agisoft.com/pdf/metashape_2_1_en.pdf)]**.
RealityScan's High Detail mode runs at full resolution and its meshing,
colouring and texturing are "fully out-of-core" with 16 GB RAM "typically
sufficient for processing thousands of high-resolution images"
**[sourced, [RealityScan requirements](https://dev.epicgames.com/documentation/realityscan/hardware-and-software-requirements?lang=en-US)]**;
it needs only 1 GB of VRAM minimum because depth maps are computed per image
**[sourced]**. It is Windows-only, so it is context, not a candidate. The lesson
from both: full resolution is achieved by processing one image (or one part) at
a time and streaming to disk, not by having a large GPU.

### 2.2 Meshroom / AliceVision

AliceVision's `DepthMap` node processes each image in tiles of
`tileBufferWidth × tileBufferHeight` (1,024 × 1,024 default) with
`tilePadding` 64, selecting up to `maxTCams` 10 neighbour cameras per tile, and
defaults to `downscale 2` **[code, [DepthMap.py](https://github.com/alicevision/AliceVision/blob/develop/meshroom/aliceVision/DepthMap.py)]**.
Because the GPU buffers are per tile, VRAM is bounded regardless of image size;
a log from a 720p run shows 852 MB of buffers per tile (757 MB SGM, 94 MB
refine) **[sourced, [Meshroom #2225](https://github.com/alicevision/Meshroom/issues/2225)]**.
Setting `downscale 1` is full resolution at the cost of 4× the tiles and time
**[estimate]**. The official Docker image is
`alicevision/meshroom:2025.1.0-av3.3.0-ubuntu22.04-cuda12.1.1` and is 16.4 GB
**[sourced, [Docker Hub](https://hub.docker.com/r/alicevision/meshroom/tags)]**,
which is a real problem on 38 GB of disk. Meshroom is also a second
reconstruction toolchain that would not share ODM's georeferencing and
orthophoto path. Worth one small measurement of VRAM and time per image at
`downscale 1` as a comparison point for OpenMVS, not as a replacement.

### 2.3 COLMAP

- GPU feature extraction defaults to a 3,200 px `max_image_size`; to reduce GPU
  memory COLMAP's FAQ says to lower `max_image_size` or `max_num_features`, or
  run on CPU **[sourced, [COLMAP FAQ](https://colmap.github.io/faq.html)]**.
  Full quality means raising it, at the cost of VRAM.
- Matching memory is about `4 × num_matches² + 4 × num_matches × 256` bytes;
  10,000 matches is about 400 MB **[sourced, COLMAP FAQ]**.
- PatchMatch stereo memory is controlled by `max_image_size`, the number of
  source images (`__auto__, 30` to `__auto__, 10` in `patch-match.cfg`), and
  `geom_consistency`; RAM by `cache_size` **[sourced, COLMAP FAQ]**.
- On an RTX 4090 with 8,000 × 6,000 images, `patch_match_stereo` crashed with an
  illegal memory access and worked at `max_image_size 7700` **[sourced,
  [COLMAP #3207](https://github.com/colmap/colmap/issues/3207)]** — a bug, not
  a VRAM limit, but it is a warning for 8,192 px images.
- COLMAP's role here is as a pose converter and undistorter for splat trainers
  (OpenSfM exports COLMAP with `brown` mapped to `FULL_OPENCV` **[code,
  [export_colmap.py](https://github.com/mapillary/OpenSfM/blob/main/opensfm/actions/export_colmap.py)]**,
  which gsplat's parser does not list, so run `colmap image_undistorter` to get
  PINHOLE images). Image `colmap/colmap:latest`, updated 2026-09-07
  **[sourced, Docker Hub]**.

### 2.4 Gaussian Splatting

Baseline for scale: gsplat on Mip-NeRF 360 (images at a quarter resolution)
uses 5.7 GB for 30k steps against 9.0 GB for the Inria code at identical
PSNR 28.95 **[sourced, [gsplat eval](https://docs.gsplat.studio/main/tests/eval.html)]**.

| Technique | VRAM saving | Quality effect | Speed cost | Maturity, licence, Docker |
|---|---|---|---|---|
| **Tiled rendering with gradient accumulation** (render the full image in K tiles, backward each, one optimizer step) | Per-pixel buffers ÷ K **[estimate]** | **None by construction** for L1; SSIM identical if tiles overlap by the SSIM window (11 px); densification statistics need care (see note below) | Projection repeated per tile; 10–30% slower **[estimate]** | GS-Scale "split mode … does not affect training quality" **[sourced]**; LichtFeld Studio had a tile mode for its GUT path since v0.4.0 **[sourced, [LFS PR #661](https://github.com/MrNeRF/LichtFeld-Studio/pull/661)]**; in gsplat it is a small patch to the example trainer (K matrix offsets per tile). Apache-2.0 (gsplat), MIT (GS-Scale) |
| **Random full-resolution crops** (gsplat `--patch_size`, "experimental") | Per-pixel buffers ∝ crop area; 2,048² is ~1/12 of a 50 MP frame **[estimate]** | Each step sees part of an image, so SSIM and densification statistics change. An Inria-code user reported crops made densification produce "much more" points **[sourced, [3DGS #834](https://github.com/graphdeco-inria/gaussian-splatting/issues/834)]**. gsplat's default strategy normalises gradients by `info["width"]` which becomes the crop width, so `grow_grad2d` effectively shifts **[code, [strategy/default.py](https://github.com/nerfstudio-project/gsplat/blob/main/gsplat/strategy/default.py) lines 248–249]** | More steps needed to cover the same pixels | In gsplat ≥ 1.4.0 **[code]**; runs in the host's existing `nerfstudio-splat:local` image (gsplat 1.4.0) |
| **Packed mode** (`--packed`) | Large when each view sees a small part of the scene; profiling shows 0.35 GB vs 1.00 GB for Inria at batch 1 **[sourced, [gsplat profiling](https://docs.gsplat.studio/main/tests/profile.html)]** | None (same maths) **[sourced: gsplat docs describe it as a memory layout]** | "slightly slower" **[sourced, gsplat trainer comment]** | Stable, Apache-2.0 |
| **Sparse gradients** (`--sparse_grad`, needs packed) | Gradients for means/quats/scales in COO form; with packed, 107 M Gaussians in 2.31 GB **[sourced]** | Uses SparseAdam, so moments of unseen Gaussians are not decayed; small effect expected **[estimate]** | Some | "Experimental" **[sourced]** |
| **Visible Adam** (`--visible_adam`, from Taming 3DGS) | Little memory; mostly speed | Small **[estimate]** | Faster | Experimental in gsplat, Apache-2.0 **[code]** |
| **MCMC strategy with `cap_max`** | Hard ceiling on Gaussians, so no densification spikes | gsplat's own ablation: MCMC at 3 M Gaussians PSNR 29.65 / LPIPS 0.12 vs default densification 29.00 / 0.14 at 3.2 M, using 4.99 GB vs 5.62 GB **[sourced, gsplat eval]** — better, not worse | 27.6 min vs 19.4 min **[sourced]** | Stable in gsplat and LFS. Its densification does not depend on image-plane gradient thresholds, which makes it the right pairing with crops and tiles **[code + estimate]** |
| **Absgrad** (default strategy with `absgrad=True`) | 4.40 GB vs 5.62 GB, 2.5 M vs 3.2 M Gaussians **[sourced, gsplat eval]** | PSNR 29.11 vs 29.00, LPIPS 0.12 vs 0.14 **[sourced]** | Slightly faster **[sourced]** | Stable |
| **SH degree lower** (3 → 1 or 0) | SH is 48 of 59 parameters per Gaussian **[sourced, GS-Scale]**; degree 1 cuts per-Gaussian memory by about 70% **[estimate]** | Loses view-dependent colour; for mostly diffuse aerial ground surfaces a small loss **[estimate]**. Postshot documents SH storage cost of +64/171/321% for degrees 1/2/3 **[sourced, [Postshot docs](https://www.jawset.com/docs/d/Postshot+User+Guide/Interface/Training+Configuration)]**. **Counts as a quality reduction until measured** | None | Flag in every trainer |
| **fp16 SH evaluation** (gsplat `sh_fp16`) | Small (activations of the SH kernel only; parameters and Adam stay fp32) **[code]** | Unmeasured in gsplat; a separate fp16 rasteriser reported the same 27.68 dB PSNR as fp32 **[sourced, [HiGS](https://arxiv.org/pdf/2606.00352)]** | Faster | New on gsplat main, not in 1.5.3 **[code]** |
| **Quantised Adam state** (LichtFeld Studio v0.5.3) | Adam state is about half of per-Gaussian memory **[estimate]**; LFS gives no number **[sourced, [radiancefields.com](https://radiancefields.com/lichtfeld-studio-v0.5.3-drops-its-cuda-renderer-for-a-full-vulkan-viewer)]** | Unreported | Unreported | Merged May 2026 **[sourced, [LFS PR #1261](https://github.com/MrNeRF/LichtFeld-Studio/pull/1261)]**, GPL-3.0 |
| **Image cache on CPU, lazy loading** | Removes image data from VRAM (OpenSplat `--no-gpu-cache`) and from RAM (lazy decode) | None | JPEG decode of a 50 MP still on CPU is a fraction of a second **[estimate]**; gsplat uses 4 workers | gsplat is lazy by default; LFS caches in RAM with `--no-cpu-cache` to disable **[code, LFS argument_parser.cpp]**; CLM decodes once to raw bytes on disk and streams **[sourced, [CLM README](https://github.com/nyu-systems/CLM-GS)]**; **OpenSplat has no lazy path** **[code]** |
| **Allocator settings** (`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`) | Fragmentation: reserved-but-unallocated fell from 1.22 GB to 95 MB | None | None | **[measured here, splat-first-runs]** |
| **Evaluation off, or on tiles** | Removes the full-frame eval spike | None on the model | None | **[measured here]** |
| **Host offload of Gaussians and Adam state (GS-Scale)** | GPU memory ÷ 3.3–5.6; on an RTX 4070 Mobile, 4 M → 18 M Gaussians, LPIPS 23–35% better **[sourced, [GS-Scale](https://arxiv.org/abs/2509.15645)]** | None by design ("deferred optimizer update … identical training results") **[sourced]** | "comparable to GPU without host offloading" **[sourced]** | Research code on gsplat, MIT; "only Intel CPUs are supported", CUDA 12.x recommended **[sourced, README]**. RAM: all Gaussians + Adam in host memory, ~0.9 KB each **[estimate]**, so 20 M ≈ 18 GB |
| **Host offload (CLM-GS)** | 102 M Gaussians on a 24 GB 4090; `clm_offload` 3.01 GB vs `no_offload` 8.21 GB on the smallest scene **[sourced, [CLM README](https://github.com/nyu-systems/CLM-GS)]** | GPU-only baseline limited to 15.3 M and PSNR 23.93 **[sourced, [arXiv 2511.04951](https://arxiv.org/abs/2511.04951)]** | 1,348 s vs 734 s on the small scene **[sourced]** | **Inria non-commercial licence** (LICENSE.txt) **[code]**, so benchmark only under ADR 0003. Needs PyTorch ≥ 2.6 **[sourced]** |
| **Budgeted densification (Taming 3DGS)** | Predictable size; 0.63 M Gaussians instead of 3.31 M on Mip-NeRF 360 | Budget mode PSNR 27.31 vs 27.46 for 3DGS (a loss); full-budget mode 27.79 (a gain) **[sourced, [arXiv 2406.15643](https://arxiv.org/html/2406.15643)]** | 4–5× faster in budget mode **[sourced]** | Inria licence → benchmark only. Its ideas are in gsplat (visible Adam) and LFS |
| **Mini-Splatting** | 0.49 M Gaussians and 2.61 GB vs 3.35 M and 7.45 GB | PSNR 27.34 vs 27.47, LPIPS 0.217 vs 0.216 **[sourced, [arXiv 2403.14166](https://arxiv.org/html/2403.14166)]** — a small but real loss | 18 min vs 30 min **[sourced]** | Inria-derived → benchmark only |
| **LightGaussian** | Post-training compression; does not reduce training peak | Small loss | — | Not relevant to the training wall |
| **DashGaussian** (resolution and primitive scheduling) | Lowers early-training cost; final steps are still full resolution, so the peak is unchanged **[estimate]** | "without trading off the rendering quality"; on Taming 3DGS PSNR 27.92 vs 27.61 **[sourced, [arXiv 2503.18402](https://arxiv.org/abs/2503.18402)]** | 45.7% faster on average **[sourced]** | Inria-derived backbones; the idea (coarse-to-fine) exists in OpenSplat as `--num-downscales` **[code]** |
| **Chunked / partitioned training (VastGaussian, CityGaussian, Hierarchical 3DGS)** | Bounds Gaussians per chunk; Hierarchical 3DGS used 8–10 GB peak per chunk of 2–8 M Gaussians on a V100 **[sourced, [H3DGS](https://arxiv.org/pdf/2406.12080)]**; CityGaussian cut training memory by 50% **[sourced, [CityGaussian](https://dekuliutesla.github.io/citygs/)]** | Needs a consolidation step for chunk seams **[sourced, H3DGS]**; does **not** reduce per-pixel memory of a 50 MP frame **[estimate]** | Sequential chunks multiply wall time | Inria-derived → benchmark only. For a single Site of a few hundred images the scene is not "city scale"; this is a later tool |
| **Grendel** (distributed, batched) | Splits pixels and Gaussians across GPUs; on one GPU only batching remains | 40.4 M Gaussians on 16 GPUs PSNR 27.28 vs 26.28 at 11.2 M on one **[sourced, [Grendel README](https://github.com/nyu-systems/Grendel-GS)]** | — | Apache-2.0 but default kernel is an Inria fork; single card gains little |
| **Brush** | Streams datasets "bigger than RAM" **[sourced, [Brush v0.3.0](https://github.com/ArthurBrussee/brush/releases/tag/v0.3.0)]** | `--max-resolution` defaults to 1,920 **[code, [brush-dataset config.rs](https://github.com/ArthurBrussee/brush/blob/main/crates/brush-dataset/src/config.rs)]** | wgpu (Vulkan) | Apache-2.0; needs the NVIDIA Vulkan ICD inside Docker; reads COLMAP/nerfstudio, not OpenSfM. Low priority |
| **LichtFeld Studio** | FastGS rasteriser, fused L1+SSIM, 8-bit image handling, quantised Adam; "8k images with 3dgs (not gut)" and "cap removal to train on uncapped image resolution" **[sourced, [LFS PR #1164](https://github.com/MrNeRF/LichtFeld-Studio/pull/1164)]** | Standard 3DGS maths; strategies `mcmc`, `mrnf` (default), `igs+` **[code, [parameters.hpp](https://github.com/MrNeRF/LichtFeld-Studio/blob/master/src/core/include/core/parameters.hpp)]** | Fast (C++/CUDA) | GPL-3.0; headless CLI (`--headless --train`); **`--max-width` defaults to 3,840, so pass `--max-width 0` for full resolution** **[code]**; needs NVIDIA driver 570+ (CUDA 12.8) **[sourced, README]**; Dockerfile builds from `nvidia/cuda:<ver>-devel-ubuntu24.04` **[code]** |
| **Postshot** | "Max Image Size" and "Max Splat Count" **[sourced, Postshot docs]** | — | — | Windows GUI, not a candidate |

**Note on densification with tiles or crops.** gsplat's default strategy
multiplies image-plane gradients by `width/2` and `height/2` and counts one
observation per rasterisation call **[code]**. Calling it once per tile
normalises by the tile size and counts a Gaussian spanning two tiles twice,
so its thresholds stop meaning what they did. The MCMC strategy relocates
Gaussians by opacity and does not use those statistics **[code,
[strategy/mcmc.py](https://github.com/nerfstudio-project/gsplat/blob/main/gsplat/strategy/mcmc.py)]**,
so it is the pairing to use with tiles or crops. A capped MCMC run also makes
peak memory predictable, which is what the placement ladder needs.

**What "full quality" should mean for a splat, in measurable terms.** Train
on full-resolution pixels (tiles or crops, never downscaled images) and
evaluate on held-out views at full resolution. A downscaled run is the control
it has to beat. Gaussian count and SH degree are quality knobs, not memory
tricks, so they have to be swept and scored, not assumed.

---

## 3. Test dataset

The coordinator's ranking criteria: real drone stills at 45–50 MP with GPS in
EXIF, nadir plus some oblique, 100–500 images, downloadable, under about 15 GB,
licence stated. The operator flies a DJI Mini 5 Pro (1-inch sensor, 50 MP
stills).

### Ranked

**1. Trakai Island Castle — DJI Zenmuse P1, 360 images (recommended primary).**
- Download: `https://www.arcgis.com/sharing/rest/content/items/c401d317f8ca480a952ea65a798af1fa/data`
  (a .zip), size **4,940,434,544 bytes (4.94 GB)** **[sourced, ArcGIS item
  API `?f=json`, `size` field]**. A second copy named `Trakai_Island_Castle.zip`
  is at `https://gisupdates.esri.com/LearnTutorials/Trakai_Island_Castle.zip`,
  5,540,164,907 bytes per its HTTP `Content-Length` **[sourced]**; use the
  first.
- Contents: "360 drone images and a clip area polygon"; images "provided by
  HNIT-BALTIC, Lithuania" **[sourced, [ArcGIS item](https://www.arcgis.com/home/item.html?id=c401d317f8ca480a952ea65a798af1fa)]**.
  Each image carries latitude, longitude and altitude **[sourced,
  [Learn ArcGIS tutorial](https://learn.arcgis.com/en/projects/create-3d-products-with-arcgis-drone2map/)]**.
  Esri describes it as a "crosshatch flight … captured with a DJI Zenmuse P1"
  **[sourced, [Esri sample drone datasets](https://www.esri.com/en-us/arcgis/products/arcgis-reality/resources/sample-drone-datasets)]**.
- Resolution: the P1 records 8,192 × 5,460 (44.7 MP) **[sourced,
  [DJI P1 specs](https://enterprise.dji.com/zenmuse-p1/specs)]**; the average
  file is 13.7 MB **[estimate: 4.94 GB ÷ 360]**, consistent with that.
- Licence: the tutorial that ships it is "governed by a Creative Commons
  license (CC BY-SA-NC)" **[sourced]**; the item itself has no licence field.
  Fine for internal testing; **not** for anything shown to clients.
- Fit to our Capture: 44.7 MP vs 50.3 MP (89% of the pixels), 360 images
  (mid-range), GPS present. Full-frame 35 mm sensor on a large aircraft rather
  than a 1-inch sensor, so noise and sharpness will be better than a Mini 5 Pro
  and feature counts somewhat higher **[estimate]**. Not yet verified on
  download: whether the crosshatch includes tilted (oblique) frames
  (check `GimbalPitchDegree` in the XMP), and whether positions are RTK.
- Disk: 4.94 GB zip plus about 4.94 GB extracted; delete the zip after
  extraction. ODM at full quality will need far more than the images
  (section 1.1).

**2. Esri Sony A7R IV (61 MP) datasets — stress test above our resolution.**
Same Esri page, same terms question (no licence stated on the page). Sizes from
HTTP `Content-Length` **[sourced]**: Superior – Marshall Wildfire 3.95 GB;
Redlands – Packing House District (nadir) 7.05 GB; Denver – Red Rocks
Amphitheatre (crosshatch) 7.46 GB. The A7R IV is 9,504 × 6,336 (61 MP)
**[estimate from the model; verify from EXIF]**. Image counts are not
published. Use one only if the 45 MP runs pass with headroom, to see how far
above 50 MP the chosen settings survive.

**3. Drone Building Scans — DJI Mini 5 Pro (the operator's aircraft), 12 MP.**
- `https://huggingface.co/datasets/Matt1up/drone-building-scans`, CC BY 4.0
  **[sourced]**. `flat-roof`: 951 images, 12.13 GB; `shingle-roof`: 395 images,
  4.52 GB **[sourced, dataset README]**. Camera "DJI FC9313, 8.7 mm, f/1.8" at
  4,096 × 3,072, GPS on every frame, nadir plus oblique plus low wall passes,
  flown under 16 m, with COLMAP poses included **[sourced]**.
- Why it matters: same lens, sensor and JPEG pipeline as our Captures, and
  `shingle-roof` fits the disk and the image-count range. Why it is not
  primary: 12 MP, not 50 MP. The author says the 50 MP mode "interpolates from
  the same sensor" and chose the native 12 MP readout **[sourced]**. That claim
  deserves a look by the operator: if the Mini 5 Pro's 50 MP mode carries much
  less real detail than 50 MP of pixels (a quad-Bayer remosaic), "full quality"
  may not require training on every one of those pixels, and a native-12 MP
  Capture would dodge most of this issue. **This is a question to test, not a
  conclusion** — see experiment Q1.

**Already on the host and below target:** OpenDroneMap's `odm_data_*` sets top
out at 18 MP **[measured here]**.

**Not usable:** Pix4D's example sets top out at 24 MP (eBee X AeriaX, 6,000 ×
4,000) and are licensed for training use only **[sourced,
[Pix4D examples](https://support.pix4d.com/hc/en-us/articles/360000235126)]**;
the 3ds-scan P1 subset (109 images) has no stated licence and a download that
is sometimes by e-mail **[sourced, [3ds-scan](https://www.3ds-scan.de/en/dji-p1-preview/)]**;
Wingtra's CC BY 4.0 datasets are processed outputs in web viewers, not raw
images **[sourced, [Wingtra data sets](https://wingtra.com/mapping-drone-wingtraone/aerial-map-types/data-sets-and-maps/)]**.

---

## 4. Experiment list for the host agents

### 4.0 Rules that apply to every experiment

- **Measure need, not reservation.** `nvidia-smi memory.used` on a PyTorch or
  libtorch process shows the caching allocator's reservation, which expands to
  whatever is free and retries after freeing cache on a failed allocation. For
  Python trainers log `torch.cuda.max_memory_allocated()` and
  `max_memory_reserved()` every 100 steps. For C++ engines (OpenSplat, LFS,
  OpenMVS), find the minimum card they need by **shrinking the card**: start a
  holder process that allocates X GB and sleeps (for example
  `docker run --rm --gpus all nerfstudio-splat:local python -c "import torch,time; x=torch.empty(int(X*2**30),dtype=torch.uint8,device='cuda'); time.sleep(10**6)"`),
  then run the engine; bisect X over a short run (1,000–2,000 steps that include
  one densification pass). Report "completes with ≥ N GB free".
- **Record RAM** with `docker stats` (the existing harness does), and **disk**
  with `du -sb` on the job directory every 30 s, because disk is a real limit
  here.
- **Quality protocol for splats.** Hold out every 8th image. Render held-out
  views at full resolution in tiles (inference only), compute PSNR and SSIM on
  the full image and LPIPS (AlexNet) on non-overlapping 1,024 px tiles averaged.
  Use **one evaluator for every engine** (gsplat's rasteriser loading the
  exported PLY) so engine-specific evaluation cannot flatter a result. Check
  that each engine's PLY is in the coordinate frame of the poses (OpenSplat
  keeps the input CRS unless `--center` is passed **[code]**).
- **Controls.** Every full-resolution run is paired with the same settings at
  `data_factor 2` (a quarter of the pixels). Full resolution has to beat it
  measurably or the extra hours bought nothing.
- **Coordination.** Take the shared lock; unload the ollama embedding model;
  keep 20 GB of disk free; the production chat worker's ~1.5 GB is always
  present.

### 4.1 GPU experiments (splat Fitting and GPU MVS) — in priority order

**G1. Is OpenSplat's bellus failure just the GPU image cache? (about 15 min)**
- Tool: `opensplat:local` (commit 687cc91), existing harness.
- Command: `bash scripts/measure/opensplat-fit.sh ~/drone/datasets/code bellus-opensplat-nocache -n 15000 --no-gpu-cache`
  (pass `--no-gpu-cache` through to the engine), with
  `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`.
- Measure: completion, wall time, `--val` PSNR, RAM peak (expect about 18–19 GB
  from the float32 images **[estimate]**).
- Winner if: it completes. That confirms finding 2, un-gates OpenSplat for
  ~12 MP inputs, and makes `no_gpu_cache: True` the local default in
  `nodes/fit-splat/fit_splat.py`. It does **not** rescue 50 MP (finding 1).

**G2. Per-pixel and per-Gaussian VRAM at 45 MP, measured directly (about 2 h
including the solve).**
- Poses: ODM on Trakai with `--end-with opensfm --feature-quality ultra`, then
  inside the ODM image `opensfm export_colmap <project>/opensfm`, then
  `colmap image_undistorter --input_path .../colmap_export --image_path <images> --output_path trakai_colmap --output_type COLMAP`
  (image `colmap/colmap:latest`). Cheaper alternative if disk is short: skip
  undistortion and use LFS's `--undistort` in G4 instead.
- Tool: gsplat's `examples/simple_trainer.py` from the `v1.4.0` tag, run inside
  the existing `nerfstudio-splat:local` image (gsplat 1.4.0 is already
  installed; `pip install fused-ssim tyro` if missing).
- Command grid, 2,000 steps each, evaluation off:
  `python simple_trainer.py mcmc --data_dir trakai_colmap --data_factor 1 --result_dir r/<name> --max_steps 2000 --eval_steps 999999 --save_steps 999999 --disable_viewer --packed --strategy.cap-max {1000000,3000000} [--patch_size {4096,2048}]`
  (six runs: two caps × full frame, 4,096 crop, 2,048 crop). Add a log line
  printing `torch.cuda.max_memory_allocated()`.
- Measure: allocated and reserved peak per run, step time, RAM.
- Output: fit `peak = a + b × pixels_per_step + c × gaussians` from six points.
  This replaces every per-pixel estimate in section 1.2 with measured numbers
  and tells us how many Gaussians fit beside each tile size.
- Winner if: the fit predicts each run within 10%. Then the Gaussian cap for a
  given tile size can be computed instead of guessed.

**G3. Full-quality gsplat Fitting on Trakai, with the downscaled control
(overnight).**
- Configuration A (candidate): `--data_factor 1 --packed --strategy mcmc --strategy.cap-max <from G2, leaving 15% headroom> --patch_size 4096 --steps_scaler 4` (four times the steps so the crops cover as many pixels as 30k whole-frame steps would **[estimate]**), `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`, evaluation off during training.
- Configuration B (control): identical but `--data_factor 2`, no patch, `--steps_scaler 1`.
- Configuration C (exact alternative, if the gsplat patch is written): full frame split into a 2 × 2 grid of tiles with 16 px overlap, gradients accumulated, one optimizer step per image.
- Measure: held-out PSNR / SSIM / LPIPS at full resolution per section 4.0, Gaussian count, wall time, allocated peak.
- Winner if: A (or C) beats B on LPIPS and SSIM at full resolution with allocated peak ≤ 9.5 GB. If A ≈ B, full-resolution training is not buying anything on this data and the operator should see that result before hours are spent on it. If C beats A, crops are costing quality and the tile patch should be kept.

**G4. LichtFeld Studio at uncapped resolution (half a day including the build).**
- Check first: `nvidia-smi` driver ≥ 570 **[sourced, LFS README]**; disk for
  the image build (the CUDA devel base alone is several GB **[estimate]**).
- Build from `docker/Dockerfile` with `CUDA_VERSION` matching the driver; run
  headless: `LichtFeld-Studio --headless --train -d trakai_colmap -o out --max-width 0 --strategy mcmc --max-cap <G2 value> --iter 30000 --test-every 8 --eval --log-level perf`.
  Repeat with the default strategy (`mrnf`) at the same cap.
- Measure: minimum card by the holder-process bisection; wall time; quality via
  the common evaluator on the exported PLY.
- Winner if: quality within 0.2 dB PSNR and 0.01 LPIPS of G3-A at lower peak or
  shorter time. LFS is GPL-3.0 and runs as a separate process, which is the
  same position ADR 0001 takes for AGPL tools **[estimate — confirm against ADR
  0003's wording]**.

**G5. GPU depth maps at ODM ultra on Trakai, plus the depth-map disk curve
(half a day).**
- Tool: `opendronemap/odm:3.6.2-gpu` (3.1 GB) with `--gpus all`, container
  capped `--memory 32g --memory-swap 32g` as before.
- Command:
  `docker run --rm --gpus all --memory 32g --memory-swap 32g -v <trakai>:/datasets/trakai opendronemap/odm:3.6.2-gpu --project-path /datasets trakai --feature-quality ultra --pc-quality ultra --orthophoto-resolution <GSD in cm from the first solve's report> --dem-resolution <same> --max-concurrency 8 --optimize-disk-space --end-with openmvs`
  (stop after densification; the full pipeline is the reconstruction agent's
  profile). Run the same on the CPU image for a 40-image subset only, to get a
  speed ratio without spending the night.
- Then, on 20 images from the same `scene.mvs`, run
  `DensifyPointCloud scene.mvs --resolution-level {2,1,0} --max-resolution 8192 --cuda-device -1 -w depthmaps_L{n} --fusion-mode 1`
  (depth maps only, no fusion) and record per-image `.dmap` size, VRAM (holder
  bisection on one image), and seconds per image.
- Measure: stage wall times, GPU peak, RAM peak, disk peak, `.dmap` bytes per
  depth-map pixel.
- Winner if: GPU densification at ultra completes with the 32 GB RAM cap and
  within disk; the `.dmap` curve then tells whether level 1 or 0 is even
  possible on this disk (section 1.1 predicts no).

**G6. Host offload when Gaussians, not pixels, are the limit (a day; only if
G3 shows quality still rising with the cap).**
- Evidence needed first: G3 re-run at two caps (for example 3 M and the G2
  maximum) with LPIPS still improving at the higher cap.
- Tool: GS-Scale (`SNU-ARC/GS-Scale`, MIT, gsplat-based). Check the host CPU is
  Intel ("only Intel CPUs are supported" **[sourced]**; 28 threads suggests an
  Intel Core i7 of the 13th/14th generation **[estimate — verify with
  `lscpu`]**). Use `simple_trainer_hybrid_optimized_split.py` with a config
  block copied from its `aerial` preset, `--split_threshold 0.3`.
- Budget: host RAM at ~0.9 KB per Gaussian **[estimate]**, so 20 M Gaussians
  ≈ 18 GB; keep the container at `--memory 32g`.
- Winner if: a higher cap than G3's improves held-out LPIPS by more than 0.01
  at no more than twice the wall time.
- CLM-GS is the same idea with better published numbers but an Inria licence,
  so it can only be the ADR 0003 benchmark, not the pipeline.

### 4.2 Other experiments

**Q1. Does the Mini 5 Pro's 50 MP mode carry more detail than its 12 MP mode?**
The cheapest way to settle how much "full quality" costs. The operator flies
one small Site twice (or one pass with alternating modes if the controller
allows), same altitude. Measure: MTF or simple edge sharpness on a printed
target, and ODM orthophoto sharpness at native GSD for each. If 50 MP is not
meaningfully sharper, every experiment above gets 4× cheaper **[estimate]**.
Needs a real Capture, so it belongs to #11/#20 rather than this issue's host
agents; recorded here because it could remove the problem.

**R1. ODM full-quality stage profile on Trakai (reconstruction agent's
existing plan, with these flags).** `--feature-quality ultra --pc-quality ultra
--orthophoto-resolution <GSD> --max-concurrency {8,16}`, bare CLI first, then
the NodeODM path with `pc-ept`/`cog`/`gltf` toggled one at a time to find which
one costs the extra RAM. If RAM exceeds 32 GB: `--split 120 --split-overlap 50`
and compare the merged orthophoto against a non-split run of a 120-image
subset for seams.

**R2. OpenSplat made loadable at 50 MP (only if OpenSplat must stay the local
engine).** A small patch to keep decoded images as `uint8` (3 B/px instead of
12) and cast per step, plus an optional least-recently-used cache of decoded
images. At 50 MP × 300 images that is still about 45 GB as uint8 **[estimate]**,
so the lazy cache is what actually makes it fit. Measure RAM and step time.
Compare against gsplat after G3; if gsplat or LFS already wins, skip this.

**R3. AliceVision depth maps at `downscale 1` on 20 Trakai images (low
priority, disk-heavy image).** Measure VRAM per tile and seconds per image as a
cross-check on OpenMVS; not a pipeline candidate because of the 16.4 GB image
and the separate georeferencing path.

### 4.3 What would change the design

- If G3 shows full-resolution training beats the half-resolution control and
  fits in 9.5 GB with tiles or crops, **full-quality splat Fitting of real
  Captures stays local** on this card, as a long overnight job, with gsplat (or
  LFS) instead of OpenSplat, and `fit_splat.py`'s `full-still` downscale of 4
  goes away.
- If G5's depth-map curve confirms the disk estimate, "full quality" for the
  Orthomosaic has to be defined as ODM ultra with native-resolution texture
  images — native depth maps would need a sub-scene pipeline that fuses and
  deletes per block, which is custom work.
- If Q1 shows the 50 MP mode adds little real detail, the cheaper path is to fly
  12 MP and none of the above is needed.
