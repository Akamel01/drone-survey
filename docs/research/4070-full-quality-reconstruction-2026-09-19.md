# Reconstruction at full quality on the 4070 — measured, stage by stage

Issue #40, the Orthomosaic half. The thresholds recorded on 13 September were
measured at `--feature-quality low --pc-quality lowest`, settings the operator
has since rejected. This pass measures what `high` and `ultra` actually cost on
this host, per ODM stage.

Every figure was read back from `~/drone/q40/results/<run>/` on `akamel-linux`:
`samples.csv` (a sample every 2 s carrying container RAM, host CPU, card
memory and disk, tagged with the ODM stage the log was in), `odm.log`,
`quality.json` and `run.txt`. Harness:
`scripts/measure/odm-stage-profile.sh`, now committed.

Host: 28 threads, 62 GiB RAM shared with production services, RTX 4070 SUPER.
Containers capped at 32 GiB RAM, which is the limit ticket #6 put in place to
protect the other services on this machine.

## Captures

| Name | Images | Resolution |
|---|---|---|
| bellus | 122 | 4048×3048 (12.3 MP) |
| bellus40 | 40 (subset) | 4048×3048 |
| trakai | 360 | 8192×5460 (44.7 MP) |
| trakai12 | 12 (subset) | 8192×5460 |

Subsets exist so an expensive setting could be measured without spending the
disk budget; they are labelled as subsets everywhere below.

## Full quality on the full golden Capture

`recon-bellus-high`: 122 images, `--feature-quality high --pc-quality high`,
DSM and orthophoto at 10 cm rather than the 5 m downgrade used in September.

| Stage | Wall | Peak RAM | Peak disk |
|---|---|---|---|
| opensfm | 145 s | 10.0 GiB | 2.95 GiB |
| openmvs | 405 s | 11.5 GiB | 7.01 GiB |
| odm_filterpoints | 10 s | 8.4 GiB | 7.40 GiB |
| odm_meshing | 119 s | 21.8 GiB | 8.61 GiB |
| **mvs_texturing** | 268 s | **27.3 GiB** | 8.26 GiB |
| odm_georeferencing | 12 s | 9.2 GiB | 8.35 GiB |
| odm_dem | 30 s | 16.5 GiB | **12.31 GiB** |
| odm_orthophoto | 20 s | 14.1 GiB | 9.69 GiB |
| odm_report | 14 s | 11.0 GiB | 9.72 GiB |
| **total** | **1,027 s** | **27.3 GiB** | **12.3 GiB** |

**122 images at 12.3 MP complete at high quality in 17 minutes**, and the
binding resource is RAM in `mvs_texturing`, at 27.3 GiB against the 32 GiB cap.
That is 85% of the cap: the same Capture at a larger image size will not fit,
and texturing is where it will fail.

Quality of that run, measured rather than assumed: 3.84 M dense points,
398,108 mesh faces, orthophoto 11,303×16,231 px at **3.75 cm/px**, against the
5 cm/px reference orthomosaic of the same Capture.

## What the quality settings cost (bellus40 subset)

| Run | Settings | Wall | Peak RAM | Peak card |
|---|---|---|---|---|
| `recon-bellus40-high` | high / high | 377 s | 18.5 GiB (texturing) | — |
| `recon-bellus40-ultra` | ultra / ultra | 587 s | 23.6 GiB (meshing) | — |

`ultra` costs 56% more wall clock and 5 GiB more RAM than `high`. The clearest
difference is in the solve: `opensfm` peaks at 7.4 GiB on `high` and **22.4 GiB
on `ultra`**, a threefold jump for 40 images. On the full 122-image Capture
that alone would approach the cap before texturing is reached.

## The GPU image is worth using, for one stage

`opendronemap/odm:3.6.2-gpu`, same settings, same subset:

| Capture | Setting | openmvs on CPU | openmvs on GPU | Card used |
|---|---|---|---|---|
| bellus40 | high | 71 s | **14 s** | 2,018 MiB |
| bellus40 | ultra | 263 s | **65 s** | 2,268 MiB |
| trakai12 | ultra | — | 28 s | 2,322 MiB |

Dense matching runs four to five times faster on the card and costs about
2.2 GiB of video memory, which is modest next to the splat Fitting that will
follow it. `opensfm` is unchanged — it does not use the card — so the win is
confined to `openmvs`, and it is worth taking there. Nothing else in the
pipeline moved to the card.

## Depth maps at native resolution: the disk and RAM question

`recon-trakai12-dmap-L0` and `-L1`, 12 images at 44.7 MP, OpenMVS
`DensifyPointCloud` at two resolution levels:

| Level | Meaning | Wall | Host RAM (VmPeak) | Card |
|---|---|---|---|---|
| L1 | half resolution | 24 s | 12.6 GiB | 3,134 MiB |
| **L0** | **native 44.7 MP** | 116 s | **25.6 GiB** | 6,718 MiB |

Native-resolution depth maps cost roughly double the RAM and five times the
wall clock of half resolution, on twelve images. At 25.6 GiB, a 12-image batch
already sits near the 32 GiB container cap, which means **native-resolution
depth maps on a 300-image Site will not fit inside the current cap** and need
either a raised cap during off-hours or OpenMVS working in smaller batches.
This is the measurement the earlier research asked for, and the disk figure it
estimated (about 360 GB for 300 images) could not be confirmed here: the depth
maps were not retained, so that estimate stands unverified.

## Levers that did not pay

- **`--max-concurrency 8`** (`recon-bellus-high-mc8`): peak RAM falls from
  27.3 to 19.3 GiB, but the run takes 1,268 s instead of 1,027 s, and
  `openmvs` alone goes from 405 s to 587 s. A real lever if RAM is the wall,
  at about 25% more wall clock.
- **Split-merge** (`recon-bellus-high-split`, `--split 40 --split-overlap
  150`): **did not complete.** The log ends with the process receiving a TERM
  signal during `odm_dem` on the first submodel, 1,195 s in. Whatever killed it
  was outside the run. This lever is still unmeasured, and it is the one that
  matters most for image counts beyond 122, so it should be repeated.

## Recommended settings, and the ceiling they imply

For a Capture at this host's current limits: `--feature-quality high`,
`--pc-quality high`, orthophoto and DEM at the real ground sampling distance,
the GPU image for dense matching, and `--max-concurrency 8` when RAM is tight.
Reserve `ultra` for small Captures until the solve's RAM is bounded.

**Measured ceiling: 122 images at 12.3 MP, at 85% of the RAM cap.** Everything
beyond that is an estimate: RAM in texturing scales with the texture area, so a
50 MP Capture of the same footprint is expected to exceed the cap, and the
honest next step is a measured run on a 40-to-60 image Trakai subset at full
quality rather than an extrapolation from here.
