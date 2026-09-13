#!/usr/bin/env python3
"""nodes/check_deliver.py — offline check for the bundle and publish Nodes (ADR 0018).

Builds a Delivery Bundle from small synthetic inputs, checks its layout,
hashes, notices, and that its viewer HTML references only files the Bundle
actually contains; dry-run-publishes it; confirms publish refuses without
credentials; and runs the real deliver.json Manifest through the Runner
end-to-end (ADR 0018: per-Node checks are not enough, the seam has to run
too), entirely offline — no network, no real credentials, no accounts.

    python3 nodes/check_deliver.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BUNDLE_BUILD = REPO_ROOT / "nodes" / "bundle" / "build.py"
PUBLISH = REPO_ROOT / "nodes" / "publish" / "publish.py"
DELIVER_MANIFEST = REPO_ROOT / "pipeline" / "manifests" / "deliver.json"
RUNNER = REPO_ROOT / "pipeline" / "runner.py"

HTML_REF = re.compile(r'(?:src|href)="([^"]+)"')


def sha256_of(path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def make_synthetic_ortho(fixtures: Path) -> Path:
    """A tiny valid GeoTIFF if rasterio/gdal are importable, else a clearly-named placeholder."""
    try:
        import numpy as np
        import rasterio
        from rasterio.transform import from_origin

        dest = fixtures / "synthetic_ortho.tif"
        data = np.zeros((1, 4, 4), dtype="uint8")
        with rasterio.open(
            dest, "w", driver="GTiff", height=4, width=4, count=1, dtype="uint8",
            crs="EPSG:4326", transform=from_origin(0, 0, 1, 1),
        ) as dst:
            dst.write(data)
        return dest
    except ImportError:
        pass

    dest = fixtures / "synthetic_ortho.PLACEHOLDER.tif"
    dest.write_bytes(b"not a real GeoTIFF -- gdal/rasterio unavailable on this box\n")
    return dest


def make_synthetic_splat(fixtures: Path) -> tuple[Path, Path]:
    """No open-source splat writer is installed here, so this is always a clearly-named placeholder."""
    scene = fixtures / "synthetic_scene.PLACEHOLDER.sog"
    scene.write_bytes(b"not a real SOG splat scene -- placeholder for the offline check\n")
    meta = fixtures / "synthetic_meta.PLACEHOLDER.json"
    meta.write_text(json.dumps({"placeholder": True, "note": "synthetic fixture for check_deliver.py"}))
    return scene, meta


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, **kw)


def check_bundle(bundle_dir: Path, ortho: Path, scene: Path, meta: Path) -> dict:
    result = run([
        sys.executable, str(BUNDLE_BUILD),
        "--out", str(bundle_dir),
        "--ortho", str(ortho),
        "--splat-scene", str(scene),
        "--splat-meta", str(meta),
    ])
    assert result.returncode == 0, f"bundle build failed:\n{result.stderr}"

    manifest_path = bundle_dir / "bundle-manifest.json"
    assert manifest_path.is_file(), "bundle-manifest.json missing"
    manifest = json.loads(manifest_path.read_text())
    assert manifest["files"], "bundle-manifest.json lists no files"

    on_disk = {p.relative_to(bundle_dir).as_posix() for p in bundle_dir.rglob("*") if p.is_file()} - {"bundle-manifest.json"}
    listed = {f["path"] for f in manifest["files"]}
    assert on_disk == listed, f"bundle-manifest.json disagrees with disk: only-on-disk={on_disk - listed} only-in-manifest={listed - on_disk}"

    for f in manifest["files"]:
        full = bundle_dir / f["path"]
        assert full.stat().st_size == f["size"], f"size mismatch for {f['path']}"
        assert sha256_of(full) == f["sha256"], f"hash mismatch for {f['path']}"

    for expected_dir in ("ortho", "splat", "assets"):
        assert (bundle_dir / expected_dir).is_dir(), f"missing {expected_dir}/ per docs/business/object-storage-setup.md layout"
    assert (bundle_dir / "ortho" / "orthomosaic.tif").is_file()
    assert (bundle_dir / "splat" / "scene.sog").is_file()
    assert (bundle_dir / "splat" / "meta.json").is_file()

    notices = (bundle_dir / "NOTICES.txt").read_text()
    for expected in ("MapLibre", "maplibre-cog-protocol", "PlayCanvas", "MIT License", "BSD 3-Clause"):
        assert expected in notices, f"NOTICES.txt missing expected text: {expected}"

    html_files = list(bundle_dir.glob("*.html"))
    assert html_files, "no viewer HTML pages generated"
    for html_path in html_files:
        text = html_path.read_text()
        assert "noindex" in text, f"{html_path.name} missing noindex meta tag (ADR 0011 unlisted-URL mitigation)"
        for ref in HTML_REF.findall(text):
            if ref.startswith(("http://", "https://", "//", "#", "mailto:")):
                raise AssertionError(f"{html_path.name} references an external/CDN URL {ref!r} — Bundle must be self-contained (ADR 0011)")
            assert (bundle_dir / ref).is_file(), f"{html_path.name} references {ref!r}, not present in the Bundle"

    try:
        import rasterio

        with rasterio.open(bundle_dir / "ortho" / "orthomosaic.tif"):
            pass
    except ImportError:
        pass

    print(f"bundle check: ok ({len(manifest['files'])} files, bundle_id={manifest['bundle_id']})")
    return manifest


def check_publish_dry_run(bundle_dir: Path) -> None:
    result = run([
        sys.executable, str(PUBLISH),
        "--bundle", str(bundle_dir),
        "--bucket", "wayfinder-delivery-bundles",
        "--creds", "/nonexistent/b2-delivery.env",
        "--dry-run",
    ])
    assert result.returncode == 0, f"publish --dry-run should succeed without credentials:\n{result.stderr}"
    assert "DRY RUN" in result.stdout
    assert "no network request made" in result.stdout
    manifest = json.loads((bundle_dir / "bundle-manifest.json").read_text())
    for f in manifest["files"]:
        assert f["path"] in result.stdout, f"dry-run plan omits {f['path']}"
    print("publish --dry-run check: ok")


def check_publish_refuses_without_credentials(bundle_dir: Path) -> None:
    result = run([
        sys.executable, str(PUBLISH),
        "--bundle", str(bundle_dir),
        "--bucket", "wayfinder-delivery-bundles",
        "--creds", "/nonexistent/b2-delivery.env",
    ])
    assert result.returncode != 0, "publish should refuse a real run with no credentials file"
    assert "refusing to publish" in result.stderr and "credentials" in result.stderr
    print("publish refuses-without-credentials check: ok")


def check_runner_end_to_end(ortho: Path, scene: Path, meta: Path) -> None:
    with tempfile.TemporaryDirectory() as workdir:
        env = dict(os.environ)
        env.update(BUNDLE_ORTHO=str(ortho), BUNDLE_SPLAT_SCENE=str(scene), BUNDLE_SPLAT_META=str(meta))
        result = run([sys.executable, str(RUNNER), str(DELIVER_MANIFEST), "--workdir", workdir], env=env)
        assert result.returncode == 0, f"Runner failed on deliver.json:\n{result.stdout}\n{result.stderr}"
        assert "pipeline 'deliver' complete." in result.stdout, result.stdout

        state = json.loads((Path(workdir) / "state.json").read_text())
        assert state["nodes"]["bundle"]["status"] == "done"
        assert state["nodes"]["publish"]["status"] == "done"

        bundle_out = Path(workdir) / "nodes" / "bundle" / "bundle"
        assert (bundle_out / "bundle-manifest.json").is_file(), "Runner-driven bundle Node produced no Bundle"
    print("Runner end-to-end check (deliver.json, --dry-run publish): ok")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        fixtures = Path(tmp) / "fixtures"
        fixtures.mkdir()
        ortho = make_synthetic_ortho(fixtures)
        scene, meta = make_synthetic_splat(fixtures)

        bundle_dir = Path(tmp) / "bundle"
        check_bundle(bundle_dir, ortho, scene, meta)
        check_publish_dry_run(bundle_dir)
        check_publish_refuses_without_credentials(bundle_dir)
        check_runner_end_to_end(ortho, scene, meta)

    print("check_deliver: all checks passed")


if __name__ == "__main__":
    main()
