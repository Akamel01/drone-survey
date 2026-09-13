# The minimum verification bar for a Node

A clean exit is not evidence of good output. ODM has already produced a
934-face mesh from a 5.4-million-point cloud, and an 87%-empty orthophoto,
both with a zero return code; NodeODM's `cog` flag has reported success while
writing a file that fails GDAL's validator. #13 settles what every Node owes
before it counts as verified.

## Decision

**Per Node:** run it against a known input and check a measured property of
its output, not its exit status. The check is specific to what the Node can
plausibly get wrong quietly — the failures already on record are the guide:

- `reconstruct`: mesh face count relative to point cloud size.
- `export-cog` / any Node producing a raster: valid-pixel fraction, and the
  file passes GDAL's own validator.
- `correct`: EXIF and XMP from the input are still present on the output
  (ADR 0009 already names this as the first contract test).

No general test framework, fixture library, or per-Node test suite is being
adopted here. Each check is a small script against one known input, run by
whatever eventually calls it (by hand today; the Runner's end-to-end pass or
CI later) — the bar is what the check measures, not how it is wired in.

**End to end, on top of per-Node checks, not instead of them.** Passing Nodes
in isolation says nothing about the seams between them, and the seams are
where the expensive failures live: OpenSplat's first run failed in 45 seconds
because ODM records absolute image paths from the container it ran in — two
Nodes, each individually correct, joined wrongly. So after a Node's own check
passes, the whole path from ingest to Delivery Bundle runs on one real
Capture before anything reaches a client. This is the standing requirement
from #13's later comment: modular verification alone is not enough.

**After any change, the changed Node re-runs the end-to-end pass, not only
its own check.** The golden Capture (#15) is what makes this affordable
enough to actually do on every change rather than being skipped under time
pressure.

**The gate decides, not a person.** Per ADR 0015, a failing check stops the
Node and holds its Capture out of delivery; a human looks only when a gate
fails, or during a declared calibration period for a gate whose thresholds
are still being learned (the pattern already agreed for splat cleaning on
#29). Routine human inspection before delivery is not a substitute for a
gate — it is exactly the manual step #13 is replacing.

## Consequences

A Node cannot be marked done by a ticket until its check exists and runs
against a real or golden input — "it exits 0" is not a close criterion.

Some checks will need thresholds nobody has measured yet (what face count is
too low for what cloud size, what valid-pixel fraction is acceptable). Same
answer as ADR 0014's compute thresholds: start conservative from a few
observed runs, tighten with measurement, and treat an unmeasured threshold as
a reason to hold a delivery for review rather than a reason to skip the
check.

The end-to-end pass is a cost on every Node change, not only on new Nodes.
This is deliberate: it is the only thing that has actually caught a seam
failure so far.
