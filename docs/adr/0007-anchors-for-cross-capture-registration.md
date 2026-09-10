# Place physical Anchors so Captures can be registered to each other

A 3D Timelapse requires every Capture of a Site to land in one coordinate frame.
Consumer GPS gives 2–10m, far too coarse to cross-fade two Reconstructions, and
we have no RTK and no Ground Control Points in phase 1. ODM offers an alignment
step that registers a Capture against an earlier one by matching surface
geometry, but that mechanism finds the frame by locking onto geometry that did
not change — and a construction site, which is the use case, progressively
destroys exactly that. The deliverable would get harder to produce the further
the project it documents progresses.

The reframe that makes this cheap: a timelapse needs **consistency between
Captures**, not absolute truth. We do not need surveyed coordinates, only the
same stable features visible in every Capture. So each Site gets physical
**Anchors** placed deliberately outside the changing footprint — on a kerb, a
manhole cover, a neighbouring wall — and ODM's alignment registers against those
rather than against whatever happens to still be standing.

## Consequences

Anchors have to be present in the **first** Capture of a Site. A Capture flown
without them cannot join that Site's timelapse afterwards, so the sequence would
have to restart. Placing Anchors therefore becomes part of onboarding a Site,
before the first flight, and belongs in the capture standard alongside Overlap
and altitude.

This holds even if the timelapse pipeline itself is built much later: putting
Anchors down from the first flight costs almost nothing and preserves the
option.

Anchors are deliberately not Ground Control Points. A GCP's real-world
coordinates are independently known and anchor a Reconstruction to absolute
space; an Anchor's coordinates are unknown and only tie Captures to each other.
When survey-grade work arrives in phase 2, Anchors do not become GCPs by
themselves — they would have to be surveyed. Placing them where a surveyor could
later reach them is close to free now and awkward to retrofit.
