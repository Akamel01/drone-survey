#!/usr/bin/env python3
"""measure.py — measured look spec of the approved hero (#220).

stdlib + numpy + Pillow only.  CLI pinned by plan-revisions F6:

  measure.py --frames <dir> --framing tall|wide|both --out <csv> [--figures-dir <dir>]
  measure.py --frames <dir> --framing tall|wide --frame s4 --attribute 4a
  measure.py --self-check --frames <dir> [--csv <csv>]

CSV columns (header exactly):
  framing,frame_s,frame_index,attribute,metric,value,unit,region,master_sha256,note

All colour arithmetic is float RGB 0-255 from rgb24 PNG; luminance is Rec.709.
Every metric is emitted per frame s0..s7 plus a mean and frame_sd row.
"""
import argparse
import csv
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ----------------------------------------------------------------------------
# sample set (master time) — report §2
# ----------------------------------------------------------------------------
S_TIMES = [0.0, 4.05, 8.10, 12.15, 16.20, 20.25, 24.30, 28.35]
S_IDX = [0, 486, 972, 1458, 1944, 2430, 2916, 3402]
S_STR = ["0", "4.05", "8.10", "12.15", "16.20", "20.25", "24.30", "28.35"]

MASTER_SHA = {
    "tall": "8fb54b550875cdf0bc46c240bb5a6868b2f039781ed8de0cfdacdb4493abec81",
    "wide": "aba25781e62700cce31a490a6872ab00b57083459a0cceaaa1e48fd2b80cc844",
}

# regions as (x0, x1, y0, y1) fractions — report §3
REG = {
    "tall": {
        "SkyColumn":   (0.02, 0.35, 0.02, 0.45),
        "SkyFull":     (0.02, 0.20, 0.02, 0.72),
        "HorizonHaze": (0.02, 0.35, 0.62, 0.72),
        "MountainBand": (0.02, 0.40, 0.72, 0.95),
        "CloudMist":   (0.05, 0.45, 0.72, 0.95),
        "IslandBody":  (0.55, 1.00, 0.45, 0.90),
        "ConiferBand": (0.62, 0.95, 0.44, 0.62),
        "D1":          (0.70, 0.98, 0.55, 0.80),
        "D2":          (0.02, 0.35, 0.72, 0.85),
        "D3":          (0.02, 0.35, 0.62, 0.72),
        "BloomRing":   (0.50, 0.75, 0.30, 0.55),
        "Basalt":      (0.55, 1.00, 0.72, 0.90),
        "mask_col":    (0.02, 0.35, 0.00, 1.00),
        "mask_win":    (0.48, 1.00, 0.30, 0.90),
    },
    "wide": {
        "SkyColumn":   (0.02, 0.50, 0.02, 0.42),
        "SkyFull":     (0.02, 0.30, 0.02, 0.58),
        "HorizonHaze": (0.02, 0.30, 0.50, 0.60),
        "MountainBand": (0.02, 0.55, 0.42, 0.95),
        "CloudMist":   (0.20, 0.60, 0.55, 0.85),
        "IslandBody":  (0.58, 0.96, 0.28, 0.90),
        "ConiferBand": (0.62, 0.95, 0.28, 0.50),
        "D1":          (0.70, 0.95, 0.35, 0.75),
        "D2":          (0.02, 0.40, 0.45, 0.70),
        "D3":          (0.02, 0.30, 0.50, 0.60),
        "BloomRing":   (0.55, 0.80, 0.20, 0.45),
        "Basalt":      (0.58, 0.96, 0.55, 0.90),
        "mask_col":    (0.02, 0.50, 0.00, 1.00),
        "mask_win":    (0.55, 0.95, 0.12, 0.90),
    },
}

# architecture's measured union bbox gate — F4 / report §8.2
BBOX_REF = {"tall": (0.50, 1.00, 0.45, 0.88), "wide": (0.59, 0.93, 0.29, 0.86)}
BBOX_TOL = (0.03, 0.01)  # x, y

TOKENS = {
    "sky_top": (0x49, 0x6C, 0x81), "sky_mid": (0x7C, 0x99, 0xAD),
    "sky_low": (0xAA, 0xBB, 0xCA), "haze": (0x78, 0x8B, 0x92),
}

_M709 = np.array([[0.4124, 0.3576, 0.1805],
                  [0.2126, 0.7152, 0.0722],
                  [0.0193, 0.1192, 0.9505]], dtype=np.float64)
_WHITE = np.array([0.95047, 1.0, 1.08883])


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def hex_of(rgb):
    r, g, b = [int(round(max(0.0, min(255.0, v)))) for v in rgb[:3]]
    return "#%02X%02X%02X" % (r, g, b)


def regstr(r):
    return "x%.2f-%.2f:y%.2f-%.2f" % (r[0], r[1], r[2], r[3])


def crop(img, r):
    H, W = img.shape[:2]
    return img[int(round(r[2] * H)):int(round(r[3] * H)),
               int(round(r[0] * W)):int(round(r[1] * W))]


def srgb_to_lab(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = lin @ _M709.T / _WHITE
    f = np.where(xyz > (6.0 / 29) ** 3, np.cbrt(xyz),
                 xyz / (3 * (6.0 / 29) ** 2) + 4.0 / 29)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


def deltaE(a, b):
    return float(np.sqrt(((srgb_to_lab(a) - srgb_to_lab(b)) ** 2).sum()))


def gaussian_blur(a, sigma):
    """Separable Gaussian via FFT with reflect padding (region blurs)."""
    if sigma <= 0:
        return a
    a = np.asarray(a, dtype=np.float64)
    pad = int(np.ceil(3 * sigma))
    ap = np.pad(a, pad, mode="reflect")
    fy = np.fft.fftfreq(ap.shape[0])[:, None]
    fx = np.fft.rfftfreq(ap.shape[1])[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    out = np.fft.irfft2(np.fft.rfft2(ap) * g, s=ap.shape)
    return out[pad:-pad, pad:-pad]


def lapvar(L):
    lp = (-4 * L[1:-1, 1:-1] + L[:-2, 1:-1] + L[2:, 1:-1]
          + L[1:-1, :-2] + L[1:-1, 2:])
    return float(lp.var())


def sobel_mag(L):
    Lp = np.pad(L, 1, mode="edge")
    gx = ((Lp[:-2, 2:] + 2 * Lp[1:-1, 2:] + Lp[2:, 2:])
          - (Lp[:-2, :-2] + 2 * Lp[1:-1, :-2] + Lp[2:, :-2]))
    gy = ((Lp[2:, :-2] + 2 * Lp[2:, 1:-1] + Lp[2:, 2:])
          - (Lp[:-2, :-2] + 2 * Lp[:-2, 1:-1] + Lp[:-2, 2:]))
    return np.hypot(gx, gy)


def close3(m, it=2):
    d = m.copy()
    for _ in range(it):
        d = d | np.roll(d, 1, 0) | np.roll(d, -1, 0) | np.roll(d, 1, 1) | np.roll(d, -1, 1)
    e = d.copy()
    for _ in range(it):
        e = e & np.roll(e, 1, 0) & np.roll(e, -1, 0) & np.roll(e, 1, 1) & np.roll(e, -1, 1)
    return e


def kmeans3(pixels, seed=0, iters=12):
    n = pixels.shape[0]
    if n < 3:
        return []
    rng = np.random.default_rng(seed)
    cent = pixels[rng.choice(n, 3, replace=False)].astype(np.float64)
    lab = np.zeros(n, dtype=np.int64)
    for _ in range(iters):
        d = ((pixels[:, None, :] - cent[None, :, :]) ** 2).sum(2)
        lab = d.argmin(1)
        for j in range(3):
            sel = lab == j
            if sel.any():
                cent[j] = pixels[sel].mean(0)
    shares = [(lab == j).mean() for j in range(3)]
    order = np.argsort(shares)[::-1]
    return [(cent[j], float(shares[j])) for j in order]


def hsv_mean(pixels):
    mx = pixels.max(1); mn = pixels.min(1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    return float(s.mean()), float(mx.mean())


# ----------------------------------------------------------------------------
# per-frame measurement — algorithms 4a..4i
# ----------------------------------------------------------------------------
def put(res, attr, metric, value, unit, region, note=""):
    res[metric] = {"value": value, "unit": unit, "region": regstr(region),
                   "note": note, "attr": attr}


def m_4a(img, framing, res):
    H, W = img.shape[:2]
    r = REG[framing]["SkyFull"]
    strip = crop(img, r).astype(np.float64)
    rowmean = strip.mean(axis=1)
    k = np.ones(5) / 5.0
    smooth = np.stack([np.convolve(rowmean[:, c], k, mode="same") for c in range(3)], axis=1)
    ystart = int(round(r[2] * H))

    def at(yfrac):
        return smooth[min(max(int(round(yfrac * H)) - ystart, 0), smooth.shape[0] - 1)]

    for af in (0.02, 0.10, 0.25, 0.40, 0.55, 0.68):
        v = at(af)
        put(res, "4a", "sky_hex_anchor_%.2f" % af, hex_of(v), "hex", r)
        best = min(TOKENS.items(), key=lambda kv: deltaE(v, kv[1]))
        put(res, "4a", "sky_anchor_%.2f_best_token" % af, best[0], "token", r)
        put(res, "4a", "sky_anchor_%.2f_deltaE_min" % af, deltaE(v, best[1]), "dE76", r,
            "nearest of the four settled sky/haze tokens")
    anchors = {"top": 0.05, "mid": 0.35, "horizon": 0.65}
    for name, af in anchors.items():
        v = at(af)
        put(res, "4a", "sky_hex_%s" % name, hex_of(v), "hex", r)
        for tok, tval in TOKENS.items():
            put(res, "4a", "sky_deltaE_%s_vs_%s" % (name, tok), deltaE(v, tval), "dE76", r)
    hz = crop(img, REG[framing]["HorizonHaze"]).astype(np.float64).reshape(-1, 3).mean(0)
    put(res, "4a", "haze_hex", hex_of(hz), "hex", REG[framing]["HorizonHaze"])
    put(res, "4a", "haze_deltaE_vs_haze_token", deltaE(hz, TOKENS["haze"]), "dE76",
        REG[framing]["HorizonHaze"])

    yend = int(round(0.68 * H))
    idx = np.arange(ystart, yend)
    pct = idx / H * 100.0
    n = min(len(pct), smooth.shape[0])
    for ci, cn in enumerate("RGB"):
        slope, inter = np.polyfit(pct[:n], smooth[:n, ci], 1)
        pred = slope * pct[:n] + inter
        ss_res = ((smooth[:n, ci] - pred) ** 2).sum()
        ss_tot = ((smooth[:n, ci] - smooth[:n, ci].mean()) ** 2).sum()
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
        put(res, "4a", "sky_slope_%s" % cn, float(slope), "levels/%H", r)
        put(res, "4a", "sky_r2_%s" % cn, float(r2), "1", r)


def band_stats(img, r):
    a = crop(img, r).astype(np.float64)
    L = lum(a)
    rms = float(np.sqrt(np.mean((L - gaussian_blur(L, 4.0)) ** 2)))
    s, v = hsv_mean(a.reshape(-1, 3))
    return rms, s, v


def m_4b(img, framing, res):
    vals = {}
    for b in ("D1", "D2", "D3"):
        rms, s, v = band_stats(img, REG[framing][b])
        vals[b] = (rms, s, v)
        put(res, "4b", "contrast_rms_%s" % b, rms, "levels", REG[framing][b])
        put(res, "4b", "sat_S_%s" % b, s, "S", REG[framing][b])
        put(res, "4b", "value_V_%s" % b, v, "levels", REG[framing][b])
    put(res, "4b", "falloff_rms_D2_D1", vals["D2"][0] / max(vals["D1"][0], 1e-9), "ratio", REG[framing]["D2"])
    put(res, "4b", "falloff_rms_D3_D1", vals["D3"][0] / max(vals["D1"][0], 1e-9), "ratio", REG[framing]["D3"])
    put(res, "4b", "falloff_sat_D2_D1", vals["D2"][1] / max(vals["D1"][1], 1e-9), "ratio", REG[framing]["D2"])
    put(res, "4b", "falloff_sat_D3_D1", vals["D3"][1] / max(vals["D1"][1], 1e-9), "ratio", REG[framing]["D3"])


def m_4c(img, framing, res):
    H, W = img.shape[:2]
    r = REG[framing]["BloomRing"]
    a = crop(img, r).astype(np.float64)
    L = lum(a)
    peak = float(L.max())
    py, px = np.unravel_index(int(np.argmax(L)), L.shape)
    bg = float(np.median(L))
    delta = peak - bg
    dirs = [(0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    h, w = L.shape
    r50s, r90s, r10s = [], [], []
    for dy, dx in dirs:
        norm = (dy * dy + dx * dx) ** 0.5
        dists, vals = [], []
        step = 0
        while True:
            y, x = py + dy * step, px + dx * step
            if y < 0 or y >= h or x < 0 or x >= w:
                break
            dists.append(step * norm)
            vals.append(L[y, x])
            step += 1
        if len(vals) < 3 or delta <= 0:
            continue
        vals = np.array(vals); dists = np.array(dists)

        def cross(frac):
            thr = bg + frac * delta
            for i in range(1, len(vals)):
                if vals[i] <= thr:
                    v0, v1 = vals[i - 1], vals[i]
                    if v0 == v1:
                        return float(dists[i])
                    return float(dists[i - 1] + (v0 - thr) / (v0 - v1) * (dists[i] - dists[i - 1]))
            return None
        for store, frac in ((r50s, 0.5), (r90s, 0.9), (r10s, 0.1)):
            c = cross(frac)
            if c is not None:
                store.append(c)
    r50 = float(np.median(r50s)) if r50s else float("nan")
    width = (float(np.median(r10s)) - float(np.median(r90s))) if (r90s and r10s) else float("nan")
    put(res, "4c", "bloom_peak_L", peak, "levels", r)
    put(res, "4c", "bloom_bg_L", bg, "levels", r)
    put(res, "4c", "bloom_peak_bg_ratio", peak / max(bg, 1e-9), "ratio", r)
    put(res, "4c", "bloom_r50_px", r50, "px", r,
        "edge-limited: peak sits on the island silhouette, not sky; TOOL (ESRGAN/HEVC) — not a resolvable sky-side halo")
    put(res, "4c", "bloom_r50_pctH", r50 / H * 100.0, "%H", r)
    put(res, "4c", "bloom_falloff_10_90_px", width, "px", r)


def m_4d(img, framing, res):
    r = REG[framing]["Basalt"]
    L = lum(crop(img, r).astype(np.float64)).ravel()
    p = np.percentile(L, [0.1, 1, 5, 50])
    put(res, "4d", "shadow_p0_1", float(p[0]), "levels", r)
    put(res, "4d", "shadow_p1", float(p[1]), "levels", r, "black floor = p1; HEVC crush is the limit")
    put(res, "4d", "shadow_p5", float(p[2]), "levels", r)
    put(res, "4d", "shadow_p50", float(p[3]), "levels", r)
    put(res, "4d", "shadow_min", float(L.min()), "levels", r)
    put(res, "4d", "shadow_floor_lifted", 1.0 if p[1] >= 8.0 else 0.0, "bool", r,
        "1 = p1 >= 8 levels, i.e. clearly above the codec floor")


def m_4e(img, framing, res):
    H, W = img.shape[:2]
    L = {b: lum(crop(img, REG[framing][b]).astype(np.float64)) for b in ("D1", "D2", "D3")}
    v = {b: lapvar(L[b]) for b in L}
    for b in ("D1", "D2", "D3"):
        put(res, "4e", "dof_lapvar_%s" % b, v[b], "levels2", REG[framing][b])
    put(res, "4e", "dof_ratio_D1_D2", v["D1"] / max(v["D2"], 1e-9), "ratio", REG[framing]["D2"])

    def find_sigma(src, target):
        if lapvar(src) <= target:
            return 0.0
        lo, hi = 0.0, 40.0
        for _ in range(16):
            mid = (lo + hi) / 2.0
            if lapvar(gaussian_blur(src, mid)) > target:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2.0
    for b in ("D2", "D3"):
        s = find_sigma(L["D1"], v[b])
        put(res, "4e", "dof_sigma_%s_px" % b, s, "px", REG[framing][b], "D1 blurred to match band; sharp end is TOOL")
        put(res, "4e", "dof_sigma_%s_pctH" % b, s / H * 100.0, "%H", REG[framing][b])


def acf_half_zero(ac):
    hl = zc = None
    for i in range(1, len(ac)):
        if ac[i] <= 0 and zc is None:
            zc = i
        if ac[i] <= 0.5 and hl is None:
            hl = i
        if hl is not None and zc is not None:
            break
    return hl if hl is not None else -1, zc if zc is not None else -1


def m_4f(img, framing, res):
    r = REG[framing]["SkyColumn"]
    a = crop(img, r).astype(np.float64)
    for ci, cn in enumerate("RGB"):
        hp = a[..., ci] - gaussian_blur(a[..., ci], 3.0)
        put(res, "4f", "grain_sigma_%s" % cn, float(hp.std()), "levels", r, "TOOL (ESRGAN/RIFE); native 4K")
    hpl = lum(a) - gaussian_blur(lum(a), 3.0)
    x = hpl - hpl.mean()
    acx = np.fft.irfft(np.abs(np.fft.rfft(x, axis=1)) ** 2, axis=1)
    acx = (acx / np.maximum(acx[:, :1], 1e-12)).mean(0)
    acy = np.fft.irfft(np.abs(np.fft.rfft(x, axis=0)) ** 2, axis=0)
    acy = (acy / np.maximum(acy[:1, :], 1e-12)).mean(1)
    hl_x, zc_x = acf_half_zero(acx)
    hl_y, zc_y = acf_half_zero(acy)
    put(res, "4f", "grain_acf_halfmax_x", float(hl_x), "px", r)
    put(res, "4f", "grain_acf_zerocross_x", float(zc_x), "px", r)
    put(res, "4f", "grain_acf_halfmax_y", float(hl_y), "px", r)
    put(res, "4f", "grain_acf_zerocross_y", float(zc_y), "px", r)


def island_mask(img, framing):
    H, W = img.shape[:2]
    mc = REG[framing]["mask_col"]
    c0, c1 = int(round(mc[0] * W)), int(round(mc[1] * W))
    bg = np.median(img[:, c0:c1, :].astype(np.float64), axis=1)  # (H,3) per-row left estimate
    win = REG[framing]["mask_win"]
    x_lo, x_hi = int(round(win[0] * W)), int(round(win[1] * W))
    y_lo, y_hi = int(round(win[2] * H)), int(round(win[3] * H))
    sub = img[y_lo:y_hi, x_lo:x_hi, :].astype(np.float64)
    bgsub = bg[y_lo:y_hi]
    de = np.sqrt(((srgb_to_lab(sub) - srgb_to_lab(bgsub)[:, None, :]) ** 2).sum(-1))
    bgL = lum(bgsub)[:, None]
    L = lum(sub)
    green = (sub[..., 1] > sub[..., 0] + 4) & (sub[..., 1] > sub[..., 2] + 4)
    dark = L < (bgL - 10)
    soil = (sub[..., 0] > sub[..., 1]) & (sub[..., 1] > sub[..., 2])
    m = (de > 12.0) & (green | dark | soil)
    full = np.zeros((H, W), dtype=bool)
    full[y_lo:y_hi, x_lo:x_hi] = m
    return close3(full)


STRATA = ["turf", "moss", "soil", "pebble", "basalt"]


def strata_labels(img, framing, mask):
    """Split island pixels into the five strata; return (pixels, name->bool)."""
    H, W = img.shape[:2]
    r = REG[framing]["IslandBody"]
    x0, x1 = int(round(r[0] * W)), int(round(r[1] * W))
    y0, y1 = int(round(r[2] * H)), int(round(r[3] * H))
    sub = img[y0:y1, x0:x1].astype(np.float64)
    m = mask[y0:y1, x0:x1]
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return np.zeros((0, 3)), {}
    yy = ys + y0
    pix = sub[m]
    R, G, B = pix[:, 0], pix[:, 1], pix[:, 2]
    green = (G > R + 4) & (G > B + 4)
    chroma = pix.max(1) - pix.min(1)
    top, bot = int(yy.min()), int(yy.max())
    nrows = bot - top + 1
    rowidx = yy - top
    cnt = np.bincount(rowidx, minlength=nrows)
    gf = np.bincount(rowidx[green], minlength=nrows) / np.maximum(cnt, 1)
    Cprof = np.bincount(rowidx, weights=chroma, minlength=nrows) / np.maximum(cnt, 1)

    g_rows = np.where((cnt > 0) & (gf > 0.5))[0]
    if len(g_rows) == 0:
        g_rows = np.where((cnt > 0) & (gf > 0.35))[0]
    if len(g_rows) == 0:
        g_rows = np.where(cnt > 0)[0][:max(1, nrows // 3)]
    gy = yy[green]
    split = float(np.median(gy)) if len(gy) >= 2 else float(top)
    turf = green & (yy <= split)
    moss = green & (yy > split)

    last_green_row = int(g_rows.max())
    lower_rows = np.where((np.arange(nrows) > last_green_row) & (cnt > 0))[0]
    if len(lower_rows):
        pr = int(lower_rows[np.argmax(Cprof[lower_rows])])
        half = max(2, int(0.03 * nrows))
        pebble_rows = np.arange(max(0, pr - half), min(nrows, pr + half + 1))
    else:
        pebble_rows = np.array([], dtype=int)
    lower_mask = (~green) & (rowidx > last_green_row)
    pebble = lower_mask & np.isin(rowidx, pebble_rows)
    base = lower_mask & (~pebble)
    Lpix = lum(pix)
    thr = float(np.percentile(Lpix[base], 40)) if base.any() else 0.0
    basalt = base & (Lpix <= thr)
    soil = base & (~basalt)
    return pix, {"turf": turf, "moss": moss, "soil": soil,
                 "pebble": pebble, "basalt": basalt}


def m_4g(img, framing, res, mask):
    r = REG[framing]["IslandBody"]
    pix, strata = strata_labels(img, framing, mask)
    total = float(mask[int(round(r[2] * img.shape[0])):int(round(r[3] * img.shape[0])),
                       int(round(r[0] * img.shape[1])):int(round(r[1] * img.shape[1]))].sum())
    nan = float("nan")
    for name in STRATA:
        sel = strata.get(name, np.zeros(0, bool))
        sp = pix[sel] if len(sel) else np.zeros((0, 3))
        small = sp.shape[0] < 3
        put(res, "4g", "palette_%s_median_hex" % name,
            "" if small else hex_of(np.median(sp, axis=0)), "hex", r,
            "stratum too small in this frame" if small else "island-local split; +-2 %H boundary")
        if small:
            s = v = nan
            km = [(np.array([nan, nan, nan]), nan)] * 3
        else:
            s, v = hsv_mean(sp)
            km = kmeans3(sp.astype(np.float64))
            while len(km) < 3:
                km.append((np.array([nan, nan, nan]), nan))
        put(res, "4g", "palette_%s_meanS" % name, s, "S", r)
        put(res, "4g", "palette_%s_meanV" % name, v, "levels", r)
        put(res, "4g", "palette_%s_share" % name, len(sp) / max(total, 1.0), "fraction", r)
        for j, (cent, share) in enumerate(km[:3]):
            put(res, "4g", "palette_%s_k%d_hex" % (name, j + 1),
                "" if any(np.isnan(cent)) else hex_of(cent), "hex", r,
                "k-means k=3 seed 0; informational")
            put(res, "4g", "palette_%s_k%d_share" % (name, j + 1), share, "fraction", r)
    # informational only — reference-reel values, not hero targets (F3)
    tsel = strata.get("turf")
    if tsel is not None and int(tsel.sum()) >= 3:
        put(res, "4g", "palette_turf_vs_517046_deltaE",
            deltaE(np.median(pix[tsel], axis=0), (0x51, 0x70, 0x46)), "dE76", r,
            "informational: #517046 is a reference-reel value, not a hero target")
    bsel = strata.get("basalt")
    if bsel is not None and int(bsel.sum()) >= 3:
        put(res, "4g", "palette_basalt_vs_474B59_deltaE",
            deltaE(np.median(pix[bsel], axis=0), (0x47, 0x4B, 0x59)), "dE76", r,
            "informational: #474B59 is a reference-reel value, not a hero target")


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def m_4h(img, framing, res):
    r = REG[framing]["ConiferBand"]
    a = crop(img, r).astype(np.float64)
    L = lum(a)
    green = (a[..., 1] > a[..., 0] + 4) & (a[..., 1] > a[..., 2] + 4)
    thr = np.percentile(L, 40)
    sil = green & (L < thr)
    # NB: a per-tree count is NOT reliably separable here — the trees merge with
    # the dark island body below them into wide blobs, so any h/w filter counts
    # detached slivers, not conifers. Report silhouette density only (ticket ask).
    put(res, "4h", "conifer_dark_area_pct", float(sil.mean() * 100.0), "%", r)
    put(res, "4h", "conifer_edge_density", float((sobel_mag(L) > 12).mean()), "fraction", r,
        "Sobel mag > 12 levels")


def phase_shift(a, b):
    A = np.fft.fft2(a)
    B = np.fft.fft2(b)
    R = A * np.conj(B)
    R /= (np.abs(R) + 1e-12)
    r = np.fft.fftshift(np.fft.ifft2(R).real)
    h, w = r.shape
    py, px = np.unravel_index(int(np.argmax(r)), r.shape)

    def par(vm, v0, vp):
        den = vm - 2 * v0 + vp
        return 0.0 if abs(den) < 1e-12 else 0.5 * (vm - vp) / den
    dy = (py - h / 2.0) + par(r[py - 1, px], r[py, px], r[py + 1, px])
    dx = (px - w / 2.0) + par(r[py, px - 1], r[py, px], r[py, px + 1])
    return float(dx), float(dy)


def hp_patch(img, r, sigma=6.0):
    a = crop(img, r).astype(np.float64)
    L = lum(a)
    return L - gaussian_blur(L, sigma)


def m_4i(img0, img7, imgs, framing, res):
    H, W = img0.shape[:2]
    rc = REG[framing]["CloudMist"]
    rm = REG[framing]["MountainBand"]
    cloud = [hp_patch(im, rc) for im in imgs]
    ctrl = [hp_patch(im, rm) for im in imgs]
    # structure (frame s0)
    L = lum(crop(img0, rc).astype(np.float64))
    rowstd = L.std(axis=1)
    by = int(np.argmax(rowstd)) + int(round(rc[2] * H))
    put(res, "4i", "cloud_band_y_pctH", by / H * 100.0, "%H", rc)
    x = L - L.mean()
    ac = np.fft.fftshift(np.fft.ifft2(np.abs(np.fft.fft2(x)) ** 2).real)
    cy, cx = ac.shape[0] // 2, ac.shape[1] // 2
    row = ac[cy, cx:]
    col = ac[cy:, cx]
    def first_zero(v):
        v = v / max(v[0], 1e-12)
        for i in range(1, len(v)):
            if v[i] <= 0:
                return i
        return len(v)
    put(res, "4i", "cloud_texture_zero_x_px", float(first_zero(row)), "px", rc,
        "first zero of 2-D autocorrelation along x")
    put(res, "4i", "cloud_texture_zero_y_px", float(first_zero(col)), "px", rc,
        "first zero of 2-D autocorrelation along y")

    def drift(pairs, patches, tag):
        out = []
        for (i, j) in pairs:
            dx, dy = phase_shift(patches[i], patches[j])
            out.append((i, j, dx, dy))
        return out
    adj = [(k, k + 1) for k in range(7)]
    primary = [(0, 7)]
    cd = drift(primary, cloud, "cloud")
    cda = drift(adj, cloud, "cloud")
    md = drift(primary, ctrl, "ctrl")
    mda = drift(adj, ctrl, "ctrl")
    d_floor = max(abs(md[0][2]), abs(md[0][3]))           # control, same s0->s7 baseline
    d_floor_adj = max([abs(x) for (_, _, dx, dy) in mda for x in (dx, dy)] + [0.0])
    dx, dy = cd[0][2], cd[0][3]
    dt = S_TIMES[7] - S_TIMES[0]
    speed = dx / dt
    pctW = speed * 32.4 / W * 100.0
    floor_speed = d_floor / dt
    floor_pctW = floor_speed * 32.4 / W * 100.0
    put(res, "4i", "drift_dx_px", dx, "px", rc, "pair s0->s7 dt=28.35s")
    put(res, "4i", "drift_dy_px", dy, "px", rc, "pair s0->s7 dt=28.35s")
    put(res, "4i", "drift_speed_px_s", speed, "px/s", rc)
    put(res, "4i", "drift_pctW_turn", pctW, "%W/turn", rc)
    put(res, "4i", "drift_floor_px", d_floor, "px", rm,
        "max |d| of static MountainBand control, pair s0->s7")
    put(res, "4i", "drift_floor_adjmax_px", d_floor_adj, "px", rm,
        "max |d| of static MountainBand control over adjacent pairs")
    put(res, "4i", "drift_floor_px_s", floor_speed, "px/s", rm)
    put(res, "4i", "drift_floor_pctW_turn", floor_pctW, "%W/turn", rm)
    put(res, "4i", "drift_not_measurable", 1.0 if max(abs(dx), abs(dy)) <= d_floor else 0.0,
        "bool", rc, "1 = cloud max(|dx|,|dy|) <= d_floor")
    for (i, j, ddx, ddy) in cda:
        put(res, "4i", "drift_adj_dx_s%d" % i, ddx, "px", rc, "pair s%d->s%d dt=4.05s" % (i, j))
        put(res, "4i", "drift_adj_dy_s%d" % i, ddy, "px", rc, "pair s%d->s%d dt=4.05s" % (i, j))


def measure_frame(img, framing):
    res = {}
    m_4a(img, framing, res)
    m_4b(img, framing, res)
    m_4c(img, framing, res)
    m_4d(img, framing, res)
    m_4e(img, framing, res)
    m_4f(img, framing, res)
    mask = island_mask(img, framing)
    m_4g(img, framing, res, mask)
    m_4h(img, framing, res)
    return res, mask


def load_frame(frames_dir, framing, k):
    p = os.path.join(frames_dir, "%s-s%d-f%d.png" % (framing, k, S_IDX[k]))
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.uint8)


# ----------------------------------------------------------------------------
# CSV assembly
# ----------------------------------------------------------------------------
HEADER = ["framing", "frame_s", "frame_index", "attribute", "metric", "value",
          "unit", "region", "master_sha256", "note"]


def numeric(v):
    return isinstance(v, (int, float, np.floating, np.integer)) and not isinstance(v, bool)


def build_rows(framing, per_frame):
    sha = MASTER_SHA[framing]
    rows = []
    for k, res in enumerate(per_frame):
        for metric, d in res.items():
            rows.append([framing, S_STR[k], str(S_IDX[k]), d["attr"], metric,
                         fmt(d["value"]), d["unit"], d["region"], sha, d["note"]])
    metrics = []
    for res in per_frame:
        for m in res:
            if m not in metrics:
                metrics.append(m)
    for metric in metrics:
        if any(metric not in res for res in per_frame):
            continue
        vals = [per_frame[k][metric]["value"] for k in range(8)]
        if not all(numeric(v) and not np.isnan(float(v)) for v in vals):
            continue
        arr = np.array([float(v) for v in vals])
        d = per_frame[0][metric]
        rows.append([framing, "mean", "", d["attr"], metric, fmt(float(arr.mean())),
                     d["unit"], d["region"], sha, "mean of s0..s7"])
        rows.append([framing, "frame_sd", "", d["attr"], metric, fmt(float(arr.std())),
                     d["unit"], d["region"], sha, "frame_sd of s0..s7"])
    return rows


def fmt(v):
    if isinstance(v, str):
        return v
    if v is None:
        return ""
    return repr(float(v)) if not float(v).is_integer() else str(int(v))


# ----------------------------------------------------------------------------
# figures
# ----------------------------------------------------------------------------
def save_capped(im, out, cap_kb, colors=128):
    im.save(out, optimize=True)
    if os.path.getsize(out) > cap_kb * 1024:
        im.convert("P", palette=Image.ADAPTIVE, colors=colors).save(out, optimize=True)
    return os.path.getsize(out)


def fig_contact(frames_dir, framing, out, cell):
    cw, ch = cell
    sheet = Image.new("RGB", (cw * 4, ch * 2), (18, 18, 18))
    dr = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for k in range(8):
        im = Image.open(os.path.join(frames_dir, "%s-s%d-f%d.png" % (framing, k, S_IDX[k]))).convert("RGB")
        im = im.resize((cw, ch), Image.LANCZOS)
        cx, cy = (k % 4) * cw, (k // 4) * ch
        sheet.paste(im, (cx, cy))
        dr.text((cx + 4, cy + 4), "t=%ss f=%d %dx%d" % (S_STR[k], S_IDX[k], k * 45, k * 45),
                fill=(255, 235, 0), font=font)
    save_capped(sheet, out, 500, colors=128)


def fig_region(frames_dir, framing, out, width):
    im = Image.open(os.path.join(frames_dir, "%s-s0-f0.png" % framing)).convert("RGB")
    H = int(im.height * width / im.width)
    im = im.resize((width, H), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    font = ImageFont.load_default()
    cols = {"SkyColumn": (255, 0, 0), "SkyFull": (255, 160, 0), "HorizonHaze": (255, 255, 0),
            "MountainBand": (0, 255, 0), "CloudMist": (0, 255, 255), "IslandBody": (255, 0, 255),
            "ConiferBand": (0, 128, 255)}
    for name, col in cols.items():
        r = REG[framing][name]
        box = (r[0] * im.width, r[2] * im.height, r[1] * im.width, r[3] * im.height)
        dr.rectangle(box, outline=col, width=2)
        dr.text((box[0] + 3, box[1] + 3), name, fill=col, font=font)
    save_capped(im, out, 300, colors=96)


def fig_sky(frames_dir, agg, out):
    cv = Image.new("RGB", (900, 620), (255, 255, 255))
    dr = ImageDraw.Draw(cv)
    font = ImageFont.load_default()
    L, T, R, B = 70, 30, 620, 560
    dr.rectangle((L, T, R, B), outline=(0, 0, 0))
    for g in range(0, 256, 32):
        y = B - (g / 255.0) * (B - T)
        dr.line((L, y, R, y), fill=(230, 230, 230))
        dr.text((L - 34, y - 5), str(g), fill=(0, 0, 0), font=font)
    for i in range(0, 101, 10):
        x = L + (i / 100.0) * (R - L)
        dr.line((x, T, x, B), fill=(235, 235, 235))
        dr.text((x - 8, B + 6), str(i), fill=(0, 0, 0), font=font)
    dr.text(((L + R) / 2 - 40, B + 24), "%H (SkyFull strip)", fill=(0, 0, 0), font=font)
    dr.text((6, 8), "sky gradient - channel means vs %H", fill=(0, 0, 0), font=font)
    series = {}
    for framing in ("tall", "wide"):
        img = load_frame(frames_dir, framing, 0)
        H, W = img.shape[:2]
        r = REG[framing]["SkyFull"]
        strip = crop(img, r).astype(np.float64)
        rowmean = strip.mean(axis=1)
        ystart = int(round(r[2] * H))
        pct = (np.arange(ystart, ystart + rowmean.shape[0])) / H * 100.0
        series[framing] = (pct, rowmean)
    for framing, style in (("tall", 0), ("wide", 1)):
        pct, rm = series[framing]
        for ci, col in enumerate([(220, 40, 40), (40, 180, 40), (40, 40, 220)]):
            pts = []
            for i in range(0, len(pct), 8):
                x = L + min(pct[i] / 100.0, 1.0) * (R - L)
                y = B - (rm[i, ci] / 255.0) * (B - T)
                pts.append((x, y))
            if len(pts) > 1:
                dr.line(pts, fill=col, width=3 if style == 0 else 2)
    ycols = [((0.05, "top"), (255, 100, 0)), ((0.35, "mid"), (255, 100, 0)), ((0.65, "horizon"), (255, 100, 0))]
    for (af, name), col in ycols:
        x = L + af * (R - L)
        dr.line((x, T, x, B), fill=col)
        th = agg.get("tall:sky_hex_%s" % name, "")
        wh = agg.get("wide:sky_hex_%s" % name, "")
        dr.text((x + 3, T + 3), "%s T%s W%s" % (name, th, wh), fill=col, font=font)
    labels = [("tall", (0, 0, 0)), ("wide", (0, 0, 0))]
    for i, (framing, col) in enumerate(labels):
        dr.text((R - 130, T + 10 + i * 16), "%s: R=red G=green B=blue" % framing, fill=col, font=font)
    cv.save(out, optimize=True)


def fig_palette(agg, out):
    strata = ["turf", "moss", "soil", "pebble", "basalt"]
    cw, ch, pad = 220, 90, 14
    cv = Image.new("RGB", (cw * 5 + pad * 6, ch * 2 + pad * 3 + 30), (245, 245, 245))
    dr = ImageDraw.Draw(cv)
    font = ImageFont.load_default()
    dr.text((pad, 6), "island palette per stratum - measured median (tall / wide)", fill=(0, 0, 0), font=font)
    for ri, framing in enumerate(("tall", "wide")):
        for ci, s in enumerate(strata):
            h = agg.get("%s:palette_%s_median_hex" % (framing, s), "#000000")
            try:
                rgb = hex_to_rgb(h)
            except Exception:
                rgb = (0, 0, 0)
            x = pad + ci * (cw + pad)
            y = 30 + pad + ri * (ch + pad)
            dr.rectangle((x, y, x + cw, y + ch), fill=rgb, outline=(0, 0, 0))
            lab = "%s %s" % (s, h)
            tc = (255, 255, 255) if sum(rgb) < 300 else (0, 0, 0)
            dr.text((x + 6, y + 8), framing, fill=tc, font=font)
            dr.text((x + 6, y + 26), lab, fill=tc, font=font)
    cv.save(out, optimize=True)


def build_figures(frames_dir, fig_dir, agg):
    os.makedirs(fig_dir, exist_ok=True)
    for framing, cell in (("tall", (270, 480)), ("wide", (480, 270))):
        fig_contact(frames_dir, framing, os.path.join(fig_dir, "contact-sheet-%s.png" % framing), cell)
    for framing, width in (("tall", 540), ("wide", 960)):
        fig_region(frames_dir, framing, os.path.join(fig_dir, "region-map-%s.png" % framing), width)
    fig_sky(frames_dir, agg, os.path.join(fig_dir, "sky-gradient.png"))
    fig_palette(agg, os.path.join(fig_dir, "palette-swatches.png"))


# ----------------------------------------------------------------------------
# self-check
# ----------------------------------------------------------------------------
def self_check(frames_dir, csv_path):
    """Recompute tall SkyColumn s0 grain residual sigma (4f) and assert it equals
    the committed measurements.csv row.  Stated tolerance: 1e-6 levels."""
    img = load_frame(frames_dir, "tall", 0)
    res = {}
    m_4f(img, "tall", res)
    got = float(res["grain_sigma_G"]["value"])
    ref = None
    if os.path.exists(csv_path):
        with open(csv_path) as fh:
            for row in csv.DictReader(fh):
                if (row["framing"] == "tall" and row["frame_s"] == "0"
                        and row["metric"] == "grain_sigma_G"):
                    ref = float(row["value"])
    tol = 1e-6
    print("self-check: tall SkyColumn s0 grain_sigma_G")
    print("  recomputed : %.9f levels" % got)
    if ref is None:
        print("  FAIL: no reference row in %s" % csv_path)
        return 1
    print("  csv row    : %.9f levels" % ref)
    ok = abs(got - ref) <= tol
    print("  tolerance  : %g  -> %s" % (tol, "PASS" if ok else "FAIL"))

    # figure regression (F3): the palette figure must plot each framing's own
    # medians, i.e. per-framing agg keys must not collide onto one row.
    import tempfile
    fake = {"tall:palette_turf_median_hex": "#283017",
            "wide:palette_turf_median_hex": "#1F2912"}
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False).name
    fig_palette(fake, tmp)
    pim = Image.open(tmp).convert("RGB")
    os.unlink(tmp)
    tall_px = "#%02X%02X%02X" % pim.getpixel((124, 89))
    wide_px = "#%02X%02X%02X" % pim.getpixel((124, 193))
    fig_ok = tall_px == "#283017" and wide_px == "#1F2912" and tall_px != wide_px
    print("self-check: palette figure rows are per-framing (F3)")
    print("  tall cell  : %s (expect #283017)" % tall_px)
    print("  wide cell  : %s (expect #1F2912)" % wide_px)
    print("  -> %s" % ("PASS" if fig_ok else "FAIL"))
    return 0 if (ok and fig_ok) else 1


# ----------------------------------------------------------------------------
def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames")
    ap.add_argument("--framing", default="both")
    ap.add_argument("--out")
    ap.add_argument("--figures-dir")
    ap.add_argument("--frame")
    ap.add_argument("--attribute")
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--csv")
    args = ap.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    default_csv = os.path.join(here, "measurements.csv")

    if args.self_check:
        fd = args.frames or "/var/folders/c8/816q70zd5dvd48_49_npqj8w0000gn/T/opencode/hero-look-spec/frames"
        return self_check(fd, args.csv or default_csv)

    if args.frame and args.attribute:
        fd = args.frames
        k = int(args.frame[1:])
        framing = args.framing if args.framing in ("tall", "wide") else "tall"
        alias = {"sky": "4a", "contrast": "4b", "bloom": "4c", "shadow": "4d",
                 "dof": "4e", "grain": "4f", "palette": "4g", "conifer": "4h", "cloud": "4i"}
        attr = alias.get(args.attribute, args.attribute)
        if attr == "4i":
            imgs = [load_frame(fd, framing, kk) for kk in range(8)]
            res = {}
            m_4i(imgs[k], imgs[7], imgs, framing, res)
        else:
            img = load_frame(fd, framing, k)
            res, _ = measure_frame(img, framing)
        out = {m: d for m, d in res.items() if d["attr"] == attr}
        print(json.dumps(out, indent=2))
        return 0

    framings = ["tall", "wide"] if args.framing == "both" else [args.framing]
    all_rows = []
    agg = {}
    for framing in framings:
        print("measuring %s ..." % framing, file=sys.stderr)
        imgs = [load_frame(args.frames, framing, k) for k in range(8)]
        per_frame = []
        masks = []
        for k in range(8):
            res, mask = measure_frame(imgs[k], framing)
            per_frame.append(res)
            masks.append(mask)
            print("  s%d done" % k, file=sys.stderr)
        all_rows += build_rows(framing, per_frame)
        # 4i is pair-based, not per-frame: evaluate once and attribute to s0
        res4i = {}
        m_4i(imgs[0], imgs[7], imgs, framing, res4i)
        for metric, d in res4i.items():
            all_rows.append([framing, "0", "0", d["attr"], metric, fmt(d["value"]),
                             d["unit"], d["region"], MASTER_SHA[framing], d["note"]])

        # S2 region-model gate: island union bbox vs architecture reference (F4)
        H, W = imgs[0].shape[:2]
        union = np.zeros((H, W), dtype=bool)
        for m in masks:
            union |= m
        ys, xs = np.nonzero(union)
        bbox = (xs.min() / W, xs.max() / W, ys.min() / H, ys.max() / H)
        ref = BBOX_REF[framing]
        tol = (BBOX_TOL[0], BBOX_TOL[0], BBOX_TOL[1], BBOX_TOL[1])
        gate = all(abs(bbox[i] - ref[i]) <= tol[i] for i in range(4))
        print("  S2 bbox %s: x %.3f-%.3f y %.3f-%.3f  ref x %.2f-%.2f y %.2f-%.2f  %s"
              % (framing, bbox[0], bbox[1], bbox[2], bbox[3], ref[0], ref[1], ref[2], ref[3],
                 "PASS" if gate else "FAIL"), file=sys.stderr)
        for name, val, rf in zip(("x0", "x1", "y0", "y1"), bbox, ref):
            all_rows.append([framing, "mean", "", "S2", "island_union_bbox_%s" % name,
                             fmt(val), "fraction", "x0.00-1.00:y0.00-1.00", MASTER_SHA[framing],
                             "island mask union over s0..s7; ref %.2f; gate %s" % (rf, "PASS" if gate else "FAIL")])
        if not gate:
            print("S2 gate FAILED for %s: bbox moved beyond tolerance" % framing, file=sys.stderr)
            return 2

        # union palette (pooled stratum pixels across s0..s7) — report §4g "union"
        pool = {name: [] for name in STRATA}
        for k in range(8):
            pix, strata = strata_labels(imgs[k], framing, masks[k])
            for name in STRATA:
                sel = strata.get(name)
                if sel is not None and sel.any():
                    pool[name].append(pix[sel])
        tot = sum(sum(a.shape[0] for a in pool[n]) for n in STRATA)
        reg = regstr(REG[framing]["IslandBody"])
        for name in STRATA:
            arr = np.concatenate(pool[name]) if pool[name] else np.zeros((0, 3))
            if arr.shape[0] < 3:
                all_rows.append([framing, "mean", "", "4g", "palette_%s_union_hex" % name,
                                 "", "hex", reg, MASTER_SHA[framing], "union of s0..s7; stratum too small"])
                continue
            hx = hex_of(np.median(arr, axis=0))
            s, v = hsv_mean(arr)
            agg["%s:palette_%s_median_hex" % (framing, name)] = hx
            all_rows.append([framing, "mean", "", "4g", "palette_%s_union_hex" % name, hx, "hex",
                             reg, MASTER_SHA[framing], "union of s0..s7 (pooled stratum pixels)"])
            all_rows.append([framing, "mean", "", "4g", "palette_%s_union_share" % name,
                             fmt(arr.shape[0] / max(tot, 1)), "fraction", reg, MASTER_SHA[framing],
                             "union of s0..s7"])
            all_rows.append([framing, "mean", "", "4g", "palette_%s_union_meanS" % name, fmt(s),
                             "S", reg, MASTER_SHA[framing], "union of s0..s7"])
            all_rows.append([framing, "mean", "", "4g", "palette_%s_union_meanV" % name, fmt(v),
                             "levels", reg, MASTER_SHA[framing], "union of s0..s7"])
            for j, (cent, share) in enumerate(kmeans3(arr.astype(np.float64))):
                all_rows.append([framing, "mean", "", "4g", "palette_%s_union_k%d_hex" % (name, j + 1),
                                 hex_of(cent), "hex", reg, MASTER_SHA[framing],
                                 "union k-means k=3 seed 0; informational"])
                all_rows.append([framing, "mean", "", "4g", "palette_%s_union_k%d_share" % (name, j + 1),
                                 fmt(share), "fraction", reg, MASTER_SHA[framing], "union of s0..s7"])
        metric_names = []
        for res in per_frame:
            for m in res:
                if m not in metric_names:
                    metric_names.append(m)
        for metric in metric_names:
            ok = True
            for k in range(8):
                d = per_frame[k].get(metric)
                if d is None or not numeric(d["value"]) or np.isnan(float(d["value"])):
                    ok = False
                    break
            if ok:
                agg["%s:%s" % (framing, metric)] = float(np.mean([per_frame[k][metric]["value"] for k in range(8)]))
        # per-framing sky anchor hexes for the sky-gradient figure (F6: no overwrite)
        for name in ("top", "mid", "horizon"):
            hm = per_frame[0].get("sky_hex_%s" % name)
            if hm is not None:
                agg["%s:sky_hex_%s" % (framing, name)] = hm["value"]

    if args.out:
        with open(args.out, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(HEADER)
            w.writerows(all_rows)
        print("wrote %s (%d rows)" % (args.out, len(all_rows)), file=sys.stderr)
    if args.figures_dir:
        build_figures(args.frames, args.figures_dir, agg)
        print("wrote figures to %s" % args.figures_dir, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
