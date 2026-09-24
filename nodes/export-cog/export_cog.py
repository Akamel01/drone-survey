#!/usr/bin/env python3
"""export-cog: orthophoto to a Cloud-Optimized GeoTIFF that actually validates.

#15/#23's finding: NodeODM's `cog: true` option does not produce a valid COG.
The delivered file fails GDAL's own validator -- wrong main-IFD offset,
image blocks before their IFD, 714x2 strips instead of tiles, no overviews.
The fix is not a flag on the ODM side (there isn't one that works) but a
second, explicit conversion, run here:

    gdal_translate -of COG -co COMPRESS=DEFLATE -co PREDICTOR=2
                   -co BLOCKSIZE=512 -co OVERVIEW_RESAMPLING=AVERAGE
                   -co BIGTIFF=IF_SAFER
                   odm_orthophoto.tif out.tif

**Compression**: DEFLATE, lossless. An Orthomosaic reads as "distances can be
read off it directly" (CONTEXT.md) -- a lossy codec (JPEG/WEBP) would bake
visible block artefacts into a deliverable sold as a map. PREDICTOR=2
(horizontal differencing) is free extra ratio on DEFLATE for imagery with
locally smooth runs, which an orthophoto mostly is.

**Mask**: keep ODM's own 4th (alpha) band rather than converting to a
separate internal GDAL mask band. ADR 0008's client-facing viewer is
MapLibre GL JS reading the COG directly over range requests -- an RGBA COG
is what maplibre-cog-protocol expects natively; a side-channel mask band
would need the viewer to know to look for it for no benefit here.

**Validator**: GDAL's own `validate_cloud_optimized_geotiff.py` if importable
(needs `osgeo`), confirmed available inside `ghcr.io/osgeo/gdal:ubuntu-small-*`
via `python3 -c "from osgeo import gdal"` -- this is why the Manifest runs
this Node with `"image"` set to that container rather than assuming GDAL is
on the host (it measurably is not: #15's comment notes the Mac's default
python3 can't import osgeo either). Falls back to `gdalinfo -json` layout
inspection (LAYOUT=COG, tiled, has overviews) if the validator script isn't
importable -- weaker, but still a check of the actual file rather than an
exit code (ADR 0018).

Usage:
    python3 export_cog.py --in odm_orthophoto.tif --out OUT_DIR
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

# ADR 0018's raster check: ODM has delivered a mostly-empty orthophoto with a
# zero exit, and the first golden run did it again (0.28% valid pixels).
# ponytail: one conservative floor for every Site; a rotated grid in its
# bounding box is typically 40-70% valid. Tune per Site if one trips it honestly.
MIN_VALID_FRACTION = 0.25

# **Projection**: reproject to Web Mercator. ODM writes its orthophoto in the
# Site's UTM zone (the golden run: EPSG:32617), and maplibre-cog-protocol
# refuses anything else outright -- "COG projection EPSG:32617 ... is not
# supported. Reproject to EPSG:3857 (Web Mercator)." -- so a COG that is valid
# by every structural check still renders nothing in the client's viewer. The
# COG driver's TARGET_SRS warps and rebuilds overviews in one pass. Delivery is
# what this Node is for; anything measuring in metres should read ODM's own
# output in its UTM zone rather than this file.
COG_TARGET_SRS = "EPSG:3857"

COG_CREATION_OPTIONS = [
    "-co", f"TARGET_SRS={COG_TARGET_SRS}",
    "-co", "RESAMPLING=BILINEAR",
    "-co", "COMPRESS=DEFLATE",
    "-co", "PREDICTOR=2",
    "-co", "BLOCKSIZE=512",
    "-co", "OVERVIEW_RESAMPLING=AVERAGE",
    "-co", "BIGTIFF=IF_SAFER",
]


def convert_to_cog(src: Path, dst: Path) -> None:
    if shutil.which("gdal_translate") is None:
        sys.exit("export-cog: gdal_translate not found on PATH -- run this Node with "
                 "\"image\": \"ghcr.io/osgeo/gdal:ubuntu-small-3.10.3\" in the Manifest")
    cmd = ["gdal_translate", "-of", "COG", *COG_CREATION_OPTIONS, str(src), str(dst)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"export-cog: gdal_translate failed:\n{result.stderr}")


def validate_with_osgeo(path: Path) -> tuple[bool, str]:
    """The real validator, ported into this process rather than shelled out to
    (it ships as a standalone script in GDAL's source tree, not always on
    PATH) -- same checks: IFD offset/order, tiling, overviews."""
    try:
        from osgeo import gdal
    except ImportError:
        return None, "osgeo not importable"

    gdal.UseExceptions()
    errors = []
    ds = gdal.Open(str(path))
    if ds is None:
        return False, "gdal could not open the file at all"

    # A real COG-driver-produced file is valid by construction, but this
    # Node's contract is "passes the validator", not "trusts the driver" --
    # ADR 0018 exists precisely because a flag/driver reporting success has
    # already been wrong once (NodeODM's own `cog` option).
    structure_md = ds.GetMetadata("IMAGE_STRUCTURE")
    if structure_md.get("LAYOUT") != "COG":
        errors.append(f"IMAGE_STRUCTURE LAYOUT is {structure_md.get('LAYOUT')!r}, not 'COG'")
    block_x, block_y = ds.GetRasterBand(1).GetBlockSize()
    if block_x < 256 or block_y < 256:
        errors.append(f"block size {block_x}x{block_y} is not tiled (expected >= 256x256)")
    if ds.GetRasterBand(1).GetOverviewCount() < 1:
        errors.append("no overviews present")

    # The exact failure this ticket's evidence recorded: main IFD not at
    # offset 8, and/or image blocks laid out before their IFD.
    ifd_offset = ds.GetMetadataItem("IFD_OFFSET", "TIFF")
    if ifd_offset is not None and int(ifd_offset) != 8:
        errors.append(f"main IFD offset is {ifd_offset}, expected 8")

    # A structurally perfect COG in the wrong projection renders nothing: the
    # client viewer's COG protocol refuses any CRS but Web Mercator. Checked
    # against the written file rather than assumed from the creation option.
    srs = ds.GetSpatialRef()
    code = srs.GetAuthorityCode(None) if srs is not None else None
    if code != COG_TARGET_SRS.split(":")[1]:
        errors.append(f"projection is EPSG:{code}, not {COG_TARGET_SRS} -- the viewer will refuse it")

    return (len(errors) == 0), ("valid COG" if not errors else "; ".join(errors))


def validate_with_gdalinfo(path: Path) -> tuple[bool, str]:
    if shutil.which("gdalinfo") is None:
        return None, "gdalinfo not found on PATH"
    result = subprocess.run(["gdalinfo", "-json", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        return False, f"gdalinfo failed: {result.stderr}"
    info = json.loads(result.stdout)
    md = info.get("metadata", {}).get("IMAGE_STRUCTURE", {})
    bands = info.get("bands", [])
    errors = []
    if md.get("LAYOUT") != "COG":
        errors.append(f"IMAGE_STRUCTURE LAYOUT is {md.get('LAYOUT')!r}, not 'COG'")
    if bands and "overviews" not in bands[0]:
        errors.append("no overviews reported")
    code = (info.get("stac", {}).get("proj:epsg")
            or info.get("coordinateSystem", {}).get("wkt", ""))
    wanted = COG_TARGET_SRS.split(":")[1]
    if str(code) != wanted and f'"EPSG","{wanted}"' not in str(code):
        errors.append(f"projection is not {COG_TARGET_SRS} -- the viewer will refuse it")
    return (len(errors) == 0), ("looks like a COG (gdalinfo layout check)" if not errors else "; ".join(errors))


def alpha_mean(info: dict) -> float | None:
    """Mean of the alpha band from gdalinfo JSON statistics, or None without one."""
    for band in info.get("bands", []):
        if band.get("colorInterpretation") == "Alpha":
            mean = band.get("mean", band.get("metadata", {}).get("", {}).get("STATISTICS_MEAN"))
            return None if mean is None else float(mean)
    return None


def valid_fraction(path: Path) -> float:
    """Share of pixels the alpha band marks as data (ODM writes alpha 0 or 255)."""
    try:
        from osgeo import gdal
        info = gdal.Info(str(path), options=gdal.InfoOptions(format="json", approxStats=True))
    except ImportError:
        if shutil.which("gdalinfo") is None:
            sys.exit("export-cog: neither osgeo nor gdalinfo available to measure valid pixels")
        result = subprocess.run(["gdalinfo", "-json", "-approx_stats", str(path)], capture_output=True, text=True)
        if result.returncode != 0:
            sys.exit(f"export-cog: gdalinfo failed: {result.stderr}")
        info = json.loads(result.stdout)
    mean = alpha_mean(info)
    if mean is None:
        sys.exit("export-cog: output has no alpha band, so empty areas cannot be measured")
    return mean / 255


def validate(path: Path) -> tuple[bool, str]:
    ok, detail = validate_with_osgeo(path)
    if ok is not None:
        return ok, f"validate_cloud_optimized_geotiff (osgeo): {detail}"
    ok, detail = validate_with_gdalinfo(path)
    if ok is not None:
        return ok, f"gdalinfo layout fallback: {detail}"
    sys.exit("export-cog: neither osgeo nor gdalinfo available to validate the output")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="src", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()

    if not args.src.is_file():
        sys.exit(f"export-cog: input {args.src} does not exist")

    args.out.mkdir(parents=True, exist_ok=True)
    dst = args.out / "orthomosaic.tif"
    before = args.src.stat().st_size
    convert_to_cog(args.src, dst)
    after = dst.stat().st_size
    print(f"export-cog: {args.src.name} ({before} bytes) -> {dst.name} ({after} bytes)")

    ok, detail = validate(dst)
    fraction = valid_fraction(dst)
    (args.out / "validator_output.txt").write_text(f"ok={ok}\n{detail}\nvalid_pixel_fraction={fraction:.4f}\n")
    print(f"export-cog: {detail}; valid pixels {fraction:.1%}")
    if not ok:
        sys.exit(f"export-cog: output failed COG validation -- {detail}")
    if fraction < MIN_VALID_FRACTION:
        sys.exit(f"export-cog: only {fraction:.1%} of the Orthomosaic holds data, below the "
                 f"{MIN_VALID_FRACTION:.0%} floor -- the reconstruction is mostly empty (ADR 0018)")


if __name__ == "__main__":
    main()
