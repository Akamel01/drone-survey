# Object storage for Delivery Bundles

Resolves the remaining, narrowed scope of
[issue #18](https://github.com/Akamel01/drone-survey/issues/18): the provider
choice and bucket layout for **Delivery Bundles** specifically. The Mission
Spec half of this ticket is already settled and out of scope here — Backblaze
B2, CA-East (Toronto), two buckets, two least-privilege keys — recorded in
[ADR 0017](../adr/0017-mission-specs-through-object-storage-in-canada.md) and
priced against Cloudflare R2, Wasabi, AWS S3, Hetzner, and Scaleway in that
issue's own comment thread. This document does not redo that comparison; it
answers the one question that thread deliberately left open — "does the
Delivery Bundle go to B2 alongside the Specs, or to R2 for free egress" — and
then works out the bucket layout, the CORS and range-request settings, a cost
estimate, and the exact console steps, per
[ADR 0011](../adr/0011-static-delivery-bundles.md).

## Provider decision: Backblaze B2, same Canadian region, second bucket

**Delivery Bundles go to Backblaze B2, in the same CA-East (Toronto) region
already used for Mission Specs, in a second, separate bucket.**

The rejected alternative is Cloudflare R2, despite R2's free egress being the
more attractive number on paper. The reasoning ADR 0017 already applied to
Mission Specs applies to Delivery Bundles with more force, not less: a Bundle
contains actual client imagery — the Orthomosaic and the Gaussian Splat — which
[ADR 0012](../adr/0012-twelve-month-capture-retention.md) already treats as
data that can identify people and record neighbouring property. R2's only
enforceable jurisdictions are the EU, the US, and FedRAMP; its "North America"
location is a non-binding hint, not a pinned region. Putting the more
sensitive of the two artifact types (imagery, not coordinates) into the less
residency-certain provider would invert the reasoning ADR 0017 used to choose
B2 for Specs in the first place. This document's task explicitly asks for a
choice "consistent with ADR 0011 and 0017 (Canadian region)," which R2 cannot
give.

The trade-off accepted by this choice: B2's egress is free only up to 3× the
account's average monthly stored volume, then $0.01/GB, whereas R2's egress is
$0 with no published fair-use ceiling. The cost estimate below shows this is
not a meaningful amount of money at phase-1 volume — see below — so the
residency argument is allowed to win without a real cost penalty. If client
downloads ever grow large enough that the 3× threshold starts binding in
practice, revisit this specific trade-off then, with real numbers, rather than
guessing now. As with Specs, a Canadian region answers **residency**, not
**legal access** — Backblaze is a US company and the account remains subject
to the US CLOUD Act wherever the bytes sit. This is the same deliberate,
disclosed limit ADR 0011 and ADR 0017 already accept for unlisted URLs and for
Specs; it is not a new gap introduced here.

Source for B2's current pricing and free-egress terms, checked 13 September
2026: [backblaze.com/cloud-storage/pricing](https://www.backblaze.com/cloud-storage/pricing).

## Bucket layout

**One new bucket**, separate from the Specs bucket (`sites/` and `specs/`
prefixes), consistent with ADR 0017's reasoning that no single key or bucket
should be able to reach both Mission Specs and client deliverables. Suggested
name: `<business-name>-delivery-bundles` (bucket names are globally unique
across all Backblaze accounts, so an exact name needs checking at creation
time).

**Bucket privacy: Public**, not Private. This matches ADR 0011's "unlisted
URL" delivery model directly — the whole point is that a client opens a link
in a browser with no login and no signed URL, so the bucket must serve GETs
without an authorization token. "Public" here means anyone with the exact
object path can read it; it does not mean the bucket is discoverable or
listed anywhere, which is what "unlisted" is actually relying on. Creating
the first public bucket on a Backblaze account requires a verified email
address and either a payment method on file or a small prepaid balance —
noted here so it does not surprise the operator mid-setup
([backblaze.com — creating a bucket](https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets)).

**Inside the bucket, one folder per Delivery Bundle:**

```
bundles/<bundle-id>/
  index.html          viewer shell page: MapLibre GL JS + maplibre-cog-protocol
                       for the Orthomosaic, PlayCanvas SuperSplat Viewer for
                       the splat, on one page or two linked pages
  ortho/
    orthomosaic.tif    the Cloud-Optimized GeoTIFF
  splat/
    scene.sog          SuperSplat Viewer's compressed splat format
    meta.json          SuperSplat Viewer's companion metadata file
  assets/              viewer JS/CSS bundle (MapLibre GL JS, maplibre-cog-
                       protocol, @playcanvas/supersplat-viewer build output) —
                       vendored here so the Bundle stays self-contained per
                       ADR 0011, not fetched from a CDN at view time
  report/              optional PDF or summary, if one is produced
  NOTICES.txt          third-party licence notices — see below
```

Viewer and library choices above are carried from
[docs/research/viewers-and-web-delivery-2026.md](../research/viewers-and-web-delivery-2026.md);
this document does not re-select them, only places them in the bucket.

**`<bundle-id>` should not simply be `<site-id>/<capture-date>`.** ADR 0011's
whole delivery model rests on the URL being unlisted — hard to guess, not
merely unlinked — and a Site's short identifier plus a flight date is
plausibly guessable or enumerable by a client who already knows their own
Site's identifier. Use an opaque, randomly generated token per Bundle instead
(for example, a 12-character random string) as the folder name, and keep the
mapping from Site and Capture date to that token in the operator's own
records — the Site registry already stored at `sites/<site-id>.json` in the
Specs bucket, per ADR 0017, is a reasonable place to add it, since it already
serves as the source of truth for Site identity. Generating and recording that
token is a small piece of pipeline logic, not a storage-console setting, so
it is named here as a decision rather than built.

**Root-level, once per bucket, not per Bundle:**

```
robots.txt             User-agent: * / Disallow: /
```

## Cross-origin (CORS) and range-request settings

Configure CORS on the bucket now, even though the viewer page and the imagery
it fetches live in the same bucket and are therefore same-origin today — ADR
0011 already flags that this "works by accident" until something moves them
apart (a custom domain in front of only part of the bucket, a future
front-end that embeds the viewer on the operator's main marketing site, a CDN
added later), at which point it fails silently. B2's CORS rules are set per
bucket, either through the CLI or the web console for Administrator/Bucket
Creator roles
([backblaze.com — cross-origin resource sharing rules](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules)).

Recommended rule:

```json
[
  {
    "corsRuleName": "delivery-bundle-viewer",
    "allowedOrigins": ["https"],
    "allowedHeaders": ["range"],
    "allowedOperations": [
      "b2_download_file_by_name",
      "b2_download_file_by_id"
    ],
    "exposeHeaders": [
      "accept-ranges",
      "content-range",
      "content-length",
      "etag"
    ],
    "maxAgeSeconds": 3600
  }
]
```

- `allowedOrigins: ["https"]` is B2's own documented wildcard matching any
  HTTPS origin. Tighten this to the exact origin(s) the viewer will actually
  be served from (the bucket's own friendly URL, a custom domain, or the
  operator's main site) once that is fixed, rather than leaving it open to any
  HTTPS site — the open form is a reasonable starting point since the bucket
  is already public-read by design, but a fixed origin is strictly tighter.
- `allowedHeaders: ["range"]` and the exposed `content-range` /
  `accept-ranges` headers are what a browser's range-request machinery — and
  specifically `maplibre-cog-protocol` reading a Cloud-Optimized GeoTIFF —
  actually depends on. Without `content-range` exposed, a cross-origin fetch
  can receive a partial response without JavaScript being able to read the
  header that says so.
- This CORS rule permits GET/range reads only. It grants nothing for upload —
  uploads happen through the operator's own application key, described below,
  never through a browser.

**Range requests: single-range is what the viewer needs, and single-range is
what B2 is expected to support.** This mirrors the same caveat ADR 0017
already recorded for B2 generally: B2's handling of *multi*-range requests
(a single request asking for several byte ranges at once) is undocumented,
but browsers reading a Cloud-Optimized GeoTIFF issue single-range requests,
which is the well-supported case on every provider checked, including B2. The
one thing genuinely not yet done anywhere in this repository is proving it
against a real B2 bucket and a real file — see "operator actions" below.

## Licence notices file

ADR 0011 records this as an unmet, trivial-to-fix obligation: every Bundle
redistributes permissively licensed third-party code, and every one of those
licences requires its notice to be kept when redistributed. Based on the
libraries this project has already chosen
([viewers-and-web-delivery-2026.md](../research/viewers-and-web-delivery-2026.md)),
`NOTICES.txt` needs at minimum:

- **MapLibre GL JS** — BSD-3-Clause.
- **maplibre-cog-protocol** — MIT.
- **PlayCanvas Engine / `@playcanvas/supersplat-viewer`** — MIT.

Assembling this file automatically as part of building a Bundle is pipeline
work, out of scope for this document (which covers the storage side only) —
noted here so it is not lost, and left as an operator/build action below.

## Cost estimate

Based on Backblaze's current published rates
([backblaze.com/cloud-storage/pricing](https://www.backblaze.com/cloud-storage/pricing),
checked 13 September 2026): storage **$6.95/TB/month** ($0.00695/GB/month, with
the first 10 GB always free across the account), egress free up to **3×** the
account's average monthly stored volume, then **$0.01/GB** beyond that.

Assume a typical Bundle is 0.5–1.5 GB (a Cloud-Optimized GeoTIFF of a few
hundred MB to low single-digit GB, plus a SOG-compressed splat of tens to a
few hundred MB, per the format sizes discussed in the viewers research), and
that the first few months of operation hold, say, 10–20 active Bundles
online at once (5–30 GB total stored):

| Item | Estimate |
|---|---|
| Storage, 5–30 GB | **under $0.25/month** |
| Free egress ceiling at that stored volume | 15–90 GB/month before any egress charge applies |
| Egress if a client re-downloads a 1 GB Bundle repeatedly, say 20 GB/month total | **$0** (well inside the free ceiling) |
| Egress if usage were 10× that (200 GB/month, unlikely at phase-1 client counts) | **~$1.10–1.85/month** beyond the free ceiling |

**This is not a meaningful operating cost at phase-1 volume** — consistent
with the pricing research's own finding that compute and storage are a
rounding error next to labour and travel. The free-egress ceiling scales with
how much is stored, so it grows automatically as more Bundles accumulate; it
only becomes worth re-examining if a single client starts generating unusually
heavy repeat-download traffic against a small amount of stored data, which is
the specific, narrow case ADR 0017 flagged as the one to revisit with real
numbers rather than guess at now.

**A further, genuinely free option exists and is worth taking early rather
than later:** Backblaze publishes unlimited free egress when B2 is fronted by
a listed partner CDN, Cloudflare among them
([backblaze.com — deliver public B2 content through Cloudflare CDN](https://www.backblaze.com/docs/cloud-storage-deliver-public-backblaze-b2-content-through-cloudflare-cdn)).
Putting a free Cloudflare CDN in front of the delivery bucket would remove
egress cost entirely and would also be the natural place to add a custom
domain and the `X-Robots-Tag: noindex` header ADR 0011 recommends for
unlisted URLs, since B2 itself does not expose a way to set arbitrary
response headers per object beyond `Content-Disposition` and `Cache-Control`.
This is worth doing at setup rather than bolted on later, but is listed as an
operator action rather than assumed done, since it is a second console (a
Cloudflare account) beyond B2 itself.

## Exact console steps

1. Sign in to the same Backblaze B2 account used for the Mission Specs bucket
   (per ADR 0017, so both buckets sit in one account and one Canadian region).
2. **B2 Cloud Storage → Buckets → Create a Bucket.**
   - Name: a globally unique name, e.g. `<business-name>-delivery-bundles`.
   - Files in Bucket: **Public.**
   - Default Encryption: leave at the default (SSE-B2) — no action needed.
   - Object Lock: leave **disabled** — Bundles are intentionally superseded
     and deleted on the twelve-month retention clock per ADR 0012, not held
     under a write-once policy.
   - Confirm the region shown matches the Specs bucket's region, `ca-east-006`
     (measured from the Specs keys' authorisation response on 2026-09-13).
   - Note the **Endpoint** value shown after creation, expected to be
     `s3.ca-east-006.backblazeb2.com` — needed for the upload tooling and any
     custom-domain/CDN setup.
3. **Bucket → CORS Rules → Add Rule**, and enter the JSON rule above (via the
   console if the account has Enterprise Web Console access with an
   Administrator or Bucket Creator role, otherwise via the B2 command-line
   tool: `b2 bucket update --cors-rules '<json>' <bucket-name>`
   — [backblaze.com — enable CORS with the CLI](https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-cli)).
4. **Account → App Keys → Add a New Application Key.**
   - Name: something identifying it as the delivery-bundle uploader.
   - Bucket: this bucket only, not "All."
   - Capabilities: **Read and Write** (the assembly/upload job needs to write
     new Bundles; public reads by clients need no key at all, since the
     bucket itself is public).
   - No file-name-prefix restriction is needed here the way ADR 0017 required
     one for Specs, since this key only ever writes into this one bucket's
     `bundles/` structure.
   - Save the generated Application Key ID and Key immediately — the key
     value is shown only once.
5. Upload a `robots.txt` (`Disallow: /`) to the bucket root.
6. (Recommended, separate console) Put a free Cloudflare account in front of
   the bucket's public endpoint for zero egress cost and a custom domain,
   following Backblaze's own Cloudflare guide linked above.
7. Upload one real Bundle (a test Orthomosaic COG and a test splat) and open
   it through the actual viewer stack in a browser, over the public URL, to
   confirm range requests return `206 Partial Content` correctly — this is
   the one item this document cannot complete without an actual account and
   an actual file, and it is exactly the proof the original ticket asked for.

## What I could not verify

- The exact Canadian region code (ADR 0017 calls it "CA-East (Toronto)"; the
  precise machine region string, e.g. `ca-east-00x`, was not confirmed from a
  primary source in this pass — it will be visible in the account's existing
  Specs bucket and should simply be matched, not re-chosen).
- Whether B2 correctly serves multi-range GET requests — flagged as
  undocumented in ADR 0017 and unchanged by this research pass; not relevant
  to the viewer stack chosen, which issues single-range requests only, but
  worth knowing if a future viewer choice needs multi-range.
- Real Bundle file sizes for this project's own Orthomosaics and splats — the
  cost estimate above uses format-size ranges from the viewers research, not
  a measured file from an actual Capture.

## Operator decisions and actions remaining

- Create the `<business-name>-delivery-bundles` bucket in the same B2 account and Canadian region as the Specs bucket, set to Public.
- Apply the CORS rule above (console or CLI).
- Create a Read-and-Write application key scoped to only this bucket.
- Upload a `robots.txt` (`Disallow: /`) to the bucket root.
- Optionally put a free Cloudflare CDN in front of the bucket for zero egress and a custom domain with a `noindex` header.
- Have the pipeline's `bundle` Node (not this document — pipeline/code work) generate an opaque per-Bundle token rather than using the Site id and date as the folder name, and assemble `NOTICES.txt` automatically.
- Upload one real test Bundle and confirm range requests work through the actual MapLibre/SuperSplat viewer stack in a browser — this is the proof the original ticket asked for and cannot be done from this document alone.
