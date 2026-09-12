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

So on this input **the memory was almost entirely the cached images, not the
scene**. OpenSplat loads and caches the source images on the GPU by default, and
180 frames at 3840×2160 is what filled the card. That has direct consequences:

- `--no-gpu-cache` is the first lever to pull, not `--max-gaussians`. The cap
  never bound here; the default 5,000,000 was never approached.
- **Real Captures are the harder case.** 50 MP stills carry six times the pixels
  of these frames, so the cache grows with them. Whether a real Capture fits
  depends on how many images it holds, and that is still unmeasured.
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
- Memory behaviour on 50 MP stills, with and without the GPU image cache.
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
