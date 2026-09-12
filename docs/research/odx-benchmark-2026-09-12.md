# ODX against ODM on our own host — 2026-09-12

The fork's headline claim is that it is faster than OpenDroneMap. No independent
benchmark of that claim exists anywhere, so this is one: the same dataset, the
same options, the same machine, back to back.

**The input is video frames of a kitchen, not the stills the project will
capture.** Nothing here judges deliverable quality. What it does test is whether
one engine does the same work faster than the other.

## Setup

| | |
|---|---|
| Host | `akamel-linux`, i7-14700F, 62 GB RAM, Ubuntu 24.04. CPU images on both sides; no GPU variant involved |
| Dataset | StudioKitchen: 180 frames at 3840×2160, no GPS |
| Options | `feature-quality low`, `pc-quality lowest`, `use-3dmesh true`, `orthophoto-resolution 5` — identical on both |
| Control | `opendronemap/nodeodm:latest` — NodeODM 2.2.4, ODM 3.5.6 |
| Fork | `webodm/nodeodx:latest` — NodeODX 2.3.1, ODX 3.8.3 |
| Harness | `scripts/measure/nodeodm-bench.sh` |

**A fresh control was run rather than reusing the 2026-09-10 measurement.** That
earlier run of the same dataset and options took 467 s wall against today's
406 s, purely because the host is quieter now. Comparing the fork against the
older number would have handed it a 13% head start it did not earn.

## Result

| | ODM 3.5.6 | ODX 3.8.3 |
|---|---|---|
| Wall time | 406 s | **271 s** |
| Processing time | 397 s | **258 s** |
| Delivered archive | 78.0 MB | 62.6 MB |

**33% faster.** Then the outputs were compared, and the reason changed the
verdict:

| | ODM 3.5.6 | ODX 3.8.3 |
|---|---|---|
| Cameras registered | **178 of 180** | 164 of 180 |
| Sparse points | **6,826** | 4,022 |
| Dense points | **1,025,371** | 299,542 |
| Point cloud on disk | 4.3 MB | 1.2 MB |
| Mesh | 170,889 faces / 165,728 vertices | 154,442 faces / 173,841 vertices |
| Orthophoto | 796×350 at 0.1 m/px, 25% valid pixels | 355×355 at 0.1 m/px, 29% valid pixels |

**The speed came from reconstructing less.** ODX dropped 14 images the control
kept, recovered 41% fewer sparse points, and produced a dense cloud with 71%
fewer points. A third less time for two thirds less reconstruction is not a
speedup.

The mesh is the exception, and it is not evidence to the contrary: meshing works
to a face budget, so a sparser cloud still yields a mesh of similar size. It is
built from less.

The orthophoto cannot settle anything on this dataset. Both engines projected
orbit frames with no GPS, where neither result is a real map
([ADR 0002](../adr/0002-stills-from-grid-missions-not-video.md)), and the two
differ in extent rather than in resolution.

## The caveat that keeps this open

**Identical option names are not identical settings.** `feature-quality low` and
`pc-quality lowest` are passed to both engines, but what each engine does with
them is its own business, and ODX 3.8.3 changed related behaviour — ground
resolution is now estimated from the bottom 10th percentile rather than the
average. So this measures the fork at equal *settings*, not at equal *work*.

The fair question is what ODX costs to produce what ODM produced. A second ODX
run, one notch higher at `feature-quality medium` and `pc-quality low`, answers
it from the other side:

| | ODM 3.5.6, low | ODX 3.8.3, low | ODX 3.8.3, medium |
|---|---|---|---|
| Wall time | 406 s | 271 s | **526 s** |
| Cameras registered | 178 of 180 | 164 of 180 | **180 of 180** |
| Sparse points | 6,826 | 4,022 | **14,570** |
| Dense points | 1,025,371 | 299,542 | **1,271,088** |
| Mesh faces | 170,889 | 154,442 | 158,229 |
| Archive | 78.0 MB | 62.6 MB | 92.5 MB |

**ODX beat the control on every reconstruction measure, and took 30% longer to
do it.** So the two runs bracket the answer rather than settling it: the setting
that is faster produces less, and the setting that produces more is slower.
Matching ODM's output exactly would need a setting between the two, costing
somewhere between 271 s and 526 s.

**We are not going to interpolate that into a number.** The same arithmetic-on-
two-points reasoning was wrong three times in one afternoon while measuring
OpenSplat's memory. What the evidence supports is narrower: **no tested ODX
setting produced ODM's output faster than ODM did.**

## What stands regardless

- **NodeODX's REST interface matches NodeODM's**, confirmed both by diffing the
  published API documents and by querying a live container: the same endpoints,
  the same option names, and `maxParallelTasks: 1` by default. Switching engines
  would cost close to nothing in our code.
- **`cog` defaults to `false` in NodeODX**, where NodeODM turns it on and
  delivers a file that fails GDAL's validator. The conversion code itself is
  unchanged between the two engines apart from a renamed log call and a predictor
  value that became a parameter, so **`export-cog` stays a real Node either way**
  ([ADR 0011](../adr/0011-static-delivery-bundles.md) depends on the byte layout
  it gets right).
- **`/info` gained `engine` and `engineVersion` fields**, which is additive and
  breaks nothing written against NodeODM.

## Not settled

- Whether ODX is faster at equal output, which the second run addresses.
- Whether either engine's orthophoto is better, which needs real stills from a
  Grid Mission.
- Whether ODX's newer base image produces a validator-passing COG, which was not
  tested because the flag is off by default and `export-cog` stays regardless.
