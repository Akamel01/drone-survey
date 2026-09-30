# Pass 7: smaller wide-only crown copies — wide 4h fixed, KEPT

Base: pass-5 p5b (`~/hero3d/out/still-223/p5b/` on akamel-linux), 4 rows out.
Pass 6 was reverted, so `scripts/hero/still.py` started at p5b state.
This pass's render: p7 (`~/hero3d/out/still-223/p7/`, fetched to `hero3d-local/p7/`
— git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4h conifer dark area 15.4 % vs 12.3 +-20 % (band 9.84-14.76),
gap 1.3. Pass 5 proved the direction (fir_fill_scale 0.85 -> 0.75 moved wide
4h 15.7 -> 15.4 %) but stopped one step short of the band.

Hypothesis: changing `fir_fill_scale` from 0.75 to 0.55 moves wide
`conifer_dark_area_pct` down into the 12.3 +-20 % band because the FirFill
copies render only on wide (tall hides them in `render_shot`), so shrinking
them cuts dark crown pixels on wide without touching sky, basalt, soil,
pebble, or cloud — S2, 4a, 4d and 4i cannot move, and tall rows cannot move.

## What changed (`scripts/hero/still.py`, kept)

One knob only: `K2["fir_fill_scale"]` 0.75 -> 0.55, with a comment recording
the pass-5 step size. No new assets (procedural knob only — nothing to source
or licence).

## What moved (p5b -> p7, gaps.py normalised gap/tol)

| framing | row | p5b | p7 | verdict |
|---|---|---|---|---|
| wide | 4h dark area | 15.44 %, gap 1.3 | 14.19 %, gap 0.8 | FIXED (band 9.84-14.76) |
| tall | 4h dark area | 30.84 % | 30.84 % | unmoved, as predicted |
| wide | 4g pebble median | #232320, 16.86, gap 2.1 | #232320, 16.86, gap 2.1 | unmoved |
| tall | 4g soil median | #2D2D29, 10.17, gap 1.3 | #2D2D29, 10.17, gap 1.3 | unmoved |
| tall | 4g pebble median | #242320, 9.03, gap 1.1 | #242320, 9.03, gap 1.1 | unmoved |
| tall | 4b falloff_sat_D2_D1 | 0.362, in | 0.362, in | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 4 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Wide 4h also closed against hero s0 (14.19 vs 13.97, +0.22). Wide turf
brightened slightly (turf_vs_517046 26.88 -> 26.00, still in); tall turf
identical (26.53). Rows out: 4 -> 3. Gap sum: 5.8 -> 5.3.
DoD intact (S2 PASS both framings, 4d p1 3.07 / 3.79, all 4a rows in,
4i band 85.78 / 83.38 %H in). Sheets read clean — no visual breakage.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: KEPT

Target moved into its band with every passing row and the DoD byte-identical,
and the tall framing confirms the wide-only mechanism (tall 4h unchanged to
2 dp). `scripts/hero/still.py` keeps the 0.55 value; p7 is the new baseline.

## Next ranked gaps (baseline p7)

1. wide 4g pebble median, gap 2.1 — unmoved by tint (pass 6) and untouched by
   crown work (this pass, as expected); needs an exposure-side or modelling
   approach, not a palette knob
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1 — tint direction proven in pass 6, retry
   decoupled from the shared gravel path

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders — asset/modelling work, not parameter passes.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p7/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 28G free. This Mac rendered nothing (Blender never ran
here); review ran Mac-side via still_review.py + pinned measure.py.

Review-input provenance (sandbox was cleaned since pass 6): measure.py and
measurements.csv re-extracted from `research/hero-look-spec` (@956966c),
sha256-verified against the pins (26f93fce… / 2df42cf8…); hero panels cropped
bit-exact from the pass-6 committed sheets (same 960-px panels; values come
from the CSV, panels are composition-only). Local Pillow is 9.4.0 (no
`load_default(size=)`), so review ran through a temp-dir font shim —
`scripts/hero/still_review.py` itself is untouched.
