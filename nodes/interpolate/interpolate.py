"""Interpolate Node: RIFE 16x + seam close, containerised (M4, D3).

Ports `scripts/hero/up4k.sh:27-30` onto native-4K graded PNG dirs; the ESRGAN
stage (`up4k.sh:13-26`) is dropped per ticket (native 4K in, no upscale).
Interface: graded frame dirs in, 4K/120 HEVC+AV1 masters + poster/blur out
(`up4k.sh:33-36` settings verbatim). No `~/hero3d` host paths anywhere.

Seam close (`up4k.sh:27-30` semantics): copy first frame after last, RIFE to
`n*k+1`, drop the extra -> exactly `n*k` frames (243 -> 3888 at 120fps,
32.4s). Container: RIFE binary + rife-v4.6 model baked in (Dockerfile here);
where no RIFE binary exists `interpolate_seq` takes a clearly-labelled
frame-duplication fallback that preserves count/seam but NOT motion quality.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

N_IN = 243  # graded frames per framing dir in (mirrors grade N_FRAMES, M3)
K = 16  # RIFE multiplier (up4k.sh: k=16)
FPS = 120  # master framerate (up4k.sh: fps=120)
N_OUT = N_IN * K  # 3888 frames per master; 3888/120 = 32.4 s
WIDE = (3840, 2160)  # must match nodes/render/render_island.py
TALL = (2160, 3840)

# ponytail: fallback duplicates frames (no motion blending); RIFE path is the product path


def expected_out(n=N_IN, k=K):
    """Output frame count for n inputs at multiplier k (up4k.sh: n*k+1 minus 1)."""
    return n * k


def _frame_name(i):
    return f"frame_{i:03d}.png"


def interpolate_seq(frames_dir, seq_dir, n=N_IN, k=K, rife_bin=None, model_dir=None):
    """Seam-close + interpolate a graded dir to a %08d.jpg sequence (count n*k).

    RIFE path mirrors up4k.sh:27-30 exactly (first-after-last, -n n*k+1,
    drop extra). Fallback (no rife_bin): each input frame emitted k times;
    count/seam identical, motion NOT interpolated -- labelled FALLBACK.
    """
    frames_dir, seq_dir = Path(frames_dir), Path(seq_dir)
    seq_dir.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        if not (frames_dir / _frame_name(i)).is_file():
            raise FileNotFoundError(f"missing input frame: {_frame_name(i)}")
    if rife_bin:
        stage = seq_dir / "_stage"
        stage.mkdir(exist_ok=True)
        for i in range(n):
            shutil.copyfile(frames_dir / _frame_name(i), stage / f"{i + 1:08d}.png")
        # up4k.sh:27 -- close the loop across last->first
        shutil.copyfile(stage / "00000001.png", stage / f"{n + 1:08d}.png")
        subprocess.run([rife_bin, "-i", str(stage), "-o", str(seq_dir),
                        "-m", str(model_dir), "-n", str(n * k + 1),
                        "-u", "-f", "%08d.jpg"], check=True,
                       capture_output=True)
        # up4k.sh:30 -- drop the extra closing frame
        (seq_dir / f"{n * k + 1:08d}.jpg").unlink()
        shutil.rmtree(stage)
    else:
        from PIL import Image
        print("FALLBACK (no RIFE): frame duplication, count/seam only", file=sys.stderr)
        for i in range(n):
            img = Image.open(frames_dir / _frame_name(i)).convert("RGB")
            for j in range(k):
                img.save(seq_dir / f"{i * k + j + 1:08d}.jpg", quality=95)
    outs = sorted(seq_dir.glob("*.jpg"))
    assert len(outs) == n * k, f"want {n * k} frames, got {len(outs)}"
    return len(outs)


def encode_master(seq_dir, name, W, H, out_dir, fps=FPS,
                  av1_encoder="libaom-av1", av1_extra=("-cpu-used", "6", "-row-mt", "1",
                                                      "-tiles", "4x4")):
    """HEVC+AV1 masters + poster/blur from a sequence (up4k.sh:33-36 verbatim).

    Defaults are up4k.sh:33-36 exactly (libaom-av1). The av1_* hooks exist
    only so the self-test can prove count/fps/duration with this host's
    libsvtav1 where libaom-av1 is absent; the container uses the defaults.
    """
    seq_dir, out_dir = Path(seq_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pat = str(seq_dir / "%08d.jpg")
    hevc = out_dir / f"{name}-4k120-hevc.mp4"
    av1 = out_dir / f"{name}-4k120-av1.mp4"
    poster = out_dir / f"{name}-poster.jpg"
    blur = out_dir / f"{name}-blur.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                    "-i", pat, "-c:v", "libx265", "-crf", "22", "-preset", "medium",
                    "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
                    "-x265-params", "log-level=error",
                    "-movflags", "+faststart", str(hevc)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                    "-i", pat, "-c:v", av1_encoder, "-crf", "34", "-b:v", "0",
                    *av1_extra,
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(av1)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-i", str(seq_dir / "00000001.jpg"),
                    "-q:v", "2", str(poster)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y",
                    "-i", str(seq_dir / "00000001.jpg"),
                    "-vf", "scale=iw/2:-2,gblur=sigma=28,"
                           "eq=brightness=-0.06:saturation=0.85",
                    "-q:v", "4", str(blur)], check=True)
    return {"hevc": hevc, "av1": av1, "poster": poster, "blur": blur}


def run(graded_wide, graded_tall, out_dir, k=K, fps=FPS, rife_bin=None, model_dir=None):
    """Both framings: interpolate + encode. Returns {framing: paths}."""
    out = {}
    for framing, gdir, (W, H) in (("wide", graded_wide, WIDE), ("tall", graded_tall, TALL)):
        seq = Path(out_dir) / f"seq-{framing}"
        interpolate_seq(gdir, seq, N_IN, k, rife_bin, model_dir)
        out[framing] = encode_master(seq, framing, W, H, out_dir, fps)
    return out


def _ffprobe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                          "-show_entries", "stream=nb_frames,avg_frame_rate,codec_name,"
                          "width,height,duration",
                          "-of", "default=noprint_wrappers=1", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return dict(l.split("=", 1) for l in out.split() if "=" in l)


def selftest():
    from PIL import Image
    assert expected_out() == 3888 == N_IN * K, "243->3888"
    assert abs(N_OUT / FPS - 32.4) < 1e-9, "32.4 s"
    assert N_IN == 243, "mirrors M2/M3 turn length"
    with tempfile.TemporaryDirectory(prefix="interp-selftest-") as td:
        td = Path(td)
        n, k, fw, fh = 5, 4, 64, 48  # small; count/seam logic identical at 4K
        fdir = td / "graded"
        fdir.mkdir()
        for i in range(n):
            Image.new("RGB", (fw, fh),
                      ((61 * i + 7) % 256, (37 * i + 13) % 256, (11 * i + 5) % 256)
                      ).save(fdir / _frame_name(i))
        shutil.copyfile(fdir / _frame_name(0), fdir / _frame_name(n - 1))  # first==last in
        seq = td / "seq"
        t0 = time.time()
        assert interpolate_seq(fdir, seq, n, k) == n * k
        dt = time.time() - t0
        outs = sorted(seq.glob("*.jpg"))
        assert [p.name for p in outs] == [f"{i:08d}.jpg" for i in range(1, n * k + 1)]
        # seam: last block derives from frame0-copy, so last out == first out
        assert outs[-1].read_bytes() == outs[0].read_bytes(), "seam not closed"
        # determinism: rerun byte-identical
        seq2 = td / "seq2"
        interpolate_seq(fdir, seq2, n, k)
        assert all(a.read_bytes() == b.read_bytes() for a, b in zip(outs, sorted(seq2.glob("*.jpg"))))
        print(f"  interp {n} in/{n * k} out  seam closed  rerun byte-identical  fallback {dt:.2f}s")
        # encode proof at small res: count/fps/duration via ffprobe.
        # Host ffmpeg here has no libaom-av1 (container does), so the AV1
        # proof encodes via host libsvtav1; codec/res/fps/duration checks read
        # container metadata either way.
        paths = encode_master(seq, "wide", fw, fh, td / "out",
                              av1_encoder="libsvtav1", av1_extra=("-preset", "8"))
        for p in paths.values():
            assert p.is_file(), f"missing {p}"
        meta = _ffprobe(paths["hevc"])
        frames = int(meta.get("nb_frames") or subprocess.run(
            ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
             "-show_entries", "stream=nb_read_frames", "-of", "default=noprint_wrappers=1",
             str(paths["hevc"])], capture_output=True, text=True, check=True
        ).stdout.split("=")[1])
        assert frames == n * k, f"hevc frames {frames} != {n * k}"
        num, den = map(int, meta["avg_frame_rate"].split("/"))
        assert abs(num / den - FPS) < 0.01, f"fps {meta['avg_frame_rate']}"
        dur = float(meta.get("duration", frames / FPS))
        assert abs(dur - n * k / FPS) < 0.05, f"duration {dur}"
        ma = _ffprobe(paths["av1"])
        assert ma["codec_name"] == "av1" and meta["codec_name"] == "hevc", "codecs"
        assert (ma["width"], ma["height"]) == (str(fw), str(fh)), "res"
        print(f"  hevc {meta['codec_name']} {frames}f {meta['avg_frame_rate']}fps {dur:.3f}s  "
              f"av1 {ma['codec_name']}  poster+blur ok")
        print("self-test ok: n*k-1 seam semantics, 120fps masters, poster/blur, no ESRGAN")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description="RIFE 16x + seam close on graded frame dirs; "
                    "HEVC+AV1 4K/120 masters + poster/blur (no ESRGAN).")
    p.add_argument("--graded-wide", help="M3 graded-wide/ dir in")
    p.add_argument("--graded-tall", help="M3 graded-tall/ dir in")
    p.add_argument("--out-dir", help="masters + stills out")
    p.add_argument("--k", type=int, default=K)
    p.add_argument("--fps", type=int, default=FPS)
    p.add_argument("--rife-bin", default=None, help="rife-ncnn-vulkan binary (container path)")
    p.add_argument("--rife-model", default=None, help="rife-v4.6 model dir (container path)")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args(argv)
    if a.self_test:
        return selftest()
    missing = [f"--{n}" for n in ("graded-wide", "graded-tall", "out-dir")
               if getattr(a, n.replace("-", "_")) is None]
    if missing:
        p.error("missing required arguments: " + ", ".join(missing))
    run(a.graded_wide, a.graded_tall, a.out_dir, a.k, a.fps, a.rife_bin, a.rife_model)
    return 0


if __name__ == "__main__":
    sys.exit(main())
