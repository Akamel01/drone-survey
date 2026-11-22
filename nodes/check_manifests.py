#!/usr/bin/env python3
"""Check that pipeline manifests are valid for recon-core.

Loads the 5 valid manifests via recon_core.manifest.load_manifest and asserts
orthomosaic-invalid.json is rejected with the expected interior-ref message.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFESTS = REPO_ROOT / "pipeline" / "manifests"

VALID = [
    "deliver.json",
    "orthomosaic.json",
    "retention.json",
    "showcase.json",
    "splat.json",
]
INVALID = "orthomosaic-invalid.json"
EXPECTED_SUBSTR = "interior file references are not allowed"


def main() -> int:
    try:
        from recon_core.manifest import ManifestError, load_manifest
    except Exception as e:  # pragma: no cover
        print(f"[fail] could not import recon_core.manifest: {e}", file=sys.stderr)
        return 1

    failed = False
    for name in VALID:
        path = MANIFESTS / name
        try:
            load_manifest(path)
            print(f"[ok] {name}")
        except Exception as e:
            print(f"[fail] {name}: {e}", file=sys.stderr)
            failed = True

    invalid_path = MANIFESTS / INVALID
    try:
        load_manifest(invalid_path)
        print(f"[fail] {INVALID}: expected ManifestError", file=sys.stderr)
        failed = True
    except ManifestError as e:
        msg = str(e)
        if EXPECTED_SUBSTR in msg:
            print(f"[ok] {INVALID} rejected: {EXPECTED_SUBSTR}")
        else:
            print(
                f"[fail] {INVALID}: ManifestError missing {EXPECTED_SUBSTR!r}: {msg}",
                file=sys.stderr,
            )
            failed = True
    except Exception as e:
        print(f"[fail] {INVALID}: unexpected {type(e).__name__}: {e}", file=sys.stderr)
        failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
