# Pass 27: deepen recessed middle-pebble course (shading-side) — tried, measured, REVERTED

Base: pass-26 p26 (`~/hero3d/out/still-223/p26/` on akamel-linux), 2 rows out.
This pass's render: p27 (`~/hero3d/out/still-223/p27/`, fetched to
`hero3d-local/p27/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.3 (dE76 10.24, ours #2E2A1E vs union
#2D2C10 — R matched, G −2, B +14). Pass 26's Learning prescribes the next
lever on this row: remove blue from shadowed pixels via geometry that shades
differently, since additive light cannot subtract blue.

Two candidate follow-ups were considered and rejected before rendering:

- Tall-only fill into soil courses (the tall-soil analogue): pass 24
  established that a bounce lamp lightens a median that needs darkening —
  tall soil (#292A29 vs #1B1E24) is lighter in every channel, so any fill is
  the wrong direction by construction.
- More WideFill energy: R is already matched (+1 LSB) so more warm light
  overshoots R while B stays pinned, and pass 26 already spent the
  wide-soil/basalt margins (gaps 0.65/0.25) — margin-unsafe for near-zero
  expected gain.

Hypothesis: deepening the recessed middle pebble course (prot 0.000 ->
−0.025, x `ledge_scale` 2.0 = −0.05 effective, half the proud relief) cuts
blue skylight into its shadow pixels, removing blue from the wide pebble
window's shadow population and moving the wide pebble median toward #2D2C10;
the change is inward so the proud courses still define the silhouette max
(S2 holds), and shadow-darkening moves the 4d floor down (safe direction for
the p1 >= 8.0 lift gate). Scored on the wide pebble median plus
DoD/passing-row intactness, watching tall pebble (pass-22 precedent: relief
re-mixes the tall pebble window; margin 2.34 over bar 8).

## What changed (`scripts/hero/still.py`, since reverted)

One knob dimension only: the `prot` of the recessed middle pebble row,
0.000 -> −0.025 (hero.py `r = base + prot + …`, so negative recesses
inward). Thicknesses, tints, grav flags, lamps, all other courses untouched.
No new assets (procedural knob only).

## What moved (p26 -> p27)

dE76 recomputed with measure.py's own `deltaE` on RGB tuples (the p20
method; verified: #28261E vs #2D2C10 = 13.08, #2E2A1E vs #2D2C10 = 10.24,
#292A29 vs #1B1E24 = 7.70, #2C291E vs #212111 = 5.66; wide soil union
#252729 per the look spec §4g).

| framing | row | p26 | p27 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2E2A1E, 10.24, gap 1.3 | #2E2A1E, 10.24, gap 1.3 | UNMOVED (0.00 dE) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292928, 7.49, gap 0.9 | TOWARD -0.21 (1 LSB) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C281E, 5.98, gap 0.7 | AWAY +0.33, still IN (bar 8) but margin 2.34 -> 2.02 |
| wide | 4g soil median | #2F2F2C, 5.21 | #2F2E2C, 4.65 | TOWARD -0.56 (1 LSB), still in |
| wide | 4g moss median | #343D0B | #343D0B | bit-identical, still in |
| wide/tall | 4g basalt median | #0C0D0D / #0A0B0C | bit-identical | dE unchanged, still in |
| wide | 4g pebble sub-median | meanV 48.83 / meanS 0.378 / k1 0.465 | meanV 48.10 / meanS 0.378 / k1 0.475 | V AWAY from union 53.4 (-0.72); k-shares reshuffled, median pinned |
| tall | 4g soil meanV (sub-median) | 49.98 | 49.33 | darker (-0.65), median -0.21 |
| tall/wide | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07, 2.0/4.0/8.07 | bit-identical | intact |
| wide | 4d p50 (midtone, not floor) | 68.11 | 67.47 | drift -0.64, not a DoD row |
| tall | 4d p50 | 31.14 | 31.14 | identical |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.390 / 0.358 | 0.390 / 0.358 | 4th-decimal noise |
| wide | 4h dark area | 14.23 % | 14.23 % | +0.0002 pp, still in (hero s0 13.97) |
| tall | 4h dark area | 30.84 % | 30.84 % | -0.0002 pp |
| wide/tall | 4a | — | moves <= 0.002 dE (denoise-domain) | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | bit-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.3, tall soil 0.9). Visual read: sheets show
no change at frame scale — same composition and cake-layer read; no
regression. S2 bboxes bit-identical both framings.
VRAM: vram.log device peak 4508 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3005 MiB (derived arithmetic: 4508 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: REVERTED

The target moved 0.00 dE while a passing row paid for the experiment: tall
pebble went 5.66 -> 5.98 dE (+0.33, margin 2.34 -> 2.02). The mechanism also
ran wrong-signed on the sub-median means — deepening the recess darkened the
wide pebble window (meanV −0.72) when the union wants it brighter (53.4 vs
48.8) — so a stronger dose would push V further away, not cross the median's
50% step. Per pass 22's rule, a change that spends a passing row's margin
for zero target gain is not kept: `scripts/hero/still.py` is restored to
p26 state and p26 remains the baseline. A reverted pass still counts as the
intentional pass.

Learning: the middle-pebble recess is confirmed as a live shading lever on
both soil windows (tall soil −0.21, wide soil −0.56 at 1 LSB each) but it
re-mixes the tall pebble window at ~0.3 dE per 0.025 prot — relief anywhere
in the stack still taxes the thin tall-pebble margin first. The wide pebble
median is now pinned by window mix, not by any single course's shading: the
remaining untried move on it is mix surgery (pass-20/24 class, but every
thickness swap is spent) or accepting the row.

Next ranked gaps (baseline p26, unchanged):

1. wide 4g pebble median, gap 1.3
2. tall 4g soil median, gap 0.9 (7.49 vs bar 8)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp;
content restored to the p26 state by the revert) and
`~/hero3d/out/still-223/p27/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` (sha-verified against the
pins); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed);
fetched renders under `hero3d-local/p27/` (git-ignored, never committed).
Committed with this pass: only `docs/research/hero-blender-still/pass-27/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/vram/
precheck/azimuth/exit_code logs). `scripts/hero/still.py` restored to p26
state — no code change kept. No new assets (procedural knob only — nothing
to source or licence).
