# Billing provider and metering model — Canada, 2026

Research for [issue #277](https://github.com/Akamel01/drone-survey/issues/277) under the
[#239 map](https://github.com/Akamel01/drone-survey/issues/239): when a Workspace starts
paying — compute for Reconstructions and renders, and possibly a subscription — which
payment provider and metering model fit a one-person Canadian business with zero fixed
cost until revenue.

Grounding in this repo: Accounts are Better Auth (installed **1.7.6**,
`web/package.json:21`); a Workspace **is** a Better Auth organization
(`web/lib/accountAuth.ts:114`, created per Account at `:207`–`:219`); the store is
Postgres, Neon in production (`README.md:132`); `Approval` is the operator's manual gate
until billing exists (`CONTEXT.md:34`–`35`). The charges in question are per
[ADR 0012](../adr/0012-twelve-month-capture-retention.md) (twelve-month storage),
[ADR 0013](../adr/0013-rent-gpu-for-production-jobs.md) (rented GPU is the fallback,
~$1–3/job) and [ADR 0014](../adr/0014-compute-placement-ladder.md) (local 4070 first,
then borrowed 3090, then rented; placement is the Runner's decision and is sized before
the run, `:19`–`:30`).

Every web source was read **2026-09-27**; the sources list at the end carries each URL
and its own date where it has one. Anything inferred rather than read or measured is
marked **INFERRED**. No rate for GPU-minutes, storage or renders is invented here — the
doc recommends the *units and mechanics*; the dollars are the operator's call
(`docs/business/pricing.md:70`–`:95` already shows what the floor costs).

## Bottom line, bluntly

**Recommendation: Stripe directly (not Stripe Managed Payments), with Better Auth's
Stripe plugin and Stripe's metering; replace Approval with a card on file plus a prepaid
compute balance.**

The decisive reasons:

1. **Metering is the requirement the others fail.** Stripe is the only provider checked
   with first-class usage metering today: meter events, billing thresholds, and prepaid
   credit grants ([S2]–[S5]). Paddle's *native* usage-based billing is an explicit
   waitlist — "we're working on native usage-based billing… join the waitlist" ([S16]) —
   so GPU-minute billing there is custom line items forever. Lemon Squeezy has real
   usage-based billing ([S21]) but is being wound into Stripe Managed Payments ([S22],
   28 January 2026). Polar has real usage-based billing ([S25]) but no repo fit and, for
   a Canadian seller, a near-certain +1.5% international-card surcharge ([S24]).
2. **It is already half-integrated.** The Stripe plugin exists for the installed Better
   Auth version and bills subscriptions against a `referenceId` that can be the
   organization — i.e. the Workspace ([S23]; `web/lib/accountAuth.ts:114`, `:207`). Paddle,
   Polar and Lemon Squeezy would each be a second, hand-rolled billing integration.
3. **It is the cheapest of the viable options.** A domestic Canadian card charge costs
   2.9% + CA$0.30, plus 0.7% Stripe Billing PAYG (or 0.8% + US$0.04/1k events on
   Metronome) and 0.5% Stripe Tax: about **4.1% + 30¢ effective** ([S1]). Paddle and
   Lemon Squeezy are 5% + 50¢, and Polar/Lemon Squeezy add +1.5% on non-US cards —
   which is nearly every card a Canadian business sees ([S11], [S18], [S24]).
4. **Zero fixed cost holds.** Standard Stripe pricing has no setup or monthly fees
   ([S1]); the same is true of Paddle ([S11]), Lemon Squeezy ([S18]) and Polar's Starter
   ([S24]).

What you accept by choosing Stripe: you are the seller of record, so Canadian GST/HST is
your registration once worldwide taxable supplies exceed $30,000 over four consecutive
calendar quarters, or in a single calendar quarter ([S26]), and foreign indirect tax
beyond that is your problem unless you buy filing help. Stripe Tax calculates at 0.5%
where you are registered, and Tax Complete (from CA$120/month, optional) adds
registrations/filings ([S1]). For a domestic-services business that is one free CRA
registration and a 0.5% line item; if B2C digital sales abroad ever grow, Stripe Managed
Payments is the same platform's MoR escape hatch ([S7]–[S10]) — see the open questions.

**Do not build on Lemon Squeezy.** Stripe owns it and its team is building Stripe
Managed Payments; Lemon Squeezy users are told to expect migration ([S22]). Its stacked
fees for a Canadian seller (5% + 50¢ + 1.5% non-US card + 1% non-US payout, [S18],
[S19]) are the worst here anyway.

## 1. Providers compared

Fees are per successful transaction unless stated. `CA$` = Canadian dollars as quoted on
the Canadian pricing pages.

| Provider | Fees | Merchant of record? | Canadian GST/HST + foreign tax | Payouts to a Canadian bank | Usage-based billing | Fixed monthly cost |
|---|---|---|---|---|---|---|
| **Stripe** (direct) | 2.9% + CA$0.30 domestic cards; +0.8% international cards; +2% currency conversion. Billing PAYG 0.7% of billing volume; Metronome 0.8% + US$0.04/1K events; Tax Basic 0.5%; Invoicing 0.4% ([S1]) | **No** — your business is ([S7] table) | You register and remit; Stripe Tax calculates where you are registered; CRA threshold is $30k over four consecutive quarters ([S1], [S26]) | CAD bank account (transit/institution/account number); standard payouts free; Canada settlement 7 calendar days initially, then 3 business days; min CA$0.01 ([S6]) | **Yes** — meter events on metered prices, billing thresholds, prepaid credit grants; Metronome is Stripe's recommended path for new integrations ([S2]–[S5]) | $0; Tax Complete from CA$120/mo only if you want registration+filing ([S1]) |
| **Paddle** | 5% + 50¢, tax compliance included; products under $10 or invoicing need custom pricing ([S11]) | **Yes** ([S12]) | Paddle collects and remits; Canada table includes GST/HST/PST/QST per province; 100+ jurisdictions ([S12], [S13]) | Monthly payouts created on the 1st, sent by the 15th; wire transfer, PayPal or Payoneer; CAD is a supported balance and payout currency; default minimum $100 (adjustable); a $15 SWIFT fee can apply in some countries ([S14], [S15], [S17]) | **No native support yet** — native usage-based billing is a waitlist; today: custom line items on the next renewal, or prepaid credit products tracked in your own app ([S16]) | $0 ([S11]) |
| **Lemon Squeezy** | 5% + 50¢; +1.5% non-US cards; +1.5% PayPal; +0.5% subscription payments; payout 1% for non-US bank accounts ([S18], [S19]) | **Yes** ([S18]) | MoR; collection and filing included ([S18], [S19]) | Twice monthly, 13-day hold, min $50; bank payouts are USD converted at mid-market; PayPal payouts USD ([S20]) | **Yes** — usage records API, retrospective billing, four aggregation modes ([S21]) | $0, but the platform is being folded into Stripe Managed Payments ([S18], [S22]) |
| **Polar** | Starter 5% + 50¢; +1.5% non-US cards; optional lower-rate plans $20–$400/mo; payout fees are Stripe's, 0.25% + $0.25 per payout plus conversion ([S24], [S25]) | **Yes** ([S25]) | MoR; handles international sales tax registration/filing/remittance ([S25]) | Via Stripe payout rails, manual withdrawals; Canadian seller/payout support not verified (open question) ([S24]) | **Yes** — metered prices, caps, monthly aggregation, customer-portal estimates ([S25]) | $0 on Starter ([S24]) |
| **Stripe Managed Payments** (for comparison) | 3.5% per transaction **in addition to** Payments fees — about 6.4% + 30¢ on a domestic card ([S1]) | **Yes** — customers see "Sold through Link" ([S7], [S10]) | Stripe handles domestic Canada and cross-border Canada sales plus 80+ countries; where it can't assume liability, you do (Stripe Tax only) ([S9]) | Same Stripe payout mechanics, with tax withheld and reported separately ([S6], [S10]) | **Unverified** — subscriptions are "available with Billing", but metered compatibility is not stated anywhere read; Checkout-only, no invoice items, no subscriptions created outside Checkout ([S7], [S8]) | $0 beyond the percentage ([S1]) |

Scope note: FastSpring, Gumroad and Creem were not evaluated. Polar was added because it
is the only other MoR found with native usage-based billing; Paddle and Lemon Squeezy
were in the ticket.

## 2. Metering model

### 2.1 What a Workspace is charged for

| Charged for | Unit | How it is measured | Why this unit |
|---|---|---|---|
| Reconstruction work (Structure from Motion, dense reconstruction, Fitting) | **GPU-minute**, one posted rate for all three targets | Wall-clock seconds per completed job, written by the Runner — which already knows the job's size and placement (ADR 0014:19–30) | The customer buys a processing result, not a hardware choice. Metering the 4070, 3090 and rented card at one rate keeps placement a Runner concern (ADR 0014 says so explicitly) and makes local runs margin rather than a discount. The posted rate must clear the rented worst case, $0.29–0.69/hr (`docs/business/pricing.md:81`) |
| Storage | **GB-month** per Workspace's stored bytes (raw Captures and derived products) | Daily snapshot of the bucket by Workspace prefix; sum byte-days and divide by the days in the month | Storage is the only recurring cost with no natural event; a snapshot is cheaper than an upload/download ledger and matches how B2 bills (`docs/business/object-storage-setup.md`, cost section). ADR 0012's twelve-month deletion is what ends each Capture's clock |
| Showcase render | **GPU-minute** from the render node | Same job ledger as reconstruction | One meter covers it today. If Showcase becomes a standardized one-click output, a flat per-render price is simpler and can be added as a second price on the same meter |
| Subscription (optional) | Flat per workspace per month, **with an included GPU-minute allowance and metered overage** | The same usage ledger; overage reported only above the allowance | A flat subscription with no included compute hides the product's only variable cost. An allowance plus metered overage is the shape that reads honestly on an invoice, and Stripe supports it (meters + credit grants, [S4]) |

Do not charge for: planner access, Missions, or Captures on the operator's own
Workspace; nothing in the design suggests those have a meter.

### 2.2 How usage is recorded per Workspace

- **An append-only `usage_event` table in the same Postgres store that already holds
  `organization`/`member`** (`web/lib/accountAuth.ts:273`; Neon in production,
  `README.md:132`). Columns: `workspace_id` (= `organization.id`), `mission_id`, node
  run id, `unit` (`gpu_second` | `storage_byte_hour` | `render_second`), `quantity`,
  `occurred_at`, placement (`local` | `3090` | `rented`, for our margin only),
  idempotency key. The Runner writes one row per completed job; ADR 0013's resume
  behaviour (`:36`–`:40`) means retries must be idempotent or a resumed job bills twice.
- **Storage is a scheduled snapshot, not events**: a daily job lists the delivery bucket
  by Workspace prefix and appends one `storage_byte_hour` delta per Workspace. ADR 0012
  (`:9`–`:11`) deletes raw Captures at twelve months, so each Capture's storage clock has
  a defined end.
- **Billing close** aggregates the period into one row per Workspace (the invoice
  mirror) and reports it to the provider; the Workspace's own screen can then say what
  this period costs before the invoice lands.

### 2.3 How usage reaches the provider

- **Stripe (recommended):** send aggregated quantities as meter events
  (`/v1/billing/meter_events`) against a metered subscription price ([S3]), or via the
  Metronome ingest API if Metronome is used — Stripe's own guidance for new integrations
  is Metronome ([S2]). A lazy phase-1 alternative that needs no meters at all: one
  monthly Stripe invoice per Workspace with usage line items, collected from the card on
  file (Invoicing 0.4%, [S1]). That is the version to ship first if the first paying
  Workspace is the only one.
- **Paddle:** no native metering yet ([S16]); add a custom line item to the next
  transaction for the period's usage, or sell prepaid credits as one-time products and
  track the balance in the app.
- **Lemon Squeezy:** usage records API; usage is charged retrospectively at renewal
  ([S21]).
- **Polar:** metered prices with aggregation at invoice time ([S25]).
- **Stripe Managed Payments:** unverified; treat as flat-subscription-only until proven.

### 2.4 Capping exposure

Usage billing without a cap is how a Workspace burns real money on a Friday night
between jobs. Two Stripe primitives fix this, both cited: **billing thresholds** auto-invoice
when accrued usage crosses a monetary amount mid-period ([S5]), and **credit grants**
implement a prepaid balance that applies only to metered prices ([S4]). The Runner's
pre-run size estimate (ADR 0014:19–30) is what makes a refusal possible *before* the
money is spent — the same "decide before the job runs, not by failing" rule ADR 0014
already applies to placement.

## 3. What replaces Approval

**Both, and they do different jobs: a card on file is the entry gate; a prepaid compute
balance is the spending gate.**

- **Card on file.** Better Auth's Stripe plugin can create the Stripe customer on signup
  and bills subscriptions against the organization reference — the Workspace ([S23]).
  A Workspace with no payment method gets no paid compute: the Dispatch is refused at
  the planner, the same shape as ADR 0022's refusal when no Card is available — the
  operator can still do something about it, and nothing runs unattended.
- **Prepaid balance.** The balance is the cap that a card alone cannot give: Stripe's
  credit grants are designed exactly for prepaid usage and apply to metered prices
  ([S4]). The Runner compares its pre-run size estimate against the Workspace's balance
  and, when the balance will not cover a rented run, either refuses or places the job on
  the free local target (ADR 0014 prefers the local 4070 and requires the spend on rented
  compute to be an explicit threshold decided before the job runs — `:3`–`:10`,
  `:46`–`:48`). Auto-recharge from the card keeps this from
  becoming a manual chore.
- **The `approved` flag stays** for onboarding and abuse control, but stops being the
  spend gate: a Workspace is billable when a payment method is on file and its balance
  (or subscription allowance) covers the work. `approved` becomes derived from payment
  state, or remains a manual first-look the operator applies once
  (`web/lib/accountAuth.ts:120`, `CONTEXT.md:34`–`35`).

If only one is built at launch: **card on file plus a billing threshold** is the smaller
build (no credit ledger) and is sufficient for the first paying Workspace. The prepaid
balance earns its cost the moment a second Workspace exists, or the moment a rented-GPU
run can start without the operator watching it.

## 4. What I could not verify — open questions for the operator

- **Stripe Managed Payments + metering.** No source read states whether a Managed
  Payments subscription can carry metered prices, meter events or credit grants; the
  unsupported list rules out invoice items and subscriptions created outside Checkout
  ([S7], [S8]). **INFERRED** that MoR is flat-subscription-only today. If Stripe
  confirms metering under Managed Payments, that becomes the best of both (tax handled,
  usage billed) and this recommendation should be revisited.
- **Polar as a Canadian seller.** The fee sheet, MoR terms and usage-based billing are
  documented ([S24], [S25]), but whether a Canadian business can onboard and be paid to
  a Canadian bank was not verified. Its +1.5% non-US-card surcharge applies to almost
  every card from a Canadian customer, which makes it Paddle-priced with more moving
  parts.
- **Paddle payout details for Canada.** CAD is a supported balance and payout currency
  ([S15]) and payouts go out monthly via wire/PayPal/Payoneer ([S14], [S17]), but the
  help centre does not name Canada among the countries where the $15 SWIFT fee applies.
  Confirm with Paddle before relying on CAD wire.
- **Does a sale through an MoR count toward the CRA small-supplier threshold?** With
  Paddle, Polar or Lemon Squeezy the operator sells to the MoR, which resells to the end
  customer ([S12]). The CRA pages read do not address MoR sales specifically ([S26]).
  **INFERRED** that MoR retail sales do not count toward the operator's $30k, which
  would make MoR attractive for exactly the zero-admin reason it advertises — but this is
  an accountant question, and it is the one that could flip the provider choice for a
  business that wants to stay a small supplier.
- **Stripe Tax's rate for this integration.** Tax Basic is 0.5% on no-code integrations
  and CA$0.50 per transaction on API integrations ([S1]); which applies to Checkout
  Sessions created by the Better Auth plugin is not stated. Small money either way, but
  price it before promising a Workspace a total.
- **Metronome vs Billing Meters.** Stripe recommends Metronome for new integrations
  ([S2]) at 0.8% + US$0.04/1K events, while Billing Meters (0.7%, no event fee per the
  Billing line, [S1]) is explicitly "stay only if you already use it". At one Workspace
  the difference is cents; decide when the meter is actually built.
- **The posted rates themselves.** Nothing here sets a dollar per GPU-minute, per
  GB-month or per render. Those need the floors already recorded in
  `docs/business/pricing.md:70`–`:95` and the first measured wall-clock times (ADR 0014
  says thresholds come from measurement, not estimate).
- **Whether the core survey service is a "digital product".** Stripe Managed Payments
  supports digital products only and excludes professional services and anything with
  human intervention ([S8]). The *platform's* compute/renders are plausibly IaaS/SaaS
  tax codes; a human-flown Capture sold through the same checkout is not. Only matters
  if MM is used.

## Sources

Read 2026-09-27 unless a date is given.

- [S1] Stripe — pricing (Canada): https://stripe.com/en-ca/pricing
- [S2] Stripe docs — usage-based billing: Metronome vs basic: https://docs.stripe.com/billing/subscriptions/usage-based
- [S3] Stripe docs — record usage for billing: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage
- [S4] Stripe docs — billing credits (prepaid usage): https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits
- [S5] Stripe docs — billing thresholds: https://docs.stripe.com/billing/subscriptions/usage-based/thresholds
- [S6] Stripe docs — receive payouts (country table, settlement timing, minimums): https://docs.stripe.com/payouts
- [S7] Stripe docs — Managed Payments overview and unsupported integrations: https://docs.stripe.com/payments/managed-payments
- [S8] Stripe docs — Managed Payments eligibility (product types, business locations incl. CA): https://docs.stripe.com/payments/managed-payments/eligibility
- [S9] Stripe docs — Managed Payments tax compliance (Canada domestic and cross-border): https://docs.stripe.com/payments/managed-payments/tax-compliance
- [S10] Stripe docs — how Managed Payments works (Link as MoR, withheld tax reporting): https://docs.stripe.com/payments/managed-payments/how-it-works
- [S11] Paddle — pricing: https://www.paddle.com/pricing
- [S12] Paddle help — how Paddle handles VAT/tax as MoR: https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf
- [S13] Paddle help — which countries Paddle charges tax in (Canada table): https://www.paddle.com/help/sell/tax/which-countries-does-paddle-charge-sales-tax-or-vat-for
- [S14] Paddle help — when and how do I get paid: https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid
- [S15] Paddle developer docs — supported currencies (CAD balance and payout): https://developer.paddle.com/concepts/sell/supported-currencies.md
- [S16] Paddle developer docs — AI companies page, metering/usage-based billing (waitlist): https://developer.paddle.com/get-started/how-paddle-works/ai-companies
- [S17] Paddle developer docs — go-live checklist (payout methods): https://developer.paddle.com/build/go-live-checklist.md
- [S18] Lemon Squeezy — pricing: https://www.lemonsqueezy.com/pricing
- [S19] Lemon Squeezy docs — fees (platform and payout): https://docs.lemonsqueezy.com/help/getting-started/fees
- [S20] Lemon Squeezy docs — getting paid (schedule, USD payouts, threshold): https://docs.lemonsqueezy.com/help/getting-started/getting-paid
- [S21] Lemon Squeezy docs — usage-based billing: https://docs.lemonsqueezy.com/help/products/usage-based-billing
- [S22] Lemon Squeezy blog — "2026 Update: Lemon Squeezy + Stripe Managed Payments", dated 28 January 2026: https://www.lemonsqueezy.com/blog/2026-update
- [S23] Better Auth docs — Stripe plugin (customer on signup, plans, organization reference): https://www.better-auth.com/docs/plugins/stripe
- [S24] Polar — fees and plans: https://polar.sh/docs/merchant-of-record/fees ; plans announcement dated 20 May 2026: https://polar.sh/blog/introducing-polar-plans
- [S25] Polar docs — usage-based billing and merchant-of-record introduction: https://polar.sh/docs/features/usage-based-billing/billing ; https://polar.sh/docs/merchant-of-record/introduction
- [S26] Canada Revenue Agency — when to register for and start charging GST/HST, page dated 16 June 2026: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
