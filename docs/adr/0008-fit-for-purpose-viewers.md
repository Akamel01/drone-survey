# Use fit-for-purpose viewers per deliverable, not one universal viewer

The original requirement was a single feature-rich open-source 3D viewer, used
both to inspect results locally and, embedded, to show them to clients. We are
not doing that, because the three deliverables are not three variants of one
thing. An Orthomosaic is a georeferenced raster whose natural presentation is a
tiled web map — putting it in a 3D scene discards the georeferencing that makes
it a map at all. A Gaussian Splatting result needs a splat renderer, a different
rasterisation path from geometry. Meshes and point clouds are conventional 3D.
A tool covering all three handles each worse than the tool built for it.

A second split sits inside the same requirement: inspecting and cleaning a
result is a different job from presenting it. Aerial splats arrive with floaters
and ground-plane noise that have to be trimmed before delivery, which is an
editor's work — and an editor is the last thing that should be embedded in a
client-facing page.

So each deliverable gets the tool suited to it, for each of the two jobs. The
cost is learning more than one tool. The benefit is that no deliverable is
presented through something that misunderstands what it is.

## Consequences

Specific tool choices are deliberately not recorded here; this ADR fixes the
shape of the answer, not its contents, so that a better tool for one data type
can be adopted without reopening the principle.

The client-facing site therefore has to present more than one kind of embed.
That is a real cost in the website build, and it is accepted because the
alternative degrades every deliverable to make one page simpler.

## Revision, 2026-09-10

Licence corrections after review. CloudCompare is **GPL-2.0-or-later**, not
GPL-3.0 as previously recorded here. MapLibre GL JS is **BSD-3-Clause** and its
licence was never stated; note that it is a fork of Mapbox GL JS made after that
project became proprietary, so the `mapbox-gl` and `maplibre-gl` packages are
easy to confuse and only the latter is acceptable.

Everything client-facing therefore ships under permissive terms — MIT for the
splat viewer, BSD for the map and point-cloud viewers — which is what makes
static delivery possible at all. The obligation those licences do impose is
attribution: see ADR 0011.
