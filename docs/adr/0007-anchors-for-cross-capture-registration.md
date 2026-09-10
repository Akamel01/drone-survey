# Register Captures by Anchor correspondence, not by surface alignment

Revised 2026-09-10 after review. The decision to place physical Anchors stands;
the mechanism originally specified does not work and has been replaced.

A 3D Timelapse requires every Capture of a Site to land in one coordinate frame.
Consumer GPS gives 2–10m, far too coarse, and we have no RTK and no surveyed
Ground Control Points in phase 1. Each Site therefore gets physical **Anchors**:
marked positions placed deliberately outside the part of the Site that changes —
on a kerb, a manhole cover, a neighbouring wall — present in every Capture.

**How they are used.** Each Anchor's position is read once from consumer GPS and
written into ODM's ground control file as a placeholder coordinate. Every
subsequent Capture tags the same Anchors as pixel correspondences against those
same placeholder coordinates. Registration is then correspondence-based: Captures
agree because they are tied to the same points, not because their surfaces
happen to match.

## Why not surface alignment

The original version of this ADR assumed ODM's alignment step would lock onto
the Anchors. It cannot. That step performs a coarse elevation-model match
followed by iterative closest point over the **whole** surface, uniformly: there
is no region of interest, no per-point weighting, and no way to nominate a
marker. Anchors are invisible to it.

That makes the mechanism fail exactly where it was introduced to help. Surface
alignment finds the best overall overlap, so when the changing footprint grows
to dominate the Site — which is what a construction project does — the
alignment is dragged by the construction rather than anchored against it.
Placing markers outside the footprint does not change this, because the
algorithm never treated them as special.

Correspondence-based registration has none of that behaviour. Tie points hold
regardless of how much of the surrounding surface changed.

## Consequences

Anchors must be present in the **first** Capture of a Site, and their placeholder
coordinates read at the same time. A Capture flown without them cannot join that
Site's timelapse afterwards, so placing Anchors and recording their positions is
part of onboarding a Site, before the first flight.

Tagging Anchors in each Capture is manual work per Capture, where surface
alignment would have been automatic. That cost is the price of a mechanism that
actually works, and it is bounded: a handful of points per Capture.

Placeholder coordinates make the Reconstruction internally consistent and
absolutely wrong — every Capture is tied to the same fiction. This is correct for
a timelapse, which needs Captures to agree with each other, and useless for
absolute measurement, which we do not claim. Phase 2 upgrades this by replacing
the placeholder coordinates with surveyed ones: the correspondences do not
change, so previously flown Captures can be re-registered rather than refllown.
Place Anchors where a surveyor could later reach them.
