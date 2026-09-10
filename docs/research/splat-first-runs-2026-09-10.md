# First splatfacto runs on the local host — 2026-09-10

Measured results from ticket #8's harness shakedown. **The input is video frames,
not the stills the project will actually capture**, so none of these numbers are
placement thresholds. What does transfer is where the memory goes and which
changes move it.

## Setup

| | |
|---|---|
| Host | `akamel-linux`, RTX 4070 SUPER, 12,282 MiB |
| Usable GPU memory | about 10,900 MiB — the production chat worker holds 1,381 MiB of the card permanently |
| Image | `ghcr.io/nerfstudio-project/nerfstudio:latest` — nerfstudio 1.1.5, gsplat 1.4.0, torch 2.1.2+cu118 |
| Input | ODM's StudioKitchen project, imported with `ns-process-data odm`: 180 frames at 3840×2160, full resolution |
| Harness | `scripts/measure/splat-fit.sh` |
| Target | 15,000 iterations, which is where splatfacto stops densifying by default |

Real Grid Mission stills are 8192×6144, roughly six times the pixels of these
frames.

## Run 1 — defaults

**Out of memory at step 8,990 of 15,000 (59.9%), after 745 seconds.**

- Job peak 10,472 MiB — all the headroom the card had.
- The failure was not in training. It was in `eval_iteration`, a periodic pass
  that renders every evaluation image at full resolution while training's memory
  is still held.
- PyTorch reported 1.22 GB reserved but unallocated: fragmentation.

## Run 2 — evaluation off, fragmentation-resistant allocator

`--steps-per-eval-all-images`, `--steps-per-eval-image` and
`--steps-per-eval-batch` set above the iteration count;
`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`.

**Out of memory at step 11,860 of 15,000 (79.1%), after 930 seconds.**

- Job peak 10,330 MiB.
- Reserved-but-unallocated memory fell from 1.22 GB to 95 MB. The allocator
  change fixed fragmentation.
- The failure was in training itself: `isect_tiles` tried to allocate 778 MB
  during densification.

The two changes bought about 2,900 more steps, a third further, and were not
enough.

## What this established

**Full-resolution Fitting does not fit this card, even on these small frames.**
Densification grows the gaussian count until step 15,000, and memory grows with
it. At full resolution the growth outruns roughly 10.9 GB of usable memory before
densification ends. Real stills carry six times the pixels, so this conclusion
only gets stronger on real data — it is the one finding here that does transfer
directly.

**For placement (ADR 0014), full-resolution Fitting of real Captures should be
expected to leave the local host.** Either it goes to the 24GB card, or it is made
to fit locally by capping densification or downscaling — both of which trade
quality, and neither has been measured.

**The failure arrives late.** Both runs died after 12 to 15 minutes, 60 to 80
percent of the way through. This is exactly the failure ADR 0014 was written to
avoid: expensive work spent before the run fails. It confirms that placement must
be decided up front from the Capture's size, not discovered by attempting.

**Evaluation should always be off in the Node.** It contributes nothing to the
fitted result, it caused the first failure, and it is also the only reason the
container downloads 233 MB of AlexNet weights on every run.

**The fragmentation fix should be kept.** It recovered over a gigabyte for free.

**Fitting time is not linear.** Iterations slowed from about 10 ms to 130–150 ms
as the gaussian count grew. An estimate taken from the first few hundred steps is
wrong by an order of magnitude, so the Runner cannot predict completion from early
progress, and any timeout has to allow for the slowdown.

**Checkpoints are about half a gigabyte each** — 548 MB at step 10,000 — which
matters on a host with this little free disk.

## Not measured, and not worth measuring on video

- the effect of `--pipeline.model.stop-split-at` on memory and quality
- the effect of downscaling on memory and quality
- the 3090's ceiling

All three need real stills to mean anything. The effect on quality in particular
cannot be judged on frames that were never going to become a deliverable.
