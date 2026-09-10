# Phase 1 ships Orthomosaic and Gaussian Splatting; the 3D Timelapse waits

The 3D Timelapse is the most distinctive thing we sell, so putting it last needs
justifying. Two reasons, and the second is decisive.

It is by far the most expensive. The other two pipelines are assembled largely
from working parts and produce something sellable within weeks. The 3D Timelapse
needs both of them first, plus cross-Capture Registration, plus a temporal 3D
viewer that does not exist in any production-ready form and would have to be
built.

More importantly, it is gated by the calendar rather than by engineering. A
timelapse requires one Site flown repeatedly over weeks or months. Built
tomorrow, it would have nothing to show. It cannot be demonstrated, sold, or
even debugged until multi-date Captures exist, so building it first means
building ahead of the data.

Phase 1 is therefore the Orthomosaic and Gaussian Splatting pipelines. The 3D
Timelapse is phase 2.

## Consequences

Data collection for phase 2 starts immediately regardless. From the first flight
every Site gets Anchors and a Capture cadence, whether or not anything consumes
them yet. Phase 2 then opens with months of registrable Captures already banked
instead of starting the clock at that point. This is the whole reason ADR 0007
had to be decided before the first flight rather than alongside the timelapse
pipeline.

A two-dimensional version is available in the meantime at almost no cost: a
before-and-after swipe between two Orthomosaics of the same Site uses mature
existing tooling. It is a real deliverable, sellable in phase 1, and it also
exercises Registration on easier ground before the 3D version depends on it.
