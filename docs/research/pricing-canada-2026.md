# Pricing for phase-1 deliverables — Canada, 2026

Research for [issue #17](https://github.com/Akamel01/drone-survey/issues/17): a price for the Orthomosaic, a price for the Gaussian Splatting Reconstruction, the floor beneath each, and the per-Capture cost that produced the floor. Context: solo operator, DJI Mini 5 Pro (no RTK, dual-band GPS only, confirmed against current spec sheets), flying construction sites outside working hours, targeting **visual-grade** — relative geometry sound, no stated absolute accuracy — per the project's own design decision in `docs/design.md`.

## Recommended prices

| Deliverable | Recommended price | Floor (variable cost per Capture) |
|---|---|---|
| Georeferenced Orthomosaic, small–mid construction site (up to ~20 ha), sold as visual documentation | **$450–$800 CAD per site visit** | **~$210–$260 CAD** |
| Gaussian Splatting Reconstruction, web-delivered, same flight as the Orthomosaic (marginal add-on) | **$250–$450 CAD** on top of the Orthomosaic | **~$25–$45 CAD** marginal (GPU + extra QA time only) |
| Gaussian Splatting Reconstruction, flown standalone (no Orthomosaic sold alongside) | **$500–$900 CAD** | **~$210–$260 CAD** (same as Orthomosaic — the flight and travel cost is not shared) |
| Combined bundle, one site visit, both deliverables | **$650–$1,100 CAD** | **~$235–$305 CAD** |
| Recurring progress-monitoring visit (subscription/retainer, 3+ visits committed) | **$400–$700 CAD per visit**, discounted 15–25% off the one-off bundle price | same floor per visit; insurance/admin amortize slightly better |

These sit well below the $1,200–$6,000-per-visit Canadian range that survey-grade (RTK/PPK + GCP) construction mapping firms publish, on purpose — that is not this product's market. Section 2 below explains why the gap has to stay that wide, not just that it happens to.

**Bottom line, bluntly:** the DJI Mini 5 Pro without RTK or ground control cannot be sold into the segment of the Canadian market that pays survey-grade rates ($150–$500/acre, $1,200–$6,000/visit) — that segment buys accuracy backed by a stamped or at least defensible workflow, and "no stated accuracy" disqualifies you from it regardless of how good the imagery looks. What's left is the documentation/visualization segment: progress records, marketing, stakeholder communication, novelty. That segment is real and does pay (evidence in section 4), but it is a smaller, softer market that a solo operator reaches mostly through the Gaussian Splat being genuinely differentiated — nobody else on a construction site is handing the GC an explorable 3D scene. The Orthomosaic alone, sold on its own into this segment, is close to commodity and price-compressed; the splat is the part of this offering that isn't.

---

## 1. What Canadian providers actually charge

Real, citable Canadian figures are thin — most published rate cards are American, and Canadian drone companies overwhelmingly quote "contact us." The one concrete Canadian breakdown found:

- Mostavio-Skytech (Ontario): for typical construction-progress mapping, **small sites (5–20 ha) at 1.5–3 cm GSD run $1,200–$2,800 per visit**; **large earthworks (50–150 ha) run $2,500–$6,000 per visit**, depending on control requirements and deliverables. This is explicitly RTK/PPK-with-GCP work (survey-grade). ([skyt.ca](https://skyt.ca/how-to-choose-the-best-orthomosaic-mapping-drone-service-2/))
- Calgary-area construction inspection/documentation flights (not necessarily mapping-grade): **$500–$2,500 CAD per visit**, with subscription packages offered for recurring monthly flights. ([storimaticstudio.com](https://www.storimaticstudio.com/blog/construction-site-drone-inspection/), general search synthesis)
- No Canadian per-acre rate card was found. US per-acre figures, which several Canadian companies' own marketing implicitly mirrors, split into two very different tiers that are easy to conflate:
  - **$5–$15/acre** for basic 2D-only orthomosaic output, minimum project fee $400–$800 — this is the commodity/marketing tier.
  - **$150–$300/acre** for photogrammetry with CAD-ready, engineering-grade deliverables; **$150–$500/acre** for LiDAR — this is the survey-grade tier, and it is priced per unit of *guaranteed accuracy*, not per unit of imagery. ([thedroneu.com](https://www.thedroneu.com/blog/drone-service-cost-guide/), [thefuture3d.com](https://www.thefuture3d.com/learn/drone-survey-cost-guide/))
- Freelance/solo hourly rates: **$25–$150/hr**, specialized work $100–$200/hr; day rates for pure data collection **$500–$1,000/day**, full survey products with stamped deliverables **$2,000–$5,000/day**. ([ziprecruiter.com salary aggregation](https://www.ziprecruiter.com/Salaries/Freelance-Drone-Pilot-Salary), search synthesis)
- Market-trend evidence of compression: a 10-hectare drone job that priced at roughly $5,000 in 2018 prices at roughly $2,500 in 2026, according to one industry retrospective in the search results — direction is consistent with what every rate card here shows (falling real prices, more competitors), though I could not trace that specific figure to a named, dated primary source.

**Regional variation:** no source gave a defensible Canada-internal regional breakdown (e.g., Toronto vs. Calgary vs. Atlantic Canada). Treat "no meaningful regional data" as the honest answer rather than inventing a spread.

## 2. Is visual-grade sellable, or does construction require survey-grade?

This is the load-bearing question and the evidence is fairly one-sided.

**Survey-grade is a hard requirement for anything that touches engineering decisions.** Consumer GPS without ground control produces 1–3 m horizontal error and up to 10 m vertical error — enough to disqualify output from engineering surveys, boundary work, or GIS overlay outright. With GCPs and RTK, accuracy drops to the 1–3 cm range needed to meet ASPRS-class standards. Three German test sites found checkpoint deviations under 4 cm with RTK, versus up to 30 cm without it. ([skyebrowse.com GCP guide](https://www.skyebrowse.com/news/posts/gcp-vs-no-gcp-accuracy), [geonadir.com](https://geonadir.com/rtk-explained/), [thefuture3d.com survey cost guide](https://www.thefuture3d.com/learn/drone-survey-cost-guide/)) That gap is why volumetric earthworks, cut/fill calculations, staking, and anything a general contractor pays out against gets bought at the $150–$500/acre tier and not below it.

**There is also a licensing dimension, not just an accuracy one.** In at least one US case, a court held a drone operator could not offer mapping deliverables without a surveyor's license — the word "survey-grade" itself, or deliverables presented in terms that imply licensed surveying, can trigger licensing exposure regardless of actual accuracy. ([designdevelopmenttoday.com](https://www.designdevelopmenttoday.com/industries/aerospace/news/22910432/drone-pilot-cant-offer-mapping-without-surveyors-license-court-says)) This is a US precedent, not a Canadian one, and Canadian land-surveyor licensing is provincial — I did not find a Canadian case on point — but it argues for the same discipline the project's own design already takes: sell this explicitly as visual documentation, never as "survey" or "survey-grade," and never let a client's downstream use turn it into an engineering input.

**What construction sites do buy without survey-grade backing:** progress photography/video, stakeholder-facing documentation, marketing content, and — per the market evidence in section 4 — increasingly, immersive 3D walkthroughs for the same purpose. The $500–$2,500/visit Calgary inspection-documentation figure above is priced at roughly a third to a half of the survey-grade Ontario figures for a comparable site size, which is a reasonable proxy for the actual size of the price gap: **visual-grade construction documentation prices at something like 30–50% of survey-grade mapping for a similarly sized site**, not because the imagery is worse but because the deliverable can't be used for the same decisions.

**Verdict:** visual-grade is sellable, but only into the documentation/communication segment, and only if positioned there deliberately. Trying to compete on the survey-grade axis (accuracy, per-acre rate) with no RTK and no GCPs is not a pricing problem to solve with a lower number — it's a market you cannot enter regardless of price.

## 3. Gaussian Splatting / photoreal 3D pricing

Pricing here is genuinely thin, and what exists skews toward markets that don't transfer cleanly to a solo Canadian operator. Say so plainly rather than forcing a number that isn't there.

- The clearest published figures come from a single US vendor (THE FUTURE 3D, nationwide US operation, no Canadian presence found): **construction Gaussian Splatting from $2,250 per site visit**, bundled with survey-grade Trimble LiDAR (±2mm) and high-res orthomosaics — GS is priced as a **1.5× multiplier on top of photogrammetry rates**, not sold on its own. The page itself states its figures are "average US rates... not a quote," which is an honest caveat worth repeating here: this is a *bundled, survey-grade-anchored* price, and it says more about what a fully-equipped competitor charges than about what a visual-grade solo operator can charge. ([thefuture3d.com](https://www.thefuture3d.com/gaussian-splatting/construction/))
- Real-estate GS pricing spans a wide range depending on scope: self-capture with basic processing $500–$2,000 USD; professional capture with a standard viewer $5,000–$15,000 USD; custom branded viewer with integration $15,000–$50,000+ USD. A separate estimate put professional real-estate GS projects starting around $2,250 with typical single-property jobs at $2,250–$5,000. ([utsubo.com](https://www.utsubo.com/blog/gaussian-splatting-guide), [realhorizons.ai](https://realhorizons.ai/blog/gaussian-splatting-for-real-estate/)) These are US figures, largely for high-end commercial/pre-leasing real estate, not construction progress documentation, and not Canadian.
- **There is no standalone Gaussian Splatting product category.** Across every segment searched — real estate (Zillow's SkyTour, Apartments.com/Matterport), heritage (museum/monastery documentation, project-based, $500–$5,000 USD), film — GS sells bundled into an existing platform, an existing service (LiDAR, Matterport), or a subscription tool (Polycam, $12–$60/month), never as its own line item with its own established rate card. ([utsubo.com](https://www.utsubo.com/blog/gaussian-splatting-guide))
- Heritage/tourism: real applications exist (a Venice monastery documented with 3DGS for conservation and virtual visits) but these read as institutional/grant-funded pilot projects and academic case studies, not commercial rate-card business. ([innoarea.com](https://innoarea.com/en/noticias/gaussian-splatting-heritage/))

**Who buys, and how:** real estate buys it bundled into a listing platform or a premium marketing package; construction buys it bundled with a LiDAR-anchored survey deliverable, sold by firms that already do survey-grade work; heritage/tourism buys it as a one-off documentation project, often institutionally funded. In every case, the buyer is paying for the *scene* as an enhancement to something else they were already buying — nobody in this evidence pays for a Gaussian Splat as a first, standalone reason to hire a drone operator. That is exactly why the recommended pricing above treats the splat as an add-on to the Orthomosaic (marginal cost $25–$45) rather than a product with its own independent price discovery — the market data does not support pricing it as one, and a solo, no-RTK operator asking $2,000+ for a splat the way the US LiDAR-bundled vendor does would be pricing against a floor it has no matching credibility for.

## 4. Recurring / subscription pricing for progress monitoring

- General pattern: ongoing weekly or monthly monitoring runs **$500–$2,000 per visit**, with discounts commonly offered for long-term agreements; subscription/retainer packages (recurring flights + data delivery on a monthly or quarterly cadence) are described as increasingly standard for construction specifically. ([vantageaerialworks.com](https://vantageaerialworks.com/blog/drone-construction-progress-monitoring), search synthesis)
- Calgary-specific: most single inspections **$500–$2,500 CAD**, with "many firms" offering subscription packages for regular monthly flights as better value for long-term projects. ([storimaticstudio.com](https://www.storimaticstudio.com/blog/construction-site-drone-inspection/))
- No source gave a concrete monthly *subscription dollar figure* (e.g., "$X/month for weekly visits") as opposed to a discounted per-visit rate inside a multi-visit commitment — every reference to "subscription" resolved back to a per-visit rate with an unspecified discount. **I could not verify a real flat monthly subscription price** for this category; treat the recommended 15–25% multi-visit discount above as a reasonable inference from the pattern, not an observed number.

## 5. Cost side — the floor

The point of this section, per the issue, is that GPU cost is per-Capture and never amortizes — it recurs on every single job forever, unlike a laptop or a drone. The finding here is that **GPU cost is real but small; operator labor and travel dominate the floor**, not compute.

| Cost line | Basis | Per-Capture cost |
|---|---|---|
| Insurance (amortized) | Real August 2026 Canadian quote: $2M CAD liability coverage for **$350/year** (single pilot, single sub-5 kg aircraft, Advanced certificate, no claims) from a named broker (Front Row Insurance) — notably cheaper than published guide estimates of $500–$900. Spread over an assumed 20–40 jobs/year for a part-time solo operator. | **$9–$18** |
| Vehicle/travel | 2026 CRA reasonable per-km rate: **$0.73/km** for the first 5,000 km. Assumed 60–100 km round trip to a construction site outside the city core. | **$44–$73** |
| Operator time (flight, on-site setup, human-in-the-loop cleaning, delivery packaging) | Estimated 3–5 hours per Capture at a conservative solo-operator opportunity-cost rate of $40–$60/hr (below the $47.71/hr freelance-pilot average cited in market data, since this work happens outside a day job). | **$120–$300** |
| GPU — dense reconstruction (Orthomosaic) | Current rented 24GB-class GPU rates (RTX 4090): **$0.29–$0.69/hr** (Vast.ai/RunPod, September 2026; market median ~$0.42/hr and falling). Reconstruction estimated at 1–3 hours for a single-site Capture. | **$0.30–$1.30** |
| GPU — splat training (Gaussian Splatting) | Same hourly rate; splat training on a single-site (not city-scale) capture estimated at 1–3 hours based on published Gaussian Splatting benchmarks. | **$0.30–$1.30** |
| **Total floor, both deliverables from one flight** | | **~$174–$394**, midpoint **~$235–$305** |

Notes on this table:

- **The GPU line is genuinely the smallest cost in the stack** at 2026 rental rates — combined reconstruction + splat training runs roughly $1–3 total, matching the project's own ADR 0013 estimate of "$1–3 per job." What the issue calls out as "never amortizes" is true as a structural point (it recurs every Capture, unlike hardware bought once) but at current rented-GPU prices it is not the economically binding constraint. Labor and travel are.
- The project currently plans to run this compute on a borrowed RTX 3090 at $0 cash cost when its access window is available (ADR 0013's revision), falling back to rented compute only when it isn't. The floor above prices the *rented* case deliberately, because a floor should hold even when the free option is unavailable — that is the actual worst case the pricing needs to survive.
- **Marginal cost of the splat, given the Orthomosaic flight already happened:** just the splat-training GPU time (~$0.30–$1.30) plus roughly 30–60 minutes of additional review/QA time (~$20–$40) — **$25–$45** — since the flight, travel, and insurance cost are already sunk into the Orthomosaic. This is why the splat is priced as an add-on above rather than a second full-cost product.
- These figures exclude fixed costs that don't scale per-Capture (drone purchase, laptop, software, the Advanced certificate and flight review, NAV Drone time) — the issue asked for the per-Capture floor specifically, and those are correctly amortized business overhead rather than a Capture cost.

## 6. Solo operator vs. established firm

A solo operator without survey-grade equipment sits structurally below an established firm on price, and the evidence suggests this gap does not close with better photos or a nicer viewer — it closes only by acquiring the thing the established firm actually has: GCP workflow, RTK-capable hardware, and (for anything resembling a legal survey) a licensed surveyor's sign-off.

- Established survey-grade firms quote $150–$500/acre and $1,200–$6,000/visit in Canada (section 1); solo/freelance day rates for equivalent flight time without the stamped deliverable run $500–$1,000/day for pure data collection, versus $2,000–$5,000/day when a stamped, legally-usable product is attached — roughly a 3–5× multiplier for the credential, not the flying. ([search synthesis, drone.courses / uavcoach pricing guides](https://drone.courses/blog/drone-surveying-pricing/))
- The one-decade compression trend noted in section 1 (a ~50% real-price decline 2018→2026 for a comparable job) has hit the commodity, non-survey-grade tier hardest — it is a buyer's market for undifferentiated imagery, which reinforces that a solo, no-RTK operator competing on the Orthomosaic alone is competing in the segment where prices have fallen the most.
- **Discount expectation is real; it does not fully close the gap.** A realistic solo-operator discount off established-firm rates for a comparably-scoped documentation job is in the 40–70% range based on the day-rate and per-acre spreads above. It closes further only by adding real capability (RTK drone, GCP kit, survey partnership) — none of which is in scope here — or by substituting a genuinely differentiated deliverable (the Gaussian Splat) that the established firm either doesn't offer or bundles at a much higher, LiDAR-anchored price point. That substitution is the actual strategic bet this pricing makes: don't compete on the Orthomosaic's accuracy axis at all; compete on the splat's novelty axis where the established firm's advantage doesn't apply.

## 7. What I could not verify

- Any Canadian per-acre or per-hectare rate card from a named, currently operating Canadian provider (every concrete Canadian figure found was per-visit or per-project, not per-unit-area).
- Meaningful regional price variation within Canada (Toronto vs. Calgary vs. Atlantic Canada vs. rural).
- A real, closed example of a Canadian construction client paying specifically for a Gaussian Splatting deliverable at any price — all Canadian evidence is for conventional orthomosaic/inspection work; the GS pricing evidence is entirely non-Canadian.
- A concrete flat monthly subscription dollar figure for progress-monitoring retainers (as distinct from a per-visit rate with an unspecified multi-visit discount).
- The 2018→2026 "$5,000 to $2,500" compression figure to a named, dated primary source — it appeared only inside an aggregated search summary.
- Actual measured splat-training and dense-reconstruction wall-clock time on this project's own capture sizes and hardware (the ADR 0014 compute-placement design explicitly says these thresholds are meant to come from measurement, not estimation — the 1–3 hour figures used here are benchmark-literature estimates for single-site, non-city-scale captures, not this project's own numbers yet).
- Whether Canadian construction general contractors would accept "visual documentation only" framing in a contract without pushback, versus quietly expecting survey-grade — no Canadian contract language or client-side account of this was found.
