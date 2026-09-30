#!/usr/bin/env python3
"""The board's Load service: the phone Loads a Mission over the hotspot (LOADER-1, #314).

A small HTTP service for the Linux board next to the Controller. It lists the
Missions waiting to Load (Collected, holding a Reservation), starts a Load of
one, and reports what happened. The Load itself is `scripts/mission/load.py`,
run as a child process and unchanged: the decisions, the read-back and the
rollback all stay there. This file only decides *whether to start it* and turns
its output into JSON.

    python3 board_service.py                 # 0.0.0.0:8787, announces board.local
    python3 board_service.py --selftest      # run board_service_test.py

Interface (JSON everywhere; see README.md):
    GET  /health         controller plugged in? a Load running?
    GET  /missions       the Missions ready to Load
    POST /loads          {"mission": "<id from /missions>"} -> 202 {load}
    GET  /loads          recent Loads, newest first
    GET  /loads/<id>     one Load: state, Cards written with their waypoints, or the refusal

Never two Loads at once. Three locks stand behind that, one per way a second
Load could start: this process (a second POST is refused with 409), cron's own
`flock /tmp/wayfinder-load.lock` (taken here too, so a service Load and the
autoload cron cannot overlap, with no change to the crontab), and the loader's
own Controller lock (a Load started by hand).
"""

from __future__ import annotations

import argparse
import fcntl
import ipaddress
import json
import os
import re
import secrets
import signal
import socket
import struct
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Where load.py lives: the repo's scripts/mission, or a deployed loader directory
# (the host's ~/wayfinder/bin). Only read and run from there, never written to.
LOADER_DIR = Path(os.environ.get("BOARD_LOADER_DIR") or (HERE.parent / "mission"))
sys.path.insert(0, str(LOADER_DIR))
import b2_status  # noqa: E402
import keys  # noqa: E402
import load  # noqa: E402  (its paths, the store adapter and the CLI we run)
import load_core  # noqa: E402  (queue_specs, split_reserved: what cron decides with)

CONTROLLER_USB = ("2ca3", "1021")  # the RC2, as cron's lsusb -d checks it
CRON_LOCK = Path(os.environ.get("BOARD_CRON_LOCK", "/tmp/wayfinder-load.lock"))
LOAD_TIMEOUT_S = 900
# Pages allowed to call the board: the planner in production, and local development.
DEFAULT_ORIGINS = ("https://web-auditor-ai1.vercel.app", "http://localhost:3000")
KEEP = 20  # Loads remembered in memory; a restart forgets them

CARD_LINE = re.compile(r"^Open (?P<card>.+?): (?P<name>.+) \((?P<waypoints>\d+) waypoints\)\s*$")


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def controller_plugged() -> bool:
    """The Controller's USB id is on the bus. Read from /sys so a bare board needs no lsusb."""
    for dev in Path("/sys/bus/usb/devices").glob("*"):
        try:
            if ((dev / "idVendor").read_text().strip(), (dev / "idProduct").read_text().strip()) == CONTROLLER_USB:
                return True
        except OSError:
            pass
    return False


def run_loader(spec: Path) -> tuple[int, str, str]:
    """`load.py SPEC --yes`, exactly as an operator would type it."""
    try:
        done = subprocess.run([sys.executable, str(LOADER_DIR / "load.py"), str(spec), "--yes"],
                              cwd=LOADER_DIR, capture_output=True, text=True, timeout=LOAD_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return 1, "", f"Traceback: the loader did not finish within {LOAD_TIMEOUT_S} s and was stopped."
    return done.returncode, done.stdout, done.stderr


def take_lock(path: Path):
    """cron's flock, non-blocking: the open descriptor, or None when someone holds it."""
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    return fd


def parse_result(returncode: int, stdout: str, stderr: str) -> dict:
    """The loader's exit and words as a state, a reason and the Cards written.

    A refusal is `sys.exit(message)` in the loader: exit 1 and the message on
    stderr. A traceback is the loader itself breaking, which is a different
    thing to tell the operator.
    """
    cards = [{"card": m["card"], "mission": m["name"], "waypoints": int(m["waypoints"])}
             for m in map(CARD_LINE.match, stdout.splitlines()) if m]
    output = (stdout + stderr).strip()[-4000:]
    if returncode == 0 and cards:
        return {"state": "loaded", "reason": None, "cards": cards, "output": output}
    if returncode == 0:
        return {"state": "failed", "reason": "The loader finished but named no Cards.", "cards": [], "output": output}
    err = stderr.strip()
    if "Traceback" in err:
        return {"state": "failed", "reason": err.splitlines()[-1], "cards": [], "output": output}
    return {"state": "refused", "reason": err or "The loader refused and gave no reason.", "cards": [], "output": output}


class Refused(Exception):
    """A request that starts nothing: an HTTP status, a code, and the reason in words."""

    def __init__(self, status: int, code: str, reason: str, **extra):
        super().__init__(reason)
        self.status, self.body = status, {"error": code, "reason": reason, **extra}


class Board:
    def __init__(self, *, specs: Path = load.SPECS, loaded: Path = load.LOADED,
                 skipped=load._load_skipped, fetch_ledger=None, plugged=controller_plugged,
                 runner=run_loader, cron_lock: Path = CRON_LOCK):
        self.specs, self.loaded, self.skipped = specs, loaded, skipped
        self.fetch_ledger = fetch_ledger or load.B2Store(load.DEFAULT_STATUS_CONFIG).fetch_ledger
        self.plugged, self.runner, self.cron_lock = plugged, runner, cron_lock
        self._mu = threading.Lock()
        self._current: dict | None = None  # the Load in flight, or being admitted
        self.loads: list[dict] = []
        self._thread: threading.Thread | None = None

    def health(self) -> dict:
        cur = self._current
        return {"ok": True, "controller": self.plugged(), "busy": cur["id"] if cur else None}

    def missions(self) -> dict:
        """Collected Specs not yet Loaded and not withdrawn (what cron queues), that hold a Reservation."""
        found = sorted(self.specs.glob("*/*/*.json"))
        loaded = set(json.loads(self.loaded.read_text())) if found and self.loaded.exists() else None
        queue = load_core.queue_specs(found, loaded, set(self.skipped()), self.specs)
        if queue.adopted is not None:
            return {"missions": [], "note": "No record of past Loads on this board; nothing is offered until one exists."}
        out: dict = {}
        waiting = queue.waiting
        try:
            ledger = self.fetch_ledger()
            waiting, _ = load_core.split_reserved(waiting, ledger, self.specs)
        except load_core.LedgerUnreadable as e:
            ledger, out["ledger_error"] = None, str(e)  # still listed; the loader refuses if it must
        rows = []
        for spec in waiting:
            key = load_core.spec_key(spec, self.specs)
            cards = [h["card"] for h in b2_status.cards_for(ledger, key)] if ledger else None
            rows.append({"id": key[len(keys.SPEC_PREFIX):], **(keys.parse_spec_key(key) or {}), "cards": cards})
        return {"missions": rows, **out}

    def start(self, mission: object) -> dict:
        with self._mu:  # the in-process guard: admit one Load, refuse the next
            if self._current:
                raise Refused(409, "busy", "A Load is already running; wait for it to finish.",
                              load=self._current["id"])
            record = self._current = {"id": secrets.token_hex(4), "mission": mission, "state": "starting",
                                      "started_at": now(), "finished_at": None, "reason": None, "cards": []}
        lock = None
        try:
            if not self.plugged():  # first: it is free, and needs no network
                raise Refused(409, "controller_absent", "The Controller is not plugged in "
                              "(USB 2ca3:1021 is not on the board). Plug it in, unlock it and try again.")
            if not any(m["id"] == mission for m in self.missions()["missions"]):
                raise Refused(404, "not_loadable", f"{mission!r} is not waiting to Load: it is not Collected, "
                              "is already Loaded or withdrawn, or holds no Reservation.")
            lock = take_lock(self.cron_lock)
            if lock is None:
                raise Refused(409, "busy", "The autoload is Loading right now; nothing was touched. "
                              "It finishes on its own; check again in a minute.")
            record["state"] = "running"
            self.loads = [record] + self.loads[:KEEP - 1]
            snapshot = dict(record)  # taken before the thread can finish it
            self._thread = threading.Thread(target=self._run, args=(record, self.specs / mission, lock), daemon=True)
            self._thread.start()
            return snapshot
        except BaseException:
            if lock is not None:
                os.close(lock)
            self._current = None
            raise

    def _run(self, record: dict, spec: Path, lock: int) -> None:
        try:
            result = parse_result(*self.runner(spec))
        except Exception as e:  # a runner that cannot even start is a failed Load, not a dead thread
            result = {"state": "failed", "reason": f"{type(e).__name__}: {e}", "cards": [], "output": ""}
        finally:
            os.close(lock)
        record.update(result, finished_at=now())
        self._current = None

    def join(self) -> None:
        if self._thread:
            self._thread.join()

    def get(self, load_id: str) -> dict:
        for r in self.loads:
            if r["id"] == load_id:
                return dict(r)
        raise Refused(404, "no_such_load", f"No Load {load_id!r} (the board remembers the last {KEEP}).")


def is_local(addr: str) -> bool:
    """Loopback, private (the hotspot's 192.168/10/172.16) or link-local; never the internet or Tailscale."""
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


def parse_origins(text: str) -> tuple[str, ...]:
    """A comma-separated list of origins. `*` is refused: any page on the phone could then Load."""
    origins = tuple(o.strip().rstrip("/") for o in text.split(",") if o.strip())
    if not origins or "*" in origins:
        raise ValueError("name the origins allowed to call the board, comma-separated; '*' is not accepted")
    return origins


def make_handler(board: Board, origins: tuple[str, ...]):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print(f"{self.client_address[0]} {fmt % args}", flush=True)

        def _send(self, status: int, body: object = None):
            data = b"" if body is None else json.dumps(body).encode()
            self.send_response(status)
            if self.headers.get("Origin") in origins:  # else no CORS header: the browser will not show the reply
                self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _serve(self, route):
            if not is_local(self.client_address[0]):
                return self._send(403, {"error": "not_local", "reason": "The board answers only on the local network."})
            origin = self.headers.get("Origin")
            if origin is not None and origin not in origins:
                # Enforced here, not left to the browser honouring CORS: a page
                # on the phone's hotspot must not be able to start a Load. No
                # Origin (curl, the host itself) is not a browser and stays allowed.
                return self._send(403, {"error": "bad_origin", "reason": f"Requests from {origin!r} are not accepted."})
            try:
                status, body = route()
            except Refused as r:
                status, body = r.status, r.body
            except Exception as e:  # never a dropped connection for the phone
                status, body = 500, {"error": "internal", "reason": f"{type(e).__name__}: {e}"}
            self._send(status, body)

        def do_OPTIONS(self):
            self._serve(lambda: (204, None))

        def do_GET(self):
            path = self.path.split("?")[0].rstrip("/")

            def route():
                if path == "/health":
                    return 200, board.health()
                if path == "/missions":
                    return 200, board.missions()
                if path == "/loads":
                    return 200, {"loads": board.loads}
                if path.startswith("/loads/"):
                    return 200, board.get(path[len("/loads/"):])
                raise Refused(404, "not_found", f"No such path {path!r}.")
            self._serve(route)

        def do_POST(self):
            def route():
                if self.path.rstrip("/") != "/loads":
                    raise Refused(404, "not_found", f"No such path {self.path!r}.")
                try:
                    mission = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 4096)))["mission"]
                except (ValueError, KeyError, TypeError):
                    raise Refused(400, "bad_request", 'Send JSON like {"mission": "<id from /missions>"}.')
                return 202, board.start(mission)
            self._serve(route)

    return Handler


# --- mDNS: answer for board.local without Avahi or sudo ---------------------

def _name(host: str) -> bytes:
    return b"".join(bytes([len(p)]) + p.encode() for p in host.split(".")) + b"\0"


def mdns_answer(packet: bytes, host: str, ip: str, from_5353: bool) -> bytes | None:
    """The reply to an A query for `host`, or None for anything else.

    Bonjour-style queriers (port 5353) get the multicast form; a plain resolver
    on another port gets a unicast reply that repeats its id and question
    (RFC 6762 6.7). AAAA is left unanswered: the board has no IPv6 name to give.
    """
    try:
        qid, flags, qd = struct.unpack("!HHH", packet[:6])
        if flags & 0x8000 or not qd:
            return None
        i, labels = 12, []
        while packet[i]:
            if packet[i] & 0xC0:  # a compressed name: not in a first question we care about
                return None
            labels.append(packet[i + 1:i + 1 + packet[i]].decode().lower())
            i += packet[i] + 1
        qtype, qclass = struct.unpack("!HH", packet[i + 1:i + 5])
    except (struct.error, IndexError, UnicodeDecodeError):
        return None
    if ".".join(labels) != host.lower() or qtype not in (1, 255) or qclass & 0x7FFF != 1:
        return None
    rdata = socket.inet_aton(ip)
    if from_5353:
        return (struct.pack("!HHHHHH", 0, 0x8400, 0, 1, 0, 0) + _name(host)
                + struct.pack("!HHIH", 1, 0x8001, 120, 4) + rdata)
    return (struct.pack("!HHHHHH", qid, 0x8400, 1, 1, 0, 0) + packet[12:i + 5]
            + _name(host) + struct.pack("!HHIH", 1, 1, 10, 4) + rdata)


def mdns_serve(host: str) -> None:
    """Join 224.0.0.251:5353 and answer for `host` with the address the asker can reach.

    ponytail: joins on the default interface only; a board on several networks
    needs one join per interface (or Avahi, with the hostname set to `board`).
    """
    rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    rx.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, "SO_REUSEPORT"):
        rx.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)  # coexist with Avahi if it runs
    rx.bind(("", 5353))
    rx.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP,
                  struct.pack("4sl", socket.inet_aton("224.0.0.251"), socket.INADDR_ANY))
    rx.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
    while True:
        packet, (src, port) = rx.recvfrom(1500)
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
                probe.connect((src, 9))  # sends nothing: asks the kernel which address routes to the asker
                ip = probe.getsockname()[0]
            reply = mdns_answer(packet, host, ip, port == 5353)
            if reply and port == 5353:
                rx.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(ip))
                rx.sendto(reply, ("224.0.0.251", 5353))  # from port 5353: Bonjour drops replies from any other
            elif reply:
                rx.sendto(reply, (src, port))
        except OSError as e:
            print(f"mDNS: {e}", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--bind", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--hostname", default="board.local", help="the mDNS name announced")
    p.add_argument("--no-mdns", action="store_true", help="do not announce; use when Avahi already serves the name")
    p.add_argument("--allow-origin", default=os.environ.get("BOARD_ALLOW_ORIGIN", ",".join(DEFAULT_ORIGINS)),
                   help="origins allowed to call the board, comma-separated (env BOARD_ALLOW_ORIGIN; "
                        "default: the planner's production origin and http://localhost:3000)")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()
    if args.selftest:
        sys.path.insert(0, str(HERE))
        import board_service_test
        sys.exit(board_service_test.run())
    try:
        origins = parse_origins(args.allow_origin)
    except ValueError as e:
        p.error(str(e))
    board = Board()
    server = ThreadingHTTPServer((args.bind, args.port), make_handler(board, origins))
    server.daemon_threads = True
    if not args.no_mdns:
        def announce():
            try:
                mdns_serve(args.hostname)
            except OSError as e:
                print(f"mDNS is off ({e}); the board is still reachable by address", flush=True)
        threading.Thread(target=announce, daemon=True).start()

    def stop(*_):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    print(f"board service on {args.bind}:{args.port} as {args.hostname}", flush=True)
    try:
        server.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        server.server_close()
        board.join()  # a Load in flight finishes: killing it mid-write is what the rollback exists for


if __name__ == "__main__":
    main()
