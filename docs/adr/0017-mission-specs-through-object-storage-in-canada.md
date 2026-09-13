# Mission Specs reach the loader through object storage in Canada

[ADR 0016](0016-mission-generation-and-loading-for-the-rc2.md) settled that the
planner drops a Mission Spec into object storage and the host collects it, and
left the choice of store to #18. [ADR 0011](0011-static-delivery-bundles.md) had
already established that object storage rather than static hosting is what
actually serves a Delivery Bundle, and named S3 or R2 — written before Backblaze
opened a Canadian region, so B2 was never weighed.

A Mission Spec carries Site coordinates. That is client location data, and
putting it in third-party storage is a disclosure decision rather than a
transport one, as ADR 0016 already records.

## Decision

- **Backblaze B2, CA-East (Toronto)**, for Mission Specs.
- **Two buckets**, one for Specs and one for Delivery Bundles when those exist, so
  that no key can reach both and retention can differ without a prefix rule to
  get wrong.
- **Two application keys, least privilege.** The planner's key writes only. The
  host's key lists and reads only. Both are scoped to the Specs bucket and to the
  `specs/` prefix, so neither can reach anything else the account holds.

  **Deviation, recorded rather than hidden:** the intent was that neither key can
  delete, with deletion left to the retention job under its own credential. The
  provider's write-only preset includes `deleteFiles` and offers no way to drop
  it, confirmed across three separately generated keys. It is accepted because a
  Spec is immutable and superseded rather than edited, so nothing in this design
  ever calls delete; because the key can neither read nor list, so it cannot be
  used to find what it might destroy; because a lost Spec is regenerable from the
  planner, unlike a Capture; and because the endpoint holding it is gated. The
  capability exists and is never exercised. If the provider later allows a
  narrower preset, take it.
- **Specs are keyed `specs/<site-id>/<date>/<dispatch-timestamp>.json`.**
  ADR 0016 names a Spec by Site and date; the timestamp makes supersession
  explicit and lexically sortable, so the host takes the newest without parsing
  anything. A Spec is never rewritten.

  **Parts do not appear in the key.** An earlier wording placed one before the
  timestamp, on the assumption that a Site too large for one battery is
  Dispatched as several Specs. It is not. One Spec describes the whole Site, and
  the writer splits it into parts when it builds, computing the shared seam
  waypoint as it goes. Splitting in the planner as well would make two things
  responsible for where a Mission is cut, and the seam is precisely what must not
  be decided twice.
- **Specs are retained twelve months**, on the same clock and the same deletion
  job as the Capture they produced, per
  [ADR 0012](0012-twelve-month-capture-retention.md).
- **The Site registry lives in the same bucket**, at `sites/<site-id>.json`. A
  Site is identified once at onboarding by a short identifier that never changes,
  and the browser's local storage is a cache rather than the source of truth,
  because the operator plans from whichever machine is to hand.
- **The Dispatch function is pinned to a Canadian region** and sits behind the
  hosting platform's own access protection, so the page and the function are
  reached through the same gate.

## Considered and rejected

- **Cloudflare R2**, despite egress being free with no fair-use throttle found
  and storage second-cheapest. Its only enforceable jurisdictions are the EU, the
  US and FedRAMP; the North America location hint is not binding. Acceptable for
  Delivery Bundles later, wrong for raw client coordinates now.
- **Wasabi**, despite the cheapest storage price. Its own policy states that if
  monthly egress exceeds stored volume the use case is "not a good fit", and that
  bandwidth may be throttled. A client re-downloading a large Orthomosaic is
  exactly that pattern, and a support conversation is a worse failure than a
  bill. It also bills a ninety-day minimum retention and a four-kilobyte minimum
  object size, both of which punish small files that are frequently superseded.
- **AWS S3 and Google Cloud Storage.** Both have Canadian regions, and both meter
  egress at roughly ten times B2's overage rate.
- **Hetzner and Scaleway.** Not US-headquartered, which is the one thing B2 does
  not solve, but they store in the EU. Moving Canadian client data to Europe
  trades one cross-border transfer for another rather than removing it.

## Consequences

- **A Canadian region answers residency, not legal access.** Backblaze is a US
  company and remains subject to the US CLOUD Act wherever the bytes sit. This is
  a deliberate limit of the same shape as ADR 0011's unlisted-URL caveat, and the
  first client with genuine confidentiality requirements is the trigger to
  revisit, at which point their actual obligations are known rather than guessed.
- **The region is fixed at account creation and cannot be changed afterwards.**
  Moving jurisdiction later means a new account and a migration.
- **The free tier covers this use indefinitely.** Ten gigabytes are always free
  and a Spec is a few kilobytes, so the Specs bucket is not a running cost.
  Egress is free to three times stored volume and one cent per gigabyte beyond —
  bounded rather than opaque.
- **The Dispatch function is the only part of the planner that is not static**,
  and it holds a credential. Left unauthenticated it is an open write endpoint
  into the store the loader collects from, so the protection is load-bearing
  rather than hygiene.
- **B2's handling of multi-range requests is undocumented.** It does not matter
  for Specs, which are read whole, but it must be verified before a Delivery
  Bundle is served from B2, because a browser viewer reading a
  Cloud-Optimized GeoTIFF depends on range requests working.
- **Two buckets means two retention policies to actually execute.** ADR 0012 is
  explicit that a written-down limit which is not run is worse than none.

The provider comparison this rests on, with prices and policy quotations checked
on 13 September 2026, is recorded on #18.
