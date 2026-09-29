# Pass 3: what changed from pass 2, and the ranked gaps for pass 4

The base files in this directory are render **p3** (`~/hero3d/out/still-223/p3/` on
akamel-linux). Before it came two preview probes, p3-pr1b and p3-pr2, at 540×960 and
960×540. p3-pr1 failed in 5 s: re-linking into an input socket already drops that
input's old link, so the explicit `links.remove` that followed raised "Unable to locate
link". The fix is in `island_palette`. Previews are not passes.

## What pass 3 changed (`scripts/hero/still.py`): the island package

Pass 2's ranked gaps 1 and 2: the island palette, and the operator's "bulkier rocky
underside".

1. **Palette, `island_palette()`.** The island's grass and moss are Poly Haven assets,
   and their shader groups take their own Hue, Saturation, Value and Specular inputs:
   - grass `grass_medium_01` / `.001`: Specular 0.5 to 0.15, Saturation 1.0 to 1.5,
     Value 1.0 to 0.40
   - moss `moss_01`: Saturation 0.96 to 1.3, Value 0.7 to 1.0
   - turf ground tint (0.55, 0.62, 0.30)
   - fir branches and twigs tint (0.55, 0.65, 0.50)
   - pebble courses (the gravel HSV node in hero.py's `mat_strata`): Saturation 0.7 to
     1.3, Value 0.8 to 0.28, then multiplied by (0.95, 0.90, 0.45).
2. **Strata.** The `LAYERS` thicknesses are ×1.5, which takes the strata from 1.09 to
   1.64, and the layer protrusions are ×2. The strata displacement scale went from 0.05
   to 0.12. The cut now reads as several rugged courses; pass 2 showed one thin band.
3. **Underside, `bulk_underside()`.** `K["under_boulders"]` is 50 (it was 20),
   `K["lumps"]` is 0.55 (0.34), and the underside boulders are scaled ×1.5 and pushed
   out ×1.08 from the axis. `K["under"]` went from 2.4 to 2.1, so the island's overall
   height stays close. The basalt tint is bluer: (0.06, 0.10, 0.22).
4. **Cameras refit** for the new island. Tall is dist 22.23, shift_x -0.204,
   shift_y 0.146. Wide is dist 29.67, shift_y 0.031.

## Pass-1 definition of done

All eight rows still pass:
- S2: tall x 0.480-1.000, y 0.448-0.881; wide x 0.589-0.925, y 0.290-0.866.
- 4d p1: 3.00 / 3.07.
- 4a: R² 0.977 / 0.992 / 0.995 tall and 0.970 / 0.978 / 0.978 wide; slopes 1.98 / 1.66 /
  1.41 and 2.22 / 1.85 / 1.58.
- VRAM peak 3007 MiB.
- `nonfinite_values` 0.

## Target rows (architecture §3), pass 2 → pass 3

Out of tolerance: **9 of 44**, against 10 in pass 2 and 22 in pass 1.

| framing | row | pass 2 | pass 3 | target | gap/tol (pass 3) |
|---|---|---|---|---|---|
| wide | 4i band y %H | 57.0 | 65.2 | 81.7 ±2 | 8.2 |
| tall | 4i band y %H | 93.0 | 93.0 | 84.1 ±2 | 4.4 |
| wide | 4g pebble median | #252624 | #1D1E1D | ΔE ≤ 8 to #2D2C10 | 2.4 |
| wide | 4g turf median | #3C4724 | #394518 | ΔE ≤ 8 to #1F2912 | 2.1 |
| wide | 4b S D3/D1 | 0.450 | 0.375 | 0.26-0.32 | 1.8 |
| tall | 4g pebble median | #262626 | #1C1D1E | ΔE ≤ 8 to #212111 | 1.5 |
| tall | 4g turf median | #3A4528 | #35411A | ΔE ≤ 8 to #283017 | 1.3 |
| tall | 4b S D2/D1 | 0.452 | 0.351 | 0.38-0.43 | 1.1 |
| tall | 4b rms D3/D1 | 0.027 | 0.030 | 0.04-0.06 | 1.0 |
| wide | 4g moss median | #2F3818 | #313B0B | ΔE ≤ 8 to #394212 | in (3.2) |
| tall | 4g moss median | #343D19 | #323D0B | ΔE ≤ 8 to #384117 | in (4.5) |
| wide | 4b S D2/D1 | 0.495 | 0.413 | 0.38-0.43 | in |
| tall | 4b S D3/D1 | 0.340 | 0.263 | 0.26-0.32 | in |

Moved into tolerance: wide moss, wide S D2/D1 and tall S D3/D1. The D1 saturation
(the island front) went from 0.29 / 0.26 to 0.37 / 0.31; the hero's is 0.49 / 0.45.
Still in tolerance: all of 4a and 4d, 4b rms D2/D1, 4e σ, 4g soil and basalt, and 4h.
4h is now tall 33.6 % against 28.2 ±20 % (in, at 0.96 of the tolerance) and wide 14.1 %
against 12.3.

## Ranked gaps for pass 4

1. **4i cloud band.** 4i reports the row with the largest spread of luminance across
   the CloudMist region.
   - Wide reads 65.2 %H against the hero's 81.7. In CloudMist (x 0.20-0.60,
     y 0.55-0.85), the far ridge edges at y ≈ 0.6 carry more contrast than the fog at
     0.8.
   - Tall reads 93.0 against 84.1. In CloudMist (x 0.05-0.45, y 0.72-0.95), the nearest
     crest at 0.9 wins.
   - Fix: move the textured fog to rows 0.80-0.85 and soften the ridge edges outside
     them.
2. **Turf median too light and too yellow-green.** It is #35411A / #394518 against the
   hero's union medians #283017 / #1F2912 (the hero's s0 values are #242E11 / #1B250A).
   The top reads as a bright lawn, where the hero's is dark, mounded moss and grass.
   Fix: lower the grass Value further and add turf-top relief.
3. **Pebble medians neutral grey.** They are #1C1D1E / #1D1E1D against the hero's olive
   #212111 / #2D2C10. The gravel tint has too little effect after the Value cut, so the
   chroma has to come from a stronger yellow-olive multiply.
4. **Tall S D2/D1 0.351** (band 0.38-0.43): now just under the band, because D1 gained
   chroma. **Tall rms D3/D1 0.030** (band 0.04-0.06): the far haze band is still slightly
   too smooth.
5. **Visual, no metric.** The hero's firs are darker spruces with denser crowns. Its
   underside boulders carry a faint blue sheen. Its turf overhangs the rim in moss
   drapes.

## Cost

- 4K time: 24.3 s tall and 26.3 s wide (`render.log`).
- VRAM: our render peaked at 3007 MiB (vram.log peak 4510 minus the 1503 MiB baseline);
  the cycles high-water mark was 2192 MiB.
