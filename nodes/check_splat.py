#!/usr/bin/env python3
"""nodes/check_splat.py -- offline check for fit-splat/clean-splat/compress-splat (ADR 0018).

No GPU, no Docker, no network: every check here exercises the pure logic
each Node factors out for exactly this reason --

  - fit-splat: the ODM solve-quality gate, the memory policy selected per
    target, and command construction for both engines (eval-disabling
    flags and the allocator env must always be present).
  - clean-splat: the binary PLY reader/writer round-trips, the point-in-
    polygon crop, statistical outlier removal, opacity/scale pruning, and
    the composite gate -- built and torn down against small synthetic
    PLYs, not real fitted scenes.
  - compress-splat: the size-ratio report and its sanity gate, against two
    real small files on disk (not a real .sog -- splat-transform itself
    needs Docker and a network, which this offline check must not need).

    python3 nodes/check_splat.py
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

NODES = Path(__file__).resolve().parent
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def load(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fit_splat = load("fit_splat", NODES / "fit-splat" / "fit_splat.py")
clean_splat = load("clean_splat", NODES / "clean-splat" / "clean_splat.py")
compress_splat = load("compress_splat", NODES / "compress-splat" / "compress_splat.py")


# --- fit-splat ---------------------------------------------------------------------------------

def check_solve_gate():
    good = {"reconstruction_statistics": {"initial_shots_count": 180, "reconstructed_shots_count": 180,
                                           "average_track_length": 5.1}}
    ok, _ = fit_splat.check_solve_quality(good)
    check("fit-splat: solve gate passes a well-registered solve", ok)

    weak_registration = {"reconstruction_statistics": {"initial_shots_count": 180, "reconstructed_shots_count": 90,
                                                         "average_track_length": 5.1}}
    ok, detail = fit_splat.check_solve_quality(weak_registration)
    check("fit-splat: solve gate fails on < 80% registered images", not ok, detail)

    short_tracks = {"reconstruction_statistics": {"initial_shots_count": 180, "reconstructed_shots_count": 180,
                                                    "average_track_length": 1.0}}
    ok, detail = fit_splat.check_solve_quality(short_tracks)
    check("fit-splat: solve gate fails on short average track length", not ok, detail)

    bad_gcp = {"reconstruction_statistics": {"initial_shots_count": 180, "reconstructed_shots_count": 180,
                                               "average_track_length": 5.1},
               "gcp_errors": {"rmse": 2.0}}
    ok, detail = fit_splat.check_solve_quality(bad_gcp)
    check("fit-splat: solve gate fails on high GCP RMSE", not ok, detail)


def check_memory_policy():
    local = fit_splat.pick_policy("local", "full-still", {"engine": None, "max_iters": None, "save_every": None, "downscale_factor": None})
    check("fit-splat: local target defaults to opensplat (the evidence-supported engine on 12GB)", local["engine"] == "opensplat")
    check("fit-splat: local + full-still is conservative about resolution (unmeasured on real stills)", local["downscale_factor"] > 1)

    local_video = fit_splat.pick_policy("local", "video-frame", {"engine": None, "max_iters": None, "save_every": None, "downscale_factor": None})
    check("fit-splat: local + video-frame matches the measured full-resolution run", local_video["downscale_factor"] == 1)

    remote = fit_splat.pick_policy("remote-3090", "full-still", {"engine": None, "max_iters": None, "save_every": None, "downscale_factor": None})
    check("fit-splat: remote-3090 target uses splatfacto (ADR 0004's standing choice, 24GB expected to clear the ceiling)",
          remote["engine"] == "splatfacto")

    override = fit_splat.pick_policy("local", "full-still", {"engine": "splatfacto", "max_iters": 999, "save_every": None, "downscale_factor": 1})
    check("fit-splat: explicit overrides win over the target's default policy",
          override["engine"] == "splatfacto" and override["max_iters"] == 999 and override["downscale_factor"] == 1)

    try:
        fit_splat.pick_policy("nonexistent-target", "full-still", {})
        check("fit-splat: unknown target is rejected", False)
    except SystemExit:
        check("fit-splat: unknown target is rejected", True)


def check_command_construction():
    policy = {"max_iters": 15000, "save_every": 2500, "downscale_factor": 2, "no_gpu_cache": False}
    args = fit_splat.opensplat_args("/datasets/x", "/out/splat.ply", policy, resume_ply=None)
    check("fit-splat: opensplat args never enable full validation rendering (eval stays off)",
          "--val-render" not in args)
    check("fit-splat: opensplat args include a withheld-view PSNR (--val) without a full eval pass",
          "--val" in args and "--val-render" not in args)
    check("fit-splat: opensplat args carry save-every for checkpointing", "-s" in args and "2500" in args)

    resumed = fit_splat.opensplat_args("/datasets/x", "/out/splat.ply", policy, resume_ply="/out/splat_5000.ply")
    check("fit-splat: opensplat resume passes --resume with the checkpoint path",
          "--resume" in resumed and "/out/splat_5000.ply" in resumed)

    train_args = fit_splat.splatfacto_train_args("/out/processed", "/out/train", policy, load_dir_inner=None)
    over_max = str(policy["max_iters"] + 1)
    check("fit-splat: splatfacto args always disable all three eval passes",
          all(f in train_args for f in ("--steps-per-eval-all-images", "--steps-per-eval-image", "--steps-per-eval-batch"))
          and train_args.count(over_max) >= 3)
    check("fit-splat: splatfacto args reduce floaters at the source (cull-alpha-thresh, scale regularization, antialiasing)",
          "--pipeline.model.cull-alpha-thresh" in train_args
          and "--pipeline.model.use-scale-regularization" in train_args
          and "antialiased" in train_args)

    # The allocator fix is set as a container env var (main()), not a CLI flag -- confirm the
    # constant itself is what #8 measured as the fix, so a future edit can't silently drop it.
    check("fit-splat: the allocator fix is exactly what #8 measured as necessary",
          fit_splat.ALLOC_CONF == "expandable_segments:True")


def check_checkpoint_resume():
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        for step in (2500, 5000, 10000):
            (out_dir / f"splat_{step}.ply").write_bytes(b"x")
        (out_dir / "splat_not_a_step.ply").write_bytes(b"x")  # must not confuse the resume picker
        latest = fit_splat.find_latest_opensplat_checkpoint(out_dir, "splat")
        check("fit-splat: resume picks the highest-numbered checkpoint", latest.name == "splat_10000.ply")

    with tempfile.TemporaryDirectory() as tmp:
        check("fit-splat: no checkpoint found when none exist", fit_splat.find_latest_opensplat_checkpoint(Path(tmp), "splat") is None)


def check_mount_path():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "some-run-specific-dirname"  # deliberately not "studiokitchen"
        (project / "opensfm").mkdir(parents=True)
        (project / "opensfm" / "image_list.txt").write_text("/datasets/studiokitchen/images/frame_0004.jpg\n")
        mount = fit_splat.expected_mount_path(project)
        check("fit-splat: mount path is read back from OpenSfM's own recorded absolute paths, not guessed from the directory name",
              mount == "/datasets/studiokitchen", mount)

    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "no-opensfm-here"
        project.mkdir()
        mount = fit_splat.expected_mount_path(project)
        check("fit-splat: falls back to the directory name when nothing is recorded to reproduce",
              mount == "/datasets/no-opensfm-here", mount)


# --- clean-splat ---------------------------------------------------------------------------------

GAUSSIAN_PROPS = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
                  "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]
GAUSSIAN_TYPES = ["float"] * len(GAUSSIAN_PROPS)


def make_gaussian(x, y, z, opacity=0.5, scale=0.1):
    return (x, y, z, 0.5, 0.5, 0.5, opacity, scale, scale, scale, 1.0, 0.0, 0.0, 0.0)


def check_ply_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "roundtrip.ply"
        rows = [make_gaussian(1.0, 2.0, 3.0), make_gaussian(-1.0, -2.0, -3.0, opacity=0.9)]
        clean_splat.write_ply(path, GAUSSIAN_PROPS, GAUSSIAN_TYPES, rows)
        names, read_back = clean_splat.read_ply(path)
        check("clean-splat: PLY round-trips property names", names == GAUSSIAN_PROPS)
        check("clean-splat: PLY round-trips vertex count and values",
              len(read_back) == 2 and abs(read_back[0][0] - 1.0) < 1e-5)


def check_nonfinite_drop():
    rows = [make_gaussian(0, 0, 0), make_gaussian(float("nan"), 0, 0), make_gaussian(0, 0, 0, ),
            (float("inf"),) + make_gaussian(0, 0, 0)[1:]]
    kept, dropped = clean_splat.drop_nonfinite(GAUSSIAN_PROPS, rows)
    check("clean-splat: drops NaN and Inf gaussians", dropped == 2 and len(kept) == 2, f"dropped={dropped}")


def check_polygon_crop():
    square = [(0, 0), (10, 0), (10, 10), (0, 10)]
    check("clean-splat: point-in-polygon keeps an interior point", clean_splat.point_in_polygon(5, 5, square))
    check("clean-splat: point-in-polygon rejects an exterior point", not clean_splat.point_in_polygon(50, 50, square))

    rows = [make_gaussian(5, 5, 1), make_gaussian(50, 50, 1), make_gaussian(5, 5, 100)]  # 2nd outside xy, 3rd outside z
    kept, dropped = clean_splat.crop_to_site(GAUSSIAN_PROPS, rows, square, z_min=0, z_max=10)
    check("clean-splat: crop_to_site keeps only the gaussian inside both the polygon and the z-range",
          len(kept) == 1 and dropped == 2, f"kept={len(kept)} dropped={dropped}")


def check_sor():
    # A tight cluster plus one obvious, distant floater.
    rows = [make_gaussian(x * 0.1, y * 0.1, 0) for x in range(6) for y in range(6)]
    rows.append(make_gaussian(500, 500, 500))
    kept, dropped = clean_splat.statistical_outlier_removal(GAUSSIAN_PROPS, rows, k=4, std_ratio=2.0)
    check("clean-splat: statistical outlier removal drops the distant floater and keeps the cluster",
          dropped >= 1 and len(kept) == len(rows) - dropped and all(r[0] < 100 for r in kept),
          f"dropped={dropped} kept={len(kept)}")


def check_opacity_scale_prune():
    rows = [make_gaussian(0, 0, 0, opacity=0.5, scale=0.1),
            make_gaussian(1, 1, 1, opacity=0.001, scale=0.1),   # too transparent
            make_gaussian(2, 2, 2, opacity=0.5, scale=50.0)]    # spike
    kept, dropped = clean_splat.prune_opacity_scale(GAUSSIAN_PROPS, rows)
    check("clean-splat: opacity/scale pruning drops the transparent and the spiked gaussian, keeps the good one",
          dropped == 2 and len(kept) == 1)


def check_gate():
    counts = {"initial": 10000, "dropped_crop": 500, "after_crop": 9500, "dropped_sor": 500, "dropped_prune": 500, "final": 8500}
    passed, reasons = clean_splat.evaluate_gate(counts, val_psnr=20.0, polygon_given=True, boundary_overlap_ok=True)
    check("clean-splat: gate passes on healthy counts and PSNR", passed, "; ".join(reasons))

    passed, reasons = clean_splat.evaluate_gate(counts, val_psnr=20.0, polygon_given=True, boundary_overlap_ok=False)
    check("clean-splat: gate fails when the independent boundary-overlap check fails", not passed)

    bad_counts = dict(counts, dropped_crop=90, after_crop=10)
    passed, reasons = clean_splat.evaluate_gate(bad_counts, val_psnr=20.0, polygon_given=True, boundary_overlap_ok=True)
    check("clean-splat: gate fails when the crop removes an implausibly large fraction", not passed)

    passed, reasons = clean_splat.evaluate_gate(counts, val_psnr=5.0, polygon_given=True, boundary_overlap_ok=True)
    check("clean-splat: gate fails on low held-out validation PSNR", not passed)

    passed, reasons = clean_splat.evaluate_gate(counts, val_psnr=None, polygon_given=False, boundary_overlap_ok=None)
    check("clean-splat: gate fails (not silently passes) when no validation PSNR is available at all", not passed)

    tiny = dict(counts, final=10)
    passed, reasons = clean_splat.evaluate_gate(tiny, val_psnr=20.0, polygon_given=False, boundary_overlap_ok=None)
    check("clean-splat: gate fails when too few gaussians survive cleaning", not passed)


def check_clean_splat_end_to_end():
    """The whole Node, run as a subprocess against a small synthetic PLY -- no GPU involved."""
    import subprocess

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        rows = [make_gaussian(x * 0.1, y * 0.1, 0, opacity=0.5) for x in range(40) for y in range(40)]
        rows.append(make_gaussian(500, 500, 500, opacity=0.5))  # floater the gate should catch via SOR
        in_ply = tmp / "raw.ply"
        clean_splat.write_ply(in_ply, GAUSSIAN_PROPS, GAUSSIAN_TYPES, rows)
        fit_report = tmp / "fit-report.json"
        fit_report.write_text(json.dumps({"val_psnr": 22.5}))

        out_ply, out_report = tmp / "cleaned.ply", tmp / "clean-report.json"
        result = subprocess.run(
            [sys.executable, str(NODES / "clean-splat" / "clean_splat.py"),
             "--in", str(in_ply), "--fit-report", str(fit_report), "--out", str(out_ply), "--out-report", str(out_report)],
            capture_output=True, text=True,
        )
        check("clean-splat: Node subprocess exits 0 on a scene that should pass the gate", result.returncode == 0, result.stderr)
        report = json.loads(out_report.read_text())
        check("clean-splat: Node subprocess removes the injected floater", report["counts"]["dropped_sor"] >= 1, json.dumps(report))
        check("clean-splat: Node subprocess reports gate=pass in its own report.json", report["gate"] == "pass", json.dumps(report))

        # No validation PSNR at all -> the gate must fail, and the Node must say so with a non-zero exit.
        result2 = subprocess.run(
            [sys.executable, str(NODES / "clean-splat" / "clean_splat.py"),
             "--in", str(in_ply), "--out", str(tmp / "cleaned2.ply"), "--out-report", str(tmp / "clean-report2.json")],
            capture_output=True, text=True,
        )
        check("clean-splat: Node subprocess exits non-zero (never silently passes) with no PSNR evidence at all",
              result2.returncode != 0, result2.stderr)


# --- compress-splat --------------------------------------------------------------------------------

def check_compress_report():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        raw = tmp / "cleaned.ply"
        raw.write_bytes(b"0" * 10_000)
        small = tmp / "scene.sog"
        small.write_bytes(b"0" * 1_000)  # 10x smaller: should pass
        report = compress_splat.build_report(raw, small)
        check("compress-splat: report computes raw/compressed sizes and ratio",
              report["raw_bytes"] == 10_000 and report["compressed_bytes"] == 1_000 and report["compression_ratio"] == 10.0)
        ok, detail = compress_splat.check_ratio(report)
        check("compress-splat: gate passes a real compression win", ok, detail)

        barely_smaller = tmp / "scene_barely.sog"
        barely_smaller.write_bytes(b"0" * 9_000)  # 1.11x: should fail the sanity floor
        report2 = compress_splat.build_report(raw, barely_smaller)
        ok2, detail2 = compress_splat.check_ratio(report2)
        check("compress-splat: gate fails (never silently passes) when the output isn't meaningfully smaller",
              not ok2, detail2)


def main() -> None:
    check_solve_gate()
    check_memory_policy()
    check_command_construction()
    check_checkpoint_resume()
    check_mount_path()
    check_ply_roundtrip()
    check_nonfinite_drop()
    check_polygon_crop()
    check_sor()
    check_opacity_scale_prune()
    check_gate()
    check_clean_splat_end_to_end()
    check_compress_report()

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall splat Node checks passed")


if __name__ == "__main__":
    main()
