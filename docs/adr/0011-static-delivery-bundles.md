# Deliver to clients as static bundles on managed hosting

Both phase 1 deliverables can be served without anything that runs code. A
Cloud-Optimized GeoTIFF is read directly by the browser over HTTP range
requests, needing no tile server, and the splat viewer is a static site. So a
delivery is a **Delivery Bundle**: a self-contained directory holding the
Orthomosaic, the splat, a viewer page and any report, deployed to managed static
hosting at an unlisted URL.

Since there is no backend requirement, we are not acquiring one. No database, no
accounts, no sessions, nothing to keep patched.

## Considered options

Self-hosting from the GPU box was rejected on coupling. That machine runs an
unrelated production service, so client-facing availability would depend on its
maintenance windows, and it would gain a public inbound surface while holding
several hundred gigabytes of unrelated production data. Compute stays private;
delivery lives elsewhere.

A client-facing application with accounts was rejected as premature rather than
wrong.

## Consequences

An unlisted URL is obscurity, not access control. This is acceptable for
visual-grade work and is common practice, but it is a deliberate limit and not
an oversight. The first client with genuine confidentiality requirements is the
trigger to revisit — at which point their actual requirements are known, rather
than guessed at now.

Because a Delivery Bundle is self-contained and static, it is also
straightforwardly archivable. A finished project can be kept as a directory
rather than as rows in a system that has to stay running to remain readable.

## Revision, 2026-09-10

Two things this ADR asserted without checking.

**Most static hosts cannot serve a real orthomosaic.** GitHub Pages hard-blocks
at 100MB and does not reliably serve large files through its LFS path.
Cloudflare Pages caps individual files at 25MB, which rules it out entirely.
Netlify needs paid tooling past its own cap. Object storage — S3 or R2 — is the
only option that actually fits, so "managed static hosting" means object storage
here, not a static-site host. Note that R2 rejects multi-range requests, which
is acceptable because single-range is what the viewer needs.

**Cross-origin access must be configured.** The moment the imagery and the
viewer page are not served from the same origin, range requests fail without
correct cross-origin headers. This works by accident while everything shares an
origin and breaks silently later, so configure it from the start.

**Attribution is an unmet obligation.** Every Bundle ships permissively licensed
third-party code — the splat viewer, the map library, the COG protocol handler,
the point-cloud viewer — and all of those licences require their notices to be
retained when redistributed. Handing a client a Bundle is redistribution. The
`bundle` Node must assemble a notices file; today nothing does, which makes every
delivery non-compliant in a way that is trivial to fix and easy to forget.

Finally, unlisted URLs should at least carry the free mitigations: robots
exclusion, a no-index header, and no third-party analytics that would leak the
URL through a referrer header.
