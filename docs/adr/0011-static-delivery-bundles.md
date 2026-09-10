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
