# Generate missions with drone-flightplan in waypoints mode and load them onto the RC2 over USB

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
- **Gimbal at −80°**, set explicitly.
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
- **The photo-trigger evidence is second-hand**: the operator's review of other
  pilots' flights, not ours. The first proving flight (#10) verifies it on this
  aircraft and controller.
- **Creating the placeholder missions is a one-time manual step** in DJI Fly.
- **The generator covers nadir grids only.** Oblique passes, which the capture
  standard requires, need geometry of our own (#30).
- **Licence:** the library is AGPL-3.0. Running it as an internal process carries
  no obligations; distributing a patched copy or exposing it as a network service
  would.
