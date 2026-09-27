# Can the installed PWA reach the Linux-board Loader on the phone's hotspot, with no internet? (2026-09-27)

Research for ticket [#252](https://github.com/Akamel01/drone-survey/issues/252), under the parent
map [#229](https://github.com/Akamel01/drone-survey/issues/229). One question: an **installed
PWA served over HTTPS from Vercel** must find and command the **small Linux board** that Loads the
RC2, while phone and board sit on the **phone's own hotspot with no internet** — on **iOS Safari
(installed web app)** and **Android Chrome**.

**Settled inputs, not re-litigated.** A phone cannot Load the RC2 over USB on either platform; the
RC2 keeps the USB host role and exposes MTP only, so Loading stays on the Linux board
(`#230`; `docs/adr/0016-mission-generation-and-loading-for-the-rc2.md:480-493`). The phone
experience is an **installable PWA** over the existing Next.js planner (`#231`;
`docs/research/mobile-stack.md` on `research/mobile-stack`, read 2026-09-27), and push is Web Push
from that PWA with an ntfy-style fallback (`#232`; `docs/research/push-zero-spend.md` on
`research/push-zero-spend`, read 2026-09-27). This ticket is the prerequisite for "how the app
drives the Linux-board loader" (`docs/adr/0016-...:487-493`).

Method: primary sources first (specifications, vendor documentation, Chromium/WebKit issue
trackers, AOSP source), each carrying the date it was read — all web sources were read
**2026-09-27**. Secondary pages (a blog or forum) are labelled as such. Anything not read or
measured is marked **INFERRED**. Repo facts are cited as `path:line` at branch
`research/pwa-local-loader`.

## Verdict

| # | Route | iOS, installed web app | Android Chrome | What it costs / what the board must run |
|---|---|---|---|---|
| 1 | PWA (Vercel, HTTPS) fetches `http://172.20.10.x/…` directly | **DOES NOT WORK** — mixed content; WebKit has not implemented the exemption | **WORKS**, Chrome 142+ after the user grants the Local Network Access prompt | Board: a plain HTTP API with CORS. User: one prompt tap. No certificate |
| 2 | Board over **HTTPS with a certificate from a local CA** trusted on the phone | **WORKS in principle** (only the trust store is in the way); vendor statements do not cover the installed-web-app half — field test required | **WORKS**; the LNA permission still applies because the target is a local address | Board: TLS + local CA + CORS. User: one-time CA profile install + "full trust" toggle |
| 3 | Public domain pointed at a private IP, publicly trusted certificate | **DOES NOT WORK** with no internet — DNS cannot resolve the name; issuance itself needs internet | **DOES NOT WORK** — same DNS failure | Board: nothing helpful here; certificate issuance needs DNS-01 and online DNS at runtime |
| 4 | Self-signed certificate on the board | **DOES NOT WORK** — untrusted certificate is not a secure context; no click-through for a `fetch()` | **DOES NOT WORK** — same | Board: nothing; gains nothing |
| 5 | Board serves the app (or a Load page) itself; phone opens it as a top-level page | **WORKS as a webpage** — top-level navigation is not mixed content; it is not the PWA (no service worker, no push) | **WORKS as a webpage**; no install promotion (not HTTPS) | Board: static app or a minimal page + API. Updates are manual; push is gone |
| 6 | WebRTC data channel over the hotspot | **POSSIBLE, UNPROVEN** — no mixed-content rule applies, but signaling must be exchanged out-of-band and Safari's host-candidate behaviour without STUN is unverified | **POSSIBLE, UNPROVEN** — same signaling problem; mDNS ICE candidates | Board: a WebRTC stack (e.g. `aiortc`, `libdatachannel`) + a manual/QR signaling scheme |
| 7 | Web Bluetooth | **DOES NOT WORK** — WebKit's position is *oppose*; no implementation in Safari (extension polyfills excluded) | **WORKS** — secure context + user gesture; board is the GATT peripheral | Board: BlueZ GATT server. Does not need the hotspot at all |
| 8 | Relay through the internet when there is signal | **WORKS with signal**, does not work with none (by definition) | **WORKS with signal**, not without | Board: its existing outbound B2 access (`scripts/mission/collect.py`); no new component |
| 9 | Board's own page opened directly | **WORKS** — this is route 5's mechanism, and the only stock iOS route | **WORKS** | Board: an HTTP server; no TLS |

## Direct answers

### (a) What blocks the PWA from reaching the board today (2026-09-27)

**Mixed content (both platforms).** `fetch()` and `XMLHttpRequest` are in mixed content's
**blockable** category: "Mixed content requests are insecure requests for resources from a secure
context", and blockable content is blocked rather than upgraded
([MDN, *Mixed content*](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content),
last modified 2026-08-15 by MDN, read 2026-09-27). An HTTPS page issuing `fetch()` to an HTTP URL
is therefore blocked. Chrome's own blog states the requests "would be blocked
as mixed content if requested from an HTTPS page in browsers that don't yet support the Local
Network Access mixed content exemption"
([Chrome for Developers, *New permission prompt for Local Network Access*](https://developer.chrome.com/blog/local-network-access),
published 2025-06-09, update 2025-09-29, read 2026-09-27). WebKit still blocks it: bug 171934
"Don't treat loopback addresses … as mixed content" is **NEW** and unassigned, and bug 173161
"Safari rejects requests to `http://127.0.0.1` from `https://` pages" was closed as its duplicate
([WebKit bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934),
[WebKit bug 173161](https://bugs.webkit.org/show_bug.cgi?id=173161), read 2026-09-27). The
specific case here — `https://…vercel.app` → `http://172.20.10.2` — is exactly that class.

**Chrome / Chromium — Local Network Access (LNA), shipped.** LNA replaces the abandoned Private
Network Access effort ("Local Network Access replaces that effort, after PNA was put on hold",
Chrome blog above). Points that decide this ticket:

- Requests from a public site to a **local address or loopback** now require a **permission
  prompt**; the prompt reads **"Look for and connect to any device on your local network."**
  (Chrome blog, read 2026-09-27). The permission "is restricted to secure contexts".
- **Launching in Chrome 142** (blog update 2025-09-29), and by 2026-01-21 the MDN issue tracking
  the spec recorded "Stable (144): LNA restrictions are active"
  ([mdn/mdn#791](https://github.com/mdn/mdn/issues/791), opened 2026-01-21, read 2026-09-27).
  Chrome on Android is included: the Intent to Ship lists "Shipping on Android | 141"
  ([blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY),
  read 2026-09-27), and the thread's 2025-09-29 launch update moves the prompt to **Chrome 142
  on both desktop and Android**, superseding the Intent's 141 and matching the "Chrome 142+"
  verdict table.
- **If the user grants it, mixed content blocking is relaxed for local network requests.** The
  Intent: "If granted, the permissions additionally relaxes mixed content blocking for local
  network requests (since many local devices are not able to obtain publicly trusted TLS
  certificates)." The blog's examples: a private IP literal (`http://192.168.0.1`) or a `.local`
  domain is exempt from the mixed-content check *when Chrome knows before resolving that the
  request goes to the local network*; a public domain is not. MDN states the same ("If granted,
  the permissions additionally relax mixed content blocking for local network requests.",
  [MDN, *Local network access*](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access),
  read 2026-09-27).
- Initial coverage is `fetch()`, subresource loading and subframe navigation; WebSockets,
  WebTransport and WebRTC are named as "not yet gated" at the time of the blog and "in progress"
  (Chrome blog and Intent, read 2026-09-27). MDN's page (2026) lists WebSockets and WebRTC among
  affected request types.
- **Service workers:** "Local network requests from Service Workers and Shared Workers require
  that the worker's origin has previously been granted the Local Network Access permission" and
  the site should "separately trigger a local network request from your application in order to
  trigger the permission prompt" (Chrome blog, read 2026-09-27). So the PWA must make one normal
  page-level fetch and win the prompt before a cached service worker can talk to the board.

**Android can also put a permission in front of Chrome itself.** Chrome's blog says "Android is
adding a Local Network permission which would apply to the app that embeds the WebView", linking
`developer.android.com/privacy-and-security/local-network-permission` (Chrome blog; that Android
page timed out from this environment on 2026-09-27 and was not read — treat version and wording as
unverified). **INFERRED**: on Android versions where that app-level permission ships, Chrome may
need it once in addition to the per-site LNA prompt. A field test settles it.

**iOS WebKit — no LNA, no mixed-content exemption.** WebKit has not implemented Local Network
Access: bug 250607 "Implement Local Network Access" is **NEW**, reported 2023-01-13, last modified
**2026-07-21**, with dependencies still open
([WebKit bug 250607](https://bugs.webkit.org/show_bug.cgi?id=250607), read 2026-09-27). WebKit's
standards position on the spec is supportive, but a position is not an implementation
([WebKit/standards-positions#163](https://github.com/WebKit/standards-positions/issues/163),
closed 2023, read 2026-09-27). `Request.targetAddressSpace`, the spec's explicit
mixed-content-skip option, is not supported in Safari through version 27 TP
([caniuse](https://caniuse.com/mdn-api_request_request_options_parameter_targetaddressspace),
secondary, read 2026-09-27); WebKit bug 304164 records Safari 26.2 *throwing a TypeError* on
`targetAddressSpace: 'loopback'`, later fixed in 26.4 by handling the option — not by shipping the
feature ([WebKit bug 304164](https://bugs.webkit.org/show_bug.cgi?id=304164); release note
"Fixed a regression where `fetch()` would throw a TypeError when using
`targetAddressSpace: 'loopback'`" in [WebKit Features for Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4),
published 2026-03-24, read 2026-09-27). **Consequence: on iOS there is no permission to grant and
no exemption to earn; the HTTPS→HTTP request is simply blocked.**

**App Transport Security (ATS) does not decide this.** ATS "improves privacy and data integrity
for all apps and app extensions" by requiring TLS on connections "made by your app"; it applies
to the URL Loading System and can be relaxed for web views via
`NSAllowsArbitraryLoadsInWebContent` ([Apple, *Preventing Insecure Network Connections*](https://developer.apple.com/documentation/security/preventing-insecure-network-connections),
read 2026-09-27). Safari and an installed web app are not "your app" in that sense; the gate for
web content is mixed content plus certificate trust, covered above. **INFERRED** from the
document's own scope (it never mentions Safari or home-screen web apps); no Apple statement about
ATS and installed web apps was found.

**iOS app-level local-network privacy exists but is for apps, not websites.** Since iOS 14 "any
app that wants to interact with devices on your network must ask for permission" and appears in
Settings → Privacy & Security → Local Network
([Apple, *If an app would like to connect to devices on your local network*](https://support.apple.com/en-us/102229),
read 2026-09-27). No source read shows a website or an installed web app appearing in that list,
and WebKit's LNA bug being open is consistent with websites never being prompted. **INFERRED**:
Safari does not ask; it blocks (route 1) or proceeds when the certificate is trusted (route 2).
Apple's Safari 18.4 security notes do list "An app may gain unauthorized access to Local Network"
under Safari (CVE-2025-31184, [Apple support 122379](https://support.apple.com/en-us/122379),
read 2026-09-27 via search summary — the page text itself was not re-read), which shows Safari has
some local-network permission plumbing, but no user-facing website prompt is documented anywhere
read. This is the single largest field-test unknown for iOS.

### (b) Every route the ticket lists, and what it costs

**1. Direct `http://` to the board (no certificate).**
- **Android Chrome: WORKS** on Chrome 142+: the page origin
  (`https://<planner>.vercel.app`) asks for the LNA permission, the user taps Allow once, and the
  mixed-content exemption lets `fetch("http://172.20.10.2:8080/…")` through (Chrome blog and
  Intent, read 2026-09-27). The board adds nothing but its HTTP API and `Access-Control-Allow-Origin`
  for the PWA origin — normal CORS still applies; LNA is a permission gate, not a CORS substitute.
  Operational details: trigger the prompt from the page (not a worker) before relying on the
  service worker, and remember the permission is per-origin and revocable in Chrome's site
  settings (Chrome blog, read 2026-09-27).
- **iOS: DOES NOT WORK.** No LNA, mixed content blocked (a, above). This is the route the ticket
  imagined, and it is the one Android ships and iOS does not.

**2. A certificate on the board.**
- **2a. Real public domain pointed at a private IP.** A publicly trusted certificate can exist for
  a public name that resolves to a private address — Let's Encrypt: "It's possible to set up your
  own domain name that happens to resolve to `127.0.0.1`, and get a certificate for it using the
  DNS challenge" ([*Certificates for localhost*](https://letsencrypt.org/docs/certificates-for-localhost/),
  updated 2025-07-31). HTTP-01 instead requires the name to be retrievable on port 80 from the
  public internet, while DNS-01 states: "You can use this challenge to validate domain names
  whose webservers aren't exposed to the public internet."
  ([*Challenge Types*](https://letsencrypt.org/docs/challenge-types/), updated 2026-02-12; both
  pages read 2026-09-27). **With no internet this fails at runtime on both platforms:
  the phone cannot resolve a public name** — the hotspot's resolver is the phone itself, which
  forwards upstream, and there is no upstream. Routes 2b/2c collapse into this one at a Site.
  Cost: domain, DNS provider, ACME automation at the home/office, renewal.
- **2b. Self-signed certificate.** The certificate is not signed by a CA in the phone's trust
  store, so the browser shows an interstitial and the certificate is not valid for the request.
  `fetch()` has no user gesture to click through an interstitial, and an untrusted origin is not a
  secure context, so service worker, install and Web Push are out regardless. **INFERRED** from
  the trust model (Apple's manual-trust article implies an untrusted profile "isn't automatically
  trusted for SSL", [Apple support 102390](https://support.apple.com/en-us/102390), published
  2025-03-26, read 2026-09-27); no field measurement was made. **DOES NOT WORK** on either
  platform as a basis for the PWA.
- **2c. A local CA, installed and trusted on the phone.** The board runs `https://` with a leaf
  certificate signed by a private CA (mkcert-style; Let's Encrypt's own guidance recommends
  exactly this for local devices: "Generate your own certificate, either self-signed or signed by
  a local root, and trust it in your operating system's trust store", *Certificates for
  localhost*, read 2026-09-27). On iOS the operator installs the CA profile and then enables it
  under **Settings → General → About → Certificate Trust Settings → Enable full trust for root
  certificates** ([Apple support 102390](https://support.apple.com/en-us/102390), published
  2025-03-26, read 2026-09-27); Android has the equivalent user-trust store install (same
  Let's Encrypt source: "install … in your list of locally trusted roots").
  - **iOS: WORKS in principle.** Once the certificate validates, the request is ordinary HTTPS
    from a secure context: no mixed content applies, and WebKit imposes no local-network gate of
    its own (a, above). The board must answer CORS for the Vercel origin. **This is the only route
    found that removes the block on iOS without a store app.** It rests on standards behaviour and
    the trust store, not on any Apple or WebKit statement that web apps get this treatment;
    field test required.
  - **Android: WORKS** too. The target is still a local address, so Chrome's LNA prompt appears
    the first time and must be granted; after that, HTTPS is unremarkable. The user-installed CA
    is trusted by Chrome for browser traffic (same Let's Encrypt source; field-verify on the
    phone in use).
  - Cost: certificate lifecycle (a CA key and leaf certs to manage, SANs to get right), the
    profile install and full-trust toggle on iOS, and the CORS surface. The leaf must name what
    the PWA dials: an IP SAN (`https://172.20.10.2`) or a name the phone can resolve (`board.local`
    via mDNS on iOS; on Android Chrome `.local` does not resolve — see (c)).
  - The board can rotate to route 1 later for Android users; the certificate only exists to make
    iOS possible.
- **2d. Board runs its own DNS.** With no internet, a public name cannot be resolved unless the
  phone queries the board. On the phone's own hotspot the phone is the DHCP/DNS server
  (**INFERRED** from the hotspot behaviour in (c); no Apple or Google document read describes
  configuring the hotspot's DNS), so a resolver on the board is not consulted. Discarded.

**3. The board serves the app itself** (static copy of the planner, or a minimal Load page).
Top-level navigation to `http://172.20.10.2/` is **not** mixed content: "navigation requests from
a secure context that target insecure target top-level browsing contexts are not considered mixed
content as they create a new context that will either be secure or insecure independent of the
origin of the request" (MDN, *Mixed content*, read 2026-09-27). **WORKS on both platforms as a
webpage.** What breaks:
- It is **not a secure context**: `http://172.20.10.2` is not in MDN's potentially-trustworthy
  list (HTTPS, `file`, `127.0.0.0/8`, `::1`, `localhost`) alone, so **no service worker
  registration** ("Only secure contexts are allowed to register service workers") and therefore no
  offline shell, no Web Push, no install promotion ([MDN, *Secure contexts*](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts),
  last modified 2026-09-14 by MDN, read 2026-09-27; Chrome's install criteria likewise require
  "Be served over HTTPS", [web.dev, *What does it take to be installable?*](https://web.dev/articles/install-criteria),
  updated 2024-09-19, read 2026-09-27).
- On iOS the page can still be added to the Home Screen (iOS 26 opens every Home Screen addition
  as a web app, [WebKit, *WebKit Features in Safari 26.0*](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
  published 2025-09-15, read 2026-09-27), but without a service worker it is a bookmark, not the
  offline PWA from #231/#232.
- **It is a second app**: a different origin from the Vercel PWA, so the push subscriptions,
  cached Mission records and outbox built for the Vercel origin do not exist there. Updates now
  ship to the board (SSH or a file drop) instead of a Vercel deploy.
- If the board serves it over **HTTPS with the local CA** instead, it becomes a secure context and
  a real PWA — at the cost of route 2c's certificate work, duplicated on another origin.
- This route is the most robust fallback: it needs no browser security feature at all beyond
  top-level navigation.

**4. WebRTC (data channel over the hotspot).** WebRTC is not subject to mixed-content blocking —
its transport is DTLS, and the API is usable from the secure Vercel page. It therefore does not
need the board's certificate or Chrome's mixed-content exemption. Two problems:
- **Signaling has no local channel.** SDP/ICE exchange must reach the board, and every in-band way
  to do that is a request to the board — blocked on iOS exactly as route 1 is, and gated by LNA on
  Android. The remaining signaling options are out-of-band: QR codes (phone displays an offer, the
  board scans it with a camera — hardware the board may not have), or a manual paste of a
  compressed blob. This is the chicken-and-egg the ticket names, and it is real.
- **ICE host candidates are mDNS-obfuscated.** Browsers replace local IPs in host candidates with
  ephemeral `…-….local` names, per the IETF work ("obfuscating IP addresses with dynamically
  generated Multicast DNS names",
  [draft-ietf-mmusic-mdns-ice-candidates](https://www.ietf.org/archive/id/draft-ietf-mmusic-mdns-ice-candidates-02.html),
  read 2026-09-27); Chrome has shipped this behind a policy since 2019
  ([Chromium issue 40102614](https://issues.chromium.org/40102614), read 2026-09-27). The board
  must then resolve `.local` — fine on iOS (see (c)) and something Chrome's WebRTC stack does
  internally, but it means the board needs Avahi and the path needs a field test. Safari's host
  candidates without any STUN server (there is none, there is no internet) are **UNVERIFIED**.
- **Board must run**: a WebRTC stack (`aiortc` or `libdatachannel`), an out-of-band signaling
  scheme, and a small protocol over the data channel in place of HTTP. Verdict: **POSSIBLE,
  UNPROVEN on both platforms**; the worst effort-to-certainty ratio of the working routes.

**5. Web Bluetooth.** Chrome's Web Bluetooth works only in a secure context and requires a user
gesture (`navigator.bluetooth.requestDevice` "must be triggered by a user gesture"), and it is
available on Chrome for Android ([Chrome for Developers, *Communicating with Bluetooth devices
over JavaScript*](https://developer.chrome.com/docs/capabilities/bluetooth), read 2026-09-27).
The board becomes a BLE GATT peripheral (BlueZ; any GATT server library). **Android: WORKS** —
and it does not need the hotspot, the certificate or LNA at all; it needs the board's Bluetooth
radio and the phone within range. **iOS: DOES NOT WORK** — WebKit's standards position is
**`position: oppose`** (privacy, security, device-independence concerns), resolved 2025-12-02
([WebKit/standards-positions#570](https://github.com/WebKit/standards-positions/issues/570),
updated 2025-12-03, read 2026-09-27); Safari and iOS have no implementation (caniuse lists Safari
through 27 TP as unsupported, and notes third-party extension polyfills exist — that is a browser
extension, not the installed PWA, [caniuse.com/web-bluetooth](https://caniuse.com/web-bluetooth),
secondary, read 2026-09-27). For discovery, note the PWA cannot passively scan advertisements
(`requestLEScan` is not shipped); the chooser can only show named devices, so the board should
advertise a stable name prefix.

**6. Relay through the internet when there is signal.** This is the design already in ADR 0016:
the planner writes Specs to object storage through its server-side route, the board polls and
Collects (`docs/adr/0016-...:220-248`, `scripts/mission/collect.py`), and push flows out from
Vercel and the board (`docs/research/push-zero-spend.md`). **WORKS on both platforms when the
hotspot has mobile data; DOES NOT WORK with no internet, by definition.** No new component; the
board already needs internet for Collecting (`docs/adr/0016-...:487-493`). Its value here is to
mark the boundary: the "no internet" case is precisely what routes 1, 2c and 5 must cover.

**7. Opening the board's own page directly.** Same mechanics as route 3; the cheapest working
fallback. Cost: the operator must know the address (see (c)) and leave the installed PWA; the
page carries no PWA features. **WORKS on both platforms today.**

### (c) Finding the board on the hotspot with no internet

**What address the phone's hotspot hands out.**
- **iOS Personal Hotspot**: the phone is gateway at `172.20.10.1`, subnet `255.255.255.240`
  (`/28`), DHCP clients in `172.20.10.2–172.20.10.14`, and DNS is the gateway
  ([osxdaily](https://osxdaily.com/2013/10/13/personal-hotspot-drop-connection-fix/) reader
  measurements and [capsicumdreams GPS2IP docs](https://capsicumdreams.com/gps2ip/docs/settings/network)
  — **secondary sources**, read 2026-09-27; Apple does not publish the range in the support pages
  read). Treat the exact range as a **field-test item**. There is no user-facing DHCP reservation
  on the hotspot.
- **Android hotspot (AOSP default)**: "Wifi is 192.168.43.1 and 255.255.255.0" with the legacy
  DHCP range `192.168.43.2–192.168.43.254`, straight from the source
  ([AOSP `TetheringConfiguration.java`](https://android.googlesource.com/platform/packages/modules/Connectivity/+/refs/heads/master/Tethering/src/com/android/networkstack/tethering/TetheringConfiguration.java),
  read 2026-09-27). OEM builds vary — field test on the operator's phone.
- Neither hotspot lets the operator configure a static lease. **INFERRED**: the board can be
  *given* a fixed address in the subnet by configuration, but a collision with the phone's DHCP
  pool is possible; the safer default is "take the lease and tell the phone where you are".

**mDNS / Bonjour (`board.local`).**
- **iOS: resolves in browsers.** Chromium's own issue tracking Android `.local` support states:
  "This is supported on iOS, on both Chrome and Safari. Android has an mDNS client API."
  ([Chromium issue 41127207, "Consider bypassing Android resolution to allow .local via mDNS"](https://issues.chromium.org/issues/41127207),
  read 2026-09-27 via search excerpt; the tracker page itself does not render without sign-in —
  labelled). No iOS LNA gate applies (a, above), so an installed web app fetching
  `https://board.local:8443/…` faces only certificate and CORS checks.
- **Android Chrome: no.** Same Chromium issue: Android's system resolver does not resolve `.local`;
  mDNS is an API (`NsdManager`) that apps must use, not part of normal name resolution for
  browser navigations or `fetch()` (Chromium issue 41127207; a F-Droid app's issue states it
  plainly — secondary,
  [findroid#109](https://github.com/jarnedemeulemeester/findroid/issues/109), read 2026-09-27).
  So on Android the PWA must dial an **IP address**, not a `.local` name. (Whether Chrome's own
  built-in resolver handles `.local` by mDNS where it is active is **INFERRED** and could not be
  verified: the Chromium `net/dns` README read for this claim contains no mention of mDNS,
  `.local` or multicast, and no other primary source was found. The Chromium issue above remains
  the authority for the Android case: `.local` is not resolved there.)
- Does the iOS local-network permission gate mDNS? Not for websites, as far as any source read
  shows (a). Field test.

**How the PWA learns the address, in each case.**
- **iOS + route 1 fails; iOS + route 2c**: try `https://board.local:8443` first (mDNS), fall back
  to a remembered IP, fall back to scanning the tiny hotspot subnet (`172.20.10.2–172.20.10.14`,
  a handful of addresses) for the board's identifying endpoint. No permission gates this on iOS;
  the certificate must cover whichever name/IP is used.
- **Android**: a remembered IP entered once, or a short probe of likely addresses
  (`192.168.43.2–…` on AOSP) **after** the LNA permission is granted; one prompt covers all
  local addresses for that origin, so a small sweep is one user gesture, not one per address
  (LNA permission is per-origin — Chrome blog, read 2026-09-27). `board.local` is not an option
  on Android Chrome.
- **Board announcing itself**: Avahi/mDNS makes `board.local` work on iOS; BLE advertising only
  helps Android users who connect over Web Bluetooth (the chooser shows the device, and a GATT
  characteristic can carry the current IP:port). A tiny fixed fallback — the board takes the
  first lease and the PWA remembers the address after one discovery — covers the rest. Do not
  build a scanner UI: the address set is one or two candidates.

### (d) Verdict, and what each working route requires of the board

**Plainly, on iOS without a store app:**
- With **nothing installed beyond the PWA, no route reaches the board.** The direct `http://` route
  that Android Chrome ships (LNA, Chrome 142+) **does not exist on iOS**: WebKit has not
  implemented Local Network Access (bug 250607, still NEW, modified 2026-07-21), it still blocks
  the HTTPS→HTTP request as mixed content (bugs 171934/173161), and `targetAddressSpace` is not
  supported. There is no permission prompt to grant.
- There **is** one iOS route that works without a store app, and it is **route 2c: a local CA
  trusted on the phone plus TLS on the board.** It needs a one-time profile install and a
  "full trust" toggle outside the PWA, and the PWA–board conversation is then ordinary HTTPS +
  CORS. It is standards-backed but not vendor-promised for installed web apps; **field test
  required**. If the operator will not install and trust a CA profile on the phone, then the
  honest answer is **no: nothing on iOS reaches the board from the PWA**; the remaining iOS
  options are the board's own page (route 3/7, not the PWA) or WebRTC with manual signaling
  (unproven).
- The ticket's decision for the app architecture can be stated in one line: **iOS needs either a
  trusted certificate on the board or an out-of-browser page; Android needs nothing but a
  permission tap.** If that asymmetry is unacceptable, the store-app question must be reopened.

**What the board must run, per route (existing duties marked):**

| Duty | Needed by | Status |
|---|---|---|
| `load.py` over `jmtpfs`, read-back hash verification, `--newest` trigger | all Loader routes | **exists** (`scripts/mission/load.py`; ADR 0016:472-478) |
| Outbound B2 access for Collecting | route 6; the board's normal operation | **exists** (`scripts/mission/collect.py`; ADR 0016:487-493) |
| Card Ledger written to the store | Dispatch reservation | **exists by design** (ADR 0022:41-45; `load.py`) |
| HTTP(S) API server, CORS for the Vercel origin | routes 1, 2c | new |
| TLS + leaf certificate from a local CA; SAN for `board.local` and/or the hotspot IP; CA profile to install on the phone | route 2c | new |
| Avahi (mDNS) so `board.local` resolves | iOS discovery (c) | new |
| Stable identification endpoint (`/wayfinder` returning name/version) for address probing | discovery (c) | new |
| BlueZ GATT peripheral with a stable advertised name | route 5, Android only | new, optional |
| WebRTC stack + out-of-band signaling | route 4, both platforms, unproven | new, optional |
| Static hosting of the app or a Load page | route 3/7 | new, optional |
| A command/status path from the API to `load.py` (the plug-in trigger exists; the PWA command does not) | all API routes | new |
| Web Push sender (per #232) | notifications | new, separate ticket |

## Open questions / what only a field test can settle

- **iOS + trusted local CA + installed web app**: does the installed web app fetch
  `https://board.local:8443` without an interstitial after the profile and full-trust toggle?
  Does a service-worker fetch to the board succeed? (The LNA analogue would grant the origin
  first; WebKit has no such step.)
- **iOS local-network permission for websites**: Apple's Safari 18.4 security note shows Safari has
  local-network permission plumbing, and one source claims Safari prompts for local network
  access; no primary documentation was found. Watch for an iOS prompt, and for
  Settings → Privacy → Local Network listing Safari or the web app.
- **iOS hotspot range and stability**: confirm `172.20.10.x/28` and that a board's lease survives
  a hotspot toggle and re-join; decide fixed-vs-DHCP.
- **Android LNA in the installed PWA**: confirm the prompt appears in the installed PWA (not just
  a Chrome tab), that the service-worker caveat is as documented, and whether Android 16's
  app-level Local Network permission adds a second prompt for Chrome.
- **Android OEM hotspot subnet**: 192.168.43.1 is AOSP; the operator's phone may differ.
- **WebRTC on Safari with no STUN**: whether host candidates are emitted and reachable via mDNS.
- **Whether mDNS resolution from an installed iOS web app matches Safari's** (verified source
  covers iOS browsers generally, not the installed-web-app process specifically).
- **The board's IP when it is the DHCP client of an iPhone**: whether iOS ever assigns
  `192.0.0.2` (a reported iOS hotspot quirk) instead of the expected subnet.

## Could not verify

- `developer.android.com/privacy-and-security/local-network-permission` — timed out twice
  (2026-09-27); Android's app-level permission version and wording are unread. Only the Chromium
  Intent's summary is cited.
- The Chromium `.local` issue page 41127207 — does not render without sign-in; its quoted text
  comes from the search index, not a direct read.
- The iOS Personal Hotspot subnet — only secondary sources read; no Apple document states the
  range.
- Whether Chrome's built-in resolver resolves `.local` by mDNS — **INFERRED, not verified**; the
  Chromium `net/dns` README read on 2026-09-27 contains no mention of mDNS, `.local` or
  multicast, and no other primary source was found. The Android `.local` advice rests on Chromium
  issue 41127207.
- Safari's treatment of a user-bypassed self-signed certificate for an installed web app — not
  measured; route 4's verdict is inferred from the trust model.
- Whether Safari/installed web apps ever prompt for local network access on a website's behalf —
  no primary source found either way.
- Safari WebRTC host-candidate behaviour with no STUN — not measured.

## Sources

All web sources read **2026-09-27**; publication or update dates are as shown.

Primary (vendor, spec, project source):

- Chrome for Developers, *New permission prompt for Local Network Access* —
  https://developer.chrome.com/blog/local-network-access (published 2025-06-09, updated
  2025-09-29; prompt text, Chrome 142, mixed-content exemption, worker caveat)
- blink-dev, *Intent to Ship: Local network access restrictions* —
  https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY (Android shipping 141;
  "requests from insecure contexts will be silently rejected"; PNA superseded)
- Chromium issue 41127207, *Consider bypassing Android resolution to allow .local via mDNS* —
  https://issues.chromium.org/issues/41127207 (iOS resolves `.local` in Chrome and Safari;
  Android uses an app mDNS API)
- Chromium issue 40102614 — https://issues.chromium.org/40102614 (mDNS obfuscation policy, 2019)
- WebKit bug 250607, *Implement Local Network Access* — https://bugs.webkit.org/show_bug.cgi?id=250607
  (NEW; modified 2026-07-21)
- WebKit bug 171934 — https://bugs.webkit.org/show_bug.cgi?id=171934 (NEW; loopback as mixed
  content)
- WebKit bug 173161 — https://bugs.webkit.org/show_bug.cgi?id=173161 (Safari rejects HTTP
  loopback from HTTPS; duplicate of 171934)
- WebKit bug 304164 — https://bugs.webkit.org/show_bug.cgi?id=304164 (Safari 26.2
  `targetAddressSpace` TypeError)
- WebKit, *WebKit Features in Safari 26.4* — https://webkit.org/blog/17862/webkit-features-for-safari-26-4
  (2026-03-24; the `targetAddressSpace` regression fix)
- WebKit, *WebKit Features in Safari 26.0* — https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
  (2025-09-15; Home Screen additions open as web apps)
- WebKit/standards-positions#570, *Web Bluetooth* —
  https://github.com/WebKit/standards-positions/issues/570 (position: oppose, 2025-12-02)
- WebKit/standards-positions#163, *Local Network Access* —
  https://github.com/WebKit/standards-positions/issues/163 (position: support, closed 2023)
- Apple, *Trust manually installed certificate profiles in iOS, iPadOS, and visionOS* —
  https://support.apple.com/en-us/102390 (published 2025-03-26)
- Apple, *If an app would like to connect to devices on your local network* —
  https://support.apple.com/en-us/102229 (iOS 14+ app permission)
- Apple, *Preventing Insecure Network Connections* —
  https://developer.apple.com/documentation/security/preventing-insecure-network-connections
  (ATS scope and `NSAllowsArbitraryLoadsInWebContent`)
- Apple, *About the security content of Safari 18.4* — https://support.apple.com/en-us/122379
  (CVE-2025-31184; read via search summary)
- Let's Encrypt, *Certificates for localhost* —
  https://letsencrypt.org/docs/certificates-for-localhost/ (updated 2025-07-31)
- Let's Encrypt, *Challenge Types* — https://letsencrypt.org/docs/challenge-types/ (updated
  2026-02-12)
- AOSP, `TetheringConfiguration.java` —
  https://android.googlesource.com/platform/packages/modules/Connectivity/+/refs/heads/master/Tethering/src/com/android/networkstack/tethering/TetheringConfiguration.java
  (Wi-Fi tether 192.168.43.1/24)
- Chrome for Developers, *Communicating with Bluetooth devices over JavaScript* —
  https://developer.chrome.com/docs/capabilities/bluetooth (secure context, user gesture, Android
  support)
- IETF, *Using Multicast DNS to protect privacy when exposing ICE candidates* —
  https://www.ietf.org/archive/id/draft-ietf-mmusic-mdns-ice-candidates-02.html
- MDN, *Local network access* —
  https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access
- MDN, *Mixed content* —
  https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content (modified
  2026-08-15; blockable content, top-level navigations)
- MDN, *Request: targetAddressSpace* —
  https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace
- MDN, *Secure contexts* —
  https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts (modified
  2026-09-14)
- MDN, *Web Bluetooth API* — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- web.dev, *What does it take to be installable?* — https://web.dev/articles/install-criteria
  (updated 2024-09-19; HTTPS requirement)
- mdn/mdn#791 — https://github.com/mdn/mdn/issues/791 (2026-01-21; LNA stable in Chrome 144)

Secondary (labelled):

- caniuse, *Web Bluetooth* — https://caniuse.com/web-bluetooth (Safari unsupported through
  27 TP; extension polyfill noted)
- caniuse, *`targetAddressSpace`* —
  https://caniuse.com/mdn-api_request_request_options_parameter_targetaddressspace
- osxdaily Personal Hotspot discussion — https://osxdaily.com/2013/10/13/personal-hotspot-drop-connection-fix/
  (reader-measured 172.20.10.x/28)
- capsicumdreams GPS2IP docs, *Network* — https://capsicumdreams.com/gps2ip/docs/settings/network
  (iOS hotspot range table)
- findroid#109 — https://github.com/jarnedemeulemeester/findroid/issues/109 (Android system
  resolver and `.local`)

Repo documents and code read 2026-09-27:

- `CONTEXT.md` (Controller, Load, Dispatch, Card, Placeholder Mission)
- `docs/adr/0016-mission-generation-and-loading-for-the-rc2.md` (Linux board, `jmtpfs`, read-back,
  Collecting needs internet; lines 480-493, 472-478)
- `docs/adr/0022-cards-are-reserved-at-dispatch.md` (Card Ledger written by the host; lines 41-45)
- `docs/research/controller-and-loader-facts-2026-09-11.md` (RC2 MTP access)
- `docs/research/mobile-stack.md` on `research/mobile-stack` (PWA decision, read 2026-09-27)
- `docs/research/push-zero-spend.md` on `research/push-zero-spend` (push split, host outbound
  internet, read 2026-09-27)
- `scripts/mission/` (`load.py`, `collect.py`, `calibrate.py` exist)
- `web/` (no service worker or web app manifest found this run: `rg -l "serviceWorker|manifest.webmanifest|display.*standalone" web --glob '!node_modules'` printed nothing)
