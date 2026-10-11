#!/usr/bin/env python3
"""End to end: a Mission Spec from the planner becomes a KMZ the aircraft can fly.

This module is guarded by a minimum Python floor check (M8). If the host Python
version is below the required floor (3.11), the test exits loudly with a clear
message to fail fast on non-compliant hosts.
"""
"""End to end: the Missions Dispatch records become the KMZ files the aircraft flies.

The geometry and the split have one implementation, web/lib/mission.ts, and its
own tests (web/lib/mission.test.ts). Dispatch records its parts in the Spec;
make_mission.py only serialises them and gates them (#346). So this checks the
one seam left: the KMZ holds exactly the waypoints the plan recorded, in DJI
Fly's own dialect, and the writer refuses what it should.

    python3 scripts/mission/e2e_test.py
"""
import json
import math
import subprocess
import sys

# M8 floor check: host Python must be at least 3.11
MIN_PY = (3, 11)
if sys.version_info < MIN_PY:
    print(
        f"FATAL: Minimum Python {MIN_PY[0]}.{MIN_PY[1]} required for M8; current version is "
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        file=sys.stderr,
    )
    sys.exit(3)
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
NS = {"kml": "http://www.opengis.net/kml/2.2", "wpml": "http://www.uav.com/wpmz/1.0.2"}
TURN_MODE = {
    "through": "toPointAndPassWithContinuityCurvature",
    "stop": "toPointAndStopWithContinuityCurvature",
}

failures = []


def check(label, ok, detail=""):
    print(f"{'pass' if ok else 'FAIL'}  {label}{'  — ' + detail if detail and not ok else ''}")
    if not ok:
        failures.append(f"{label}: {detail}")


def close(a, b, tol, label, unit=""):
    check(label, abs(a - b) <= tol, f"{a} vs {b}{unit}, tolerance {tol}{unit}")


def geodesic_m(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def spec_for(aoi, **flight):
    """A Spec shaped exactly as web/lib/spec.ts writes one."""
    f = {"altitude_m": 90, "forward_overlap_pct": 85, "side_overlap_pct": 75,
         "gimbal_pitch_deg": -80, "speed_ms": 5, "turn": "through", "margin_passes": 1,
         "battery_minutes": 16}
    f.update(flight)
    return {
        "version": 1, "site": "Test Site", "date": "2026-09-12", "aoi": aoi,
        "home": aoi[0],
        "flight": f,
        "camera": {"interval_s": 5, "shutter": "1/1000", "iso": "100",
                   "white_balance": "Sunny", "white_balance_k": None,
                   "exposure_lock": True, "format": "JPEG"},
    }


def run_planner(spec_path):
    out = subprocess.run([
        "node", str(HERE / "preview_cli.ts"), str(spec_path)
    ], capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"planner preview failed:\n{out.stderr}")
    return json.loads(out.stdout)


def run_writer(spec_path, out_path):
    out = subprocess.run([
        sys.executable, str(HERE / "make_mission.py"), "--spec", str(spec_path), "--out", str(out_path)
    ], capture_output=True, text=True)
    if out.returncode not in (0, 1):
        raise SystemExit(f"writer failed:\n{out.stderr}")
    return json.loads(out.stdout), out.returncode


def waypoints_of(kmz):
    """Every placemark in the flown file, as it would be read by the aircraft."""
    with zipfile.ZipFile(kmz) as z:
        names = sorted(z.namelist())
        waylines = z.read("wpmz/waylines.wpml").decode()
        template = z.read("wpmz/template.kml").decode()
    # The Controller parses both files; one that is not well-formed XML is a
    # Mission it cannot open, whatever its waypoints say.
    ElementTree.fromstring(template)
    root = ElementTree.fromstring(waylines)
    marks = []
    for pm in root.findall(".//kml:Placemark", NS):
        lon, lat = (float(v) for v in pm.find(".//kml:coordinates", NS).text.strip().split(","))
        marks.append({
            "ll": (lat, lon),
            "height": float(pm.find("wpml:executeHeight", NS).text),
            "speed": float(pm.find("wpml:waypointSpeed", NS).text),
            "turn": pm.find(".//wpml:waypointTurnMode", NS).text,
            "take_photo": [e.text for e in pm.findall(".//wpml:actionActuatorFunc", NS)].count("takePhoto"),
            "gimbal": [float(e.text) for e in pm.findall(".//wpml:gimbalPitchRotateAngle", NS)],
            "group_mode": pm.find(".//wpml:actionGroupMode", NS).text,
            "trigger": pm.find(".//wpml:actionTriggerType", NS).text,
            "heading_mode": pm.find(".//wpml:waypointHeadingMode", NS).text,
            "poi": pm.find(".//wpml:waypointPoiPoint", NS).text,
        })
    return names, marks, waylines, template


def dispatched(tmp, spec):
    """The Spec as Dispatch writes it: the planner's own geometry recorded as `plan`."""
    spec_path = tmp / "site.mission.json"
    spec_path.write_text(json.dumps(spec))
    plan = run_planner(spec_path)
    spec_path.write_text(json.dumps({**spec, "plan": plan["plan"]}))
    return spec_path, plan


def case(title, spec, expect_parts=None):
    print(f"\n=== {title} ===")
    orbit = spec.get("mission_type") == "orbit"
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        spec_path, plan = dispatched(tmp, spec)
        recorded = plan["plan"]["parts"]
        report, code = run_writer(spec_path, tmp / "mission.kmz")

        check("the planner reported no problems", not plan["problems"], str(plan["problems"]))
        check("the writer reported no problems", not any(m["problems"] for m in report["missions"]),
              str([p for m in report["missions"] for p in m["problems"]]))
        check("writer exited clean", code == 0, f"exit {code}")
        # The Card count Dispatch reserves is the count of recorded parts, and
        # the writer makes exactly those: the refusal at Load cannot trigger.
        check("the writer makes the parts Dispatch recorded",
              report["parts"] == len(recorded) == plan["parts"],
              f"{report['parts']} written, {len(recorded)} recorded, {plan['parts']} reserved")
        if expect_parts is not None:
            check(f"splits into {expect_parts} parts", report["parts"] == expect_parts, str(report["parts"]))

        if not orbit:  # an orbit's figure also counts closing each circle and the climbs
            path = sum(m["path_length_m"] for m in report["missions"])
            close(plan["path_length_m"], path, max(1.0, path * 0.001), "path length agrees", " m")

        # Sort by part number, not by name: plain sorting puts part10 after part1.
        files = sorted(tmp.glob("mission*.kmz"),
                       key=lambda p: int(p.stem.rsplit("part", 1)[-1]) if "part" in p.stem else 0)
        check("one file per part", len(files) == len(recorded), f"{len(files)} files")

        speed = plan["plan"]["speed_ms"]
        for kmz, part in zip(files, recorded):
            names, marks, waylines, template = waypoints_of(kmz)
            check(f"{kmz.name}: holds both mission files",
                  names == ["wpmz/template.kml", "wpmz/waylines.wpml"], str(names))
            check(f"{kmz.name}: consumer namespace, not enterprise",
                  "uav.com/wpmz" in waylines and "dji.com/wpmz" not in waylines)
            check(f"{kmz.name}: returns home on signal loss",
                  "<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>" in template)
            check(f"{kmz.name}: a photo at every waypoint", all(m["take_photo"] == 1 for m in marks))
            check(f"{kmz.name}: actions fire in parallel on reaching the point",
                  all(m["group_mode"] == "parallel" and m["trigger"] == "reachPoint" for m in marks))
            check(f"{kmz.name}: movement is {spec['flight']['turn']}",
                  all(m["turn"] == TURN_MODE[spec["flight"]["turn"]] for m in marks))
            check(f"{kmz.name}: speed is the recorded {speed} m/s",
                  all(abs(m["speed"] - speed) < 1e-6 for m in marks))
            if orbit:
                o = spec["orbit"]
                want = f"{o['center'][0]:.12f},{o['center'][1]:.12f},{o['target_height_m']:g}"
                check(f"{kmz.name}: aimed at the subject",
                      all(m["heading_mode"] == "towardPOI" and m["poi"] == want for m in marks))
            else:
                check(f"{kmz.name}: follows the flight line",
                      all(m["heading_mode"] == "followWayline" for m in marks))

            # The seam this test exists for: every recorded waypoint, in order,
            # at its height and tilt, and nothing else.
            check(f"{kmz.name}: holds the {len(part)} recorded waypoints", len(marks) == len(part),
                  f"{len(marks)} in the file")
            if len(marks) == len(part):
                worst = max(geodesic_m(m["ll"], p) for m, p in zip(marks, part))
                check(f"{kmz.name}: every waypoint where the plan put it", worst < 0.01,
                      f"worst {worst:.4f} m")
                check(f"{kmz.name}: every height as recorded",
                      all(m["height"] == p[2] for m, p in zip(marks, part)))
                # The file carries the angle to six significant figures.
                check(f"{kmz.name}: every gimbal angle as recorded",
                      all(len(m["gimbal"]) == 1 and abs(m["gimbal"][0] - p[3]) < 1e-3
                          for m, p in zip(marks, part)))


def refuses(title, spec, want):
    """The writer's gate: a Spec it must not turn into a Mission."""
    print(f"\n=== {title} ===")
    with tempfile.TemporaryDirectory() as tmp:
        spec_path = Path(tmp) / "site.mission.json"
        spec_path.write_text(json.dumps(spec))
        report, code = run_writer(spec_path, Path(tmp) / "mission.kmz")
        problems = report.get("problems", []) + [p for m in report.get("missions", []) for p in m["problems"]]
        check("the writer refuses", code == 1 and any(want in p for p in problems), str(problems))


def orbit_spec(center, **orbit):
    """A Spec shaped as web/lib/spec.ts writes one for an orbit."""
    o = {"center": center, "target_height_m": 20.0, "radius_m": 40.0,
         "altitudes_m": [40.0, 60.0], "photos_per_ring": 24, "clockwise": True}
    o.update(orbit)
    s = spec_for([list(center), [center[0] - 0.001, center[1]], [center[0], center[1] - 0.001]])
    s["mission_type"] = "orbit"
    s["orbit"] = o
    return s


def main():
    # The rehearsal area, as marked on the Controller: 120 x 100 m.
    small = [[49.1896507, -122.8402975], [49.1885718, -122.8402975],
             [49.1885718, -122.8389242], [49.1896507, -122.8389242]]
    # Large enough that the 200-waypoint ceiling forces a split.
    large = [[49.1935, -122.8460], [49.1880, -122.8460],
             [49.1880, -122.8360], [49.1935, -122.8360]]

    triangle = [[49.1896507, -122.8402975], [49.1885718, -122.8402975],
                [49.1885718, -122.8389242]]

    case("the rehearsal area, flown through each point", spec_for(small), expect_parts=1)
    case("a triangle", spec_for(triangle), expect_parts=1)
    case("the same area, stopping at each point", spec_for(small, turn="stop"), expect_parts=1)
    # A Site name holding a control character must still make a file the
    # Controller can parse: XML cannot carry one even escaped (#152).
    case("a Site name with a control character", {**spec_for(small), "site": "Bad\x01Name"}, expect_parts=1)
    case("an area too big for one Mission, flown as several", spec_for(large))

    # The capture a nadir grid cannot produce: a subject seen from around it.
    tower = (49.1891, -122.8396)
    case("an orbit around a tower, two rings", orbit_spec(tower))
    case("a single low ring, flown anticlockwise",
         orbit_spec(tower, altitudes_m=[30.0], photos_per_ring=18, clockwise=False))

    # A Spec Dispatched before Dispatch recorded its parts: the writer has no
    # geometry of its own to fall back on, so it refuses by name.
    refuses("a Spec with no recorded plan", spec_for(small), "Withdraw it and Dispatch it again")
    # The gate checks the recorded waypoints against the request, not the
    # planner's own figures: a plan altered after Dispatch is caught.
    with tempfile.TemporaryDirectory() as tmp:
        _, plan = dispatched(Path(tmp), spec_for(small))
    fast = {**spec_for(small), "plan": {**plan["plan"], "speed_ms": 9}}
    refuses("a recorded speed that outruns the shutter", fast, "outruns")
    low = [[[lat, lon, 60, pitch] for lat, lon, _, pitch in part] for part in plan["plan"]["parts"]]
    refuses("waypoints not at the requested altitude",
            {**spec_for(small), "plan": {**plan["plan"], "parts": low}}, "requested")

    print()
    if failures:
        print(f"{len(failures)} failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("end to end: the Missions Dispatch records become the files the aircraft flies.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
