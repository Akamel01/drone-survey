# Pass 18: per-layer pebble protrusion — kept

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p18 (`~/hero3d/out/still-223/p18/`, fetched to
`hero3d-local/p18/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap (visual, read the sheets): the hero's strata are rugged uneven courses;
ours read as flat cake layers. Pass 17 proved surface-relief magnitude
(strata_disp 0.12 -> 0.20) does not read as rugged, and its learning named
the mechanism: the hero's courses vary in thickness/protrusion per layer
while our LAYERS prot was a uniform 0.015 on all three pebble bands.

Hypothesis: varying per-layer pebble protrusion — alternating
proud/recessed/proud courses — roughens the cut faces into uneven courses
that cast real crevice shadows and read rugged at frame scale, while
silhouette/S2/DoD hold because thicknesses, and therefore overall island
bulk, are unchanged. Scored on the tall strata medians plus DoD intactness.

## What changed (`scripts/hero/still.py`, committed with this pass)

One knob dimension only: the three pebble-band `prot` values in LAYERS,
0.015 / 0.015 / 0.015 -> 0.030 / 0.000 / 0.030 (top proud, middle
recessed-flush, bottom proud; x `ledge_scale` 2.0 at build). Thicknesses,
tints, grav flags, and every soil/humus/rock layer untouched. No new assets.

## What moved (p7 -> p18)

| framing | row | p7 | p18 | verdict |
|---|---|---|---|---|
| tall | 4g pebble median | #242320 | #24231E | toward #212111, dE 9.03 -> 7.62, gap 1.1 -> 1.0 |
| tall | 4g soil median | #2D2D29 | #2C2C29 | toward #1B1E24, dE 10.17 -> 9.39, gap 1.3 -> 1.2 |
| wide | 4g pebble median | #232320 | #23221F | flat, dE 16.86 -> 16.90, gap 2.1 -> 2.1 |
| wide | 4g soil median | #302F2B | #2F2F2B | flat, gap 0.7 -> 0.7 |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.363 / 0.383 | unmoved (4th-decimal noise) |
| tall/wide | 4d p1 / p0_1 | 3.07/1.79, 3.79/2.0 | identical | intact |
| tall/wide | 4h dark area | 30.84 / 14.19 % | 30.84 / 14.19 % | unmoved |
| 4a / 4i / S2 | — | — | tokens unchanged, band identical, PASS both | intact |

Rows out: 3 -> 3 (wide pebble 2.1, tall soil 1.2, tall pebble 1.0; gap =
dE76 vs the look-spec union median / 8). Visual read: the zoomed cut-face
comparison (p7 vs p18 tall) shows at most a whisper of extra ledge shadow
on the middle course — the courses still present as smooth cake layers at
frame scale. The rugged read has not arrived; the +/-0.03 protrusion swing
is small against the 0.16-0.18 course thickness.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: KEPT

Both tall strata rows moved toward target with 4d bit-identical, S2 PASS,
4a/4i intact, and no visual regression on the sheets — a small measured
gain in the pass's named direction, so the LAYERS change stays and p18
becomes the new baseline for the strata work. Honest limit recorded above:
protrusion alone at this amplitude does not buy ruggedness.

Learning: per-layer protrusion moves the strata medians the right way, but
the amplitude needed to read as rugged at frame scale is larger than a
+/-0.03 swing — or the thickness itself must vary per course the way the
hero's does. Next: push the proud/recessed swing harder (e.g. 0.05/0.0),
or vary pebble-course thickness per layer.

## Next ranked gaps (baseline p18)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.2
3. tall 4g pebble median, gap 1.0

Visual gaps (rugged-strata row partially tried, rest unchanged, read the
sheets): rugged uneven strata vs flat cake layers (still open — amplitude
was too small), shaggy overhanging moss cap, dense dark spruces vs open
saplings, sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p18/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) re-extracted from `research/hero-look-spec` (@956966c) and
sha256-verified against the pins; hero panels cropped bit-exact from the
pass-6 committed sheets (values from CSV). Tailscale was down at session
start and brought up (`tailscale up`, no sudo) to reach the host.
Review under the worktree-local `.review-venv` (untracked, never committed).
