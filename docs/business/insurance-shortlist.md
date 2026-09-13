# Liability insurance shortlist — Canada

Resolves the remaining half of [issue #4](https://github.com/Akamel01/drone-survey/issues/4)
that the privacy policy and client agreement template could not: naming actual
insurers, with published coverage and indicative prices. The
[privacy and retention policy](privacy-and-retention-policy.md) and
[client agreement template](client-agreement-template.md) already exist and are
not changed by this file. Buying a policy is something only the operator can do —
this document narrows that to a short, comparable list with real prices and a
recommendation, so the remaining step is filling in a form and paying.

**Not legal or insurance advice.** Read the actual policy wording before buying;
a marketing page's description of coverage is not the policy.

## Why insurance at all

Transport Canada does not require liability insurance for Basic or Advanced RPAS
operations — its own guidance says insurance is "not required for standard
operation categories but is recommended," and is required only for flights under
a Special Flight Operations Certificate.
Source: [Transport Canada — Flying your drone safely and legally](https://tc.canada.ca/en/aviation/drone-safety/learn-rules-you-fly-your-drone/flying-your-drone-safely-legally).

It is close to mandatory commercially: construction general contractors and
property owners routinely will not grant Site access without a certificate of
insurance, and $1,000,000 CAD is the minimum most often asked for; some ask for
$2,000,000. This is already reflected in the client agreement template's
liability section. This finding is carried over from
[docs/research/canada-compliance-2026.md](../research/canada-compliance-2026.md)
§5, which cites the same Transport Canada page above plus insurer marketing
pages for the commercial-expectation point.

## Shortlist

Checked 13 September 2026. All three are Canadian-market brokers or programs
that write drone liability specifically, quote from their own public pages
without requiring a login, and appeared independently in the compliance
research and the pricing research already in this repository.

| Insurer / program | Coverage on offer | Published starting price | Notes | Source |
|---|---|---|---|---|
| **Front Row Insurance** (`drones.frontrowinsurance.com`) | $1M, $2M or $4M aerial liability; up to 5 drones on one policy at "fleet pricing"; unlimited certificates of insurance at no extra cost | **"Starting at just $225 for the year"** for the entry tier, plus a flat $75 agency fee, per the current site. A separate market survey run for [the pricing research](../research/pricing-canada-2026.md) recorded an actual August 2026 quote of **$350/year for $2,000,000 CAD** coverage for a single pilot, single sub-5 kg aircraft, Advanced certificate, no claims — the most competitive quote of that survey. | Instant online quote, same-day coverage; Transport Canada RPAS-insurance-compliant per its own claim. The $225 figure and the $350 figure are not necessarily the same coverage tier — confirm what $225 actually buys before treating it as the $1M price. | [drones.frontrowinsurance.com](https://drones.frontrowinsurance.com/) |
| **Zensurance** | $1,000,000 CGL (third-party bodily injury / property damage); optional equipment coverage for drone loss/damage/theft; optional professional liability for financial-loss claims | **Packages "start at $500 a year"** for $1M coverage, per the current site. Actual price depends on a short online application. | Broker, not an insurer directly; over 100,000 Canadian small-business clients claimed. Explicitly separates CGL from equipment and from professional liability — read the quote breakdown to know which of the three you are actually buying. | [zensurance.com/drone-insurance](https://www.zensurance.com/drone-insurance) |
| **SkyWatch.AI** (Canada annual plan) | Liability limits selectable from $0.5M up to $5M; hull (equipment) coverage bundled in; can add a client as additional insured at no extra cost | **"$446 CAD/year"** for the annual plan as currently published. | The only one of the three that is explicitly annual-vs-monthly-vs-hourly, so it is the natural one to compare against a pay-per-flight plan if flight volume stays low in the first months. | [skywatch.ai/ca/annual-drone-insurance-plan](https://www.skywatch.ai/ca/annual-drone-insurance-plan) |

All three land in the same rough band the compliance research predicted —
roughly $400–500/year for $1,000,000 CAD single-pilot, single-aircraft cover —
confirmed now against three separate current quote pages rather than a broker
estimate.

## How the three differ, and what to check before choosing

- **What "coverage" actually means differs.** Zensurance's base $500 figure is
  commercial general liability only; equipment and professional liability are
  separate add-ons priced on request. SkyWatch's $446 figure already bundles
  hull coverage. Front Row's page does not break out what the $225 entry price
  includes versus what pushes the price to the $350 figure recorded for $2M.
  Ask each insurer for a like-for-like quote: $1,000,000 third-party liability,
  hull/equipment coverage for the DJI Mini 5 Pro, one pilot, Advanced
  certificate, Canada-wide, before comparing numbers.
- **Certificates of insurance for clients.** Front Row explicitly advertises
  unlimited certificates at no extra cost, and SkyWatch lets you add a client as
  additional insured at no extra cost. Since the client agreement template
  promises a certificate of insurance on request (§9), ask about this
  explicitly with Zensurance if it is not already included.
- **Claims history and multi-year price drift are not visible from these pages.**
  All three prices above are new-business, no-claims quotes; renewal pricing
  was not published anywhere found and should be asked about directly.
- **Confirm the policy does not exclude flights near or over people.** The
  client agreement template already commits to not flying within 5 m of
  non-crew people, which is the DJI Mini 5 Pro's Basic-category limit; some
  liability policies carry their own separate exclusions for flights over
  people or in controlled airspace. Read the policy wording, not just the
  marketing page, before the first flight.

## Recommendation

**Get a like-for-like $1,000,000 CAD quote from all three**, since none of
their public prices are directly comparable as published. Absent a stated
preference, Front Row Insurance is the one to start with: it is the only one of
the three with a real, dated, itemized quote already on record
($350/year at $2,000,000 CAD, recorded in the pricing research), it issues
unlimited certificates of insurance at no cost (which the client agreement
template will need to hand to every client), and its stated $1M/$2M/$4M tiers
map directly onto what construction clients typically ask for. Zensurance and
SkyWatch remain reasonable fallbacks if Front Row's actual quote for this
specific aircraft and use comes in worse than its own marketing figures.

Once bound, put the insurer's name, the policy number, and the coverage limit
into the client agreement template §9 (currently `[$1,000,000]` and blank), and
attach a certificate of insurance to the first client contract.

## What I could not verify

- Renewal-year pricing for any of the three — all figures above are new-business
  quotes.
- Whether Front Row's $225 entry price and its recorded $350/$2M quote describe
  the same coverage tier; the site does not itemize this.
- Whether any of the three excludes coverage for flights that occur without a
  valid NAV Drone authorization in controlled airspace — worth asking directly,
  since [docs/research/canada-compliance-2026.md](../research/canada-compliance-2026.md)
  §4 flags this as a real interaction between the CARs authorization and policy
  wording that no source confirmed either way.
- Avion Insurance, mentioned in the earlier compliance research as a ~$500/year
  option, could not be located as a distinct, quotable current offering during
  this pass — it did not turn up as a named provider in a fresh search, only in
  aggregator summaries. Treat it as unconfirmed rather than a fourth option.

## Operator decisions and actions remaining

- Request a like-for-like $1,000,000 CAD quote from Front Row Insurance, Zensurance, and SkyWatch.AI.
- Bind a policy before the first paid flight; keep the certificate of insurance on file.
- Enter the insurer name, policy number, and coverage limit into the client agreement template (§9) and the privacy policy header.
- Ask the chosen insurer directly whether coverage is affected by flying without a NAV Drone authorization in controlled airspace.
- Re-shop the quote at renewal rather than auto-renewing, since none of the three publish renewal pricing.
