# pass 1 — what it is vs the #222 baseline, and ranked deltas for pass 2

Base artifacts in this directory are cycle **c3** (third full 4K cycle): the best
of the three on the ranked DoD rows (S2 identical to c1; 4d p1 best). Cycles c1
and c2 are kept with `-c1` / `-c2` suffixes; c2's first attempt failed
(`render-c2a-failed.log`, `tint_basalt=0.25` scalar -> TypeError, fixed by edit
E3) and a second driver-arg rejection is logged in `.autoforge/execution/M3.md`.

## What pass 1 is

One Blender scene (`scripts/hero/still.py`) rendering both 4K framings in one
session on `akamel-linux`: hero island (K["under"]=1.9, patched LAYERS), in-scene
screen-anchored sky ramp, displaced terrain, bounded valley-mist volume, Mist/
Depth compositor haze, two fitted cameras (tall dist 21.0 / sy 0.192; wide dist
28.9 / sy 0.055 / sx -0.26), Standard view transform, OIDN, 128 samples,
`tint_basalt=0.08`.

Facts: tall S2 PASS (0.480-1.000 x, 0.448-0.881 y); wide S2 FAIL (0.551-0.949 x,
0.281-0.882 y) — miss listed below. Our-render VRAM peak 3795 MiB of the 6144 MiB
gate (device peak 9715, baseline 5920, total 12282). 18 metric sets + sheets +
scores.json + scorecard.md, 0 non-finite values.

## vs the #222 baseline (graded stills, from `.autoforge/execution/M2.md`)

| row | #222 baseline | pass-1 c3 | movement |
|---|---|---|---|
| tall S2 | FAIL x 0.480-1.000 y 0.300-0.877 | **PASS** x 0.480-1.000 y 0.448-0.881 | y0 +0.148 (fixed) |
| wide S2 | FAIL x 0.550-0.950 y 0.138-0.900 | FAIL x 0.551-0.949 y 0.281-0.882 | y0 +0.143, y1 -0.018; x0 still -0.039 |
| 4d p1 (lifted floor) | 22.51 (#222 had grade.py LIFT 0.04) | 12.79 tall / 16.57 wide (no grade) | -9.7 levels, still > 8 |
| composition | island only over flat haze; no sky ramp, no mountains, no mist band | sky ramp + terrain + mist + island | new in pass 1 |

## Ranked deltas for pass 2 (ordered by |measured - target| / tolerance)

1. **4d p1 both framings**: 12.8 (tall) / 16.6 (wide) vs pass-1 bar <= 8; hero
   2.14 / 0.93. `tint_basalt` 1.0 -> 0.25 -> 0.08 only moved 17.6 -> 14.5 -> 12.8,
   so the floor is not albedo-limited: the remaining lift is the 4 % Principled
   specular reflection of the bright sky on the rock (and OIDN's floor). Pass-2
   action: reduce specular IOR level / base roughness on `basalt` (and keep a
   small numeric check), not a further albedo cut. Not the pass-2 package's named
   scope (sky ramp/haze + palette medians) but it is the largest measurable gap.
2. **wide S2 x0 (+0.039 over) / y1 (+0.022 over)**: the out-of-gate pixels are
   mist/terrain pixels the mask's green test catches (see `bbox-probes.txt`);
   the island itself sits inside the box. Pass-2 action: make the wide mist band
   more horizontally uniform (haze_gain/mist_start-depth) so the mask's
   left-column background estimate stops flagging it, plus the small island nudge
   (c2 movement was real but insufficient on its own).
3. **4a R^2_B**: 0.9476 tall / 0.9434 wide vs 0.95 bar (slopes pass: 2.09/1.82/1.63
   tall, 2.36/2.08/1.90 wide). Pass-2 action: micro-adjust the B stops of
   `SKY_STOPS` (B slope is +18 % tall / +22 % wide vs hero; anchors are inside
   deltaE <= 10 already for rows 0.10-0.55, worst anchor is 0.02 H).
4. **4g pebble share**: 0.0351 tall (bar 0.041) / 0.0454 wide (bar 0.057); soil
   share 0.252/0.248 vs hero 0.318/0.318; basalt share 0.169/0.166 vs hero
   0.213/0.212. Pass-2 palette-median package (tint_* / LAYERS thicknesses).
5. **4b falloff shape**: tall D2/D1 0.238, D3/D1 0.417 (hero 0.030/0.023 — too
   contrasty); wide 0.027/0.026 (hero 0.094/0.034 — too flat). Not degenerate,
   but the per-framing haze gain needs splitting. Pass 3.
6. **4e DOF sigma**: wide 2.01/2.05 px (hero 2.10/3.16 — good); tall 0.95/0.62
   (hero 3.29/3.46 — too sharp). Pass 3 (tall fstop).
7. **4h dark area**: tall 21.8 % (hero 30.8, pass-4 band 22.6-33.8 (-20 %)) —
   marginal; wide 12.4 % (hero 14.0) — good. Pass 4 (conifer density).

## Kept evidence

- sheets: `sheet-tall.png` / `sheet-wide.png` (c3), `-c1`, `-c2` variants
- scores/scorecards: `scores.json` + `scorecard.md` (c3), `-c1`, `-c2`
- host logs per cycle: `vram.log`, `render.log`, `precheck.txt`, `azimuth.txt`
  (c3 base; `-c1`, `-c2`; c2a failure log)
- 18 `measure-*.json` + `s2.txt` for c3 (base) and `-c2`; c1 kept for its sheet
  and scorecard only (superseded before the 4K 4d fix)
- `bbox-probes.txt` (all fit probes/diagnostics)
- `baseline-222/` holds the #222 side-by-side sheets for comparison

4K PNGs stay on the host at `~/hero3d/out/still-223/p1{,c2c,c3}/` (never committed).
