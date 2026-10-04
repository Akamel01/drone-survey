# Pass 51: moss-cap clump bump on turf (relief-as-texture dose) — measured, REVERTED

Base: pass-47 p47 (`~/hero3d/out/still-223/p47/` on akamel-linux), 2 rows out.
This pass's render: p51 (`~/hero3d/out/still-223/p51/`, fetched to
`hero3d-local/p51/` — git-ignored work files; the committed record is this dir).
No stale p51 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot. Takes the pass-50 Next section's first
unspent modelling cell (moss-cap relief as TEXTURE — bump, never tried) for
the operator-named island gap "shaggy overhanging moss cap". Asset/morphology
work, not a parameter nudge: one new procedural shader node chain, no lamp,
albedo, hue, tint, LAYERS, camera, sky, or ridge knob touched.

## The one gap + hypothesis

Gap: the island's cap reads as smooth turf against the hero's shaggy,
overhanging moss cap (visual gap open since research start; the turf/moss
medians all sit in with margin, so this is a visual-row pass, not a metric
row pass).

Hypothesis: stacking procedural clump noise through a Bump node on the turf
cap's existing NormalMap normal moves the cap toward the hero's shaggy read,
because per-pixel normal perturbation adds clump-scale light/shadow variation
across the cap while the base micro-normal shading is preserved underneath.
Bump-only (no displacement, no geometry), so S2/silhouette hold by
construction. Dose: TexNoise scale 5.0 on Object coords (island top R = 3 m,
so ~0.2 m clumps, ~30 across the cap — clump scale, not grain), Bump strength
0.7, Detail 2. Scored on the visual read (cap shag on the sheets) FIRST, plus
turf/moss medians (known collateral), plus DoD/floor/4h intactness. Collateral
watch: tall turf (p47 4.36 vs bar 8), wide 4h (p47 13.823 vs 14.8 ceiling),
wide 4d p1 (p47 4.0722 vs bar <= 8). Visual keep bar: a visible shag step on
the cap toward the hero, else revert.

## What changed (`scripts/hero/still.py`, REVERTED)

One coherent procedural addition: K2 `moss_bump_scale` 5.0 /
`moss_bump_strength` 0.7 plus `moss_cap_relief()`, called once after
`island_palette()` — TexCoord.Object -> TexNoise -> Bump.Height, existing
NormalMap normal -> Bump.Normal, Bump.Normal -> Principled Normal on the
`turf` material only. Guarded by one loud assert (Normal source must be
NORMAL_MAP, i.e. hero.py mat_turf's nor_gl chain). Moss/grass scatter
instances, their asset materials, LAYERS, lamps, tints, cameras untouched.
No new assets (fully procedural — nothing to source or licence).
Reverted, so `still.py` is byte-identical to the p47 kept content
(md5 a525d9cce1700572506ba557df6454ae both sides); the host stage copy was
restored to the same file and re-verified.

## What moved (p47 -> p51)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method; method
re-verified in p50: #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs #1B1E24 =
7.70 exact; gap = dE/8, gap 1.0 = out; 4h gap = |v − 12.3|/2.46, ceiling
14.8). Every scored median below is hex-identical, so every dE/gap is carried
over exact from p47. Full-frame p47-vs-p51 mean abs pixel diff: wide 0.0011
/ tall 0.0017 levels (denoise-domain noise only). k-shares reshuffled while
medians held — scored on medians only per the standing tool note.

| framing | row | p47 | p51 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED (baseline out-row untouched) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical | PINNED (baseline out-row untouched) |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical | PINNED — margin intact |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | hex-identical | PINNED (p50's 1-step wobble did not repeat) |
| tall/wide | 4g turf medians | #273111 4.36 / #2B3410 9.04 | hex-identical, dE flat | PINNED — the bump reaches no turf-median pixel |
| tall/wide | 4g moss medians | #313B0A / #353E0B | hex-identical | PINNED |
| tall/wide | 4g basalt medians | #0A0B0C / #0D0D0D | hex-identical | PINNED |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | p0_1/p1/p5 float-identical (p50 72.2864->72.2788, not a DoD row) | DoD p1 gate holds at 4.0722 |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical incl. p50 | intact |
| wide | 4h dark area | 13.82296 %, gap 0.6 | 13.82561 % (+0.003), gap 0.6 | noise — ceiling margin never approached |
| tall | 4h dark area | 30.15915 % | 30.16016 % (+0.001) | noise |
| wide/tall | 4h edge density | 0.25259 / 0.57144 | 0.25256 / 0.57140 | noise |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36420 / 0.25228 | 0.36421 / 0.25228 | still in |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39110 / 0.35894 | 0.39110 / 0.35894 | still in |
| tall/wide | 4a | — | 4th–6th-decimal sky-fit wobbles | status unchanged |
| tall/wide | 4e DOF | lapvar D1 667.13/422.44 | 667.06 (−0.1 %)/422.42 (−0.0 %); σ within ±25 % | no row-status change |
| tall/wide | 4c/4f TOOL | — | 4c identical; grain sigma ±1e-4 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; bboxes identical to p47 (tall x 0.480-1.000 y 0.448-0.885, wide x 0.602-0.931 y 0.290-0.858), still PASS | intact |

Rows out: 2 -> 2 (the same two baseline out-rows, both pinned at 0.00 dE).
Visual read: full-res island crops p47-vs-p51 are pixel-identical to the eye
at every scale — the cap reads exactly as before, no clump relief, no shag
step anywhere; the sheets read identically to p47 against the hero. The
turf surface the bump was applied to is occluded at frame scale by the dense
grass/moss scatter instances (TopMoss/LipMoss/grass geometry) — the bump
couples to ~zero visible pixels. The visual keep bar fails outright.
VRAM: vram.log device peak 4512 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3009 MiB (derived arithmetic: 4512 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

Neither half of the keep test passes: no visible step (crops identical, the
relief reaches no visible pixel) and no target-metric movement (every scored
median hex-identical, 0.00 dE). Nothing breaks — DoD floors float-identical
(wide p1 at 4.0722), no passing row changes status, S2 PASS both, VRAM gate
clear — but keep needs movement toward the hero or a visible step, and this
pass has neither. A reverted pass moves nothing: p47 stays the kept baseline.

Learning: the turf-bump cell is now MAPPED and CLOSED — and it closed as the
wrong LAYER, not a weak dose. The frame-scale cap read is the scatter
instances (TopMoss/LipMoss/grass meshes), not the turf surface; the turf is
occluded, so relief-as-texture on turf couples at ~0.001 levels mean-abs no
matter the scale/strength. Do not bump the turf again for shag. The shag
mechanism, if pursued, lives one layer up: the moss/grass SCATTER instances
themselves (their asset-material normals, or instance geometry) — a different,
untried layer from this pass. Dose-response note: turf texture relief couples
to the cap read at ~0.0 levels — this path is inert by occlusion, not merely
weak. Tool note stands: score k-cluster-adjacent claims on medians only
(k-shares reshuffled again this pass while every median held hex-identical).

Next ranked gaps (baseline still p47, still 2 rows out):

1. wide 4g pebble median, gap 1.0 (7.77; material path closed, lamp map closed
   from both sides, texture statistics closed by p50 — the one untried
   mechanism left is the grav-flag composition flip: recessed middle course
   1 -> 0, both out-row windows at one flag; else accept at gap 1.0, within
   3% of bar 8, or asset work only: a genuinely low-blue gravel albedo, which
   no knob on the current texture can reach)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42,
   basalt-spec bounce mapped as AWAY by p48 — accept at gap 1.0, or asset
   work only)

Visual gaps (read the sheets): shaggy overhanging moss cap (turf-texture
layer closed by THIS pass as occluded — remaining direction is the scatter
instances themselves: moss/grass asset-material relief or instance geometry;
moss/grass scatter density never dosed), dense dark spruces vs open saplings
(tint mapped x0.85, count closed by p46 — crown branch GEOMETRY with visual
bar, or deeper/hue doses under the p47 advisory), rugged uneven strata vs
flat cake layers (needs bigger work than a one-knob pass), sheened boulders
(specular path falsified p48 — needs bounced light or asset work).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p51 bump change, then restored to the p47-kept content by the revert —
verified: md5 a525d9cce1700572506ba557df6454ae both sides) and
`~/hero3d/out/still-223/p51/` (fresh pass dir, both framings in one shot).
Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / free 19G (precheck
device 1503/12282 MiB free 10779). This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in the worktree-local `.review-venv/
review-inputs/` (untracked, never committed) with `--hero-s0-csv` (the tool
re-verifies both pins itself); hero panels are the 960-px copies there
(values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p51/`
(git-ignored, never committed); per-pass measure JSONs retained there, not
committed — the committed numeric record is scores.json (244 measured rows).
Committed with this pass: `docs/research/hero-blender-still/pass-51/`
(sheets, scorecard, changes, scores.json, s2.txt, render/vram/precheck/
azimuth/exit_code logs). No new assets (fully procedural — nothing to source
or licence). `scripts/hero/still.py` reverts to the p47 content, so it
carries no diff.
