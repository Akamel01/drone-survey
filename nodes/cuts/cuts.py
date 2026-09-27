"""Cuts Node: §6 delivery set from the M4 HEVC master (M5, D3/D6).

Ports `scripts/hero/cuts.sh:9-15` verbatim. One Node maps the
`{stem}-4k120-hevc.mp4` master to declared outputs: 1440p/60 AV1+HEVC,
1080p/30 H.264, wide-only 4K/60 AV1 (`cuts.sh:14` conditional), 1440p
poster (`cuts.sh:15`). Existing files are kept, so a re-run only makes
what is missing (`cuts.sh:7,10` skip-existing pattern).

Filenames (picked §6/cuts.sh names; recorded for the #193 bundle
consumer, which owns assembly per ADR 0011): `<stem>-1440p60-av1.mp4`,
`<stem>-1440p60-hevc.mp4`, `<stem>-1080p30-h264.mp4`,
`<stem>-4k60-av1.mp4` (wide only), `<stem>-poster-1440.jpg`, where
stem is the master basename minus `-4k120-hevc` (e.g. `wide`,
`tall`). The blurred still is NOT here: D3 gives poster/blur to
interpolate (M4 master derivatives).
"""
import argparse
import subprocess
import sys
import tempfile
import time
from pathlib import Path

MASTER_SUFFIX = "-4k120-hevc.mp4"
MASTER_STEM_SUFFIX = "-4k120-hevc"
WIDE_1440 = (2560, 1440)  # cuts.sh hero-wide 2560 1440
TALL_1440 = (1440, 2560)  # cuts.sh hero-tall 1440 2560


def stem_of(master):
    """`wide-4k120-hevc.mp4` -> `wide` (cuts.sh `$n`; falls back to basename)."""
    stem = Path(master).stem
    if stem.endswith(MASTER_STEM_SUFFIX):
        return stem[:-len(MASTER_STEM_SUFFIX)]
    return stem


def _enc(out, master, vf, *codec_args):
    """cuts.sh `enc()`: keep existing files, else one ffmpeg cut."""
    out = Path(out)
    if out.is_file():
        print(f"  keep {out.name}", file=sys.stderr)
        return out
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(master),
                    "-vf", vf, *codec_args,
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
                   check=True)
    return out


def cut_master(master, out_dir, W, H,
               av1_encoder="libaom-av1",
               av1_extra_1440=("-cpu-used", "6", "-row-mt", "1", "-tiles", "2x2"),
               av1_extra_4k=("-cpu-used", "6", "-row-mt", "1", "-tiles", "4x2")):
    """One master -> §6 set (cuts.sh:11-15 verbatim).

    Defaults are cuts.sh exactly (libaom-av1). The av1_* hooks exist only
    so the self-test can prove codec/res/fps/duration with this host's
    libsvtav1 where libaom-av1 is absent; the product path uses defaults.
    Returns {kind: Path}; wide-only 4k60 present iff W > H (cuts.sh:14).
    """
    master, out_dir = Path(master), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    n = stem_of(master)
    cuts = {}
    cuts["av1_1440"] = _enc(out_dir / f"{n}-1440p60-av1.mp4", master,
                            f"fps=60,scale={W}:{H}:flags=lanczos",
                            "-c:v", av1_encoder, "-crf", "36", "-b:v", "0",
                            *av1_extra_1440)
    cuts["hevc_1440"] = _enc(out_dir / f"{n}-1440p60-hevc.mp4", master,
                             f"fps=60,scale={W}:{H}:flags=lanczos",
                             "-c:v", "libx265", "-crf", "24", "-preset", "medium",
                             "-tag:v", "hvc1", "-x265-params", "log-level=error")
    cuts["h264_1080"] = _enc(out_dir / f"{n}-1080p30-h264.mp4", master,
                             f"fps=30,scale={W * 3 // 4}:{H * 3 // 4}:flags=lanczos",
                             "-c:v", "libx264", "-crf", "21", "-preset", "slow",
                             "-profile:v", "high")
    if W > H:  # cuts.sh:14 -- 4K/60 AV1 for wide screens only
        cuts["av1_4k60"] = _enc(out_dir / f"{n}-4k60-av1.mp4", master, "fps=60",
                                "-c:v", av1_encoder, "-crf", "40", "-b:v", "0",
                                *av1_extra_4k)
    poster = out_dir / f"{n}-poster-1440.jpg"
    if not poster.is_file():  # cuts.sh:15
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(master),
                        "-frames:v", "1", "-vf", f"scale={W}:-2",
                        "-q:v", "3", str(poster)], check=True)
    else:
        print(f"  keep {poster.name}", file=sys.stderr)
    cuts["poster"] = poster
    return cuts


def run(masters_dir, out_dir, **kw):
    """Every `*-4k120-hevc.mp4` master -> §6 set; 1440p dims from master framing."""
    masters_dir, out_dir = Path(masters_dir), Path(out_dir)
    masters = sorted(masters_dir.glob(f"*{MASTER_SUFFIX}"))
    if not masters:
        raise FileNotFoundError(f"no {MASTER_SUFFIX} masters in {masters_dir}")
    out = {}
    for m in masters:
        meta = _ffprobe(m)
        dims = WIDE_1440 if int(meta["width"]) > int(meta["height"]) else TALL_1440
        out[stem_of(m)] = cut_master(m, out_dir, *dims, **kw)
    return out


def _ffprobe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                          "-show_entries", "stream=nb_frames,avg_frame_rate,codec_name,"
                          "width,height,duration",
                          "-of", "default=noprint_wrappers=1", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return dict(l.split("=", 1) for l in out.split() if "=" in l)


def _nframes(path, meta):
    if meta.get("nb_frames") not in (None, "N/A"):
        return int(meta["nb_frames"])
    return int(subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
         "-show_entries", "stream=nb_read_frames",
         "-of", "default=noprint_wrappers=1", str(path)],
        capture_output=True, text=True, check=True).stdout.split("=")[1])


def selftest():
    from PIL import Image
    assert WIDE_1440 == (2560, 1440) and TALL_1440 == (1440, 2560), "cuts.sh W/H"
    assert stem_of("wide-4k120-hevc.mp4") == "wide", "stem"
    with tempfile.TemporaryDirectory(prefix="cuts-selftest-") as td:
        td = Path(td)
        md, fd = td / "masters", td / "frames"
        md.mkdir()
        fps, n = 20, 10  # small; codec/res/fps/duration logic identical at 4K
        for name, (fw, fh) in (("wide", (96, 64)), ("tall", (64, 96))):
            fd.mkdir(exist_ok=True)
            for f in fd.glob("*.png"):
                f.unlink()
            for i in range(n):
                Image.new("RGB", (fw, fh),
                          ((61 * i + 7) % 256, (37 * i + 13) % 256, (11 * i + 5) % 256)
                          ).save(fd / f"f{i:03d}.png")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                            "-i", str(fd / "f%03d.png"),
                            "-c:v", "libx265", "-crf", "28", "-preset", "ultrafast",
                            "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
                            "-movflags", "+faststart",
                            str(md / f"{name}{MASTER_SUFFIX}")], check=True)
        # Host ffmpeg here has no libaom-av1 (product path does), so the AV1
        # proof encodes via host libsvtav1; codec/res/fps/duration checks read
        # container metadata either way.
        t0 = time.time()
        out = run(md, td / "cuts", av1_encoder="libsvtav1",
                  av1_extra_1440=("-preset", "8"), av1_extra_4k=("-preset", "8"))
        dt = time.time() - t0
        assert set(out) == {"wide", "tall"}, f"framings {set(out)}"
        assert "av1_4k60" in out["wide"] and "av1_4k60" not in out["tall"], \
            "wide-only 4K/60 conditional"
        for name, (W, H) in (("wide", WIDE_1440), ("tall", TALL_1440)):
            mm = _ffprobe(md / f"{name}{MASTER_SUFFIX}")
            dur_m = float(mm.get("duration", n / fps))
            expect = {"av1_1440": ("av1", W, H, "60/1", n * 60 // fps),
                      "hevc_1440": ("hevc", W, H, "60/1", n * 60 // fps),
                      "h264_1080": ("h264", W * 3 // 4, H * 3 // 4, "30/1",
                                    n * 30 // fps)}
            if name == "wide":
                mw = _ffprobe(md / f"wide{MASTER_SUFFIX}")
                expect["av1_4k60"] = ("av1", int(mw["width"]), int(mw["height"]),
                                     "60/1", n * 60 // fps)
            for kind, (codec, ew, eh, efps, eframes) in expect.items():
                p = out[name][kind]
                assert p.is_file(), f"missing {p}"
                meta = _ffprobe(p)
                assert meta["codec_name"] == codec, f"{p.name}: {meta['codec_name']}"
                assert (meta["width"], meta["height"]) == (str(ew), str(eh)), \
                    f"{p.name}: {meta['width']}x{meta['height']} != {ew}x{eh}"
                assert meta["avg_frame_rate"] == efps, f"{p.name}: {meta['avg_frame_rate']}"
                assert _nframes(p, meta) == eframes, f"{p.name}: frames"
                dur = float(meta.get("duration", eframes / int(efps.split('/')[0])))
                assert abs(dur - dur_m) < 0.1, f"{p.name}: duration {dur} vs {dur_m}"
                print(f"  {p.name} {codec} {ew}x{eh} {efps}fps {dur:.3f}s ok")
            poster = out[name]["poster"]
            assert poster.is_file(), f"missing {poster}"
            pw = _ffprobe(poster)["width"]
            assert pw == str(W), f"poster width {pw} != {W}"
            print(f"  {poster.name} width={pw} ok")
        # skip-existing: rerun keeps every byte (cuts.sh:7,10 pattern)
        before = {p: (p.stat().st_mtime_ns, p.stat().st_size)
                  for cuts in out.values() for p in cuts.values()}
        time.sleep(0.02)
        out2 = run(md, td / "cuts", av1_encoder="libsvtav1",
                   av1_extra_1440=("-preset", "8"), av1_extra_4k=("-preset", "8"))
        assert {p: (p.stat().st_mtime_ns, p.stat().st_size)
                for cuts in out2.values() for p in cuts.values()} == before, \
            "rerun rewrote outputs"
        print(f"  rerun skip-existing byte-identical ({dt:.1f}s first run)")
        print("self-test ok: §6 set, wide-only 4k60, poster, skip-existing")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Cut §6 delivery set from M4 HEVC masters (cuts.sh verbatim).")
    p.add_argument("--masters-dir", help="M4 masters dir in (*-4k120-hevc.mp4)")
    p.add_argument("--out-dir", help="§6 cuts out")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args(argv)
    if a.self_test:
        return selftest()
    missing = [f"--{n}" for n in ("masters-dir", "out-dir")
               if getattr(a, n.replace("-", "_")) is None]
    if missing:
        p.error("missing required arguments: " + ", ".join(missing))
    run(a.masters_dir, a.out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
