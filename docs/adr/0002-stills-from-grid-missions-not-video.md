# Capture Orthomosaic input as stills from a Grid Mission, not video

The proof-of-concept extracted frames from 4K video, so assuming that continues
is the natural reading of the history. It should not continue for Orthomosaics.
DJI writes per-frame position to a separate SRT sidecar at roughly 1Hz rather
than into the frames, so extracted frames carry no geotag and cannot be
georeferenced without interpolating position back onto them. Video frames also
carry H.265 compression artifacts and are exposed for motion rather than for
reconstruction. A Grid Mission produces stills with position already written to
EXIF, at a chosen Overlap, in Nadir orientation.

## Consequences

Capture becomes part of the system rather than a precondition of it. The Overlap
and altitude a Grid Mission flies are pipeline parameters, and a Capture flown
wrongly cannot be rescued in software — which means capture requirements have to
be documented and checkable, not tribal knowledge.

The Gaussian Splatting pipeline is unaffected and keeps video as a valid source:
an orbit around a subject is good input for appearance and bad input for a map.
The two pipelines therefore have genuinely different capture requirements for
the same Site, and a single Capture will not always serve both.

Footage-only input stays supported through a geotag backfill step that
interpolates SRT telemetry onto extracted frames. This exists for material that
already exists, not as a supported capture method.
