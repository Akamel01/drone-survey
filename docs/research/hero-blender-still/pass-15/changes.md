# Pass 15: soil-layer tints x0.7 — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p15 (`~/hero3d/out/still-223/p15/`, fetched to
`hero3d-local/p15/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall soil #2D2D29 vs #1B1E24 (dE 10.17, gap 1.3). The specular bracket
(passes 12-14) is exhausted — it breaks tall 4b before fixing anything.

Hypothesis: soil renders brighter than its linear tint target because the
cliff detail (V 1.9) and lighting lift it. Scaling the three grav=0 middle
layer tints (brown soil, tan sediment, dark soil) x0.7 darkens soil pixels
directly — and grav=0 means the gravel mix replaces nothing there... in
reverse: pebble bands carry grav=1, so their pixels never see these tints.
Pebble cannot move; soil should darken ~30 % toward target.

## What changed (`scripts/hero/still.py`, since reverted)

One coherent change: the three soil/sediment LAYERS tints
(0.0110, 0.0130, 0.0176) -> (0.0077, 0.0091, 0.0123). Humus, pebble, weathered
rock untouched. No new assets.

## What moved (p7 -> p15; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p15 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #2D2C29, dE ~10.1, gap 1.3 | one blue level, flat |
| wide | 4g soil median | in | #2F2F2B (was #302F2A) | flat, still in |
| tall/wide | 4g pebble median | #242320 / #232320 | #24231F / #22221F | pebble unmoved (decoupling confirmed) |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.363 / 0.384 | unmoved |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 3. DoD intact. Sheets read clean (no visible change).
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

x0.7 on the tint buys one blue level: the tint contributes ~3 of soil's 41
blue levels — the rendered colour is the x1.9 cliff detail plus lighting, and
tints are nearly irrelevant. The tint path (layer tints and MULTIPLY alike)
is exhausted for soil exactly as for pebble. `scripts/hero/still.py` is
restored to p7 state and p7 remains the baseline.

Learning: the remaining soil lever with headroom is the cliff detail Value
(hero.py V=1.9, unexposed) — it feeds all grav=0 strata. Risk: it also feeds
the humus under the turf lip (pass-4 mislabel lesson) and the weathered rock
(basalt-adjacent). Next pass grips the detail HSV node (unique S=0.0
signature) and cuts V 1.9 -> 1.4.

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p15/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
