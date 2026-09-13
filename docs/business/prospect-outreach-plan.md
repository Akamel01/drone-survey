# Prospect outreach plan — talk to three clients before building anything

Resolves [issue #16](https://github.com/Akamel01/drone-survey/issues/16). This
is a grilling ticket: the point is to find out, before more engineering effort
goes in, whether anyone will actually pay for an Orthomosaic or a Gaussian
Splatting Reconstruction, and whether phase 1's chosen deliverables are the
right ones. Nobody can be contacted on the operator's behalf — this document
is the method, the script, and the recording template; having the three
conversations is the operator's own remaining step.

## Who to talk to

The ticket names four prospect types. Pick three, ideally not all the same
type, since the design decision this ticket tests (Orthomosaic vs. Gaussian
Splatting Reconstruction vs. the deferred 3D Timelapse) may land differently
across them.

| Type | Why they might buy | Where to find one locally, without scraping anyone's personal data |
|---|---|---|
| **General contractor** | Progress documentation, stakeholder updates, marketing for future bids | Local construction association membership directories are public business listings, not personal data. The Canadian Construction Association's affiliate directory links to every provincial/local construction association (e.g., the Calgary Construction Association publishes an 850-company member directory). [cca-acc.com — affiliate associations directory](https://www.cca-acc.com/membership/affiliate-associations-directory/); example local chapter: [Calgary Construction Association — member directory](https://cgyca.com/membership/member-directory/) |
| **Residential/commercial developer or home builder** | Marketing renders for pre-sale, progress records for investors/lenders | Canadian Home Builders' Association local associations operate in 50+ communities and publish a public "Find a Professional" directory. [chba.ca — local associations](https://www.chba.ca/local-associations/), [chba.ca — finding a builder](https://www.chba.ca/finding-a-builder/) |
| **Land surveyor** | Not a buyer of the deliverable itself, but the person best placed to say plainly whether "visual-grade, no stated accuracy" is a sellable idea at all, and the eventual phase-2 partner for a real survey | Professional Surveyors Canada publishes a public "Find a Surveyor" directory, and each province's surveyors' association (e.g., Association of Ontario Land Surveyors) does the same. [psc-gpc.ca — find a surveyor](https://psc-gpc.ca/professional-services/find-a-surveyor/) |
| **Real-estate marketer / listing agent** | Splat walkthroughs and aerial stills for listings, especially larger or higher-end properties | Local real-estate boards publish public agent/brokerage directories as part of normal business listings (contacting a business at its published business line is not personal-data scraping). Canadian Real Estate Association is the national umbrella and links to local boards. [crea.ca](https://www.crea.ca/) |
| **Commercial property manager** (a fifth option, if none of the above pan out) | Ongoing documentation for a portfolio, closer to the recurring-Cadence product than a one-off | BOMA Canada has eleven regional associations with their own directories. [bomacanada.ca — find your local BOMA](https://bomacanada.ca/find-your-local-boma/) |

**On "no personal data scraping":** every source above is a business's own
published listing of itself, offered by that business or its trade
association for exactly this purpose — being found by potential clients. That
is different from scraping a person's private data, or from building a list of
individuals from social profiles. Contact a business at its published business
line or general email, not an individual's personal accounts, and stop there
if the first response says no.

## The interview — 15 minutes, four questions

The point is not to sell. It is to find out what they actually do today, what
they would pay for, and what would stop them from buying from a one-person
operation — before any of that is guessed at internally. Recording is not
needed; the results template below is enough.

**Opening (30 seconds):** "I'm setting up a drone survey service — aerial maps
and 3D models of sites, mostly for [construction progress / property
marketing / whatever fits them]. I'm not selling anything today, I'm trying to
find out whether this is actually useful to people like you before I build
more of it. Do you have fifteen minutes?"

1. **"Walk me through how you currently get aerial photos, maps, or 3D content
   of a site — do you use anything like this now, and who do you pay for it?"**
   Establishes the baseline: an existing vendor and price to compare against,
   or nothing at all (which is its own answer).

2. **"If I could give you a top-down map of a site accurate enough to look at
   but not to measure from — and separately, an explorable 3D scene you could
   walk through in a browser — which of those two would you actually use, and
   for what?"**
   This is the core question the ticket asks. Show both ideas without
   ranking them, and let the prospect's own answer say which deliverable
   should lead. Follow up with: "would you pay for one, the other, or only
   both together?"

3. **"Would a one-time visit cover what you need, or would you want this
   repeated — say every month, or at each major milestone? What would you
   expect to pay for that, per visit or as a flat monthly fee?"**
   Feeds directly into issue #17's pricing question and tests whether the
   recurring-Cadence product (the eventual 3D Timelapse) is something this
   prospect actually wants, independent of whether phase 1 builds it yet.

4. **"What would make you hesitate to hire a one-person operation for this,
   versus an established firm?"**
   The ticket's explicit fourth question. Listen for insurance, licensing,
   turnaround time, and whether "no stated accuracy" is a dealbreaker for
   their use case — that last one tests the pricing research's assumption
   that visual-grade work is sellable at all to this prospect type.

**Close:** "That's everything I needed — thank you. If this turns into a real
service, would it be all right if I followed up with you?" Do not promise a
price, a timeline, or a specific deliverable in this conversation; the point
is to listen, not to close a sale prematurely on numbers that have not been
tested yet.

## One-page results template

Fill one of these per conversation.

```
PROSPECT INTERVIEW — RESULT

Date:
Prospect type:            [ ] GC  [ ] Developer/builder  [ ] Surveyor
                           [ ] Real-estate marketer  [ ] Other: ______
Company (name only, business context, not personal data):
How reached (which directory/association):

Q1 — Current solution and vendor:


Q2 — Orthomosaic, Splat, or both? What would they use it for?
   Preferred deliverable: [ ] Orthomosaic  [ ] Gaussian Splat  [ ] Both  [ ] Neither
   What they'd use it for:

Q3 — One-time or recurring? Expected price:
   [ ] One-time only    [ ] Recurring, interval: ______
   Price expectation:

Q4 — What would stop them hiring a solo operator:


Anything unprompted / surprising:


Would they take a follow-up call? [ ] Yes  [ ] No
```

## After three conversations — what this should answer

Per the ticket's own "answer records" line, write a short summary (in this
file, appended below, or wherever the operator tracks answers to grilling
tickets) covering:

- Who was spoken to (type and, if comfortable naming them, company).
- What each would pay for, and what they explicitly would not.
- **Whether phase 1 is aimed at the right deliverable** — if two or three
  prospects independently pick the Gaussian Splat or the recurring-visit
  product over the standalone Orthomosaic, that is a plan change worth raising
  before more pipeline work goes into the Orthomosaic path, per the ticket's
  own reasoning that this is far cheaper to learn now than after building.
- Whether the $450–1,100 CAD price band in
  [the pricing document](pricing.md) survived contact with real prospects, or
  whether it needs to move.

## Operator decisions and actions remaining

- Pick three (or more) prospects from the types and directories above and reach out by business email or phone.
- Run the 15-minute interview with each, using the script and template above.
- Fill in one results sheet per conversation.
- Write the three-line summary above once all three are done, and revisit issue #17's price band and the phase-1 deliverable choice if the answers point the other way.
