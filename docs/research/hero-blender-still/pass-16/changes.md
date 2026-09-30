# Pass 16: cliff detail Value 1.9 -> 1.4 — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p16 (`~/hero3d/out/still-223/p16/`, fetched to
`hero3d-local/p16/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall soil #2D2D29 vs #1B1E24 (dE 10.17, gap 1.3). Pass 15 proved layer
tints contribute ~3 of soil's 41 blue levels — the colour must come from the
cliff detail (V 1.9) plus lighting.

Hypothesis: cutting the cliff detail Value 1.9 -> 1.4 darkens all grav=0
strata (soil, sediment, humus, weathered rock) at the texture level, below
the lighting — tall soil moves toward target while pebble (grav=1, detail
replaced by gravel) cannot move.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: new `detail_v` 1.4 gripping the detail HUE_SAT node by its
unique S=0.0 signature (gravel runs at S=pebble_hsv). No new assets.

## What moved (p7 -> p16)

| framing | row | p7 | p16 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2D2D29, dE 10.17 | #2D2C29 | one blue level, flat |
| wide | 4g soil median | in | #2F2F2B | flat, still in |
| tall/wide | 4g pebble median | #242320 / #232320 | #24231F / #22221F | unmoved (decoupling confirmed again) |
| basalt/turf | both | — | byte-identical medians | unmoved |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.364 / 0.384 | unmoved |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a / 4i / S2 | — | — | identical | unmoved |

Rows out: 3 -> 3. DoD intact. Sheets read clean (no visible change).
VRAM: our-render peak 3005 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

A 26 % texture cut with zero rendered effect: the knob does not reach the
pixels. `scripts/hero/still.py` is restored to p7 state and p7 remains the
baseline. (The `detail_v` wiring is removed with it — no speculative
scaffolding kept.)

Learning (confirms the passes 6-15 thesis): the strata rendered colour is
lighting-dominated — albedo cuts of 26-50 % at the texture level render as
~1 level, while the specular dial (lighting-side) moves medians by 10+
levels. All texture-side palette knobs are now exhausted: MULTIPLY tint,
HUE_SAT S, HUE_SAT V, layer tints, cliff detail V, ledge shading. Remaining:
lighting-side (specular, exhausted against 4b) and modelling (geometry that
changes faces/shadows rather than albedo).

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders — the next passes turn to these (modelling, not albedo).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p16/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
