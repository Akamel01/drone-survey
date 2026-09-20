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

## The gap this report does not close

**The tiled run has no quality score.** It was launched with
`--save_steps 999999`, so no checkpoint was written (its `train/` directory
holds 40 KB), and the evaluator never ran against it. Its memory behaviour is
measured; its fidelity is not. Nothing here yet proves tiled training at
2,048 px matches whole-frame training on the same Capture, which is the claim
the operator's "no reduced quality" rule actually depends on.

The next run should be the same recipe with checkpointing on and the shared
evaluator applied, against a half-resolution control scored the same way. Until
that exists, "tiles win" is a memory result only.

## What to set today

- **OpenSplat**: always `--no-gpu-cache`. It is the difference between a run
  that finishes and one that does not, and it costs wall clock, which the
  operator has already said is the cheap resource.
- **A real Site (300 images at 50 MP)**: gsplat, MCMC with an explicit
  `cap-max`, `--packed`, tiled at 2,048 px, full resolution. Estimated from the
  Trakai measurement, not measured: the per-image cost is bounded by the tile,
  so the card should hold; host RAM and wall clock scale with image count, and
  6,000 steps on 360 images took 57 minutes, so a 30,000-step production fit is
  a five-to-six-hour overnight job.
- **Do not lower image resolution to fit.** On this hardware it does not help:
  the default runs failed at the same model size at every resolution tested.
