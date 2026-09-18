#!/usr/bin/env python3
"""fit-splat: Fitting a Gaussian Splatting Reconstruction from an ODM camera solve.

Ticket #24 and its comments (measured on the local 4070, #8/#29):

  - splatfacto (nerfstudio) never finished on this 12 GB card: evaluation off
    plus the fragmentation-resistant allocator bought 2,900 more steps but
    still died in training at 79% (docs/research/splat-first-runs-2026-09-10.md).
  - OpenSplat completed a full-resolution fit on the same card, on the same
    project, in 15 minutes (docs/research/opensplat-first-run-2026-09-12.md).

So the engine this Node runs **on the local 12 GB target is OpenSplat** --
the evidence-supported choice for that target, per the ticket. ADR 0004
still names splatfacto as the pipeline's engine and that decision is not
revised here (the ticket's own research explicitly says the OpenSplat runs
"does not change ADR 0004 yet" -- quality against real stills is unjudged).
splatfacto stays wired in as the memory policy for the 3090/rented targets,
where 24GB+ is expected to clear the ceiling that defeated it locally, and
because it is ADR 0004's standing choice. Which engine runs is therefore a
memory-policy decision keyed by `--target` (ADR 0014), not a Node choice.

Both engine paths always carry the two fixes #8 measured as necessary:
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True, and evaluation disabled
(splatfacto: the --steps-per-eval-* flags that also keep the 233 MB AlexNet
LPIPS download off the critical path, per #8's second comment; OpenSplat has
no periodic full-resolution eval pass to begin with -- eval is opt-in via
--val/--val-render and this Node never sets --val-render, so nothing beyond
one withheld image's loss is ever rendered). splatfacto's container is a
locally-built derivative (see nerfstudio.Dockerfile) that bakes the AlexNet
weights in at build time rather than fetching them per run (ADR 0013:
option 1 from the ticket's first comment).

Checkpointing: OpenSplat's `-s/--save-every` writes `<stem>_<step>.ply`
next to the output (confirmed by reading opensplat.cpp directly); this Node
resumes from the highest-numbered one automatically. splatfacto resumes via
nerfstudio's own `--load-dir` pointing at its latest checkpoint directory.

Held-out fidelity for the cleaning gate downstream: `--val` withholds one
training image and OpenSplat itself prints
"<path> validation PSNR: <value>" once training ends -- this Node parses
that line into the report rather than re-implementing view rendering.

Before Fitting spends any GPU time, this Node reads ODM's own report
(odm_report/stats.json) and refuses to start on a weak camera solve
(docs/research/splat-auto-cleaning-2026.md, step 1).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import die, emit_report  # noqa: E402

ALLOC_CONF = "expandable_segments:True"
NERFSTUDIO_IMAGE = "nerfstudio-splat:local"  # built from nerfstudio.Dockerfile, AlexNet baked in
OPENSPLAT_IMAGE = "opensplat:local"          # built from ~/drone/OpenSplat's own Dockerfile

REGISTERED_SHOT_RATIO_MIN = 0.80   # ponytail: conservative first cut (ADR 0018), unmeasured past this one project
AVERAGE_TRACK_LENGTH_MIN = 2.0
GCP_RMSE_MAX_M = 0.5

# ADR 0014: memory policy is chosen by target, not guessed at fit time. The
# local card is the only one with a measured full-resolution number, and that
# number is for 3840x2160 video frames -- six times fewer pixels than a real
# Grid Mission still (8192x6144, per splat-first-runs-2026-09-10.md). Peak
# memory does not scale predictably with resolution either (three OpenSplat
# points refuse a line or a fixed-cost-plus-linear fit), so "full-still"
# defaults to a conservative downscale until a real Capture measures it --
# ADR 0014's "start conservative, tighten with measurement." Override with
# --downscale-factor / --engine / --max-iters for a known-safe case.
MEMORY_POLICY = {
    "local": {
        "engine": "opensplat",
        "max_iters": 15000,
        "save_every": 2500,
        "downscale_factor": {"video-frame": 1, "full-still": 4},
        "no_gpu_cache": False,  # measured worth only ~1.3% (#29 research); not worth the 2% slowdown by default
        "docker_memory": "32g",
        "shm_size": "8g",
    },
    "remote-3090": {
        "engine": "splatfacto",
        "max_iters": 30000,
        "save_every": 2000,
        "downscale_factor": {"video-frame": 1, "full-still": 1},
        "no_gpu_cache": False,
        "docker_memory": "64g",
        "shm_size": "16g",
    },
    "rented": {
        "engine": "splatfacto",
        "max_iters": 30000,
        "save_every": 2000,
        "downscale_factor": {"video-frame": 1, "full-still": 1},
        "no_gpu_cache": False,
        "docker_memory": "64g",
        "shm_size": "16g",
    },
}


def check_solve_quality(stats: dict) -> tuple[bool, str]:
    """Refuse to start Fitting on a weak camera solve (splat-auto-cleaning-2026.md, step 1).

    Pure function of ODM's own odm_report/stats.json -- no cleaning step
    rescues gaussians fitted to bad poses, so this runs before Fitting, not
    after cleaning.
    """
    recon = stats.get("reconstruction_statistics") or {}
    initial = recon.get("initial_shots_count") or 0
    registered = recon.get("reconstructed_shots_count") or 0
    if not initial:
        return False, "ODM report has no reconstruction_statistics.initial_shots_count"
    ratio = registered / initial
    if ratio < REGISTERED_SHOT_RATIO_MIN:
        return False, f"only {registered}/{initial} images registered ({ratio:.0%} < {REGISTERED_SHOT_RATIO_MIN:.0%})"

    track_length = recon.get("average_track_length") or 0.0
    if track_length < AVERAGE_TRACK_LENGTH_MIN:
        return False, f"average track length {track_length:.2f} < {AVERAGE_TRACK_LENGTH_MIN}"

    gcp_errors = stats.get("gcp_errors") or {}
    rmse = gcp_errors.get("rmse") or gcp_errors.get("mean_absolute_error")
    if rmse is not None and rmse > GCP_RMSE_MAX_M:
        return False, f"GCP RMSE {rmse:.3f}m > {GCP_RMSE_MAX_M}m"

    return True, f"{registered}/{initial} images registered ({ratio:.0%}), avg track length {track_length:.2f}"


def pick_policy(target: str, resolution_class: str, overrides: dict) -> dict:
    """The memory policy for this target, with any explicit overrides applied."""
    if target not in MEMORY_POLICY:
        die(f"fit-splat: unknown --target {target!r}, expected one of {sorted(MEMORY_POLICY)}")
    base = dict(MEMORY_POLICY[target])
    base["downscale_factor"] = base["downscale_factor"][resolution_class]
    for key, value in overrides.items():
        if value is not None:
            base[key] = value
    return base


def opensplat_args(project_inner: str, out_ply: str, policy: dict, resume_ply: str | None) -> list[str]:
    """OpenSplat's own CLI args (opensplat.cpp, read directly on the host). Pure: no I/O."""
    args = [
        project_inner, "-o", out_ply,
        "-n", str(policy["max_iters"]),
        "-s", str(policy["save_every"]),
        "-d", str(policy["downscale_factor"]),
        "--val",  # withhold one image; prints its validation PSNR at the end (never renders/scores every image)
    ]
    if policy.get("no_gpu_cache"):
        args.append("--no-gpu-cache")
    if resume_ply:
        args += ["--resume", resume_ply]
    return args


def splatfacto_process_args(odm_dir_inner: str, processed_dir_inner: str, policy: dict) -> list[str]:
    return ["ns-process-data", "odm", "--data", odm_dir_inner, "--output-dir", processed_dir_inner,
            "--num-downscales", str(max(0, policy["downscale_factor"] - 1))]


def splatfacto_train_args(processed_dir_inner: str, output_dir_inner: str, policy: dict, load_dir_inner: str | None) -> list[str]:
    """ns-train args. Eval-disabling flags and the allocator's companion fixes are always present (#8's two comments)."""
    over_max = policy["max_iters"] + 1
    args = [
        "splatfacto", "--data", processed_dir_inner, "--output-dir", output_dir_inner,
        "--max-num-iterations", str(policy["max_iters"]),
        "--steps-per-save", str(policy["save_every"]),
        "--viewer.quit-on-train-completion", "True", "--vis", "tensorboard",
        # eval passes always off, on every target (#8): they cost memory training never gets back
        # and only exist to feed the LPIPS metric this pipeline never reads.
        "--steps-per-eval-all-images", str(over_max),
        "--steps-per-eval-image", str(over_max),
        "--steps-per-eval-batch", str(over_max),
        # fewer floaters at the source (splat-auto-cleaning-2026.md, step 2)
        "--pipeline.model.cull-alpha-thresh", "0.005",
        "--pipeline.model.use-scale-regularization", "True",
        "--pipeline.model.rasterize-mode", "antialiased",
    ]
    if load_dir_inner:
        args += ["--load-dir", load_dir_inner]
    return args


def splatfacto_export_args(config_inner: str, export_dir_inner: str) -> list[str]:
    return ["ns-export", "gaussian-splat", "--load-config", config_inner, "--output-dir", export_dir_inner]


def expected_mount_path(project_dir: Path) -> str:
    """The absolute path OpenSfM recorded for this project's images, read back
    from opensfm/image_list.txt.

    OpenSplat needs the project mounted at exactly this path or it cannot
    find the images (#12's research: the first OpenSplat attempt failed in
    45 seconds for exactly this reason). Reproduced from the project's own
    recorded paths rather than assumed from its current directory name --
    the Runner's own node_dir naming (`nodes/solve/project`, whatever the
    Manifest calls the output) need not match the name ODM saw when it ran,
    so guessing from the directory name is exactly the seam ADR 0018 warns
    about.
    """
    image_list = project_dir / "opensfm" / "image_list.txt"
    if not image_list.is_file():
        return f"/datasets/{project_dir.name}"  # nothing recorded to reproduce; best effort
    first_line = next((l for l in image_list.read_text().splitlines() if l.strip()), "")
    root, sep, _ = first_line.partition("/images/")
    return root if sep else f"/datasets/{project_dir.name}"


def find_latest_opensplat_checkpoint(out_dir: Path, stem: str) -> Path | None:
    """`<stem>_<step>.ply` files written by -s/--save-every; resume from the highest step."""
    candidates = []
    for p in out_dir.glob(f"{stem}_*.ply"):
        m = re.fullmatch(rf"{re.escape(stem)}_(\d+)\.ply", p.name)
        if m:
            candidates.append((int(m.group(1)), p))
    return max(candidates)[1] if candidates else None


def find_latest_splatfacto_load_dir(output_dir: Path) -> Path | None:
    """nerfstudio writes <output_dir>/<data-name>/splatfacto/<timestamp>/; the newest timestamp resumes."""
    runs = sorted(output_dir.glob("*/splatfacto/*"), key=lambda p: p.name)
    for run in reversed(runs):
        if (run / "nerfstudio_models").is_dir():
            return run
    return None


BASELINE_GPU_MIB_MAX = 3000  # the production chat worker alone measures ~1,400-1,500 MiB (#8/#12's research)


def gpu_is_busy() -> str | None:
    """None if the card looks free; otherwise a reason.

    Two independent checks, because container naming turned out not to be
    reliable by itself: a same-host benchmarking run collided with this
    Node once during this ticket's own build precisely because it used an
    unnamed container rather than a `bench-*` one, and the ticket's own
    memory-used baseline (production worker only, ~1,400-1,500 MiB) is
    exactly the kind of measured number ADR 0014 asks placement checks to
    use instead of a guess.
    """
    out = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True)
    bench = [n for n in out.stdout.splitlines() if n.startswith("bench-")]
    if bench:
        return f"bench-* container(s) running: {', '.join(bench)}"
    used = sample_gpu_memory_mib()
    if used > BASELINE_GPU_MIB_MAX:
        return f"{used} MiB already in use (> {BASELINE_GPU_MIB_MAX} MiB baseline) -- another job appears to hold the GPU"
    return None


def wait_for_gpu_free(poll_s: float = 15.0, timeout_s: float = 3600.0) -> None:
    """Coordination rule: never start a GPU run while another job holds the card.

    Checked from docker's own container-name listing and nvidia-smi's own
    memory counter, not from this process's argv, so the loop cannot match
    its own command line.
    """
    waited = 0.0
    while True:
        reason = gpu_is_busy()
        if reason is None:
            return
        if waited >= timeout_s:
            die(f"fit-splat: GPU held for over {timeout_s:.0f}s ({reason}); giving up")
        print(f"fit-splat: waiting for the GPU to free up ({reason}; {waited:.0f}s so far)")
        time.sleep(poll_s)
        waited += poll_s


def sample_gpu_memory_mib() -> int:
    out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                          capture_output=True, text=True, check=True)
    return int(out.stdout.strip().splitlines()[0])


def run_docker(command: list[str], log_path: Path) -> tuple[int, str, int, int]:
    """Run a docker command, sampling GPU memory every 5s. Returns (exit_code, wall_s, baseline_mib, peak_mib)."""
    baseline = sample_gpu_memory_mib()
    peak = [baseline]
    stop = threading.Event()

    def sampler():
        while not stop.is_set():
            try:
                peak[0] = max(peak[0], sample_gpu_memory_mib())
            except subprocess.CalledProcessError:
                pass
            stop.wait(5)

    t = threading.Thread(target=sampler, daemon=True)
    t.start()
    start = time.monotonic()
    with log_path.open("w") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    wall = time.monotonic() - start
    stop.set()
    t.join()
    return result.returncode, wall, baseline, peak[0]


def parse_val_psnr(log_text: str) -> tuple[str | None, float | None]:
    m = re.search(r"^(.*) validation PSNR: ([\d.eE+-]+)\s*$", log_text, re.MULTILINE)
    if not m:
        return None, None
    return m.group(1), float(m.group(2))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="solve_dir", required=True, type=Path, help="the solve Node's ODM project output")
    p.add_argument("--out-splat", required=True, type=Path, help="raw fitted splat.ply")
    p.add_argument("--out-report", required=True, type=Path)
    # Env fallbacks (not manifest inputs, same pattern as nodes/bundle/build.py's BUNDLE_* vars):
    # the Manifest has no per-run parameter passthrough yet, so a one-off run against a known
    # Capture class overrides this way instead of hand-editing pipeline/manifests/splat.json.
    p.add_argument("--target", default=os.environ.get("FIT_SPLAT_TARGET", "local"),
                   choices=sorted(MEMORY_POLICY), help="ADR 0014 compute placement")
    p.add_argument("--resolution-class", default=os.environ.get("FIT_SPLAT_RESOLUTION_CLASS", "full-still"),
                   choices=["video-frame", "full-still"],
                   help="video-frame: this project's test frames (measured). full-still: a real 8192x6144 Capture (conservative, unmeasured)")
    p.add_argument("--engine", choices=["opensplat", "splatfacto"], help="override the target's default engine")
    p.add_argument("--max-iters", type=int)
    p.add_argument("--save-every", type=int)
    p.add_argument("--downscale-factor", type=int)
    args = p.parse_args()

    # solve.py's own default stop point is `--end-with opensfm` (the cheapest camera solve,
    # per its docstring): odm_report/stats.json is only written near the very end of a full
    # ODM run, which solve deliberately does not do. OpenSfM writes an equivalent stats.json
    # of its own, with the same schema, right after the camera solve -- read that first, and
    # only fall back to ODM's own report for a solve that happened to run to completion.
    stats_path = args.solve_dir / "opensfm" / "stats" / "stats.json"
    if not stats_path.is_file():
        stats_path = args.solve_dir / "odm_report" / "stats.json"
    if not stats_path.is_file():
        die(f"fit-splat: no solve-quality report at {args.solve_dir}/opensfm/stats/stats.json "
            f"or {args.solve_dir}/odm_report/stats.json; solve did not produce one")
    ok, detail = check_solve_quality(json.loads(stats_path.read_text()))
    print(f"fit-splat: solve-quality gate: {'ok' if ok else 'FAIL'} -- {detail}")
    if not ok:
        die(f"fit-splat: refusing to fit on a weak camera solve ({detail})")

    policy = pick_policy(args.target, args.resolution_class,
                          {"engine": args.engine, "max_iters": args.max_iters,
                           "save_every": args.save_every, "downscale_factor": args.downscale_factor})
    print(f"fit-splat: target={args.target} resolution_class={args.resolution_class} policy={policy}")

    wait_for_gpu_free()

    args.out_splat.parent.mkdir(parents=True, exist_ok=True)
    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    log_path = args.out_splat.parent / "fit.log"
    container_name = f"splat-fit-{int(time.time())}"

    if policy["engine"] == "opensplat":
        stem = args.out_splat.stem
        resume = find_latest_opensplat_checkpoint(args.out_splat.parent, stem)
        if resume:
            print(f"fit-splat: resuming from checkpoint {resume}")
        inner_project = expected_mount_path(args.solve_dir)
        docker_cmd = [
            "docker", "run", "--rm", "--name", container_name, "--gpus", "all",
            "--memory", policy["docker_memory"], "--shm-size", policy["shm_size"],
            "-e", f"PYTORCH_CUDA_ALLOC_CONF={ALLOC_CONF}",
            "-v", f"{args.solve_dir}:{inner_project}",
            "-v", f"{args.out_splat.parent}:/out",
            OPENSPLAT_IMAGE, "/code/build/opensplat",
            *opensplat_args(inner_project, f"/out/{args.out_splat.name}", policy,
                             resume_ply=f"/out/{resume.name}" if resume else None),
        ]
    elif policy["engine"] == "splatfacto":
        processed_dir = args.out_splat.parent / "processed"
        train_dir = args.out_splat.parent / "train"
        load_dir = find_latest_splatfacto_load_dir(train_dir)
        if load_dir:
            print(f"fit-splat: resuming from checkpoint dir {load_dir}")
        script = " && ".join([
            " ".join(splatfacto_process_args("/odm", "/out/processed", policy)),
            " ".join(splatfacto_train_args("/out/processed", "/out/train", policy,
                                            load_dir_inner=f"/out/train/{load_dir.relative_to(train_dir)}" if load_dir else None)),
            " ".join(splatfacto_export_args("/out/train/config.yml", "/out/export")),
        ])
        docker_cmd = [
            "docker", "run", "--rm", "--name", container_name, "--gpus", "all",
            "--memory", policy["docker_memory"], "--shm-size", policy["shm_size"],
            "-e", f"PYTORCH_CUDA_ALLOC_CONF={ALLOC_CONF}",
            "-v", f"{args.solve_dir}:/odm:ro", "-v", f"{args.out_splat.parent}:/out",
            "--entrypoint", "bash", NERFSTUDIO_IMAGE, "-lc", script,
        ]
    else:
        die(f"fit-splat: unknown engine {policy['engine']!r}")

    print(f"fit-splat: {' '.join(docker_cmd)}")
    exit_code, wall_s, baseline_mib, peak_mib = run_docker(docker_cmd, log_path)
    log_text = log_path.read_text(errors="replace")

    if policy["engine"] == "splatfacto" and exit_code == 0:
        exported = args.out_splat.parent / "export" / "splat.ply"
        if exported.is_file():
            args.out_splat.write_bytes(exported.read_bytes())

    val_image, val_psnr = parse_val_psnr(log_text)

    report = {
        "engine": policy["engine"], "target": args.target, "resolution_class": args.resolution_class,
        "policy": policy, "exit_code": exit_code, "wall_s": round(wall_s, 1),
        "gpu_baseline_mib": baseline_mib, "gpu_peak_mib": peak_mib, "gpu_job_mib": peak_mib - baseline_mib,
        "solve_gate": detail, "val_image": val_image, "val_psnr": val_psnr,
        "output": str(args.out_splat) if args.out_splat.exists() else None,
    }
    emit_report(args.out_report, report)
    print(f"fit-splat: {json.dumps(report, indent=1)}")

    if exit_code != 0:
        die(f"fit-splat: engine exited {exit_code}; see {log_path}")
    if not args.out_splat.is_file():
        die(f"fit-splat: engine exited 0 but {args.out_splat} was not produced")


if __name__ == "__main__":
    main()
