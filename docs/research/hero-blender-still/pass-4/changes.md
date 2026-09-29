# Pass 4: what changed from pass 3, and the ranked gaps for pass 5

The base files in this directory are render **p4** (`~/hero3d/out/still-223/p4/` on
akamel-linux). Nine preview probes came before it, p4-pr1 to p4-pr9, at 540×960 and
960×540. They are not passes.

## What pass 4 changed (`scripts/hero/still.py`)

These address pass 3's ranked gaps 1 to 3: the 4i cloud band, the turf median and the
pebble median.

1. **4i cloud band.** 4i reports the row with the largest spread of luminance across
   the CloudMist region.
   - Wide: the island's left edge sat at x 0.589, inside CloudMist (which ends at
     x 0.60). Its dark turf and strata sliver made row 0.65 the most varied row in
     that region, which is what pass 3's 65.2 %H measured.
   - Wide fix: shift_x went from -0.26 to -0.27, so the island edge sits at x 0.599.
     That is still inside S2's 0.59 ±0.03. The 6 km ridge is hazier: 0.76 to 0.84,
     with fog at 0.25.
   - Tall: the nearest crest moved down to 0.96, with haze 0.55 and its fog below the
     relief (-0.20). The 3.2 km ridge moved to crest 0.82, haze 0.34, fog 0.35. The
     strongest variation now falls on its fogged crest line.
   - **Result: 4i band y went from 93.0 / 65.2 to 83.9 / 83.4 %H.** The hero's values
     are 84.1 / 81.7 ±2, so both framings are now in.
2. **Turf median.** measure.py splits the island's green pixels at their median row,
   and the upper half is mostly trees. In the hero those trees are big dark spruces;
   ours were few, light pixels on top of a bright moss lawn.
   - The moss now darkens toward the back of the island. The `moss_01` Value is driven
     by world y: 1.0 at the front (y -2.2), dropping to 0.40 at the back (y 0.3). The
     lower half of the green, which is the "moss" stratum, stays bright.
   - The fir tint is darker, (0.25, 0.32, 0.18).
   - The grass Value is set per framing: tall 0.24, wide 0.16.
   - Wide only: each fir gets one extra crown copy, turned 90° at 0.85 scale
     (`fill_firs`, shown only when the framing's `fir_fill` is set).
   - **Turf went from #35411A / #394518 to #283212 / #26300F, against #283017 /
     #1F2912: now in tolerance.** Moss stays in (#313B0A / #303A0B).
3. **Pebble courses.** The humus band under the turf is now a neutral dark. The three
   pebble courses stand out from the cut instead of being recessed (protrusion +0.015,
   then ×2 from `ledge_scale`), and the gravel is lighter and yellower: HSV value 0.35,
   tint (0.80, 0.80, 0.30). The goal was for measure.py's max-chroma row to land on a
   pebble course. **The pebble median is still neutral** (#1D1E1F / #1E2020). measure.py
   takes the pebble stratum as ±3 % of the island's height around the max-chroma row,
   about 100 px at 4K, and our courses are 20 to 30 px thick. The look spec itself
   calls pebble "the least stable stratum".

## Pass-1 definition of done

All eight rows still pass:
- S2: tall x 0.480-1.000, y 0.448-0.881; wide x 0.599-0.935, y 0.290-0.866.
- 4d p1: 3.00 / 3.07.
- 4a: R² 0.977 / 0.992 / 0.995 tall, 0.969 / 0.978 / 0.978 wide.
- VRAM peak 3009 MiB.
- `nonfinite_values` 0.

## Target rows (architecture §3), pass 3 → pass 4

Out of tolerance: **5 of 44**, against 9 in pass 3, 10 in pass 2 and 22 in pass 1.

| framing | row | pass 3 | pass 4 | target | gap/tol (pass 4) |
|---|---|---|---|---|---|
| wide | 4g pebble median | #1D1E1D | #1E2020 | ΔE ≤ 8 to #2D2C10 | 2.4 |
| tall | 4g pebble median | #1C1D1E | #1D1E1F | ΔE ≤ 8 to #212111 | 1.5 |
| wide | 4h dark area % | 14.1 | 15.7 | 12.3 ±20 % | 1.4 |
| tall | 4b S D2/D1 | 0.351 | 0.348 | 0.38-0.43 | 1.3 |
| tall | 4b rms D3/D1 | 0.030 | 0.029 | 0.04-0.06 | 1.1 |
| wide | 4i band y %H | 65.2 | 83.4 | 81.7 ±2 | in |
| tall | 4i band y %H | 93.0 | 83.9 | 84.1 ±2 | in |
| wide | 4g turf median | #394518 | #26300F | ΔE ≤ 8 to #1F2912 | in (6.6) |
| tall | 4g turf median | #35411A | #283212 | ΔE ≤ 8 to #283017 | in (4.4) |
| wide | 4b S D3/D1 | 0.375 | 0.349 | 0.26-0.32 | in (0.97, on the edge) |

## Ranked gaps for pass 5

1. **Pebble median** (both framings). This needs courses thick enough to fill
   measure.py's ±3 % window, or it gets left as a stratum-labelling limit. Pass 5 tries
   thicker courses once.
2. **Wide 4h 15.7 %** (≤ 14.8). The wide crown fill added more dark area than the
   preview showed; smaller extra crowns should bring it back.
3. **Tall S D2/D1 0.348** (0.38-0.43). The mountain band's saturation is 0.13, against
   the hero's 0.185. The hazed ridges need to be bluer.
4. **Tall bottom rows are too light.** Rows 0.88-1.00 read (145, 160, 177), against the
   hero's (104-114, 130-139, 153-161): the pass-4 4i change fogged the nearest ridge.
   Fix: a bluer and darker foreground ridge, and bluer haze stops at rows 0.90-1.00.
   This is visual; no metric covers it.
5. **Tall rms D3/D1 0.029** (0.04-0.06): the 20 km ridge could carry a little more
   texture.

## Cost

- 4K time: 24.3 s tall and 26.4 s wide.
- VRAM: our render peaked at 3009 MiB (vram.log peak 4512 minus the 1503 MiB baseline).
