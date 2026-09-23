#!/usr/bin/env python3
"""Tier-1 probe: can RealityScan run unattended at all?

This answers the questions that decide whether RealityScan can be the engine,
in the order that kills the idea cheapest first. It is deliberately NOT a
pipeline. It reconstructs nothing worth keeping. It exists to produce one
machine-readable verdict per tier-1 test in
`docs/research/realityscan-validation-2026-09-19.md`, so the GO/NO-GO gates in
`docs/research/realityscan-gates-2026-09-19.md` can be answered with
measurements instead of documentation alone.

Every verb and setting key this script emits was checked, 2026-09-19, against
the saved copies of Epic's own pages in `docs/research/sources/` -- see
`all-commands.md` and `keys-and-values.md`. Command order follows the official
Linux CLI example in `installation-linux.md`.

Three things here are load-bearing and are the reason this is a script rather
than a shell one-liner:

1. **Every invocation carries `-set "appQuitOnError=true"`.** Without it a
   failed command does not propagate a non-zero exit code, so the pipeline
   would read failure as success. The wrapper refuses to build a command
   without it rather than trusting anyone to remember.

2. **Every invocation is wrapped in a wall-clock watchdog.** Headless
   reconstruction is reported to hang indefinitely with no display server. A
   hang does not self-terminate, so a timeout that kills the process group is
   the only thing standing between us and a wedged job. A hang is recorded as
   a FAILURE, never as a slow pass.

3. **Success is never inferred from the exit code alone.** This repository has
   already measured an engine exiting cleanly having written a 934-face mesh
   and an 87%-empty orthophoto. Where a test claims an artifact, an
   independent reader must open it.

    python3 realityscan-probe.py --images DIR --workdir DIR [--rs PATH]
    python3 realityscan-probe.py --selftest
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

# Wall-clock ceilings, seconds. Generous: we are distinguishing "slow" from
# "wedged", not benchmarking. Exceeding one is a failure of the test, not a
# slow pass -- see T1.1.
TIMEOUT_ALIGN = 1800
TIMEOUT_MODEL = 5400

# Without this, a failed command exits 0 and the pipeline believes it.
QUIT_ON_ERROR = ["-set", "appQuitOnError=true"]


@dataclass
class Probe:
    """One tier-1 test and what actually happened."""

    test: str
    gate: str
    severity: str
    verdict: str = "NOT RUN"          # PASS | FAIL | BLOCKED | NOT RUN
    detail: str = ""
    seconds: float = 0.0
    evidence: dict = field(default_factory=dict)

    def passed(self, detail: str = "", **evidence) -> "Probe":
        self.verdict, self.detail = "PASS", detail
        self.evidence.update(evidence)
        return self

    def failed(self, detail: str, **evidence) -> "Probe":
        self.verdict, self.detail = "FAIL", detail
        self.evidence.update(evidence)
        return self

    def blocked(self, detail: str) -> "Probe":
        """Could not be run. Distinct from FAIL: absence of evidence."""
        self.verdict, self.detail = "BLOCKED", detail
        return self


class HangError(Exception):
    """The process exceeded its wall clock and had to be killed."""


def wine_path(p: str | Path) -> str:
    """Convert a POSIX path to the Wine drive form the engine actually parses.

    Measured 2026-09-19: passing a native path such as /home/x/images makes the
    engine strip the leading slash and treat the rest as a COMMAND --
    "An unknown command \'home/x/images\'. Is it a feature request or a typo?"
    The run then never reaches -quit and idles forever with no output. That is
    almost certainly what third-party reports of "headless hangs indefinitely"
    actually were. Epic\'s own Linux example uses Z:\\ paths; nothing warns you.
    """
    # abspath, not resolve: resolve() follows symlinks, which rewrites the
    # path out from under the caller (on macOS /home -> /System/Volumes/Data/home).
    return "Z:" + os.path.abspath(str(p)).replace("/", "\\")


def build_command(rs: str, args: list[str]) -> list[str]:
    """Assemble an invocation, refusing to omit the error-propagation flag.

    The refusal is the point. `appQuitOnError=true` is easy to leave out and
    its absence is invisible until a failed job is reported as a success.

    -stdConsole is equally non-optional here: without it the engine writes
    NOTHING to stdout, so a failing run looks identical to a silent one.
    """
    if "-headless" not in args:
        args = ["-headless", *args]
    if "-stdConsole" not in args:
        args = ["-stdConsole", *args]
    cmd = [rs, *QUIT_ON_ERROR, *args]
    if "appQuitOnError=true" not in cmd:
        raise AssertionError("refusing to invoke without appQuitOnError=true")
    return cmd


def run_watched(cmd: list[str], timeout: int, env: dict | None = None) -> tuple[int, float, str]:
    """Run to completion or kill the whole process group. Never wait forever.

    Returns (exit_code, seconds, output). Raises HangError on timeout -- the
    caller must not be able to mistake a hang for a slow success.
    """
    started = time.monotonic()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,      # so we can kill children too
        env=env,
    )
    try:
        out, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        # Kill the group: RealityScan spawns helpers, and orphans hold the GPU.
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            proc.kill()
        proc.wait(timeout=30)
        raise HangError(f"exceeded {timeout}s")
    text = (out or b"").decode("utf-8", "replace")
    return proc.returncode, time.monotonic() - started, text


def unusable_environment(code: int, out: str) -> str | None:
    """Distinguish "our setup is not ready" from "the engine failed".

    Both previously surfaced as exit 4, and the probe called both FAIL. One of
    them is BLOCKED -- absence of evidence -- and conflating them produced a
    confident NO-GO from a run that never started.
    """
    if INIT_FAILURE in out:
        return ("engine could not initialize graphics (DXGI_ERROR_UNSUPPORTED). "
                "DISPLAY must point at a working X server, e.g. Xvfb")
    if code == 4 and not out.strip():
        return ("engine exited 4 with no output at all -- it did not start. "
                "Check DISPLAY, and check for a blocking sign-in dialog "
                "(xwininfo -root -tree shows a MessageOverlay window)")
    if "unknown command" in out.lower():
        return ("the engine parsed an argument as a command -- a path was very "
                "likely passed in POSIX form instead of Z:\\ form")
    return None


def read_mesh_faces(path: Path) -> int | None:
    """Open an exported mesh with a reader that did not write it.

    Returns face count, or None if no independent reader is installed. None is
    reported honestly as BLOCKED rather than being allowed to look like a pass.
    """
    try:
        import trimesh  # type: ignore
    except ImportError:
        return None
    try:
        loaded = trimesh.load(str(path), force="mesh")
        return int(len(loaded.faces))
    except Exception:
        return 0


def headless_env() -> dict:
    """An environment with no *real* display, but with a virtual framebuffer.

    The first version of this stripped DISPLAY entirely. That tested the wrong
    thing: Wine\'s DXGI cannot enumerate adapters with no X connection at all,
    so every run died in ~5s with "application initialization failed with code
    0x887a0004" (DXGI_ERROR_UNSUPPORTED) before doing any work -- and the probe
    read that as the engine failing rather than as its own environment being
    unready.

    What production actually looks like is an SSH-only host with a virtual
    framebuffer, not a host with no X server at compiled-in. So DISPLAY is kept
    and must point at an Xvfb; a real desktop session is still excluded because
    WAYLAND_DISPLAY and XAUTHORITY are dropped.
    """
    env = dict(os.environ)
    for key in ("WAYLAND_DISPLAY", "XAUTHORITY"):
        env.pop(key, None)
    return env


def display_is_virtual() -> str | None:
    """Return a reason the display is unusable, or None if it looks fine."""
    disp = os.environ.get("DISPLAY")
    if not disp:
        return ("DISPLAY is unset. Wine\'s DXGI needs an X connection even "
                "headless; start one with: Xvfb :77 -screen 0 1280x1024x24 -ac "
                "and re-run with DISPLAY=:77")
    return None


INIT_FAILURE = "0x887a0004"   # DXGI_ERROR_UNSUPPORTED -- no usable display


def probe_headless_align(rs: str, images: Path, work: Path) -> Probe:
    """T1.1 -- does anything at all run with no display server?"""
    p = Probe("T1.1 headless alignment", "A1", "S1")
    project = work / "t11.rsproj"
    cmd = build_command(rs, [
        "-newScene",
        "-addFolder", wine_path(images),
        "-align",
        "-save", wine_path(project),
        "-quit",
    ])
    try:
        code, secs, out = run_watched(cmd, TIMEOUT_ALIGN, env=headless_env())
    except HangError as exc:
        return p.failed(f"hung: {exc}", hang=True)
    p.seconds = secs
    blocked = unusable_environment(code, out)
    if blocked:
        return p.blocked(blocked)
    if code != 0:
        return p.failed(f"exit {code}", exit_code=code)
    if not project.exists():
        return p.failed("exit 0 but no project written", exit_code=0)
    return p.passed(f"aligned in {secs:.0f}s", exit_code=0)


def probe_headless_model(rs: str, images: Path, work: Path, repeats: int = 10) -> Probe:
    """T1.2 -- reconstruction, the reported failure point, run repeatedly.

    Repeats because the reported hang is intermittent. One pass is not proof,
    so the verdict is the worst outcome across runs, not the best.
    """
    p = Probe(f"T1.2 headless reconstruction x{repeats}", "A1,F3", "S1")
    outcomes: list[str] = []
    for i in range(repeats):
        run_dir = work / f"t12_{i}"
        run_dir.mkdir(parents=True, exist_ok=True)
        mesh = run_dir / "model.obj"
        # Order matters and is Epic's own, from the Linux CLI example: select the
        # component first, then bound it, then reconstruct. Reconstructing before
        # selecting leaves "which component?" unanswered -- the reported cause of
        # the misleading "No model is selected".
        cmd = build_command(rs, [
            "-newScene",
            "-addFolder", wine_path(images),
            "-align",
            "-selectMaximalComponent",
            "-setReconstructionRegionAuto",
            "-calculateNormalModel",
            "-exportSelectedModel", wine_path(mesh),
            "-quit",
        ])
        try:
            code, secs, out = run_watched(cmd, TIMEOUT_MODEL, env=headless_env())
        except HangError:
            outcomes.append("hang")
            continue
        p.seconds += secs
        if unusable_environment(code, out):
            outcomes.append("blocked")
            continue
        if code != 0:
            outcomes.append(f"exit{code}")
            continue
        faces = read_mesh_faces(mesh)
        if faces is None:
            outcomes.append("unverified")   # no independent reader available
        elif faces == 0:
            outcomes.append("empty")        # the clean-exit-empty-output case
        else:
            outcomes.append("ok")

    p.evidence["outcomes"] = outcomes
    if "hang" in outcomes:
        return p.failed(f"hung in {outcomes.count('hang')}/{repeats} runs")
    if "empty" in outcomes:
        return p.failed("exited 0 having written an empty mesh")
    if any(o.startswith("exit") for o in outcomes):
        return p.failed(f"non-zero exits: {outcomes}")
    if "blocked" in outcomes:
        return p.blocked(unusable_environment(4, "") or "environment not ready")
    if "unverified" in outcomes:
        return p.blocked("no independent mesh reader installed; install trimesh")
    return p.passed(f"{repeats}/{repeats} produced a readable mesh")


def probe_failure_is_visible(rs: str, images: Path, work: Path) -> Probe:
    """T1.6 -- is a broken run distinguishable from a good one?

    The gate this serves is critical because the alternative is a pipeline that
    cannot tell the two apart, which is the failure this repository has already
    measured once.
    """
    p = Probe("T1.6 failure distinguishable", "A6", "S1")
    broken = work / "broken-images"
    broken.mkdir(parents=True, exist_ok=True)
    sources = sorted(images.glob("*"))[:20]
    if not sources:
        return p.blocked("no source images")
    for i, src in enumerate(sources):
        dst = broken / src.name
        data = src.read_bytes()
        # Truncate half of them mid-file: readable header, unusable payload.
        dst.write_bytes(data[: len(data) // 3] if i % 2 == 0 else data)

    cmd = build_command(rs, ["-addFolder", wine_path(broken), "-align", "-quit"])
    try:
        code, secs, out = run_watched(cmd, TIMEOUT_ALIGN, env=headless_env())
    except HangError as exc:
        return p.failed(f"hung on corrupt input: {exc}", hang=True)
    p.seconds = secs
    blocked = unusable_environment(code, out)
    if blocked:
        # Critical: without this, a broken environment makes THIS probe "pass",
        # because a refusal to start is also a non-zero exit. A pass for the
        # wrong reason is worse than a failure.
        return p.blocked(blocked)
    if code == 0:
        return p.failed(
            "exited 0 on deliberately corrupt input -- failure is not "
            "detectable from exit state alone",
            exit_code=0,
        )
    return p.passed(f"corrupt input surfaced as exit {code}", exit_code=code)


def verdict(probes: list[Probe]) -> str:
    """Any S1 failure is NO-GO on its own. That is what critical means."""
    if any(p.verdict == "FAIL" and p.severity == "S1" for p in probes):
        return "NO-GO"
    if any(p.verdict in ("BLOCKED", "NOT RUN") for p in probes):
        return "INCOMPLETE"
    if any(p.verdict == "FAIL" for p in probes):
        return "CONDITIONAL GO"
    return "GO (tier 1 only)"


def report(probes: list[Probe]) -> dict:
    return {
        "tier": 1,
        "verdict": verdict(probes),
        "note": (
            "Tier 1 establishes only that RealityScan can run unattended. "
            "It says nothing about output quality, accuracy, licensing or "
            "scale -- those are tiers 2-4."
        ),
        "probes": [asdict(p) for p in probes],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--images", type=Path, help="directory of source images")
    ap.add_argument("--workdir", type=Path, help="scratch directory")
    ap.add_argument("--rs", default=os.environ.get("REALITYSCAN_BIN", "RealityScan"))
    ap.add_argument("--repeats", type=int, default=10)
    ap.add_argument("--out", type=Path, help="write the JSON report here")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

    if not args.images or not args.workdir:
        ap.error("--images and --workdir are required unless --selftest")

    rs = shutil.which(args.rs) or args.rs
    if not Path(rs).exists() and not shutil.which(args.rs):
        # Say so plainly rather than emitting a green report nobody earned.
        print(
            f"RealityScan not found as {args.rs!r}.\n"
            "This probe measures a real engine; it does not simulate one.\n"
            "Set --rs or REALITYSCAN_BIN, or run --selftest to check this "
            "script's own logic.",
            file=sys.stderr,
        )
        return 2

    args.workdir.mkdir(parents=True, exist_ok=True)
    probes = [
        probe_headless_align(rs, args.images, args.workdir),
        probe_headless_model(rs, args.images, args.workdir, args.repeats),
        probe_failure_is_visible(rs, args.images, args.workdir),
    ]
    result = report(probes)
    text = json.dumps(result, indent=2)
    if args.out:
        args.out.write_text(text)
    print(text)
    return 0 if result["verdict"].startswith("GO") else 1


def selftest() -> int:
    """Exercise this script's own logic with no engine present.

    Covers the three things that would silently invalidate a real run: the
    refusal to omit appQuitOnError, the watchdog actually killing a hang, and
    an S1 failure forcing NO-GO regardless of the other results.
    """
    failures: list[str] = []

    cmd = build_command("/bin/true", ["-align"])
    if "appQuitOnError=true" not in cmd:
        failures.append("build_command dropped appQuitOnError")
    if "-headless" not in cmd:
        failures.append("build_command dropped -headless")

    # The watchdog must kill a hang rather than waiting on it.
    started = time.monotonic()
    try:
        run_watched(["/bin/sh", "-c", "sleep 60"], timeout=2)
        failures.append("watchdog did not fire on a hang")
    except HangError:
        if time.monotonic() - started > 30:
            failures.append("watchdog fired far too late")

    # A clean exit still runs to completion normally.
    code, _, _ = run_watched(["/bin/sh", "-c", "exit 7"], timeout=10)
    if code != 7:
        failures.append(f"exit code not propagated: got {code}")

    # -stdConsole is as load-bearing as appQuitOnError: without it the engine
    # writes nothing to stdout and a failure is indistinguishable from silence.
    if "-stdConsole" not in cmd:
        failures.append("build_command dropped -stdConsole")

    # Paths must reach the engine in Wine form, or they parse as commands.
    if wine_path("/home/x/images") != "Z:\\home\\x\\images":
        failures.append(f"wine_path is wrong: {wine_path('/home/x/images')}")

    # A refusal to start must read as BLOCKED, never as FAIL or PASS. This is
    # the bug that produced a confident NO-GO from runs that never started.
    if unusable_environment(4, "") is None:
        failures.append("exit 4 with no output was not recognised as blocked")
    if unusable_environment(4, "application initialization failed with code 0x887a0004") is None:
        failures.append("DXGI init failure was not recognised as blocked")
    if unusable_environment(0, "Reconstruction completed in 5s") is not None:
        failures.append("a healthy run was misreported as blocked")

    # One S1 failure must force NO-GO even when everything else passes.
    good = Probe("ok", "A1", "S1").passed()
    bad = Probe("bad", "A1", "S1").failed("hung")
    if verdict([good, bad]) != "NO-GO":
        failures.append("an S1 failure did not force NO-GO")
    if verdict([good]) != "GO (tier 1 only)":
        failures.append("all-pass did not yield GO")
    if verdict([good, Probe("b", "A1", "S1").blocked("x")]) != "INCOMPLETE":
        failures.append("a blocked probe did not yield INCOMPLETE")

    # A blocked probe must never read as a pass.
    if Probe("x", "A1", "S1").blocked("no reader").verdict == "PASS":
        failures.append("blocked probe reported as PASS")

    if failures:
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1
    print("selftest: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
