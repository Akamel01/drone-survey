# Generate missions in DJI Fly's own dialect and load them onto the RC2 over USB

ADR 0015 makes mission planning and controller preparation part of the automated
system. The operator's hardware fixes most of the choice. The RC2 runs only DJI
Fly, DJI's Mobile SDK does not support the RC2, and DJI Fly has no mission import
function. Every third-party tool that puts a computed mission onto an RC2 —
WaypointMap, Litchi's importer, MavenBridge, FlyPath — does it the same way: it
overwrites the KMZ file inside a placeholder mission's folder on the controller.
([research](../research/mission-planning-automation-2026.md),
[hands-on test](../research/flightplan-generator-test-2026-09-10.md))

## Decision

- **Generator:** `drone-flightplan`, from the Humanitarian OpenStreetMap Team,
  run as an internal Node in a container built from the GDAL 3.10.3 image. It
  writes WPML KMZ files for the DJI Mini 5 Pro.
- **Waypoints mode, not waylines mode.** In waypoints mode the mission carries a
  `takePhoto` action at every photo position, and the operator has confirmed that
  DJI Fly executes those actions in an imported mission. Photos are then taken by
  the mission at computed positions, so nobody arms interval shooting and Overlap
  does not depend on speed multiplied by a timer.
- **Gimbal at −80°**, written as `gimbalPitchRotateAngle` inside `gimbalRotate`
  and `gimbalEvenlyRotate` actions, with `gimbalPitchRotateEnable` set. Reading a
  mission built by DJI Fly itself confirmed that is where the angle lives; the
  per-waypoint `waypointGimbalPitchAngle` field stays zero and is not used
  ([evidence](../research/rc2-native-mission-2026-09-12.md)). **A heading aimed
  at a point of interest cancels the tilt**, so a fixed angle and a point of
  interest cannot be combined — which separates Grid Missions, where the tilt
  holds, from orbits, where the point of interest dictates the framing.
- **Altitude, never GSD.** The library models the Mini 5 Pro's camera as 12 MP,
  so planning from a GSD target would fly far too low for 50 MP stills.
- **The Node corrects the library's latitude bug.** The grid is laid out in Web
  Mercator without scale correction, so spacing shrinks by cos(latitude): 27–50%
  too tight across Canada. The Node applies the correction until upstream fixes
  it ([hotosm/drone-tm#887](https://github.com/hotosm/drone-tm/issues/887)).
- **Every plan passes a gate before it is loaded:** true ground spacing measured
  geodesically against the requested Overlap, photo count, altitude, and gimbal
  angle. A plan that fails is not loaded. The latitude bug went unnoticed upstream
  precisely because nothing compared the output with the request.
- **Loading happens on the Linux host over USB (MTP).** The loader overwrites the
  KMZ inside placeholder missions that are created once, by hand, in DJI Fly.

## Controller support, updates, and how loading fails

Settled in a later grilling session, and binding on the loader:

- **Exactly one Controller is supported**: the RC2, on a specific DJI Fly and
  firmware version, proven by a test flight. No other controller, and no phone
  with an RC-N, is supported until it passes the same test. A controller
  *family* is never claimed.
- **Versions cannot be pinned**, so updates are installed deliberately: right
  after a Capture, never the day before one. After any update the Controller is
  unproven, and the next Load includes a short proving Mission that is flown
  first on Site. If it flies and the photo count rises, the real Missions go
  ahead.
- **If the RC2 is unavailable on a Capture day, the visit is rescheduled**
  within the Site's Cadence window. A spare RC2 is bought when repeat clients
  justify it. A hand-flown Capture is never delivered, because Overlap and
  spacing cannot be guaranteed.
- **Loading is all or nothing.** Every Mission for the visit is written and read
  back identical, or the Controller is left exactly as it was. The loader
  refuses to write at all when the folder layout does not match what the
  Controller's recorded profile says. It never tries an alternative route. When
  it fails, loading by hand with a third-party tool is a logged exception, not a
  routine step.
- **Loading runs on the Linux host only.** That is where Missions are generated,
  where every other Node runs, and where reading the Controller is proven to
  work. macOS is a terminal into that host, never a loading path: Homebrew
  disabled its maintained MTP command-line tool on 2026-09-01 and the
  alternative is deprecated.
- **The loader mounts with `jmtpfs`, copies, unmounts, then re-mounts and reads
  back.** Success is the read-back comparison, never the copy command's exit
  status — the same lesson as ODM's clean exit over a collapsed mesh. Note that
  libmtp does not recognise this Controller (`2ca3:1021`) and falls back to
  generic Android handling; reads are proven, writes are not.
- **Plugging the Controller in starts the load.** A rule on the host notices the
  RC2, runs the loader, and reports that the Missions are on board or that it
  refused. The operator plugs in before leaving rather than remembering a command
  at the Site.

## Revision, 2026-09-12 — we write the mission file ourselves

**This supersedes the generator decision above.** `drone-flightplan` is no longer
the thing that writes the Mission; it is at most a source of grid geometry.

Reading a Mission that DJI Fly itself wrote on this Controller
([evidence](../research/rc2-native-mission-2026-09-12.md)) showed that none of
the three candidate generators produces that file:

| | Namespace | Files in the KMZ | Action groups | On signal loss |
|---|---|---|---|---|
| **DJI Fly on the RC2** | `uav.com` | two | parallel | return home |
| `drone-flightplan` | `dji.com` | one | sequence | keep flying |
| Waypoint OS | `dji.com` | two | sequence | keep flying |
| FlyPath | `uav.com` | two | — | configurable |

Adapting `drone-flightplan` would mean changing its namespace, its file count,
its action group mode, its signal-loss default and its latitude bug. That is a
fork maintained by us, not a patch.

**The Node writes the KMZ itself.** The file is roughly 19 KB of plain XML and
every field in it has now been observed on our own hardware. We take the grid
spacing mathematics from `drone-flightplan` and read FlyPath's consumer writer as
a reference for the dialect, since FlyPath verified its output against a real
Mini and RC2. Both are copyleft — AGPL-3.0 and GPL-3.0 — which constrains
distribution, not internal use; we distribute nothing.

**A Mission is validated against the Controller's own capability files** before
it is loaded: gimbal within −90° to +55°, speed within 0.1 to 15 m/s, a permitted
signal-loss action. Our own rules sit on top: at most 200 waypoints, an altitude
within the legal ceiling, photo spacing measured geodesically against the
requested Overlap, and a split that fits the battery. The aircraft publishes its
limits, so we believe it rather than a third-party library that assumes a 11.5
m/s ceiling the Controller says is 15.

**The master copy of a Mission is our own format** — a map file holding the area,
obstacles and points of interest, plus a short settings file, both schema-checked
and version-controlled. The KMZ is build output, never hand-edited. Flying a Site
again regenerates it from the same inputs, so repeat visits produce identical
waypoints, which is what makes two Captures comparable.

## Revision — how the aircraft moves, splits and paces a Capture

**Movement through a photo point is an input, not a fixed rule.** The Controller's
own Mission uses fly-through (`toPointAndPassWithContinuityCurvature`) on middle
waypoints and stop-and-turn at the ends, so photographs at exact positions do not
require stopping. Both are offered when a Mission is planned, with the predicted
flight time shown for each, and the operator chooses. **The default is set by
measurement, not by argument**: the same Mission is flown both ways and the
results compared — coverage, flight time, batteries used, and whether motion blur
appears at the chosen speed.

**Arming interval capture by hand is acceptable to the operator**, so a Mission
that relies on a camera timer is not disqualified. It remains second choice,
because timer spacing drifts with wind and turns while photo actions fire at
computed positions, but it is not the manual step
[ADR 0015](0015-automation-is-the-primary-goal.md) exists to remove.

**A Site larger than one Mission is split at the end of a flight line**, with one
waypoint shared across the seam so the next leg resumes where the last ended.
Battery endurance sets the split before the 200-waypoint ceiling does. Each part
is its own Mission in its own Placeholder slot, named by Site, date and part.

**Speed follows a blur budget**, not a constant: derived from the ground
resolution and the shutter time so the aircraft moves under roughly half a pixel
during an exposure, capped by the Controller's stated 15 m/s and held below the
~12 m/s point where the RC2 is reported to drop Missions to 2.5 m/s. The proving
flight measures whether the computed speed holds in the air.

**The camera's own capture interval caps speed above everything else.** A photo
is due at every waypoint, so the aircraft cannot outrun the shutter: flying
faster than spacing ÷ interval drops photographs, and drops them silently. At
50 MP the Mini 5 Pro's interval is reported as 5 seconds, which at the capture
standard's spacing allows **2.65 m/s** — roughly half what a blur budget alone
would have chosen. The generator takes the interval as an input and caps speed
from it.

This is the constraint that decides how long a Capture takes, so it also decides
how many batteries a Site needs. It is reported rather than measured, and the
proving flight should establish the real interval: the cheaper the camera's
interval, the faster every future Capture.

**The aircraft refuses Missions that exceed DJI Fly's own safety limits**, and
those limits are invisible to us. The first real Mission was suspended twice —
"reached max flight distance" and "reached max flight altitude" — by settings
that live in the app, appear nowhere in the route file, and cannot be read or
written over USB. A Mission can therefore be perfectly valid, pass every gate,
load and verify, and still be refused on the launch pad.

Two consequences. The Controller's profile must record the operator's configured
maximum altitude and distance as **declared values**, checked against every plan
before loading, since nothing else can catch the conflict. And the distance limit
is measured from the home point, which makes the take-off position part of the
plan rather than a detail of the day.

**Two otherwise identical Missions are told apart by running their lines from
opposite ends.** DJI Fly's mission names live in its own database and cannot be
written by us — confirmed by searching the Controller's whole accessible storage
— so a Mission must identify itself by its shape. Reversing the running order
changes which corner the path starts at, which is visible on the Controller,
while leaving coverage identical.

**Resuming a Mission after a battery change is not available on this aircraft**
([research](../research/battery-swap-resume-2026.md)). DJI Fly's pause and
continue survives an interruption in the air only, not powering down to swap a
battery, and a low-battery return-to-home ends a waypoint Mission outright. The
breakpoint resume that does exist is an enterprise feature and has never covered
the consumer line; nothing in the route file format carries mission progress
either.

So a Site larger than one battery is flown as **several Missions, not one
interrupted Mission**. Each part occupies its own Placeholder slot, and after
swapping the battery the operator selects the next part by hand. That is one
selection per leg, which the operator accepts, and it makes the seam handling in
the split rule load-bearing: consecutive parts share a waypoint so no coverage is
lost where one battery ends and the next begins. #31 carries the detail.

## Revision — Placeholder slots and what does the loading

**Placeholder Missions are a fixed pool, created once.** The operator makes
roughly eight by hand in DJI Fly and never repeats the exercise. The loader keeps
its own record of which slot currently holds which Site and part, and overwrites
the same slots on every trip. Creating one per flight would put a manual step
back into every Capture.

**The Controller's own labels are the identification, not ours.** DJI Fly shows a
mission name and a thumbnail it generated itself, and neither lives in the file
we overwrite — so after a Load the list may still show the previous Site's name
and picture while the file underneath is current. The slots are therefore
labelled once, plainly, and **the loader reports which slot holds which Site and
part for this trip**. Whether a written name propagates into DJI Fly's list is
worth testing during the first write, but nothing depends on it.

**Loading is its own small program, not a Runner Node.** It is triggered by the
Controller being plugged in, hours after the work that produced the files. The
Runner generates and verifies Missions; the loader copies verified files and
reports what it did. Teaching the Runner about USB devices would breach the
thinness threshold [ADR 0006](0006-pipelines-as-declarative-manifests.md) sets.

## Revision — how a Mission Spec reaches the loader

The planner is a static site; the loader runs on the Linux host. Neither can
reach the other, and the operator plans from whichever machine is to hand.

**The planner drops a Mission Spec into object storage and the host collects
it.** The host polls; plugging the Controller in still triggers the Load, which
is unchanged. This keeps the rule that the operator plugs in before leaving
rather than remembering a command at the Site.

Three things follow, and the first decides the shape:

- **A browser cannot hold the storage credential.** Anything shipped to the
  client is readable by anyone who opens the page, so the write goes through a
  small server-side function that holds the token, and the browser never sees
  one. This is the only part of the planner that is not static.
- **A Spec is immutable once dropped**, named by Site and date. The host keeps
  its own record of which Placeholder slot holds which Site and part, exactly as
  before — the store carries Specs, not slot assignments.
- **Specs carry Site coordinates, which is client location data.** Putting them
  in third-party storage is a disclosure decision, not just a transport one. An
  unlisted bucket is obscurity rather than access control, the same caveat
  [ADR 0011](0011-static-delivery-bundles.md) records for Delivery Bundles, and
  the first client with confidentiality requirements is the trigger to revisit.

This depends on object storage being stood up (#18). Until then the Spec is
carried by hand, which is the manual step
[ADR 0015](0015-automation-is-the-primary-goal.md) exists to remove and is
accepted only as a stopgap.

## Considered and rejected

- **Waylines mode.** It carries no photo actions, so it needs interval shooting
  armed by hand on every flight, and forward Overlap becomes speed × interval.
- **WaypointMap's paid API.** A third-party dependency whose technical reference
  is not public, for output that open source already produces.
- **An RC-N3 with an Android phone and Litchi or Dronelink.** Driving the camera
  through DJI's SDK is more robust than injecting files, but the Mini 5 Pro's SDK
  support is unconfirmed and it would replace the RC2.
- **Loading from macOS.** Homebrew disabled the maintained MTP command-line tool
  on 2026-09-01, and the alternative is deprecated.

## Consequences

- **The file-replacement path is unsupported by DJI.** A DJI Fly update can break
  it. The loader must check that the placeholder folders look as expected and
  refuse otherwise, and a short test flight follows any DJI Fly update before
  client work.
- **Waypoints mode stops at every photo position**, so it covers less ground per
  battery than continuous flight. Missions must be split per battery, and real
  coverage per battery is still unmeasured (#10).
- **The photo-trigger evidence is now first-hand from the controller, though not
  yet from a flight.** A mission built in DJI Fly on this RC2 and read back over
  USB contains `takePhoto` actions on `reachPoint` triggers, alongside `hover`
  and `towardPOI` headings. What remains unproven is that the aircraft executes
  them in the air, which the first proving flight (#10) settles.
- **Our generated file must match the dialect DJI Fly writes**: a KMZ holding
  both `wpmz/template.kml` and `wpmz/waylines.wpml`, in the
  `http://www.uav.com/wpmz/1.0.2` namespace, with `parallel` action groups.
  `drone-flightplan` writes a single file in the `dji.com` namespace with
  `sequence` groups, so it cannot be used unmodified
  ([evidence](../research/rc2-native-mission-2026-09-12.md)).
- **On losing the controller's signal, DJI Fly's own missions return home**
  (`exitOnRCLost` = `executeLostAction`, `executeRCLostAction` = `goBack`). Both
  candidate generators hard-code "keep flying". We follow the app's default.
- **Creating the placeholder missions is a one-time manual step** in DJI Fly.
- **The generator covers nadir grids only.** Oblique passes, which the capture
  standard requires, need geometry of our own (#30).
- **Licence:** the library is AGPL-3.0. Running it as an internal process carries
  no obligations; distributing a patched copy or exposing it as a network service
  would.
