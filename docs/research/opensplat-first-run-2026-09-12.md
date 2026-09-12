# OpenSplat's first run on the local host — 2026-09-12

A direct comparison against the splatfacto runs of 2026-09-10, on the same
project, the same card and the same conditions. **The input is video frames, not
the stills the project will capture**, so nothing here says anything about
deliverable quality. What it does establish is that a full-resolution fit
finishes on this card with this engine, where splatfacto could not.

## Setup

| | |
|---|---|
| Host | `akamel-linux`, RTX 4070 SUPER, 12,282 MiB |
| Baseline occupancy | 1,501 MiB held by the production chat worker; the ollama embedding model was unloaded for the test |
| Engine | OpenSplat 1.2.1, commit 687cc91, built from source for this card (CUDA 12.1, libtorch 2.2.1) |
| Input | the same ODM project as the splatfacto runs: 180 frames at 3840×2160, full resolution |
| Command | `opensplat <project> -o splat.ply -n 15000`, everything else left at its defaults |
| Harness | `scripts/measure/opensplat-fit.sh` |

## Result

| | splatfacto, run 2 | OpenSplat |
|---|---|---|
| Outcome | **out of memory at step 11,860 of 15,000** | **completed 15,000 of 15,000** |
| Wall time | 930 s to failure | **902 s to completion** |
| Peak job memory | 10,330 MiB | 10,210 MiB |
| Output | none | `splat.ply`, 18 MB |

Both engines reached the same memory ceiling. The difference is what happened
there: splatfacto kept adding gaussians until the allocation failed, while
OpenSplat pruned and carried on. Its memory peaked at 11,509 MiB of card total
around step 6,600, fell back to 10,325 MiB at a cleanup pass, and flattened once
densification stopped at step 7,500 — OpenSplat stops densifying at half the
iteration count by default, which is why the second half of the run is
memory-stable.

Iterations also ran roughly twice as fast: 60 ms per step averaged over the whole
run, against 130–150 ms for splatfacto in its late, heavy steps.

## The finding that matters for placement

**The result contains 75,392 gaussians.** At the ~2,000 bytes per gaussian that
OpenSplat's own README quotes, those account for roughly 150 MiB. The run used
about 10.2 GB.

The scene is therefore not what filled the card. The obvious suspect was
OpenSplat's GPU image cache, since it holds the source images on the card by
default. The run was repeated with `--no-gpu-cache` to test that:

| | cache on | cache off |
|---|---|---|
| Wall time | 902 s | 921 s |
| Peak job memory | 10,210 MiB | 10,073 MiB |
| Gaussians | 75,392 | 75,414 |

**The cache accounts for 137 MiB, and the hypothesis was wrong.** Turning it off
saves 1.3% of the memory and costs 2% in time. Neither the gaussians nor the
cached images explain 10 GB.

What remains is the per-step work on one image: rendering a 3840×2160 view and
holding the backward pass for it. That points at memory scaling with **the pixels
in a single image**, rather than with the number of images or the size of the
scene. If it holds, real Captures are still the harder case, but for a different
reason than assumed: a 50 MP still carries six times the pixels of these frames.
**This is untested.** The measurement that discriminates it is the same run at
half resolution, where this explanation predicts roughly a fourfold drop.

- `--max-gaussians` never bound here. The default 5,000,000 was never
  approached, so the cap that made OpenSplat attractive was not what made this
  run finish. What made it finish was densification stopping halfway.
- The comparison with splatfacto is not like for like on scene detail. 75,392
  gaussians is a sparse result; splatfacto was still densifying hard when it
  died. **Nothing here shows OpenSplat produces an equal-quality scene** — only
  that it produces one at all.

## What this does and does not settle

**Settled:** a full-resolution fit of this project completes on the 4070 with
OpenSplat, in 15 minutes, with an output file. The same project defeated
splatfacto twice.

**Not settled, and needed before ADR 0004 is revisited:**

- Quality, on real stills, judged against splatfacto's output at whatever
  downscale lets splatfacto finish.
- Memory behaviour on 50 MP stills, and whether memory follows the pixels in one
  image as the half-resolution test suggests.
- Whether the reported failures of OpenSplat on large datasets — killed by
  running out of ordinary system memory rather than card memory — appear at our
  Capture sizes.
- Whether OpenSplat's sparser output holds up in the automatic cleaning and gate
  described in the splat cleaning research, or whether a sparse scene simply
  passes gates that a denser one would fail.

## Practical notes

- OpenSplat reads the ODM project directly, with no conversion step, which
  removes the principal-point loss that ADR 0004 records for the COLMAP path.
- It reads the **absolute image paths recorded inside the ODM project**, so the
  project must be mounted at the path ODM saw when it ran. The first attempt
  failed in 45 seconds for exactly this reason.
- There is no published binary or container image; the image is built from
  source and is 23.4 GB, which took the host from 48 GB free to 14 GB.
- The engine is AGPL-3.0. Running it as a separate process carries no
  obligations, the same position as ADR 0001 takes for ODM.
