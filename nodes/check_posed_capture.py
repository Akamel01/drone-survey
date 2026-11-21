#!/usr/bin/env python3
"""Offline check for ODM->recon-core Posed Capture adapter (M4).

Runs nodes/solve/odm_to_posed_capture.py on a committed synthetic OpenSfM
fixture (fixtures/posed-capture/opensfm-reconstruction.json). The fixture is
synthetic, not a real capture; values are exact and asserted as literals where
the contract requires them.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ADAPTER = REPO / "nodes" / "solve" / "odm_to_posed_capture.py"
FIXTURE = REPO / "fixtures" / "posed-capture" / "opensfm-reconstruction.json"
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def run_adapter(args: list[str], expect_ok: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run([sys.executable, str(ADAPTER), *args], capture_output=True, text=True)
    if expect_ok and proc.returncode != 0:
        check("adapter exit 0", False, f"rc={proc.returncode} stderr={proc.stderr.strip()} stdout={proc.stdout.strip()}")
    return proc


def assert_pose_literals(capture) -> None:
    # Literal expected qvec/tvec committed in test (not recomputed via adapter helper).
    expected_q = (0.7071067811865476, 0.7071067811865476, 0.0, 0.0)
    expected_t = (-100.0, 50.0, -200.0)
    img = capture.colmap.images[1]
    check("first image name", img.name == "IMG_0.jpg", img.name)
    check("first image id", img.image_id == 1, str(img.image_id))
    check("qvec len", len(img.qvec) == 4, str(img.qvec))
    for i, (got, want) in enumerate(zip(img.qvec, expected_q)):
        check(f"qvec[{i}]", abs(got - want) <= 1e-9, f"got={got!r} want={want!r}")
    check("qvec qw>=0", img.qvec[0] >= 0.0, str(img.qvec[0]))
    for i, (got, want) in enumerate(zip(img.tvec, expected_t)):
        check(f"tvec[{i}]", abs(got - want) <= 1e-9, f"got={got!r} want={want!r}")


def main() -> None:
    sys.path.insert(0, str(REPO))
    from recon_core.capture import load_capture, read_colmap, write_colmap

    check("fixture exists", FIXTURE.is_file(), str(FIXTURE))

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        solve_dir = tmp_path / "solve-default"
        (solve_dir / "opensfm").mkdir(parents=True)
        (solve_dir / "opensfm" / "reconstruction.json").write_bytes(FIXTURE.read_bytes())
        out = tmp_path / "out-default"

        # CLI default path: no --opensfm-json, uses <solve-dir>/opensfm/reconstruction.json
        proc = run_adapter(["--solve-dir", str(solve_dir), "--out", str(out)])
        check("default path exit 0", proc.returncode == 0, proc.stderr.strip())

        cap = load_capture(out)
        check("load_capture succeeds", cap is not None)
        assert_pose_literals(cap)

        # counts and ids
        check("camera count", len(cap.colmap.cameras) == 1, str(len(cap.colmap.cameras)))
        check("image count", len(cap.colmap.images) == 3, str(len(cap.colmap.images)))
        check("point count", len(cap.colmap.points3d) == 10, str(len(cap.colmap.points3d)))
        check("camera id", 1 in cap.colmap.cameras, str(sorted(cap.colmap.cameras)))
        check("image ids", sorted(cap.colmap.images) == [1, 2, 3], str(sorted(cap.colmap.images)))
        check("point ids", sorted(cap.colmap.points3d) == list(range(1, 11)), str(sorted(cap.colmap.points3d)))

        # COLMAP read/write round-trip
        rt_dir = tmp_path / "rt"
        write_colmap(cap.colmap, rt_dir)
        rt = read_colmap(rt_dir)
        check("round-trip cameras", rt.cameras == cap.colmap.cameras)
        check("round-trip images", rt.images == cap.colmap.images)
        check("round-trip points", rt.points3d == cap.colmap.points3d)

        # capture.json exact fields
        cj = json.loads((out / "capture.json").read_text(encoding="utf-8"))
        check("capture epsg", cj["epsg"] == 32617, str(cj.get("epsg")))
        check("capture origin_offset", cj["origin_offset"] == [0, 0, 0], str(cj.get("origin_offset")))
        check("capture source", cj["source"] == "odm-solve:solve-default", str(cj.get("source")))
        check("capture data_licence", cj["data_licence"] == "unspecified (drone-survey capture)", str(cj.get("data_licence")))
        check("capture captures list", cj["captures"] == ["IMG_0.jpg", "IMG_1.jpg", "IMG_2.jpg"], str(cj.get("captures")))
        # parse/round-trip: load_capture already succeeded and save/load stable through recon_core.

        # --opensfm-json precedence over default
        other = tmp_path / "other.json"
        other.write_bytes(FIXTURE.read_bytes())
        wrong_default = solve_dir / "opensfm" / "reconstruction.json"
        wrong_default.write_text('[{"cameras":{},"shots":{},"points":{},"reference_lla":{"latitude":0,"longitude":0}}]', encoding="utf-8")
        out2 = tmp_path / "out-precedence"
        proc2 = run_adapter(["--solve-dir", str(solve_dir), "--opensfm-json", str(other), "--out", str(out2)])
        check("--opensfm-json precedence exit 0", proc2.returncode == 0, proc2.stderr.strip())
        cap2 = load_capture(out2)
        check("precedence used explicit file", len(cap2.colmap.images) == 3, str(len(cap2.colmap.images)))

        # brown camera yields notes containing k1=
        brown = [{
            "cameras": {
                "cam": {
                    "projection_type": "brown",
                    "width": 640, "height": 480,
                    "focal_x": 0.85, "focal_y": 0.85,
                    "c_x": 0.0, "c_y": 0.0,
                    "k1": -0.01, "k2": 0.002, "k3": 0.0, "p1": 0.0001, "p2": -0.0002
                }
            },
            "shots": {
                "A.jpg": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "camera": "cam"}
            },
            "points": {"0": {"coordinates": [0, 0, 1], "color": [0, 0, 0]}},
            "reference_lla": {"latitude": 41.2264, "longitude": -81.7043, "altitude": 0.0}
        }]
        brown_json = tmp_path / "brown.json"
        brown_json.write_text(json.dumps(brown), encoding="utf-8")
        out_brown = tmp_path / "out-brown"
        proc_b = run_adapter(["--solve-dir", str(tmp_path), "--opensfm-json", str(brown_json), "--out", str(out_brown)])
        check("brown exit 0", proc_b.returncode == 0, proc_b.stderr.strip())
        cap_b = load_capture(out_brown)
        check("brown notes has k1=", isinstance(cap_b.meta.notes, str) and "k1=" in cap_b.meta.notes, str(cap_b.meta.notes))

        # fisheye fails loudly
        fisheye = [{
            "cameras": {"cam": {"projection_type": "fisheye", "width": 640, "height": 480, "focal": 0.5}},
            "shots": {"A.jpg": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "camera": "cam"}},
            "points": {"0": {"coordinates": [0, 0, 1], "color": [0, 0, 0]}},
            "reference_lla": {"latitude": 0.0, "longitude": 0.0, "altitude": 0.0}
        }]
        fisheye_json = tmp_path / "fisheye.json"
        fisheye_json.write_text(json.dumps(fisheye), encoding="utf-8")
        out_f = tmp_path / "out-fisheye"
        proc_f = run_adapter(["--solve-dir", str(tmp_path), "--opensfm-json", str(fisheye_json), "--out", str(out_f)], expect_ok=False)
        check("fisheye exits nonzero", proc_f.returncode != 0, f"rc={proc_f.returncode}")
        msg = (proc_f.stderr + proc_f.stdout).lower()
        check("fisheye fails loudly", "fisheye" in msg or "unsupported" in msg or "projection_type" in msg, msg[:200])

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall posed capture checks passed")


if __name__ == "__main__":
    main()
