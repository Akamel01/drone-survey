# Building the Gaussian Splatting tail (fit-splat, clean-splat, compress-splat) -- 2026-09-13

Ticket #24. Three new Nodes, wired into `pipeline/manifests/splat.json` after `solve`, and run
end to end on the host over an existing completed ODM output (StudioKitchen -- the same video-frame
project #8 and #12's research already used, so these numbers sit directly next to theirs).

## What was built

| Node | File | Job |
|---|---|---|
| `fit-splat` | `nodes/fit-splat/fit_splat.py` | Fitting: ODM camera solve -> raw `splat.ply`, engine and memory policy chosen by target |
| `clean-splat` | `nodes/clean-splat/clean_splat.py` | Automated cleaning + quality gate: NaN drop, Site-polygon crop, statistical outlier removal, opacity/scale pruning |
| `compress-splat` | `nodes/compress-splat/compress_splat.py` | `.ply` -> `.sog` (SuperSplat's compressed web format), with a size-ratio sanity gate |
| -- | `nodes/check_splat.py` | Offline, no-GPU check of all three Nodes' pure logic (ADR 0018) |
| -- | `pipeline/manifests/splat.json` | Wires `solve -> fit-splat -> clean-splat -> compress-splat` |

## Engine choice: OpenSplat on the local (12GB) target, not splatfacto

ADR 0004 names splatfacto as this pipeline's engine. Ticket #24's own comments show it never
finishes on this card: with evaluation off and the fragmentation-resistant allocator (both of
which this Node always sets, on every target), splatfacto still ran out of memory in training
itself at 79% of 15,000 steps (`docs/research/splat-first-runs-2026-09-10.md`). OpenSplat
completed a full-resolution fit on the same project on the same card in 902s
(`docs/research/opensplat-first-run-2026-09-12.md`). The ticket's own instruction is to use "the
engine the evidence supports on 12 GB" -- that is OpenSplat, for the local target specifically.

This is **not** a revision of ADR 0004. That ADR's own research explicitly says the OpenSplat
result "does not change ADR 0004 yet" pending a quality comparison on real stills, which this
build does not attempt (see "what remains unproven"). `fit-splat`'s memory policy keeps
splatfacto wired in as the engine for the `remote-3090` and `rented` targets, where 24GB+ is
expected to clear the ceiling that defeated it locally -- untested here, no such hardware was
available to this build.

A side effect of choosing OpenSplat for the local target: it runs with `--center` never passed,
so gaussian centres stay in ODM's own local coordinate frame (OpenSplat's `keepCrs` default).
There is therefore no `applied_transform` / `applied_scale` / `dataparser_transforms.json` chain
to compose for `clean-splat`'s crop step on this path -- that three-piece transform chain
`docs/research/splat-auto-cleaning-2026.md` describes is specific to nerfstudio's dataparser and
only applies on the splatfacto path.

## Measured constraints honoured

- **`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`**: set as a container env var on every
  Fitting run, both engines, every target (`fit_splat.ALLOC_CONF`).
- **Evaluation always off**: splatfacto's three `--steps-per-eval-*` flags are always set above
  the iteration count; OpenSplat has no periodic full-resolution eval pass to begin with, and
  `fit-splat` never passes `--val-render` (only `--val`, which withholds one image and prints its
  PSNR once, at the end -- reused directly for `clean-splat`'s gate instead of re-implemented).
- **AlexNet weights cached, not fetched per run**: `nodes/fit-splat/nerfstudio.Dockerfile` bakes
  them into a derived image at build time (ADR 0013, option 1). Not built or exercised in this
  run -- the local target never touches the splatfacto path, so the download this fixes was never
  on the critical path here either.
- **Checkpointing / resume**: OpenSplat's `-s/--save-every` writes `<stem>_<step>.ply`; `fit-splat`
  resumes from the highest-numbered one automatically (`find_latest_opensplat_checkpoint`).
  splatfacto's path resumes via `--load-dir` pointing at its own latest checkpoint directory.
- **Memory policy chosen by target**: `fit_splat.MEMORY_POLICY`, keyed by ADR 0014's placement
  ladder, distinguishes `video-frame` inputs (this test project; measured) from `full-still`
  inputs (a real 8192x6144 Grid Mission Capture -- six times the pixels, unmeasured, defaulted to
  a conservative downscale per ADR 0014's "start conservative, tighten with measurement").
- **Cleaning is automated with an explicit gate, ADR 0015**: `clean-splat` never runs by hand;
  its gate exits non-zero on failure (see below) and is combined from held-out fidelity, crop
  fraction, SOR fraction, final gaussian count, and an *independent* boundary-overlap re-check
  the ticket specifically asked for (a wrong transform should not silently pass).
- **Compression to the web format the research names**: `.sog`, via PlayCanvas's `splat-transform`
  (MIT), pinned in `nodes/compress-splat/Dockerfile` rather than `npx`-installed fresh every run.

## Coordination incident during this build

A same-host OpenSplat benchmarking run (`bellus-opensplat3`, an unnamed container, not
`bench-*`-prefixed) was already using the GPU when `fit-splat`'s first attempt started -- the
ticket's stated wait condition (`docker ps | grep '^bench-'`) does not catch a container that
isn't named that way, and it wasn't. The collision was caught within seconds from the measured
GPU memory jump, the colliding container was killed immediately
(`docker kill splat-fit-<timestamp>`), and `fit_splat.wait_for_gpu_free` was hardened before the
retry to also refuse to start whenever *total* GPU memory used exceeds 3,000 MiB (the production
chat worker's own measured baseline is ~1,400-1,500 MiB) -- not only when a `bench-*` container
is present. The retry waited for the other job to finish before starting.

## Measured: Fitting

Run via the Runner (`pipeline/manifests/splat.json`, workdir `~/drone/splat/ticket24-e2e`),
`solve`'s output faked as the pre-existing, already-completed StudioKitchen ODM project per the
ticket's instruction (a symlink plus a hand-written `state.json` marking `solve` done -- fit-splat
onward ran for real, through the Runner, exercising the actual resume/skip machinery).

| | value |
|---|---|
| Project | StudioKitchen (video frames, 180 x 3840x2160 -- same project as #8/#12) |
| Engine | OpenSplat 1.2.1 (`opensplat:local`, already built on the host by another agent, reused as instructed) |
| Target / resolution class | `local` / `video-frame` (full resolution, matching #12's measured run) |
| Command | `opensplat /datasets/studiokitchen -o splat.ply -n 15000 -s 2500 -d 1 --val` |
| Exit code | 0 |
| Wall clock | **899.4 s** (#12's comparable full-res run: 902 s -- consistent) |
| GPU baseline / peak / job | 1,501 / 8,701 / **7,200 MiB** (#12's comparable run: 1,501 baseline / 10,210 peak / ~8,709 job -- lower here; `--val` and `-s 2500` were not both present in #12's exact command, and the densification memory spike is a mid-run transient per #12's own findings, not a deterministic number) |
| Held-out validation PSNR | **19.48 dB** (OpenSplat's own `--val`, printed once at the end; withheld image `frame_0170.jpg`) |
| Gaussians (raw) | **76,010** (#12's comparable run: 75,392) |
| Solve-quality gate | passed: 180/180 images registered (100%), avg track length 5.15 |

A same-host GPU collision happened on the first attempt (see "coordination incident" above); the
numbers above are from the retry, after the other job had the card to itself again.

## Measured: cleaning gate

No Site polygon exists for this project (it has no GPS/GCP at all -- `has_gps: false,
has_gcp: false` in ODM's own `opensfm/stats/stats.json`), so the crop step was not exercised on
real georeferenced data in this run; the point-in-polygon math and the independent
boundary-overlap check are covered instead by `nodes/check_splat.py`, against synthetic
coordinates.

| Stage | count | removed |
|---|---|---|
| Raw (from fit-splat) | 76,010 | -- |
| After NaN/non-finite drop | 76,010 | 0 |
| After Site-polygon crop | 76,010 | 0 (no polygon given) |
| After statistical outlier removal | 75,191 | 819 (1.1%) |
| After opacity/scale pruning (final) | **32,312** | 42,879 (56.4% of the post-SOR set) |
| Gate verdict | **pass** | held-out PSNR 19.48 dB >= 12.0 dB floor; SOR fraction well under the 30% cap |

The opacity/scale pass removed more than half the gaussians -- worth a second look before
trusting `OPACITY_MIN = 0.02` / `SCALE_MAX = 5.0` as calibrated rather than just "not obviously
broken." OpenSplat's own opacity distribution on this scene was not inspected separately; this is
exactly the calibration debt the module's docstring already declares.

## Measured: compression

| | value |
|---|---|
| Raw `cleaned.ply` | 8,014,906 bytes (7.6 MiB) |
| `scene.sog` | 416,843 bytes (407 KiB) |
| Compression ratio | **19.23x** (research doc's cited range: 15-20x -- consistent) |
| Gate verdict | pass (>= 1.5x floor) |

**A GPU constraint surfaced here that the design didn't anticipate.** `splat-transform`'s SOG
encoder needs a working WebGPU device to compress spherical-harmonic coefficients beyond band 0,
and this host's containerized Vulkan stack cannot provide one: with `libvulkan1` installed and
`NVIDIA_DRIVER_CAPABILITIES=all` / `XDG_RUNTIME_DIR` set, adapter enumeration finds a device but
initialization fails with "Vulkan shaderUniform*ArrayDynamicIndexing required" -- a real feature
gap on this driver, not a missing library. `compress-splat` filters to SH band 0 (`-H 0`) before
writing, which is why this run's `.sog` carries flat per-gaussian colour rather than OpenSplat's
fitted view-dependent detail (OpenSplat fits SH degree 3 by default). This is a measured,
CPU-only, working path -- not a guess -- but it is a real quality cost against the same
Vulkan/WebGPU limitation, not a design choice this ticket would otherwise have made.

## Operator procedure when the quality gate fails

`clean-splat` exits non-zero and writes its full reasoning to `--out-report` (counts at every
stage, the held-out PSNR it used, which specific threshold(s) it failed) rather than a bare
non-zero code. Per ADR 0015, this is not routed back to a person automatically by anything built
in this ticket -- the Runner stops the Pipeline at the failed Node and holds the Capture, and
whatever calls the Runner is responsible for surfacing that (this ticket does not build the
notification/review-queue side of ADR 0015; see design.md's "calibration period" for the intended
shape: the operator reviews every splat, passing or failing, until the gate has matched their
verdict on 20 consecutive deliveries).

When a real gate failure is flagged, the operator should:

1. Read `clean-splat`'s `--out-report` JSON `reasons` list -- it names the specific failing
   check(s) (e.g. "held-out validation PSNR 9.2 dB < 12.0 dB", or "independent check failed: kept
   gaussians do not overlap the Site boundary").
2. If the failure is a **boundary-overlap** or **implausible crop fraction** reason: treat this as
   the dangerous case the ticket called out by name -- a wrong coordinate transform silently
   cropping the wrong region -- and inspect the Site polygon and the raw splat in SuperSplat
   Editor before trusting anything else about the run.
3. If the failure is **held-out PSNR** or **SOR-removed fraction**: this is far more likely to be
   a genuinely weak Fitting result (bad poses, insufficient Overlap, poor light) than a pipeline
   bug -- check `fit-splat`'s own report and log first, and consider whether the Capture itself
   should be reflown before spending more compute on it.
4. Every threshold in `clean-splat` (`OPACITY_MIN`, `SCALE_MAX`, `MAX_CROP_REMOVED_FRACTION`,
   `MAX_SOR_REMOVED_FRACTION`, `MIN_FINAL_GAUSSIANS`, `MIN_VAL_PSNR`) is a first, conservative cut
   with no calibration behind it yet (declared explicitly in the module's docstring, per ADR
   0014/0018's "start conservative, tighten with measurement"). A failure that the operator's own
   judgement overturns after inspection is exactly the calibration signal design.md's calibration
   period is for -- it should be logged, not just overridden silently.
5. Nothing in this ticket auto-retries a failed gate. Re-running `clean-splat` (or the whole
   Pipeline from `fit-splat`) after a genuine fix is a normal Runner resume (ADR 0006): fix the
   input or the threshold, re-run, and only the failed Node and anything after it repeats.

## What remains unproven

- **Quality on real aerial stills.** Every number here, and everything in #8/#12's research this
  build's engine choice rests on, comes from 3840x2160 video frames of one indoor-ish benchmark
  project. Nothing here says anything about an 8192x6144 real Grid Mission Capture -- the
  `full-still` memory policy's downscale default is a documented guess, not a measurement.
  ADR 0014's own placement thresholds still need a real Capture to mean anything.
- **The splatfacto path** (`remote-3090`/`rented` targets, the AlexNet-cache Dockerfile) was
  written and unit-tested (`check_splat.py`) but never run for real -- no 24GB card was available
  to this build. The `ns-process-data odm` / `ns-train` / `ns-export gaussian-splat` chain it
  shells out to has not been exercised end to end since ADR 0004's revision confirmed the native
  ODM importer needs a completed ODM run, which this ticket's `solve` Node (built concurrently)
  does not by default produce (see next point).
- **`solve`'s default stop point vs. what Fitting needs.** `nodes/solve/solve.py` defaults to
  `--end-with opensfm`, the cheapest camera solve. `fit-splat`'s pre-flight gate was written to
  read `opensfm/stats/stats.json` (written at that same stop point) rather than
  `odm_report/stats.json` (only written much later) for exactly this reason, and OpenSplat itself
  is believed to need only `opensfm/reconstruction.json` and the raw `images/` -- not the
  later `odm_report`/mesh/orthophoto stages. That belief was not verified end to end against a
  fresh `solve` output in this build (this run used a *fully completed* ODM project instead, per
  the ticket's own instruction); whether ODM's undistortion sub-stage runs before or after
  `--end-with opensfm` cuts off, and whether OpenSplat needs `opensfm/undistorted/` specifically,
  is an open seam between the two Nodes worth a real end-to-end check once `solve` lands.
- **The cleaning gate's thresholds** are first conservative cuts with zero calibration behind
  them (stated in `clean-splat`'s own docstring), exactly as `docs/research/splat-auto-cleaning-2026.md`
  warned would be the case. `MIN_VAL_PSNR = 12.0` in particular is far below the 25-35 dB the
  research document cites as a generic "good" 3DGS range -- deliberately, since this pipeline's
  own PSNR distribution is completely unmeasured, but it means the gate as shipped is more a
  smoke test than a quality bar today.
- **The Site-polygon crop** was never exercised against a real polygon or real georeferenced
  gaussians -- StudioKitchen has no GPS/GCP at all. `nodes/check_splat.py` covers the
  point-in-polygon and independent-overlap math directly, but the seam between a real Site
  boundary (in real-world coordinates) and a splat's local frame is untested.
- **`compress-splat`'s `meta.json`** is this Node's own small report, not the deeper viewer-
  settings/camera metadata format `nodes/bundle/build.py`'s `SupersplatViewer.load()` call may
  eventually want. It satisfies the `--splat-meta` file contract `nodes/bundle` already declares,
  but whether the SuperSplat Viewer needs richer metadata than that was not investigated here.
- **Compressed splats lose their spherical harmonics on this host.** `-H 0` was a real,
  measured, forced workaround for a Vulkan/WebGPU gap in this container environment (see
  "measured: compression"), not a chosen trade-off. The delivered `.sog` in this run does not
  carry the view-dependent colour OpenSplat actually fitted. Worth revisiting on a host with a
  working GPU-accessible WebGPU stack before this reaches a real client deliverable.
- **This run executed against a `repo-sync` copy** (`~/drone/repo-sync/{pipeline,nodes}`) rsynced
  to the host, not a git checkout of this repository -- the host has no clone of it. The Manifest,
  Runner, and all three new Nodes ran unmodified from that copy; nothing about the result depends
  on that mechanism, but it is why no `git` state exists on the host to point to.
