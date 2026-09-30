# Pass 12: matte strata (kill specular) — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p12 (`~/hero3d/out/still-223/p12/`, fetched to
`hero3d-local/p12/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: all three out-rows (wide pebble gap 2.1, tall soil 1.3, tall pebble 1.1)
need less blue. Passes 6/8/10/11 proved albedo knobs saturate: MULTIPLY B
0.30 -> 0.15 buys one blue level, because the rendered strata colour is
dominated by lighting, not albedo.

Hypothesis: the cut faces carry a blue sky sheen through the strata
Principled (Specular IOR 0.5, Roughness 0.86 — mat_strata leaves both at
defaults). Matting the strata (Specular -> 0.0, Roughness -> 1.0, the exact
pass-2 basalt surgery) lets the olive gravel albedo show in both framings.

## What changed (`scripts/hero/still.py`, since reverted)

One coherent change: `fix_strata()` mirroring `fix_basalt()`, with
`strata_spec` 0.0 and `strata_rough` 1.0. No new assets.

## What moved (p7 -> p12; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p12 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #2D230C, dE 6.77, gap 0.9 | FIXED (R exact) |
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #30250E, dE 8.44, gap 1.1 | narrowed, still out |
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #181914, dE 8.46, gap 1.1 | narrowed, still out |
| wide | 4g soil median | in | #181814 | darker — check band |
| tall | 4b falloff_sat_D2_D1 | 0.362, in | 0.280 | BROKE (band 0.38-0.43) |
| wide | 4b falloff_sat_D2_D1 | 0.383, in | 0.306 | BROKE (band ~0.34-0.38) |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.85 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 2.79 / 2.07 | moved, still in (bar ≤ 8, floor not lifted) |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 4 (one fixed, two broken). DoD broken on 4b both framings
(the DoD rows require all 4b rows in). Sheets read clean but the island is
visibly darker/flatter.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

Fix-one-break-two is not progress. `scripts/hero/still.py` is restored to p7
state and p7 remains the baseline.

Learning (the pass's real product): specular is THE lever for the wide
pebble — zeroing it fixed the biggest gap outright (16.86 -> 6.77 dE). The
4b break comes from the island going too dark (D2 saturation collapses), so
an intermediate specular (hero 0.5, tried 0.0) should land between: wide
pebble fixed, 4b held. Next pass brackets strata_spec at 0.25.

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1 — intermediate specular next
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p12/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
