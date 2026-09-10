# First ODM runs on the local host — 2026-09-10

Measured results from ticket #6: OpenDroneMap standing up as a container on the
local RTX 4070 host and processing a real dataset end to end. This is the first
observation in the project rather than a research claim, so the numbers below
are what actually happened on this machine.

## Setup

| | |
|---|---|
| Host | `akamel-linux` — i7-14700F (28 threads), 62GB RAM, RTX 4070 SUPER, Ubuntu 24.04 |
| Image | `opendronemap/odm:latest`, 2.39GB — the CPU image, not the GPU variant |
| Container limits | `--memory 32g --memory-swap 32g`, to protect the production stack sharing the host |
| Dataset | StudioKitchen: 180 frames extracted from 4K video, 3840×2160, 73MB, **no GPS** |
| Settings | `--feature-quality medium --pc-quality medium --orthophoto-resolution 5` |

The dataset is deliberately the wrong kind of input for an Orthomosaic — an orbit
shot as video with no geotags. The ticket's purpose was plumbing, and the wrong
input turned out to be informative.

## Run 1 — full pipeline

**Failed at the meshing stage after 12m58s.**

| Stage | Runtime |
|---|---|
| dataset, split, merge | under 1s |
| opensfm (camera solve) | 363s |
| openmvs (dense reconstruction) | 375s |
| odm_filterpoints | 4s |
| odm_meshing | failed |

| Resource | Peak |
|---|---|
| RAM | 4.7 GiB of the 32 GiB cap |
| Disk | 4.0 GB during meshing; 3.4 GB at rest, of which 3.2 GB is `opensfm/` |
| CPU | ~105% during feature matching; ~2600% (26 of 28 threads) during dense reconstruction |

**The camera solve was clean.** 180 of 180 frames registered into a single
component with 19,879 sparse points. ODM chose the `brown` camera model on its own
and calibrated a non-zero principal point (`c_x` 0.0064, `c_y` 0.0004), which is
the case the COLMAP export preserves — see the note on ticket #22.

**Dense reconstruction was clean.** 5,446,096 points at 1cm spacing.

**Meshing failed** in the 2.5D elevation-model step with *"strange values in the
reconstruction"*. A 2.5D mesh assumes a ground plane viewed from above. Frames
from an orbit with no GPS give the reconstruction an arbitrary orientation and
scale, so there is no ground plane to fit.

## Run 2 — resumed from meshing with a full 3D mesh

`--rerun-from odm_meshing --use-3dmesh`, reusing the solve and dense cloud from run 1.

**Exited 0 in 13 seconds, and the output is unusable.**

- The mesh came out at **467 vertices and 934 faces** from a 5.4-million-point
  cloud — a surface reconstruction collapse, not a mesh.
- The orthophoto is 3173×1468 at 0.1 m/px over a claimed 11,633 m² for what is a
  kitchen. **12.9% of its pixels are valid**, forming a single thin diagonal smear.

## What this established

**Exit code is not evidence of success.** Run 2 reported success and produced
garbage. Every Node needs an output validity check, not just a status check: mesh
face count relative to cloud size, valid-pixel percentage in an orthophoto,
registered-frame ratio after a solve. This belongs in the verification bar on
ticket #13.

**ADR 0002 holds on real data.** The camera solve and dense reconstruction both
work on video frames; it is the projection to a top-down map that fails, precisely
because there is no geotag or ground plane. The failure is in the part ADR 0002
predicted, not elsewhere.

**Resume exists at stage granularity.** `--rerun-from` skipped twelve minutes of
completed work and restarted at the failed stage. That is the resume mechanism
ADR 0006 said we would have to build ourselves, already present inside ODM, and it
argues for splitting the `reconstruct` Node along ODM's own stage boundaries.

**The resource baseline is modest.** 180 frames at 8 megapixels used 4.7 GiB of
RAM and 4 GB of disk. Real grid Captures are 50-megapixel stills, roughly six
times the pixels per frame, so this is a floor rather than a threshold. The
threshold measurements in ticket #8 still have to be taken on real imagery.

**The GPU was not used.** The `latest` image is CPU-only; the GPU variant is a
separate image. Research says GPU acceleration in ODM covers feature extraction
only, and this run also used HAHOG features with bag-of-words matching rather
than SIFT, so the GPU image's actual benefit on this host is still unmeasured.

**Operational details the Runner must handle:**

- Ports cannot be assumed. Port 3100 is already taken on this host by the
  production stack, so services must select a free port rather than use a fixed one.
- `gdalinfo` is not on the ODM image's path, and `strings` is not installed on the
  host. Validity checks need their own tooling rather than borrowing from either.

## Run 3 — driven through the NodeODM API

Ticket #6 asks for ODM driven over its API rather than by the command line, which
runs 1 and 2 did not do.

| | |
|---|---|
| Service | `opendronemap/nodeodm:latest` — NodeODM 2.2.4, ODM engine 3.5.6 |
| Binding | `127.0.0.1:3180`, localhost only; port 3100 was already taken by the production stack |
| Submission | `POST /task/new`, multipart, 180 images plus an options array; polled `/task/{uuid}/info` every 30s; results fetched as `all.zip` |
| Options sent | `feature-quality low`, `pc-quality lowest`, `use-3dmesh true`, `orthophoto-resolution 5` |
| Options NodeODM added | `pc-ept`, `cog`, `gltf` |

**Completed in 7m47s** (441s of processing), peak RAM 4.77 GiB, 1.2 GB of task
data held inside the container, and a 74 MB `all.zip`.

**The output was checked, not assumed.** Run 2 had already shown that a success
status proves nothing.

| Output | Result |
|---|---|
| Textured model | **177,795 faces, 172,637 vertices** — a real mesh; GLB 7.6 MB |
| Orthophoto | 714×353 at 0.1 m/px, **30% valid pixels**, a recognisable top-down view of the kitchen counter |
| Point cloud | LAZ 3.6 MB with an Entwine point-cloud build |
| Report | `shots.geojson`, `stats.json`, `report.pdf` |

Same frames, lower quality settings than run 2, and a genuine mesh rather than a
collapsed one. Run 2 differed by resuming meshing after a failed 2.5D pass; this
run built the 3D mesh from the start. That is the observed difference, but the
cause of run 2's collapse has not been isolated.

The orthophoto is still not a map, for the reason ADR 0002 gives — orbit frames
with no GPS. It is a projection of real reconstruction content, where run 2's was a
smear.

### The `cog` option does not produce a Cloud-Optimized GeoTIFF

NodeODM turned on `cog` by default, and the delivered orthophoto fails GDAL's own
validator:

- the main IFD is at byte offset 1,009,656 rather than 8
- image blocks precede their IFD
- blocks are 714×2 strips rather than tiles, with no overviews

A single `gdal_translate -of COG -co COMPRESS=DEFLATE` produces a file that
validates, with 512×512 tiles and an overview, at 277 KB rather than 1,011 KB.
**`export-cog` is therefore a real Node and cannot be delegated to the flag.**
Its output must pass the validator, since range-request delivery in ADR 0011
depends on exactly the byte layout this file gets wrong.

### What the API run adds

- **The Runner should drive NodeODM, not the CLI.** Submission, polling and
  retrieval all worked unattended over HTTP.
- **NodeODM enforces one task at a time by default** (`maxParallelTasks: 1`). The
  concurrency default adopted on ticket #12 is already enforced by the engine
  rather than something the Runner has to implement.
- **The native nerfstudio importer's inputs arrive with the download.**
  `all.zip` contains `shots.geojson` and `cameras.json`, so the Gaussian
  Splatting tail can consume an API run directly.
- **Task data lives inside the container** — 1.2 GB for this job — so on a host
  with disk this tight, tasks need removing once their results are retrieved.
