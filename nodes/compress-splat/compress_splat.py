#!/usr/bin/env python3
"""compress-splat: trained/cleaned splat to the web delivery format.

docs/research/viewers-and-web-delivery-2026.md names SOG as the format for
this pipeline: first-party support in the SuperSplat Editor/Viewer this
business already committed to (ADR 0008), 15-20x smaller than PLY. The
converter is PlayCanvas's own `splat-transform` (MIT), run through a small
pinned Node.js image (nodes/compress-splat/Dockerfile) rather than npm-
installing it fresh every run -- the same "don't refetch a dependency every
run" lesson #8 already established for the AlexNet weights.

`splat-transform`'s SOG output is a single self-contained .sog file (a zip
container of quantized, WebP-encoded attribute images). Compressing a real
splat's spherical-harmonic coefficients needs a working WebGPU device, which
this host cannot provide (see `convert_to_sog`'s docstring for what was
tried); this Node filters to SH band 0 (`-H 0`) before writing, a measured
CPU-only path at the cost of view-dependent colour. Its floater/cluster
*filters* also need a GPU and are not used here either -- clean-splat
already did floater removal. scene.sog is
copied to the path nodes/bundle/build.py already expects
(BUNDLE_SPLAT_SCENE / splat/scene.sog); the companion meta.json is this
Node's own small manifest, not the deeper SuperSplat viewer-settings format
-- see the module's research doc for what's still open there.

`convert_to_sog` is the only function that shells out; everything else is
pure so `nodes/check_splat.py` can exercise the size-ratio and sanity-check
logic without Docker, npm, or a network connection.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import die, emit_report  # noqa: E402

SPLAT_TRANSFORM_IMAGE = "splat-transform:local"  # built from nodes/compress-splat/Dockerfile
MIN_COMPRESSION_RATIO = 1.5  # a compressed file that isn't meaningfully smaller means something went wrong quietly


def convert_to_sog(in_ply: Path, out_scene: Path) -> None:
    """Plain PLY-to-SOG conversion runs on the CPU (measured directly: a 200-gaussian,
    0-SH-band fixture converts with no GPU at all). A splat with spherical harmonics
    beyond band 0 does not: splat-transform's SOG encoder needs a working WebGPU
    device to compress SH coefficients, and this host's containerized Vulkan stack
    cannot provide one -- confirmed by installing libvulkan1, setting
    NVIDIA_DRIVER_CAPABILITIES=all and XDG_RUNTIME_DIR, and still hitting a Vulkan
    "shaderUniform*ArrayDynamicIndexing required" adapter-feature error on this
    driver. Rather than depend on a GPU capability this host cannot supply,
    `-H 0` filters to spherical-harmonic band 0 before writing: flat per-gaussian
    colour, no view-dependent specular detail, but a real, measured, CPU-only path.
    Revisit once a host with a working WebGPU/Vulkan stack is available; the SH
    bands OpenSplat fits are simply dropped here, not degraded some other way.
    """
    out_scene.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{in_ply.parent}:/in:ro", "-v", f"{out_scene.parent}:/out",
        SPLAT_TRANSFORM_IMAGE, "splat-transform", "-w", f"/in/{in_ply.name}", "-H", "0", f"/out/{out_scene.name}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        die(f"compress-splat: splat-transform failed:\n{result.stdout}\n{result.stderr}")


def build_report(raw_path: Path, compressed_path: Path, engine: str = "splat-transform") -> dict:
    """Pure I/O: sizes and their ratio. No subprocess -- check_splat.py exercises this directly."""
    raw_size = raw_path.stat().st_size
    compressed_size = compressed_path.stat().st_size
    ratio = raw_size / compressed_size if compressed_size else 0.0
    return {
        "engine": engine, "generated_at": datetime.now(timezone.utc).isoformat(),
        "raw_bytes": raw_size, "compressed_bytes": compressed_size, "compression_ratio": round(ratio, 2),
    }


def check_ratio(report: dict) -> tuple[bool, str]:
    ratio = report["compression_ratio"]
    if ratio < MIN_COMPRESSION_RATIO:
        return False, f"compression ratio {ratio}x < {MIN_COMPRESSION_RATIO}x -- output is not meaningfully smaller"
    return True, f"compression ratio {ratio}x"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="in_ply", required=True, type=Path, help="cleaned splat.ply from clean-splat")
    p.add_argument("--out-scene", required=True, type=Path, help="scene.sog")
    p.add_argument("--out-meta", required=True, type=Path, help="meta.json (nodes/bundle's --splat-meta)")
    p.add_argument("--out-report", required=True, type=Path)
    args = p.parse_args()

    convert_to_sog(args.in_ply, args.out_scene)

    report = build_report(args.in_ply, args.out_scene)
    ok, detail = check_ratio(report)
    report["gate"] = "pass" if ok else "fail"
    report["detail"] = detail

    args.out_meta.parent.mkdir(parents=True, exist_ok=True)
    args.out_meta.write_text(json.dumps({"source": args.in_ply.name, **report}, indent=1))
    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    emit_report(args.out_report, report)
    print(f"compress-splat: {json.dumps(report, indent=1)}")

    if not ok:
        die(f"compress-splat: {detail}")


if __name__ == "__main__":
    main()
