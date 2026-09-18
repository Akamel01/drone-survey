#!/usr/bin/env python3
"""Quality numbers for one ODM project, compared on the same ground crop. Issue #40.

Runs inside opendronemap/odm (needs gdal, numpy, cv2):
  docker run --rm --entrypoint python3 -v <results>:/r -v <golden ref dir>:/ref \
    opendronemap/odm:latest /r/recon-tools/odm-quality.py /r/recon-NAME/project/code /ref/orthomosaic.tif
Prints JSON; merge it into metrics.json as "quality".
Sharpness = variance of Laplacian on the grey crop, only valid (alpha>0) crops count.
"""
import json, os, re, sys
import cv2
import numpy as np
from osgeo import gdal
gdal.UseExceptions()

CROP_M = 100.0  # side of the square ground crop, centred on the reference ortho


def ply_count(path, element):
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        for line in f:
            m = re.match(rb"element %s (\d+)" % element.encode(), line)
            if m:
                return int(m.group(1))
            if line.startswith(b"end_header"):
                return None


def raster(path):
    ds = gdal.Open(path)
    gt = ds.GetGeoTransform()
    return ds, gt


def crop_sharpness(path, bounds, res):
    ds = gdal.Warp("", path, format="MEM", outputBounds=bounds, xRes=res, yRes=res, resampleAlg="bilinear")
    a = ds.ReadAsArray().astype(np.float64)
    rgb, alpha = a[:3], a[-1]
    valid = float((alpha > 0).mean())
    grey = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
    return {"res_cm": round(res * 100, 2), "valid_frac": round(valid, 4),
            "var_laplacian": round(float(cv2.Laplacian(grey, cv2.CV_64F).var()), 1)}


def ortho_stats(path, bounds):
    ds, gt = raster(path)
    alpha = ds.GetRasterBand(ds.RasterCount)
    # valid-pixel fraction at 1/8 scale (overview-style read) to keep memory small
    w, h = ds.RasterXSize // 8, ds.RasterYSize // 8
    a = alpha.ReadAsArray(buf_xsize=w, buf_ysize=h)
    native = abs(gt[1])
    return {
        "size_px": [ds.RasterXSize, ds.RasterYSize],
        "gsd_cm_px": round(native * 100, 3),
        "valid_pixel_fraction": round(float((a > 0).mean()), 4),
        "crop_native": crop_sharpness(path, bounds, native),
        "crop_5cm": crop_sharpness(path, bounds, 0.05),
        "file_bytes": os.path.getsize(path),
    }


def main(proj, ref):
    rds, rgt = raster(ref)
    cx = rgt[0] + rgt[1] * rds.RasterXSize / 2
    cy = rgt[3] + rgt[5] * rds.RasterYSize / 2
    b = (cx - CROP_M / 2, cy - CROP_M / 2, cx + CROP_M / 2, cy + CROP_M / 2)
    q = {"crop_bounds": b, "reference": ortho_stats(ref, b)}
    p = lambda *x: os.path.join(proj, *x)
    q["dense_points_filtered"] = ply_count(p("odm_filterpoints", "point_cloud.ply"), "vertex")
    q["dense_points_openmvs"] = ply_count(p("opensfm", "undistorted", "openmvs", "scene_dense_dense_filtered.ply"), "vertex")
    q["mesh_faces"] = ply_count(p("odm_meshing", "odm_25dmesh.ply"), "face") or ply_count(p("odm_meshing", "odm_mesh.ply"), "face")
    for name in ("stats/stats.json",):
        s = p("opensfm", name)
        if os.path.exists(s):
            r = json.load(open(s))["reconstruction_statistics"]
            q["sfm"] = {k: r.get(k) for k in ("reconstructed_points_count", "reconstructed_shots_count",
                                             "initial_shots_count", "reprojection_error_pixels",
                                             "reprojection_error_normalized", "average_track_length")}
    o = p("odm_orthophoto", "odm_orthophoto.tif")
    if os.path.exists(o):
        q["ortho"] = ortho_stats(o, b)
        # sample file: the same 100 m crop, kept after the project is deleted
        gdal.Translate(os.path.join(proj, "..", "..", "ortho-crop-100m.jpg"), o, format="JPEG",
                       projWin=[b[0], b[3], b[2], b[1]], bandList=[1, 2, 3])
    d = p("odm_dem", "dsm.tif")
    if os.path.exists(d):
        dds, dgt = raster(d)
        q["dsm_gsd_cm_px"] = round(abs(dgt[1]) * 100, 3)
    print(json.dumps(q, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
