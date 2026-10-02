# Pass 26: wide-only warm frontal fill for the gravel courses — kept

Base: pass-24 p24 (`~/hero3d/out/still-223/p24/` on akamel-linux), 2 rows out.
This pass's render: p26 (`~/hero3d/out/still-223/p26/`, fetched to
`hero3d-local/p26/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.6 (dE76 13.08, ours #28261E vs union
#2D2C10 — ours darker in R/G, much higher in B). Ranked gap #1 in the
pass-25 summary, whose actionable recommendation for it is per-pixel recess
lighting or new gravel geometry — explicitly not another tint, after tint
(p6, p11), saturation (p8, p23: away +0.71), Value (p10) and thickness-adjacent
levers all proved inert or away on this row.

Hypothesis: a warm sun from the camera side, slightly above, adds R+G with
little B to the camera-facing gravel facets while recess shadows stay pinned,
moving the wide pebble median toward #2D2C10; the lamp is hidden for the tall
framing so the thin tall-pebble margin (2.34 over bar 8) is protected by
construction, and no geometry changes so silhouette/S2 hold. Scored on the
wide pebble median plus DoD intactness.

## What changed (`scripts/hero/still.py`, kept)

One coherent addition only (+25 lines): `add_wide_fill()` creates a
`WideFill` SUN (energy 0.6, angle 5°, colour (1.0, 0.68, 0.38)) aimed from
`(0, -1, 0.35)` in hero.py's sun convention — frontal, so the vertical strata
cut faces take it near full while the turf top takes it at a graze and the
underside takes nothing; `render_shot()` sets `hide_render = framing !=
"wide"`; `main()` calls it after `fill_firs()`. No new assets (procedural
lamp only — nothing to source or licence).

## What moved (p24 -> p26)

dE76 recomputed with measure.py's own `deltaE` on RGB tuples (the p20 method;
verified: p24 figures reproduce exactly — #28261E vs #2D2C10 = 13.08,
#292A29 vs #1B1E24 = 7.70, #2C291E vs #212111 = 5.66; wide soil union
#252729 per the look spec §4g, reproducing p21's 4.45).

| framing | row | p24 | p26 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #28261E, 13.08, gap 1.6 | #2E2A1E, 10.24, gap 1.3 | TOWARD -2.84 |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | bit-identical |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C291E, 5.66, gap 0.7 | bit-identical, still IN (bar 8) |
| wide | 4g soil median | #2D2D2B, 4.11 | #2F2F2C, 5.21 | AWAY +1.10, still in (gap 0.65) |
| wide | 4g moss median | #303A0A, 3.64 | #343D0B, 2.39 | TOWARD -1.25, still in |
| wide | 4g basalt median | #0A0B0C, 1.46 | #0C0D0D, 1.97 | AWAY +0.51, still in (gap 0.25) |
| wide | 4g turf (tracked metric) | turf_vs_517046 26.00 | turf_vs_517046 25.14 | improved (informational) |
| wide | 4g pebble sub-median | meanV 43.98 / meanS 0.311 / k1 0.432 | meanV 48.83 / meanS 0.377 / k1 0.465 | all toward union (53.4 / 0.574 / 0.544) |
| wide | 4g soil meanV (sub-median) | 51.35 | 53.26 | toward union 56.9 |
| tall | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07 | bit-identical | intact |
| wide | 4d floor p0_1 / p1 / p5 / p50 | 1.86/3.79/6.93/65.40 | 2.0/4.0/8.07/68.11 | floor lifted mildly; DoD p1 gate (lifted iff p1 >= 8.0) intact |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.384 / 0.352 | 0.390 / 0.358 | +0.006 both; spec means 0.384/0.320, D1 frame_sd loose |
| wide | 4h dark area | 14.19 % | 14.23 % | +0.04 pp, still in (hero s0 13.97) |
| tall | 4a/4b/4e/4f/4g | — | 4th-decimal-and-below noise only, all hexes identical | intact |
| wide | 4a | — | moves <= 0.005 dE (denoise-domain: island light change propagates through OIDN globally) | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | bit-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.3, tall soil 1.0). Visual read: sheets show
no change at frame scale — same composition and cake-layer read, strata very
slightly warmer wide; no regression; S2 bboxes bit-identical both framings.
VRAM: vram.log device peak 4508 MiB (max of 105 samples), precheck baseline
1503 MiB, our-render peak 3005 MiB (derived arithmetic: 4508 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time 24.5 s
+ 25.7 s (exit 0).

## Keep-or-revert: KEPT

The target moved -2.84 dE — the largest single-pass move on this row since
p20 (-3.26), and the first lighting-class lever to move any palette median —
with the tall framing bit-identical at every median (margin 2.34 fully
preserved), S2 PASS, 4d floor gate intact, 4a/4i intact, and no passing row
leaving its band (wide soil and basalt drifted away but stay in at gaps 0.65
and 0.25; wide moss and the turf tracked metric improved). The `still.py`
change stays and p26 becomes the new baseline.

Learning: per-pixel recess lighting moves the pebble window where five
albedo levers could not — light is a colour lever with precedent (relief
p18/19, p22's +2.00 collateral), and a per-framing lamp confines it to one
framing. Honest limit: the remaining error is B-side (ours B 0x1E vs union
0x10, unmoved) and additive light cannot subtract blue — the next lever on
this row has to remove blue from shadowed pixels (geometry that shades
differently) or accept the row.

Next ranked gaps (baseline p26):

1. wide 4g pebble median, gap 1.3
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p26/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` (sha-verified against the
pins); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed);
fetched renders under `hero3d-local/p26/` (git-ignored, never committed).
Committed with this pass: `scripts/hero/still.py` (WideFill lamp, kept)
plus `docs/research/hero-blender-still/pass-26/` (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck logs).
No new assets (procedural lamp only — nothing to source or licence).
