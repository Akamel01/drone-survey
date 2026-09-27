# Showcase tracer fixtures — provenance

Three fixtures for the Showcase tracer (plan module M0). Status: placeholder
fixtures for development; the boundary is **calibration debt**, the sky plate is
a sampled stand-in.

## `boundary-bellus.json`

**What it is.** One hand-drawn closed polygon, 8 distinct vertices, in the
Reconstruction's own ODM-local XY frame — the same frame as
`odm_textured_model_geo.obj`'s `v` lines. It is never reprojected by any Node.
Shape: `{"polygon": [[x, y], ...]}`, ring closed (first == last), per contract
C6 (`nodes/clean-splat/clean_splat.py:295-296`). Signed area +85,850 m²
(counter-clockwise), bounds x −200.0..130.0, y −180.0..140.0.

Absolute reference, for orientation only: this local frame maps to EPSG:32617
(UTM 17N) as `E = x + 440978`, `N = y + 4564133` (`.autoforge/execution/P0-reconstruction.md`
§5). The boundary file itself stays in the local frame.

**Why this polygon.** The mesh is 195,503 verts / 317,182 faces over local
bounds x −318.93..242.65, y −371.96..320.53, with ragged, sparsely sampled
margins. The polygon was chosen so that the whole ring sits inside a
fully-covered core:

- every 10 m cell whose centre lies inside the ring has ≥19 face clusters
  (min count 19, p05 27, median 134);
- every 10 m cell within 20 m outside the ring has ≥16 faces; zero empty cells;
- interior z range 176.7..347.6 (local obj z; not an absolute height frame).

That gives M1 a tractable sub-area a few hundred metres across (330 m × 320 m)
without trimming into the mesh's sparse edge.

**Debt and upgrade path.** This polygon is **hand-drawn, not surveyed**: no
Ground Control Points or Anchor-derived Site boundary exist yet for
`bellus-v1`, and the golden Capture is a third-party ODM sample, not a real
Site. It is a placeholder for the tracer and must not be treated as a record of
measurement. The upgrade path is a future ticket: once a real Site with Anchors
(or a surveyed cadastral/parcel boundary) exists, the real Site-boundary source
replaces this file, and M1's trim then runs against the real boundary through
the same C6 shape. Drawn 2026-09-25 by the AutoForge M0 worker
(opencode run `190`, `deepseek-v4.1-flash`); nothing else writes this file.

## Reconstruction

The mesh the boundary indexes is the golden Capture's Reconstruction:

- **Capture**: `bellus-v1` — OpenDroneMap's `odm_data_bellus`, 122 GPS-tagged
  images, at `akamel-linux:~/drone/golden/bellus-v1/` (see
  `docs/research/golden-capture.md`).
- **Run**: `pipeline/manifests/orthomosaic.json`, all 12 Nodes done, by the
  real Runner on `akamel-linux`, 2026-09-25, 939 s wall clock —
  `.autoforge/execution/P0-reconstruction.md`.
- **NodeODM task**: `8f72a0ea-4326-4f3c-be3a-d37d1fd294c9` (solve-final);
  textured mesh extracted with `docker cp` from
  `/var/www/data/8f72a0ea-4326-4f3c-be3a-d37d1fd294c9/odm_texturing` to
  `/home/akamel/drone/scratch/showcase190/reconstruction/`.
- **Host-only patches**: two, in the synced scratch copy only, not in this
  repo — `nodes/solve/solve.py` (keep the NodeODM task when the Manifest
  declares no ground control) and `nodes/reconstruct/reconstruct.py` (carry
  `task.json` forward). Full diffs in `P0-reconstruction.md` §6; landing them
  is a follow-up regression ticket.

## `sky-plate.png`

**What it is.** The hero's sky, as a stand-in plate: opaque RGB PNG
(3840 × 2160, no alpha). `scripts/hero/grade.py:8` resizes it to the render's
size and grades over it; the render is film-transparent
(`film_transparent = True`), so this plate **is** the visible sky.

**Where the colour comes from.** The hero sky is the HDRI
`kloofendal_overcast_puresky_4k.hdr` (Poly Haven, CC0) at
`akamel-linux:~/hero3d/assets/kloofendal_overcast_puresky/`, used as the world
environment by `scripts/hero/hero.py:506-527` (strength 1.45, below-horizon
ground ramped to near-black) and rendered with AgX / AgX - Medium High
Contrast (`hero.py:553-554`). The HDRI's above-horizon row means are bright and
blue-weighted (zenith-band sRGB ≈ #DCEFFF..#F3FFFF untonemapped, row-mean
linear B > G > R); raw linear values are not display-referred, so the plate
uses the hero sky's own sampled display values instead —
`docs/ui-theme/spec.md` §3.1, "sampled from frames":

| Gradient stop | Colour |
|---|---|
| Top | `#496C81` muted steel blue |
| Middle | `#7C99AD` |
| Bottom (horizon haze) | `#AABBCA` |

`grade.py` adds its own haze, glow and lifted shadows on top
(`HAZE, GLOW, LIFT = 0.09, 0.2, 0.04`), so the plate stays flat and ungraded.
Rebuild: linear interpolation between the three stops, 2160 rows, one row
resized to 3840 wide with Pillow.

**Debt and upgrade path.** The plate is a flat gradient, not a rendered frame
of the HDRI: it does not carry the HDRI's cloud structure or sun glow, and its
brightness is matched to the hero still's sampled values rather than to a
colour-managed render of the world. For a production Showcase the plate should
be replaced by a sky rendered (or tone-mapped) from the same HDRI the
Reconstruction's lighting uses, through the same view transform; the path
exists in `scripts/hero/hero.py`'s world setup and only needs a render step.

## Synthetic golden fixtures (`turn-3f/`, `dir-a/`, `dir-b/`)

**What they are.** Seven 64×32 RGBA PNGs from
`generate_goldens.py` (stdlib only, deterministic, `--check` reruns to a
tempdir and byte-compares): `turn-3f/` is a 3-frame seam-closed turn
(`frame_002` byte-identical to `frame_000`, bar at x 8→32→8);
`dir-a`/`dir-b` are the same 2-frame pair in opposite order (bar 8→40 vs
40→8). Opaque white bar on transparent black doubles as the island alpha
mask the direction metric reads.

**Why synthetic.** Per ADR 0018 bar, they pin the M6 seam metric (closing
diff 0.0 ≤ consecutive max 63.8) and direction metric (masked centroid
dx +32.0 vs −32.0, signs opposite by construction) before any Node is
done. No golden 4K video needed. Generated 2026-09-26 by the AutoForge M1
worker; regenerate with `python3 fixtures/showcase/generate_goldens.py`.
