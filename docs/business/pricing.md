# Pricing — Orthomosaic and Gaussian Splatting Reconstruction

Resolves [issue #17](https://github.com/Akamel01/drone-survey/issues/17). The
market research and floor-cost work were already done and committed in
[docs/research/pricing-canada-2026.md](../research/pricing-canada-2026.md);
this document does not repeat that research, it draws a firm launch price out
of the ranges that research produced, states every input to the floor
calculation with a measured/assumed label, and gives a recommended price for
a repeat Cadence visit — the three things the underlying research
deliberately left as the operator's own call.

## Recommended launch prices

| Deliverable | Recommended launch price | Sits where in the researched range |
|---|---|---|
| Orthomosaic, single visit | **$550 CAD** | Lower-middle of the researched $450–800 range |
| Gaussian Splatting Reconstruction, added to the same flight as the Orthomosaic | **$300 CAD** on top | Lower-middle of the researched $250–450 add-on range |
| Gaussian Splatting Reconstruction, flown standalone | **$600 CAD** | Lower-middle of the researched $500–900 range |
| Both, bundled, one visit | **$800 CAD** | Lower-middle of the researched $650–1,100 range |
| Recurring Cadence visit (3+ visits committed) | **$600 CAD per visit** | 25% below the $800 bundle price, at the more generous end of the researched 15–25% discount band |

**Why the lower-middle of each range, not the midpoint or the top:** this is a
new, unproven, one-person operation with no survey-grade credential and no
completed client project yet. The pricing research itself found that a solo
operator without RTK or GCP capability is priced 40–70% below an established
firm for comparable work, and that the market has been compressing in real
terms for a decade. Launching low inside the researched range — rather than
at its midpoint — is a deliberate choice to win the first one or two projects
and generate real reference work, with room to raise prices once there is a
track record; it is not a claim that $550/$300/$600/$800/$600 are the
"correct" prices in some absolute sense. Issue #16's prospect conversations
should be treated as a check on these numbers, not a formality — if two or
three real prospects independently balk at this band or would clearly pay
more, that is new information the research alone could not produce.

## Comparable local prices, with sources

Carried forward from the pricing research, restated here with sources inline
since this document is the one a client-facing pricing decision should point
to:

- **Survey-grade Ontario construction mapping** (RTK/PPK + GCP, 1.5–3 cm GSD):
  small sites (5–20 ha) $1,200–$2,800/visit; large earthworks (50–150 ha)
  $2,500–$6,000/visit.
  [skyt.ca](https://skyt.ca/how-to-choose-the-best-orthomosaic-mapping-drone-service-2/)
- **Calgary-area construction inspection/documentation** (not necessarily
  survey-grade): $500–$2,500 CAD/visit, with subscription packages offered for
  recurring monthly flights.
  [storimaticstudio.com](https://www.storimaticstudio.com/blog/construction-site-drone-inspection/)
- **US per-acre benchmarks**, which several Canadian firms' marketing mirrors:
  $5–$15/acre for commodity 2D-only orthomosaic output (minimum project fee
  $400–$800); $150–$300/acre for engineering-grade photogrammetry; $150–$500/acre
  for LiDAR.
  [thedroneu.com](https://www.thedroneu.com/blog/drone-service-cost-guide/),
  [thefuture3d.com](https://www.thefuture3d.com/learn/drone-survey-cost-guide/)
- **Gaussian Splatting has no standalone market rate card anywhere researched.**
  The clearest published figure, a US construction-LiDAR vendor bundling
  Gaussian Splatting at "from $2,250/visit," prices it as a survey-grade add-on,
  not a stand-alone product, and is explicitly not this operator's market
  segment. [thefuture3d.com/gaussian-splatting/construction](https://www.thefuture3d.com/gaussian-splatting/construction/)
  This is why the splat above is priced as an add-on to the Orthomosaic rather
  than independently: there is no evidence a buyer pays for a Gaussian Splat as
  a first, standalone reason to hire a drone operator.

No source in the research, or found freshly for this document, gives a
Canadian per-acre rate card from a named currently operating provider, or a
concrete flat monthly subscription dollar figure distinct from a discounted
per-visit rate. Both remain **unverified** rather than invented.

## The floor: what one Capture actually costs, input by input

Every line below is labelled **measured** (a real, dated, sourced figure) or
**assumed** (an estimate this business has not yet measured against its own
jobs).

| Cost line | Value used | Measured or assumed | Source / basis |
|---|---|---|---|
| Insurance, per-Capture share | $9–18 | **Assumed allocation, measured price.** The $350/year price is a real August 2026 quote (see [insurance shortlist](insurance-shortlist.md)); spreading it over an assumed 20–40 jobs/year is the estimate. | [insurance-shortlist.md](insurance-shortlist.md); pricing research |
| Vehicle/travel | $44–73 | **Measured rate, assumed distance.** $0.73/km is the real 2026 CRA rate for the first 5,000 km; 60–100 km round trip is an assumed typical distance to a site outside the city core. | [Canada.ca — 2026 automobile allowance rates](https://www.canada.ca/en/department-finance/news/2026/01/government-announces-the-2026-automobile-deduction-limits-and-expense-benefit-rates-for-businesses.html) |
| Operator time (flight, setup, human-in-the-loop cleaning, delivery packaging) | $120–300 (3–5 hrs at $40–60/hr) | **Assumed**, on both the hours and the hourly rate. No Capture has been timed yet on this project's own workflow. | pricing research, judgment call below market freelance-pilot rate |
| GPU — dense reconstruction (Orthomosaic) | $0.30–1.30 | **Measured rate, assumed duration.** $0.29–0.69/hr is a real September 2026 rented RTX-4090-class rate; 1–3 hours is a benchmark-literature estimate, not this project's own measured time. | pricing research, Vast.ai/RunPod rates |
| GPU — splat training | $0.30–1.30 | **Same as above** — measured hourly rate, assumed duration. | pricing research |
| **Total floor, one flight producing both deliverables** | **~$174–394, midpoint ~$235–305** | | |
| **Marginal cost of the splat alone**, given the Orthomosaic flight already happened | $25–45 (splat GPU time plus ~30–60 min extra QA) | Mixed, as above | pricing research |

**The two genuinely assumed numbers that matter most** are operator time (3–5
hours) and GPU duration (1–3 hours per deliverable) — neither has been timed on
a real job with this project's own pipeline yet. The recommended launch prices
above hold comfortably above the floor even if both assumptions are wrong by
50%: at double the assumed time and GPU cost, the floor for one flight rises to
roughly $350–780, which the $800 bundle price still clears, though with a
thinner margin than the headline numbers suggest. **Time the first two or three
real Captures and replace these assumed figures with measured ones**, per
ADR 0014's own stated intent that compute-placement thresholds should come from
measurement, not estimate.

## Recurring Cadence pricing

No source found gives a genuine flat monthly subscription figure anywhere in
this market — every reference to a "subscription" resolved back to a per-visit
rate with an unspecified multi-visit discount
([pricing-canada-2026.md §4](../research/pricing-canada-2026.md)). Given that,
**price a recurring Cadence per visit, not as a flat monthly subscription**,
at **$600 CAD per visit for a 3+ visit commitment** — 25% below the $800
one-off bundle price, reflecting that insurance and admin overhead amortize
slightly better across a committed run of visits, while the per-visit labour,
travel, and GPU floor does not change. Revisit a true flat-monthly structure
only if a specific client asks for one and the cash-flow predictability is
worth quoting a small discount for.

## Operator decisions and actions remaining

- Adopt the $550 / $300 / $600 / $800 / $600 launch prices above, or adjust them after issue #16's prospect conversations if the answers point the other way.
- Time the next two or three real Captures (flight + setup + cleaning + delivery, and GPU wall-clock for reconstruction and splat training) and replace the assumed operator-time and GPU-duration figures in the floor table with measured ones.
- Decide whether to quote the recurring Cadence per visit (as recommended) or negotiate a flat monthly rate if a specific client asks.
- Put the chosen prices into the client agreement template's fee schedule (§8) once decided.
