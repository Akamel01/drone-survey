# Pass 5, the last pass: what changed from pass 4, the pass-by-pass record, and what is left

The base files in this directory are render **p5b** (`~/hero3d/out/still-223/p5b/` on
akamel-linux). The first 4K render, p5a, is kept only as `s2-p5a.txt`: its wide S2
missed by 0.001 (y1 0.871 against 0.86 ±0.01), because the thicker strata made the
island taller. p5b is p5a plus a wide camera refit. Five preview probes, p5-pr1 to
p5-pr5, came before these renders; they are not passes.

## What pass 5 changed (`scripts/hero/still.py`)

These address pass 4's ranked gaps 1 to 5.

1. **Pebble courses.** Each course is now twice as thick: 0.16 / 0.16 / 0.18, against
   0.08 / 0.08 / 0.09. The soil layers are thinner to compensate. `K["under"]` went from
   2.1 to 1.94, which keeps the island's height.
   - Tall pebble improved from ΔE 11.9 to 9.0 (bar 8) and wide from 19.4 to 16.9.
     Neither is in yet.
   - The cost: tall soil now picks up gravel pixels and moved out, from ΔE 5.6 (pass 3)
     to 10.2.
2. **Wide 4h.** The extra crown copies shrank from 0.85 to 0.75 scale (`fir_fill_scale`).
   Wide 4h went from 15.7 to 15.4 %, against a ceiling of 14.8, so it is still out.
3. **Tall mountain saturation.** The tall stops at rows 0.80, 0.90 and 1.00 are bluer:
   #A9BBCF, #8098B2 and #7690AB. The 20 km ridge's haze went from 0.93 to 0.88. **Tall
   S D2/D1 moved from 0.348 to 0.362 and rms D3/D1 from 0.029 to 0.039; both are now
   in.**
4. **Tall foreground ridge (visual).** The tall ridges were re-stacked (crest rows
   0.64 / 0.67 / 0.69 / 0.705 / 0.72). The nearest one is darker and bluer (haze 0.50,
   fog -0.40), and it rises from the bottom-left as in the hero. Tall `haze_right` went
   from 0.5 to 0.75, which keeps S2's mask off the ridge under the island.
   - Rows 0.88-1.00 now read (98-103, 119-123, 143-147), against the hero's (104-114,
     130-139, 153-161). Pass 4 read (141-160, 154-170, 169-183).
   - 4i stays in: 85.8 / 83.4 %H.
5. **Wide camera refit** (p5b). Dist 29.67 to 30.35, shift_y 0.031 to 0.028.

## Pass-1 definition of done

All eight rows pass on p5b:
- S2: tall x 0.480-1.000, y 0.448-0.885; wide x 0.602-0.931, y 0.290-0.858.
- 4d p1: 3.07 / 3.79.
- 4a: slopes 1.98 / 1.65 / 1.40 and 2.22 / 1.85 / 1.58; R² 0.977 / 0.992 / 0.995 and
  0.969 / 0.978 / 0.978.
- VRAM peak 3009 MiB.
- 18 metric sets, `nonfinite_values` 0.

## Passes 1 to 5 against the target rows (architecture §3, 44 rows)

| pass | rows out | what moved |
|---|---|---|
| 1 | 22 | pass 1's own DoD misses: wide S2, 4d p1 12.8 / 16.6, 4a R² B |
| 2 | 10 | the floor, sky stops, layered ridges and fog, and framing fixed all DoD rows |
| 3 | 9 | island palette and bulk: moss in; turf and pebble still out |
| 4 | 5 | 4i band in both framings; turf in |
| 5 | **4** | tall 4b S and rms ratios in; tall soil out (gravel) |

Still out on p5b:

| framing | row | measured | target | gap/tol |
|---|---|---|---|---|
| wide | 4g pebble median | #232320 | ΔE ≤ 8 to #2D2C10 | 2.1 |
| wide | 4h dark area | 15.4 % | 12.3 ±20 % | 1.3 |
| tall | 4g soil median | #2D2D29 | ΔE ≤ 8 to #1B1E24 | 1.3 |
| tall | 4g pebble median | #242320 | ΔE ≤ 8 to #212111 | 1.1 |

The plan's stop rule 3 applies: the pass cap is reached. **Pass 5 is the best pass by
the measures**, with 4 rows out, all eight DoD rows passing, and 4i, turf, moss and every
4a, 4b, 4d and 4e row in tolerance.

## What the measures do not capture (read the sheets)

The measures now agree with the hero on sky, haze, depth falloff, floor, framing, the
cloud band and most of the palette. The side-by-side still shows these differences:

- **Turf top.** Ours is an even lawn of moss and grass with a clean rim. The hero's is
  a mounded, shaggy moss cap that overhangs the rim in drapes, with a few pale rocks.
- **Firs.** Ours are sapling assets with open, larch-like crowns. The hero's are dense,
  dark spruces.
- **Strata.** Ours are smooth, even courses of tan gravel and grey slate. The hero's are
  rugged, with pebble texture throughout and cavities.
- **Underside.** Ours is a dark, bulky mass of matte boulders. The hero's boulders are
  rounder, blue-black, and carry a faint specular sheen.
- **Mountains.** Ours are procedural ridge strips with ridged-noise crests. They read
  as layered mountains in fog, but the hero's have broader, smoother massifs, and its
  cloud sea is softer.

Closing these needs asset or modelling work (spruce assets, a sculpted turf cap, a
rock-strata material) rather than parameter passes.

## Cost

- 4K time: 24.3 s tall and 26.0 s wide (`render.log`). Pass 1 took 96 s per frame.
- VRAM: our render peaked at 3009 MiB (vram.log peak 4512 minus the 1503 MiB baseline);
  the cycles high-water mark was 2192 MiB. The device has 12282 MiB and the gate is
  6144 MiB.
