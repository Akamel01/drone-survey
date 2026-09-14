# Golden Capture v1: odm_data_pacifica, for the Orthomosaic Pipeline

#15 (interim version, per its own scoping -- "the real first-Site subset
replaces it later"). This is the fixture ADR 0018's end-to-end pass and any
future regression check for `nodes/solve`, `nodes/register`,
`nodes/reconstruct`, `nodes/export-cog` runs against, until a real Site with
Anchors has been flown.

## Dataset

**OpenDroneMap's own `odm_data_pacifica` sample** (Michele Tobias' Pacifica
dataset; `https://github.com/OpenDroneMap/odm_data_pacifica`), the smallest
of the four real ODM sample datasets already present on the compute host
(`odm_data_pacifica` 12 images/67MB vs. `odm_data_aukerman` 77/1.1GB,
`odm_data_bellus` 122/1.5GB, `odm_data_waterbury` 248/3.6GB) --
chosen specifically to be cheap enough to run repeatedly.

**It has no GPS.** Checked directly (`exiftool -GPSLatitude -GPSLongitude`
on all 12 frames): no image carries a geotag. This has two real
consequences, stated plainly rather than glossed over:

1. ODM's `exif-audit` Node (existing, out of this ticket's scope) hard-fails
   a Capture missing GPS by design (docs/design.md §4, ADR 0018). So the
   *committed* `pipeline/manifests/orthomosaic.json`, run from `ingest`
   through `export-cog` exactly as checked in, **does not complete** on this
   dataset -- it stops at `exif-audit`, correctly, per that Node's own
   contract. This is not a defect in the Nodes this ticket built; it is a
   real mismatch between a generic third-party photogrammetry sample (shot
   handheld/kited, auto-exposure, no geotag) and this project's own Capture
   standard (locked exposure, GPS on every frame, docs/design.md §5). A real
   first Site, flown to that standard, will clear `exif-audit` normally.
2. Without GPS, OpenDroneMap's structure-from-motion has no metric
   reference, so the whole reconstruction -- and the orthophoto's pixel
   scale and CRS -- are internally consistent but **not real-world
   georeferenced**. `odm_report/shots.geojson`'s own geometry for this run
   reports coordinates like `[-7.488, -0.00044, -0.022]`: a real-looking
   longitude paired with a near-zero latitude, the signature of ODM
   stamping an arbitrary local origin rather than a real GPS-derived one.
   Distances and position in this golden Capture's outputs mean nothing
   outside this fixture. That is acceptable for what this fixture is for --
   catching a regression in the pipeline's *mechanics* (does solve still
   solve, does the mesh still form, does the COG still validate) -- and
   unacceptable for anything claiming real-world accuracy, which is exactly
   why #15 calls this interim.

**Given (1), verification of the actual Runner pass used a manual
work-around, recorded here rather than hidden**: the Runner's own resume
mechanism (`state.json`, ADR 0006) was pre-seeded with `ingest`,
`exif-audit`, `filter`, and `correct` marked `done`, and `correct`'s
expected output directory was populated directly with the 12 source images
(unmodified -- `correct` is a radiometric-only gain adjustment, immaterial
to solve/register/reconstruct/export-cog's own correctness). The Runner was
then invoked normally against the real, committed Manifest and executed
`solve-initial` through `export-cog` for real, end to end, with no other
manual intervention. This is the sense in which "the Runner ran the
Manifest end to end" is true here: every Node this ticket built ran for
real, through the Runner's real one-node-at-a-time execution and resume
logic; the four pre-existing head Nodes did not run live for this dataset
because their own gate correctly refused it.

## Location and version

`akamel-linux:~/drone/golden/pacifica-v1/`:

```
images/            the 12 source JPEGs, unmodified
images.sha256       sha256sum of each, for integrity checking on reuse
reference/          known-good outputs from the run below
```

This is v1. A new version directory (`pacifica-v2/`, or the real first-Site
subset once it exists) supersedes rather than overwrites, so a six-month-old
result stays meaningful (#15's own requirement).

## Pipeline run

`pipeline/manifests/orthomosaic.json`, `solve-initial` through `export-cog`,
executed by the real Runner (`pipeline/runner.py`) on `akamel-linux`
against the live `nodeodm` container (`127.0.0.1:3180`, NodeODM 2.2.4 / ODM
3.5.6), 2026-09-13. `bench-*` containers were confirmed absent before and
during the run (the other agent measuring GPU/memory ceilings was not
running at the time).

**Measured wall clock: 3m32s** (`time python3 pipeline/runner.py ...`),
covering: solve (opensfm-only, no ground control) -- register (no-op, no
Anchors configured) -- solve again (opensfm-only, `register`'s own empty
`gcp_list.txt`, i.e. still no ground control) -- `reconstruct-dense`
(openmvs dense cloud + filterpoints) -- `reconstruct-mesh` (meshing +
texturing) -- `reconstruct-georef` (georeferencing + orthophoto) --
`reconstruct-report` (report/stats, task removed) -- `export-cog`. Well
under the "well under an hour" target, and comfortably under the 3-hour
single-ODM-run boundary.

**One override, not in the committed Manifest**: `reconstruct-georef`'s
`odm_orthophoto` stage defaults to 5cm/px, which is a sensible default for a
real drone altitude (60-100m, per docs/research/anchor-sizing-2026.md) but,
against pacifica's arbitrary unscaled coordinate frame (see above), produced
a **23x23 pixel** orthophoto -- too small for `gdal_translate`'s COG driver
to build any overview from, regardless of settings (confirmed separately:
the same export-cog code passes validation on a realistic 2048x2048 test
raster in `nodes/check_ortho.py`). Baking a much finer resolution into the
*production* Manifest to work around one degenerate fixture would be wrong
-- a real Site at 5cm/px over even a modest footprint is already a large
image; 0.1cm/px would be enormous. So the committed `orthomosaic.json` is
unchanged, and the reference outputs below were generated from a
throwaway copy of the Manifest (`orthomosaic-golden-test.json`, built and
run only on the host, never committed) with `orthophoto-resolution=0.1`
added to `reconstruct-georef` alone, producing a 1440x1440px orthophoto.
This is a property of this one fixture, stated here so nobody "fixes" the
real Manifest to chase it.

## Reference outputs (`reference/`)

| File | What it is |
|---|---|
| `orthomosaic.tif` | The final COG (49,125 bytes), **validated**: `validate_cloud_optimized_geotiff` (osgeo) reports "valid COG" |
| `validator_output.txt` | That validator's raw verdict |
| `stats.json` | ODM's own `odm_report/stats.json` (processing/feature/reconstruction/point-cloud statistics) |
| `camera-initial.json`, `camera-final.json` | The recovered camera model from each of the two `solve` passes |
| `cameras-final.json` | The raw `cameras.json` NodeODM returned for the second (final) solve |
| `shots.geojson` | Per-shot poses from `reconstruct-report`'s `odm_report` stage (see the "unproven" note below) |

**DONE CRITERION #1's evidence, on this real run**: both solves picked
`brown` on their own and calibrated a non-zero principal point --
`c_x=0.000238`, `c_y=-0.002394` on the final solve, structurally identical
in shape to StudioKitchen's earlier result (#22's first comment) and to a
solve run with a real (if geometrically meaningless, for this dataset)
`gcp_list.txt` uploaded in an isolated API probe beforehand (`c_x=0.008043`,
`c_y=0.001639`, still `brown`, still non-zero) -- both the with- and
without-ground-control paths keep the principal point, confirmed live
rather than assumed.

**Mesh check** (ADR 0018's own example failure -- 934 faces from a
5.4M-point cloud -- made into `reconstruct.py`'s automatic check): this run
produced 362,729 faces against a 319,089-point cloud, far above the
conservative floor.

## What remains unproven

Stated here as plainly as #22 and #23 ask for elsewhere:

1. **Anchor detection on real imagery.** No Site with Anchors has been
   flown. `nodes/register/register.py` implements and unit-tests the
   projection, matching, gate, and `gcp_list.txt` writer against synthetic
   detections with known answers (`nodes/check_ortho.py`); finding a real
   quadrant-in-circle target in a real photograph is not implemented.
2. **Feeding `register` real per-shot poses.** NodeODM's asset API only
   exposes per-shot poses (`odm_report/shots.geojson`) once a solve reaches
   `odm_report`, confirmed by inspecting `all.zip` at each stage boundary --
   not at the cheap `opensfm`-only stop point `solve` uses by default and
   that design.md's "poses come from a first solve" language assumes. This
   golden run's own `shots.geojson` (captured from `reconstruct-report`,
   which does reach that stage) also shows `translation`/`rotation` values
   far too small in magnitude to be metres in the `gcp_list.txt` CRS
   (`register.py`'s assumed convention), which is at least consistent with
   -- though on a single unscaled, GPS-less dataset does not by itself prove
   -- the concern that `register.py`'s `Xc = R*Xw + t` adapter needs
   verification against a real georeferenced solve before it can be trusted
   on a live Capture. Both gaps are documented in
   `nodes/solve/solve.py`'s and `nodes/register/register.py`'s own module
   docstrings.
3. **Browser rendering over range requests.** This ticket's scope was the
   COG's own validity, not a delivered Bundle; ADR 0008's viewer
   (MapLibre GL JS + maplibre-cog-protocol) was not exercised against this
   file. Left to whichever ticket builds `bundle`/`publish` against a real
   Orthomosaic.
