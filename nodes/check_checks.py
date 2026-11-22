#!/usr/bin/env python3
"""Offline check for recon-core checks.json emission (ADR 0018, M3).

No GPU/network. Asserts the three gate nodes expose node_checks() and that
common.emit_checks writes files recon_core.checks.read_checks accepts.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

NODES = Path(__file__).resolve().parent
REPO = NODES.parent
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def load(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


sys.path.insert(0, str(NODES))
sys.path.insert(0, str(REPO))
from common import emit_checks  # noqa: E402
from recon_core.checks import read_checks  # noqa: E402

export_cog = load("export_cog_checks", NODES / "export-cog" / "export_cog.py")
clean_splat = load("clean_splat_checks", NODES / "clean-splat" / "clean_splat.py")
gate = load("showcase_gate_checks", NODES / "check-showcase" / "gate.py")


def roundtrip(name: str, checks: list[dict]) -> None:
    check(f"{name}: node_checks non-empty", bool(checks), f"len={len(checks)}")
    with tempfile.TemporaryDirectory() as tmp:
        out = emit_checks(Path(tmp), checks)
        check(f"{name}: emit_checks writes checks.json", out.name == "checks.json" and out.is_file(), str(out))
        loaded = read_checks(out)
        check(f"{name}: read_checks count matches", len(loaded) == len(checks), f"{len(loaded)} != {len(checks)}")
        for got, want in zip(loaded, checks):
            check(f"{name}: {want['name']} name", got.name == want["name"], got.name)
            check(f"{name}: {want['name']} pass", got.passed is bool(want["pass"]), f"{got.passed} != {want['pass']}")


def main() -> None:
    roundtrip("export-cog pass", export_cog.node_checks(True, 0.8))
    roundtrip("export-cog fail", export_cog.node_checks(False, 0.1))
    roundtrip("clean-splat polygon+psnr", clean_splat.node_checks(
        {"initial": 10000, "dropped_crop": 100, "after_crop": 9900, "dropped_sor": 100, "dropped_prune": 0, "final": 9800},
        20.0, True, True))
    roundtrip("clean-splat no-polygon", clean_splat.node_checks(
        {"initial": 5000, "dropped_crop": 0, "after_crop": 5000, "dropped_sor": 200, "dropped_prune": 0, "final": 4800},
        None, False, False))
    roundtrip("gate", gate.node_checks([
        {"name": "a", "ok": True, "detail": "d"},
        {"name": "b", "ok": False, "detail": "d"},
    ]))

    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "checks.json"
        p.write_text(json.dumps({"version": 1, "checks": [{"name": "x", "value": 0, "threshold": 1, "pass": False}]}) + "\n")
        loaded = read_checks(p)
        check("read_checks: pass:false -> passed False", loaded[0].passed is False, str(loaded[0]))
        bad = Path(tmp) / "bad.json"
        bad.write_text(json.dumps({"version": 1, "checks": [{"name": "x", "value": 0, "threshold": 1, "pass": False, "extra": 1}]}) + "\n")
        try:
            read_checks(bad)
            check("read_checks: unknown key rejected", False, "no error")
        except Exception:
            check("read_checks: unknown key rejected", True)

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall checks.json checks passed")


if __name__ == "__main__":
    main()
