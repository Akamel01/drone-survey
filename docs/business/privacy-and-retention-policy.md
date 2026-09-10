# Privacy and Retention Policy — DRAFT

> **Draft for the operator's review, not legal advice.** Prepared from
> [the Canadian compliance research](../research/canada-compliance-2026.md).
> Have a Canadian privacy lawyer review this before the second or third paying
> client, and before any Quebec engagement. Bracketed items must be completed by
> the operator.

**Business:** [legal business name]
**Person responsible for personal information:** [name], [email]
**Province of operation:** [province] — this determines whether PIPEDA or a
provincial law (British Columbia PIPA, Alberta PIPA, Quebec Law 25) governs.
**Effective:** [date] · **Next review:** [date + 12 months]

## 1. What we collect and why

We fly drones over construction and property Sites to produce maps and 3D models
for our clients. The only purpose of collection is producing those deliverables
for the client who engaged us, and — where the client has contracted for repeat
visits — comparing the Site across dates.

We do not collect imagery to identify, monitor or profile any person. People and
vehicles that appear in imagery are captured incidentally.

We limit what we collect:

- Sites are flown **when they are not being worked**, so imagery contains as few
  people as possible.
- Mapping passes are flown straight down from 60–100 metres, where faces are
  generally not resolvable.
- Lower, angled passes are flown only where a structure requires them, and only
  within the Site.

## 2. Whether our imagery is personal information

Canadian law treats information as personal where there is a serious
possibility that an individual could be identified from it, alone or combined
with other information. A face, a readable licence plate, or a recognisable
vehicle seen repeatedly across visits can all qualify.

We do not assume our imagery is non-personal because of altitude. For each
project we record a short identifiability assessment (section 7), noting in
particular:

- whether licence plates are legible at the resolution flown
- whether lower angled passes were flown, which raise identifiability
- whether repeated visits make any person's or vehicle's presence traceable over
  time, which raises it further

## 3. Notice

Individual consent from everyone incidentally captured is not practical. We rely
instead on limiting collection, on the reasonable purpose of the work, and on
notice:

- the client contract requires the client to notify its site personnel and to
  post notice at the Site entrance on flight days
- signage wording: [e.g. "Aerial survey by drone in progress on [date]. Contact
  [email] with questions."]

A contract with the property owner is not consent from workers or the public;
it governs only our relationship with the client.

## 4. Retention

| Material | Retained for | Then |
|---|---|---|
| Raw imagery off the aircraft | **12 months** from the flight date | Deleted |
| Derived deliverables (orthomosaics, 3D models) | **12 months** from the flight date, until reviewed otherwise | Deleted |
| Delivery links issued to clients | For the life of the engagement, not beyond 12 months after the last flight | Removed |
| Deletion log | Indefinitely | Kept, since it contains no imagery |

**Why 12 months:** [operator to state the business reason — for example, it
covers a typical construction warranty or dispute window, or the period over
which a Site is compared across repeat visits. The number must be tied to a real
reason; a regulator or a client's lawyer can reasonably ask why 12 months rather
than 3 or 36.]

Derived deliverables currently carry the same limit as raw imagery. They are
plausibly less identifying, because reconstruction blends many overlapping
frames and tends to remove moving people and vehicles, but no Canadian regulator
has confirmed that distinction for drone survey deliverables. We will revisit it
only on qualified advice, and only for outputs checked to contain no
identifiable individual.

## 5. Deletion

Deletion is scheduled, executed and logged. A retention period that is written
down and not carried out is a greater risk than having none.

- Every Capture is recorded with its flight date when it is ingested.
- [Monthly] we delete every Capture and derived deliverable past its 12-month
  date, from working storage, archive storage, and any compute machine it was
  processed on.
- Each deletion is logged: Site, Capture date, what was deleted, from where, and
  when.

## 6. Requests from individuals

Anyone may ask what imagery we hold of them, or ask to be removed or blurred from
material we hold or have delivered. Requests go to [email]. We acknowledge within
[5] business days and respond within 30 days, and record the request and outcome
in the deletion log.

## 7. Per-project record

For each Site we keep:

- the client and the purpose of the engagement
- the flight dates and the passes flown
- the identifiability assessment from section 2
- how notice was given
- the scheduled deletion date

## 8. Where imagery is processed and stored

Imagery is processed on computers the business operates or has arranged access
to. If a job is processed on rented cloud compute, the imagery is removed from
that service when the job completes. Client deliverables are stored in object
storage at unlisted links, which limit discovery but are not access control.
Clients with confidentiality requirements should tell us before the engagement.

## 9. Quebec

For any Quebec Site or client, Law 25 applies with no small-business exemption.
In addition to the above: the person named at the top of this policy is the
person responsible for the protection of personal information, this policy is
published at [URL], and any confidentiality incident is assessed and, where it
presents a risk of serious injury, reported to the Commission d'accès à
l'information and the affected individuals.

## 10. Breaches

If imagery is lost, accessed without authorisation, or disclosed by mistake, we
assess whether it creates a real risk of significant harm and, if so, notify the
Office of the Privacy Commissioner [or the provincial commissioner] and affected
individuals, and record the incident.
