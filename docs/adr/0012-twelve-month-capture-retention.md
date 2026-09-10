# Retain Captures for twelve months

The design originally kept every Capture indefinitely so that a future 3D
Timelapse could use it. That conflicts with privacy obligations: wanting data
for a product not yet built is not a lawful basis for keeping it, and it is not
an exception to a deletion request. Aerial imagery over inhabited areas records
people, vehicles and neighbouring property whether or not we want it to.

Captures are therefore retained for **twelve months** from the date flown, then
deleted.

## What the limit applies to

The limit governs **raw Captures** — the images off the aircraft. Derived
products are treated separately, because a Reconstruction is what a 3D Timelapse
is actually assembled from, and because it is a different kind of artifact: a
surface, not a photographic record.

Whether a derived product may be retained longer depends on whether it still
identifies anyone. At mapping altitude with a few centimetres per pixel, a
person occupies a few dozen pixels and a face is not resolvable — but that is an
argument to verify against the actual output, not to assume. Low passes, oblique
passes for vertical structures, and vehicle plates all change the answer.

> **To settle with the compliance work.** Whether derived products retain
> personal information at our capture resolution, and therefore whether they may
> outlive the twelve-month window. Until answered, treat Reconstructions as
> covered by the same limit.

## Consequences

A 3D Timelapse cannot span more than twelve months of raw Captures, so the
Reconstruction becomes the durable artifact and reprocessing an old Capture from
source stops being possible after a year. Anything that might need re-deriving —
alternative Correction settings, a better splat engine — must be redone inside
the window or not at all.

This makes deletion an operational step rather than an intention. A retention
limit that is written down and not executed is worse than none, since it
documents an obligation being ignored. Deletion needs to be scheduled and
logged, and the log is what demonstrates the policy is real.

Client contracts should state the retention period, and clients who need longer
retention for their own reasons should be handled explicitly rather than by
quietly keeping their data.

## Revision, 2026-09-10

The compliance research could not confirm the raw-versus-derived distinction
above against regulator guidance. It remains a reasonable reading rather than a
settled one, so the conservative position holds by default: Reconstructions are
covered by the same twelve-month limit until someone qualified says otherwise.

Two additions from that work. The retention limit needs a **written policy**
stating purpose, notice, the period, and the deletion procedure — the period
alone is not the obligation. And Quebec Sites or clients bring Law 25, under
which the operator is the privacy officer by default and the policy has to be
published.
