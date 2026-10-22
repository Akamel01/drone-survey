# Fitting a Gaussian Splat at full resolution on the 4070 — measured

Issue #40. Every number below was read back from the raw sample files and logs
under `~/drone/q40/results/<run>/` on `akamel-linux` (each run keeps
`command.txt`, `samples.csv`, the trainer log and `metrics.json`). The
orchestrator recomputed the headline figures from `samples.csv` rather than
trusting the summaries.

Host: RTX 4070 SUPER, 11.58 GiB usable video memory, of which another service
holds 1,501 MiB throughout. Every figure in the "card" column below is peak
card usage **minus** that baseline. Containers were capped at 32 GiB RAM.

## Captures used

| Name | Images | Resolution | Source |
|---|---|---|---|
| bellus | 122 | 4048×3048 (12.3 MP) | the golden Capture, `~/drone/golden/bellus-v1` |
| trakai | 360 | 8192×5460 (44.7 MP) | Esri Trakai Island Castle, DJI Zenmuse P1, CC BY-NC-SA, internal tests only |

Trakai is the first Capture measured here at a resolution close to a real
Grid Mission still (44.7 MP against the Mini 5 Pro's 50 MP). Camera solves came
from ODM at `--feature-quality high` (bellus) and `ultra` (trakai).

## The result that matters: OpenSplat's video-memory image cache caused the OOM

ADR 0018's bar is a measured output, not an exit code, so both runs below are
scored on 15 held-out views rendered at full resolution by one shared evaluator
(`eval_splat.py`: PSNR, SSIM, LPIPS, rendering in 2,048 px blocks and stitching
so the score is of whole images, not crops).

| Run | Result | Card | Host RAM | Wall | Gaussians | PSNR | SSIM | LPIPS |
|---|---|---|---|---|---|---|---|---|
| `fit-osp-default-15k` | **OOM at step 7,590 of 15,000** | 10,326 MiB | 24.0 GiB | 653 s | 1.53 M | — | — | — |
| `fit-osp-nocache-15k` (`--no-gpu-cache`) | **completed 15,000** | **5,410 MiB** | 24.7 GiB | 1,539 s | 1.22 M | 18.73 | 0.481 | 0.625 |

Turning off the cache halves peak video memory and the same Capture that could
not finish now finishes, at 2.4× the wall clock. This is the first
full-resolution splat of real drone stills to complete on this card.

**The cost is host RAM, and that is the wall for a real Site.** OpenSplat loads
every image into RAM uncompressed; 122 images at 12.3 MP already cost 24.7 GiB.
At 44.7 MP that is roughly 0.6 GiB per image, so a 300-image Site needs on the
order of 180 GiB. The host has 62 GiB. **OpenSplat cannot fit a real Site at
full resolution on this machine at any setting**, which is why the rest of the
work moved to gsplat.

## gsplat: the Gaussian budget binds before the pixels do

Defaults, no cap, on bellus:

| Run | Downscale | Result | Allocated | Card | Wall | Gaussians |
|---|---|---|---|---|---|---|
| `fit-gs-default-df1` | none | OOM at 9,101/30,000 | 8,508 MiB | 9,912 MiB | 929 s | 5.43 M |
| `fit-gs-default-df2` | ½ | OOM at 6,301/30,000 | 8,231 MiB | 10,050 MiB | 435 s | 5.46 M |
| `fit-gs-default-df4` | ¼ | OOM at 5,101/30,000 | 8,120 MiB | 9,514 MiB | 237 s | 5.44 M |

All three died at about the same Gaussian count regardless of image size. Under
default densification the model's growth, not the resolution, exhausts the card
— so **lowering image quality would not have helped**, and the fix is a cap on
the model rather than a cut to the imagery.

## Full-resolution 45 MP Trakai, with the cap in place

All runs: MCMC strategy, `--strategy.cap-max 3000000`, `--packed`,
`data_factor 1` (no downscaling), 6,000 steps,
`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`.

| Run | Technique | Result | Allocated | Card | Host RAM | Wall |
|---|---|---|---|---|---|---|
| `fit-t-g2-full` | whole frames | OOM at 3,705/6,000 | 9,939 MiB | 10,350 MiB | 8.1 GiB | 1,335 s |
| `fit-t-g2-patch4096` | 4,096 px patches | OOM at 4,104/6,000 | 8,498 MiB | 10,332 MiB | 5.3 GiB | 821 s |
| `fit-t-g2-patch2048` | 2,048 px patches | OOM at 3,001/6,000 | 7,902 MiB | 8,726 MiB | 3.4 GiB | 404 s |
| `fit-t-g2-tile2048` | **2,048 px tiles** | **completed 6,000** | **6,345 MiB** | **7,464 MiB** | 8.5 GiB | 3,433 s |
| `fit-t-g2-full-rts32` | rasterizer tile 32 | failed at step 0 | — | — | — | 27 s |
| `fit-t-g2-tile2048-rts32` | rasterizer tile 32 | failed at step 0 | — | — | — | 27 s |

**Tiled training is the only configuration that completed a 45 MP Capture at
full resolution**, at 6.3 GiB allocated against a 10 GiB ceiling, with 5 GiB of
headroom left over the other service's share. It reached the 3 M Gaussian cap,
which means the cap, not the card, ended the growth.

Patches reduce memory but did not survive: they still carry the full Gaussian
population, and the run dies once the model grows into the remaining space. The
`rts32` runs raised the rasterizer's own tile size to 32 px and both died
immediately with `CUDA error: too many resources requested for launch` — that
kernel will not launch at that tile size on this card. A dead end, not a
tuning knob.

## Scored: full resolution against half resolution (measured 2026-09-24)

The tiled run above was never scored. Wave 4 repeated it with checkpointing,
next to a half-resolution control. Both trained to completion, but their
scoring ran out of video memory at 45 MP, and the harness then deleted both
checkpoints. Two changes followed. The evaluator now scores in 2,048 px
blocks. PSNR is taken from the whole image's squared error, SSIM is averaged
over the blocks weighted by pixel count, and LPIPS over 1,024 px blocks. And a
checkpoint now survives a failed score. A 300-step smoke fit proved scoring at
45 MP before either hour-long run started. Wave 4b is the result.

Both runs used the same recipe as above: MCMC, `cap-max 3000000`, `--packed`,
6,000 steps. They were scored by the same evaluator on the same 45 held-out
views, **both rendered and scored at the full 8,191×5,459**. The tiled trainer
renders every tile of one whole image and accumulates the gradients before a
single optimizer step, so a step covers one full image in both runs. The only
differences are training resolution and tiling.

| Run | Trained at | Wall | Allocated | Card | Host RAM | PSNR | SSIM | LPIPS |
|---|---|---|---|---|---|---|---|---|
| `fit-t-g2-tile2048-scored2` | full, 2,048 px tiles | 3,516 s | 6,936 MiB | 8,044 MiB | 8.6 GiB | **21.82** | 0.575 | 0.661 |
| `fit-t-g2-df2-control2` | half, whole frames | **818 s** | 7,394 MiB | 8,714 MiB | 3.4 GiB | 21.59 | **0.584** | **0.630** |

LPIPS is lower-is-better. Both runs reached the 3 M Gaussian cap.

**At this budget, full-resolution training buys nothing measurable, and takes
4.3 times as long.** PSNR moves 0.2 dB in its favour, but view by view it wins
on 23 of 45, a coin toss. SSIM favours half resolution on 38 of 45 views, and
LPIPS on 42 of 45. The medians agree: PSNR 22.09 against 22.05.

What this does and does not show:

- **It is a 6,000-step result.** The 315 training images are each seen about nineteen
  times, and both scores are low in absolute terms. A production fit runs
  30,000 steps. Whether full resolution pulls ahead once the model has had
  time to use the extra detail is the open question. One overnight pair at
  30,000 steps answers it: about five hours and one hour.
- **Tiling and resolution move together here.** A whole-frame full-resolution
  run would separate them, but it does not fit the card (`fit-t-g2-full`,
  above). So a small cost from tiling itself cannot be ruled out, and it would
  show up as exactly this pattern.
- **Both fit the card.** Half resolution uses slightly *more* video memory,
  because its whole frame is larger than one 2,048 px tile. Neither is close to
  the 10 GiB ceiling.

## What to set today

- **OpenSplat**: always `--no-gpu-cache`. It is the difference between a run
  that finishes and one that does not, and it costs wall clock, which the
  operator has already said is the cheap resource.
- **A real Site (300 images at 50 MP)**: gsplat, MCMC with an explicit
  `cap-max 3000000`, `--packed`, `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`.
  - **Measured, not estimated:** 360 images at 44.7 MP fit the card either
    way, at 8.0-8.7 GiB.
  - **Resolution:** full resolution in 2,048 px tiles (`simple_trainer_tiles.py`,
    `--data_factor 1 --tile_size 2048`) is the full-quality setting.
    Half-resolution whole frames (`--data_factor 2`) scored as well at 6,000
    steps in a quarter of the time. Take half resolution only if the
    30,000-step pair confirms it.
  - **Wall clock:** 30,000 steps is about five hours tiled at full resolution,
    and about 70 minutes at half.
- **Do not lower image resolution to *fit*.** On this hardware it does not
  help memory: the uncapped default runs failed at the same model size at every
  resolution tested. The cap is what makes a run fit. Resolution is a question
  of quality and time only.

Harness, committed in `scripts/measure/gsplat/`: `fit2.sh` (one measured run),
`eval_splat.py` (the shared evaluator) and `q40-gsplat-937e299.patch` (the
tiled trainer, verified to rebuild the exact files that ran).
