# How Mission state changes reach the phone at zero spend (2026-09-27)

Research for ticket [#232](https://github.com/Akamel01/drone-survey/issues/232), under the parent
map [#229](https://github.com/Akamel01/drone-survey/issues/229). Repo `Akamel01/drone-survey`,
worktree at HEAD `d71ba64`. Read-only: no product code changed, no git mutation.

**Settled input, not re-litigated.** The phone experience is an **installable PWA**; **Web Push
from the installed PWA is the lead route**; an **ntfy-style relay is the recorded fallback** when
Web Push is not delivered (settled in [#231](https://github.com/Akamel01/drone-survey/issues/231);
findings at
[docs/research/mobile-stack.md on `research/mobile-stack`](https://github.com/Akamel01/drone-survey/blob/research/mobile-stack/docs/research/mobile-stack.md);
`.autoforge/inputs/mobile-stack.md:29,138-141,147-148,320-323`). This document studies delivery
and sender mechanics only. It does not reconsider the stack and it does not build anything.

Method: primary sources first (specifications, vendor documentation, framework source), each
carrying the date it was read — all web sources were read **2026-09-27** unless a different date
is stated. Repo facts are cited as `path:line` at HEAD `d71ba64`. Anything not read or measured is
marked **INFERRED**. Pages that could not be read are listed under "Could not verify" with the
attempt date. Forum and community pages are labelled as such. This document merges the four module
notes produced this run: `.autoforge/execution/notes-web-push.md` (Web Push mechanics),
`notes-platform-push.md` (APNs, FCM, Expo, Capacitor), `notes-relays.md` (fallback relays), and
`notes-senders.md` (sender placement, watchers, dedupe, the notification set).

One source warning carried from the notes: `web/README.md` is stale — "Static Next.js app, no
backend, no database, no auth" (`web/README.md:5-6`) and "No environment variables, no serverless
functions" (`web/README.md:26`) — while the repo actually has Node route handlers with
`DISPATCH_SECRET` and B2 credentials (ADR 0017:20-22; `web/lib/auth.ts:11-40`; `web/lib/b2.ts:16-20`)
and the root README documents Vercel envs (`README.md:125-126`). All planner facts below cite the
routes and ADRs, not that README.

**What this settles for the sibling decisions.** For #233 (do we pay for store accounts?): every
route that reaches iOS at zero spend needs **no** vendor account, and the only paid route in this
document is a native iOS build — the Apple Developer Program at 99 USD per membership year. Web
Push on an installed iOS web app needs no Apple Developer Program membership (WebKit blog 13878,
read 2026-09-27). For #234 (which architecture?): Web Push from the installed PWA is the only
zero-spend push that appears from this product on iOS (delivery unproven on device until the §c
field test passes); the relay fallback removes the install
requirement at the price of a notification in another app
(`.autoforge/inputs/mobile-stack.md:138-141`).

## How the ten open questions from discovery are answered

| # | Discovery unknown (`.autoforge/discovery/report.md` §4) | Where answered |
|---|---|---|
| 1 | Sender host choice (planner / host / watcher / split) | Direct answer (a); Verdict table |
| 2 | VAPID key handling | Direct answer (b); Per-route — Web Push |
| 3 | Subscription registry | Implementation notes — Subscription registry |
| 4 | iOS installed-app limits in practice | Direct answer (c) |
| 5 | Zero-spend fallback when Web Push is not delivered | Direct answer (d); Per-route — ntfy / Telegram / email |
| 6 | Host outbound internet | Direct answer (a); Could not verify |
| 7 | Whether a store watcher is even free | Verdict table; Per-route — The B2 store as a trigger |
| 8 | Duplicate / idempotent delivery | Implementation notes — Dedupe and last-seen |
| 9 | Which transitions deserve a notification | Implementation notes — Which transitions notify |
| 10 | Push copy in the glossary's words | Implementation notes — the copy |

---

## Verdict table

One operator, one phone (iPhone), a handful of state changes a day. "What must run" is split
planner (Next.js route handlers on Vercel, region `yyz1`,
`web/app/api/missions/dispatch/route.ts:27-28`) versus host (the Linux machine where Missions are
generated and the Load runs, `docs/adr/0016-mission-generation-and-loading-for-the-rc2.md:66-68`).
Every route states its cost, its limits, and what the planner or host must run.

| Route | Cost | Limits that matter | What must run (planner / host / operator) | Zero-spend verdict |
|---|---|---|---|---|
| **Web Push, sender on planner (Vercel)** | $0 — no vendor account; push services (FCM/APNs/Mozilla autopush/WNS) are free to use; the VAPID key pair is generated, not purchased | iOS 16.4+ with the web app installed to the Home Screen; permission after a direct user gesture; no silent pushes (Safari revokes permission); payload accepted ≥4,096 bytes; 404/410 prunes the subscription; APNs stores an undelivered message up to its TTL (≤30 days); `web-push` needs Node ≥16 | Planner: a route serving the VAPID **public** key, a passphrase-gated route accepting the browser's subscription, sender code plus the `web-push` dependency, VAPID private key in Vercel env (beside `DISPATCH_SECRET`). Host: nothing. Operator: install the PWA, tap to enable notifications. Client prerequisites for this route do not exist in the repo at this commit — no PWA manifest (stable `id`), no service worker with a `push` handler (`web/app/layout.tsx` exports only metadata; `web/public` holds only `hero/`; `rg serviceWorker web` is empty) — so building them is a prerequisite of this route, tracked separately | **YES** — but covers only the transitions the planner writes (rows 1–8, 14 of the discovery inventory); it cannot see Collected or Loaded (delivery unproven on device until the §c field test passes) |
| **Web Push, sender on host (Linux)** | $0 for the service; the host's stdlib-only property changes (new Python dependencies) | Same iOS/browser limits as above; `pywebpush` pulls 5 direct dependencies (`aiohttp`, `cryptography`, `http-ece`, `requests`, `py-vapid`); the host's scripts are stdlib-only today (ADR 0016:487-493 relies on it) | Host: a send step after `collect.py` / `load.py` writes the report, the VAPID private key in `~/.config/wayfinder/*.env` (mode 600), a registry read. Planner: nothing extra | **YES** — covers the states only the host sees (9–12); the **split** (both senders, one key pair, one registry) is the recommended coverage story (delivery unproven on device until the §c field test passes) |
| **Store watcher as sender (B2 Event Notifications / Vercel Cron / GitHub Actions)** | B2 Event Notifications free at our volume (Class D, first 2,500/day) but **support-gated**; Vercel Cron Hobby included but minimum **once per day**; GitHub Actions 5-minute schedule ≥288 runs/day ≈ 8,640 billed minutes/month — over the private-repo free allowance (2,000–3,000) | Vercel Hobby: min 1/day, ±59 min precision; GitHub: shortest interval 5 min; B2 events: webhook only, 3-second timeout, at-least-once delivery, payload carries no object contents | Whichever service runs, plus a receiver route that answers 200 within 3 s, verifies HMAC, dedupes by `eventId` and semantic key | **NO** — no watcher is both free and timely; the writers already run at the moment of change, so a watcher adds latency and duplicate derivation for nothing |
| **APNs direct (native iOS)** | Apple Developer Program **99 USD per membership year**; APNs itself charges nothing per notification | Payload 4 KB (5 KB VoIP); no published send quota (FCM notes APNs limits exist); token-based auth: ES256 JWT, `.p8` key, `kid`/`iss` claims, JWT exp ≤1 day, don't refresh more than once per hour | App: native build + APNs key created in the Apple Member Center (Account Holder/Admin role). Sender: provider server, HTTP/2 + TLS 1.2 POST to APNs | **NO** — the account is the wall; breaks `PRODUCT.md:48` |
| **FCM (native Android)** | FCM is "No-cost" on the free Spark plan; no billing account required | 600k messages/minute per project default; 429 above; 240/min and 5,000/hour per Android device; collapsible burst 20 with 1 per 3 minutes refill; payload 4,096 bytes | App: FCM SDK + a Firebase project + Google Play services on the device. Sender: app server or Cloud Function using the Admin SDK or the FCM v1 API with a service-account JSON | **YES for the Android half** — an APK sideloads with no store fee; it serves no iOS need |
| **Expo push service** | Service free ("no cost associated"); **iOS credentials need the paid Apple account** | 600 notifications/second/project; no SLA; SDK 53+ Expo Go does not support push at all — a development build is required | Sender: HTTPS POST to `exp.host/--/api/v2/push/send` or a server SDK; Android needs FCM v1 credentials; iOS needs the APNs key | **NO on iOS; YES Android-only** — same Apple wall, second toolchain |
| **Capacitor** | Same as Expo/FCM; iOS needs the paid Apple account | FCM/APNs limits per the rows above | In-app plugin + a Firebase project + a native project per platform | **NO on iOS; YES Android-only** — the wrapper does not escape the APNs account |
| **ntfy.sh public** | $0; no sign-up; topic created on first publish | 250 messages/day per visitor; 60-request burst then 1 refill per 5 s; 4,096-byte messages; 30 open subscriptions; 200 MB/day bandwidth; topic names are not reserved and the topic is the only secret | Sender: one HTTPS POST to `https://ntfy.sh/<topic>` from the planner route or the host cron. Operator: the free ntfy iOS app, subscribed to one random topic. No account, no developer program | **YES** — the recorded fallback; it reaches iOS through ntfy's own APNs path without the PWA being installed |
| **ntfy self-hosted** | $0 incremental on the existing Linux host | Same knobs as ntfy.sh, configurable; **iOS instant delivery requires `upstream-base-url: https://ntfy.sh`** — without it delivery "can take hours" (20–30 minutes in active use); the phone must reach the self-hosted server over HTTPS | Host: the ntfy server (Go binary/Docker) plus TLS/reverse proxy. Sender: one POST. Operator: ntfy app pointed at the server | **YES cost-wise, more moving parts** — choose it only if the topic must leave ntfy.sh's logs |
| **Telegram bot** | $0 | 1 message/second per chat (short bursts, then 429); ~30 messages/second bulk; paid broadcasts only beyond that | Sender: one HTTPS POST to `api.telegram.org/bot<token>/sendMessage` with `chat_id` + `text`. Operator: Telegram app + a bot created in `@BotFather` + the operator must message the bot first | **YES** — the strongest non-ntfy alternative; costs a third-party account and a second app |
| **Email (Gmail SMTP)** | $0 on an existing Gmail account | 500 recipients/day and ~500 emails/day on consumer Gmail, then blocked 1–24 h; app password is 16 digits and needs 2-Step Verification; `smtp.gmail.com` ports 465/587 | Host: `smtplib` (stdlib, no new dependency) + one app password in the mode-600 env. Planner-side SMTP is **unverified**. Operator: nothing new | **YES, but it is an inbox entry, not a notification** — an audit trail beside a push route |
| **Email (Resend free)** | $0 tier | 3,000 emails/month, 100/day, 3 custom domains; needs a **verified sending domain** | Sender: one HTTPS POST with an API key. Domain decision is ticket **#246** (open; not planned here) | **YES once a domain exists** — out of scope for this run |
| **Gotify** | $0 self-hosted | Server binary/Docker + REST API; official clients are **Android and CLI only** | Server on the host; iOS only through the third-party *iGotify* listing (free + in-app purchase) | **NO for an iPhone** — no official client; recorded and dropped |
| **UnifiedPush** | $0 | Depends on the distributor/server; distributors are Android and Linux only | Distributor app on the phone plus a push server (ntfy can serve) | **NO** — the project's FAQ says iOS is not possible "for the foreseeable future" |

---

## Direct answers to the four owner-comment foci

### (a) What sends the push when a Mission changes state

**The answer is a split, not a single process.** The planner's Vercel routes send for the
transitions the planner writes; the Linux host's `collect.py` / `load.py` runs send for the
transitions the host writes. Each writer is alive at the exact moment its own transitions happen,
so **no store watcher is needed for correctness** — and no watcher is even affordable at the
cadence one would need (see the verdict table row and "The B2 store as a trigger" below).

Why a split is forced, in one paragraph: no existing process sees every transition. The planner
holds the only B2 credentials on the Vercel side and is gated by the Wayfinder passphrase
(`web/lib/auth.ts:11-40`; ADR 0017:20-22); the host holds its own scoped keys in
`~/.config/wayfinder/` (README.md:116-124); the browser holds none; the host is unreachable from
the planner — "residential NAT, Tailscale only" (ADR 0019:3-6). The host writes only the status
objects (manifest, Ledger, skip list); the planner writes only the Mission records and the Specs.
Planner transitions are request/response — the Vercel function is alive at the change. Host transitions
are cron runs that already make outbound HTTPS to B2 (`scripts/mission/b2.py:63,85`). A sender at
each writer therefore covers every transition by construction, with zero extra processes and zero
extra polling (`.autoforge/discovery/report.md` §1 ordering note).

The planner cannot reach the host, and does not need to: a push is outbound from the sender to the
push service — RFC 8030's model is user agent → push service → application server, and delivery is
an HTTP POST from the application server to the push resource (RFC 8030 §2, §5, read 2026-09-27).
Residential NAT blocks inbound connections only, so it does not block sending — **INFERRED** (no
page read states the NAT consequence itself).

Per-transition coverage, with the notification decision (transition numbers from the discovery
report §1; the notification set is justified in Implementation notes):

| # | Transition | Sender | Notification |
|---|---|---|---|
| 1 | → Planned (new Mission) | planner route `POST /api/missions` | no — own action |
| 2 | Planned → Planned (edit) | planner route | no — own action |
| 3 | Planned (fork) | planner route | no — own action |
| 4 | Planned → Dispatched | planner route `POST /api/missions/dispatch` | no — own action |
| 5 | → Superseded | planner route (the replacement Dispatch writes `supersedes`) | **yes — Card release** |
| 6 | → Withdrawn | planner route `POST /api/missions/withdraw` | **yes — Card release** |
| 7 | Loaded → Flown (operator's mark) | planner route `POST /api/missions/flown` | no — own action |
| 8 | Flown → Loaded (unmark) | planner route | no — own action |
| 9 | Dispatched → Collected | host `collect.py report_collected` | no — nothing to act on; Loaded follows |
| 10 | Collected → Loaded | host `load.py report_loaded` | **yes — the actionable one** ("which Card do I open?", ADR 0021:79-82) |
| 11 | Card pool published | host `load.py publish_pool` | no — not a Mission state |
| 12 | Refusal / overflow / drift (`_notice`, `_drift`) | host `load.py report_refusal`, `report_overflow`, `report_drift` | **yes — action required** |
| 13 | Imagery arrival → Flown inference | **no writer exists** (`imagery_at` is read, written nowhere — discovery §1 row 13) | **prompt only**, when that writer is built; never announce Flown |
| 14 | Remove (archive) | planner route `DELETE /api/missions` | no — own action |
| 15 | (read) every state shown in the planner | planner `GET`, browser 5-minute poll | n/a |

**Why not a watcher.** All three candidate mechanisms were checked against current primary docs on
2026-09-27: Vercel Cron on the Hobby tier runs at minimum once per day ("Cron expressions that
would run more frequently will fail during deployment"); a GitHub Actions scheduled workflow on
this private repo cannot fit its free minutes (5-minute minimum → ~8,640 billed minutes/month vs
2,000–3,000 free); B2 Event Notifications would be free at our volume (Class D, first 2,500/day)
but are **support-gated** ("contact the Support team to request access"), carry at-least-once
delivery and a 3-second webhook timeout, and require a receiver that downloads the changed object
and derives the transition itself. As an adjunct for desk changes reaching a phone that missed
them, B2 Event Notifications → a planner route is the one design worth revisiting later, with the
conditions listed in "The B2 store as a trigger". Sources: Vercel *Usage & Pricing for Cron Jobs*
(updated 2026-07-15); GitHub *Events that trigger workflows — `schedule`*, *Actions runner
pricing*, *GitHub Actions billing*; Backblaze *Event Notifications Reference Guide* and
*transaction pricing* — all read 2026-09-27.

**What each sender needs.** Both need the same two things: the subscription registry
(Implementation notes) and the VAPID keys (direct answer b). The planner already holds a store key
that covers `specs/` (ADR 0017:20-22); the host's status key covers `read specs/`, `write specs/`
(ADR 0019:37-40). Sending is bookkeeping, like the reports: the operation must never depend on it
(ADR 0019:41-42), and a failure must not be silent (`PRODUCT.md:66`) — direct answer (d).

**Host outbound internet (discovery unknown 6).** Proven: `collect.py` and `load.py` reach the B2
API over outbound HTTPS with `urllib` (`scripts/mission/b2.py:23` for authorize, `:63-82` for
download, `:85-149` for upload; used by `collect.py:126-144`, `load.py:1296-1316`). A notification
POST from the same process is therefore **INFERRED** feasible; there is no push client in
`scripts/` today. The future mobile board "needs internet access for Collecting, from a phone
hotspot or site Wi-Fi" (ADR 0016:487-493). **At a Site with no signal there is no sender at all**
— and, per current code, the Load/Collect that happened there is never reported later either: a
Load whose `report_loaded` fails is still in the local `LOADED` record (`load.py:1019-1020`,
written before the report at `1025-1026`), so the next run's `unloaded_queue` excludes it
(`load.py:78-87`, early return at `971-973`) and the manifest never learns it was Loaded;
`collect.py` has the same shape (record saved at `236-239`, report at `242-243`, next run returns
at `223-225`). If Loaded-while-offline matters, the design must persist unreported transitions
locally and replay them on the next online run — a gap to decide, not just a limitation to note.

### (b) VAPID key handling

**What the key is, and how it is generated.** A VAPID key pair is an **ECDSA P-256 signing key
pair**; the JWT signature MUST be ES256 and the public key is carried in uncompressed X9.62 form,
base64url (RFC 8292 §2, §3.2, https://www.rfc-editor.org/rfc/rfc8292.txt, read 2026-09-27). The
same public half is what the browser embeds at subscribe time (RFC 8292 §4.1).

- **web-push CLI (Node):** `web-push generate-vapid-keys [--json]` prints `publicKey` and
  `privateKey`; the README says "You should create these keys once, store them and use them for all
  future messages you send" (web-push README, primary, https://github.com/web-push-libs/web-push,
  read 2026-09-27).
- **py-vapid (Python):** `bin/vapid --gen` writes `public_key.pem` and `private_key.pem` and
  overwrites any existing pair; `bin/vapid --applicationServerKey` prints the value for
  `PushManager.subscribe`, and it "is tied to the generated public/private key" (py-vapid Python
  README, primary, https://github.com/web-push-libs/vapid/blob/master/python/README.md, read
  2026-09-27).
- **openssl + manual:** pywebpush accepts a path to a VAPID EC2 PEM file, a base64-encoded DER
  string, or an OpenSSL-exported key (pywebpush README, primary,
  https://github.com/web-push-libs/pywebpush, read 2026-09-27). No step-by-step openssl recipe was
  read from a primary source; use the CLIs (see "Could not verify").
- The public key reaches the browser as the `applicationServerKey` of `pushManager.subscribe`, as a
  Base64 string or ArrayBuffer (MDN,
  https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe, read 2026-09-27). Chrome
  and Edge reject the promise unless `userVisibleOnly: true` (same source).

**Where the private key lives, and what each choice forces.**

| Placement | Precedent | What it forces |
|---|---|---|
| **Vercel env**, beside `DISPATCH_SECRET` | `DISPATCH_SECRET`, `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET` are Vercel envs (`README.md:125-126`; `web/lib/b2.ts:16-20`); keys are `vercel env pull`-able for local dev (same lines) | The planner can sign and send; the key is visible to anyone with project access and is duplicated in local `.env` pulls; rotation means editing envs and redeploying. The host does not need it unless the host also sends |
| **Linux host `~/.config/wayfinder/*.env`, mode 600** | Existing credential store: `b2-write`, `b2-read`, `b2-delivery`, `dispatch`, created by prompting, "keys never touch shell history" (`README.md:116-124`); rotation pattern: "mint the replacement … overwrite the one file that holds it … delete the old key" (ADR 0019:48-55) | The key never leaves the host; only the host can send. The browser still needs the **public** key — served by the planner from a route or a build-time constant; either is fine because it is public |

With the split, **the key pair is duplicated across both stores and rotation is a two-place
operation**. Nothing in the repo today holds a VAPID key (discovery report §4 unknown 2; no
`vapid`/`web-push` dependency in `web/package.json`). One key is enough for both senders only
because the VAPID key identifies the *application server*, not a deployment: any process with the
private half can sign for subscriptions created with the public half (RFC 8292 §2, §4.2). So the
same pair works from Vercel and from the host.

**Rotation: existing subscriptions do not survive a key change.** This is settled by the RFC. A
push subscription created with `applicationServerKey = K` is restricted to servers holding K's
private half; `vapid` authentication is invalid — the push service may answer 403 — if "the public
key used to sign the JWT doesn't match the one that was included in the creation of the push
message subscription" (RFC 8292 §4.2). The RFC's own consequence: "An application server that
needs to replace its signing key needs to request the creation of a new subscription by the user
agent that is restricted to the updated key. Application servers need to remember the key that was
used when requesting the creation of a subscription." (RFC 8292 §4.2.)

Vendor corroboration: APNs reports `VapidPkHashMismatch` — "The VAPID public key from the push
subscription doesn't match the VAPID public key in the request" (Apple, *Sending web push
notifications in web apps and browsers*, primary, read 2026-09-27). On Chrome/FCM the same mismatch
surfaces as `UnauthorizedRegistration` or a 404 (web.dev, *Common issues and reporting bugs*, read
2026-09-27).

There is no server-side rebinding; the browser must create a new subscription. The re-subscribe
flow:

1. On app start (after permission is `granted`), `pushManager.getSubscription()`.
2. Compare `subscription.options.applicationServerKey` to the current public key; if different,
   `unsubscribe()` and `subscribe()` with the new key, then POST the new subscription to the
   registry. (Community-documented recipe — W3C push-api issue #291 and Stack Overflow, labelled
   community, read 2026-09-27 — but it follows directly from the RFC's binding.)
3. Mark the old endpoint `gone` in the registry (never delete); never send to it again.

**Re-prompt caveat.** On iOS the original permission must come from a direct user interaction
(WebKit blog 13878, primary, read 2026-09-27); whether an *already granted* web app can silently
unsubscribe/re-subscribe without a fresh gesture was not verified on device — if `subscribe()`
fails outside a gesture, the app must show an "Enable notifications again" button. **INFERRED**
until field-tested (direct answer c).

**Operational note.** With one operator and one phone, a VAPID rotation is not routine; the only
triggers are key compromise or a leak. The repo's key-rotation principle applies unchanged — "mint
the replacement … delete the old key" (ADR 0019:48-55) — plus the re-subscribe step above, which
the B2 keys never needed.

### (c) iOS installed-app limits in practice

Platform: the operator's phone is an iPhone (`PRODUCT.md:16-19`), so Safari/WebKit is the only
relevant engine on it. "In practice" means vendor statements and field reports are separated, and
whatever only a physical device can settle gets a named field test instead of an assertion.

**Vendor statements (what Apple/WebKit promise).**

- Support exists **only for Home Screen web apps** on iOS/iPadOS 16.4+; the app must have been
  added to the Home Screen (WebKit blog 13878; Apple docs, both read 2026-09-27). A web app in a
  Safari tab cannot subscribe on iPhone/iPad.
- The permission request must follow "direct user interaction — such as tapping on a 'subscribe'
  button"; "Once allowed, the user can manage those permissions per web app in Notifications
  Settings — just like any other app" (WebKit blog 13878).
- Notifications "show on the Lock Screen, in Notification Center, and on a paired Apple Watch",
  and integrate with Focus (WebKit blog 13878).
- The push service is APNs; no Apple Developer Program needed; allow `*.push.apple.com` egress
  (WebKit blog 13878; Apple docs).
- APNs stores an undeliverable notification for up to the `TTL` (≤30 days) and "attempts to deliver
  the notification the next time the device activates and is available online" (Apple docs). That
  is the vendor statement that **closed-app delivery is intended to work**: the push wakes the
  service worker, which runs the `push` handler (WebKit blog 13878 describes background push
  handling for badges).
- **Silent push is not allowed.** "Safari doesn't support invisible push notifications. Present
  push notifications to the user immediately after your service worker receives them. If you
  don't, Safari revokes the push notification permission for your site." (Apple docs; MDN requires
  `userVisibleOnly` in Chrome/Edge.)
- APNs error table (Apple docs): `VapidPkHashMismatch` (key rotation), `BadTtl`, `BadUrgency`,
  `BadWebPushTopic`, `PayloadTooLarge` (4 KB), `TooManyRequests`, 410 "The device token has
  expired", and JWT rules (subject a URL or `mailto:`, audience the push origin, exp ≤ one day;
  "Don't refresh your JWT more frequently than once per hour").
- Manifest `id` is part of the web app's identity for Focus sync across devices; the same site can
  be installed multiple times with different names (WebKit blog 13878) — so the manifest `id` must
  stay stable.

**Observed behaviour (field reports, labelled — not measured here).**

- `notificationclick` has a history of not firing depending on **how the app was opened**: after
  manually opening the app from the Home Screen, subsequent notification taps did not fire the
  handler; after the app was launched *by* a notification, taps worked (firebase-js-sdk issue
  #7309, community reports, read 2026-09-27).
- Notification **actions** are not displayed on iOS; tapping the body opens the app (Stack Overflow
  citing MDN compat data, labelled community, read 2026-09-27). Treat as **INFERRED** until
  measured; design the notification so the tap alone suffices (no action buttons).
- The tap may open the app at its start URL rather than deep-linked (early reports in the same
  thread), so the copy should name the Mission and the app should resume on the Missions list; do
  not depend on a fragment/route surviving.

**Subscription persistence.**

- **App updates (deploys):** no primary source states that a service-worker update invalidates a
  push subscription; the subscription lives with the push service and the browser's registration,
  not with cached assets. **INFERRED as preserved**, cheap to test (field test step 5).
- **Reinstall / delete from Home Screen:** not verified. Deleting a Home Screen web app removes its
  website data with it (the iOS model), which would remove the subscription and its storage; if
  true, reinstall = re-subscribe (same flow as above). This is the single most likely cause of
  "push stopped working", and why the registry keeps `gone_at` tombstones and the app re-registers
  on every start.
- **Device storage pressure** evicting website data (and with it the subscription) was flagged as
  unverified in the stack input (`.autoforge/inputs/mobile-stack.md:362`) and remains unverified.
- Permission denied → the Settings app path is the only way back (WebKit blog 13878). Whether an
  in-app re-prompt can ever be shown again after `denied` is unverified; the UI should detect
  `Notification.permission === "denied"` and point at Settings rather than re-call
  `requestPermission` into the void. **INFERRED**.
- Focus modes: notifications for Home Screen web apps integrate with Focus (WebKit blog 13878); a
  Focus that silences the web app will silence these pushes, and Focus syncing keys off the
  manifest `id` + app name. Delivery while Focus is active is not something the sender can observe.

**The named field test (to settle the device-only questions).** Run once on the operator's iPhone,
each step recorded with the time:

1. Install the PWA (Share → Add to Home Screen), open it from the icon, tap "Enable
   notifications"; record `Notification.permission`.
2. Fully close the app (App Switcher → swipe up). From the host, force a Loaded state; record
   whether a notification appears on the Lock Screen and its latency.
3. Tap the notification; record whether the app opens and lands on the Missions list with the
   right row.
4. Without tapping, open the app from the Home Screen, close it, trigger another event, and tap;
   record `notificationclick` firing (the reported bug case).
5. Deploy a new build; repeat step 2; record delivery.
6. Delete the app from the Home Screen, reinstall, reopen; record whether the app detects no
   subscription and re-registers under the same or a new endpoint.

**Verdict on iOS Web Push for this product: usable in practice, conditionally** — provided (a) the
operator installs the PWA to the Home Screen and enables notifications from a tap, (b) the app
always shows a visible notification per push, (c) the app self-heals the subscription on every
launch, and (d) the field test above passes. The vendor statements are unambiguous; the risk is
not support but *reliability quirks* in tap and background handling. What would falsify the
verdict: step 2 failing to deliver a notification on two separate days, or step 4 failing
consistently, or step 6 losing the subscription with no self-heal — any of these makes Web Push
the wrong primary and the zero-spend fallback (direct answer d) takes over.

### (d) How Web Push fails, and the zero-spend fallback when it is not delivered

**Rule zero: a failed send never fails the operation, and never stays silent.** A report "is
bookkeeping, never the operation: without status credentials Collect and Load still succeed and
say so loudly" (ADR 0019:41-42; `scripts/mission/collect.py:126-132`;
`scripts/mission/load.py:1296-1301`). A push is in the same class: the store write happens first,
the push attempt happens after, and its outcome is recorded separately. `PRODUCT.md:66` is
binding: "No silent failure. Every refusal says what happened and what to do next."

What the sender can detect on the Web Push path (RFC 8030; Apple docs; web.dev status table, read
2026-09-27):

- **Success is not delivery.** "A 201 (Created) response indicates that the push message was
  accepted… This does not indicate that the message was delivered to the user agent." (RFC 8030
  §5.) The sender must never tell the operator "seen"; at most "sent".
- **404 / 410 — the subscription is gone.** RFC 8030 §7.3 requires 404 for an expired subscription;
  web.dev: 404 "delete the PushSubscription from your back end and wait for an opportunity to
  resubscribe", 410 is reproduced by `unsubscribe()`; Apple: 410 = "The device token has expired".
  Here: mark `gone_at`, never delete, and surface "Notifications are off for this phone. Enable
  them again to get Loaded notices." at the next planner interaction.
- **429 — rate limited** (Retry-After indicates when); do not hammer; the next state change is the
  natural retry.
- **5xx — the next event is the retry.** The push service itself retries within TTL ("The push
  service SHOULD continue to retry delivery … until its advertised expiration", RFC 8030 §6.2).
  No immediate retry loop.
- **TTL and Urgency.** `TTL` is mandatory (RFC 8030 §5.2; a push service MUST 400 without it). For
  Mission state use a short TTL (minutes to an hour, e.g. 3600) so a stale "Loaded" never surfaces
  after the operator has handled it. `Urgency` defaults to `normal` (RFC 8030 §5.3); Loaded is the
  actionable one and may use `high`; everything else `normal`.
- **Topic coalescing.** Give each Mission's notifications a `Topic` (≤32 URL-safe chars, e.g. a
  hash of the Mission id) so a newer state replaces an older undelivered one (RFC 8030 §5.4). This
  prevents "Dispatched" arriving after "Loaded".
- **Payload limit.** Push services must accept ≥4096 bytes; larger may 413 (RFC 8030 §7.2). The
  notifications here are tens of bytes of JSON.
- **The iOS-specific failure:** a push that arrives but never displays a notification gets the site
  **de-permissioned** by Safari (Apple docs), so the service worker's `push` handler must call
  `showNotification` unconditionally and report its own failures.

**What the operator sees when a send fails.**

- *Planner-sent:* route handlers are request/response; include the push outcome in the existing
  notice surface ("UI-8: notice — report action results in a pop-up at the top", `d71ba64`), e.g.
  "The last notification was not sent. Open the app to see what changed." — in the glossary's
  words, never a raw status code (`PRODUCT.md:66-68`).
- *Host-sent:* the host already has a store channel for exactly this — the manifest `_notice`
  written by `load.py report_refusal` / `report_overflow` (`load.py:1244-1293`) — or a sibling
  `last_error` field in the sender's own last-seen object, read by the planner. Either way the next
  planner read shows it; nothing is swallowed.

**The fallback, in order.**

1. **ntfy.sh public — first fallback.** Zero cost, no account, nothing new to run: one HTTPS POST
   to `https://ntfy.sh/<topic>` from the same process that would have sent the push. The operator
   installs the free ntfy iOS app and subscribes to one random, hard-to-guess topic ("the topic is
   essentially a password", ntfy docs, read 2026-09-27). It does not depend on the PWA being
   installed, on a permission granted in a gesture, or on the service worker lifecycle — the three
   places iOS Web Push is fragile — and it reaches iOS instantly through ntfy's own
   Firebase/APNs path with no Apple account. Limits: 250 messages/day (vs a volume of roughly
   6–10), 60-request burst then 1 per 5 s, 4,096-byte messages. Caveats: ntfy.sh is a single
   best-effort droplet with no SLA, log entries contain topic names, and the iOS app's own author
   calls it "very bare bones and quite frankly a little buggy" (ntfy FAQ, read 2026-09-27). A
   random 30-plus-character topic is the mitigation for the logs.
2. **Telegram bot — second fallback.** Free Bot API; one HTTPS POST to
   `api.telegram.org/bot<token>/sendMessage` with `chat_id` and `text`; the strongest operational
   infrastructure of the set. Requires a third-party account and two one-time operator actions:
   create the bot in `@BotFather` and **message the bot first** ("Bots can't start conversations
   with users"). Limits: 1 message/second per chat, ~30/second bulk; failures answer 429 with
   `retry_after` or an error body.
3. **Email — the audit trail, not the alert.** Gmail SMTP from the host's stdlib `smtplib` with a
   16-digit app password (needs 2-Step Verification) needs no new dependency; the message lands in
   Gmail, already on the phone. But it is an inbox entry: spam classification, quiet-hours batching
   and latency are outside the sender's control, and Google discourages app passwords. Use it
   beside a push route, never as the alert itself. Resend's free tier (3,000 emails/month, 100/day)
   is blocked on a verified sending domain — ticket #246, open, not planned here.

**At a Site with no signal, no sender exists** — the phone and the host are both offline then. The
store still changes and the planner's 5-minute foreground poll plus visibility refresh
(`web/components/MissionList.tsx:202-219`) is the catch-up path. ntfy caches messages by default
for 12 h (whether ntfy.sh uses that default is not published — **INFERRED**), and Telegram and
email queue server-side, so all three degrade to "arrives when the network returns" provided the
sender had a network at send time.

---

## Per-route detail

### Web Push from the installed PWA

**What it is.** The browser creates a `PushSubscription` (endpoint + `p256dh`/`auth` keys) inside
the installed web app; the sender POSTs an encrypted, VAPID-signed message to whatever `endpoint`
the browser returned (RFC 8030 §5; RFC 8291 framing). The sender does not choose the push service;
the browser fixes it. Delivery is an outbound HTTPS POST from the planner route or the host cron —
no inbound path to either is needed (direct answer a; RFC 8030 §2, §5, read 2026-09-27).

**Push services per platform, cost and account.** A sender POSTs to the endpoint the browser
returned (RFC 8030 §5); the service is fixed by the browser:

| Browser / platform | Push service | Endpoint origin (as seen in practice) | Account / cost |
|---|---|---|---|
| Chrome, Android (and desktop Chromium) | **FCM**: "For Chrome, Firebase Cloud Messaging is the Push service. Any messages being pushed to a Chrome user will be routed through it." (Chrome for Developers, *Use Web Push*, published 2024-02-05, read 2026-09-27) | `https://fcm.googleapis.com/fcm/send/…` (web-push README example, read 2026-09-27) | **None for standard Web Push**: the documented flow provisions only VAPID keys and uses `web-push` as the sender (web.dev, *Sending messages with web push libraries*, read 2026-09-27). The `gcm_sender_id`/GCM API key is legacy (Chrome ≤51) |
| Safari, iOS/iPadOS Home Screen web app, and Safari on macOS | **APNs**: "Web Push on iOS and iPadOS uses the same Apple Push Notification service that powers native push on all Apple devices." (WebKit blog 13878, read 2026-09-27) | `https://*.push.apple.com` — allowlist this if the network filters egress | **No Apple Developer Program membership** ("You do not need to be a member of the Apple Developer Program to use it", WebKit blog 13878). Cost: zero |
| Firefox | **Mozilla autopush**: "This is the fourth generation of the Mozilla Web Push server" (autopush-rs README, primary, https://github.com/mozilla-services/autopush-rs, read 2026-09-27); default push server `wss://push.services.mozilla.com/` | Firefox endpoints are Mozilla push endpoints; error bodies reference autopush (web.dev error example, read 2026-09-27) | **No account and no fee documented**; the sender needs only the endpoint plus VAPID. The exact endpoint hostname (`updates.push.services.mozilla.com`) was not read from a primary page — **INFERRED** |
| Edge (desktop Windows/macOS) | **WNS**: "Microsoft Edge uses its built-in WNS push client to connect to the Windows Push Notification Service" (Microsoft Learn, *ForceBuiltInPushMessagingClient*, primary, read 2026-09-27); endpoints `https://wns2-*.notify.windows.com/w/` (community report, labelled) | WNS channel URIs (`notify.windows.com`) | No Microsoft account appeared anywhere in the browser-facing flow; the WNS auth flow read is for native UWP apps. **INFERRED** that browser Web Push needs no account |
| Opera / Samsung Internet | GCM-era paths in the web-push README compatibility table (no VAPID row for Opera desktop) | — | Not relevant: the operator's devices are an iPhone and a MacBook (`PRODUCT.md:16-19`) |

Conclusion: **all four services are free and none requires a developer account for the standard
VAPID flow.** The paywalls that exist (Apple Developer Program, Firebase project features) belong
to native/proprietary push, not to this path.

**Sender libraries.**

- **Node `web-push` (the Vercel side):** version **3.6.7**, last npm publish **2024-01-16** (npm
  registry, read 2026-09-27); the repository is not dormant — `pushed_at` 2026-09-21, not
  archived, 3.5k stars (GitHub API `repos/web-push-libs/web-push`, read 2026-09-27). It performs
  VAPID headers and RFC 8291 payload encryption and exposes `TTL`, `Urgency`, `Topic`, returning a
  `statusCode`; its default `TTL` is four weeks, so a short TTL should be set deliberately. It
  needs Node ≥16; the Vercel functions are Node (`export const runtime = "nodejs"`), so no runtime
  conflict.
- **Python `pywebpush` (the host side if it sends):** five direct dependencies (`aiohttp`,
  `cryptography (>=47.0.0)`, `http-ece (>=1.1.0)`, `requests (>=2.21.0)`, `py-vapid (>=1.7.0)`,
  PyPI, read 2026-09-27) plus transitive deps; repository alive, `pushed_at` 2026-09-01. **This
  would be the host's first third-party Python dependency** — every import in
  `scripts/mission/*.py` is stdlib today (`rg -N '^(import|from) ' scripts/mission/*.py`, run
  2026-09-27), and ADR 0016 relies on that ("is stdlib Python over `jmtpfs`, so it runs there
  unchanged", ADR 0016:487-493). The lighter middle path is `py-vapid` + `http-ece` (still brings
  `cryptography`) and POST with stdlib `urllib.request`, the way `scripts/mission/b2.py` already
  does — still ≥3 added distributions, one native.
- **Hand-rolled VAPID JWT + RFC 8291 encryption vs the dependency:** Python stdlib cannot do it
  (no ECDSA/ECDH, no AES-GCM; hand-rolling is writing crypto primitives — unacceptable). Node
  stdlib could (`node:crypto` has P-256 ECDH/sign, HKDF, AES-GCM), but it is a page of subtle
  RFC-conformant code, and Google's own guidance is "I strongly recommend using a library to
  handle the encryption, formatting and triggering of your push message" (web.dev, read
  2026-09-27). **Recommendation: take the libraries on both sides; on the host, record the
  dependency addition as an explicit amendment to ADR 0016's stdlib assumption.** Payload-less
  pushes would avoid RFC 8291, but the payload is needed for the notification text and to
  deep-link the tap, and Safari must always display a visible notification anyway (Apple docs,
  read 2026-09-27).

**The subscription registry** is designed in Implementation notes; the browser never holds a store
credential (ADR 0016:232-235), so the browser POSTs its subscription to a passphrase-gated planner
route.

**Division of labour: what each side runs.**

| Job | Planner (Vercel Node) | Linux host | Notes |
|---|---|---|---|
| Generate VAPID pair (once) | either side; do it offline and store | either side | `web-push generate-vapid-keys` or `vapid --gen`. Public key → client; private key → whichever senders exist |
| Serve the public key to the browser | yes (route or constant) | no | `applicationServerKey` on `pushManager.subscribe` |
| Accept a subscription POST | yes — passphrase-gated route, writes the registry with the existing B2 key pair | no | Browser never holds a store credential (ADR 0016:232-235) |
| Registry read for a send | yes (one known-key download) | yes (same) | Avoid `listFiles`; Class C cost (Implementation notes) |
| Send on Planned/Dispatched/Withdrawn/Flown/Superseded/archive | yes — the routes know the moment | no | Needs the VAPID private key in Vercel env |
| Send on Collected/Loaded/refusal/drift | no — cannot observe them | yes — `collect.py` / `load.py` after the report write | Needs the VAPID private key in `~/.config/wayfinder/` (mode 600) and Python deps |
| Mark `gone` on 404/410 | yes (its own sends) | yes (its own sends, under a documented amendment) | Second writer of the registry file; document the amendment to ADR 0019:39-40. If one writer is preferred, the host reports the failure in the manifest and the planner marks the registry |
| Write `missions.json` | **never** (read-only, ADR 0019:16-21) | yes, unchanged | A subscriptions file must not touch it |
| Push-failure visibility | route response / notice surface (`PRODUCT.md:66`) | manifest `_notice` or the sender's own `last_error` | Never silent; never fails the store write |
| If not delivered | foreground 5-minute poll + visibility refresh already exists (`web/components/MissionList.tsx:202-219`) | collect/load continue regardless | No sender can deliver from a Site with no signal |

**Sender-placement readings of the same table** (from the sender note): *planner-only* — no host
changes, no Python dependency, but cannot notify Collected or Loaded, which is the operator's
at-the-aircraft question ("which Card do I open?", ADR 0021:79-82) — weak for the product's
purpose. *Host-only* — no Vercel changes, covers Collected/Loaded, misses the planner transitions
the operator already sees. *Split* — both, sharing one VAPID pair and one registry; each side
sends only what it observes; covers all six states. Cost: two places to hold the key, the Python
dependency, and the registry's two-writer amendment. **Verdict: the split is the honest coverage
story, but only if the host send is built as bookkeeping (post-report, non-fatal, non-silent) —
otherwise it reintroduces exactly the coupling ADR 0019:41-42 removed.**

### The B2 store as a trigger (watcher mechanisms)

All rows read from primary vendor documentation on 2026-09-27. "Covers `specs/`" asks whether the
mechanism can be scoped to the status objects rather than the whole bucket.

| Mechanism | Current limits and cost (dated source) | Covers `specs/_status/`? | Verdict |
|---|---|---|---|
| **B2 Event Notifications** | Exists; targets: **webhook only** ("the only supported `targetType` is 'webhook'"); up to **25 rules per bucket**; `objectNamePrefix` filters and must not overlap; **at-least-once** delivery; **3-second timeout** with retries on non-200; optional HMAC-SHA256 signing secret; payload carries `objectName`, `eventType`, `eventId`, `eventTimestamp` — **not the object's contents**. Requires contacting Support to enable. Outbound calls are **Class D — first 2,500 free each day, then $0.004 per 10,000** (*Reference Guide*, *Quickstart*, *transaction pricing*) | Yes — one rule with `objectNamePrefix: "specs/_status/"` catches every host report | **The only event-driven candidate. Zero cost at our volume, but support-gated and untested for this account → not adopted now.** Receiver must download the changed object and derive the transition itself |
| **Vercel Cron (Hobby tier)** | Included in all plans; Hobby: **minimum interval once per day**, "per-hour (±59 min)" precision; "Cron expressions that would run more frequently will fail during deployment". Pro (paid) allows once per minute (*Usage & Pricing for Cron Jobs*, updated 2026-07-15) | Irrelevant — cannot poll at any useful cadence on the zero-spend tier | **No.** A store watcher needs minutes; Hobby gives days |
| **GitHub Actions scheduled workflow (private repo)** | Shortest interval once every 5 minutes; free minutes for private repos: **GitHub Free 2,000 / Pro 3,000 per month**; minutes are rounded up to the nearest whole minute. A 5-minute schedule is 288 runs/day → **≥288 billed min/day ≈ 8,640/month** — over the free allowance before the job runs (*Events that trigger workflows — `schedule`*, *Actions runner pricing*, *GitHub Actions billing*) | Yes, in principle (checkout + download the status object) | **No — cannot be shown zero-spend.** Even self-hosted runners would mean running the watcher on the host, which already knows the change directly |
| **Host cron (exists today)** | `collect.py` and `load.py` run every minute while operating (ADR 0019:43-44; `load.py:23-24`; ADR 0016:472-478 records the per-minute trigger as "written but not yet installed"). Cost: zero extra — the runs happen anyway and already authorize, download and upload (`collect.py:190-243`; `load.py:949-1030`) | Yes, trivially — it is the writer | **Use it as the sender (the split), not as a watcher.** It cannot see planner transitions without polling the store, which adds transactions for no coverage gain |

**Verdict on a zero-spend store watcher.** As a *replacement* for writer-side sending: none
qualifies today. As an *adjunct* (desk changes reaching a phone that missed them), B2 Event
Notifications → a planner route is the one design worth revisiting later; if adopted it must
(a) respond 200 within 3 s and do the work after, (b) verify the HMAC signature, (c) dedupe by the
payload's `eventId` **and** the semantic transition key, and (d) allow-list the Backblaze IP blocks
at the endpoint.

**Transaction budget.** The repo's recorded lesson is to add no poller: the browser's store poll
was deliberately left at five minutes after a 30-second poll spent 2,880 authorizations/day
(`web/components/MissionList.tsx:202-206`; `web/lib/b2.ts:41-45`; ADR 0021:73-77). Current
published pricing lists Class A, B and C calls as free for pay-as-you-go customers, with Event
Notifications under Class D (first 2,500/day free) (*transaction pricing*), and B2's Caps & Alerts
allow daily spend caps (*Data Caps and Alerts*, read 2026-09-27). Which applies to this account is
not visible from the repo (see "Could not verify"). The design does not depend on the answer: **no
new poller, and at most one extra small read + write per transition batch, inside the run that
already authorized.**

### APNs (native iOS)

**Cost.** The Apple Developer Program is **"99 USD per membership year. Prices may vary by region
and are listed in local currency during the enrollment process."** (Apple, *Become a member*, read
2026-09-27). A free Apple Account gets a **Personal Team** — "up to 10 App IDs, 3 devices, 7-day
expiry", Xcode-managed provisioning; "To build more advanced app capabilities and distribute
apps, you'll need to be an Apple Developer Program member" (Apple, *Developer account overview*,
read 2026-09-27). APNs credentials live behind that member-only portal: token auth requires a
private key with APNs enabled — **"Required role: Account Holder or Admin"** (Apple, *Communicate
with APNs using authentication tokens*, read 2026-09-27). Two independent vendor docs say it
plainly: "A paid Apple Developer Account is required to generate credentials" (Expo); "To test push
notifications on iOS, Apple requires that you have a paid Apple Developer account" (Capacitor).
The INFERRED step is only this: Apple's own pages do not print the sentence "push requires a paid
account" — they say advanced capabilities and the portal require membership, and the push key is a
portal action. **No per-notification cost exists for APNs; the account is the wall.**

**What a sender runs.** A provider server that opens an HTTP/2 connection over TLS 1.2+ and POSTs
to APNs (Apple, *Sending notification requests to APNs*, read 2026-09-27; the legacy binary
protocol was retired 2021-03-31). Token-based auth: one `.p8` signing key, JWT signed with ES256,
`kid` (key ID) in the header, `iss` (Team ID) in the payload, `authorization: bearer <token>`; the
key "doesn't expire, but can be revoked". Payload limit 4 KB (5 KB VoIP). Apple publishes no
numeric send-rate quota on the pages read; FCM's quota doc notes "For iOS, we return an error when
the rate exceeds APNs limits".

**Native vs Web Push — the distinction that matters here.** Web Push on iOS rides the same APNs
underneath but requires no Apple Developer Program membership (WebKit blog 13878, read 2026-09-27).
The account boundary is: **native binary → paid Apple account; Home Screen web app → no account.**

### FCM (native Android)

**Price and quota.** Firebase's pricing table lists "Cloud Messaging (FCM)" in a free row whose
price cell reads **"No-cost"**; the Spark plan copy says "No-cost usage from Spark plan included"
(Firebase pricing, read 2026-09-27). No Blaze plan or billing account is required for FCM. Quotas
(FCM throttling and quotas, page updated 2026-09-24, read 2026-09-27): "The default quota of 600k
messages per minute"; over-quota returns 429 `RESOURCE_EXHAUSTED`; per Android device "up to 240
messages per minute and 5,000 messages per hour"; collapsible messages "a burst of 20 messages per
app per device, with a refill of 1 message every 3 minutes"; payload up to 4096 bytes.

**What an Android native build must run.** The app bundles the FCM SDK and a Firebase project's
config; the FCM receiver depends on **Google Play services** (device must have a compatible APK).
A trusted sender is still required — "Cloud Functions for Firebase or an app server" — using the
Admin SDK or the FCM v1 API with a service-account JSON and a short-lived OAuth 2.0 access token.
All within the free tier. Per-notification cost: none.

**FCM on iOS still needs the Apple account.** Firebase's iOS setup says to "Upload your APNs
authentication key to Firebase. If you don't already have an APNs authentication key, make sure to
create one in the Apple Developer Member Center" (FCM iOS certificates, read 2026-09-27). That key
is the paid-membership artifact, so FCM removes the Google-side cost but not the Apple-side one on
iOS.

### Expo push service

Cost: free — "There is no cost associated with sending notifications through Expo push
notification service", with "a limit of 600 notifications per second per project" (Expo FAQ, read
2026-09-27). iOS credentials: "A paid Apple Developer Account is required to generate
credentials." Android credentials: FCM v1 (a Firebase project). Expo Go in SDK 53 and later does
not support push — a development build is required. What the sender runs: an HTTPS POST to
`https://exp.host/--/api/v2/push/send` (the HTTP/2 API "currently does not require any
authentication") or a server SDK; tickets and receipts tell whether Expo handed the message to
FCM/APNs. "The Expo push notification service does not have an SLA." **Verdict: Expo is free as
software but does not lift the Apple account requirement for iOS; it only moves who runs the
sender. On Android-only it is free, at the cost of a second toolchain and lost `web/lib` UI reuse
(`.autoforge/inputs/mobile-stack.md:287-300`).**

### Capacitor

iOS: "iOS push notifications are significantly more complicated to set up than Android. You must
have a paid Apple Developer account **and** take care of the following items…" — certificates and
"an APNS Certificate or an APNS Auth Key in the Apple Developer portal" (Capacitor, *Push
Notifications – Firebase*, read 2026-09-27). Android: Firebase/FCM, free as above. **Same APNs
door, same 99 USD; the wrapper changes nothing about the account.**

### ntfy.sh public

An HTTP pub-sub relay: publish with `PUT`/`POST https://ntfy.sh/<topic>`; a subscribed client
receives. No sign-up; "the topic is essentially a password", so the topic name is the only secret
(ntfy, *Sending messages*, read 2026-09-27). Current free-tier limits (*Limitations*, read
2026-09-27): message length 4,096 bytes; 60-request burst then 1 refill per 5 s (429 once
exhausted); "On ntfy.sh, the daily message limit is 250"; 30 open subscriptions; attachments 2 MB
per file; 200 MB/day bandwidth; topics created on the fly, unreserved.

Free for this volume: a day of Mission activity is a handful of state changes, one POST per
change, well under 250/day and far under the request burst. A paid tier exists and is not needed:
Supporter $5–6/month, Pro $10–12, Business $20–25 (ntfy.sh/#pricing, read 2026-09-27).

What runs: nothing new. The sender is the component that already detects the state change — the
planner route or the host cron — making one outbound HTTPS request, the same shape as the host's
existing B2 calls (`scripts/mission/b2.py:63,85`). The operator installs the free ntfy iOS app and
subscribes to one random topic. No account, no Apple Developer Program, no change to the PWA.

Reliability: ntfy.sh is a single DigitalOcean droplet run on a best-effort basis — no uptime
guarantee, and a public status page (ntfy FAQ, read 2026-09-27). The FAQ also records that "the
logs do contain topic names and IP addresses" (content itself not logged); a random 30-plus
character topic is the mitigation. The iOS app's own author describes it as "very bare bones and
quite frankly a little buggy" — a real caveat on every ntfy route.

### ntfy self-hosted

What must run: one statically linked Go binary (tarball, deb/rpm, Docker; amd64 and arm64);
`ntfy serve` alone listens on port 80 (ntfy, *Installation*, read 2026-09-27). The repo already
has the Linux host where "Missions are generated, where every other Node runs" (ADR 0016:66-68),
so the incremental software cost is zero; the small board named in ADR 0016 would run the same
binary. HTTPS either terminates in ntfy (`listen-https`, `key-file`, `cert-file`) or at a proxy
with `behind-proxy: true` (ntfy, *Configuration — Behind a proxy*, read 2026-09-27). A self-hosted
instance is open by default; set `auth-default-access: deny-all` plus a user and token for privacy
(*Access control*, read 2026-09-27).

**The critical iOS question.** The iOS app does **not** get instant notifications from a
self-hosted ntfy on its own: "Unlike Android, iOS heavily restricts background processing, which
sadly makes it impossible to implement instant push notifications without a central server", and
"you have to forward so called `poll_request` messages to the main ntfy.sh server … which will then
forward it to Firebase/APNS" via `upstream-base-url: "https://ntfy.sh"` (ntfy, *Configuration —
iOS instant notifications*, read 2026-09-27). The flow: the app subscribes to the self-hosted
topic and to a Firebase topic that is the SHA-256 of the topic URL; a publish causes the server to
send a `poll_request` to ntfy.sh carrying only the message ID and the topic URL hash; ntfy.sh
forwards it to Firebase → APNs, which wakes the phone; the phone then fetches the actual message
from the self-hosted server. Consequences: without `upstream-base-url`, delivery "can take hours"
(20–30 minutes in active use); and the phone must be able to reach the self-hosted server over
HTTPS, which the NAT/Tailscale-only host does not trivially allow (ADR 0019:3-5). If the server is
unreachable, the iOS app shows a generic `New message` popup rather than the content.

**Cost verdict.** No software spend; adds a server, TLS, reachability and an upstream config whose
iOS instant delivery still leans on ntfy.sh's infrastructure. Choose it only if the topic must
leave ntfy.sh's logs; it is more moving parts than the fallback needs.

### Telegram bot

A bot is created once in `@BotFather`, which returns a token. One notification is one HTTPS request
to `https://api.telegram.org/bot<token>/sendMessage` with `chat_id` and `text`; `sendMessage` also
accepts `disable_notification` and other optional fields (Telegram Bot API, read 2026-09-27). The
sender is the planner route or the host cron — one outbound POST, no library needed.

Limits (Telegram Bot FAQ, read 2026-09-27): "Bots are able to message their users at no cost", with
one message per second in a single chat (short bursts, then 429), no more than 20 messages/minute
in a group, and about 30/second for bulk sends; faster requires paid broadcasts. The operator
installs Telegram (free), creates the bot, and **sends the bot a message first**: "Bots can't start
conversations with users. A user must either add them to a group or send them a message first"
(Telegram, *Bots — intro*, read 2026-09-27). Failures are 429 (with `retry_after`) or an error
body, both readable by the sender.

### Email

**Gmail SMTP on the existing account.** An app password is "a 16-digit passcode" that "can only be
used with accounts that have 2-Step Verification turned on" (Google, *Sign in with app passwords*,
read 2026-09-27). The server is `smtp.gmail.com`, port 465 (SSL) or 587 (STARTTLS) (Google,
*IMAP/SMTP configuration*, read 2026-09-27). Consumer limits: "more than 500 recipients in a
single email and or more than 500 emails sent in a day", after which sending is blocked for 1 to
24 hours (Google, *Limits for sending & getting mail*, read 2026-09-27). What runs: `smtplib` in
the host's stdlib Python — no new dependency, one app password in the host's mode-600 env.
Whether the same SMTP call works from a Vercel function is **not verified**; the host needs
nothing new. The operator installs nothing; the message lands in Gmail, already on the phone.

Deliverability caveats: this is an inbox entry, not a notification; spam classification,
quiet-hours batching and latency are outside the sender's control, and Google explicitly
discourages app passwords. Treat email as an audit trail beside a push route, never as the alert
itself.

**Resend free tier (figures with source, not planned here).** Free at $0/month: 3,000
emails/month, 100 emails/day, 3 custom domains (Resend, *Pricing*, read 2026-09-27). Sending from
your own domain requires DNS verification, so the route is **blocked on having a sending domain**;
ticket **#246 "Accounts: a sending domain and Resend for email sign-in" is open** (`gh issue view
246`, read 2026-09-27). Noted, not planned.

### Gotify

A self-hosted server (Go binary or Docker) with a web UI, a REST API for sending and a WebSocket
for receiving; official clients are the **Android** app and a CLI (gotify.net; gotify/server
README, read 2026-09-27). There is **no official iOS client**: the project's iOS issue records the
obstacle — iOS will not let an app hold the persistent WebSocket connection in the background
(gotify/server issue #87, project discussion read via search snippet, read 2026-09-27; label:
community, not product documentation). A third-party app *iGotify* exists on the App Store, free
with in-app purchases, claiming Gotify delivery on iPhone (App Store listing, third-party, read
2026-09-27) — usable, but a community client is a weaker foundation than ntfy's own app.
**Verdict: not the iPhone route; recorded and dropped.**

### UnifiedPush

A standard for Android push without FCM: a distributor app receives from a push server and hands
notifications to apps. The distributor list is Android (Sunup, ntfy, gCompat-UP, NextPush,
Conversations) and Linux (KUnifiedPush) — no iOS entry (UnifiedPush, *Distributors*, read
2026-09-27). The project's FAQ answers directly: "iOS doesn't support running services in the
background, so running a UnifiedPush distributor won't be possible without jailbreaking or Apple's
approval for the foreseeable future" (UnifiedPush, *FAQ*, read 2026-09-27). **iOS is excluded by
design. Not this operator's route.**

---

## Implementation notes

These are design notes for whoever implements #232's findings; nothing here is built yet. They
respect the repo's constraints by construction: the manifest stays host-written only (ADR
0019:16-21), reports stay bookkeeping (ADR 0019:41-42), nothing is deleted (ADR 0021:36-38), the
browser never holds a store credential (ADR 0016:232-235), and the B2 transaction budget is
unchanged (ADR 0021:73-77).

### Subscription registry: `specs/_status/subscriptions.json`

**A separate file, never `missions.json`.** It sits alongside `LEDGER_KEY`, `STATUS_KEY`,
`SUMMARIES_KEY`, `SKIPPED_KEY` in `web/lib/keys.ts:15-21`. Putting it inside `missions.json` would
break "the host is the manifest's only writer; the planner only reads" (ADR 0019:16-21).
Underscore-prefixed `specs/` keys are invisible to Collect's Spec pattern by construction
(ADR 0019:22-25; `web/lib/keys.ts:5-8`), so a subscriptions file can be neither listed by Collect
nor mistaken for a Mission. Suggested shape (design, not code) — one JSON object with `updated_at`
and an array of entries keyed by `endpoint`:

```json
{
  "updated_at": "…",
  "subscriptions": [
    {
      "endpoint": "https://…",
      "keys": { "p256dh": "…", "auth": "…" },
      "added_at": "…",
      "vapid_public_key_sha256_8": "…",
      "last_ok_at": "…",
      "gone_at": null,
      "gone_reason": null
    }
  ]
}
```

Keep `endpoint` as data inside the JSON, never as the B2 object key — arbitrary URL text must not
build store key paths (`web/lib/keys.ts:49-59` is the existing "refuse anything that could climb
out of the prefix" guard for the analogous case). Before any send, the sender requires `https://`
plus a host allow-list (`*.push.apple.com`, `fcm.googleapis.com`,
`updates.push.services.mozilla.com`, `*.notify.windows.com`) and records refused entries with a
reason. `vapid_public_key_sha256_8` exists so a
post-rotation send can see, without guessing, which key a subscription was created under.

**Who writes it.** The browser never holds a store credential (ADR 0016:232-235), so it POSTs its
`PushSubscription` to a **passphrase-gated planner route** (`x-wayfinder-key`,
`web/lib/auth.ts:11-40`) — the same gate as every other action. The route reads and writes the
object with the planner's existing B2 key pair (`B2_KEY_ID`/`B2_APP_KEY`; ADR 0017:20-22;
`web/lib/b2.ts:25-32`), re-reading before writing the way `missionStore.updateLedger` already does
for the Ledger (`web/lib/missionStore.ts:121-148`).

The design decision to record: **the planner routes write the registry; the host only reads it.**
The host has nothing to do with subscription creation — the phone never talks to it — and it
already holds a read key for `specs/`. If the split sends from the host, the host may write its own
`last-seen` object (below) under the same key; that does not widen the key, it extends the set of
call sites ADR 0019:39-40 names (see ADR conformance notes). If a host-side send gets a 404/410,
either the host marks the endpoint `gone` (a second writer of `subscriptions.json`, requiring the
documented amendment) or it reports the failure in the manifest and the planner marks the registry
— at the cost of a stale endpoint surviving longer. The registry shape does not change either way.

**Pruning without delete.** ADR 0021:36-38: "Nothing is deleted. Removing a Mission archives it."
A 404/410 does not remove the entry — the sender sets `gone_at` + `gone_reason`, and every reader
filters `gone_at == null`. Mark-and-filter, not delete. Coalescing by `endpoint` keeps the file
bounded: one operator, one phone, one Mac; a reinstall or rotation adds an entry, it does not grow
without bound. Old entries are evidence — they answer "why did the phone stop getting
notifications?" without guesswork.

**B2 transaction cost of the send path.** Every store call is a B2 operation (`web/lib/b2.ts:1-5`),
and the repo treats Class C as the scarce resource: a 30-second status poll spent 2,880
authorizations in a day (`web/lib/b2.ts:41-45`; ADR 0021:73-77). The session cache keeps one
authorization per key id for 12 hours (`web/lib/b2.ts:45-52`), so a send path adds no authorize per
message. `b2_list_file_names` is Class C and "billing is per 1000 files/versions returned"
(Backblaze API docs, read 2026-09-27); `b2_get_upload_url` is Class A; `b2_authorize_account` and
`b2_list_file_names` are Class C (https://www.backblaze.com/cloud-storage/transaction-pricing, read
2026-09-27);
current pages say Class A/B/C calls are free for pay-as-you-go, while the transaction-pricing page
still lists the 2,500/day free allowance then "$0.004 per 10,000" (pages disagree slightly; the
design takes the stricter reading the repo already assumes). **Design consequence: read the
registry by its known key (download), never by `listFiles` over `specs/_status/` — one read per
send, no per-entry Class C charge.** A Mission change is a handful of sends a day; 2–3 additional
reads are inside the existing budget, and no polling process is added, so the 2,880/day class of
mistake is not reintroduced.

The VAPID private key is not a store credential and is never shipped to the browser; the public key
may be (it is public by definition). The browser holds only its own subscription.

### Dedupe and last-seen

**The transition key.** A Mission state is never stored; it is derived on every read from the
Mission record, the host manifest and the Card Ledger (`web/lib/missionRecords.ts:26-28, 241-248,
261-300`). A transition is therefore naturally identified by **who changed + which field + to what
timestamp**: `<subject key>#<changed field>=<new value>`, e.g.
`specs/field/2026-09-27/20260927T140000Z.json#loaded_at=2026-09-27T14:03:00Z` (host),
`…#_notice=2026-09-27T14:03:00Z` (host refusal), or
`specs/_missions/<id>.json#dispatched_at=2026-09-27T13:58:02Z` (planner). The values already exist
in the store objects the senders read (`scripts/mission/b2_status.py:54-117`; the planner record
carries `dispatched_key` and `updated_at`, `web/lib/missionRecords.ts:282-297`). Both sides compute
the same key from the same data; no coordination is needed to agree on it.

**Where last-seen lives — in the store, one append-only file per sender, under `specs/_status/`:**

- `specs/_status/notified.planner.json` — written only by the planner routes.
- `specs/_status/notified.host.json` — written only by the host scripts.

Shape: `{ "<transition key>": { "at": "<ISO>", "by": "planner|host" }, "last_error": { "at":
"<ISO>", "error": "<short text>" } }`.

One writer per file matters: the store has no compare-and-swap, and the repo has been bitten by
read-then-write races (#152; `web/lib/missionStore.ts:107-148`; ADR 0022:41-45). A shared
`notified.json` written by both senders would reopen that class. Per-sender files keep each object
single-writer and cost nothing, because the split already gives each sender a disjoint transition
set. Not function memory: Vercel functions are ephemeral, the host cron process exits every minute,
and a GitHub runner is fresh each time; restart-safe dedupe has to be a store object. Never delete:
the file grows by one short line per notified transition, matching "Nothing is deleted"
(ADR 0021:36-38); at this scale no pruning is needed.

**Idempotency rules.**

1. **Record only after the send succeeds.** Read last-seen; compute candidate transitions; send;
   then write the new keys. If the send fails, the key stays unwritten and the failure is recorded
   in `last_error`, but only **transient** outcomes are retried — network error, 429 honouring
   `Retry-After`, and 5xx — with a capped attempt count and last-attempt timestamp per transition
   key, so the "do not hammer" rule above is kept. A permanent 4xx other than 404/410 (e.g. Apple's
   `VapidPkHashMismatch` after a key rotation on an entry that missed the re-subscribe flow) is not
   retried: the entry is marked `blocked`/`gone` with the reason and surfaced once on the notice
   surface. Writing the key before sending would turn a send failure into a permanent miss —
   the one direction that is not acceptable.
2. **Across restarts:** the key lives in the store, so a restarted host or a cold Vercel function
   re-derives "seen" from the same object it already has to read.
3. **Across the two senders:** the split makes the key spaces disjoint; the read-before-send check
   still runs, so if the split ever weakens and both senders see the same transition, the second
   one sees the first's entry. A residual race (both read before either writes, no CAS) produces a
   **duplicate notification, never a missed one** — the tolerable direction. Do not add a lock; the
   cost is one redundant notification on a rare race.
4. **Transport duplicates:** if B2 Event Notifications are ever adopted, dedupe at two levels — the
   payload's `eventId` ("primary key when processing events") for repeated deliveries of the same
   event, and the semantic transition key for events describing the same change (Backblaze
   *Reference Guide*, read 2026-09-27).

### Which transitions notify, and the copy

The phone's job is one question — "which Card do I open?" (ADR 0021:79-82) — and one duty: never
let a Mission be flown in the belief that it is current when it is not. Two rules decide the set:
notify when the change is about a Card the field might fly, or something the operator must act on;
do not notify the operator of their own action, because the screen they made it on already shows
it. Withdrawn and Superseded are the one deliberate exception: they release Cards, and the field
device cannot tell whether the desk or another tab caused them; they are sendable but may be
suppressed to the acting device once the registry carries a per-subscription identity.

| Transition | Notification | Why |
|---|---|---|
| 1–4 Planned / edit / fork / Dispatch | no | Own action; the actionable moment is Loaded |
| 5 Superseded | yes (Card release) | A Card the field might open no longer holds what it held |
| 6 Withdrawn | yes (Card release) | Same; a field device may be holding a stale view |
| 7–8 Flown mark / unmark | no | Own action |
| 9 Collected | no | Nothing to act on; Loaded is the moment that answers the question. (A Mission waiting to be Collected is Dispatched however many are ahead of it — CONTEXT.md:154-156.) Keep it available as a preference if wanted |
| 10 Loaded | **yes — always** | The host Loads unattended; the phone must answer which Card |
| 11 Card pool published | no | Not a Mission state; never operator-facing |
| 12 refusal / overflow / drift | **yes — always** | Action required: Dispatch again, clear a Card, do not fly that Card |
| 13 imagery arrival | **prompt only** | It may only ask; it must never announce Flown — "the operator's own mark is what decides it … their answer wins" (CONTEXT.md:163-169; ADR 0021:50-53). No writer exists for `imagery_at` today |
| 14 Remove (archive) | no | Own action |

**Exact copy suggestions, in the glossary's words** (short sentences; `PRODUCT.md:67-68`;
CONTEXT.md:149-181). Never use the banned words (queued/pending/status/in progress;
uploaded/synced/downloaded; cancelled/replaced/complete/done/finished/captured):

- **Loaded** — title "Loaded": `<Mission Name> is Loaded into <Card>. Open <Card>.`
- **Collected** (if ever enabled): `<Mission Name> is Collected. It will Load when the Controller is plugged in.`
- **Refusal (no Card reserved)**: `Load refused: no Card is reserved for <Mission Name>. Dispatch it again.`
- **Overflow**: `Load refused: <N> parts do not fit <M> Cards. Dispatch fewer Missions or clear a Card, then plug the Controller in again.`
- **Drift**: `<Card> holds a Mission that is not the one planned. Do not fly it. Dispatch and Load that Mission again.`
- **Withdrawn**: `<Mission Name> was Withdrawn. Its Card is free.`
- **Superseded**: `<Mission Name> was Superseded by a newer Mission for <Site> <date>. Its Card is free.`
- **Imagery arrival (prompt)**: title "Imagery has arrived" — body `Imagery for <Site> <date> has arrived. Mark <Mission Name> Flown if you flew it.` It must not say the Mission *is* Flown; the mark stays the operator's.
- **Notification not sent** (in-app, `PRODUCT.md:66`): `The last notification was not sent. Open the app to see what changed.`
- **Subscription gone** (404/410; RFC 8030 §7.3): `Notifications are off for this phone. Enable them again to get Loaded notices.`

The host's own reason strings already state what to do (`scripts/mission/b2_status.py:95-117`); the
notification should carry the same sentence rather than a code, on the same principle — "a failure
is never silent, and never merely a code" (`scripts/mission/b2_status.py:113-114`).

### ADR conformance notes

- **Host manifest host-only writer.** The registry and last-seen files are new `_status/` objects;
  neither touches `missions.json`. "The host is the manifest's only writer; the planner only reads"
  (ADR 0019:16-21) is preserved.
- **Reports are bookkeeping, never the operation.** A send runs after the store write; without
  status credentials Collect and Load still succeed and say so loudly (ADR 0019:41-42;
  `collect.py:126-132`; `load.py:1296-1301`). A failed send never fails the write, and the failure
  is recorded for the planner to render.
- **ADR 0019:39-40 must be read as already amended.** It says the host status key's `write specs/`
  scope is "accepted because exactly one call site ever writes (`b2_status.upload_manifest`)". The
  Ledger already made that statement stale — `b2_status.upload_ledger` is a second host call site
  (`scripts/mission/b2_status.py:274-276`; ADR 0022:41-45). A host last-seen object is a third; it
  does **not** widen the key (the key already covers `specs/`), it extends the set of call sites
  that sentence names. The same is true of any host read of the registry.
- **Nothing is deleted** (ADR 0021:36-38). Subscriptions and last-seen entries are marked and
  filtered, never removed.
- **Class C budget.** No poller is added; each send adds at most one registry read and (first
  time) one write, inside activity that already authorized (ADR 0021:73-77; `web/lib/b2.ts:41-52`).
- **The browser never holds a store credential** (ADR 0016:232-235); the VAPID public key it does
  hold is public by definition.
- **Forward-compatibility with #244.** The registry write relies on the passphrase-gated store
  routes (`x-wayfinder-key`, `web/lib/auth.ts:11-40`). Ticket **#244** (accounts map) removes the
  passphrase; when that lands, this design needs the replacement auth on the same routes. Recorded
  as a dependency, not planned here.

---

## What could break

| Risk | Where it bites | Mitigation / note |
|---|---|---|
| iOS Web Push needs the web app installed, and the permission must follow a tap | Push never arrives if the operator has not added the PWA to the Home Screen and tapped to enable | In-app step "Add to Home Screen, then enable notifications"; detect `Notification.permission === "denied"` and point at Settings (WebKit blog 13878, read 2026-09-27) |
| iOS evicts IndexedDB / Cache Storage / website data under pressure | Offline records, the outbox, or the push subscription could be cleared | **Unverified** — no primary source. Keep the outbox small, flush when online, re-register the subscription on every launch, keep `gone_at` tombstones |
| `notificationclick` does not fire depending on how the app was opened | Tapping a notification opens the wrong place or nothing | Field test steps 3–4 (direct answer c); copy names the Mission; the app resumes on the Missions list rather than a deep link |
| VAPID key rotation invalidates every existing subscription | Notifications stop after any key change | RFC 8292 §4.2 requires a fresh browser subscription; re-subscribe on app start; `vapid_public_key_sha256_8` in the registry spots entries on the old key; rotation is a two-place operation under the split |
| Origin / domain change invalidates every existing subscription | Notifications stop on the old origin, and permission must be granted again from the new one | Permissions are per web app/origin (WebKit blog 13878, read 2026-09-27); re-subscribe from the new origin, keep the old entries as `gone`; monitor when #244 or a domain decision lands |
| Stale or expired subscription (404/410) | Sends fail silently if unhandled | Mark `gone_at`, never delete; surface "Notifications are off for this phone. Enable them again to get Loaded notices." |
| A failed send stays silent | Violates `PRODUCT.md:66`; operator misses a Loaded | Planner notice surface + host manifest `_notice` / sender `last_error`; the store write never depends on the send |
| Rare dedupe race sends the same notification twice | One redundant notification | Accepted: duplicate, never missed; no lock added (Implementation notes) |
| No-signal Site: no sender exists, and unreported host transitions are currently never replayed | A Loaded that happened offline is neither reported nor notified | The 5-minute foreground poll is the catch-up path; if Loaded-while-offline matters, persist unreported transitions locally and replay on the next online run (direct answer a) |
| Service worker must not intercept `/hero/v1/` | Hero video range requests break | `web/next.config.ts` already serves those with no service worker in front; scope the worker to exclude that path |
| The host's stdlib-only property breaks when `pywebpush` is added | ADR 0016's "runs there unchanged" claim | Record an explicit amendment to ADR 0016; the `py-vapid` + `http-ece` middle path still adds `cryptography` and ≥3 distributions |
| Registry reads/writes add B2 Class C transactions | Transaction budget | One known-key download per send; never `listFiles`; no poller; inside the existing session cache |
| ntfy.sh is a best-effort single droplet, and its iOS app is called buggy by its author | The first fallback is not an SLA product | Telegram is the second fallback; random 30-plus-character topic; email rides beside as an audit trail |
| Telegram requires a third-party account and one manual bot start; email lands in spam | Fallback friction and trust | Recorded plainly; neither is the alert of record |
| No free watcher exists at a usable cadence | A store-watcher design would stall | Not adopted; writers send. B2 Event Notifications remain the later adjunct, support-gated |
| #244 removes the passphrase that gates the store routes | The registry write route's auth | Recorded as a forward-compatibility dependency; re-point the route at #244's auth when it lands |
| Apple/Google prices and free tiers drift | Cost verdicts age | Every figure is dated 2026-09-27; revisit at #233 |

## Could not verify

Attempted 2026-09-27 unless stated. Items resolved by a later module in this same run are marked
as resolved rather than dropped.

**Web Push and B2 mechanics (from `notes-web-push.md`):**

- **openssl + manual VAPID recipe** — no primary howto read; pywebpush accepts an
  OpenSSL-exported PEM/DER key, but the generation steps themselves are sourced only from tool
  docs (web-push, py-vapid). Use the CLIs.
- **Firefox endpoint hostname** (`updates.push.services.mozilla.com`) — autopush-rs README gives
  the server identity and `wss://push.services.mozilla.com/`, not the HTTPS endpoint domain.
  **INFERRED**.
- **Edge Web Push requiring no Microsoft account** — not stated in the pages read; the WNS auth
  flow read is for native UWP apps. **INFERRED** from the VAPID-only browser flow.
- **iOS `pushsubscriptionchange` support** — no primary confirmation read. Whether iOS fires this
  event after a browser-initiated subscription change is unknown; the re-subscribe-on-launch flow
  is the fallback that does not depend on it.
- **iOS subscription survival across app updates and reinstall** — no primary source found. Field
  test steps 5–6 are the replacement for a citation.
- **iOS permission re-prompt after `denied`** — no primary source found; Settings is documented as
  the management path (WebKit blog 13878), and no in-app re-prompt is assumed. **INFERRED**.
- **iOS notification action buttons** — secondary (Stack Overflow) only; treated as unsupported
  in the design, and the field test measures tap behaviour.
- **B2 exact billing for download/upload vs "Class C"** — the repo comment says
  `b2_authorize_account` is Class C (`web/lib/b2.ts:41-45`) and Backblaze docs confirm that
  (`b2_get_upload_url` is Class A; `b2_authorize_account` and `b2_list_file_names` are Class C —
  https://www.backblaze.com/cloud-storage/transaction-pricing, read 2026-09-27); the two pricing
  pages read disagree on whether A/B/C are free outright or carry a 2,500/day allowance. The
  design assumes the stricter reading.
- **Safari website-data eviction under storage pressure** (and with it subscription loss) — no
  primary source; carried over from `.autoforge/inputs/mobile-stack.md:362`.
- **A field measurement of iOS delivery** — research only; the field test in direct answer (c) is
  named, not run. A second named test for the relay route: install the ntfy app, subscribe to the
  topic, trigger a Loaded from the host, close and reopen the app, and record delivery.

**Platform costs (from `notes-platform-push.md`):**

- **Exact APNs send-rate quota** — Apple publishes no number on the pages read; FCM says only that
  APNs has limits and FCM errors above them. Not needed for a one-operator product; recorded for
  completeness.
- **Apple's feature-comparison table checkmarks** — https://developer.apple.com/support/compare-memberships/
  now serves the *Developer account overview* content; its free-vs-member table renders as icons
  (`alt="Access"`) that could not be mapped reliably from the HTML read. The membership requirement
  therefore rests on the account-overview prose, the key-creation flow, and two vendor docs — not
  on one single Apple sentence.
- **Whether a free Personal Team can enable the Push Notifications capability in Xcode at all** —
  no Apple page read states it explicitly. **INFERRED** unavailable, because the entitlement rides
  a provisioning profile for an App ID with push enabled, and free App IDs are Xcode-managed with
  7-day expiry. It does not change any verdict — the APNs *key* is portal-only in every case.
- **ntfy's own pricing, quotas, and iOS delivery path** — left open by the platform note;
  **resolved in this document** by "ntfy.sh public" and "ntfy self-hosted", from `docs.ntfy.sh`
  pages read 2026-09-27.
- **Apple Developer Program price outside the US** — 99 USD is the US figure; "Prices may vary by
  region" (enroll page, read 2026-09-27).
- **Whether FCM's 600k/min default could be lower for brand-new projects** — the page states the
  default without qualification; a one-operator product is orders of magnitude below it either way.

**Relays (from `notes-relays.md`):**

- **ntfy.sh cache duration** — the server default is 12 h and configurable; ntfy.sh's own
  `server.yml` is not published in the pages read, so how long a phone can be offline and still
  poll missed messages from the public service is **INFERRED**.
- **ntfy iOS app behaviour in the field** — the vendor documents the mechanism and calls the app
  immature; no notification was sent or received in this run, so tap behaviour, Focus modes and
  re-prompt rules on the relay route are unmeasured (the PWA route is covered by direct answer c).
- **Self-hosted ntfy reachability from the operator's phone** — Tailscale/NAT specifics were not
  tested; the requirement that the phone can fetch the message over HTTPS is documented, the
  configuration is not chosen here.
- **Gmail SMTP from Vercel** — whether outbound port 465/587 works from the planner's Node
  functions was not tested; the host route is stdlib Python and needs no such check.
- **Resend testing sender** — the account's test-sending domain restrictions were not read, and
  the route is not planned (see #246).
- **iGotify internals** — read only as an App Store listing; its delivery mechanism and
  reliability are not verified.
- **Gotify issue #87 text** — quoted from a search result snippet, not the issue page itself; the
  absence of an iOS client is independently visible on gotify.net and the server README.

**Senders and watchers (from `notes-senders.md`):**

- **B2 Event Notifications enablement for this account** — the docs require contacting Support;
  whether this account has it is not known and cannot be read from the repo. (Cost class *is*
  verified: Class D, first 2,500/day free.)
- **The B2 cap actually in force** — the repo records a daily cap that refused with "resets at
  00:00 UTC" (stress test) and a "daily Class C cap" (`web/lib/b2.ts:41-45`); the account's Caps &
  Alerts settings were not read (needs console access).
- **The Vercel plan** — no `web/vercel.json`, no plan statement in the repo; the Hobby limits
  assume the zero-spend tier.
- **The GitHub account plan** — `gh api /user` returned `"plan": null`; the free-minutes figure
  used is the published table.
- **B2 event-notification retry schedule** — the docs state retries happen on non-200; the number
  of attempts and the backoff window are not documented on the pages read.
- **Host push feasibility on the real host** — no Web Push client or VAPID code exists in the
  repo; feasibility is **INFERRED** from the proven outbound HTTPS path (`b2.py`), not measured.
- **Installed host cron** — ADR 0016:472-478 records the per-minute trigger as "written but not yet
  installed"; the actual crontab was not inspected.
- **`:enterprise` search results for the private-repo 60-day rule** — searches surfaced only the
  public-repo statement; no private-repo auto-disable rule was found.

## Sources

All web sources were read **2026-09-27** unless a different date is stated.

### Primary web sources (vendor, specification, framework, first-party repository)

- RFC 8292, *VAPID for Web Push* — https://www.rfc-editor.org/rfc/rfc8292.txt (P-256 key pair §2;
  JWT claims §3.2; subscription binding and rotation §4.2)
- RFC 8030, *Generic Event Delivery Using HTTP Push* — https://www.rfc-editor.org/rfc/rfc8030.txt
  (application server POSTs §2/§5; 201 not delivery §5; receipts §5.1; TTL §5.2; Urgency §5.3;
  Topic §5.4; retry until expiry §6.2; ≥4096 bytes §7.2; 404 and expiration §7.3)
- RFC 8291, *Message Encryption for Web Push* — https://www.rfc-editor.org/rfc/rfc8291.txt
  (referenced by RFC 8292 §7.1; framing not re-read here)
- WebKit, *Web Push for Web Apps on iOS and iPadOS* (2023-02-16) —
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (Home Screen requirement;
  user-interaction permission; no Developer Program membership; Focus/Lock Screen; manifest `id`)
- Apple, *Sending web push notifications in web apps and browsers* (markdown) —
  https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md
  (TTL storage; `VapidPkHashMismatch`; error `reason` table; `userVisibleOnly`)
- MDN, *PushManager.subscribe()* —
  https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe (last modified 2025-06-23;
  `applicationServerKey`; `userVisibleOnly`)
- MDN, *Notification.requestPermission()* —
  https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static (last
  modified 2025-06-11)
- Chrome for Developers, *Use Web Push* (published 2024-02-05) —
  https://developer.chrome.com/docs/extensions/how-to/integrate/web-push (Chrome's push service is
  FCM; `web-push` as own backend)
- web.dev, *Sending messages with web push libraries* —
  https://web.dev/articles/sending-messages-with-web-push-libraries (library recommendation;
  404/410 handling)
- web.dev, *Common issues and reporting bugs* —
  https://web.dev/articles/push-notifications-common-issues-and-reporting-bugs (status table;
  FCM key-mismatch errors)
- web-push — https://github.com/web-push-libs/web-push (CLI generation; `TTL`/`urgent`/`topic`;
  browser support); npm metadata https://www.npmjs.com/package/web-push (3.6.7, published
  2024-01-16); GitHub API `repos/web-push-libs/web-push` (`pushed_at` 2026-09-21)
- pywebpush — https://pypi.org/project/pywebpush (dependency list) and
  https://github.com/web-push-libs/pywebpush (key input formats; `pushed_at` 2026-09-01)
- py-vapid — https://github.com/web-push-libs/vapid/blob/master/python/README.md (`--gen`,
  `--applicationServerKey`, claims)
- mozilla-services/autopush-rs README — https://github.com/mozilla-services/autopush-rs (Mozilla's
  Web Push server)
- Microsoft Learn, *ForceBuiltInPushMessagingClient* —
  https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/forcebuiltinpushmessagingclient
  (Edge uses WNS); *WNS overview* —
  https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview
  (native-app auth flow; 410 on expired channel)
- Apple, *Become a member* — https://developer.apple.com/programs/enroll/ ("99 USD per membership
  year"; prices vary by region)
- Apple, *Developer account overview* —
  https://developer.apple.com/help/account/basics/about-your-developer-account (free Personal
  Team, 10 App IDs / 3 devices / 7-day expiry; advanced capabilities need membership)
- Apple, *Communicate with APNs using authentication tokens* —
  https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens
  (key + JWT flow; key does not expire, can be revoked; required role)
- Apple, *Establishing a token-based connection to APNs* —
  https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
  (ES256 JWT; "You request this key from your developer account")
- Apple, *Sending notification requests to APNs* —
  https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
  (HTTP/2 + TLS 1.2; 4 KB / 4096-byte payload; 5 KB VoIP; binary protocol retired 2021-03-31)
- Google, *Firebase Cloud Messaging* overview — https://firebase.google.com/docs/cloud-messaging
  (sender/client split; 4096-byte payload; updated 2026-09-24)
- Google, *FCM throttling and quotas* —
  https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas (600k/min per project;
  240/min and 5,000/hr per device; collapsible burst; 429; iOS errors above APNs limits; updated
  2026-09-24)
- Google, *Firebase pricing* — https://firebase.google.com/pricing (Cloud Messaging (FCM) row:
  "No-cost"; Spark plan no-cost usage)
- Google, *FCM iOS certificates* — https://firebase.google.com/docs/cloud-messaging/ios/certs
  (APNs auth key created in the Apple Developer Member Center)
- Google, *FCM Android client setup* — https://firebase.google.com/docs/cloud-messaging/android/client
  (Google Play services check)
- Google, *Use the FCM v1 API* — https://firebase.google.com/docs/cloud-messaging/send/v1-api
  (service account JSON; short-lived OAuth 2.0 access token)
- Expo, *Push notifications setup* — https://docs.expo.dev/push-notifications/push-notifications-setup
  (modified 2026-07-28; paid Apple Developer Account for iOS credentials; FCM for Android;
  development-build path)
- Expo, *Push FAQ* — https://docs.expo.dev/push-notifications/faq (service free; 600/second limit;
  no SLA; SDK 53+ Expo Go unsupported)
- Expo, *Sending notifications* — https://docs.expo.dev/push-notifications/sending-notifications
  (HTTPS POST; tickets/receipts; 600/second request error)
- Capacitor, *Push Notifications – Firebase* —
  https://capacitorjs.com/docs/guides/push-notifications-firebase (paid Apple Developer account
  and APNs key required on iOS)
- ntfy — *Sending messages* https://docs.ntfy.sh/publish/ (topic is the password; no sign-up;
  PUT/POST API; attachments); *Limitations* https://docs.ntfy.sh/publish/#limitations (250
  messages/day, burst/refill, 4,096-byte messages, 30 subscriptions, 2 MB/20 MB attachments,
  200 MB/day); *Configuration* https://docs.ntfy.sh/config/ ([iOS instant
  notifications](https://docs.ntfy.sh/config/#ios-instant-notifications); [Behind a
  proxy](https://docs.ntfy.sh/config/#behind-a-proxy-tls-etc); [Access
  control](https://docs.ntfy.sh/config/#access-control); [Message
  cache](https://docs.ntfy.sh/config/#message-cache): 12 h default); *Installation*
  https://docs.ntfy.sh/install/; *Pricing* https://ntfy.sh/#pricing; *FAQs*
  https://docs.ntfy.sh/faq/ (best-effort droplet; topic names in logs; iOS app "bare bones … a
  little buggy"); *From your phone* https://docs.ntfy.sh/subscribe/phone/
- Telegram — *Bot FAQ* https://core.telegram.org/bots/faq (free; 1/s per chat, 20/min per group,
  ~30/s bulk; paid broadcasts beyond); *Bot API* https://core.telegram.org/bots/api
  (`sendMessage`, `chat_id`+`text`, `disable_notification`, 429 `retry_after`); *Bots — intro*
  https://core.telegram.org/bots (bots cannot start conversations)
- Google — *Sign in with app passwords* https://support.google.com/accounts/answer/185833
  (16-digit; requires 2-Step Verification); *IMAP/SMTP configuration*
  https://developers.google.com/gmail/imap/imap-smtp (`smtp.gmail.com`, 465/587); *Limits for
  sending & getting mail* https://support.google.com/mail/answer/22839 (500/day consumer; blocked
  1–24 h)
- Resend — *Pricing* https://resend.com/pricing (Free: $0, 3,000/month, 100/day, 3 domains)
- Gotify — https://gotify.net/ and https://github.com/gotify/server (server + web UI + CLI +
  Android app; no iOS client); App Store — iGotify https://apps.apple.com/us/app/igotify/id6473452512
  (third-party iOS client, free + IAP)
- UnifiedPush — *Distributors* https://unifiedpush.org/users/distributors/ (Android/Linux only);
  *FAQ* https://unifiedpush.org/users/faq/ (iOS not possible for the foreseeable future)
- Backblaze — *Event Notifications Quickstart*
  https://www.backblaze.com/docs/cloud-storage-event-notifications; *Reference Guide*
  https://www.backblaze.com/docs/cloud-storage-event-notifications-reference-guide (25 rules;
  webhook only; at-least-once; 3-second timeout; HMAC; `eventId`); *How to Create and Use …*
  https://www.backblaze.com/docs/cloud-storage-create-and-use-event-notifications; *transaction
  pricing* https://www.backblaze.com/cloud-storage/transaction-pricing (Class A/B/C; Class D first
  2,500/day free then $0.004/10,000); *Data Caps and Alerts*
  https://www.backblaze.com/docs/en/cloud-storage-data-caps-and-alerts; *b2_list_file_names*
  https://www.backblaze.com/apidocs/b2-list-file-names (Class C, per-1000 billing); pricing
  https://www.backblaze.com/cloud-storage/pricing
- Vercel, *Usage & Pricing for Cron Jobs* — https://vercel.com/docs/cron-jobs/usage-and-pricing
  (Hobby: minimum once per day, per-hour ±59 min precision; updated 2026-07-15)
- GitHub, *Events that trigger workflows — `schedule`* —
  https://docs.github.com/en/actions/reference/events-that-trigger-workflows (shortest interval
  5 minutes; public-repo 60-day auto-disable); *Actions runner pricing* —
  https://docs.github.com/en/billing/reference/actions-runner-pricing (minutes rounded up);
  *GitHub Actions billing* —
  https://docs.github.com/en/billing/concepts/product-billing/github-actions (private-repo free
  minutes: Free 2,000 / Pro 3,000)

### Labelled non-primary sources (community, forum, search snippets)

- W3C push-api issue #291 — https://github.com/w3c/push-api/issues/291 (re-subscribe on key change;
  community)
- firebase-js-sdk issue #7309 — https://github.com/firebase/firebase-js-sdk/issues/7309 (iOS
  `notificationclick` field reports; community)
- Stack Overflow 75792142 and related threads (iOS notification actions / deep-link reports;
  community), and Stack Overflow / Microsoft Q&A Edge-WNS endpoint reports
- gotify/server issue #87 — https://github.com/gotify/server/issues/87 (iOS obstacle; read via
  search snippet)

### Repo documents and code read at HEAD `d71ba64` (read 2026-09-27)

- `PRODUCT.md:9-19,44-48,65-68` (one operator; zero spend; phone as full planner; no silent
  failure; glossary copy)
- `CONTEXT.md:149-181` (Mission State and the state words; Flown; Withdrawn; Superseded)
- `README.md:116-126` (host credential files; Vercel envs), `:159` (private repo)
- ADR 0016 `docs/adr/0016-mission-generation-and-loading-for-the-rc2.md:66-68,232-235,472-493,480-485,487-493`
- ADR 0017 `docs/adr/0017-mission-specs-through-object-storage-in-canada.md:20-26,53-55`
- ADR 0019 `docs/adr/0019-mission-status-through-the-store.md:3-6,16-21,22-25,26-32,33-46,37-40,39-40,41-42,43-46,48-56`
- ADR 0021 `docs/adr/0021-one-mission-one-lifecycle-in-the-store.md:30-38,36-38,50-53,73-77,79-82`
- ADR 0022 `docs/adr/0022-cards-are-reserved-at-dispatch.md:26-35,39,41-50,52-56`
- `web/lib/keys.ts:5-27`; `web/lib/auth.ts:10-40`; `web/lib/b2.ts:1-5,16-32,41-52,140-159`;
  `web/lib/missionStore.ts:99-101,107-148,162-182`;
  `web/lib/missionRecords.ts:26-28,218-234,241-248,261-321,351-365`; `web/lib/missions.ts:34-37`;
  `web/lib/model.ts:12-24,26-51,82-94,121-161`; `web/lib/spec.ts:1-8`; `web/lib/passphrase.ts:14`;
  `web/lib/actions.ts:64-68,75,85`
- `web/app/api/missions/route.ts:33-34,44-76,146-153,172-192,227-258`;
  `web/app/api/missions/dispatch/route.ts:27-28,112-127,132-156,161-162,171-196,195-211`;
  `web/app/api/missions/withdraw/route.ts:75,81-94`;
  `web/app/api/missions/flown/route.ts:97-127`
- `web/components/MissionList.tsx:202-225`; `web/components/MapPane.tsx:1-20`
- `web/package.json:10,25`; `web/next.config.ts`; `web/scripts/map-chrome-check.mjs:1-16`;
  `web/README.md:5-6,22,26` (stale description, noted)
- `scripts/mission/b2.py:23,26-36,63,85`; `scripts/mission/b2_status.py:50-117,227-239,274-289`;
  `scripts/mission/collect.py:126-144,159,190-243`;
  `scripts/mission/load.py:23-24,78-87,875-899,945-973,1019-1027,1122-1147,1175-1189,1192-1222,1229-1293,1296-1316`
- `docs/mission-lifecycle-stress-test.md:36,63,111`

### This run's artifacts

- `.autoforge/discovery/report.md`; `.autoforge/plans/plan.md`;
  `.autoforge/inputs/mobile-stack.md`; `docs/research/mobile-stack.md` on `research/mobile-stack`
- `.autoforge/execution/notes-web-push.md`; `notes-platform-push.md`; `notes-relays.md`;
  `notes-senders.md`
- Tickets #232, #246 via `gh issue view` (read-only, 2026-09-27)




