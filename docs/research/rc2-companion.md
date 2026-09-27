# Can the DJI RC 2 itself run a companion app that plans or Loads Missions? (2026-09-27)

Research for ticket [#279](https://github.com/Akamel01/drone-survey/issues/279), feeding the
mobile map [#229](https://github.com/Akamel01/drone-survey/issues/229). The question is whether
the Controller can host a small app of ours — one that plans, Loads, or flies — instead of the
Linux host doing the USB work.

Method: primary sources (DJI product/support/developer pages, DJI-authored replies in DJI's own
SDK repository, DJI policy pages) preferred; community and vendor reports are labelled
**community-reported** or **vendor-stated**. Sources were read on 2026-09-27. Anything not read
or measured is marked **INFERRED**. Android platform claims rest on Google's documented scoped-
storage rules as quoted in this repo's earlier research
([`docs/research/phone-loads-rc2.md`](https://github.com/Akamel01/drone-survey/blob/research/phone-loads-rc2/docs/research/phone-loads-rc2.md),
read 2026-09-27); `developer.android.com` was transport-blocked when this document re-checked it,
so the primary URLs are cited but were not re-fetched.

## Verdict

| # | Question | Answer | Decisive fact |
|---|---|---|---|
| 1 | Can third-party apps be installed on the RC 2? | **No** by DJI's policy; **partly** in practice only through an unsupported root path | DJI's own FAQ: "Can I install third-party apps on DJI RC 2? **No.**" Community root kits exist and are labelled below. |
| 2 | Does MSDK v5 support the RC 2 and the Mini 4 Pro for waypoint missions? | **RC 2: No. Mini 4 Pro: yes, but only with the screenless RC-N2 (later RC-N3), app on a phone.** | DJI SDK support, Apr 2025: "it cannot be used with the RC 2 remote controller"; Oct 2025: consumer combos are Mini 3 + RC-N1, Mini 3 Pro + RC-N1/RC Pro, Mini 4 Pro + RC-N2. |
| 3 | Could an app on the RC 2 write DJI Fly's waypoint file, or fly the Mission via the SDK? | **No as a supported design — both routes blocked.** | Scoped storage excludes `Android/data/dji.go.v5` from a normal app; MSDK does not address the RC2. |
| 4 | Risks | Warranty exclusion is documented; DJI disables modified DJI apps; no account-ban evidence found. | After-Sales Service Policies; DJI statement on hacked apps. |

**For the mobile map (#229): No — the RC 2 is not a place to run our app.** The Controller stays
a file target reached over USB; the phone stays the planner and UI, and the Linux board does the
Load (ADR 0016). This is the same conclusion #230 reached for phones, now answered for the
Controller itself.

## Direct answers

### 1. Can third-party apps be installed on the RC 2 (sideloading, developer mode, DJI's own policy), and do they survive firmware updates?

**DJI's policy is a flat no.** The RC 2 FAQ answers "Can I install third-party apps on DJI RC 2?"
with "No." ([dji.com/rc-2/faq](https://www.dji.com/rc-2/faq), read 2026-09-27). The same page is
clear the USB-C ports are "for charging and connecting to computer", and the Controller's model is
RC331 with 32 GB internal storage
([dji.com/rc-2/specs](https://www.dji.com/rc-2/specs), read 2026-09-27). By contrast, DJI's own
retail knowledge base states the **RC Pro 2 does** allow third-party apps, with a liability
disclaimer ([heliguy.com](https://www.heliguy.com/blogs/knowledge-base/does-dji-rc-pro-2-support-installing-third-party-apps),
vendors of DJI equipment, read 2026-09-27 via search) — showing DJI treats the two controllers
differently on purpose. AirData, a vendor whose app wants to run there, states it plainly: "the
DJI RC and RC 2 are locked down by DJI and cannot install third party apps"
([app.airdata.com wiki](https://app.airdata.com/wiki/Help/DJI+RC,+RC+2:+Uploads+for+US+Users),
vendor-stated, read 2026-09-27).

**In practice, an unsupported root path exists — community-reported, not dependable.**

- A public repository documents getting an **ADB root shell on the RC 2 (RC331)** over the
  Controller's hidden ADB-capable USB interface, tested on firmware **v02.00.0300**, and lists
  among "What Works": root access and "**Installing `.apk` files**", plus escaping to Android's
  Launcher3 and disabling DJI Fly as the home app
  ([github.com/Dr-Muh/dji-adb](https://github.com/Dr-Muh/dji-adb), README read 2026-09-27 via
  GitHub API; repo created 2026-07-13, last push 2026-07-14, 2 stars — **community-reported**,
  single author, no security review). This contradicts the earlier repo finding that the RC2 has
  no ADB at all (`docs/research/controller-and-loader-facts-2026-09-11.md:111-114`, which rests on
  tool documentation) and matches the USB ID the loader research already measured
  (`2ca3:1021 DJI KATMAI-IDP`, `docs/research/rc2-native-mission-2026-09-12.md:16-19`).
- Independent reverse-engineering notes describe the same device as "DJI RC2 (rc331, internal
  codename KATMAI-IDP)… **Android 11, kernel 5.4**", with DJI hardening: "Modified adbd behavior
  that refuses normal host connections" and multiple failed bypasses; root was obtained "using
  boot image extraction, Magisk patching, and flashing". The same notes record a **brick**: after
  installing an extracted DJI Fly package and triggering update behaviour, boot stuck at the logo
  and software recovery failed ([devinn.org notes](https://devinn.org/pen-testing/drones/github-dji-rc2-research.html),
  read 2026-09-27; no publication date shown — **community-reported**).
- A DJI-firmware-tools issue shows a user "managed to unlock the bootloader on RC 2" (firmware
  V08.01.0100) and then hit encrypted-app/RPMB key problems; unlocking is reported to force a
  factory reset that can wipe those keys
  ([o-gs/dji-firmware-tools#467](https://github.com/o-gs/dji-firmware-tools/issues/467), opened
  2026-03-30, read 2026-09-27 — **community-reported**).
- A 2024 forum thread is the opposite report: "DJI has blocked ADB from granting permission to
  install other applications" on the DJI RC and RC 2
  ([mavicpilots.com thread 146543](https://mavicpilots.com/threads/install-3rd-party-software-for-dji-rc-and-dic-rc-2.146543/),
  started 2024-06-08, read 2026-09-27 — **community-reported**). Together with the above, the
  picture is a cat-and-mouse install path that changes with firmware, not a platform.

**Do sideloaded apps survive firmware updates?** No source states it, and there is no reason to
assume it: the root techniques are version-tied (tested on one firmware, v02.00.0300, while DJI
has shipped RC2 firmware up to v10.00.0400 in April 2026 — [DJI RC 2 release notes, 2026-04-29](https://dl.djicdn.com/downloads/DJI_RC_2/RN/20260429/DJI_RC_2_Release_Notes_EN.pdf),
read 2026-09-27), and a full firmware update can restore the system partition and DJI's hardening.
**INFERRED: treat "survives updates" as false unless re-proven per firmware.** DJI also states it
"will continue to investigate additional reports of unauthorized modifications and issue software
updates to address them without further announcement"
([DJI announcement, 2017-08-01](https://www.dji.com/media-center/announcements/dji-issues-firmware-update),
read 2026-09-27 — old page, but the policy stance it states is the one later pages echo).

### 2. Does DJI Mobile SDK v5 support the RC 2 and the Mini 4 Pro for waypoint missions, and with what limits?

**Answer separately, because the two differ.**

**The RC 2 is not an MSDK controller at all.** DJI's SDK support team, replying in DJI's own SDK
repository (April 2025): "The Mini 4 Pro can only use the MSDK in conjunction with the DJI RC N2
(screenless remote controller), and **it cannot be used with the RC 2 remote controller**." Asked
for plans, the same reply: "we currently haven't received any relevant plans for MSDK to support
the DJI RC 2" ([Mobile-SDK-Android-V5 issue #539](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/539),
DJI `dji-dev` comments 2025-04-08, read 2026-09-27 via the GitHub API). The thread has 14 comments
and by 2026-07-31 is still community "+1 RC2 support" posts with no change from DJI. **So an MSDK
app cannot run *on* the RC 2: MSDK apps run on an external Android device, and DJI says that
device cannot be the RC 2.** DJI repeats the support boundary in issue #654 (2025-10-23):
"currently MSDK only supports the following combinations: DJI Mini 3 + DJI RC N1, DJI Mini 3 Pro
+ DJI RC N1 or DJI RC Pro, **DJI Mini 4 Pro + DJI RC N2**. Other consumer-grade aircraft models
or remote controller models are not supported by MSDK" — with RC-N3 adaptation for the Mini 4 Pro
announced for v5.17.0
([issue #654](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/654), DJI comment 2025-10-23,
read 2026-09-27).

**The Mini 4 Pro is MSDK-supported, with limits.** DJI's Product SDK Compatibility page lists
"DJI Mini 4 Pro | Yes | Mobile SDK √" and "DJI Mini 5 Pro | **No**"
([support.dji.com SDK compatibility article](https://support.dji.com/help/content?customId=01700000763&lang=en&paperDocType=ARTICLE&re=US&spaceId=17),
read 2026-09-27). DJI's Mobile SDK V5 landing page lists DJI Mini 4 Pro among supported products
and states the supported platform as Android 10.0
([developer.dji.com/mobile-sdk](https://developer.dji.com/mobile-sdk/), read 2026-09-27) — MSDK
v5 is Android-only; DJI ended iOS MSDK development in November 2023
([DroneDJ, 2023-11-30](https://dronedj.com/2023/11/30/dji-ios-sdk-android-app/), press summary of
a DJI notice — secondary, read 2026-09-27). A third-party MSDK planner reports working Mini 4 Pro
flights from MSDK 5.13.0 (March 2025) on an RC-N2 with an Android tablet
([Dronelink community post](https://support.dronelink.com/hc/en-us/community/posts/39483696617363),
vendor/community-reported, read 2026-09-27). **Limits that matter: the controller must be RC-N2
(later RC-N3), the app runs on the phone/tablet, not on any DJI screen controller, and there is no
iOS build.** MSDK waypoint-mission step limits for the Mini 4 Pro were not researched, because the
RC2 controller restriction already closes this route (see "Could not verify").

### 3. If an app can run there, could it write the waypoint file DJI Fly reads, or fly the Mission itself through the SDK?

**The write route is closed to a normal app by Android's scoped storage.** DJI Fly's missions live
at `Android/data/dji.go.v5/files/waypoint/<GUID>/<GUID>.kmz`, the file the loader replaces over
MTP (`scripts/mission/kmz.py:17`; ADR 0016:472-478). Google's rules for Android 11+ say
`MANAGE_EXTERNAL_STORAGE` grants access to internal storage *except* `/Android/data/` and its
subdirectories, and apps holding it "still can't access the app-specific directories that belong
to other apps"; `ACTION_OPEN_DOCUMENT_TREE` likewise cannot request `Android/data/` ([Android
docs: Manage all files](https://developer.android.com/training/data-storage/manage-all-files) and
[Storage updates in Android 11](https://developer.android.com/about/versions/11/privacy/storage),
as quoted in `docs/research/phone-loads-rc2.md`, read 2026-09-27). So a sideloaded app without
root can write **its own** `Android/data/<its-package>/` and nothing of DJI Fly's — which is the
same conclusion ADR 0016 recorded when it rejected the on-device app path (ADR 0016:405-416).
**Root changes that** — the community root shells above can reach any path, and the dji-adb README
lists installing APKs as working — but that is an exploit stack, not an app platform:
version-tied, able to brick the Controller (devinn notes, above), and outside DJI support and
warranty (see §4). **INFERRED: the only on-device write route that exists is the unsupported one;
the supported one does not exist.**

**The fly-it route is closed too.** Flying a Mission through the SDK requires an MSDK-supported
controller–aircraft combination; DJI says the RC 2 is not one, and the Mini 4 Pro's MSDK
combination is RC-N2/RC-N3 with the app on a phone (issue #539, #654, above). Nothing on the RC 2
can address the aircraft through MSDK. The repository's alternative already measured that the
RC2 keeps USB host role, so even a host-side phone cannot take over (ADR 0016:480-485); a small
Linux board cabled with a USB-A host port is the path that works (ADR 0016:487-493).

**One observation, not a recommendation.** The community ADB interface, if it is real and holds
across the current firmware, is a **host-side** transport that could in principle replace MTP for
the Linux loader (file push instead of a filesystem mount). That is a different ticket and would
need its own proof; nothing in this document tests it.

### 4. Risks: warranty, DJI account bans, flight-safety features lost

**Warranty: documented exclusion.** DJI's After-Sales Service Policies do not cover "Damage caused
by unauthorized modification, disassembly, or shell opening not in accordance with DJI's official
instructions or manuals", nor "Any software, whether provided with the product or installed
subsequently", and instruct owners to "remove all additional parts, alterations, and attachments
not covered under warranty" before service
([dji.com/service/policy](https://www.dji.com/service/policy), read 2026-09-27). A DJI
announcement is more direct about firmware/parameter modification: "Any damage or malfunction
caused by such modifications will not be covered under DJI warranty policies", and DJI "strongly
condemn[s] any user who attempts to modify their drone for illegal or unsafe use"
([DJI announcement, 2017-08-01](https://www.dji.com/media-center/announcements/dji-issues-firmware-update),
read 2026-09-27). **INFERRED: rooting the RC 2 and disabling DJI Fly puts the Controller outside
warranty coverage, per DJI's own wording.**

**DJI account bans: no evidence found either way.** No DJI policy page read for this ticket
mentions account suspension for running third-party apps on a controller, and no community report
of such a ban was found. What DJI **does** publish is a policy on modified *DJI* apps: its systems
detect "that a DJI app is not the official version — for example, if it has been modified to
remove critical flight safety features like geofencing or altitude restrictions" and require the
official version; if the user does not comply, "their unauthorized (hacked) version of the app
will be disabled for safety reasons" ([DJI statement on recent reports from security
researchers](https://www.dji.com/media-center/announcements/dji-statement-on-recent-reports-from-security-researchers),
read 2026-09-27). That is a remote-disable capability over DJI apps, not an account ban — but it
is the shape of the risk: an unsupported modification is something DJI actively defends against.

**Flight-safety features.** A companion app that only writes files leaves DJI Fly as the flying
app, so DJI Fly's safety stack (geofencing/GEO, altitude limits, RTH configuration) stays in the
flight path — the same argument ADR 0016 uses for the Load path. The losses appear the moment DJI
Fly stops being the home app: the community root path explicitly disables or replaces DJI Fly
(dji-adb README), and DJI's statement above says hacked/unofficial DJI app versions get disabled.
An MSDK-flown Mission never arises here, because the RC 2 is not an MSDK controller. **INFERRED:
for the file-replacement Load, no safety feature is lost; for anything that takes DJI Fly off the
screen, the supported safety stack and DJI support both go.**

## Aircraft-name discrepancy

The ticket names the **DJI Mini 4 Pro**; earlier repo research flew a **Mini 5 Pro**
(`docs/research/controller-and-loader-facts-2026-09-11.md:3`), and part of the SDK picture was
written against that aircraft. The two differ in ways that matter to any SDK fallback:

- **Mini 4 Pro:** MSDK-supported (Mobile SDK √ on DJI's compatibility page), but only with RC-N2
  (later RC-N3) — never the RC 2.
- **Mini 5 Pro:** not MSDK-supported at all ("No" on the same page), and the open requests for it
  remain unanswered ([controller-and-loader-facts:64-72](https://github.com/Akamel01/drone-survey/blob/main/docs/research/controller-and-loader-facts-2026-09-11.md)).

**Neither combination involves the RC 2 as an app host, so this ticket's verdict is unchanged
either way.** If the fleet really is a Mini 4 Pro, an MSDK fallback is at least possible — with a
discarded RC 2 in favour of an RC-N2 and a phone, which is a different architecture from the one
the project has proven.

## Could not verify

- **Whether a sideloaded app survives an RC 2 firmware update.** No source states it, and no
  experiment was run here. The techniques found are tied to a single firmware version
  (v02.00.0300 in dji-adb) while DJI has shipped many updates since.
- **The RC 2's Android version from DJI.** DJI publishes none; the community notes above say
  Android 11 / kernel 5.4 (community-reported), and the scoped-storage argument therefore rests on
  that plus the earlier repo reading, not on a DJI statement (`controller-and-loader-facts:280-283`
  flagged the same gap).
- **Whether the community ADB/root path works on current RC2 firmware (v10.x).** Only
  v02.00.0300 is claimed tested; the 2024 forum report says ADB install permission was blocked,
  so this needs per-firmware proof before anyone relies on it.
- **Whether DJI has ever banned or suspended an account over third-party apps on a controller.**
  No report found in either direction; DJI's published remedy for modified DJI apps is disabling
  the app, not the account.
- **MSDK waypoint-mission limits for the Mini 4 Pro (waypoint count, actions, upload form).** Not
  researched — the RC 2 is not an MSDK controller, so the route is closed for this project
  regardless. If the fleet is a Mini 4 Pro and an RC-N2 fallback is ever considered, this is the
  next question to answer.
- **Android's scoped-storage text re-fetched today.** `developer.android.com` was
  transport-blocked in this session; the rule is quoted from the repo's earlier read
  (`docs/research/phone-loads-rc2.md`, 2026-09-27) rather than re-read here.
- **Whether the dji-adb project is safe to use.** It is a two-star, single-author repository with
  an "educational purposes only" disclaimer, and the reverse-engineering notes above record a
  brick from adjacent experiments. Nothing here endorses running it on the Controller.
