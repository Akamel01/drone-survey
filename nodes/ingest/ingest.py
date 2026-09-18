#!/usr/bin/env python3
"""ingest: copy a Capture into the working store, verify completeness.

Source is not a Manifest input (this is the head of the Pipeline) — it comes
from the INGEST_SOURCE environment variable, set by whoever invokes the
Runner for a given Capture, per pipeline/README.md's own ingest example
(no `--in` shown there for the same reason).
"""

import argparse
import hashlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import IMAGE_SUFFIXES, die, list_images, sha256_file  # noqa: E402


    # sha256_file() from common.py is the canonical checksum helper now.
    # The private sha256() helper was removed in favour of a single source of truth.


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()

    source = os.environ.get("INGEST_SOURCE")
    if not source:
        die("set INGEST_SOURCE to the Capture directory to ingest")
    source = Path(source)
    if not source.is_dir():
        die(f"INGEST_SOURCE {source} is not a directory")

    images = sorted(p for p in source.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        die(f"no images ({sorted(IMAGE_SUFFIXES)}) found in {source}")

    args.out.mkdir(parents=True, exist_ok=True)
    for src in images:
        dst = args.out / src.name
        dst.write_bytes(src.read_bytes())
        if sha256_file(dst) != sha256_file(src):
            die(f"copy verification failed for {src.name}: checksum mismatch after copy")

    copied = list_images(args.out)
    if len(copied) != len(images):
        die(f"expected {len(images)} images copied, found {len(copied)} in {args.out}")

    print(f"ingest: copied {len(copied)} images from {source} to {args.out}, checksums verified")


if __name__ == "__main__":
    main()
