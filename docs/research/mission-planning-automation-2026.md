# Mission-planning automation for DJI Mini 5 Pro + RC2 — research report

Date of research: 2026-09-10. Sources are dated where the underlying page carries a date; where a source is undated, treat it as a September 2026 snapshot of a page that changes with firmware/app releases. DJI Fly and DJI Fly/RC2 firmware update on their own cadence, so anything file-path- or UI-specific here should be re-checked against the operator's actual firmware before depending on it operationally.

---

## Recommended stack (direct answer)

There is no single vendor stack that gets the operator all the way to "select area → mission on RC2 → press fly" without at least one manual step, because **DJI Fly on the RC2 has no supported import API and no MSDK support** (confirmed below, Q1/Q6). Given that hard constraint, the recommended stack is:

1. **Mission generation (headless, scriptable):** [`drone-flightplan`](https://github.com/hotosm/drone-flightplan) (Python, pip-installable, AGPL-3.0-family HOT project) for GSD/overlap math and nadir-grid KMZ generation, extended with custom code (or [`FlyPath`](https://github.com/dronnix-io/FlyPath), GPLv3, QGIS plugin) for cross-hatch, oblique, and orbit patterns that `drone-flightplan` doesn't natively cover. Both emit DJI WPML-format KMZ.
2. **Mission delivery to the RC2 (semi-automatable):** a small script using `jmtpfs`/`libmtp` (Linux) or `android-file-transfer-linux` / `aft-mtp-cli` (macOS, via Homebrew) to mount the RC2 over USB-MTP and overwrite the KMZ file inside an existing placeholder mission's folder at `Android/data/dji.go.v5/files/waypoint/<GUID>/<GUID>.kmz`. This is the same mechanism every third-party tool (WaypointMap, Litchi, MavenBridge, Pixpro, FlyPath) actually uses — there is no DJI-sanctioned alternative.
3. **Photo triggering:** rely on DJI Fly's native "Take Photo" waypoint camera action or its global timed-interval camera action — set once, in the DJI Fly UI, per the mission's planned speed. Do **not** count on an externally-authored WPML `takePhoto`/`multipleTiming` action group being honoured reliably; evidence is mixed (Q4).
4. **Pre-flight go/no-go:** a script combining Environment and Climate Change Canada's public GeoMet-OGC-API (wind/weather, no key required) + a sun-elevation library (`suncalc-py` or `pysolar`) + a manual glance at NAV Canada's Drone Site Selection Tool (no API — Q8).
5. **Operator-in-the-loop steps:** confirming the mission looks right in DJI Fly's waypoint editor, setting/confirming the camera interval, launching, and flying.

### End-to-end flow with AUTOMATED/MANUAL tags

| Step | Status | Notes |
|---|---|---|
| 1. Draw/select area of interest on a map | AUTOMATED (tool) / MANUAL (human draws polygon) | A polygon has to come from somewhere — either the operator draws it once (QGIS/FlyPath, or a simple web map) or it's pulled from a saved client site boundary. |
| 2. Compute flight-line spacing, trigger interval, altitude from GSD/overlap targets | AUTOMATED | `drone-flightplan`'s `calculate_parameters` module does this headlessly (Q7). |
| 3. Generate nadir grid + one-pass boundary buffer + cross-hatch/oblique/orbit as needed | AUTOMATED for nadir grid; PARTLY AUTOMATED for cross-hatch/oblique/orbit | `drone-flightplan` covers nadir grids well; cross-hatch, oblique passes and orbits need either FlyPath, custom geometry code, or a paid tool (WaypointMap Premium, which has an API — Q9); DJI Fly itself has no template concept for consumer aircraft (Q3). |
| 4. Write DJI WPML KMZ | AUTOMATED | Confirmed open-source libraries exist (Q3, Q7). |
| 5. Create a placeholder waypoint mission on the RC2 inside DJI Fly | MANUAL, one-time per mission slot | DJI Fly has no "import" or "new mission from file" button (Q1); you must create *some* mission in the UI first so a GUID folder/KMZ exists to overwrite. |
| 6. Push the generated KMZ onto the RC2, replacing the placeholder's file | AUTOMATED (scriptable via MTP) | Concrete commands below (Q2); fragile — breaks silently if DJI changes the internal path or KMZ schema in a DJI Fly update. |
| 7. Reopen the mission in DJI Fly and verify it visually | MANUAL | DJI Fly must re-index the file; the operator should always eyeball the loaded route before flying — this is also the main quality gate against a corrupted or mis-parsed injection. |
| 8. Set/confirm timed-interval camera action for even stills spacing | MANUAL (a few taps), not reliably automatable | See Q4 — this is the biggest automation gap. |
| 9. Pre-flight go/no-go (weather, wind, sun angle, airspace) | AUTOMATED compute, MANUAL final airspace check | Weather/wind/sun can be fully scripted; NAV Canada's site-selection layers have no API, so the airspace check itself is a manual look at the map (Q8). |
| 10. Drive to site, launch, fly | MANUAL | Inherent to the business model — this is the part the operator wants to keep. |

**Bottom line on "fully automated except client comms, driving, and flying":** not achievable today with the RC2. Steps 5, 7, and 8 are unavoidable manual touches given DJI Fly's current design, on top of the flying itself. None of them are large (a few taps each), but they are real, and step 8 (capture triggering) is the one most likely to silently degrade image quality if skipped or rushed.

---

## Q1 — How do WaypointMap and comparable tools get a mission onto DJI Fly/RC2?

All of them — [WaypointMap](https://www.waypointmap.com/), [Pixpro Waypoints](https://www.pix-pro.com/pixpro-waypoints), [Litchi's DJI Fly import tool](https://www.litchiutilities.com/docs/import.php), [MavenBridge](https://www.mavenpilot.com/mavenbridge/), and the open-source [FlyPath](https://github.com/dronnix-io/FlyPath) — use the same underlying mechanism: **direct file replacement inside DJI Fly's private app storage on the RC2**, not any documented import API. DJI Fly stores each waypoint mission as a GUID-named folder containing a matching `.kmz` file written in WPML, at:

```
Android/data/dji.go.v5/files/waypoint/<GUID>/<GUID>.kmz
```

(confirmed independently by [Litchi's import docs](https://www.litchiutilities.com/docs/import.php) and by [OpenMTP/AirData's guide](https://openmtp.ganeshrvel.com/), which both give the identical path structure). Because DJI Fly has no "import mission" button, every tool's workflow is: create a placeholder mission by hand inside DJI Fly (so a GUID folder exists), then quietly overwrite that folder's `.kmz` with an externally generated one over USB. DJI's own support documentation for waypoint flight mode confirms the absence of an official import path: *"the entire DJI Mavic 4 Pro, DJI Mavic 3 Series/DJI Air 3/DJI Air 3S does not support the import of KML flight routes currently"* ([DJI support](https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en&documentType=artical&paperDocType=paper)).

Does it work with the Mini 5 Pro on current firmware? Per DJI's own waypoint-mode support article, the **Mini 5 Pro is explicitly listed** as supporting DJI Fly's waypoint flight mode, alongside Air 3, Air 3S, Mavic 3 Classic/Pro/Cine, Mavic 4 Pro and Lito X1 ([DJI support, same URL](https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en&documentType=artical&paperDocType=paper)). WaypointMap and FlyPath both list the Mini 5 Pro as a supported aircraft as of this research ([WaypointMap](https://www.waypointmap.com/drone/dji-mini-5-pro-automated-mission-flight-planning), [FlyPath GitHub](https://github.com/dronnix-io/FlyPath)).

What has broken it historically? Three things, recurring across the community:
- **DJI Fly app updates changing the internal folder/file schema** — the reason Litchi and Maven both shipped new desktop transfer tools ("MavenBridge", Litchi's importer) in early 2026 specifically to stop operators from manually copying/renaming GUID files by hand, because the previous manual process was error-prone across updates ([mavicpilots.com thread on MavenBridge](https://mavicpilots.com/threads/new-tool-mavenbridge-%E2%80%93-transfer-kmz-waypoint-missions-to-dji-fly.155679/)).
- **RC2-specific file-browsing failures** — MavenBridge users report the tool successfully lists local KMZ files on the PC but shows "No missions found for the selected device" when talking to an RC2, i.e. RC2's MTP/USB exposure of the waypoint folder is less reliable than on the RC or RC Pro ([MavenBridge site](https://www.mavenpilot.com/mavenbridge/)).
- **OS-level friction, not DJI's doing** — Windows Explorer often can't see the nested `Android/data/...` folder at all due to Android's own scoped-storage restrictions on MTP browsing from Windows ([mavicpilots.com thread](https://mavicpilots.com/threads/how-to-access-waypoint-folder-on-rc-rc2-from-windows.149588/)).

This is confirmed by a real production user of the exact same hack: the Humanitarian OpenStreetMap Team's [drone-tm](https://github.com/hotosm/drone-tm) project (a drone tasking manager used for humanitarian mapping) explicitly documents doing "create mock flightplan → generate real one with drone-flightplan → manually connect controller and replace the file" as its current workflow, and is migrating away from it *only* for aircraft where DJI's SDK now has support ([GitHub issue #535](https://github.com/hotosm/drone-tm/issues/535)) — which the Mini 5 Pro + RC2 combination does not have (see Q6).

---

## Q2 — Can the RC2's storage be reached programmatically and headlessly?

Yes, over USB via MTP, on both macOS and Linux, without rooting. The RC2 is not a USB mass-storage device (modern Android doesn't expose one), so tools have to speak MTP.

**Linux — `jmtpfs`/`libmtp`.** Confirmed to be a standard FUSE+libmtp filesystem specifically built to bridge Linux/macOS with Android devices that use MTP instead of mass storage ([jmtpfs GitHub](https://github.com/JasonFerrara/jmtpfs), [Ubuntu manpage](https://manpages.ubuntu.com/manpages/jammy/man1/jmtpfs.1.html)). Concrete commands (Ubuntu 24.04):

```bash
sudo apt install jmtpfs libmtp-common
mkdir -p ~/rc2mount
jmtpfs ~/rc2mount              # unlock the RC2 screen and dismiss the USB dialog first
mtp-detect                      # sanity check if jmtpfs sees nothing
cp mission.kmz ~/rc2mount/"Internal shared storage"/Android/data/dji.go.v5/files/waypoint/<GUID>/<GUID>.kmz
fusermount -u ~/rc2mount
```
(command sequence per [Baeldung's MTP guide](https://www.baeldung.com/linux/mounting-mtp-devices) and the [jmtpfs manpage](https://www.mankier.com/1/jmtpfs); only one process can hold the MTP session at a time, so DJI Assistant/DJI Fly's own USB session must not also be active).

**macOS — no native MTP support, but scriptable options exist.** [android-file-transfer-linux](https://github.com/whoozle/android-file-transfer-linux) (despite the name, also builds on macOS/FreeBSD) ships `aft-mtp-cli`, a genuinely scriptable command-line tool: `brew install --cask whoozle-android-file-transfer`, then e.g. `aft-mtp-cli "cd Android/data/dji.go.v5/files/waypoint/<GUID>" "put mission.kmz <GUID>.kmz"`, or `-b` to feed a batch script via stdin ([project docs](https://whoozle.github.io/android-file-transfer-linux/)). `go-mtpfs` is a Go FUSE implementation of the same idea but is unmaintained since 2020 ([hanwen/go-mtpfs](https://github.com/hanwen/go-mtpfs)) — usable but a dead end to build on. `OpenMTP` is open source too ([ganeshrvel/openmtp](https://github.com/ganeshrvel/openmtp)) but is a GUI drag-and-drop app, not built for scripting. There is also a paid, closed-source, GUI-only macOS-specific app, RC Mounter, that mounts the RC2/RC Pro 2 as a native Finder volume via NSFileProvider — convenient for a human, useless for a script since there's no documented CLI or API ([snelgraveren.nl](https://www.snelgraveren.nl/Apps/RCMounterForDJI/)). `simple-mtpfs` is the same class of tool as jmtpfs; nothing in the research turned up RC2-specific caveats for it beyond the general MTP fragility noted above.

**ADB:** present but deliberately locked down. Independent reverse-engineering notes on the RC2 (codename KATMAI-IDP, Qualcomm QCS5430, Android 11, kernel 5.4) found that "the ADB interface is present on the RC2 but consistently remains offline, even when system properties suggest ADB should be enabled," describing this as intentional hardening rather than a bug, and that achieving root required boot-image extraction and Magisk patching with a real risk of an unrecoverable bootloop ([f1y.ing RC2 research notes](https://docs.f1y.ing/pen-testing/drones/github-dji-rc2-research)). **No confirmed non-root method to get an ADB shell on the RC2** turned up in this research.

**Can a script replace a mission file over USB, headlessly, without a GUI, without rooting?** Yes — this is exactly what the commands above do, and it's exactly the same mechanism FlyPath uses under its "direct RC export" mode, which the project describes as auto-detecting the connected RC over USB and replacing the placeholder mission's KMZ "transferred silently over USB" ([FlyPath GitHub](https://github.com/dronnix-io/FlyPath)). The catch is not root or GUI — it's that DJI Fly must still be closed (or the mission list re-opened) for the app to notice the file changed, and the whole thing is inherently fragile because it depends on an undocumented internal storage layout that DJI is free to change in any DJI Fly release.

---

## Q3 — Is WPML public, and what does DJI Fly actually honour?

**Yes, the WPML spec is public**, maintained by DJI in the [`dji-sdk/Cloud-API-Doc`](https://github.com/dji-sdk/Cloud-API-Doc) GitHub repo, under `docs/en/40.specification/80.dji-wpml/` (overview) and `docs/en/60.api-reference/00.dji-wpml/` (detailed element reference for `template.kml`, `waylines.wpml`, and common elements) — also mirrored on [developer.dji.com's Cloud API docs](https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/common-element.html). A route package is a KMZ containing `template.kml` (the editable plan) and `waylines.wpml` (the executable mission with concrete actions).

**Pure waypoint missions vs mapping/area templates.** The WPML `template.kml` spec defines a `templateType` field; DJI's own repo overview describes "predefined templates" as part of the route-file standard for convenient editing. In practice, and as corroborated by the broader ecosystem (FlyPath, WaypointMap, drone-flightplan all generate plain point-to-point *waypoint* WPML, none of them generate DJI's native mapping/area-scan template type), **the mapping/area-scan template types (2D/3D/strip grid generation baked into the flight controller itself) are an enterprise feature tied to DJI Pilot 2 and the Matrice/enterprise line, not exposed in consumer DJI Fly.** I could not pull the live `template-kml.md` page directly in this session (it renders via JS and returned no body to the fetcher), so this distinction should be treated as strongly corroborated by the ecosystem's behaviour rather than a direct quote from DJI's page — worth a five-minute manual check of that page before relying on it.

**DJI Fly for consumer aircraft** — confirmed by DJI's own support article — accepts only the *waypoint* mission type in its UI, with per-waypoint actions (see Q5), and does not offer any built-in area/grid template generator; that job is left to third parties or to manually placing dozens of waypoints, which is exactly the gap tools like WaypointMap, Pixpro, and FlyPath fill.

**Open-source WPML generators found:**
- [`drone-flightplan`](https://github.com/hotosm/drone-flightplan) — Python, `pip install drone-flightplan`, from the Humanitarian OpenStreetMap Team; computes GSD/overlap/altitude parameters and emits DJI WPML KMZ ([PyPI](https://pypi.org/project/drone-flightplan)).
- [`FlyPath`](https://github.com/dronnix-io/FlyPath) — GPLv3 QGIS plugin, exports "native DJI WPML KMZ" for 2D orthomosaic missions, also on the [QGIS plugin repository](https://plugins.qgis.org/plugins/FlyPath/).
- [`format-wpmz`](https://github.com/AndreasLabs/format-wpmz) — a WPML parser/writer described as an extension of KML for DJI drone automation (JS/TS ecosystem; useful if the pipeline is built in Node).
- [`djikmz`](https://github.com/zhzyx/djikmz) — a small Python package specifically for generating DJI task-plan KMZ files.
- [`DroneRoute`](https://droneroute.io/) — described as a free, open-source, self-hostable DJI mission planner producing WPML-compliant KMZ (I was rate-limited before I could confirm its license, language, and headless/CLI capability directly from the repo — verify before depending on it).
- [`motecshine/dji-waylines-sdk`](https://github.com/motecshine/dji-waylines-sdk) and [`Merpyzf/WPML`](https://github.com/Merpyzf/WPML) turned up as smaller community WPML-building utilities; not independently vetted here beyond their existence.

---

## Q4 — Photo triggering: the critical automation question

**Pixpro's own FAQ is explicit and current:** *"You need to go to time shot mode, choose the interval you decided during the planning phase, and trigger the shooting yourself when the drone reaches the first waypoint of the plan,"* because when Pixpro Waypoints builds a plan it "cannot choose the capture mode and its settings" — the externally generated waypoint file carries only path, speed, and altitude ([Pixpro Waypoints FAQ](https://www.pix-pro.com/blog/faq-waypoints)). This is not stale; the FAQ addresses the Mini 5 Pro directly and reflects no change from the earlier limitation the operator flagged.

**But DJI Fly's own native waypoint editor is more capable than the Pixpro workaround exposes.** DJI's official support article for waypoint flight mode lists "Take Photo," "Start Recording," and "Stop Recording" as configurable camera actions per waypoint, plus a global interval-shooting setting, when the mission is authored inside DJI Fly's own UI ([DJI support](https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en&documentType=artical&paperDocType=paper)). The WPML spec itself supports encoding this: `actionActuatorFunc: takePhoto` for one-shot triggers, and an `actionTrigger` of type `multipleTiming` (time-interval) or `multipleDistance` (distance-interval, ideal for consistent overlap regardless of ground speed) for continuous interval shooting along a wayline ([Cloud-API-Doc common-element.md](https://github.com/dji-sdk/Cloud-API-Doc/blob/master/docs/en/60.api-reference/00.dji-wpml/40.common-element.md)).

**The unresolved gap is whether an externally-authored KMZ's `actionGroup`/`takePhoto`/`multipleDistance` elements are actually executed when the file is dropped in via the replacement hack, versus DJI Fly only respecting camera actions it wrote itself.** The evidence leans toward "not reliably automated end-to-end for third-party-generated files": WaypointMap's own comparison of itself against Litchi lists its camera triggering as **"Interval (via DJI Fly)"** — i.e. even WaypointMap's documented workflow is to import the path and then set interval shooting manually in DJI Fly, not to rely on the KMZ's own action group ([aerocartwright.com comparison](https://aerocartwright.com/library/drone-mapping-automated-missions/)). By contrast, Litchi Pilot (which requires an Android RC-N controller and MSDK, not the RC2 — see Q6) drives the camera directly and is recommended in that same comparison as the more reliable choice for production mapping specifically because it isn't dependent on DJI Fly's interpretation of an injected file.

**Practical recommendation for the operator, using the RC2:** treat distance/time-interval shooting as something to be **set in DJI Fly itself**, tuned to the mission's planned ground speed, rather than trusting the generated KMZ's embedded interval action to fire. A **time interval derived from planned speed** (interval = forward photo spacing ÷ ground speed) is the practical approach on DJI Fly; the drone will not vary that interval as it slows in turns or wind gusts, so overlap consistency degrades at turnarounds and in gusty wind — the standard mitigation (also used by enterprise flight controllers) is to extend the grid one full pass beyond the boundary (which the operator has already specified) and accept lower confidence overlap at the very start/end of each line. A **distance-interval** trigger, where supported by DJI Fly's UI, is strictly better for overlap consistency since it's speed-independent, but I could not confirm from official DJI documentation whether DJI Fly's consumer waypoint UI exposes distance-interval (vs. only time-interval) as a global camera trigger option for the Mini 5 Pro specifically — flag this as something to check by hand in the app before committing to it.

---

## Q5 — Per-waypoint control, mission limits, and battery-swap behaviour

Per DJI's own support article for waypoint flight mode ([source](https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en&documentType=artical&paperDocType=paper)), which explicitly lists the Mini 5 Pro as a supported aircraft:

- **Maximum waypoints:** up to 200 pins per mission.
- **Camera action per waypoint:** Take Photo, Start Recording, or Stop Recording.
- **Altitude:** per-waypoint, relative to the takeoff point.
- **Speed:** global default or per-waypoint custom, 0.1–15.0 m/s.
- **Heading:** Follow Course, Point of Interest, Custom, or Manual.
- **Gimbal pitch:** Point of Interest, Custom, or Manual.
- **Gimbal roll:** listed as supported on Mavic 4 Pro; not confirmed for Mini 5 Pro specifically in the source, so treat gimbal roll (needed for some oblique work) as unconfirmed on this aircraft.
- **Zoom:** Auto, Digital, or Manual.
- **Hover time:** 0–30 seconds per waypoint.
- **Terrain-follow:** not mentioned in the support article at all — could not confirm whether per-waypoint or mission-level terrain-follow exists for consumer waypoint missions on the Mini 5 Pro. Treat as unconfirmed; verify directly in the app.
- **Export/import:** explicitly **not supported** — "waypoint flight missions currently do not support export," which is exactly why the file-replacement workaround exists rather than a documented file-based workflow.

**Battery-swap / resume behaviour:** DJI's enterprise-facing tool (GS Pro) explicitly supports pausing and resuming a mission "from last stopped point" after a battery swap, sectioning missions over 99 waypoints into automatically-resumed groups ([DJI GS Pro FAQ](https://www.dji.com/ground-station-pro/faq)). I could not find a DJI Fly-specific (consumer app) confirmation of the same resume-from-breakpoint behaviour for the Mini 5 Pro's waypoint mode — the GS Pro answer is for a different, enterprise-oriented app, and DJI's consumer waypoint-mode support article is silent on the question. This should be tested empirically before the operator's workflow depends on it; a safe default assumption for planning purposes is that a mission may need to be manually re-launched from the beginning (or a manually chosen resume point) after a battery swap, and grid design (one pass of overlap margin at line ends) should tolerate a partial re-fly.

---

## Q6 — Bypassing DJI Fly entirely: is it realistic on the RC2?

**Short answer: no, and DJI's own SDK compatibility list is the reason, independent of whether the Mini 5 Pro itself gets MSDK support.**

DJI Mobile SDK v5 (MSDK v5) is Android-only and requires an Android host device paired with an **RC-N-series controller** (e.g. RC-N2, RC-N3) that runs the third-party app directly — it explicitly does **not** support the RC2's built-in screen/OS: *"Due to the absence of MSDK support, users of the RC 2 are currently unable to benefit from third-party app integrations"* ([search-derived synthesis corroborated by dronedj.com's March 2025 coverage of Mini 4 Pro MSDK support](https://dronedj.com/2025/03/21/dji-mini-4-pro-msdk/) and community discussion of RC-N3 + MSDK v5 combinations in 2026). This is a **hard architectural lock-in**, not a firmware quirk that might get patched — the RC2 runs a closed DJI Fly-only stack.

Separately, and compounding the problem: **as of this research, the Mini 5 Pro's own MSDK v5 support is unconfirmed.** An open GitHub issue asking "Are there plans to support the Mini 5 Pro in DJI SDK v5?" was filed January 12, 2026 against `dji-sdk/Mobile-SDK-Android-V5` and has no DJI response as of this research ([issue #692](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/692)). The Mini 4 Pro *is* confirmed to have gained MSDK v5 support in March 2025, enabling third-party apps like Litchi, DroneDeploy, and Drone Harmony to control it when paired with an RC-N3 ([dronedj.com](https://dronedj.com/2025/03/21/dji-mini-4-pro-msdk/)) — so there's precedent for a Mini-series drone getting SDK support after launch, but no evidence yet that the Mini 5 Pro has followed.

**On the specific alternative the operator asked about — RC-N3 + Android phone + third-party app:** this is a genuinely more automatable and more reliable architecture *in principle*, because apps like Litchi Pilot, Dronelink, or a custom MSDK app can drive the camera shutter directly via the SDK rather than depending on DJI Fly's interpretation of an injected file — this is exactly why the aerocartwright comparison above recommends Litchi/Dronelink over DJI-Fly-KMZ-injection for serious mapping work. But it requires: (a) confirmed MSDK v5 support for the Mini 5 Pro, which does not exist yet, and (b) the operator switching away from the RC2 they specified, adding an Android phone, a case/mount, and a new app to learn and pay for. **Being honest about the tradeoff as instructed: today, with the Mini 5 Pro and the RC2 as specified, this path is not available — not "harder," but genuinely blocked by DJI's own SDK compatibility matrix.** If the operator is willing to reconsider hardware, RC-N3 + Android + a third-party app is the more automatable and more reliable long-term architecture *once* Mini 5 Pro MSDK support lands (or immediately, if the operator is willing to use it with an already-MSDK-supported aircraft like the Mini 4 Pro instead).

Installing third-party apps on the RC2 itself: **not supported.** *"The DJI RC 2 Smart Controller does not support the installation of third-party apps... DJI has blocked ADB from granting permission to install other applications"* — sideloading workarounds exist in forum discussion but are unofficial, fragile, and separate from the ADB-hardening findings in Q2 ([heliguy.com](https://www.heliguy.com/blogs/knowledge-base/does-the-dji-rc-2-support-installing-third-party-apps/), corroborated by the RC2 reverse-engineering notes in Q2).

---

## Q7 — Mission-generation maths, available headlessly

Confirmed open-source options, all usable from a macOS or Linux CLI/script:

- **[`drone-flightplan`](https://github.com/hotosm/drone-flightplan)** (Python, `pip install drone-flightplan`, HOT/OSM ecosystem, license per repo — HOT's projects are typically AGPL/GPL, verify the exact license file). Its `calculate_parameters` module computes forward/side overlap, altitude, and GSD relationships and produces nadir-grid waypoints with DJI WPML KMZ output. This is the closest thing found to a ready-made CLI/library for the operator's core "polygon in, WPML KMZ out" need. Documentation: [hotosm.github.io/drone-flightplan](https://hotosm.github.io/drone-flightplan/).
- **[QGroundControl](https://docs.qgroundcontrol.com/master/en/qgc-user-guide/plan_view/pattern_survey.html)** — dual-licensed Apache-2.0/GPLv3 ([QGC licence page](https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/contribute/licences.html)). Its Survey plan pattern computes GSD/footprint/line-spacing from camera sensor parameters and overlap targets, and QGC is generally scriptable/buildable from source on macOS and Linux — but QGC's native mission export is MAVLink-oriented (for PX4/ArduPilot), not DJI WPML, so it would need a conversion step to be useful for DJI Fly. Good as a reference implementation of the GSD/footprint math, less good as a direct KMZ generator for this use case.
- **[FlyPath](https://github.com/dronnix-io/FlyPath)** (GPLv3, QGIS plugin) — directly generates DJI WPML KMZ for 2D orthomosaic grids from within QGIS, and per its own description handles the RC2 USB transfer step too.
- **[djikmz](https://github.com/zhzyx/djikmz)** — small Python package specifically for DJI task-plan KMZ generation; scope not independently verified beyond its existence.
- **[format-wpmz](https://github.com/AndreasLabs/format-wpmz)** — JS/TS WPML parser/writer, useful if the pipeline is Node-based rather than Python.
- **[DroneRoute](https://droneroute.io/)** — described as a free, self-hostable, open-source DJI mission planner; I was rate-limited before confirming its exact license, whether it runs headlessly, or whether it covers cross-hatch/oblique/orbit patterns — worth a direct look before adopting.
- **OpenDroneMap / WebODM** — this is a post-processing (photogrammetry reconstruction) toolkit, not a mission planner; it doesn't generate flight paths. Not directly useful for Q7 despite frequently appearing alongside these tools in search results.
- **UgCS and DroneDeploy** — both support full pattern generation (grid, cross-hatch, oblique, orbit) and GSD calculators, but are commercial, closed-source products; UgCS in particular is often cited for its comprehensive photogrammetry mission templates. Neither was directly verified in this session as exporting DJI-Fly-compatible WPML KMZ for consumer aircraft — treat as a paid fallback if the open-source stack proves insufficient for cross-hatch/oblique/orbit generation, not a first choice given the operator's automation goals.
- **Mission Planner** (ArduPilot ecosystem) — same caveat as QGroundControl: strong GSD/footprint math, MAVLink-native output, not DJI WPML.

**Net assessment for Q7:** nadir-grid generation with correct GSD/overlap math is solidly covered by open source (`drone-flightplan` is the standout). Cross-hatch, oblique passes, and orbit patterns are less turnkey in pure open source for DJI WPML specifically — FlyPath appears to be the most complete free option, but the operator (or whoever builds this pipeline) will likely need to write custom geometry code for cross-hatch/oblique/orbit on top of `drone-flightplan`'s foundation, or pay for WaypointMap Premium's API (Q9) which is documented to cover these mission types.

---

## Q8 — Pre-flight automation for Canada

**Airspace check — no API.** Two Transport Canada / NAV Canada-affiliated tools exist: the National Research Council's [Drone Site Selection Tool](https://nrc.canada.ca/en/research-development/products-services/software-applications/drone-site-selection-tool) (an interactive map colour-coding prohibited/restricted/caution zones) and NAV Canada's own [drone flight-planning tool](https://www.navcanada.ca/en/flight-planning/drone-flight-planning.aspx) for booking/requesting controlled-airspace access. Neither exposes a public, documented API for programmatic querying — the underlying map data is licensed and not offered for third-party software integration. This means **the airspace go/no-go step cannot be fully automated**; the most realistic approach is a one-time manual check of the site against the map when the client site is first onboarded (sites are typically repeat-visited, so this is a per-site setup cost, not a per-flight one), not a per-flight API call.

**Weather/wind — has an API.** Environment and Climate Change Canada's **GeoMet-OGC-API** (`https://api.weather.gc.ca/`) provides free, keyless, standards-based (OGC API) access to Meteorological Service of Canada forecast data, including the Global Deterministic Prediction System (GDPS, 15 km resolution, twice-daily 10-day forecasts) ([MSC Open Data docs](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/), [GeoMet-OGC-API root](https://api.weather.gc.ca/), [Swagger/OpenAPI spec](https://api.weather.gc.ca/openapi)). There's also a ready-made Python wrapper, [`env_canada`](https://pypi.org/project/env_canada/), that already handles ECCC's forecast API for you. This is genuinely automatable: pull wind speed/gust forecast for the site's coordinates and time window, and gate the go/no-go on a wind threshold appropriate to a sub-250g microdrone (which is far more wind-sensitive than a larger enterprise aircraft — Transport Canada does not set a wind limit itself, but DJI's own published max-wind-resistance spec for the Mini 5 Pro should be the operative ceiling; that spec was not independently re-verified in this session and should be pulled from DJI's current Mini 5 Pro spec sheet).

**Sun elevation — solved, multiple options.** [Pysolar](https://pysolar.readthedocs.io/en/latest/) (validated against US Naval Observatory ephemeris to within ~0.1° of azimuth/altitude) and [`suncalc-py`](https://github.com/kylebarron/suncalc-py) (a vectorized Python port of the widely-used suncalc.js) both compute sun elevation/azimuth for a given lat/lon/time and can trivially be used to pick a midday window for short shadows, or to compute the exact time each weekend the sun elevation matches a prior visit for lighting-consistency across repeat surveys — this is fully automatable with off-the-shelf open-source code.

**Microdrone-specific rules that still apply even without certification (per the operator's confirmation that the aircraft is under 250g):** Transport Canada does not require pilot certification or aircraft registration for drones under 250g, but several rules persist regardless:
- No certification/registration required ([Transport Canada, via secondary summary at colinsa.ca](https://www.colinsa.ca/blog/where-you-can-fly-a-micro-drone-in-canada)).
- Still prohibited from flying in restricted Class F airspace (CYR), Class A, or Class B airspace.
- Must respect NOTAMs, including Forest Fire Aircraft Operating Restrictions and any Section 5.1 Aeronautics Act restrictions.
- CAR 900.06's general "reckless or negligent" endangerment prohibition applies universally, regardless of drone weight.
- No flying at advertised public events without an SFOC.
- Marine-mammal proximity limits, privacy/trespass law, and municipal/provincial/park-specific drone restrictions all still apply.
- Flying near aerodromes still requires real caution to avoid a CAR 900.06 violation even though the strict 5.6 km/1.9 km distance rules are formally a Basic/Advanced Operations requirement for 250g+ aircraft — Transport Canada's guidance is that operators of any weight class should stay clear of aerodrome traffic patterns as a practical safety matter, not just a legal minimum.

This confirms the operator's instinct to flag aerodrome/restricted-airspace avoidance even for a microdrone — it is good practice and, for restricted/NOTAM'd airspace, still a hard legal requirement, just not gated by the same certificate/registration regime as heavier aircraft.

**Sun timing recommendation, concretely automatable:** compute solar elevation for each candidate weekend midday window at the site's coordinates using suncalc-py/pysolar, pick the window where elevation is highest (shortest shadows) and, for repeat visits to the same client site, pick the same solar-elevation window across visits for lighting consistency — entirely scriptable.

---

## Q9 — waypointmap.com specifically

**What it is / who runs it:** a free-to-start, premium-tiered automated mapping/mission-planning web tool for DJI drones, built and run by drone YouTuber "Jays Tech Vault" (220,000+ subscribers), who holds a master's degree in Computer Engineering from NC State University; the tool is described as vetted/award-recognized at NC State and connected to the Andrews Launch Accelerator program ([waypointmap.com](https://www.waypointmap.com/)).

**Cost:** free tier via the web editor; a Premium subscription unlocks unlimited generation, custom shape selections, full compatibility across Mavic 3 Pro/Air 3/Mini 4 Pro (and per its per-drone pages, Mini 5 Pro), editing of saved missions, and **API access** ([WaypointMap Premium](https://www.waypointmap.com/Home/Premium)).

**API:** yes, it exists — the Premium page states the API lets you "export missions in .KMZ format with a single API call" and "generate shapes, flight plans, and selections just as in the editor" ([WaypointMap Developer API page](https://www.waypointmap.com/Home/API)). I could not retrieve endpoint-level documentation, authentication scheme, or rate limits in this session — the public page is a marketing overview rather than a technical reference, so before building against it the operator (or whoever implements this) should contact `support@waypointmap.com` or log in to a Premium account to see the actual API reference.

**GUI-only or scriptable:** the core product is a GUI web editor, but the Premium API tier is explicitly positioned for scripting a custom pipeline — this is the one commercial option in this whole research that directly matches the operator's "no GUI in the loop" goal, if the API turns out to be robust in practice (unverified here).

**Could its output be reproduced by an open-source generator?** Largely yes, for nadir grids — `drone-flightplan` computes the same GSD/overlap math and emits the same WPML KMZ format. Cross-hatch, oblique, and orbit patterns (which WaypointMap markets support for) are less turnkey in open source today; FlyPath is the closest free equivalent but wasn't confirmed to match WaypointMap's oblique/orbit feature set exactly. **Recommendation:** prototype with WaypointMap's free tier and Premium API to validate the mission-generation and RC2-delivery pipeline quickly, then decide whether to pay for the Premium API long-term or invest engineering time in extending `drone-flightplan`/FlyPath to close the cross-hatch/oblique/orbit gap and fully own the pipeline without a third-party dependency.

---

## Biggest risks

1. **DJI Fly updates silently breaking the file-replacement hack.** This is not hypothetical — it is the reason two independent tools (MavenBridge, Litchi's importer) both shipped new transfer utilities in early 2026 specifically to reduce breakage from manual GUID-folder handling, and the reason RC2 users report MavenBridge sometimes can't even list missions on the device. Any pipeline built on this mechanism needs a fast feedback loop (fly a short test mission after every DJI Fly app update, before a paying client job) and should not be trusted blindly on the morning of a client shoot.
2. **Terms-of-service / warranty exposure.** DJI Fly's own documentation states waypoint mission export/import is not supported; directly manipulating app-private storage on the RC2 is an unsupported, undocumented workaround, not a sanctioned integration path. There is no evidence DJI has taken action against users doing this (it's widespread in the hobbyist/prosumer mapping community), but it sits outside DJI's documented product behaviour, and root-level tinkering with the RC2 (as opposed to plain MTP file replacement) carries a real bricking risk per the reverse-engineering notes in Q2 — the operator should stick to the non-root MTP approach and never attempt rooting for this use case.
3. **Photo-capture triggering is the weakest link in the whole automation goal.** Every credible source agrees DJI Fly's handling of camera actions from an externally-authored WPML file is unreliable enough that even automation-focused tool vendors default to "operator manually sets/starts interval shooting in DJI Fly." This is the step most likely to produce a mission that flies the right path but comes back with zero or badly-spaced photos if the operator doesn't personally verify it before every flight.
4. **RC2 lock-in is a hard technical wall, not a soft inconvenience.** DJI Mobile SDK v5 does not support the RC2 at all, regardless of aircraft. Even if Mini 5 Pro MSDK support ships, it will not open up the RC2 — it would only make the RC-N3 + Android + third-party-app path viable. As long as the operator keeps the RC2, the file-replacement + DJI-Fly-native-camera-action approach is the ceiling of automation available; the true resume-from-battery-swap behaviour, distance-interval camera triggering, and terrain-follow availability on this specific aircraft/controller combo all remain unconfirmed gaps that should be tested empirically, not assumed.

---

## What I could not verify

- Whether an externally-authored WPML `actionGroup`/`takePhoto`/`multipleDistance` action is actually executed by DJI Fly when injected via the file-replacement hack on the Mini 5 Pro specifically, versus being silently ignored in favour of manually-set interval shooting. Evidence leans toward "not reliable," but no source directly tested and confirmed this for the Mini 5 Pro on current firmware.
- Whether DJI Fly's consumer waypoint UI exposes a distance-interval (vs. only time-interval) camera trigger option, and whether per-waypoint terrain-follow exists, for the Mini 5 Pro specifically.
- Whether a Mini 5 Pro waypoint mission resumes from its last position after a battery swap in DJI Fly (confirmed only for the separate, enterprise-oriented GS Pro app, not DJI Fly/RC2).
- The exact `templateType` enumeration in the live WPML `template-kml.md` spec page (page did not render for the fetch tool in this session) and a direct DJI quote confirming mapping/area templates are enterprise-only — strongly implied by ecosystem behaviour but not directly quoted from DJI's own text.
- DroneRoute's exact license, implementation language, and whether it runs headlessly/as a CLI, or supports cross-hatch/oblique/orbit patterns — the project's homepage was reachable in an earlier pass of this research but not re-confirmed in detail due to a mid-session rate limit.
- WaypointMap's API authentication scheme, exact pricing, rate limits, and endpoint list — the public page only advertises the capability, not the technical reference.
- Current DJI Mini 5 Pro maximum wind resistance spec (needed to set a concrete wind threshold for the go/no-go script) — not pulled from DJI's spec sheet in this session.
- Whether the RC2's MTP exposure of the waypoint folder is consistently reliable across firmware versions — MavenBridge's own site documents at least one case of it failing to enumerate missions on an RC2 at all.

---

## Files referenced by path

Report written to: `/Users/akamel/Documents/Drone/docs/research/mission-planning-automation-2026.md`
