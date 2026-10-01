# Pass 21: soil tint x0.85, decoupled from gravel — tried, measured, REVERTED

Base: pass-20 p20 (`~/hero3d/out/still-223/p20/` on akamel-linux), 2 rows out.
This pass's render: p21 (`~/hero3d/out/still-223/p21/`, fetched to
`hero3d-local/p21/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.1 (dE 8.61 vs bar 8; ours #2B2B29 vs
union #1B1E24 — mostly a lightness gap). Wide pebble (gap 1.6) was left
alone: passes 18-20 exhausted its protrusion/thickness levers, and the
pass-6 learning says tint leaves wide pebble unmoved while exposure-side
work risks the sky (4a is in DoD).

Hypothesis: scaling the shared soil-row linear tint x0.85 moves the tall
soil median toward #1B1E24 because the three grav=0 soil rows carry the
linear soil target directly with no gravel mix — darkening their albedo
lowers the soil-window median lightness without touching the
gravel/pebble path, sky, or basalt, so S2, 4a, 4d and 4i hold; wide soil
(dE 4.45, 2.9 margin) stays in.

## What changed (`scripts/hero/still.py`, since reverted)

One knob dimension only: the soil tint tuple shared by the three grav=0
rows — (0.0110, 0.0130, 0.0176) -> (0.0094, 0.0111, 0.0150), i.e. x0.85 —
on the soil, sediment and dark-soil rows. Thicknesses, prot values, pebble
tints, grav flags untouched. No new assets (procedural knob only).

## What moved (p20 -> p21)

| framing | row | p20 | p21 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2B2B29, 8.61, gap 1.1 | #2B2B29, 8.61, gap 1.1 | UNMOVED (0.00 dE) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | identical | still IN (bar 8) |
| wide | 4g pebble median | #28261E, 13.08, gap 1.6 | identical | unmoved |
| wide | 4g soil median | #2E2E2C, 4.45, gap 0.6 | identical | still in |
| tall/wide | soil meanV (sub-median) | 50.50 / 51.83 | 50.32 / 51.69 | right direction, -0.19/-0.14 levels (~0.4 %) |
| tall/wide | 4d p0_1 / p1 / p5 | 1.79/3.07/5.07, 2.0/3.79/6.93 | bit-identical | intact |
| tall/wide | 4d p50 (midtone, not floor) | 31.647 / 65.477 | 31.575 / 65.463 | drift -0.07/-0.01, noise |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.363 / 0.383 | 4th-decimal noise |
| 4a / 4i / S2 | — | — | deltas 4th-decimal, band 85.78/83.38 identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.6, tall soil 1.1). Visual read: sheets show
no change at frame scale — same cake-layer strata read, no regression, no
improvement.
VRAM: vram.log device peak 4512 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3009 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0).

## Keep-or-revert: REVERTED

The target moved 0.00 dE: a x0.85 albedo cut on the soil rows is absorbed
almost entirely (soil meanV -0.4 %, medians bit-identical). The soil-window
median pixels evidently sit where albedo barely registers — recessed,
shadow-dominated courses under the cliff-detail multiply — so tint is not
a lever on this row at this dose, just as protrusion was not a shape lever
on pebble (p18-19). Keeping a no-op tint edit would add diff without
progress, so `scripts/hero/still.py` is restored to p20 state and p20
remains the baseline. A reverted pass still counts as the intentional pass.

Learning: soil tint at x0.85 is below detection on the soil median
(0.00 dE vs the 0.7 needed). The row's next options are a much stronger
dose (which spends the wide soil margin blind) or a light-side approach —
raising soil-course protrusion so window pixels catch light instead of
scaling an albedo the shadows swallow.

Next ranked gaps (baseline p20, unchanged):

1. wide 4g pebble median, gap 1.6
2. tall 4g soil median, gap 1.1

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p21/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free (Mac / has 97G free). This Mac rendered
nothing; review ran Mac-side via still_review.py + pinned measure.py
(26f93fce…) and measurements.csv (2df42cf8…) in `/tmp/review223`
(sha-verified against the pins); hero panels are the 960-px copies there
(values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p21/`
(git-ignored, never committed). Committed with this pass: only
`docs/research/hero-blender-still/pass-21/` (sheets, scorecard, changes,
measure jsons, scores.json, s2.txt, render/vram/precheck logs).
`scripts/hero/still.py` restored to p20 state — no code change kept.
