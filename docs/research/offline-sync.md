# Offline at a Site: what the phone keeps, which actions wait for the network, and how offline edits reach the store (2026-09-27)

Research for ticket [#278](https://github.com/Akamel01/drone-survey/issues/278), under the
parent map [#229](https://github.com/Akamel01/drone-survey/issues/229). One operator, one
phone, offline at a Site, four questions: **which actions can safely happen offline and which
must wait for the network**; **what the phone keeps for a Site, and how much space that is**;
**how offline edits reach the store and how conflicts resolve** (last-write-wins per Mission,
per-field merge, operation log, CRDTs); and **what iOS and Android actually allow a PWA to
store** (quotas, eviction, `persist()`).

Worktree `research/offline-sync`, HEAD `7751e43` (verified). Inputs read in full:
`.autoforge/discovery/report.md` (D1) and `.autoforge/architecture/report.md` (A1); every anchor
below was re-opened in this worktree before citing.

Method: primary sources (vendor, specification, framework) preferred; every web source carries
the date it was read; anything not read or measured is marked **INFERRED**. Repo facts are cited
`path:line` at HEAD `7751e43`. Web sources were read on 2026-09-27.

## Verdict

| Question | Answer | Deciding fact |
|---|---|---|
| 1. Which actions happen offline | **Planning and every row action except Dispatch can happen offline; all but Copy queue** — create, edit a Planned Mission, Withdraw, Mark Flown / Unmark, Remove (Copy is client-local). **Dispatch is never queued**: its button is disabled offline with the reason. Collected/Loaded are host-side only. | A Dispatch reserves Cards against the shared Ledger and must be refused "at the planner, while the operator can still do something about it" (`docs/adr/0022-cards-are-reserved-at-dispatch.md:26-30`); the host is the manifest's only writer (`docs/adr/0019-mission-status-through-the-store.md:16-21`). |
| 2. What the phone keeps | One IndexedDB database (`missions`, `specs`, `status`, `drafts`, `outbox`, `meta`) plus one Cache Storage bucket for the Site's tiles, on the Vercel origin only. A Mission record is ≈5.7 KB measured; a Site with a handful of Missions and z15–19 tiles is **≈1–2 MB typical** (tile arithmetic INFERRED). | Measured bytes in §2; layout mirrors `web/lib/keys.ts:12-21`. |
| 3. Sync model | **Guard-and-replay outbox**: queue operator verbs per Mission id, replay them against the existing routes, and guard an id-carrying `save` with the record version it was formed against (**recommendation**; the route change is new code). LWW-per-record *with a visible compare*, never silent LWW; no per-field merge; no CRDTs. Conflicts show as a row badge → compare card with keep-mine / take-store. | One file per Mission bounds collisions to one record (`keys.ts:12-15`); the domain's native move is refusal, not merge (Dispatch, unmark, name clash all refuse); state is derived, never stored (`missionRecords.ts:241-248`, `missionRecords.ts:261-332`). |
| 4. iOS / Android storage limits | Safari (iOS 17+): origin quota up to 60% of disk for both Safari and an installed Home Screen web app; Chromium: origin up to 60%, browser up to 80%. Everything is **best-effort by default** and evicted LRU under pressure; `persist()` is heuristically granted without a prompt (Home Screen install is one heuristic) and is the only protection. The ITP 7-day wipe covers IndexedDB/Cache/service-worker but **not** installed Home Screen web apps. | WebKit, *Updates to Storage Policy* (2023-08-10); WebKit ITP 2.3 (2020-03-24); MDN; all read 2026-09-27 — §4. |

## 1. What happens offline, and what waits for the network

The store is not the browser. "Missions live in the shared store, not in the browser. Browser
storage is per-origin, per-browser and per-device … a cleared cache would have destroyed them
with no warning. Losing planning work is one of three things the operator named as never
acceptable" (`docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:30-34`). The phone design
therefore does not make browser storage the store; it makes the store's copy *available* offline
and queues the operator's verbs — the same verbs, in the glossary's words, that the routes
already implement.

**The states stay the glossary's.** "A Mission is one thing, shown once, moving through states
named after the verbs that cause them" (`docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:20-23`), and "`queued` is not a state … how many
are ahead of it is something the Mission has, not somewhere it is" (ADR 0021:25-28;
`CONTEXT.md:173-174`). No badge the outbox adds is a Mission State; the row's state still comes
from `deriveMissions` over the cached store data.

### The offline action matrix

Final matrix, from A1 §5, with the rule and the code that decides each row:

| Action | Offline? | Queued? | On replay, what can refuse | What the operator sees |
|---|---|---|---|---|
| Read the Mission list | Yes, last synced copy only | n/a | cache staleness | "Last synced &lt;time&gt;" banner; queued badges on rows |
| Plan / create a Mission | Yes | Yes (`save`, create) | name/Site clash → 409 | row reads "not saved — waiting to send"; clash card offers rename / open theirs |
| Edit a Planned Mission | Yes | Yes (`save`, base version) | base moved → 409; became Loaded → 409 | compare card: your version vs store; keep mine / take store |
| Edit a Dispatched/Collected Mission | Yes | Yes (`save`, base version) | base moved; already Loaded | keep mine ⇒ "will be saved as a new Mission (supersedes on Dispatch)"; Loaded ⇒ copy-as-new offer |
| **Dispatch** | **No** — button disabled with the reason | **Never** | — | button greyed with the ADR 0022 sentence: the refusal must reach the planner |
| Withdraw | Yes | Yes | became Loaded (dead); stale Mission (retry) | the server's sentence + "fly it and Mark it Flown"; dismissed once read |
| Mark Flown | Yes | Yes | not Loaded yet (retry); Withdrawn/Superseded (dead) | "waiting to send; will try again when the host reports the Load" |
| Unmark Flown | Yes | Yes | a Card moved on → refused | "WAYFINDER n now holds another Mission…" + "withdraw that one first" |
| Remove (archive) | Yes | Yes | still holds a Card → refused | server's sentence + inline "Withdraw first" |
| Copy | Yes | No (client-local) | — | immediate |
| Collected / Loaded | **Host-side only** | Never | — | not offered on the phone |
| Ledger / manifest / summaries | Never | Never | — | read-only |

Why each row is where it is:

- **Planned is the only in-place-edit state.** `CONTEXT.md:177-180`; `editBehaviour` returns
  `"in-place"` only for `planned` (`web/lib/model.ts:47-51`), and the save branch writes in place
  at `web/lib/missionLifecycle.ts:278-284`. Editing Dispatched-or-later forks a new Mission
  (`missionLifecycle.ts:260-276`), which is safe to queue because "A Spec is never edited: a
  change is a new Spec that supersedes the earlier one" (`CONTEXT.md:109-110`;
  `docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:40-44`).
- **Loaded is guarded** "because a file is then already in the field"
  (`docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:40-44`): Edit is
  refused at `missionLifecycle.ts:257-258` via `actionProblem("Edit", row)`
  (`web/lib/missionRecords.ts:202-206`).
- **Dispatch is not queueable.** "A Card is reserved when a Spec is Dispatched… a Dispatch that
  cannot be satisfied is refused **at the planner, while the operator can still do something
  about it**, rather than at a plug-in they may be hundreds of kilometres from home for"
  (ADR 0022:26-30); reserving happens against the shared Ledger at Dispatch
  (`missionLifecycle.ts:385-424`), no Card free means refused, never "overwrite the oldest"
  (`docs/adr/0022-cards-are-reserved-at-dispatch.md:37-39`). Nothing about Dispatch needs the
  field: planning does, and planning is
  queued. **Deliberate divergence from #231, flagged not hidden:** `mobile-stack.md:90-96`
  accepted "a replayed Dispatch can still be refused"; this document's recommendation is
  stricter — the button is disabled offline — because ADR 0022 wants the refusal while the
  operator can act. #231's earlier stance changed on the strength of that sentence.
- **Collected and Loaded are host transitions.** "The host is the manifest's only writer; the
  planner only reads" (ADR 0019:16-21). The phone can neither perform nor fake them; it can only
  queue the operator's own Flown mark, which is asserted, not observed: "the operator's own mark
  decides… Where the two disagree, both are shown"
  (`docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:50-53`; `flownEvidence`,
  `missionRecords.ts:218-234`). The phone likewise never writes the Ledger: it "lives in the
  store, written by the host that Loads" and is "checked against the Controller at each plug-in…
  reported, never quietly corrected" (`docs/adr/0022-cards-are-reserved-at-dispatch.md:41-45`).
- **Nothing is deleted.** Remove archives (`ADR 0021:36-38`; `missionLifecycle.ts:292-313`), so a
  queued Remove is an archive write, refused while a Card is held
  (`missionRecords.ts:207-211`).
- **The refusals a replay can hit already exist, once.** `actionProblem` is the single copy the
  row and every route share (`missionRecords.ts:171-215`): Dispatch only `planned`; Withdraw only
  `dispatched|collected`; Mark Flown only `loaded`; Unmark only `flown`; Edit refused only when
  `loaded`; Remove refused while `collected/loaded`. Beyond state: no Card free at Dispatch
  (`model.ts:121-139`), unmark blocked when a Card moved on (`missionLifecycle.ts:582-594`),
  the skip list changed under Withdraw (`missionStore.ts:163-183`), a double Dispatch press
  detected from the Ledger (`missionLifecycle.ts:390-400`).

The durability rule that licenses a local drafts store — but not a local Mission store — is
`docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:73-77`: "The browser holds the edit in
progress, so a closed tab loses nothing; the store
holds each saved version." The outbox extends that tier; it never replaces it.

## 2. What the phone keeps for a Site, and its size

One IndexedDB database plus one Cache Storage bucket, on the Vercel origin. Keys mirror
`web/lib/keys.ts` — there is no second key layout:

| IndexedDB store | Key | Value | Notes |
|---|---|---|---|
| `missions` | Mission id | the last synced `MissionRecord` | mirrors `specs/_missions/<id>.json` (`keys.ts:12-15,52-55`) |
| `specs` | Spec key from `makeSpecKey` (`keys.ts:24-27`) | `MissionSpec` | only Dispatched/Loaded Missions; Specs are immutable, so caching is safe |
| `status` | literal `LEDGER_KEY`, `STATUS_KEY` (`keys.ts:18-19`) | last synced `CardLedger` / Manifest | read-only copies; the host is the manifest's writer (ADR 0019:16-21) |
| `drafts` | local or store Mission id | the edit in progress (`MissionDraft`) | ADR 0021:73-77's "browser holds the edit in progress", made to survive an app kill |
| `outbox` | autoincrement `seq`, index on `mission_id` | one queued operator verb (A1 §4.2) | write-ahead; the durability contract lives here |
| `meta` | `device_id`, `last_sync_at`, `schema_version` | scalars | drives the "last synced" banner and #244's actor check |

Cache Storage: one bucket (`tiles-v1`), keyed by tile request URL. The map is MapLibre GL over
Esri World Imagery raster tiles, 256 px, `maxzoom: 19` (`web/lib/basemap.ts:5-32`), with OSM as
a second style (`basemap.ts:21-33`). The service worker scope is the app shell plus tiles only —
never `/hero/v1/`, never outbox replay (the page owns replay, because the credential lives in the
page: `web/lib/missionClient.ts:52-66`).

**Nothing of this exists today.** A repo-wide grep over `web/` for
`indexedDB|serviceWorker|navigator.storage|webmanifest` matches no source file, and
`web/package.json:20-27` has no storage dependency — IndexedDB is used raw. The only browser
stores today are the passphrase in `localStorage` and the cross-tab "missions changed" signal
(D1 §3). The offline outbox is **new code**, not a switch.

### Measured sizes, with the commands that produced them (from D1 §4; bytes measured)

```
python3 ast extraction:
scripts/mission/load_test.py SELFTEST_SPEC compact bytes: 627
node extraction:
DEFAULT_SPEC compact bytes: 511
DEFAULT_SPEC pretty bytes: 699
64-vertex circle spec compact bytes: 3072
MissionRecord wrapping it compact bytes: 3321
pretty sizes: filled-spec 4816 B; filled-record 5698 B; selftest 927 B
wc -c fixtures/*.json: card-ledger 8105, orbit-tilt 874, store-keys 1413, store-records 998
```

and for tiles (D1 §4:274-277), measured 2026-09-27:

```
curl -s -o /tmp/t.jpg -w '%{size_download}' .../World_Imagery/MapServer/tile/<z>/<y>/<x>:
z19 15,390 B; z19 16,176 B; z19 16,437 B; z18 17,595 B (256×256 JPEG)
```

The store writes **pretty-printed** JSON (`missionStore.ts:100-102`), so on-disk figures are the
pretty ones: a 4-corner Spec ≈0.9 KB, a 64-vertex circle Spec ≈4.8 KB, a `MissionRecord` wrapping
it ≈5.7 KB, the Ledger fixture 8.1 KB.

| Bucket | Per Site | Basis |
|---|---|---|
| Mission records | ≈6 KB each; 100 Missions ≈0.6 MB | measured 5.7 KB pretty; the count is unbounded in code |
| Specs (Dispatched/Loaded) | ≈1–5 KB each; 100 ≈0.5 MB | measured 0.9–4.8 KB pretty |
| Ledger + manifest | ≈10 KB | fixture 8.1 KB |
| Outbox + drafts | <100 KB typical (≤6 KB per pending edit) | derived from the record sizes |
| Tiles z15–19 | ≈0.86 MB per 10 ha | measured tile bytes × tile-count arithmetic — **INFERRED** |
| **Typical total** | **≈1–2 MB per Site with a handful of Missions** | tiles dominate |

**INFERRED, explicitly:**

- Sizes scale linearly with AOI vertices (≈38 B/vertex pretty); `circlePolygon` defaults to 64
  vertices (`web/lib/mission.ts:204`). Derived from the measured 4-corner and 64-vertex Specs,
  not independently measured per vertex.
- Tile arithmetic: at lat 49.19 a z19 tile is ≈50.0 m/side ≈0.25 ha, so a 10 ha Site needs ≈40
  z19 tiles and ≈53 tiles across z15–19 (each lower zoom is ¼ the count) ≈ **0.86 MB at the
  measured ≈16 KB average**. The bytes and tile dimensions are measured; the count is INFERRED
  from the standard Web-Mercator formula.

**Tile pre-caching is a risk, not a solved fact.** Esri's own help says: "You can take ArcGIS
tiles offline when using Esri software that supports offline use. **Systematically requesting
ArcGIS tiles for offline use through other apps or services is prohibited**"
([ArcGIS Online Help, *Take web maps offline*](https://doc.arcgis.com/en/arcgis-online/manage-data/take-maps-offline.htm),
read 2026-09-27); Esri's ArcGIS Online item FAQ likewise lists "Systematically harvest basemap
tiles through any method other than using Esri Content Packages" as a prohibited use (Esri,
*FAQ about items owned by Esri in ArcGIS Online*, read 2026-09-27 via search result excerpt).
A MapLibre PWA is not Esri software, so bulk pre-caching World Imagery is **not permitted as
read** — treat `tiles-v1` as a best-effort cache of tiles the operator actually viewed, degrade
to online tiles, and keep the OSM style (`basemap.ts:21-33`) as the alternative. OSM's own tile
policy was not read this run (see §6).

The board origin cannot share any of this: `http://172.20.10.2` is not a secure context, so it
gets no service worker, and it is a second origin — "the push subscriptions, cached Mission
records and outbox built for the Vercel origin do not exist there"
(`origin/research/pwa-local-loader:docs/research/pwa-local-loader.md:220-221`, read 2026-09-27).
Whatever offline store this design puts on the phone lives on the Vercel origin only.

## 3. Sync strategies, the recommendation, and the conflict the operator sees

### The four strategies, weighed against this data

| Strategy | What it does | Coverage here | Verdict |
|---|---|---|---|
| Silent LWW per record (today) | last write wins wholesale; nobody is told | loses one operator's edit whenever the same Mission is edited twice | **reject — this is the defect to fix**, and it violates ADR 0021's no-silent-failure posture |
| LWW per record + a version guard that refuses | server writes only if the version the intent was formed against is current; otherwise 409 | covers the only real collision surface — same Mission id — because one file per Mission makes cross-Mission record collisions impossible (`keys.ts:12-15`) | **recommended core**: refusal is this domain's native move (Dispatch, name clash, unmark all refuse), and "show both" already exists for Flown (ADR 0021:50-53) |
| Per-field merge | merge `site_id/site/name/date/spec` field-wise on concurrent writes | same-field writes stay undefined; different-field writes produce a record neither operator authored; the Spec is an atom ("A Spec is never edited: a change is a new Spec that supersedes the earlier one", `CONTEXT.md:109-110`), and state would have to be re-derived anyway | **reject** |
| Operation log / outbox replay | queue each operator verb; replay verbatim against the existing routes | not a conflict strategy but a transport; every route already re-reads the whole set per action (`reads()`, `missionLifecycle.ts:159-169`), so a replay never acts on state the server has not just read | **recommended transport** (with the guard above) |
| CRDTs | convergent replicated types, per-field/op merge | over-covers and mis-fits — see below | **reject** |

### Why not CRDTs

A CRDT earns its cost when two or more writers edit concurrently and neither can be refused —
both must converge. Here the operator count is one, and the system's rules are the opposite of
convergence: a name clash is **refused** with a 409 that names the other Mission
(`missionLifecycle.ts:174-187`); a Card is **exclusive** and refusal is the feature — "When no
Card is available, the Dispatch is refused. Not 'overwrite the oldest'" (ADR 0022:37-39) — and
"a reservation never expires" (`docs/adr/0022-cards-are-reserved-at-dispatch.md:47-50`); state is
**derived**, never stored
(`missionRecords.ts:241-248,261-332`), so any merge would need re-derivation afterwards anyway;
and the Spec is an immutable atom rather than a mergeable document. A CRDT would merge two
Missions named "north half" into one or both, or two Specs into a plan neither operator drew —
the class of silent answer ADR 0021 was written to end. The per-Mission file already bounds
collisions to one record, which is exactly the scope a version guard covers. Revisit only if
#244 ships two Accounts editing one Mission at once; even then the right answer is optimistic
concurrency (guard + conflict surface), because the domain has no merged state to represent.

### The recommendation: a guard-and-replay outbox

**Recommended transport — queue and replay verbs.** The phone queues operator verbs per Mission
id (`save`, `withdraw`, `flown`, `unflown`, `remove`), FIFO by a local sequence; on reconnect it
fetches the list first and then replays each verb against the same route the browser calls —
which are exactly the lifecycle's operations (`missionLifecycle.ts:196-288` save,
`missionLifecycle.ts:388-424` Dispatch's Card step, `missionLifecycle.ts:478-535` withdraw,
`missionLifecycle.ts:539-624` setFlown). It
calls the same client the components call (`web/lib/missionClient.ts:1-7`), so the wire contract
keeps one home. Reservation arithmetic is already pure and testable
(`web/lib/model.ts:121-139` `reserveCards`, `web/lib/model.ts:166-173` `withRelease`). Two offline edits of one Planned Mission coalesce into one replay (latest draft
wins) — that coalescing is what removes the need for an operation log that rebases. Enqueue is
write-ahead: an entry is appended to the outbox before any network attempt and removed only after
a terminal outcome; a network failure never drops it.

**Recommended core — a version guard, as a recommendation, not as shipped behaviour.** Today
`updated_at` is rewritten on every write (`missionLifecycle.ts:237,267,282,306,445,515,601`) and
**never compared to guard a write** — its only reader picks a Site's latest label for the name check (`missionRecords.ts:131`); two writers on one record silently last-write-win. The recommendation is
one optional field on the save route: an id-carrying `save` carries the `updated_at` it was
formed against, and after the server's existing read (`missionLifecycle.ts:213-255`) a mismatch
returns a 409 refusal naming the Mission, writing nothing. This is new code and must be tested
against the existing name/Site checks. **It is an app-level compare, not a store CAS** — the
compare sits between the server's read and its write, and the store has no compare-and-swap
(`missionStore.ts:122-129`: "only a store with compare-and-swap, or one writer, closes it"). With
one operator that window is acceptable; it is the same ceiling the Ledger's own guarded write
already lives with (`missionStore.ts:104-149`).

**Recommended for offline-created Missions — device-minted ids.** The server mints ids with
`randomUUID()` (`missionLifecycle.ts:234-240`), which cannot run offline. The recommendation is a
reserved `local-<uuid>` namespace: `isSafeId` accepts it (`keys.ts:57-59`:
`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`; length 42 ≤ 64) and server ids can never begin `local-`, so
the namespaces are disjoint by construction. A create is a `save` with a null base under a
`local-` id; no id-mapping table and no post-hoc rewrite of later queued entries — the id the
phone showed the operator is the id the store keeps. **Recommendation, not shipped code.**

**Dispatch stays a hard block while offline** (§1). Queuing it would defer a refusal to a moment
the operator may be far from the planner, leave the row looking dispatched when nothing is
reserved, and make a queued edit ambiguous (edit of a Planned Mission vs fork of a Dispatched
one) until the queue's tail is known.

### What the operator sees on a conflict

The same Mission edited on the phone offline and in the browser — end to end:

1. The phone last synced Mission M at `updated_at` t1; the operator edits it offline. The save
   is queued against t1. The row gains a badge ("Edit waiting to send") **beside** its derived
   state — the badge is an outbox attribute, not a Mission State.
2. In the browser, someone saves M again; the store's `updated_at` becomes t2.
3. The phone reconnects: it fetches the list first, so the cache now shows t2 while the queued
   intent still says t1. The replay's save is refused by the guard (409, "changed since you
   edited it here" — recommended wording, new code).
4. The row badge opens a **compare card** with *your version* and *store version* side by side
   (name/Site/date plus a Spec summary; the full Spec is viewable, not merged) and one button per
   legal choice: **keep mine** re-saves against t2 — in place if the Mission is still Planned, as
   a fork if it is Dispatched-or-later (`missionLifecycle.ts:260-284`), and the button says which
   before confirming; **take store** drops the queued draft and adopts the cache.
5. Nothing resolves itself. This is ADR 0021's Flown template — "Where the two disagree, both
   are shown" (`ADR 0021:50-53`) — applied to the whole record, and it is why **no per-field
   merge** is offered: there is no merged-mutable-fields concept anywhere in the repo, every
   concurrency rule in it refuses rather than merges, and a merge would produce a record neither
   operator authored.

Other refusals keep the server's own sentence and exactly one corrective action, because the
refusals are one copy (`actionProblem`, `missionRecords.ts:181-215`):

- **Name clash on a phone-created Mission (409).** The server's sentence
  (`missionLifecycle.ts:180-186`) with rename-yours (inline, retry under the same id) or
  open-theirs. Never auto-renamed.
- **Withdraw refused because the Mission became Loaded.** Dead refusal; the server's words:
  "its file is on the Controller and withdrawing cannot reach it. Fly it and Mark it Flown,
  which releases its Card" (`missionRecords.ts:191-193`).
- **Mark Flown refused because the store has not seen Loaded yet.** Retryable — the host may
  simply not have reported (`push-zero-spend.md:162-164`). The badge says it will retry when the
  host reports the Load; the mark is preserved, never silently converted to imagery evidence.
- **Unmark refused because a Card moved on.** The card names the Card and the Mission now holding
  it (`missionLifecycle.ts:588-591`) and offers dismiss or retry-after-withdraw.
- **Remove refused while a Card is held.** The server's instruction — "Withdraw it first -- that
  releases the Card -- then remove it" (`missionRecords.ts:209-211`).
- **Store unreachable or the daily cap spent.** Not a conflict: entries stay pending; the 503
  sentence is the store's own (`missionLifecycle.ts:145-151`).

**No optimistic state.** A queued Withdraw does not set `withdrawn_at` locally; a queued Flown
does not flip the row. The cache shows the store as last read, and the badge shows intent. That
is what keeps one derivation and one answer (ADR 0021:20-23). And because one file per Mission
means two Missions cannot collide on a record, the same-Mission case above is the *only* record
conflict class the model has to answer.

## 4. What iOS and Android allow a PWA to store

All web sources in this section read 2026-09-27.

**The baseline the doc names.** The [Storage Standard](https://storage.spec.whatwg.org/) (read
2026-09-27) defines the model: data lives in a
per-origin bucket that is `best-effort` by default (§4.5); persistent mode requires the
`persistent-storage` permission (§5); "The user agent cannot clear storage marked as persistent
without involvement from the origin or user" (§5); "Whenever a storage bucket is cleared by the
user agent, it must be cleared in its entirety" (§7); and under pressure the agent "should clear
network state and local storage buckets whose mode is `best-effort`" (§7.1). Usage is an "implementation-defined rough estimate" and quota an "implementation-defined
conservative estimate" (§6), and the quota "must not be a function
of the available storage space on the device" (§6) — which is why every figure below is a share
of *total* disk, not of free space.

Sources for this table: [WebKit, *Updates to Storage Policy*](https://webkit.org/blog/14403/updates-to-storage-policy/)
and [MDN, *Storage quotas and eviction criteria*](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
for quotas and eviction; [MDN, *StorageManager.persist()*](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
and [web.dev, *Persistent storage*](https://web.dev/articles/persistent-storage) for `persist()`;
all read 2026-09-27.

| | iOS / Safari (WebKit) | Android / Chrome (Chromium) |
|---|---|---|
| **Quota per origin** | Safari 17+/iOS 17+: up to **60% of total disk** for a browser app; installed Home Screen web apps "ha[ve] the same origin quota and overall quota as when it is opened in a browser app" (WebKit) | up to **60% of total disk** per origin (MDN; web.dev secondary) |
| **Overall browser quota** | 80% of disk for a browser app (WebKit) | Chrome uses at most 80% of total disk (MDN) |
| **Default mode / eviction** | best-effort; LRU by origin under storage pressure or over the overall quota; an origin "might be excluded … if it has active page at the time of eviction, or its storage is in persistent mode" (WebKit). ITP also proactively deletes script-writable storage after 7 days without user interaction — **except installed web apps** (below) | best-effort; LRU by origin when the browser runs out of space (MDN; web.dev secondary) |
| **`persist()`** | heuristically granted **without a prompt**: "Safari and most Chromium-based browsers … automatically approve or deny the request based on the user's history of interaction with the site and do not show any prompts" (MDN). WebKit: "WebKit currently grants a request based on heuristics like whether the website is opened as a Home Screen Web App" (WebKit) | auto-handled, no prompt: granted if the site is "considered important" — engagement, installed/bookmarked, notifications permission; silently denied otherwise (web.dev secondary; MDN corroborates no prompts) |

**The ITP 7-day cap, and the installed-web-app exemption.** ITP 2.1 capped *client-side cookies*
at seven days ([WebKit, *Intelligent Tracking Prevention 2.1*](https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/),
2019-02-21, read 2026-09-27). ITP 2.3 extended it: "deleting all of a website's
script-writable storage after seven days of Safari use without user interaction on the site" —
listing "Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and
cache" ([WebKit, *Full Third-Party Cookie Blocking and More*](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/),
2020-03-24, read 2026-09-27). Two sentences decide the phone's outbox lifetime:

> Web applications added to the home screen are not part of Safari and thus have their own
> counter of days of use. Their days of use will match actual use of the web application which
> resets the timer. We do not expect the first-party in such a web application to have its
> website data deleted.

and, for that not happening: "If your web application does experience website data deletion,
please let us know since we would consider it a serious bug" (WebKit ITP 2.3, 2020-03-24, read
2026-09-27). **So for an installed Home Screen app, the 7-day wipe is not the danger.** The
danger is system storage pressure, where the app is evicted like any best-effort origin unless
`persist()` was granted — and `persist()` grantability is documented but not a guarantee.

**Safari 26 makes install the default.** "By default, every website added to the Home Screen
opens as a web app. If the user prefers to add a bookmark for their browser, they can disable
'Open as Web App' when adding to Home Screen"
([WebKit, *WebKit Features in Safari 26.0*](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
2025-09-15, read 2026-09-27). On iOS 26 the operator reaches the installed-app storage regime by
default; #252 already cited the same sentence for the board page. Home Screen web apps have been
a distinct context since at least Web Push on iOS 16.4: they open "like any other app … separate
from Safari or any other browser," and push needs no Apple Developer Program membership
([WebKit, *Web Push for Web Apps on iOS and iPadOS*](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
2023-02-16, read 2026-09-27).

**What this means for the outbox and drafts.**

- On an installed iOS PWA: ITP does not time-bound the outbox; the origin quota is the browser
  app's (~60% of disk — far above the ≈1–2 MB per Site this design needs); `persist()` is
  requestable and a Home Screen install is a documented grant heuristic. But persistence is a
  grant, not a promise, and under device storage pressure an un-persisted origin is evicted as a
  whole (Storage Standard §7; WebKit). Keep the outbox small, flush on foreground, and never call
  queued work durable.
- On Android Chrome: a large quota, but the same best-effort default and LRU eviction; install
  improves the `persist()` odds (web.dev secondary). The same rules apply.
- Every write path must tolerate `QuotaExceededError` and eviction: storage is a cache of intent,
  the store is the truth. What the operator sees when the queue is gone can only be
  "last synced at" — a wiped outbox is not detectable from local state (this is a consequence of
  the model, marked INFERRED in A1 §8).

## 5. Open questions

Each with the stance this research supports and the owner that closes it. (From A1 §10 and D1 §9.)

1. **Record-level conflict UI** — Answer: LWW-per-record **with a guard and a visible compare**,
   never silent LWW; no per-field merge (§3). Keep-mine/take-store is the pattern. Closed by this
   document; implementation follows the build ticket.
2. **Offline-created Missions** — Answer: the phone mints `local-<uuid>`; the save route admits a
   null base as create-under-a-local-id (§3). **Open for a build ticket**: the exact route diff
   must be tested against `isSafeId` and both clash checks. Owner: build.
3. **`updated_at` guard semantics** — Answer: a pre-write compare-and-refuse is enough; FIFO plus
   save-coalescing removes the need for an operation log that rebases; no merge ever happens.
   Owner: build ticket, including the multi-writer ceiling note (`missionStore.ts:122-129`).
4. **Outbox lifetime vs eviction** — Stance: an unsent action never expires (the analogue of
   "a reservation never expires", ADR 0022:47-50 — dropping an operator's intent silently is the
   failure class); it lives until sent, resolved, or the OS removes it. The app can only show
   "last synced at"; a wiped queue is not detectable locally. iOS's ITP risk is answered above;
   the system-pressure threshold has no published number (see §6). Owner: build ticket plus
   ongoing device testing.
5. **How much of a Site to keep** — Stance: all records + Ledger + manifest for synced Sites;
   Specs for Dispatched/Loaded; tiles for the Site's AOI, capped by `estimate()`. **Open: Esri
   pre-caching terms forbid systematic harvesting (§2), so the tile cache must be
   view-driven and OSM's tile policy needs its own read.** Owner: build ticket + a follow-up
   research note.
6. **Loaded-while-offline replay** — Stance: the outbox retries the operator's Flown mark until
   the store can accept it; host transitions stay host-side, because the host is the manifest's
   only writer (ADR 0019:16-21). Recording unreported transitions is a host-side change to
   #232's sibling scope (`push-zero-spend.md:162-164`). Owner: a host-side ticket, named here and
   left open.
7. **Accounts (#244)** — Stance: the model survives unchanged; the guard is author-agnostic and
   the outbox's actor field keeps queues from crossing identities when the passphrase `Caller`
   (`missionLifecycle.ts:38-40`) is replaced. Re-state the conflict rules against Account
   identity then. Owner: #244.
8. **Board-origin second app (#252)** — Stance: Vercel-origin PWA only; the board page is a
   second origin with no secure context, so offline planning from it is out of scope unless the
   trusted-certificate route changes the origin story
   (`pwa-local-loader.md:209-221`). Owner: #252 / the map.

## 6. Could not verify

- **Chrome for Developers storage-quota / persistent-storage pages.** Both URLs named in the
  work order returned HTTP 404 from this environment (attempted 2026-09-27):
  `developer.chrome.com/docs/web-platform/storage-quota` and
  `developer.chrome.com/docs/web-platform/persistent-storage`. The Chromium figures in §4 come
  from MDN (*Storage quotas and eviction criteria*) and are corroborated by the secondary
  web.dev pages; no Chrome-for-Developers page was read.
- **A specific Apple/WebKit bug-tracker entry on installed-web-app eviction.** Not searched after
  WebKit's own vendor documentation answered both halves of the question: the ITP exemption is
  stated in the ITP 2.3 post (*serious bug* quote, §4), and system eviction plus the `persist()`
  heuristic are stated in *Updates to Storage Policy* (2023-08-10). The tracker would add colour,
  not a deciding claim, so it was left unread.
- **The exact iOS eviction threshold under system storage pressure.** WebKit documents the policy
  (LRU, whole-origin, persistent excluded) but publishes no numeric threshold; no figure is
  claimed here.
- **Esri Master Agreement text.** Only the ArcGIS Online Help sentence (quoted verbatim, §2) and
  the ArcGIS Online item FAQ (read via search result excerpt, PDF not fetched directly) were
  read. The FAQ's offline rule — offline only via Esri Content Packages, exclusively in Esri
  software — is consistent with the Help sentence, but the Master Agreement itself was not read.
- **OpenStreetMap tile usage policy.** Named as the tile alternative (`basemap.ts:21-33`) but not
  fetched this run; if the tile cache survives §2's Esri finding, OSM's policy is the next read.
- **Whether `persist()` actually returns `true` on a given installed iOS PWA in practice.** The
  grant heuristic is documented (Home Screen app is one factor), no prompt is shown, and the
  outcome is device- and history-dependent; not measured on a device here.
- **Android Chrome's exact quota formula beyond "60% of total disk".** The primary Chrome page
  is 404 (§6 above); web.dev (secondary) states the same 60%/80% split and adds the incognito and
  "clear on close" reductions, which are not load-bearing for this design.

## 7. Sources

All web sources read 2026-09-27.

Primary (specification / vendor / framework):

- WHATWG, *Storage Standard* — https://storage.spec.whatwg.org/ (Living Standard, last updated
  2026-03-15; best-effort vs persistent buckets, quota, whole-bucket clearing, persistence
  permission)
- MDN, *Storage quotas and eviction criteria* —
  https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
  (last modified 2026-01-05; Chromium 60%/80%, Safari/iOS 17 quotas incl. Home Screen web app,
  LRU eviction, Safari 7-day proactive eviction)
- MDN, *StorageManager.estimate()* — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
  (last modified 2025-10-31; approximate usage/quota; quota varies with engagement, install,
  notifications)
- MDN, *StorageManager.persist()* — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
  (last modified 2024-07-26; request may be granted or denied; Safari/Chromium auto-decide, no
  prompt)
- WebKit, *Intelligent Tracking Prevention 2.1* —
  https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/ (2019-02-21; the original
  seven-day cap, on client-side cookies)
- WebKit, *Full Third-Party Cookie Blocking and More* —
  https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ (2020-03-24; the
  7-day cap on IndexedDB, localStorage, sessionStorage, service-worker registrations and cache;
  the installed-Home-Screen-web-app exemption, quoted in §4)
- WebKit, *Updates to Storage Policy* — https://webkit.org/blog/14403/updates-to-storage-policy/
  (2023-08-10; Safari 17 origin/overall quotas, standalone web app parity, eviction order,
  `persist()` heuristics incl. Home Screen Web App)
- WebKit, *Web Push for Web Apps on iOS and iPadOS* —
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (2023-02-16; Home
  Screen web apps as their own context, separate from Safari)
- WebKit, *WebKit Features in Safari 26.0* —
  https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ (2025-09-15; every Home Screen
  addition opens as a web app by default — sentence verified in the page)
- Esri, *Take web maps offline* —
  https://doc.arcgis.com/en/arcgis-online/manage-data/take-maps-offline.htm (ArcGIS Online Help;
  the prohibition on systematically requesting ArcGIS tiles offline through other apps, quoted
  in §2)
- Esri, *FAQ about items owned by Esri in ArcGIS Online* —
  https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf (read via search result
  excerpt; offline basemap only via Esri Content Packages, used exclusively with Esri software)

Secondary (labelled as such; used for corroboration only):

- web.dev, *Storage for the web* — https://web.dev/articles/storage-for-the-web (last updated
  2024-09-23; per-browser quota table, eviction, QuotaExceededError handling; states the Safari
  7-day cap does not apply to installed PWAs)
- web.dev, *Persistent storage* — https://web.dev/articles/persistent-storage (last updated
  2020-05-12; Chromium auto-grants by heuristics — engagement, installed/bookmarked,
  notifications — else silently denies; Firefox prompts)

Repo documents and code read 2026-09-27, at HEAD `7751e43`:

- `CONTEXT.md` (:99-111 Mission Spec, :119-137 Card / Reservation / Card Ledger, :157-175
  Dispatch and Mission State, :177-180 Planned)
- `docs/adr/0019-mission-status-through-the-store.md` (:16-21 host is the manifest's only writer)
- `docs/adr/0021-one-mission-one-lifecycle-in-the-store.md` (:20-23 states, :25-28 `queued` is
  not a state, :30-34 store not browser, :36-38 nothing deleted, :40-44 edit semantics,
  :46-48 two Missions one day, :50-53 Flown asserted, :73-77 two-tiered durability)
- `docs/adr/0022-cards-are-reserved-at-dispatch.md` (:26-30 reserve at Dispatch and refuse at
  the planner, :32-35 occupancy and release, :37-39 refuse, never overwrite, :41-45 Ledger
  reported never corrected, :47-50 reservation never expires)
- `web/lib/keys.ts` (:12-21 store key layout, :24-27 `makeSpecKey`, :52-59 `missionKey` /
  `isSafeId`)
- `web/lib/missionRecords.ts` (:100-106 supersession group, :123-137 Site-name check,
  :171-215 `actionProblem`, :218-234 `flownEvidence`, :241-248 `baseState`, :261-332
  `deriveMissions`)
- `web/lib/missionLifecycle.ts` (:38-40 `Caller`, :159-169 `reads()`, :174-187 name clash,
  :196-288 save, :385-424 Dispatch Card reservation, :478-535 withdraw, :539-624 setFlown)
- `web/lib/model.ts` (:17-51 states and `editBehaviour`, :82-108 Ledger and `cardUnavailable`,
  :121-173 `reserveCards` / `withReservation` / `withRelease`)
- `web/lib/missionStore.ts` (:100-102 pretty write, :122-149 Ledger re-read guard, :163-183
  skip-list guard)
- `web/lib/missionRoute.ts` (:10-18 refusal→status mapping: 409 refused, 502/503
  unreachable/store)
- `web/lib/missionClient.ts` (:1-7 one client, :17-19 actions that reach the store, :52-66 the
  credential, :146,174 cross-tab signal)
- `web/lib/basemap.ts` (:5-33 Esri and OSM styles); `web/lib/mission.ts` (:204
  `circlePolygon` 64 segments); `web/package.json` (:20-27 no storage dependency)
- D1: `.autoforge/discovery/report.md` §2-§4 (measured sizes and commands, quoted in §2)
- A1: `.autoforge/architecture/report.md` §1, §3-§5, §7-§10 (decision summary, options, final
  action matrix, storage layout, risks, open questions)
- Siblings via `git show origin/research/<branch>:...`: `mobile-stack.md:90-96` (replayed
  Dispatch was acceptable in #231 — superseded here, §1), `push-zero-spend.md:162-164`
  (Loaded-while-offline gap), `pwa-local-loader.md:209-221` (board origin not a secure context;
  second origin)
