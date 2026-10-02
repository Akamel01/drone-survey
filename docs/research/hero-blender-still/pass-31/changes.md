# Pass 31: tall-only warm fill at p26's starting dose — tried, measured, REVERTED

Base: pass-29 p29 (`~/hero3d/out/still-223/p29/` on akamel-linux), 2 rows out.
This pass's render: p31 (`~/hero3d/out/still-223/p31/`, fetched to
`hero3d-local/p31/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70, ours #292A29 vs union
#1B1E24 — ours lighter in every channel: R 41 vs 27, G 42 vs 30, B 41 vs
36). The lamp class is the only lever never rendered against this row,
rejected a priori seven passes running (p24-p30: fill can only lighten a
median that needs darkening), while the wide lamp work has mapped its
dose-response on three sides (p26/p29 power, p28 re-chrome, p30 rotation —
every chroma-side move since p29 went away). The Next section ranks no
better experiment (wide pebble: mix surgery spent, residual B-dominated;
tall soil: accept-or-measure), so this pass measures the direction
argument instead of repeating it an eighth time.

Hypothesis: adding TallFill — the exact p26 WideFill starting dose (SUN,
energy 0.6, angle 5°, warm chroma (1.0, 0.68, 0.38), frontal from the
camera side, tall-only via hide_render) — moves the tall soil median
toward #1B1E24, because the recessed soil courses take frontal light at a
graze while the value-dependent labeler re-sorts the soil/basalt split at
the 40th luminance percentile (measure.py strata_labels): if the fill
lifts shadowed recess pixels across the boundary faster than it lifts the
lit soil facets, the soil set gains darker members and the median drops —
the same window-reshuffle class as p22's relief, without touching
geometry. The scored risk is the seven passes' direction argument: at
first order every soil pixel only brightens and the median lifts AWAY. The
wide framing never sees the lamp so the gap-1.2 wide pebble row is
protected by construction; tall pebble (margin 2.34 over bar 8) is the
watched collateral. Scored on the tall soil median plus DoD/passing-row
intactness. Keep iff toward with no passing-row/DoD breakage.

## What changed (`scripts/hero/still.py`, since reverted)

Mirror of the pass-26 pattern, isolated to one framing: new `add_tall_fill()`
(SUN 0.6, 5°, (1.0, 0.68, 0.38), same frontal convention — both cameras
look from −Y so one direction is frontal for both), called in `main()`
after `add_wide_fill()`; the `render_shot` lamp gate generalised to a
(name, framing) loop so WideFill stays wide-only and TallFill is
tall-only. WideFill (energy 0.75) untouched. No new assets (procedural
lamp only).

## What moved (p29 -> p31)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified: #2F2B1E vs #2D2C10 = 9.59, #292A29 vs #1B1E24 = 7.70; gap = dE/8
per pass 20).

| framing | row | p29 | p31 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #2C2C2A, 8.95, gap 1.1 | AWAY +1.25 (R 41->44, G 42->44, B 41->42 — lifted in every channel; first-order brightening dominated, no reclassification rescue) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #312C1F, 6.71, gap 0.84 | AWAY +1.05, still IN (bar 8) but margin 2.34 -> 1.29 |
| tall | 4g moss median | #313B0A, 4.46, gap 0.6 | #353F0B, 5.03, gap 0.6 | AWAY +0.57, still in |
| tall | 4g turf median | #283212, 26.53 | #293312, 26.06 | TOWARD −0.47, status unchanged |
| tall | 4g basalt median | #0A0B0C, 30.25 | #0C0D0D, 29.82 | TOWARD −0.43, status unchanged |
| tall | 4g soil sub-median | meanV 49.98 / meanS 0.172 | meanV 52.04 / meanS 0.158 | +2.06 levels brighter, desaturated — the fill's signature on the window |
| tall | 4g pebble sub-median | meanV 44.99 / meanS 0.353 | meanV 49.86 / meanS 0.407 | +4.87 levels — the collateral in the mean |
| wide | 4g all medians | pebble #2F2B1E 9.59 / soil #30302D / moss #353E0B / turf #2B3511 / basalt #0D0D0D | all bit-identical | lamp-hide protection held perfectly (mirror of p26-p30's tall-bit-identical run) |
| tall | 4d floor p0_1 / p1 / p5 / p50 | 1.79/3.07/5.07/31.14 | 2.0/4.0/6.14/32.79 | floor lifted ≤1.1 levels; shadow_floor_lifted flag 0 |
| wide | 4d floor p0_1 / p1 / p5 / p50 | 2.0/4.07/8.86/68.86 | bit-identical to 14 decimals | intact |
| tall | 4h dark area | 30.84 % | 30.65 % | −0.20 pp, still in |
| wide | 4h dark area | 14.23 % | bit-identical | intact |
| tall | 4a | — | haze-dE +0.009, anchor moves ≤0.02 (denoise-domain) | status unchanged |
| wide | 4a | — | bit-identical to 6th decimal | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | band identical, bboxes character-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.2, tall soil 1.1). Visual read: sheets show
no change at frame scale — same composition and cake-layer read; the known
visual gaps (rugged strata, moss cap, spruces, boulder sheen) persist
unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: REVERTED

The target moved the wrong way, +1.25 dE (gap 1.0 -> 1.1), and the watched
collateral fired too (tall pebble +1.05, margin halved to 1.29). The
toward-mechanism never showed: every tall soil channel lifted, meanV +2.06
levels — the labeler's 40th-percentile re-sort did not put darker members
into the soil set; the window's lit fraction took the fill and the median
followed it up. Seven passes' direction argument is now a measurement, not
an a priori: a frontal fill at p26's starting dose lightens the tall soil
median, full stop. Per the keep rule the `still.py` change is reverted and
p29 remains the baseline. A reverted pass still counts as the intentional
pass.

Learning: the lamp class is now closed on both framings — wide mapped on
three sides (power up twice, re-chrome, rotation: every move since p29
away), tall measured once (away +1.25 with pebble collateral). The two
framings' lamps are confirmed as safe confinement mechanisms in both
directions (four straight tall-bit-identical passes under WideFill work;
this pass's wide-bit-identical run under TallFill). What is left on both
out-rows is mix surgery (thickness swaps spent on both: p20/p24/p25) or
accepting them — wide pebble gap 1.2 with a B-dominated residual (even
matched R+G leaves ≈ 1.0), tall soil gap 1.0 within 4% of bar 8 per p25.

Next ranked gaps (baseline p29, unchanged):

1. wide 4g pebble median, gap 1.2
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; content
restored to the p29 state by the revert) and `~/hero3d/out/still-223/p31/`
(fresh pass dir). Never `~/hero3d/web4k`, `~/drone/scratch`,
`~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes. No sudo. Host / has
20G free. This Mac rendered nothing; review ran Mac-side via still_review.py
+ pinned measure.py (26f93fce…) and measurements.csv (2df42cf8…) in
`/tmp/review223` (the tool re-verifies both pins itself); hero panels are
the 960-px copies there (values from CSV). Review under the worktree-local
`.review-venv` (untracked, never committed); fetched renders under
`hero3d-local/p31/` (git-ignored, never committed). Committed with this
pass: only `docs/research/hero-blender-still/pass-31/` (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/azimuth/
exit_code logs). `scripts/hero/still.py` restored to p29 state — no code
change kept. No new assets (procedural lamp only — nothing to source or
licence).
