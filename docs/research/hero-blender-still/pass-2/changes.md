# Pass 2: what changed from pass 1, and the ranked gaps for pass 3

The base files in this directory are render **p2b** (`~/hero3d/out/still-223/p2b/` on
akamel-linux). The first 4K attempt, p2a, is kept only as `s2-p2a.txt`: its wide S2
failed on one stray ridge pixel (details in `probes.txt`). Ten preview probes came before
the 4K renders. They are listed in `probes.txt` and are not passes.

## What pass 2 changed (`scripts/hero/still.py`), by pass 1's ranked gaps

1. **Lifted rock floor (gap 1).** In `hero.py:336-338` the basalt is wet and glossy:
   roughness 0.14 to 0.44 from a texture, and Specular IOR Level 0.65. Under the Standard view,
   its reflection of the bright sky was pass 1's floor. The new `fix_basalt()` sets
   Specular IOR Level to 0.15 and makes the roughness a constant 0.80. The tint
   `tint_basalt` is now (0.10, 0.12, 0.18), which is bluish. The boulders on the underside
   share the material, so the fix reaches them too. **4d p1 went from 12.79 / 16.57 to
   3.07 / 3.79 (tall / wide).** The hero's s0 values are 2.14 / 0.93, and the bar is 8 or less.
2. **Layered mountains and the cloud sea (gap 2).** Three pass-1 pieces are gone: the single
   displaced terrain grid, the valley-mist volume box, and the compositor Mist/Depth haze
   with its second view layer. In their place, each framing gets five ridge strips, from
   20 km out to 1.8 km. Each strip is meshed in units of its own distance, and its crest
   is placed on a target screen row through the camera model (`row_z`). One material
   (`ridge_material`) does the work in the shader:
   - lit rock
   - valley fog, set by the strip's own height plus noise wisps (`fog_top`, `fog_*` knobs)
   - aerial haze that mixes toward the ramp colour of the pixel's own row, by the
     strip's `haze` fraction.

   A `haze_right` ramp adds haze toward the right of the frame. That is where the hero
   has cloud sea under the island, and where measure.py's S2 mask would otherwise read
   dark ridge peaks as island. The strips are visible to camera rays only, so they never
   light the island.
3. **Sky ramp.** One ramp per framing now runs from row 0.02 to row 1.0. It serves as both
   the sky and the colour that the far ridges fade into. The 0.02 stop is now the anchor
   divided by 0.6. measure.py takes a 5-px "same" moving average, so its first row reads
   3/5 of the true colour. Pass 1 used the anchor value itself and rendered a dark cap:
   its 0.02 anchor was #16222D against the hero's #24384A. The wide 0.58 clamp row
   (#767C82) got the same treatment. The rows below the horizon take their colours from
   the hazed-mountain row means of the hero's panels. **All sky anchors at 0.02 to 0.55
   now read the hero's hex exactly.**
4. **Bulkier underside (gap 3, partial).** `K["under"]` went from 1.9 to 2.4 and
   `K["tree_scale"]` from 0.36 to 0.30. Relative to the island, the hero's underside is
   taller and its firs are shorter. The shape is still a smooth cone, so the boulder
   mass is left for pass 3.
5. **Framing (gap 5).** The cameras were refit and are now the K2 defaults. Tall is
   dist 20.56, shift_x -0.221, shift_y 0.162. Wide is dist 28.0, shift_x -0.26,
   shift_y 0.039. The wide nearest ridge crest moved to row 0.90. **Wide S2 now passes.**

Also: dropping the volume and the second view layer cut the 4K time from 96 s to
26 to 28 s per frame (see the cost section).

## Two findings on the way

- **Pass 1's tall S2 PASS hid a framing miss.** measure.py's `mask_win` for tall starts at
  x 0.48, so the bbox cannot read further left than that. Pass 1's tall island actually
  reached x ≈ 0.30 (the turf rim, visible in `pass-1/sheet-tall.png`), and it also put
  grass into the D3 band, which is why pass 1 had tall D3 LapVar 227. Pass 2 puts the
  rim at x ≈ 0.47, where the hero has it.
- **Hero frames.** The hero masters live in `akamel-linux:~/hero3d/web4k/`, which this
  run may not touch, and pass 1's Mac copies were in a temp folder that has since been
  cleared. `still_review.py` gained `--hero-s0-csv`, which takes the hero s0 values from
  the look spec's `measurements.csv` (the rows with `frame_s == 0`). Those rows are the
  pinned measure.py's own output on the pinned masters, and the script checks each row's
  `master_sha256` against `measure.MASTER_SHA`. The sheet's hero panel is the 960-px panel
  cropped from the pass-1 sheets; it is byte-identical across `pass-1/sheet-*-c1.png`,
  `pass-1/sheet-*.png` and `baseline-222/sheet-*.png` (max pixel difference 0).
  **Check:** re-scoring pass 1's c3 renders this way reproduces all 244 measured rows of
  `pass-1/scores.json` exactly, with 0 differences.

## Pass-1 definition of done, pass 1 → pass 2

| # | row | pass 1 (c3) | pass 2 |
|---|---|---|---|
| 1 | both framings in one session, 2160×3840 / 3840×2160 RGB 8-bit | PASS | PASS |
| 2 | peak VRAM ≤ 6144 MiB, no OOM | PASS (3795) | PASS (3090) |
| 3 | 18 metric sets, S2 verdict, both sheets, all finite | PASS | PASS (`nonfinite_values` 0) |
| 4 | S2 bbox PASS both | tall PASS (window-clipped) / **wide FAIL** x0 0.551 y1 0.882 | **PASS / PASS** (wide x 0.584-0.935 y 0.288-0.863) |
| 5 | 4d p1 ≤ 8 both; 4b not degenerate | **FAIL** 12.79 / 16.57 | **PASS** 3.07 / 3.79; D2/D1 0.053 / 0.068 |
| 6 | 4a slopes ≥ 1.5/1.3/1.1, R² ≥ 0.95 | **FAIL** (R² B 0.948 / 0.943) | **PASS** R² 0.977/0.992/0.995 tall, 0.970/0.978/0.978 wide |
| 7 | sheets show island right and sharp, mountains and mist behind, sky above | flat grey silhouettes, no cloud sea | layered ridges with fog wisps, sky ramp above |
| 8 | evidence committed; #222 sheet kept | PASS | PASS |

**Early-stop check.** Pass 2 meets all eight pass-1 rows. It does not meet the plan's
pass-loop stop rule (plan §4 rule 1: every measurable row of the architecture §3 target
table inside tolerance): 10 of 44 rows are still out, against 22 of 44 in pass 1. Those
10 rows include the island palette and the underside that the operator named on
2026-09-29, so pass 3 goes ahead.

## Architecture §3 target rows, ranked by gap / tolerance

Tolerances are those of the plan's pass table: slopes ±15 % of the hero mean; anchors
ΔE ≤ 10 to the look-spec s0 hex; the 4b bands from look spec §5; 4e σ ±25 % of the hero
mean; 4g union medians ΔE ≤ 8; 4h ±20 %; 4i band y ±2 %H. 4i is the still-adapted run.

| framing | row | pass 1 | pass 2 | target | gap/tol (pass 2) |
|---|---|---|---|---|---|
| wide | 4i band y %H | 59.7 | 57.0 | 81.7 ±2 | 12.3 |
| tall | 4i band y %H | 74.3 | 93.0 | 84.1 ±2 | 4.4 |
| wide | 4b S D3/D1 | 0.662 | 0.450 | 0.26-0.32 | 4.3 |
| wide | 4b S D2/D1 | 0.689 | 0.495 | 0.38-0.43 | 2.6 |
| wide | 4g pebble median | #171A1A | #252624 | ΔE ≤ 8 to #2D2C10 | 2.2 |
| wide | 4g turf median | #444F36 | #3C4724 | ΔE ≤ 8 to #1F2912 | 1.8 |
| tall | 4g pebble median | #222423 | #262626 | ΔE ≤ 8 to #212111 | 1.4 |
| tall | 4b rms D3/D1 | 0.417 | 0.027 | 0.04-0.06 | 1.3 |
| wide | 4g moss median | #40482D | #2F3818 | ΔE ≤ 8 to #394212 | 1.2 |
| tall | 4g turf median | #424D33 | #3A4528 | ΔE ≤ 8 to #283017 | 1.2 |
| tall | 4b S D3/D1 | 0.491 | 0.340 | 0.26-0.32 | in (0.7) |
| tall | 4b S D2/D1 | 0.389 | 0.452 | 0.38-0.43 | in (0.9) |

Now inside tolerance: every 4a slope and anchor; 4d both framings; 4b rms D2/D1 both
framings and D3/D1 wide; 4e σ D2/D3 both framings (tall 2.17 / 2.17 against 2.45 / 2.61,
wide 1.88 / 1.90 against 1.62 / 2.42); 4g soil, basalt and tall moss; 4h dark area
(tall 30.3 % against 28.2, wide 13.1 % against 12.3).

## Ranked gaps for pass 3

1. **Island palette (4g turf, moss, pebble; 4b S ratios).** The turf and moss are too light
   and too grey: the grass instances (Poly Haven `grass_medium_01`, `moss_01`) render
   frosty under Standard view, and `tint_turf` reaches only the ground material. The
   hero's turf is dark saturated olive (#283017 / #1F2912). The same low D1 saturation
   (S 0.29 / 0.26 against the hero's 0.49 / 0.45) is what pushes wide S D2/D1 and D3/D1
   over their bands, so the ratios should fall back when D1 gains chroma. The pebble
   bands read neutral grey (#262626) where the hero's are olive (#212111 / #2D2C10).
2. **Bulkier rocky underside (operator gap 3).** The shape is still a smooth, lumpy cone.
   The hero's underside is a mass of big dark boulders, and its strata are thick and
   layered with pebble courses; pass 2 shows one thin light band.
3. **4i band y.** This is the row of the largest row-wise luminance spread in CloudMist.
   Ours is 57.0 %H wide (a far-ridge edge) and 93.0 %H tall (the nearest crest), against
   the hero's 81.7 / 84.1 (its cloud-sea texture). Moving the fog and ridge texture
   toward those rows is a pass 4 item.
4. **tall 4b rms D3/D1 0.027** (band 0.04-0.06): the far haze band is slightly too smooth.

## Cost

- 4K time: 26.1 s tall and 28.1 s wide (`render.log` Time lines), down from 96 s per frame
  in pass 1.
- VRAM: our render peaked at 3090 MiB, measured as the vram.log peak of 4593 MiB minus the
  1503 MiB baseline taken before the render. The cycles high-water mark was 2141 MiB. The
  device has 12282 MiB and the gate is 6144.

## Evidence here

`sheet-{tall,wide}.png`, `scorecard.md`, `scores.json`, 18 `measure-*.json`, `s2.txt`,
`s2-p2a.txt`, `probes.txt`, and the host logs `render.log`, `vram.log`, `precheck.txt`
and `azimuth.txt`. The 4K PNGs stay on the host in `~/hero3d/out/still-223/p2b/`.
