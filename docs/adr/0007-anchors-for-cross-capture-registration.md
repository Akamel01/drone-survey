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

## Revision, 2026-09-10 — Anchors are detected automatically

ADR 0015 makes automation the primary goal, which rules out the manual tagging
described above. Anchors are now found and identified by software, with no
person in the routine path.

**Uncoded targets, identified by position.** Coded fiducials that carry their own
identity were ruled out on resolution: at this aircraft's ground sample distance
they would need to be between 66cm and 2.75m across. Instead each Anchor is a
40cm square slab painted with a black-and-white quadrant-in-circle target, which
is detected by shape. Its identity comes from projecting every Anchor's recorded
coordinate into the image and matching each detection to the nearest projection.
This is the approach Pix4D and DroneDeploy use in production. The target's
quadrant edges give a precise centre by line intersection, which also holds up
in oblique images better than a plain cross.

**Poses come from a first solve.** Projection needs camera poses, and raw
consumer GPS is too loose to trust for matching. So the camera solve runs twice:
once without ground control to recover poses, then detection and matching
against those poses, then the solve again with the ground control file. The
extra pass repeats only the camera solve.

**Anchors must be at least 8 to 10 metres apart.** Matching assigns each
detection to the nearest projected Anchor, so two Anchors closer together than
the projection error could be confused. This spacing rule is added to Site
onboarding alongside placing Anchors outside the changing footprint.

**The quality gate runs before ODM.** ODM does not discard bad control points —
it fails on them — so a wrong detection must never reach the ground control
file. The gate checks that each Anchor is detected in enough images, that each
detection sits close to its projection, and that detections of one Anchor agree
across images; after the solve it checks residuals. Any failure stops the Capture
and flags it for a person, which is the exception path ADR 0015 allows.

This supersedes the consequence above that tagging is manual per Capture.
