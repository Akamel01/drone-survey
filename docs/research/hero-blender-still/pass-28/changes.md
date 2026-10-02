# Pass 28: re-chrome the WideFill toward the hero pebble chroma — tried, measured, REVERTED

Base: pass-26 p26 (`~/hero3d/out/still-223/p26/` on akamel-linux), 2 rows out.
This pass's render: p28 (`~/hero3d/out/still-223/p28/`, fetched to
`hero3d-local/p28/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.3 (dE76 10.24, ours #2E2A1E vs union
#2D2C10 — R matched at +1 LSB, G −2, B +14). Pass 27 proved the
shading-side lever dead on this row (middle-pebble recess: 0.00 dE on the
target, −0.32 tall-pebble margin spent) and closed the two neighbouring
light ideas itself: more WideFill energy overshoots the matched R, and a
tall-soil fill lightens a median that needs darkening (wrong direction by
construction, p24). The remaining fill-side idea the record had not tried
is not *more* light but *different* light: p26's warm fill (1.0, 0.68,
0.38) over-adds R+B relative to the olive target, so re-chroming it toward
the union pebble chroma should walk all three residuals the right way.

Hypothesis: shifting the WideFill chroma (1.0, 0.68, 0.38) -> (0.75, 0.90,
0.30) at the same energy 0.6 moves the wide pebble median toward #2D2C10,
because a sun's per-channel add scales with its colour — less R where R is
already matched (+1 LSB, cut the over-add back toward 0x2D), more G where
G is −2 short (lift toward 0x2C), less B where B sits +14 high (slow its
growth); the tall framing never sees the lamp so the thin tall-pebble
margin (2.34 over bar 8) is protected by construction, and no geometry
changes so silhouette/S2 hold. Scored on the wide pebble median plus
DoD/passing-row intactness, watching wide soil (gap 0.65) and basalt (gap
0.25), which also take the fill.

The tall-soil second-fill alternative was considered and rejected before
rendering: fill can only lighten, tall soil (#292A29 vs #1B1E24, lighter in
every channel) needs darkening — p24's direction argument still holds, and
p25 recommends accepting that row (gap 1.0, within 4% of bar 8) over more
light.

## What changed (`scripts/hero/still.py`, since reverted)

One line of one lamp: `WideFill` colour (1.0, 0.68, 0.38) -> (0.75, 0.90,
0.30); energy 0.6, angle 5°, frontal direction, and the tall-framing hide
all untouched (plus a docstring clause noting the re-chrome, reverted with
it). No new assets (procedural lamp only).

## What moved (p26 -> p28)

dE76 recomputed with measure.py's own `deltaE` on RGB tuples (the p20
method; verified: #2E2A1E vs #2D2C10 = 10.24, #2B2920 vs #2D2C10 = 12.28,
#292A29 vs #1B1E24 = 7.70, #2C291E vs #212111 = 5.66, moss union #384117 per
pass 3; gap = dE/8 per pass 20).

| framing | row | p26 | p28 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2E2A1E, 10.24, gap 1.3 | #2B2920, 12.28, gap 1.5 | AWAY +2.04 (R 46->43 vs 45: overshot past; G 42->41, B 30->32: wrong way) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | bit-identical |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C291E, 5.66, gap 0.7 | bit-identical, margin 2.34 intact |
| wide | 4g soil median | #2F2F2C, 5.21, gap 0.65 | #2F302C, 5.86, gap 0.7 | AWAY +0.65, still in |
| wide | 4g moss median | #343D0B, 4.41, gap 0.55 | #323D0B, 4.54, gap 0.57 | AWAY +0.13, still in |
| wide/tall | 4g basalt median | #0C0D0D / #0A0B0C | median bit-identical (wide k-means reshuffled) | dE unchanged, still in |
| wide | 4g pebble sub-median | meanV 48.83 / meanS 0.377 / k1 0.465 | meanV 46.62 / meanS 0.313 / k1 0.426 | darker AND desaturated, away from union (53.4 / 0.574) |
| tall | 4g all medians | — | every median bit-identical; only 5th-decimal float noise in shares/means | lamp-hide protection held perfectly |
| wide | 4d floor p0_1 / p1 / p5 / p50 | 2.0/4.0/8.07/68.11 | 2.0/4.07/8.72/68.54 | DoD p1 gate (lift iff >= 8.0) intact; p5/p50 drift, not DoD rows |
| tall | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07 | bit-identical | intact |
| wide | 4h dark area | 14.23 % | 14.63 % | +0.40 pp, still in (hero s0 13.97) |
| tall | 4h dark area | 30.84 % | 30.84 % | identical |
| wide/tall | 4a | — | same tokens, denoise-domain moves only | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | band identical, bboxes character-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.5, tall soil 1.0). Visual read: sheets show
no change at frame scale — same composition and cake-layer read; the known
visual gaps (rugged strata, moss cap, spruces, boulder sheen) persist
unchanged; no regression.
VRAM: vram.log device peak 4512 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3009 MiB (derived arithmetic: 4512 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: REVERTED

The target moved the wrong way, +2.04 dE (gap 1.3 -> 1.5), and two passing
wide rows drifted with it (soil +0.65, moss +0.13 — both still in, but paid
for nothing). The hypothesis's per-channel logic failed because cutting the
R/B components cut the lamp's *total* power at fixed energy: the window got
darker (meanV −2.2) and less saturated (meanS −0.064) instead of
rebalanced — R overshot past the union (−2) while G and B moved away. Total
power dominates chroma for a median this dark; a re-chrome that holds total
power constant (raise G to fully compensate the R/B cuts) is a different
experiment, not a dose tweak. Per the keep rule the `still.py` change is
reverted and p26 remains the baseline. A reverted pass still counts as the
intentional pass.

Learning: the fill-side lever's direction is now mapped — p26's warm fill
moved the pebble median −2.84 by *adding* light, and p28's dimmer re-chrome
moved it +2.04 by *removing* total power. The wide pebble median tracks the
fill's total power more than its chroma, and power is now bounded on both
sides: more warm power overshoots the matched R (p27), less total power
darkens/desaturates away (this pass). What is left on this row is a
constant-power chroma rotation (untried: G compensated up as R/B come down),
mix surgery (every thickness swap spent, p20/p24/p25), or accepting the row.
The tall framing's bit-identical medians re-confirm the per-framing lamp as
a safe confinement mechanism — the miss cost nothing outside wide.

Next ranked gaps (baseline p26, unchanged):

1. wide 4g pebble median, gap 1.3
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp;
content restored to the p26 state by the revert) and
`~/hero3d/out/still-223/p28/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` (sha-verified against the
pins); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed);
fetched renders under `hero3d-local/p28/` (git-ignored, never committed).
Committed with this pass: only `docs/research/hero-blender-still/pass-28/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/vram/
precheck/azimuth/exit_code logs). `scripts/hero/still.py` restored to p26
state — no code change kept. No new assets (procedural lamp only — nothing
to source or licence).
