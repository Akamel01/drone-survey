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


def spec_for(aoi, **flight):
    """A Spec shaped exactly as web/lib/spec.ts writes one."""
    f = {"altitude_m": 90, "forward_overlap_pct": 85, "side_overlap_pct": 75,
         "gimbal_pitch_deg": -80, "speed_ms": 5, "turn": "through", "margin_passes": 1}
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

        # The Controller cannot show our names, so the path must identify itself.
        first = plan["points"][0]
        lat0 = sum(p[0] for p in plan["points"]) / len(plan["points"])
        lon0 = sum(p[1] for p in plan["points"]) / len(plan["points"])
        corner = f"{'north' if first[0] >= lat0 else 'south'}-{'east' if first[1] >= lon0 else 'west'}"
        check(f"starts at the {plan['start_corner']} corner, as reported",
              plan["start_corner"] == corner, f"{plan['start_corner']} vs {corner}")


def main():
    # The rehearsal area, as marked on the Controller: 120 x 100 m.
    small = [[49.1896507, -122.8402975], [49.1885718, -122.8402975],
             [49.1885718, -122.8389242], [49.1896507, -122.8389242]]
    # Large enough that the 200-waypoint ceiling forces a split.
    large = [[49.1935, -122.8460], [49.1880, -122.8460],
             [49.1880, -122.8360], [49.1935, -122.8360]]

    case("the rehearsal area, flown through each point", spec_for(small), expect_parts=1)
    case("the same area, stopping at each point", spec_for(small, turn="stop"), expect_parts=1)
    case("an area too big for one Mission", spec_for(large))

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
