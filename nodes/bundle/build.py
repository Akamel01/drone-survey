#!/usr/bin/env python3
"""nodes/bundle/build.py — assemble a Delivery Bundle (ADR 0011, ADR 0008).

A Delivery Bundle is self-contained: the Orthomosaic and/or splat, the
viewer page(s) that show them, vendored (not CDN-fetched) viewer assets, the
licence notices those assets require on redistribution, and a manifest of
every file with its size and hash. Layout matches
docs/business/object-storage-setup.md exactly:

    <out>/
      index.html            landing page, links to whichever viewer(s) exist
      ortho.html            MapLibre GL JS + maplibre-cog-protocol (if --ortho)
      splat.html            PlayCanvas SuperSplat Viewer (if --splat-scene)
      ortho/orthomosaic.tif
      splat/scene.sog, splat/meta.json
      assets/               vendored viewer JS/CSS, pinned versions
      report/               optional
      NOTICES.txt           third-party licence notices for what's included
      bundle-manifest.json  every file above: relative path, size, sha256

At least one of --ortho / --splat-scene is required. Ortho/splat/report
source paths have no upstream Node in pipeline/manifests/deliver.json yet
(no ingest/reconstruct/export-cog Node exists), so they are read from
BUNDLE_ORTHO / BUNDLE_SPLAT_SCENE / BUNDLE_SPLAT_META / BUNDLE_REPORT /
BUNDLE_VENDOR_DIR env vars as well as the equivalent --flags, so the Manifest
can supply them without a {in.x} wire that doesn't exist yet.

Every asset version below is a pin the operator must confirm against the
current upstream release before a real delivery — this box has no network
access to check tags. See docs/research/viewers-and-web-delivery-2026.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# ponytail: pinned versions asserted from research, not re-verified against
# upstream tags on this offline box — confirm before a real delivery.
ASSETS_FOR_ORTHO = [
    # (dest filename in assets/, project, version, license)
    ("maplibre-gl.js", "MapLibre GL JS", "4.7.1", "BSD-3-Clause"),
    ("maplibre-gl.css", "MapLibre GL JS", "4.7.1", "BSD-3-Clause"),
    ("maplibre-cog-protocol.js", "maplibre-cog-protocol", "0.6.0", "MIT"),
]
ASSETS_FOR_SPLAT = [
    ("supersplat-viewer.js", "@playcanvas/supersplat-viewer (PlayCanvas Engine)", "2.3.0", "MIT"),
]

MIT_BODY = """MIT License

Copyright (c) {year} {holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

BSD3_BODY = """BSD 3-Clause License

Copyright (c) {year}, {holder}
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
"""

LICENSE_BODIES = {"MIT": MIT_BODY, "BSD-3-Clause": BSD3_BODY}

NOINDEX_META = '<meta name="robots" content="noindex, nofollow">'


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_asset(assets_dir: Path, vendor_dir: Path | None, filename: str, project: str, version: str) -> None:
    """Copy a vendored library file in, or leave a clearly-marked placeholder.

    ADR 0011: assets ship vendored in the Bundle, never fetched from a CDN at
    view time. Nobody has downloaded the real pinned builds onto this box, so
    --vendor-dir (a local folder the operator populates) is optional; without
    it we write an honest placeholder rather than pretend it's a real embed.
    """
    dest = assets_dir / filename
    src = vendor_dir / filename if vendor_dir else None
    if src and src.is_file():
        shutil.copyfile(src, dest)
        return
    if filename.endswith((".js", ".css")):
        text = (
            f"/* PLACEHOLDER for {project} v{version} — not vendored on this box.\n"
            f"   Replace with the real pinned build before a real delivery\n"
            f"   (see docs/business/object-storage-setup.md and --vendor-dir). */\n"
        )
    else:
        text = (
            f"# PLACEHOLDER for {project} v{version} — not vendored on this box.\n"
            f"# Replace with the real pinned build before a real delivery.\n"
        )
    dest.write_text(text)


def notices_text(components: list[tuple[str, str, str]]) -> str:
    """components: (project, version, license) for everything actually included."""
    year = datetime.now(timezone.utc).year
    parts = [
        "Third-party notices for this Delivery Bundle\n"
        "=============================================\n\n"
        "This Bundle redistributes the following permissively licensed viewer\n"
        "libraries. Each licence's notice is reproduced below, as its terms\n"
        "require on redistribution (ADR 0011).\n"
    ]
    seen = set()
    for project, version, license_id in components:
        if project in seen:
            continue
        seen.add(project)
        body = LICENSE_BODIES[license_id].format(year=year, holder=f"{project} contributors")
        parts.append(f"\n-----\n{project} {version} — {license_id}\n-----\n\n{body}")
    return "".join(parts)


def render_index(has_ortho: bool, has_splat: bool, has_report: bool) -> str:
    links = []
    if has_ortho:
        links.append('<li><a href="ortho.html">Orthomosaic</a></li>')
    if has_splat:
        links.append('<li><a href="splat.html">3D reconstruction</a></li>')
    if has_report:
        links.append('<li><a href="report/">Report</a></li>')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
{NOINDEX_META}
<title>Delivery Bundle</title>
</head>
<body>
<h1>Delivery Bundle</h1>
<ul>
{''.join(links)}
</ul>
</body>
</html>
"""


def render_ortho_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
{NOINDEX_META}
<title>Orthomosaic</title>
<link rel="stylesheet" href="assets/maplibre-gl.css">
<script src="assets/maplibre-gl.js"></script>
<script src="assets/maplibre-cog-protocol.js"></script>
<style>html,body,#map{{height:100%;margin:0}}</style>
</head>
<body>
<div id="map"></div>
<script>
maplibregl.addProtocol('cog', new MaplibreCOGProtocol.CogProtocol().handleRequest);
const map = new maplibregl.Map({{
  container: 'map',
  style: {{
    version: 8,
    sources: {{
      ortho: {{type: 'raster', tiles: ['cog://' + new URL('ortho/orthomosaic.tif', location.href).href], tileSize: 256}}
    }},
    layers: [{{id: 'ortho', type: 'raster', source: 'ortho'}}]
  }},
  center: [0, 0],
  zoom: 1
}});
</script>
</body>
</html>
"""


def render_splat_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
{NOINDEX_META}
<title>3D reconstruction</title>
<script src="assets/supersplat-viewer.js"></script>
<style>html,body,#viewer{{height:100%;margin:0}}</style>
</head>
<body>
<div id="viewer"></div>
<script>
SupersplatViewer.load({{
  container: document.getElementById('viewer'),
  scene: 'splat/scene.sog',
  meta: 'splat/meta.json'
}});
</script>
</body>
</html>
"""


def build(args: argparse.Namespace) -> Path:
    if not args.ortho and not args.splat_scene:
        sys.exit("refusing to build a Bundle with neither --ortho nor --splat-scene")
    if args.splat_scene and not args.splat_meta:
        sys.exit("--splat-scene needs --splat-meta (SuperSplat Viewer's companion metadata file)")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    bundle_id = args.bundle_id or secrets.token_hex(6)
    vendor_dir = Path(args.vendor_dir) if args.vendor_dir else None

    components: list[tuple[str, str, str]] = []
    has_report = False

    assets_dir = out / "assets"
    assets_dir.mkdir(exist_ok=True)

    if args.ortho:
        ortho_dir = out / "ortho"
        ortho_dir.mkdir(exist_ok=True)
        shutil.copyfile(args.ortho, ortho_dir / "orthomosaic.tif")
        for filename, project, version, license_id in ASSETS_FOR_ORTHO:
            write_asset(assets_dir, vendor_dir, filename, project, version)
            components.append((project, version, license_id))
        (out / "ortho.html").write_text(render_ortho_html())

    if args.splat_scene:
        splat_dir = out / "splat"
        splat_dir.mkdir(exist_ok=True)
        shutil.copyfile(args.splat_scene, splat_dir / "scene.sog")
        shutil.copyfile(args.splat_meta, splat_dir / "meta.json")
        for filename, project, version, license_id in ASSETS_FOR_SPLAT:
            write_asset(assets_dir, vendor_dir, filename, project, version)
            components.append((project, version, license_id))
        (out / "splat.html").write_text(render_splat_html())

    if args.report:
        report_dir = out / "report"
        report_dir.mkdir(exist_ok=True)
        shutil.copyfile(args.report, report_dir / Path(args.report).name)
        has_report = True

    (out / "index.html").write_text(render_index(bool(args.ortho), bool(args.splat_scene), has_report))
    (out / "NOTICES.txt").write_text(notices_text(components))

    # bundle-manifest.json last: it hashes everything else already written.
    files = []
    for path in sorted(out.rglob("*")):
        if path.is_file():
            rel = path.relative_to(out).as_posix()
            files.append({"path": rel, "size": path.stat().st_size, "sha256": sha256_of(path)})
    manifest = {
        "bundle_id": bundle_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "deliverables": [d for d, present in (("orthomosaic", args.ortho), ("splat", args.splat_scene)) if present],
        "files": files,
    }
    (out / "bundle-manifest.json").write_text(json.dumps(manifest, indent=2))
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", required=True, help="directory to assemble the Bundle into")
    p.add_argument("--bundle-id", default=os.environ.get("BUNDLE_ID"), help="opaque per-Bundle token; random if omitted")
    p.add_argument("--ortho", default=os.environ.get("BUNDLE_ORTHO"), help="path to the Orthomosaic COG")
    p.add_argument("--splat-scene", default=os.environ.get("BUNDLE_SPLAT_SCENE"), help="path to the .sog splat scene")
    p.add_argument("--splat-meta", default=os.environ.get("BUNDLE_SPLAT_META"), help="path to the splat's meta.json")
    p.add_argument("--report", default=os.environ.get("BUNDLE_REPORT"), help="optional PDF/summary")
    p.add_argument("--vendor-dir", default=os.environ.get("BUNDLE_VENDOR_DIR"), help="local folder of pinned viewer JS/CSS builds")
    args = p.parse_args()
    out = build(args)
    print(f"bundle assembled: {out}")


if __name__ == "__main__":
    main()
