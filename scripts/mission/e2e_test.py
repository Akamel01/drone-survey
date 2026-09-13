#!/usr/bin/env python3
"""End to end: a Mission Spec from the planner becomes a KMZ the aircraft can fly.

Each piece is checked on its own elsewhere. This checks the seams, which is where
the expensive failures live (design.md, "Verification: each Node, then the whole
path"). It drives the real planner maths through node and the real writer through
make_mission.py over one Spec, then opens the KMZ and compares the mission the
aircraft would fly against the figures the operator was shown on the map.

    python3 scripts/mission/e2e_test.py
"""
import json
import math
import subprocess
import sys
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


def local_xy(points):
    """Equirectangular metres about the centroid, for measuring what was produced."""
    lat0 = sum(p[0] for p in points) / len(points)
    lon0 = sum(p[1] for p in points) / len(points)
    m_lat = 111132.92 - 559.82 * math.cos(2 * math.radians(lat0)) + 1.175 * math.cos(4 * math.radians(lat0))
    m_lon = 111412.84 * math.cos(math.radians(lat0)) - 93.5 * math.cos(3 * math.radians(lat0))
    return lambda lat, lon: ((lon - lon0) * m_lon, (lat - lat0) * m_lat)


def distance_outside_m(pt, poly):
    """Metres from the point to the area, measuring 0 anywhere inside it."""
    x, y = pt
    hit = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    if hit:
        return 0.0
    best = float("inf")
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length2))
        best = min(best, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return best


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
    root = ElementTree.fromstring(waylines)
    marks = []
    for pm in root.findall(".//kml:Placemark", NS):
        lon, lat = (float(v) for v in pm.find(".//kml:coordinates", NS).text.strip().split(","))
        marks.append({
            "ll": (lat, lon),
            "height": float(pm.find("wpml:executeHeight", NS).text),
            "speed": float(pm.find("wpml:waypointSpeed", NS).text),
            "turn": pm.find(".//wpml:waypointTurnMode", NS).text,
            "photos": len(pm.findall(".//wpml:actionActuatorFunc", NS)),
            "take_photo": [e.text for e in pm.findall(".//wpml:actionActuatorFunc", NS)].count("takePhoto"),
            "gimbal": [float(e.text) for e in pm.findall(".//wpml:gimbalPitchRotateAngle", NS)],
            "group_mode": pm.find(".//wpml:actionGroupMode", NS).text,
            "trigger": pm.find(".//wpml:actionTriggerType", NS).text,
            "heading_mode": pm.find(".//wpml:waypointHeadingMode", NS).text,
            "poi": pm.find(".//wpml:waypointPoiPoint", NS).text,
        })
    return names, marks, waylines, template


def case(title, spec, expect_parts=None):
    print(f"\n=== {title} ===")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        spec_path = tmp / "site.mission.json"
        spec_path.write_text(json.dumps(spec))

        plan = run_planner(spec_path)
        report, code = run_writer(spec_path, tmp / "mission.kmz")

        # --- what the operator was shown, against what the writer computed ---
        close(plan["gsd_cm"], report["gsd_cm"], 1e-6, "ground resolution agrees", " cm/px")
        close(plan["fwd_spacing_m"], report["fwd_spacing_m"], 1e-6, "forward spacing agrees", " m")
        close(plan["side_spacing_m"], report["side_spacing_m"], 1e-6, "side spacing agrees", " m")
        check("line count agrees", plan["line_count"] == report["lines"],
              f"{plan['line_count']} vs {report['lines']}")
        check("photo count agrees", plan["photo_count"] == report["photos"],
              f"{plan['photo_count']} vs {report['photos']}")
        check("part count agrees", plan["parts"] == report["parts"],
              f"{plan['parts']} vs {report['parts']}")
        if expect_parts is not None:
            check(f"splits into {expect_parts} parts", report["parts"] == expect_parts, str(report["parts"]))

        # A part that outlasts the battery cannot be flown, and the operator
        # would only find out in the air.
        agree = (len(plan["part_minutes"]) == len(report["part_minutes"])
                 and all(abs(a - b) < 0.01 for a, b in zip(plan["part_minutes"], report["part_minutes"])))
        check("part durations agree", agree,
              f"{[round(x, 2) for x in plan['part_minutes']]} vs "
              f"{[round(x, 2) for x in report['part_minutes']]}")
        battery = spec["flight"]["battery_minutes"]
        if battery > 0 and report["part_minutes"]:
            worst = max(report["part_minutes"])
            check("every part fits one battery", worst <= battery + 1e-6,
                  f"worst part {worst:.1f} min against a {battery} min battery")

        missions = report["missions"]
        seams = len(missions) - 1
        written = sum(m["waypoints"] for m in missions) - seams
        check("every planned photo position was written", written == plan["photo_count"],
              f"{written} written vs {plan['photo_count']} planned")

        path = sum(m["path_length_m"] for m in missions)
        close(plan["path_length_m"], path, max(1.0, path * 0.001), "path length agrees", " m")
        time_written = sum(m["flight_time_min_at_speed"] for m in missions)
        close(plan["flight_time_min"], time_written, max(0.2, time_written * 0.02),
              "flight time agrees", " min")
        check("the writer reported no problems", not any(m["problems"] for m in missions),
              str([p for m in missions for p in m["problems"]]))
        check("the planner reported no problems", not plan["problems"], str(plan["problems"]))
        check("writer exited clean", code == 0, f"exit {code}")

        # --- the file the aircraft actually reads ---
        # Sort by part number, not by name: plain sorting puts part10 after part1
        # and silently stitches the mission in the wrong order.
        parts = sorted(tmp.glob("mission*.kmz"),
                       key=lambda p: int(p.stem.rsplit("part", 1)[-1]) if "part" in p.stem else 0)
        check("one file per part", len(parts) == report["parts"], f"{len(parts)} files")

        speed = plan["capped_speed_ms"]
        flown = []
        for kmz in parts:
            names, marks, waylines, template = waypoints_of(kmz)
            check(f"{kmz.name}: holds both mission files",
                  names == ["wpmz/template.kml", "wpmz/waylines.wpml"], str(names))
            check(f"{kmz.name}: consumer namespace, not enterprise",
                  "uav.com/wpmz" in waylines and "dji.com/wpmz" not in waylines)
            check(f"{kmz.name}: returns home on signal loss",
                  "<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>" in template)
            check(f"{kmz.name}: within DJI Fly's 200 waypoints", len(marks) <= 200, str(len(marks)))
            check(f"{kmz.name}: a photo at every waypoint",
                  all(m["take_photo"] == 1 for m in marks))
            check(f"{kmz.name}: actions fire in parallel on reaching the point",
                  all(m["group_mode"] == "parallel" and m["trigger"] == "reachPoint" for m in marks))
            check(f"{kmz.name}: gimbal held at {spec['flight']['gimbal_pitch_deg']}°",
                  all(m["gimbal"] == [spec["flight"]["gimbal_pitch_deg"]] for m in marks))
            check(f"{kmz.name}: movement is {spec['flight']['turn']}",
                  all(m["turn"] == TURN_MODE[spec["flight"]["turn"]] for m in marks))
            check(f"{kmz.name}: altitude as specified",
                  all(m["height"] == spec["flight"]["altitude_m"] for m in marks))
            check(f"{kmz.name}: speed is the shutter-capped {speed} m/s",
                  all(abs(m["speed"] - speed) < 0.011 for m in marks),
                  str(sorted({m["speed"] for m in marks})))
            flown.append([m["ll"] for m in marks])

        # Consecutive parts share a waypoint, so no coverage is lost at the seam.
        for i in range(len(flown) - 1):
            check(f"part {i + 1} and {i + 2} share the seam waypoint",
                  geodesic_m(flown[i][-1], flown[i + 1][0]) < 0.01,
                  f"{geodesic_m(flown[i][-1], flown[i + 1][0]):.3f} m apart")

        # The strongest tie in the test: every point drawn on the operator's map
        # is the point the aircraft will fly to, in the same order.
        stitched = flown[0] + [p for part in flown[1:] for p in part[1:]]
        check("flown waypoint count matches the map", len(stitched) == len(plan["points"]),
              f"{len(stitched)} vs {len(plan['points'])}")
        if len(stitched) == len(plan["points"]):
            worst = max(geodesic_m(a, b) for a, b in zip(stitched, plan["points"]))
            check("every waypoint sits where the map drew it", worst < 0.05, f"worst {worst:.4f} m")

        # Nothing may be photographed that the area did not ask for. The grid is
        # allowed to run the margin beyond the boundary and no further — which is
        # what stops a triangle being flown as its bounding box.
        to_xy = local_xy(spec["aoi"])
        poly_xy = [to_xy(lat, lon) for lat, lon in spec["aoi"]]
        margin = spec["flight"]["margin_passes"]
        allowed = margin * max(plan["fwd_spacing_m"], plan["side_spacing_m"]) + 0.01
        outside = [distance_outside_m(to_xy(lat, lon), poly_xy) for lat, lon in stitched]
        check("no waypoint lies further outside the area than the margin allows",
              max(outside) <= allowed, f"worst {max(outside):.1f} m, allowed {allowed:.1f} m")

        # The Controller cannot show our names, so the path must identify itself.
        first = plan["points"][0]
        lat0 = sum(p[0] for p in plan["points"]) / len(plan["points"])
        lon0 = sum(p[1] for p in plan["points"]) / len(plan["points"])
        corner = f"{'north' if first[0] >= lat0 else 'south'}-{'east' if first[1] >= lon0 else 'west'}"
        check(f"starts at the {plan['start_corner']} corner, as reported",
              plan["start_corner"] == corner, f"{plan['start_corner']} vs {corner}")


def orbit_spec(center, **orbit):
    """A Spec shaped as web/lib/spec.ts writes one for an orbit."""
    o = {"center": center, "target_height_m": 20.0, "radius_m": 40.0,
         "altitudes_m": [40.0, 60.0], "photos_per_ring": 24, "clockwise": True}
    o.update(orbit)
    s = spec_for([list(center), [center[0] - 0.001, center[1]], [center[0], center[1] - 0.001]])
    s["mission_type"] = "orbit"
    s["orbit"] = o
    return s


def orbit_case(title, spec):
    print(f"\n=== {title} ===")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        spec_path = tmp / "orbit.mission.json"
        spec_path.write_text(json.dumps(spec))

        plan = run_planner(spec_path)
        report, code = run_writer(spec_path, tmp / "orbit.kmz")
        o = spec["orbit"]

        check("the writer knows this is an orbit", report.get("mission_type") == "orbit",
              str(report.get("mission_type")))
        close(plan["gsd_cm"], report["gsd_cm"], 1e-6, "ground resolution agrees", " cm/px")
        close(plan["fwd_spacing_m"], report["arc_spacing_m"], 1e-6, "arc spacing agrees", " m")
        check("photo count agrees", plan["photo_count"] == report["photos"],
              f"{plan['photo_count']} vs {report['photos']}")
        check("ring count agrees", plan["line_count"] == report["rings"],
              f"{plan['line_count']} vs {report['rings']}")
        close(plan["capped_speed_ms"], report["speed_ms"], 1e-6, "shutter-capped speed agrees", " m/s")
        check("part count agrees", plan["parts"] == report["parts"],
              f"{plan['parts']} vs {report['parts']}")
        agree = (len(plan["part_minutes"]) == len(report["part_minutes"])
                 and all(abs(a - b) < 0.01 for a, b in zip(plan["part_minutes"], report["part_minutes"])))
        check("part durations agree", agree,
              f"{[round(x, 2) for x in plan['part_minutes']]} vs "
              f"{[round(x, 2) for x in report['part_minutes']]}")
        battery = spec["flight"]["battery_minutes"]
        if battery > 0 and report["part_minutes"]:
            worst = max(report["part_minutes"])
            check("every part fits one battery", worst <= battery + 1e-6,
                  f"worst part {worst:.1f} min against a {battery} min battery")
        check("writer exited clean", code == 0, f"exit {code}")
        check("the planner reported no problems", not plan["problems"], str(plan["problems"]))

        parts = sorted(tmp.glob("orbit*.kmz"),
                       key=lambda p: int(p.stem.rsplit("part", 1)[-1]) if "part" in p.stem else 0)
        flown = []
        for kmz in parts:
            names, marks, waylines, template = waypoints_of(kmz)
            check(f"{kmz.name}: consumer namespace, not enterprise",
                  "uav.com/wpmz" in waylines and "dji.com/wpmz" not in waylines)
            check(f"{kmz.name}: a photo at every waypoint", all(m["take_photo"] == 1 for m in marks))
            check(f"{kmz.name}: aimed at the subject, not along the wayline",
                  all(m["heading_mode"] == "towardPOI" for m in marks),
                  str(sorted({m["heading_mode"] for m in marks})))
            # The point of interest must be the subject, carrying its height.
            want = f"{o['center'][0]:.12f},{o['center'][1]:.12f},{o['target_height_m']:g}"
            check(f"{kmz.name}: the point of interest is the subject",
                  all(m["poi"] == want for m in marks), str(sorted({m["poi"] for m in marks})[:1]))
            check(f"{kmz.name}: within DJI Fly's 200 waypoints", len(marks) <= 200, str(len(marks)))
            flown.extend(marks)

        # What makes an orbit an orbit: every position the stated radius from the
        # subject, at one of the requested ring altitudes, tilted to look at it.
        worst = max(abs(geodesic_m(m["ll"], tuple(o["center"])) - o["radius_m"]) for m in flown)
        check("every waypoint sits on the circle", worst < 0.2, f"worst {worst:.3f} m off {o['radius_m']} m")

        heights = sorted({m["height"] for m in flown})
        check("one ring per requested altitude", heights == sorted(o["altitudes_m"]),
              f"{heights} vs {sorted(o['altitudes_m'])}")

        for m in flown:
            want_pitch = round(-math.degrees(math.atan2(m["height"] - o["target_height_m"], o["radius_m"])), 6)
            if abs(m["gimbal"][0] - want_pitch) > 0.01:
                check("gimbal aims at the subject from every ring", False,
                      f"{m['gimbal'][0]} vs {want_pitch} at {m['height']} m")
                break
        else:
            check("gimbal aims at the subject from every ring", True)

        # A ring that starts anywhere but due north is a different flight.
        first = flown[0]["ll"]
        bearing_ok = first[0] > o["center"][0] and abs(first[1] - o["center"][1]) < 1e-6
        check("the first photograph is due north of the subject", bearing_ok, str(first))


def main():
    # The rehearsal area, as marked on the Controller: 120 x 100 m.
    small = [[49.1896507, -122.8402975], [49.1885718, -122.8402975],
             [49.1885718, -122.8389242], [49.1896507, -122.8389242]]
    # Large enough that the 200-waypoint ceiling forces a split.
    large = [[49.1935, -122.8460], [49.1880, -122.8460],
             [49.1880, -122.8360], [49.1935, -122.8360]]

    # A shape that is not a rectangle. Before the grid was clipped to the area,
    # this planned 102 positions with 87 of them outside the triangle entirely.
    triangle = [[49.1896507, -122.8402975], [49.1885718, -122.8402975],
                [49.1885718, -122.8389242]]

    case("the rehearsal area, flown through each point", spec_for(small), expect_parts=1)
    case("a triangle, which must not be flown as its bounding box", spec_for(triangle), expect_parts=1)
    case("the same area, stopping at each point", spec_for(small, turn="stop"), expect_parts=1)
    case("an area too big for one Mission", spec_for(large))

    # The capture a nadir grid cannot produce: a subject seen from around it.
    tower = (49.1891, -122.8396)
    orbit_case("an orbit around a tower, two rings", orbit_spec(tower))
    orbit_case("a single low ring, flown anticlockwise",
               orbit_spec(tower, altitudes_m=[30.0], photos_per_ring=18, clockwise=False))

    print()
    if failures:
        print(f"{len(failures)} failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("end to end: the Spec the planner exports becomes a Mission the aircraft can fly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
