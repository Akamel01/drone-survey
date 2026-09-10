# Build only on permissively licensed Gaussian Splatting engines

Most of the well-known Gaussian Splatting implementations — the original 3DGS
and the variants built on it, including Scaffold-GS, Taming-3DGS and Horizon-GS
— inherit Inria's non-commercial research licence. They cannot be used to
produce work we sell, whatever their technical merit. The pipeline will
therefore be built on permissively licensed engines only: Nerfstudio's
splatfacto on gsplat (Apache 2.0), or OpenSplat (AGPLv3).

The tempting alternative was to develop on the non-commercial engines now, while
no deliverable is being sold, and switch before the first paying client. We
rejected it. Swapping engines is not swapping a binary: input conventions,
hyperparameters, output characteristics, colour treatment and the viewer
integration all calibrate to whichever engine the pipeline grew around, and so
does our sense of what a good result looks like. The failure this avoids is
specific — building a portfolio and a client expectation on outputs we would
then be unable to reproduce legally, and discovering that under deadline.

The line between evaluation and commercial use also blurs quickly for a
one-person business. A portfolio piece flown for free, or a reconstruction shown
to win work, is already arguable.

## Consequences

The non-commercial engines stay useful as a **benchmark**: run occasionally
against the same Capture to measure whether the permissive engines leave quality
on the table. They are never a pipeline node, and nothing downstream may depend
on their output.

That benchmark exists because the premise is unverified. The published research
establishes that those variants are prominent, not that they are better on
aerial captures specifically. If a benchmark ever shows a large real gap, that
is a finding worth acting on — by seeking licence terms, or by looking for a
permissive implementation of the same technique — rather than a reason to
quietly adopt one.

Licence terms should be re-checked before relying on this: projects revise them,
and "non-commercial" is not defined identically across them.
