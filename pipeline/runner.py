#!/usr/bin/env python3
"""The Runner: executes a Manifest, one Node at a time, in order.

Delegates rather than schedules (ADR 0006 revision): it sequences Nodes and
moves artifacts between them; it does not queue, retry, or manage jobs of its
own. A Node's outputs become the absolute paths substituted into the next
Node's command (see manifest.py's docstring for the `{in.x}` / `{out.x}`
placeholders).

Per-Node status is written to `<workdir>/state.json` after every Node, so a
run interrupted by a crash or a failed Node resumes from the first incomplete
Node on the next `run` rather than restarting (the reason ADR 0006 gives for
owning a Runner at all). A Node's exit code is never softened: a non-zero
exit stops the run immediately and becomes the Runner's own exit code.

Only one run may be in progress at a time, system-wide (#12), enforced by a
lock file rather than a queue -- there is no concurrency model to build.

    python3 runner.py MANIFEST.json --workdir RUN_DIR
    python3 runner.py --selftest
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import types
from pathlib import Path

from manifest import ManifestError, load as load_manifest

LOCK_PATH = Path(__file__).resolve().parent / ".runner.lock"


class LockedError(Exception):
    pass


def acquire_lock(lock_path: Path = LOCK_PATH) -> None:
    """One job at a time (#12): refuse to start a second run."""
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        pid = lock_path.read_text().strip() if lock_path.exists() else "?"
        if pid.isdigit() and _pid_alive(int(pid)):
            raise LockedError(f"another run is in progress (pid {pid}, lock {lock_path})")
        lock_path.unlink(missing_ok=True)  # stale: the owning process is gone
        return acquire_lock(lock_path)
    else:
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)


def release_lock(lock_path: Path = LOCK_PATH) -> None:
    lock_path.unlink(missing_ok=True)


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def node_dir(workdir: Path, name: str) -> Path:
    return workdir / "nodes" / name


def resolve_paths(
    workdir: Path, node: dict, nodes_by_name: dict, pipeline_inputs: dict | None = None
) -> tuple[types.SimpleNamespace, types.SimpleNamespace]:
    """Absolute paths for {in.x} / {out.x}: deterministic from workdir + names, never stored.

    A Pipeline's own inputs are workdir-relative (they come from outside the
    graph); a Node's inputs resolve from the Node that produces them.
    """
    out = {key: str(node_dir(workdir, node["name"]) / rel) for key, rel in node.get("outputs", {}).items()}
    inp = {key: str(Path(workdir) / rel) for key, rel in (pipeline_inputs or {}).items()}
    for key, ref in node.get("inputs", {}).items():
        producer = nodes_by_name[ref["node"]]
        inp[key] = str(node_dir(workdir, producer["name"]) / producer["outputs"][ref["output"]])
    return types.SimpleNamespace(**inp), types.SimpleNamespace(**out)


def manifest_hash(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def load_state(workdir: Path) -> dict:
    path = workdir / "state.json"
    return json.loads(path.read_text()) if path.exists() else {}


def get_execution_context(data: dict) -> dict:
    """Return a minimal execution context derived from a Manifest.

    The context is exposed to node processes via the EXECUTION_CONTEXT
    environment variable. Nodes can read this to implement decisions that
    depend on manifest-level facts (e.g., ground_control_points).
    """
    return {"ground_control_points": data.get("ground_control_points")}


def save_state(workdir: Path, state: dict) -> None:
    (workdir / "state.json").write_text(json.dumps(state, indent=1))


# Another project's containers share this GPU and pin an embedding model to it
# with keep_alive=-1, leaving under 5 GiB of 12 GiB for Fitting (#40). Ollama
# reloads a model on its next request, so unloading before a run costs that
# project one cold start and costs us nothing. Best effort by design: a host
# without the container, or without Docker, is not an error here.
OLLAMA_CONTAINER = os.environ.get("RUNNER_OLLAMA_CONTAINER", "sme_ollama")


def loaded_ollama_models(listing: str) -> list[str]:
    """Model names from `ollama ps` output, header and blank lines dropped."""
    names = []
    for line in listing.splitlines()[1:]:
        fields = line.split()
        if fields and fields[0] != "NAME":
            names.append(fields[0])
    return names


def free_gpu_memory(container: str = OLLAMA_CONTAINER) -> list[str]:
    """Unload every model Ollama holds on the GPU. Returns what was unloaded."""
    def ollama(*args: str) -> subprocess.CompletedProcess | None:
        try:
            return subprocess.run(
                ["docker", "exec", container, "ollama", *args],
                capture_output=True, text=True, timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            return None

    listing = ollama("ps")
    if listing is None or listing.returncode != 0:
        return []
    unloaded = []
    for model in loaded_ollama_models(listing.stdout):
        stopped = ollama("stop", model)
        if stopped is not None and stopped.returncode == 0:
            unloaded.append(model)
    return unloaded


def run(manifest_path: Path, workdir: Path) -> None:
    """Run every Node in order; resume past ones already marked done."""
    data = load_manifest(manifest_path)
    workdir.mkdir(parents=True, exist_ok=True)
    nodes_by_name = {n["name"]: n for n in data["nodes"]}

    state = load_state(workdir)
    digest = manifest_hash(data)
    if state.get("manifest_hash") != digest:
        if state:
            print(f"Manifest changed since the last run in {workdir}; starting over.", file=sys.stderr)
        state = {"manifest_hash": digest, "nodes": {}}

    acquire_lock()
    try:
        unloaded = free_gpu_memory()
        if unloaded:
            print(f"freed GPU memory: unloaded {', '.join(unloaded)}")

        execution_context = get_execution_context(data)
        for node in data["nodes"]:
            name = node["name"]
            if state["nodes"].get(name, {}).get("status") == "done":
                print(f"skip {name} (already done)")
                continue

            node_dir(workdir, name).mkdir(parents=True, exist_ok=True)
            inp, out = resolve_paths(workdir, node, nodes_by_name, data.get("inputs"))
            # A Manifest that formats badly says which Node and what it had to work with.
            try:
                command = [arg.format(**{"in": inp, "out": out}) for arg in node["command"]]
            except Exception as e:
                raise ManifestError(
                    f"node '{name}': error formatting command arguments: {e}; inputs={inp}, outputs={out}"
                ) from e
            # ADR 0014's remote rungs are parked: refuse them rather than run them here.
            placement = node.get("placement", "local")
            if placement != "local":
                raise ManifestError(
                    f"node '{name}': unsupported placement '{placement}'; Runner only supports 'local' placement"
                )
            # A Manifest declares the environment a Node needs; the Runner puts it
            # there rather than each Node inventing an environment variable name.
            node_env = {k: str(v) for k, v in node.get("env", {}).items()}
            if "image" in node:
                docker_env: list[str] = []
                for key in sorted(node_env):
                    docker_env += ["-e", f"{key}={node_env[key]}"]
                # A Node that declares it needs the card gets it passed through.
                docker_prefix = ["docker", "run", "--rm"]
                if node.get("gpu"):
                    docker_prefix += ["--gpus", "all"]
                command = docker_prefix + [*docker_env, "-v", f"{workdir}:{workdir}", node["image"], *command]

            # Remove this Node's declared outputs first, so "it exists" after the
            # run means this run wrote it: a stale file from an earlier Manifest
            # in the same workdir would otherwise let a silent Node pass.
            #
            # One exception, declared rather than lucky (#105): a Node marked
            # "resumable", retried after its last attempt in this workdir stopped
            # -- failed, or cut off by a crash or a reboot -- keeps its declared
            # directories, because that is where it keeps its progress, and hours
            # of Fitting are not thrown away on the retry. Declared files are
            # still swept, so the finished product is always this attempt's. An
            # earlier Manifest never counts: a changed Manifest resets the state,
            # so its outputs are swept as before (#83).
            resuming = node.get("resumable", False) and \
                state["nodes"].get(name, {}).get("status") in ("running", "failed")
            if resuming:
                print(f"resume {name}: its last attempt stopped; it is resumable, so its declared "
                      f"directories are kept for it to continue from")
            for declared in out.__dict__.values():
                stale = Path(declared)
                if stale.is_dir():
                    if not resuming:
                        shutil.rmtree(stale)
                elif stale.exists():
                    stale.unlink()
            # Recorded before it starts, so an attempt cut off by a crash is known
            # as one: without this, a reboot left no trace and the retry swept
            # everything the attempt had written.
            state["nodes"][name] = {"status": "running"}
            save_state(workdir, state)

            print(f"run {name}: {' '.join(command)}")
            # EXECUTION_CONTEXT carries the Manifest's own facts (was there ground
            # control?); NODE_ROOT is the Node's own directory, so a Node can write
            # intermediates somewhere cleanup_paths can name.
            env = {
                **os.environ,
                **node_env,
                "EXECUTION_CONTEXT": json.dumps(execution_context),
                "NODE_ROOT": str(node_dir(workdir, name)),
            }
            result = subprocess.run(command, env=env)

            if result.returncode != 0:
                state["nodes"][name] = {"status": "failed", "returncode": result.returncode}
                save_state(workdir, state)
                print(f"{name} failed (exit {result.returncode}); run stopped.", file=sys.stderr)
                sys.exit(result.returncode)  # the exit code is final, never softened

            # A Node that declares an output and writes nothing is a failure, not
            # a success: the next Node would read a path that is not there.
            missing = [key for key, path in out.__dict__.items() if not Path(path).exists()]
            if missing:
                state["nodes"][name] = {"status": "failed", "missing_outputs": sorted(missing)}
                save_state(workdir, state)
                print(f"{name} declared outputs it never wrote: {', '.join(sorted(missing))}; run stopped.", file=sys.stderr)
                sys.exit(1)

            state["nodes"][name] = {"status": "done", "returncode": 0}
            # Declarative per-node cleanup after a successful run
            for rel_path in node.get("cleanup_paths", []):
                if not isinstance(rel_path, str) or not rel_path:
                    continue
                target = Path(rel_path)
                # Must cleanup only inside the current node's workdir
                if not target.is_absolute():
                    target = node_dir(workdir, name) / target
                # Guard: ensure the cleanup target is inside the node's directory
                node_root = (node_dir(workdir, name)).resolve()
                try:
                    relative = target.resolve().relative_to(node_root)
                except Exception:
                    # Outside of node workdir; skip to be safe
                    continue
                # Do not cleanup declared outputs
                declared_outputs = [node_dir(workdir, name) / rel for rel in node.get("outputs", {}).values()]
                if any(target.resolve() == p.resolve() for p in declared_outputs):
                    continue
                if target.exists():
                    if target.is_dir():
                        shutil.rmtree(target, ignore_errors=True)
                    else:
                        try:
                            target.unlink()
                        except FileNotFoundError:
                            pass
            save_state(workdir, state)
    finally:
        release_lock()

    print(f"pipeline '{data['pipeline']}' complete.")


# --- self-check -------------------------------------------------------

def _write(path: Path, data: dict) -> Path:
    path.write_text(json.dumps(data))
    return path


def _selftest() -> None:
    import tempfile

    py = sys.executable

    # 1. Schema rejects malformed Manifests.
    from manifest import validate
    assert validate({"pipeline": "x", "nodes": []}), "empty nodes list should be rejected"
    assert validate({"nodes": [{"name": "a", "command": ["x"]}]}), "missing pipeline name should be rejected"
    assert validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["x"]}, {"name": "a", "command": ["y"]}]}), "duplicate names should be rejected"
    assert validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["x"], "inputs": {"z": {"node": "nope", "output": "o"}}}]}), "unknown input reference should be rejected"
    assert validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["x"], "typo": 1}]}), "an unknown node key should be rejected"
    assert validate({"pipeline": "x", "extra": 1, "nodes": [{"name": "a", "command": ["x"]}]}), "an unknown top-level key should be rejected"
    assert validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["echo", "{in.nope}"]}]}), "an undeclared placeholder should be rejected"
    assert validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["echo", "{in.a.b}"]}]}), "a malformed placeholder should be rejected"
    assert not validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["x"]}]}), "a well-formed Manifest should pass"

    # A placeholder that reaches inside another Node's output directory is the
    # seam #93 removed; the fixture Manifest exists to be refused.
    invalid = Path(__file__).resolve().parent / "manifests" / "orthomosaic-invalid.json"
    assert invalid.is_file(), f"missing fixture {invalid}"
    try:
        load_manifest(invalid)
        raise AssertionError("a {in.x}/<file> reference should have been rejected")
    except ManifestError as error:
        assert "interior file references" in str(error), str(error)

    # N. GPU unload reads `ollama ps` without mistaking its header for a model.
    from runner import loaded_ollama_models
    assert loaded_ollama_models("NAME    ID    SIZE    PROCESSOR    CONTEXT    UNTIL\n") == [], "an empty listing holds no models"
    assert loaded_ollama_models(
        "NAME                  ID              SIZE      PROCESSOR    CONTEXT    UNTIL\n"
        "qwen3-embedding:8b    64b933495768    6.2 GB    100% GPU     4096       Forever\n"
    ) == ["qwen3-embedding:8b"], "a loaded model should be named"
    assert free_gpu_memory("no-such-container-xyzzy") == [], "a missing container is not an error"

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        # M5 selftest: placement fail-loud (non-local placement should error fast)
        placemute = _write(tmp / "M5_placemute.json", {
            "pipeline": "M5-placemute",
            "nodes": [
                {
                    "name": "n",
                    "placement": "remote-3090",
                    "command": ["echo", "placemute"]
                }
            ],
        })
        try:
            run(placemute, tmp / "run-placemute")
            raise AssertionError("a non-local placement should have stopped the run")
        except ManifestError as error:
            assert "remote-3090" in str(error), str(error)

        # M5 selftest: gpu flag injection (ensure gpu key is accepted by manifest)
        gpu_ok = _write(tmp / "M5_gpu.json", {
            "pipeline": "M5-gpu-test",
            "nodes": [
                {
                    "name": "n",
                    "placement": "local",
                    "image": "alpine",
                    "gpu": True,
                    "command": ["echo", "gpu-test"]
                }
            ],
        })
        m = load_manifest(gpu_ok)
        assert m["nodes"][0]["gpu"] is True
        print("selftest M5 gpu-flag-injection: loaded and accepted")

        # M5 selftest: format-error envelope (unbalanced brace should raise formatting error)
        envelope_err = _write(tmp / "M5_format_error.json", {
            "pipeline": "M5-format-error",
            "nodes": [
                {
                    "name": "n",
                    "placement": "local",
                    "command": ["bash", "-lc", "echo {in.missing"]
                }
            ],
        })
        try:
            run(envelope_err, tmp / "run-format-error")
            raise AssertionError("M5 format-error envelope should have raised ManifestError")
        except ManifestError:
            print("selftest M5 format-error envelope: fired")

        # 5. Per-node cleanup fixture test: ensure declared cleanup path is removed and an undeclared file survives.
        cleanup_fixture = _write(tmp / "cleanup_fixture.json", {
            "pipeline": "cleanup-test",
            "nodes": [
                {
                    "name": "produce",
                    "command": [
                        "python3", "-c",
                        "import os, pathlib; root=os.environ['NODE_ROOT']; (pathlib.Path(root)/'data.txt').write_text('data'); (pathlib.Path(root)/'build'/'intermediate').mkdir(parents=True, exist_ok=True); (pathlib.Path(root)/'build'/'intermediate'/'cleanup_me.txt').write_text('x'); (pathlib.Path(root)/'stay.txt').write_text('keep')"
                    ],
                    "outputs": {"data": "data.txt"},
                    "cleanup_paths": ["build/intermediate"]
                },
                {
                    "name": "consume",
                    "command": [
                        "python3", "-c",
                        "import pathlib,os; root=os.environ['NODE_ROOT']; (pathlib.Path(root)/'result.txt').write_text('ok')"
                    ],
                    "outputs": {"result": "result.txt"}
                }
            ],
        })
        run(cleanup_fixture, tmp / "run-cleanup")
        # Validate cleanup: intermediate dir should be removed; undeclared stay.txt survives.
        produced = tmp / "run-cleanup" / "nodes" / "produce"
        assert not (produced / "build" / "intermediate" / "cleanup_me.txt").exists(), (produced / "build" / "intermediate" / "cleanup_me.txt")
        assert (produced / "stay.txt").exists(), (produced / "stay.txt").exists()

        # 2. Nodes run in order, outputs wired into the next Node's inputs.
        wired = _write(tmp / "wired.json", {
            "pipeline": "wiring-check",
            "nodes": [
                {
                    "name": "produce",
                    "command": [py, "-c", "import sys,pathlib; pathlib.Path(sys.argv[1]).write_text('hello')", "{out.data}"],
                    "outputs": {"data": "data.txt"},
                },
                {
                    "name": "consume",
                    "command": [py, "-c", "import sys,pathlib; pathlib.Path(sys.argv[2]).write_text(pathlib.Path(sys.argv[1]).read_text().upper())", "{in.data}", "{out.result}"],
                    "inputs": {"data": {"node": "produce", "output": "data"}},
                    "outputs": {"result": "result.txt"},
                },
            ],
        })
        run(wired, tmp / "run1")
        assert (tmp / "run1" / "nodes" / "consume" / "result.txt").read_text() == "HELLO"

        # 3 & 4. A failing Node stops the run with its own exit code, never softened;
        #        a completed Node is skipped on resume; a Node gated on the failure
        #        never runs until the run actually proceeds past it.
        gate = tmp / "gate"  # absent => step2 fails; created between the two runs
        counter = tmp / "counter"
        done_marker = tmp / "done"
        resumable = _write(tmp / "resumable.json", {
            "pipeline": "resume-check",
            "nodes": [
                {
                    "name": "step1",
                    "command": [py, "-c",
                                "import sys,pathlib; p=pathlib.Path(sys.argv[1]); p.write_text(str(int(p.read_text() or 0) + 1)) if p.exists() else p.write_text('1')",
                                str(counter)],
                },
                {
                    "name": "step2",
                    "command": [py, "-c",
                                "import sys,pathlib; sys.exit(0 if pathlib.Path(sys.argv[1]).exists() else 5)",
                                str(gate)],
                },
                {
                    "name": "step3",
                    "command": [py, "-c", "import sys,pathlib; pathlib.Path(sys.argv[1]).touch()", str(done_marker)],
                },
            ],
        })
        # 3b. A Node that declares an output and writes nothing fails the stage.
        quiet = _write(tmp / "quiet.json", {
            "pipeline": "quiet-check",
            "nodes": [{"name": "quiet", "command": [py, "-c", "pass"], "outputs": {"out": "never.txt"}}],
        })
        try:
            run(quiet, tmp / "run-quiet")
            raise AssertionError("a Node that never wrote its declared output should have failed")
        except SystemExit as e:
            assert e.code != 0, "missing declared output must exit non-zero"
        state = json.loads((tmp / "run-quiet" / "state.json").read_text())
        assert state["nodes"]["quiet"]["status"] == "failed", state
        assert "missing_outputs" in state["nodes"]["quiet"], state

        run_dir = tmp / "run2"
        try:
            run(resumable, run_dir)
        except SystemExit as e:
            assert e.code == 5, f"expected step2's own exit code 5, got {e.code}"
        else:
            raise AssertionError("a failing Node should have stopped the run")
        assert counter.read_text() == "1"
        assert not done_marker.exists(), "step3 must not run once step2 failed"
        state = load_state(run_dir)
        assert state["nodes"]["step1"]["status"] == "done"
        assert state["nodes"]["step2"]["status"] == "failed"

        gate.touch()
        run(resumable, run_dir)  # resume: step1 must be skipped, not re-run
        assert counter.read_text() == "1", "a completed Node re-ran on resume"
        assert done_marker.exists(), "step3 should run once step2 passes"

        # 5. A resumable Node keeps its progress across a retry; nothing else does
        #    (#105). The Node appends a line to progress.txt in its declared
        #    directory each attempt, writes its declared file, and fails until the
        #    gate exists -- so the line count is how many attempts' work survived.
        def fitting(name: str, resumable: bool, gate_path: Path) -> Path:
            node = {
                "name": "fit",
                "command": [py, "-c",
                            "import sys,pathlib; d=pathlib.Path(sys.argv[1]); d.mkdir(exist_ok=True); "
                            "f=pathlib.Path(sys.argv[2]); fresh='fresh' if not f.exists() else 'left over'; "
                            "open(d/'progress.txt','a').write(fresh+'\\n'); f.write_text('x'); "
                            "sys.exit(0 if pathlib.Path(sys.argv[3]).exists() else 7)",
                            "{out.ckpt}", "{out.final}", str(gate_path)],
                "outputs": {"ckpt": "ckpt", "final": "final.txt"},
            }
            if resumable:
                node["resumable"] = True
            return _write(tmp / f"{name}.json", {"pipeline": name, "nodes": [node]})

        def attempts(manifest: Path, run_dir: Path, gate_path: Path) -> list[str]:
            gate_path.unlink(missing_ok=True)
            try:
                run(manifest, run_dir)
            except SystemExit as e:
                assert e.code == 7, e.code
            gate_path.touch()
            run(manifest, run_dir)
            return (run_dir / "nodes" / "fit" / "ckpt" / "progress.txt").read_text().splitlines()

        g = tmp / "fit-gate"
        assert attempts(fitting("resumes", True, g), tmp / "run-res", g) == ["fresh", "fresh"], \
            "a resumable Node's progress was swept on the retry, or its declared file was left over"
        assert attempts(fitting("restarts", False, g), tmp / "run-nores", g) == ["fresh"], \
            "a Node that is not resumable must start clean on a retry"

        # A crash leaves no "failed" -- the Runner itself is gone -- and must still
        # count as an attempt that stopped: the reboot #40's overnight runs face.
        # The Node kills the Runner that started it, mid-attempt, for real.
        crash_manifest = _write(tmp / "crash.json", {"pipeline": "crash", "nodes": [{
            "name": "fit",
            "resumable": True,
            "command": [py, "-c",
                        "import os,sys,signal,pathlib; d=pathlib.Path(sys.argv[1]); d.mkdir(exist_ok=True); "
                        "open(d/'progress.txt','a').write('step\\n'); pathlib.Path(sys.argv[2]).write_text('x'); "
                        "pathlib.Path(sys.argv[3]).exists() or os.kill(os.getppid(), signal.SIGKILL)",
                        "{out.ckpt}", "{out.final}", str(g)],
            "outputs": {"ckpt": "ckpt", "final": "final.txt"},
        }]})
        crash_dir = tmp / "run-crash"
        g.unlink(missing_ok=True)
        killed = subprocess.run([py, str(Path(__file__).resolve()), str(crash_manifest), "--workdir", str(crash_dir)],
                                capture_output=True, text=True)
        assert killed.returncode == -9, f"the Runner was meant to be killed: {killed.returncode} {killed.stderr}"
        assert load_state(crash_dir)["nodes"]["fit"]["status"] == "running", \
            "a Runner killed mid-attempt left no trace of the attempt"
        g.touch()
        run(crash_manifest, crash_dir)
        lines = (crash_dir / "nodes" / "fit" / "ckpt" / "progress.txt").read_text().splitlines()
        assert lines == ["step", "step"], f"an attempt cut off by a crash lost its progress: {lines}"

        # A different Manifest never resumes from this one's leftovers (#83).
        changed = crash_manifest
        data = json.loads(changed.read_text())
        data["nodes"][0]["notes"] = "changed"
        changed.write_text(json.dumps(data))
        state = load_state(crash_dir)
        state["nodes"]["fit"] = {"status": "failed"}
        save_state(crash_dir, state)
        run(changed, crash_dir)
        lines = (crash_dir / "nodes" / "fit" / "ckpt" / "progress.txt").read_text().splitlines()
        assert lines == ["step"], f"a changed Manifest resumed from an earlier one's output: {lines}"
        assert validate({"pipeline": "x", "nodes": [{"name": "a", "command": ["x"], "resumable": "yes"}]}), \
            "'resumable' must be a boolean"

        # Lock: a run cannot start while another is already flagged in progress.
        acquire_lock()
        try:
            try:
                acquire_lock()
            except LockedError:
                pass
            else:
                raise AssertionError("a second concurrent run should have been refused")
        finally:
            release_lock()

    print("runner self-check: ok")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("manifest", nargs="?", type=Path, help="the Manifest to run")
    p.add_argument("--workdir", type=Path, default=Path("run"), help="where Node outputs and state.json live")
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    args = p.parse_args()

    if args.selftest:
        _selftest()
        return
    if not args.manifest:
        sys.exit("name a Manifest to run")

    try:
        run(args.manifest, args.workdir)
    except (ManifestError, LockedError) as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
