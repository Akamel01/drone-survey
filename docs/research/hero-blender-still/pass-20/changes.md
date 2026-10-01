# Pass 20: per-layer pebble thickness — kept

Base: pass-19 p19 (`~/hero3d/out/still-223/p19/` on akamel-linux), 2 rows out.
This pass's render: p20 (`~/hero3d/out/still-223/p20/`, fetched to
`hero3d-local/p20/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap (visual, read the sheets): the hero's strata are rugged *uneven* courses;
ours read as flat cake layers. Passes 18-19 proved protrusion is a
colour/median lever, not a shape lever — the hero's courses differ in
*thickness*, not just relief, and our three pebble courses were near-uniform
(0.16 / 0.16 / 0.18).

Hypothesis: thickening the two proud olive courses (0.16/0.18 -> 0.20/0.22)
at the expense of the recessed middle course (0.16 -> 0.10) fills measure.py's
+-3 %-of-island-height pebble window with more lit olive pixels and fewer
recessed-shadow pixels, pulling the wide pebble median toward #2D2C10;
total strata thickness held constant so silhouette/S2 hold. Scored on the
wide/tall strata medians plus DoD intactness.

## What changed (`scripts/hero/still.py`, committed with this pass)

One knob dimension only: LAYERS thicknesses — pebble top 0.16 -> 0.20,
top soil 0.10 -> 0.08 (balances the total), pebble middle 0.16 -> 0.10,
pebble bottom 0.18 -> 0.22; sediment, dark soil, humus, rock untouched.
Pebble sum 0.50 -> 0.52, total strata unchanged; middle course 0.10 still
above the 0.08 floor. Prot values, tints, grav flags untouched. No new assets.

## What moved (p19 -> p20)

| framing | row | p19 | p20 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #22211D | #28261E | toward #2D2C10, dE 16.34 -> 13.08, gap 2.0 -> 1.6 |
| tall | 4g pebble median | #24221C | #2C291E | toward #212111, dE 6.87 -> 5.66, gap 0.9 -> 0.7, still IN (bar 8) |
| tall | 4g soil median | #2C2C29 | #2B2B29 | toward #1B1E24, dE 9.39 -> 8.61, gap 1.2 -> 1.1 |
| wide | 4g soil median | #2F2F2B | #2E2E2C | toward target, dE 6.11 -> 5.11, gap 0.8 -> 0.6, still in |
| tall/wide | 4b falloff_sat | 0.363 / 0.383 | 0.362 / 0.383 | unmoved (4th-decimal noise) |
| tall/wide | 4d p1 / p0_1 | 3.07/1.79, 3.79/2.0 | identical | intact |
| tall/wide | 4h dark area | 30.84 / 14.19 % | 30.84 / 14.19 % | unmoved |
| 4a / 4i / S2 | — | — | tokens unchanged, band identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.6, tall soil 1.1; gap =
dE76 vs the look-spec union median / 8) — but both moved substantially, and
the tall pebble row stayed IN. Visual read: the thicker tan courses show on
the sheets with no silhouette change (S2 bboxes bit-identical); the
frame-scale read is still cake layers, not rugged — thickness alone at this
redistribution did not buy ruggedness either, though unlike protrusion it
moved the wide row by 3.3 dE.
VRAM: vram.log device peak 4510 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3007 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0 after 55 s).

## Keep-or-revert: KEPT

All four strata medians moved toward target — wide pebble by 3.3 dE — with
4d bit-identical, S2 PASS, 4a/4i intact, and no visual regression on the
sheets, so the LAYERS change stays and p20 becomes the new baseline for the
strata work. Honest limit recorded above: neither relief (p18-19) nor this
thickness redistribution has produced the frame-scale rugged read; the
remaining lever on this row is surface breakup (displacement/detail), or the
strata row is left while a fresh visual gap is taken instead.

Learning: per-layer thickness is a stronger colour/median lever than
protrusion (wide pebble -3.3 dE in one pass vs -0.6 over two), but it is
still not a shape lever at frame scale.

Next ranked gaps (baseline p20):

1. wide 4g pebble median, gap 1.6
2. tall 4g soil median, gap 1.1

Visual gaps (relief tried 2x, thickness 1x, rest unchanged, read the
sheets): rugged uneven strata vs flat cake layers (still open — needs
surface breakup, not course geometry), shaggy overhanging moss cap, dense
dark spruces vs open saplings, sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p20/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free (Mac / has 97G free). This Mac rendered
nothing; review ran Mac-side via still_review.py + pinned measure.py
(26f93fce…) and measurements.csv (2df42cf8…) in `/tmp/review223`
(sha-verified against the pins); hero panels are the 960-px copies there
(values from CSV). Tailscale was already up.
Review under the worktree-local `.review-venv` (untracked, never committed).
Committed with this pass: only `docs/research/hero-blender-still/pass-20/`
plus the `scripts/hero/still.py` LAYERS change.
