# Golden Capture: odm_data_bellus, for the Orthomosaic Pipeline

#15 (this file replaces `golden-capture-v1.md`, per that ticket's own
scoping -- "the real first-Site subset replaces it later"; `bellus-v1` is
still not that real Site, but it is a real, GPS-tagged, third-party ODM
sample that clears the head Nodes honestly, which `pacifica-v1` could not).
This is the fixture ADR 0018's end-to-end pass and any future regression
check for `nodes/solve`, `nodes/register`, `nodes/reconstruct`,
`nodes/export-cog` runs against, until a real Site with Anchors has been
flown.

## Why `pacifica-v1` is retired

`pacifica-v1` (`akamel-linux:~/drone/golden/pacifica-v1/`, files kept on the
host for history; its write-up previously lived in this file under the name
`golden-capture-v1.md`, now folded in here) is no longer usable as the
golden Capture for two independent reasons, both found while validating it
against the current Nodes:

1. **0.28% valid pixels.** Its orthomosaic is a valid COG but almost
   entirely empty (alpha-band measurement) -- `export-cog`'s own
   `MIN_VALID_FRACTION = 0.25` floor (added by commit `ea39aa3`, precisely
   because a clean exit had already reported success on output this empty
   once, per ADR 0018) now correctly refuses it. Pacifica has no GPS, so its
   reconstruction has no metric reference and its own coordinate frame is
   arbitrary (`golden-capture-v1.md`'s own finding) -- not something a
   resolution flag can fix, and not representative of a real Capture's
   geometry.
2. **No GPS, so it cannot clear `exif-audit` for real.** The v1 run
   pre-seeded `state.json` to mark `ingest`/`exif-audit`/`filter`/`correct`
   `done` and hand-populated `correct`'s output directory, specifically
   because pacifica has no GPS in any frame and `exif-audit` correctly
   refuses a Capture missing it. A golden run that skips the head Nodes it
   is supposed to exercise is not an end-to-end pass in the sense ADR 0018
   asks for.

`pacifica-v1`'s files stay at `akamel-linux:~/drone/golden/pacifica-v1/` for
history (12 images, no GPS, `odm_data_pacifica`); nothing currently points a
check at it.

## Dataset

**OpenDroneMap's own `odm_data_bellus` sample**
(`https://github.com/OpenDroneMap/odm_data_bellus`), 122 images, 12.3MP
(Canon PowerShot S110), already present on the compute host at
`~/drone/datasets/code/` with its own `gcp_list.txt` (not used by this run --
see "No ground control" below).

**It has real GPS on every frame** (checked: `exiftool -GPSLatitude
-GPSLongitude` on all 122, none missing) and locked
Make/Model/ExposureTime/FNumber/FocalLength, but **ISO varies across 12
distinct values** -- real Auto-ISO compensating for lighting while shutter
speed and aperture (the two settings that actually change blur and depth of
field) stay fixed. This is exactly what a real handheld/kited survey with
auto-exposure looks like, and it is a different thing from `design.md` §5's
"locked exposure," which is about blur/DOF consistency, not sensor gain.

## The `exif-audit` rule change (item 2 of #15)

Run against the committed `pipeline/manifests/orthomosaic.json` with no
pre-seeded state, `exif-audit` initially rejected this Capture: its
`LOCKED_FIELDS` list included `ISO`, exact-match across every frame, and
bellus's 122 frames take 12 distinct ISO values (measured:
`80, 100, 125, 160, 200, 250, 320, 400, 500, 640, ...`).

**Decision: the rule, not the dataset, was wrong here** --
`nodes/exif-audit/exif_audit.py`'s `LOCKED_FIELDS` no longer includes `ISO`.
Reasoning:

- `design.md` §5's "locked exposure" requirement exists to keep motion blur
  and depth of field consistent across a Grid Mission. `ExposureTime` and
  `FNumber` (plus `FocalLength` for scale) already enforce that; they stayed
  in `LOCKED_FIELDS`, exact-match, unchanged.
- ISO is sensor gain, a radiometric knob, not a geometry one. `correct` is
  `design.md`'s own line 144 "exposure consistency" Node, and normalizing
  frame-to-frame gain differences is exactly its job, downstream of
  `exif-audit`. Hard-failing the whole Capture on ISO drift was blocking on
  a difference this pipeline already has a Node to fix.
- This is not a weakening of the gate to vacuous: `nodes/check_head.py` still
  proves `exif-audit` fails loudly on a genuinely inconsistent locked field
  (the test now varies `FNumber` instead of `ISO`) and still fails loudly on
  missing GPS; a new check
  (`exif-audit: passes a real auto-ISO Capture...`) proves ISO drift alone no
  longer fails a Capture that is otherwise consistent. All of
  `nodes/check_head.py` passes with this change (see below).

`nodes/filter/filter.py` needed no change: it rejected exactly one bellus
frame (`5_duplicate`-style near-duplicate; see per-Node output below), the
kind of thing it already exists to catch, not a false positive.

## No ground control

`register` found no Anchors configured (none exist for this fixture) and
wrote an empty `gcp_list.txt`, same "no ground control" path as pacifica.
Unlike pacifica, though, bellus's real GPS EXIF gave ODM's georeferencing a
real metric reference on its own -- the output orthomosaic is genuinely in
`EPSG:32617` (WGS 84 / UTM zone 17N), the same zone as bellus's own
(unused) `gcp_list.txt`, at real-world coordinates, without any Ground
Control File. `reconstruct-report`'s own `stats.json` confirms
`"has_gps": true, "has_gcp": false`.

## Location and version

`akamel-linux:~/drone/golden/bellus-v1/`:

```
images/            the 122 source JPEGs, unmodified
images.sha256       sha256sum of each, for integrity checking on reuse
reference/          known-good outputs from the run below
```

## Pipeline run

`pipeline/manifests/orthomosaic.json`, `ingest` through `export-cog`, run by
the real Runner (`pipeline/runner.py`) on `akamel-linux` against the live
`nodeodm` container (127.0.0.1:3180, NodeODM 2.2.4 / ODM 3.5.6), 2026-09-14,
with an empty `state.json` (no pre-seeding). `splat-*` (another agent's
OpenSplat fit) was running concurrently on the GPU throughout; this run used
CPU/NodeODM only and did not touch it.

**Measured wall clock: 902s (15m02s)**, `ingest` through `export-cog`:

| Node | Wall clock | Notes |
|---|---|---|
| `ingest` | < 5s | copy of 122 already-local images, checksum-verified |
| `exif-audit` | 1s | 122 images, GPS present, camera settings consistent (post rule change) |
| `filter` | 22s | kept 121/122 (1 near-duplicate rejected) |
| `correct` | 53s | 121 images, target brightness 135.3 |
| `solve-initial` | 61s | opensfm-only, no ground control, feature-quality=low |
| `register` | < 1s | no Anchors configured -- empty `gcp_list.txt` (no-op) |
| `solve-final` | 61s | opensfm-only again (register's own empty `gcp_list.txt`) |
| `reconstruct-dense` | 270s (4m30s) | openmvs dense cloud + filterpoints, pc-quality=low |
| `reconstruct-mesh` | 382s (6m22s) | meshing + texturing |
| `reconstruct-georef` | 31s | georeferencing (real GPS EXIF) + orthophoto |
| `reconstruct-report` | 12s | odm_report/odm_postprocess; NodeODM task removed |
| `export-cog` | 9s | gdal_translate COG conversion + validation |

Full log: `reference/run.log`. Well under the "well under an hour" target.

## Reconstruction facts

- **Filter**: kept 121/122; rejected 1 near-duplicate frame.
- **Solve**: both solves picked `brown` on their own with a non-zero
  principal point (initial `c_x=0.00767, c_y=0.00556`; final
  `c_x=0.00814, c_y=0.00573`) -- DONE CRITERION #1's check, same as
  pacifica's finding, now on a dataset that also has real GPS.
- **Reconstruction**: 120/121 shots reconstructed (1 dropped by OpenSfM's own
  bundle adjustment), `has_gps: true`, `has_gcp: false`, capture area
  183,519 m² (~18.4 ha) (`reference/stats.json`).
- **Mesh check** (ADR 0018's own example failure -- 934 faces from a
  5.4M-point cloud): this run produced 317,869 faces against a
  4,063,294-point cloud, far above `reconstruct.py`'s own floor (2,031).

## Orthomosaic (DONE CRITERION #3)

- **Dimensions**: 11,001 x 13,680 px
- **GSD**: 0.05 m/px (5cm/px) -- ODM's own sensible default for this
  altitude, not overridden (contrast pacifica, which needed a throwaway
  0.1m/px override to get a non-degenerate raster at all; bellus needed no
  such thing, since its footprint is a real multi-hectare site rather than
  pacifica's tiny unscaled frame)
- **CRS**: EPSG:32617 (WGS 84 / UTM zone 17N), real-world, from GPS EXIF
  alone (no GCP file)
- **Valid pixel fraction**: 66.5% (`ok=True`,
  `validate_cloud_optimized_geotiff (osgeo): valid COG`,
  `reference/validator_output.txt`) -- comfortably above the 25% floor, and
  in the 40-70% range `export_cog.py`'s own comment expects for a rotated
  survey grid's bounding box.
- A 270x276px-scale degenerate output (the failure mode #15 warned to check
  for) did **not** occur; no resolution flag needed investigating.

## Reference outputs (`reference/`)

| File | What it is |
|---|---|
| `orthomosaic.tif` | The final COG (295,051,702 bytes), validated |
| `validator_output.txt` | The validator's raw verdict + valid pixel fraction |
| `stats.json` | ODM's own `odm_report/stats.json` |
| `camera-initial.json`, `camera-final.json` | Recovered camera model from each `solve` pass |
| `cameras-final.json` | Raw `cameras.json` NodeODM returned for the final solve |
| `shots.geojson` | Per-shot poses from `reconstruct-report`'s `odm_report` stage |
| `wall-clock.txt` | Per-Node timing table (source for the table above) |
| `run.log` | Full timestamped Runner output for this run |

## What remains unproven

Same two gaps `golden-capture-v1.md` named, still open (out of #15's scope):

1. **Anchor detection on real imagery.** No Site with Anchors has been
   flown; `register.py`'s projection/matching/gate/writer are unit-tested
   against synthetic detections only (`nodes/check_ortho.py`).
2. **Feeding `register` real per-shot poses** at the cheap `solve`
   stop-point (`opensfm` only) rather than the far more expensive
   `odm_report` stage where poses actually become available -- see
   `nodes/solve/solve.py`'s own module docstring.
3. **Browser rendering over range requests** -- out of this ticket's scope,
   left to whichever ticket builds `bundle`/`publish`.
