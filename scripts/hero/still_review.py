#!/usr/bin/env python3
"""still_review.py — Mac-side scorer + sheet composer for #223 (architecture §2g; Q6/Q7).

usage: still_review.py --renders <pass-dir> --measure <measure.py> --hero-frames <dir> \
                        --out <pass-dir> [--label PASS1]

Runs the pinned measure.py for 4a..4h single-frame, plus a still-adapted 4i (D2 copies);
reuses measure.py's own island_mask/BBOX_REF/BBOX_TOL for the S2 s0 gate; composes
sheet-<framing>.png; writes scores.json with the three Q6 sections + phase caveat.

Never re-implements metric math — every number comes from measure.py.
"""
import argparse
import csv
import datetime
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

MEASURE_SHA_PIN = "26f93fce4bb101c7ff07a1f446636d8bddf51cc36c0fed88b1766c661a495fe7"
HERO_SHA_PREFIX = {"tall": "0c9d67f2", "wide": "de1c1f08"}
MASTER_SIZE = {"tall": (2160, 3840), "wide": (3840, 2160)}
S_IDX = [0, 486, 972, 1458, 1944, 2430, 2916, 3402]  # D-223-05/D2; must match measure.py S_IDX
ATTRS = ["4a", "4b", "4c", "4d", "4e", "4f", "4g", "4h"]
MEASURED_ATTRS = ["4a", "4b", "4d", "4e", "4g", "4h"]
TOOL_ATTRS = ["4c", "4f"]
PANEL_W = 960
PHASE_CAVEAT = ("exact phase is unreachable (independent generations); "
                "frame-0 azimuth residual up to ±45°")


def die(msg):
    print("still_review: ABORT — %s" % msg, file=sys.stderr)
    sys.exit(2)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def fin(v):
    """Numeric value or None; flags non-finite into NONFINITE."""
    if not is_num(v):
        return None
    f = float(v)
    if not math.isfinite(f):
        NONFINITE.append(v)
        return None
    return f


NONFINITE = []


def run_measure(python, measure, frames, framing, attr, frame="s0"):
    cmd = [python, measure, "--frames", frames, "--framing", framing,
           "--frame", frame, "--attribute", attr]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        die("measure.py %s %s failed rc=%d: %s" % (framing, attr, p.returncode,
                                                   (p.stderr or p.stdout).strip()[-400:]))
    try:
        return json.loads(p.stdout)
    except json.JSONDecodeError as exc:
        die("measure.py %s %s emitted non-JSON (%s)" % (framing, attr, exc))


def still_png(renders, framing):
    for cand in (os.path.join(renders, "%s-s0-f0.png" % framing),
                 os.path.join(renders, framing, "%s-s0-f0.png" % framing)):
        if os.path.isfile(cand):
            return cand
    die("no %s-s0-f0.png under %s (checked flat and %s/ subdir)" % (framing, renders, framing))


def load_measure_module(measure_path):
    spec = importlib.util.spec_from_file_location("measure_pinned", measure_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def hero_mean_table(measure_path):
    """Hero s0..s7 means from the pinned measure.py's sibling measurements.csv, if present."""
    csv_path = os.path.join(os.path.dirname(os.path.abspath(measure_path)), "measurements.csv")
    if not os.path.isfile(csv_path):
        return {}, None
    means = {}
    with open(csv_path, newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("frame_s") != "mean":
                continue
            try:
                means[(row["framing"], row["metric"])] = float(row["value"])
            except (TypeError, ValueError):
                continue
    return means, csv_path


def hero_s0_from_csv(csv_path, framing, master_sha):
    """Hero s0 values from the look spec's measurements.csv (frame_s == "0"), shaped
    like measure.py's single-frame JSON: {attr: {metric: {"value": v}}}. Used when the
    hero masters are not readable (#223 passes 2-5: ~/hero3d/web4k is off limits); the
    CSV is the pinned measure.py's own output for the pinned frames."""
    out = {}
    with open(csv_path, newline="") as fh:
        for row in csv.DictReader(fh):
            if row["framing"] != framing or row["frame_s"] != "0":
                continue
            if row["master_sha256"] != master_sha:
                die("%s s0 row %s from master %s, pin %s" % (csv_path, row["metric"],
                                                              row["master_sha256"], master_sha))
            try:
                v = float(row["value"])
            except ValueError:
                v = row["value"]
            out.setdefault(row["attribute"], {})[row["metric"]] = {"value": v}
    if not out:
        die("no %s s0 rows in %s" % (framing, csv_path))
    return out


def s2_gate(module, still_path, framing):
    img = np.asarray(Image.open(still_path).convert("RGB"), dtype=np.uint8)
    mask = module.island_mask(img, framing)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        die("island_mask found no island pixels for %s in %s" % (framing, still_path))
    H, W = mask.shape
    bbox = (xs.min() / W, xs.max() / W, ys.min() / H, ys.max() / H)
    ref = module.BBOX_REF[framing]
    tol = (module.BBOX_TOL[0], module.BBOX_TOL[0], module.BBOX_TOL[1], module.BBOX_TOL[1])
    gate = all(abs(bbox[i] - ref[i]) <= tol[i] for i in range(4))
    return bbox, ref, tol, gate


def load_panel(path, width=PANEL_W):
    im = Image.open(path).convert("RGB")
    h = max(1, round(im.height * width / im.width))
    return im.resize((width, h), Image.LANCZOS), im.size


def ascii_safe(s):
    return s.replace("\u2014", "-").replace("\u00b1", "+/-").replace("\u00b0", " deg")


def compose_sheet(hero_path, still_path, out_path, framing, label, az, hero_sha,
                  still_sha, s2_line, hero_size=None):
    hero, hero_sz = load_panel(hero_path)
    hero_sz = hero_size or hero_sz   # a 960-px panel still names the master's size
    still, still_sz = load_panel(still_path)
    margin, gap, head, foot = 16, 16, 96, 84
    panel_h = max(hero.height, still.height)
    W = margin * 3 + PANEL_W * 2
    H = head + panel_h + foot + margin
    sheet = Image.new("RGB", (W, H), (18, 18, 18))
    dr = ImageDraw.Draw(sheet)
    f_big = ImageFont.load_default(size=22)
    f = ImageFont.load_default(size=16)
    f_small = ImageFont.load_default(size=14)
    yellow, grey = (255, 235, 0), (200, 200, 200)
    # panel titles
    dr.text((margin, 10), ascii_safe("HERO frame 0 - %s  (%dx%d)" % (framing, *hero_sz)),
            font=f_big, fill=yellow)
    dr.text((margin + PANEL_W + gap, 10),
            ascii_safe("STILL %s - %s  (%dx%d)" % (label, framing, *still_sz)),
            font=f_big, fill=yellow)
    top = head
    sheet.paste(hero, (margin, top))
    sheet.paste(still, (margin + PANEL_W + gap, top))
    dr.rectangle([margin - 1, top - 1, margin + PANEL_W, top + hero.height],
                 outline=(90, 90, 90))
    dr.rectangle([margin + PANEL_W + gap - 1, top - 1,
                  margin + PANEL_W + gap + PANEL_W, top + still.height], outline=(90, 90, 90))
    dr.text((margin, head - 34), ascii_safe("hero-frames/%s-s0-f0.png" % framing),
            font=f_small, fill=grey)
    dr.text((margin + PANEL_W + gap, head - 34), ascii_safe(os.path.basename(still_path)),
            font=f_small, fill=grey)
    # footer meta
    y = head + panel_h + 10
    meta = ("framing %s | label %s | az %s | hero sha %s... | still sha %s... | %s"
            % (framing, label, az, hero_sha[:8], still_sha[:8],
               datetime.date.today().isoformat()))
    dr.text((margin, y), ascii_safe(meta), font=f, fill=(235, 235, 235))
    y += f.size + 6
    dr.text((margin, y), ascii_safe("S2 %s" % s2_line), font=f_small, fill=grey)
    y += f_small.size + 4
    dr.text((margin, y), ascii_safe("phase caveat: %s" % PHASE_CAVEAT),
            font=f_small, fill=grey)
    sheet.save(out_path, optimize=True)
    return W, H


def vram_section(out):
    vp = os.path.join(out, "vram.log")
    if not os.path.isfile(vp):
        return None
    vals = [int(l.strip()) for l in open(vp) if l.strip().isdigit()]
    if not vals:
        return None
    peak, low = max(vals), min(vals)
    base = None
    total = None
    pp = os.path.join(out, "precheck.txt")
    if os.path.isfile(pp):
        for tok in open(pp).read().split():
            if tok.startswith("used="):
                base = int(tok.split("=", 1)[1])
            elif tok.startswith("total="):
                total = int(tok.split("=", 1)[1])
    cyc = None
    cyc_src = None
    rl = os.path.join(out, "render.log")
    if os.path.isfile(rl):
        peak_re = re.compile(r"Peak memory:\s*([0-9.]+)")
        mem_re = re.compile(r"Mem:\s*([0-9.]+)")
        for line in open(rl, errors="replace"):
            m = peak_re.search(line)
            if m:
                try:
                    v = float(m.group(1))
                except ValueError:
                    continue
                cyc, cyc_src = max(cyc or 0.0, v), "Peak memory line"
                continue
            m = mem_re.search(line)
            if m:
                try:
                    v = float(m.group(1))
                except ValueError:
                    continue
                cyc = max(cyc or 0.0, v)
                if cyc_src is None:
                    cyc_src = "Mem high-water (Blender 5.2.2 stats)"
    ours = peak - (base if base is not None else low)
    if cyc is not None:
        ours = max(ours, cyc)
    return {
        "vram_log_samples": len(vals),
        "device_peak_mib": peak,
        "device_baseline_mib": base if base is not None else low,
        "device_total_mib": total,
        "cycles_peak_mib": None if cyc is None else int(cyc),
        "cycles_peak_source": cyc_src,
        "our_render_peak_mib": ours,
        "gate_mib": 6144,
        "gate_warn": ours > 6144,
        "note": ("our peak = max(cycles leg, vram peak - precheck baseline); cycles leg from "
                 "Peak memory line if present else max Mem:<n>M high-water; None = unmeasurable "
                 "in this Blender build (D-223-02)"),
    }


def nv(v):
    """Table cell: %g for numbers, n/a for null/strings."""
    return ("%g" % v) if isinstance(v, (int, float)) and not isinstance(v, bool) else "n/a"


def write_scorecard(path, s):
    L = []
    L.append("# Still scorecard — %s" % s["label"])
    L.append("")
    L.append("generated %s | azimuth %s | renders `%s` | measure.py sha256 `%s`"
             % (s["generated"], s["azimuth"], s["renders"], s["measure_sha256"]))
    L.append("")
    if s.get("hero_s0_source"):
        L.append("hero s0 values: %s" % s["hero_s0_source"])
        L.append("")
    L.append("**Phase caveat:** %s" % s["phase_caveat"])
    L.append("")
    sections = s["sections"]
    sec = {x["name"]: x for x in sections}
    m = sec["measured, single-frame"]
    L.append("## 1. Measured, single-frame")
    L.append("")
    L.append(m["note"])
    L.append("")
    L.append("| framing | attr | metric | unit | still s0 | hero s0 | hero mean | delta vs s0 | delta vs mean |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for r in m["rows"]:
        L.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s |"
                 % (r["framing"], r["attribute"], r["metric"], r.get("unit") or "",
                    nv(r["still_s0"]), nv(r["hero_s0"]), nv(r["hero_mean"]),
                    nv(r["delta_vs_hero_s0"]), nv(r["delta_vs_hero_mean"])))
    L.append("")
    nm = sec["not measurable this pass"]
    L.append("## 2. Not measurable this pass")
    L.append("")
    L.append(nm["note"])
    L.append("")
    L.append("| framing | attr | verdict | reason | values |")
    L.append("|---|---|---|---|---|")
    for r in nm["rows"]:
        L.append("| %s | %s | %s | %s | `%s` |"
                 % (r["framing"], r["attribute"], r.get("verdict", "n/a"),
                    r["reason"].replace("|", "/"), json.dumps(r.get("values", {}), sort_keys=True)))
    L.append("")
    t = sec["TOOL, not chased"]
    L.append("## 3. TOOL, not chased")
    L.append("")
    L.append(t["note"])
    L.append("")
    L.append("| framing | attr | reason | values |")
    L.append("|---|---|---|---|")
    for r in t["rows"]:
        L.append("| %s | %s | %s | `%s` |"
                 % (r["framing"], r["attribute"], r["reason"].replace("|", "/"),
                    json.dumps(r.get("values", {}), sort_keys=True)))
    L.append("")
    L.append("## S2 bbox gate (s0 island mask; union gate not measurable)")
    L.append("")
    for line in s["s2"]:
        L.append("- %s" % line)
    L.append("")
    if s.get("vram"):
        L.append("## VRAM (D-223-02)")
        L.append("")
        L.append("`%s`" % json.dumps(s["vram"], sort_keys=True))
        L.append("")
    with open(path, "w") as fh:
        fh.write("\n".join(L))


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--renders", required=True)
    ap.add_argument("--measure", required=True)
    ap.add_argument("--hero-frames", required=True, dest="hero_frames")
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="still")
    ap.add_argument("--python", default=sys.executable)
    ap.add_argument("--hero-s0-csv", dest="hero_s0_csv",
                    help="take hero s0 values from the look spec's measurements.csv; "
                         "--hero-frames then holds the 960-px hero panels (sha not pinned)")
    args = ap.parse_args(argv)

    if not os.path.isfile(args.measure):
        die("measure.py not found: %s" % args.measure)
    got = sha256(args.measure)
    if got != MEASURE_SHA_PIN:
        die("measure.py sha256 %s != pin %s — refusing to score with an unpinned tool"
            % (got, MEASURE_SHA_PIN))
    print("still_review: measure.py sha256 OK (%s…)" % got[:16])

    os.makedirs(args.out, exist_ok=True)
    module = load_measure_module(args.measure)
    means, means_src = hero_mean_table(args.measure)
    if means_src:
        print("still_review: hero means from %s" % means_src)
    else:
        print("still_review: no sibling measurements.csv — hero_mean rows will be null")

    framings = []
    for f in ("tall", "wide"):
        if os.path.isfile(os.path.join(args.renders, "%s-s0-f0.png" % f)) or \
           os.path.isfile(os.path.join(args.renders, f, "%s-s0-f0.png" % f)):
            framings.append(f)
    if not framings:
        die("no tall/wide still PNGs under %s" % args.renders)

    az = "n/a"
    azp = os.path.join(args.out, "azimuth.txt")
    if os.path.isfile(azp):
        az = open(azp).read().strip().split("=", 1)[-1] or "n/a"

    measured, not_measurable, tool_rows = [], [], []
    s2_lines, sheet_info, still_meta = [], {}, {}

    for framing in framings:
        still = still_png(args.renders, framing)
        still_sha = sha256(still)
        hero = os.path.join(args.hero_frames, "%s-s0-f0.png" % framing)
        if not os.path.isfile(hero):
            die("hero frame missing: %s" % hero)
        hero_sha = sha256(hero)
        if args.hero_s0_csv:
            hero_sha = HERO_SHA_PREFIX[framing]   # the values' frame; the panel is its 960-px copy
        elif not hero_sha.startswith(HERO_SHA_PREFIX[framing]):
            die("hero frame %s sha256 %s does not start with pin %s"
                % (hero, hero_sha, HERO_SHA_PREFIX[framing]))
        still_meta[framing] = {"still": still, "still_sha256": still_sha,
                               "hero": hero, "hero_sha256": hero_sha}
        print("still_review: %s hero sha %s… (pin %s), still sha %s…"
              % (framing, hero_sha[:8], HERO_SHA_PREFIX[framing], still_sha[:8]))

        # ---- 4a..4h single-frame (still) and hero s0 -------------------------
        still_js, hero_js = {}, {}
        csv_js = (hero_s0_from_csv(args.hero_s0_csv, framing, module.MASTER_SHA[framing])
                  if args.hero_s0_csv else None)
        for attr in ATTRS:
            still_js[attr] = run_measure(args.python, args.measure,
                                         os.path.dirname(still), framing, attr)
            hero_js[attr] = (csv_js.get(attr, {}) if csv_js is not None else
                             run_measure(args.python, args.measure,
                                         args.hero_frames, framing, attr))
            with open(os.path.join(args.out, "measure-%s-%s.json" % (framing, attr)), "w") as fh:
                json.dump(still_js[attr], fh, indent=2, sort_keys=True)
        print("still_review: %s 8 single-frame sets (4a-4h) + hero s0 done" % framing)

        for attr in MEASURED_ATTRS:
            for key in sorted(still_js[attr]):
                d = still_js[attr][key]
                hd = hero_js[attr].get(key, {})
                sv, hv = fin(d.get("value")), fin(hd.get("value"))
                mv = means.get((framing, key))
                measured.append({
                    "framing": framing, "attribute": attr, "metric": key,
                    "unit": d.get("unit"), "region": d.get("region"),
                    "still_s0": sv, "hero_s0": hv,
                    "hero_mean": fin(mv) if mv is not None else None,
                    "delta_vs_hero_s0": (sv - hv) if (sv is not None and hv is not None) else None,
                    "delta_vs_hero_mean": (sv - fin(mv)) if (sv is not None and mv is not None) else None,
                    "note": d.get("note", ""),
                    "source": "measure-%s-%s.json" % (framing, attr),
                })

        # ---- 4i still-adapted (D2) ------------------------------------------
        tmp = tempfile.mkdtemp(prefix="still223-4i-%s-" % framing)
        try:
            for k, idx in enumerate(S_IDX):
                shutil.copyfile(still, os.path.join(tmp, "%s-s%d-f%d.png" % (framing, k, idx)))
            js4i = run_measure(args.python, args.measure, tmp, framing, "4i")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        with open(os.path.join(args.out, "measure-%s-4i.json" % framing), "w") as fh:
            json.dump(js4i, fh, indent=2, sort_keys=True)
        keep = ["cloud_band_y_pctH", "cloud_texture_zero_x_px", "cloud_texture_zero_y_px",
                "drift_dx_px", "drift_dy_px", "drift_not_measurable"]
        not_measurable.append({
            "framing": framing, "attribute": "4i", "verdict": "still-adapted (not a pass metric)",
            "reason": ("4i needs 8 frames + a cloud volume; drift is undefined for a static "
                       "still. Numbers are the still-adapted run (the same still copied to "
                       "all 8 s-slots, S_IDX=%s)." % S_IDX),
            "values": {k: fin(js4i[k]["value"]) for k in keep if k in js4i},
        })
        print("still_review: %s 4i still-adapted done (band y=%s %%H)"
              % (framing, js4i.get("cloud_band_y_pctH", {}).get("value")))

        # ---- S2 s0 gate (measure.py's own mask/ref/tol) ----------------------
        bbox, ref, tol, gate = s2_gate(module, still, framing)
        verdict = "PASS" if gate else "FAIL"
        line = ("%s S2 %s bbox x %.3f-%.3f y %.3f-%.3f ref x %.2f-%.2f y %.2f-%.2f "
                "tol x %.2f y %.2f (s0 island mask; union gate needs 8 frames)"
                % (framing, verdict, bbox[0], bbox[1], bbox[2], bbox[3],
                   ref[0], ref[1], ref[2], ref[3], tol[0], tol[2]))
        s2_lines.append(line)
        print("still_review: " + line)
        not_measurable.append({
            "framing": framing, "attribute": "S2 (union gate)", "verdict": verdict,
            "reason": ("union bbox pools s0..s7; the s0-mask gate above is real, the union "
                       "row cannot be concluded from one still"),
            "bbox_s0": [round(v, 4) for v in bbox], "ref": list(ref),
            "tol": [tol[0], tol[2]], "s2_txt_line": line,
        })
        not_measurable.append({
            "framing": framing, "attribute": "4g (union rows)",
            "reason": "union palette pools stratum pixels over s0..s7; not measurable from one still",
        })

        # ---- TOOL rows (measured to confirm they stay absent) ---------------
        for attr in TOOL_ATTRS:
            why = ("TOOL — bloom must stay absent; run only to confirm" if attr == "4c"
                   else "TOOL — grain must not be added; run only to confirm")
            tool_rows.append({"framing": framing, "attribute": attr, "reason": why,
                              "values": {k: fin(v.get("value"))
                                         for k, v in sorted(still_js[attr].items())}})
        d1 = {k: fin(v.get("value")) for k, v in sorted(still_js["4e"].items())
              if "D1" in k and k in hero_js["4e"]}
        tool_rows.append({"framing": framing, "attribute": "D1 (micro-contrast)",
                          "reason": "TOOL — D1 micro-contrast is carried by the 4e D1 rows; not chased",
                          "values": d1})

        # ---- sheet ----------------------------------------------------------
        sheet = os.path.join(args.out, "sheet-%s.png" % framing)
        W, H = compose_sheet(hero, still, sheet, framing, args.label, az,
                             hero_sha, still_sha, line,
                             MASTER_SIZE[framing] if args.hero_s0_csv else None)
        sheet_info[framing] = {"path": sheet, "size": [W, H], "panel_width": PANEL_W}
        print("still_review: wrote %s (%dx%d, panels %d px)" % (sheet, W, H, PANEL_W))

    with open(os.path.join(args.out, "s2.txt"), "w") as fh:
        fh.write("S2 island-bbox gate, s0 island mask, measure.py BBOX_REF/BBOX_TOL\n")
        for l in s2_lines:
            fh.write(l + "\n")

    scores = {
        "tool": "still_review.py",
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "label": args.label,
        "azimuth": az,
        "renders": os.path.abspath(args.renders),
        "out": os.path.abspath(args.out),
        "measure_sha256": got,
        "hero_frames": still_meta,
        "phase_caveat": PHASE_CAVEAT,
        "hero_s0_source": (("frame_s == 0 rows of %s (sha256 %s, the pinned measure.py's own run "
                            "on the pinned masters); sheet panels are the 960-px hero panels"
                            % (os.path.basename(args.hero_s0_csv), sha256(args.hero_s0_csv)[:16]))
                           if args.hero_s0_csv else "measure.py run on the hero frames"),
        "sections": [
            {"name": "measured, single-frame",
             "note": ("still s0 vs hero s0 (fair comparator) vs hero mean (spec target); "
                      "delta = still - comparator; 4a-4h from measure.py single-frame runs"),
             "rows": measured},
            {"name": "not measurable this pass",
             "note": "reasons, never blanks; 4i numbers are still-adapted",
             "rows": not_measurable},
            {"name": "TOOL, not chased",
             "note": "measured to confirm absence; do not add (look spec §5)",
             "rows": tool_rows},
        ],
        "s2": s2_lines,
        "sheets": sheet_info,
        "vram": vram_section(args.out),
        "nonfinite_values": len(NONFINITE),
    }
    with open(os.path.join(args.out, "scores.json"), "w") as fh:
        json.dump(scores, fh, indent=2)
    scorecard = os.path.join(args.out, "scorecard.md")
    write_scorecard(scorecard, scores)

    bad = [l.split()[0] for l in s2_lines if " FAIL " in l]
    print("still_review: wrote scores.json + scorecard.md; measured rows=%d, not-measurable=%d, tool=%d"
          % (len(measured), len(not_measurable), len(tool_rows)))
    if NONFINITE:
        print("still_review: EXIT 3 — %d non-finite metric value(s)" % len(NONFINITE), file=sys.stderr)
        return 3
    if bad:
        print("still_review: EXIT 1 — S2 gate FAIL: %s" % ", ".join(bad), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
