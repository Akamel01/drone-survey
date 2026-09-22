# Adopt RealityScan as the splat pose provider, not as the core engine

ADR 0001 chose OpenDroneMap for orthomosaics because Metashape and Pix4D were
priced out. RealityScan changed that calculation by becoming free below
$1M USD revenue, so it was evaluated as a replacement for the core of the
post-flight pipeline — `solve`, `reconstruct`, `export-cog`. The evaluation ran
against gates written before any findings were read
(`docs/research/realityscan-gates-2026-09-19.md`), and its evidence is in
`docs/research/realityscan-*.md` with 85 primary sources saved under
`docs/research/sources/`.

The answer splits. RealityScan is a capable, genuinely free, genuinely
scriptable reconstruction engine that runs unattended on our Linux host. It is
also non-deterministic in a way that silently changes **which part of a Site
gets reconstructed**, and nothing downstream of it can tell one outcome from
another.

## Decision

**Adopt RealityScan for one thing: supplying camera poses to the Gaussian
Splatting chain.** `-exportRegistration <name>.json` writes a nerfstudio
`transforms.json` directly, which removes `ns-process-data odm` from the chain
and with it the conversion ADR 0004 records as degrading silently. Measured on a
real export: principal point at the image centre in 9/9 frames with zero
distortion, because the exporter undistorts per camera — each frame carries its
own image dimensions and its own focal length, and the file paths point at the
exported images. The calibration is applied to the pixels rather than discarded,
which is the opposite of ADR 0004's defect and is why a centred principal point
is correct here.

**Do not replace the orthomosaic chain.** ODM stays. Not because RealityScan
cannot produce an orthomosaic — it can, unattended — but because the evidence
for output *quality* was never gathered: tier 2 onward never ran, and the gates'
own evidence standard says a gate resting on `REQUIRES TEST` is CONDITIONAL GO at
best. Replacing a working chain on that basis would be trading measured
behaviour for unmeasured behaviour.

**Gate on the selected component's share of registered images before anything
ships through either path.** This is a precondition, not a follow-up. Ten
identical reconstructions of the same images produced ten meshes covering
measurably different extents — 17.6% mean bounding-box drift — because alignment
splits into a different number of components run to run (3/2/2 at 20 images,
6/7 at 122), and `-selectMaximalComponent` then takes whichever is largest. Every
one of those runs exited 0 and wrote a clean million-face mesh. A pose export
from the same project carried 9 of 20 images. Component count is not the signal;
share of registered images is.

**Record the engine version in every Job's provenance.** The EULA (§4) permits
Epic to update the software remotely without notice, and updates must be
installed to keep using it. With run-to-run drift already measured, a cross-date
difference otherwise cannot be attributed to the site, the run, or the engine —
which is precisely what phase 2 depends on being able to do.

### How the gates scored

No critical gate fails, so this is not NO-GO. Enough non-critical gates are
unmeasured, and D1 misses with a named mitigation, that it is not GO either.

| Gate | Result |
|---|---|
| A1 headless on Linux | **GO** — measured, 10/10 reconstructions, no hangs |
| A2 commercial, automated, server-side use | **GO** — §1.1 "for any lawful purpose"; §1.2(d) read as not covering delivery of processed outputs |
| A3 georeferenced export at an affordable tier | **GO** — "All RealityScan features" at both tiers, confirmed by the install |
| A4 total cost of ownership | **GO** — CAD 0/yr below the $1M USD threshold |
| A6 machine-readable failure | **GO** — corrupt input exits 80, good input exits 0 |
| F3 no GUI on the per-job critical path | **GO** — the sign-in dismissal is one-time bootstrap |
| B4 manual intervention rate | **GO** — zero per job after bootstrap |
| D1 reproducibility | **MISS, mitigated** — non-deterministic at the coverage level; mitigation is the component-share gate |
| F1 parity on domains we already ship | **Mitigated** — COG is not a documented RealityScan output, so `export-cog` and its GDAL validator stay |
| A5, B1–B3, B5–B8, C1–C5, D2–D4, E* | **Unmeasured** — tier 2 onward never ran |
| ES1–ES3 survey-grade | **Out of scope** — needs a Site flown with surveyed Anchors |

Verdict: **CONDITIONAL GO on the narrow adoption above; NO-GO on wholesale
replacement.**

## Consequences

**The splat chain gets a second pose route, and it is not free.** The export
writes lossless PNGs at ~28 MB each — roughly 3.4 GB for a 122-image Capture.
It also bypasses `expected_mount_path()` (`nodes/fit-splat/fit_splat.py:199`)
and the solve-quality gate's `stats.json` dependency (`:339-350`), both of which
need replacements sourced from RealityScan's own statistics, which paRSer
exposes. The smallest landing site is a sibling Node to `solve` emitting the
same contract, since `nodes/register/register.py` and `fit-splat` are already
coded against it.

**`principal_point_survived()` does not apply to this output and must not be
relaxed to make it fit.** That guard (`nodes/solve/solve.py:114`) requires
`projection_type == "brown"` with a non-centred principal point, and
`transforms.json` has neither field. It is still correct for the ODM path that
ADR 0004 describes. The RealityScan path needs a sibling check, and the
discriminator is the *image*, not the intrinsics: a centred principal point is
correct when the pixels were undistorted and wrong when they were not.

**Four operational requirements have no home in Epic's documentation and now
live here.** Headless RealityScan on Linux needs: a virtual framebuffer, because
Wine's DXGI cannot enumerate adapters without an X connection and fails
`0x887a0004` in five seconds; all paths in Wine `Z:\` form, because a POSIX path
loses its leading slash, is parsed as a command, and the run then never reaches
`-quit` and idles forever; a one-time dismissal of an Epic sign-in modal that
`-headless` does not suppress and that is drawn where nobody can see it; and
`-save` before `-quit`, because a completed run that quits unsaved reports
`Operation aborted` and exits 4. The first two together are almost certainly
what third-party reports of "headless hangs indefinitely" actually were.

**ADR 0001 is not reversed and ADR 0005 is unaffected.** ODM remains the
orthomosaic engine. ADR 0005's finding still holds — there is no supported way
to feed ODM an external camera solve — so this adoption serves the splat chain
only and does not touch the orthomosaic path.

**This decision is cheap to revisit, and should be.** The engine is installed,
the probe is fixed and repeatable, and the gates are unchanged. What would move
it to a full GO is tier 2: output quality on a real Capture flown to our own
capture standard, with determinism re-measured there — `bellus-v1` is a
third-party sample whose overlap a Grid Mission would not produce, and it splits
into 6–7 components at full size.

**One finding outlived the question.** RealityScan reports plenty about what it
did internally and almost nothing about whether its artifacts are any good —
texture validity has no mechanism at all in 85 sources. Ten runs producing
different coverage while all exiting 0 is the same lesson ADR 0018 already
records from ODM's 934-face mesh and 87%-empty orthophoto. **The writer is never
the validator**, whichever engine writes.
