# Pass 19: harder per-layer protrusion swing — kept

Base: pass-18 p18 (`~/hero3d/out/still-223/p18/` on akamel-linux), 3 rows out.
This pass's render: p19 (`~/hero3d/out/still-223/p19/`, fetched to
`hero3d-local/p19/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap (visual, read the sheets): the hero's strata are rugged uneven courses;
ours read as flat cake layers. Pass 18 proved alternating per-layer
protrusion moves the strata medians the right way but at 0.030/0.000/0.030
the rugged read did not arrive — only a whisper of extra ledge shadow.

Hypothesis: pushing the proud/recessed swing harder, 0.030 -> 0.050 on the
two proud pebble courses (x `ledge_scale` 2.0 = 0.10 effective, still under
the 0.16-0.18 course thickness so island bulk holds), deepens the crevice
shadows into a frame-scale rugged read and pulls the pebble medians further
toward target. Scored on the tall/wide pebble medians plus DoD intactness.

## What changed (`scripts/hero/still.py`, committed with this pass)

One knob dimension only: the two proud pebble-band `prot` values in LAYERS,
0.030 / 0.000 / 0.030 -> 0.050 / 0.000 / 0.050 (top and bottom proud, middle
recessed-flush). Thicknesses, tints, grav flags, and every soil/humus/rock
layer untouched. No new assets.

## What moved (p18 -> p19)

| framing | row | p18 | p19 | verdict |
|---|---|---|---|---|
| tall | 4g pebble median | #24231E | #24221C | toward #212111, dE 7.62 -> 6.87, gap 1.0 -> 0.9, now IN (bar 8) |
| tall | 4g soil median | #2C2C29 | #2C2C29 | toward #1B1E24, dE 9.39 flat, gap 1.2 -> 1.2 |
| wide | 4g pebble median | #23221F | #22211D | toward #2D2C10, dE 16.90 -> 16.34, gap 2.1 -> 2.0 |
| wide | 4g soil median | #2F2F2B | #2F2F2B | flat, gap 0.7 -> 0.7, still in |
| tall/wide | 4b falloff_sat | 0.363 / 0.383 | 0.363 / 0.383 | unmoved (4th-decimal noise) |
| tall/wide | 4d p1 / p0_1 | 3.07/1.79, 3.79/2.0 | identical | intact |
| tall/wide | 4h dark area | 30.84 / 14.19 % | 30.84 / 14.19 % | unmoved |
| 4a / 4i / S2 | — | — | tokens unchanged, band identical, PASS both | intact |

Rows out: 3 -> 2 (wide pebble 2.0, tall soil 1.2; gap =
dE76 vs the look-spec union median / 8). Visual read: the zoomed cut-face
comparison (p18 vs p19 tall, `/tmp/review223/p19-vs-p18-zoom.png`, uncommitted)
shows the tan courses carrying a slightly deeper shadow line under their lips —
still cake layers at frame scale, not rugged. Protrusion alone, even at 0.10
effective, does not buy ruggedness; the hero's courses vary in thickness, not
just relief.
VRAM: vram.log device peak 4510 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3007 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0 after 55 s).

## Keep-or-revert: KEPT

Both pebble rows moved toward target — tall pebble crossed inside the bar —
with 4d bit-identical, S2 PASS, 4a/4i intact, and no visual regression on the
sheets, so the LAYERS change stays and p19 becomes the new baseline for the
strata work. Honest limit recorded above: the rugged read still has not
arrived; protrusion amplitude is now large enough that further pushes risk
silhouette change for no visual payoff.

Learning: per-layer protrusion is a colour/median lever, not a shape lever —
two passes of it moved medians but not the frame-scale read. Next: vary
pebble-course thickness per layer (the hero's courses differ in thickness, not
just relief), or stop pushing strata and take the next visual gap instead.

Next ranked gaps (baseline p19):

1. wide 4g pebble median, gap 2.0
2. tall 4g soil median, gap 1.2

Visual gaps (rugged-strata row tried twice via relief, rest unchanged, read the
sheets): uneven strata thickness vs uniform courses, shaggy overhanging moss
cap, dense dark spruces vs open saplings, sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p19/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) re-extracted from `research/hero-look-spec` (@956966c) and
sha256-verified against the pins; hero panels cropped bit-exact from the
pass-6 committed sheets (values from CSV). Tailscale was already up.
Review under the worktree-local `.review-venv` (untracked, never committed).
