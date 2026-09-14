# 4070 placement thresholds, on real stills — 2026-09-13

Ticket #8's thresholds have to come from real stills, not video frames. This
session got real stills onto the host for the first time and measured both
halves of the pipeline against them: ODM/NodeODM reconstruction (CPU, RAM and
disk bound) and OpenSplat Fitting (GPU, video-memory bound).

**Everything below is measured on this host unless marked `estimated`.**

## Imagery used, and the gap that comes with it

No aerial nadir stills existed on the host (`~/drone/datasets` had only the
StudioKitchen video frames). Per the ticket's instructions, public sample
datasets were pulled from the official OpenDroneMap GitHub organisation
(`github.com/OpenDroneMap/odm_data_*`) — real drone photos with GPS, not
video.

**The gap that has to be stated plainly: none of these datasets reach the
50 MP (8192×6144) a real Grid Mission still produces.** The largest available
is 18–20 MP, roughly a third to a half the resolution intended for
production, and image counts (12–524) are a separate axis from resolution.
Every number below is therefore a floor on real resource cost, the same
caveat every prior measurement in this ticket has carried — it just now
applies to real photographs instead of video, which is progress but not the
finish line.

| Dataset | Images | Resolution | Megapixels |
|---|---|---|---|
| odm_data_pacifica | 12 | 4272×2848 | 12.2 |
| odm_data_aukerman | 77 | 4896×3672 | 18.0 |
| odm_data_bellus | 122 | 4048×3048 | 12.3 |
| odm_data_waterbury | 248 | 4896×3672 | 18.0 |

(Resolution measured by parsing the JPEG SOF marker of one sample image per
dataset; image counts from `git ls-tree`.)

## Reconstruction (NodeODM — the path the Runner actually drives)

Harness: `scripts/measure/nodeodm-bench.sh`, extended this session to sample
container RAM (`docker stats`) and host disk consumed (`df`) every 5s
alongside the wall clock and status it already tracked. Same options on every
run, matching the ticket's existing baseline: `feature-quality low`,
`pc-quality lowest`, `use-3dmesh true`, `orthophoto-resolution 5`. Container
capped at `--memory 32g --memory-swap 32g`, the limit already in place from
ticket #6 to protect the production stack sharing this host.

Command shape (re-verify the bellus point with this):

```
bash scripts/measure/nodeodm-bench.sh opendronemap/nodeodm:latest 3191 \
  ~/drone/datasets/odm_data_bellus/images recon-bellus
```

| Dataset | Images / MP | Status | Wall | Peak RAM | Peak disk (job) |
|---|---|---|---|---|---|
| pacifica | 12 / 12.2 | **completed** | 120 s | 1.78 GiB | 0.46 GiB |
| aukerman | 77 / 18.0 | **completed** | 391 s | 15.33 GiB | 3.78 GiB |
| bellus | 122 / 12.3 | **completed** | 376 s | 15.73 GiB | 5.16 GiB |
| waterbury | 248 / 18.0 | **failed (OOM)** | 617 s to failure | 31.43 GiB (hit the 32 GiB cap) | 11.09 GiB (partial) |

**Largest Capture that completes reconstruction locally, measured: `bellus`
— 122 images at 4048×3048 (12.3 MP), 15.73 GiB peak RAM, 5.16 GiB peak disk,
376 s wall clock.**

**Smallest tested Capture that fails: `waterbury`** — 248 images at
4896×3672 (18.0 MP) — killed by the container's 32 GiB memory cap at 617 s,
602 s into processing. This is the same failure mode ADR 0014 was written to
avoid: expensive CPU time spent (over 10 minutes) before the resource limit
is hit.

Nothing between 122 and 248 images was tested (time and disk budget for this
session), so the exact crossover point inside that range is **estimated**,
not measured: interpolating conservatively between the two endpoints puts it
in the 150–200 image range at this ~15 MP resolution class. That interpolated
number is exactly the kind of arithmetic-between-two-points reasoning ticket
#8's own history (the OpenSplat resolution modeling, corrected twice) warns
against trusting, so treat it as a rough planning number, not a rule.

**A side observation, not a threshold:** running the same bellus dataset
directly through the ODM CLI (`opendronemap/odm:latest`, same four options,
no NodeODM in front of it) peaked at only 4.15 GiB RAM and finished in
110 s — a third of the NodeODM path's time and RAM. NodeODM adds
`pc-ept` (Entwine point-cloud tiling), `cog`, and `gltf` on top of whatever
options are sent, and one or more of those is where the extra RAM goes. The
Runner drives NodeODM, not the bare CLI (established in ticket #6), so the
NodeODM numbers above are the ones that matter for placement — this is
recorded so the discrepancy doesn't look like measurement noise later.

## Fitting (OpenSplat, full resolution, 15,000 iterations)

Harness: `scripts/measure/opensplat-fit.sh`, unchanged (it already sampled
GPU memory). Engine: `opensplat:local`, built from source this session from
`~/drone/OpenSplat` (23.4 GB image; this is why disk got tight — see below).
GPU baseline before every run: 1,501 MiB held by the production chat worker,
12,282 MiB total on the card, no ollama model loaded (checked per-run, per
the existing harness guard).

OpenSplat reads an ODM project's `opensfm/reconstruction.json` directly, not
the `all.zip` NodeODM hands back (that download omits the `opensfm/` working
directory entirely). So the bellus project used for Fitting was reconstructed
a second time straight through the ODM CLI (the 4.15 GiB / 110 s run above),
which keeps that directory on disk. It also needs mounting at the exact
in-container path ODM wrote into its own metadata (`/datasets/code`) — the
first attempt failed instantly with "Invalid project folder" (wrong format
entirely: NodeODM's `all.zip` has no `opensfm/`), the second failed instantly
with "Cannot read .../images/..." (right format, wrong mount path). Both are
recorded here because the next person hitting either error should not have
to re-derive this.

Command that produced the real-stills result below:

```
bash scripts/measure/opensplat-fit.sh ~/drone/datasets/code bellus-opensplat -n 15000
```

(the project dir must be named to match the path baked into its opensfm
metadata — see above)

| Input | Status | Wall | Peak job GPU memory |
|---|---|---|---|
| studiokitchen video, 180 frames, 3840×2160 (8.3 MP) — measured 2026-09-12, cited here for comparison | **completed** all 15,000 steps | 902 s | 10,210 MiB |
| **bellus real stills, 122 images, 4048×3048 (12.3 MP)** | **failed — CUDA OOM** at step 6,530 of 15,000 (43%) | 845 s to failure | 10,318 MiB |

The failure: `CUDA out of memory. Tried to allocate 914.00 MiB. GPU 0 has a
total capacity of 11.58 GiB of which 635.62 MiB is free. ... this process has
9.48 GiB memory in use.`

**No real-stills Capture tested completes full-resolution OpenSplat Fitting
locally.** The one real-stills Capture available that also reconstructs
cleanly (bellus) does not fit, at a peak job memory almost identical to the
video run that did fit (10.3 GB vs 10.2 GB) — confirming, on real
photographs this time, ticket #8's standing finding that Fitting memory is
not predictable from resolution or image count and has to be measured per
Capture. It also closes the "not settled" item from the 2026-09-12 comment:
OpenSplat's placement threshold on real imagery is now known to sit at or
below 122 images / 12.3 MP, not merely suspected to.

**Not measured: `pacifica` (12 images, 12.2 MP), the only smaller real-stills
Capture on hand.** Time and disk budget ran out before this could be run.
Reproduction command, once a bellus-style ODM-CLI project exists for it:

```
docker run --rm --memory 32g --memory-swap 32g \
  -v ~/drone/datasets/odm_data_pacifica:/datasets/code opendronemap/odm:latest \
  --project-path /datasets --feature-quality low --pc-quality lowest \
  --use-3dmesh --orthophoto-resolution 5
# then, from the same host directory (rename to match /datasets/code if reused):
bash scripts/measure/opensplat-fit.sh ~/drone/datasets/odm_data_pacifica pacifica-opensplat -n 15000
```

If pacifica also fails, the honest conclusion is that full-resolution
OpenSplat Fitting of real stills does not fit this card at any Capture size
reachable with currently-available public imagery, and the placement rule
below should be read as unconditional rather than size-gated.

## Thresholds for ADR 0014

**Reconstruction (NodeODM/NodeODX path):**
- Local (4070 host), measured: Captures up to ~122 images at ~12–15 MP fit
  comfortably (peak 15.7 GiB RAM of the 32 GiB cap).
- Local fails, measured: 248 images at 18 MP (32 GiB cap hit).
- **Estimated** threshold for the Runner to use today: route to the 3090 any
  Capture estimated above ~150 images at this resolution class, or above
  ~20 GiB of estimated peak RAM by whatever cost model ticket #8's follow-on
  work builds. This is interpolated between one measured pass and one
  measured fail, not itself measured — start conservative, per ADR 0014's own
  instruction, and tighten with more runs between 122 and 248 images.
- **Gap:** at true 50 MP Capture resolution (2.7–4× the largest pixel count
  tested here), both the RAM ceiling and the image-count threshold are
  expected to be materially lower than these numbers, unmeasured.

**Fitting (OpenSplat, full resolution):**
- **Measured: route full-resolution Fitting of any real Capture off the local
  4070.** The smallest real-stills Capture that also reconstructs (122
  images, 12.3 MP) already exceeds the card's usable memory. This matches
  and reinforces the standing splatfacto finding
  (`docs/research/splat-first-runs-2026-09-10.md`) with a second engine and
  real photographs instead of video.
- Downscaling or capping densification (`--max-gaussians`, or a resolution
  divisor) could in principle bring Fitting back under the local ceiling, but
  neither is measured against quality yet — carried over unresolved from
  the 2026-09-12 comments.

## What remains unmeasured, and why

- **True 50 MP Capture resolution**, for both halves of the pipeline. No
  public OpenDroneMap sample dataset reaches it; closing this needs either a
  real Grid Mission Capture (ticket #11 / #20) or a synthetic 50 MP dataset,
  neither in scope for this session.
- **The 122–248 image crossover** for reconstruction — not run, for time.
- **`pacifica` Fitting** — not run, for time; command above.
- **The 3090's ceiling for either stage** — out of scope for this ticket's
  host and not touched here.
- **Quality cost of downscaling or capping gaussians to fit Fitting
  locally** — still nobody has measured this, on video or stills.
