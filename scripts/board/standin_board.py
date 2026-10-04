#!/usr/bin/env python3
"""A board that Loads nothing: the real Load service over a fake loader, for the app's tests (PWA-4, #318).

    python3 standin_board.py --port 8788 --allow-origin http://localhost:3000

It is board_service.py exactly (routes, origin allowlist, CORS, the three locks, the
parsing of the loader's words) with the four things that touch the outside world
replaced, as board_service_test.py replaces them: the Controller's USB check, the
Card Ledger, the Specs folder and the loader run. No Controller is touched, no
network is used, no B2 credential is read. Plain HTTP on 127.0.0.1 by default.

Three Missions are offered, and what happens on Load depends on which:

    g-ok     Loads: Cards "way finder 4" (125 points)
    g-refuse the loader refuses, in its own words
    g-crash  the loader itself breaks

`--unplugged` starts with the Controller absent; creating <state>/unplugged while it
runs does the same, deleting it plugs it back in. `--delay` is how long a Load takes.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import board_service as bs  # noqa: E402

SPECS = {
    "g-ok/2026-09-26/20260926T214926Z-8636f888.json": "way finder 4",
    "g-refuse/2026-09-26/20260926T214927Z-8636f889.json": "way finder 5",
    "g-crash/2026-09-26/20260926T214928Z-8636f88a.json": "way finder 6",
}
SHEET = "Open way finder 4: GeorgeTown2 2026-09-26 (125 waypoints)\nClose and reopen each card's waypoint editor.\n"
REFUSAL = ("the Card pool has changed since it was calibrated; nothing was touched:\n"
           "  way finder 5 is not the Card the loader was calibrated against\n")
CRASH = "Traceback (most recent call last):\n  ...\nFileNotFoundError: jmtpfs"


def standin(state: Path, delay: float) -> bs.Board:
    specs = state / "specs"
    for rel in SPECS:
        (specs / rel).parent.mkdir(parents=True, exist_ok=True)
        (specs / rel).write_text("{}")
    loaded = state / "loaded.json"
    loaded.write_text("[]")
    ledger = {"pool": sorted(SPECS.values()),
              "holdings": {card: {"card": card, "spec_key": "specs/" + rel, "flight": 1} for rel, card in SPECS.items()}}

    def run(spec: Path):
        time.sleep(delay)  # long enough for the app to show its progress
        if "g-refuse" in spec.parts[-3]:
            return 1, "", REFUSAL
        if "g-crash" in spec.parts[-3]:
            return 1, "", CRASH
        return 0, SHEET, ""

    return bs.Board(specs=specs, loaded=loaded, skipped=lambda: {}, fetch_ledger=lambda: ledger,
                    plugged=lambda: not (state / "unplugged").exists(), runner=run, cron_lock=state / "cron.lock")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--bind", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8788)
    p.add_argument("--allow-origin", default=",".join(bs.DEFAULT_ORIGINS))
    p.add_argument("--state", type=Path, help="working folder (default: a temporary one)")
    p.add_argument("--delay", type=float, default=1.5, help="seconds a Load takes")
    p.add_argument("--unplugged", action="store_true")
    args = p.parse_args()
    state = args.state or Path(tempfile.mkdtemp(prefix="standin-board-"))
    state.mkdir(parents=True, exist_ok=True)
    flag = state / "unplugged"
    if args.unplugged:
        flag.touch()
    server = bs.Server((args.bind, args.port), bs.make_handler(standin(state, args.delay), bs.parse_origins(args.allow_origin)))
    print(json.dumps({"standin_board": f"http://{args.bind}:{args.port}", "state": str(state)}), flush=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
