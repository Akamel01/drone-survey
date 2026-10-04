#!/usr/bin/env python3
"""Cut an offline-map region from the Protomaps daily build and publish it.

The planner keeps a street map around a Site for offline use (PWA-2, #315). It
reads that map from region archives in the private B2 bucket; this is how an
archive gets there. For a region (a bounding box) it:

  1. finds the newest Protomaps daily build,
  2. cuts the box out with `pmtiles extract` (range requests: only the box is
     downloaded, never the 140 GB planet), to z15,
  3. uploads the archive to specs/_maps/<id>-<build>.pmtiles,
  4. updates specs/_maps/manifest.json (this host is its only writer).

The planner's Developer section queues a cut as specs/_maps/requests/<id>.json;
`--once` does every queued one. By hand: `--cut ID --name NAME --bbox W,S,E,N`.

Disk is tight here: a cut never starts with less than FLOOR + 1 GB free, is
killed if free space falls under FLOOR (5 GB), and each file is capped by the
kernel (RLIMIT_FSIZE) at what is free above the floor. Work files live in
~/drone/maps/work and are deleted as soon as the upload is done.

Nothing is downloaded for you: the `pmtiles` binary (go-pmtiles) must already
be at ~/drone/maps/pmtiles. Credentials are the status key
(~/.config/wayfinder/b2-status.env: write and delete under specs/); no value is
ever printed.
"""

from __future__ import annotations

import argparse
import datetime
import fcntl
import hashlib
import json
import os
import resource
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

for _p in (Path(__file__).resolve().parent.parent / "mission", Path.home() / "wayfinder" / "bin"):
    if _p.is_dir() and str(_p) not in sys.path:
        sys.path.append(str(_p))
import b2  # noqa: E402  (authorize, download: one home for storage access)

ROOT = Path.home() / "drone" / "maps"
PMTILES = ROOT / "pmtiles"
WORK = ROOT / "work"
LOCK = ROOT / "cut.lock"
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "wayfinder" / "b2-status.env"
BUILDS = "https://build.protomaps.com/{date}.pmtiles"

GB = 1024**3
FLOOR = 5 * GB
MAPS_PREFIX = "specs/_maps/"
MANIFEST_KEY = MAPS_PREFIX + "manifest.json"
REQUESTS_PREFIX = MAPS_PREFIX + "requests/"
# A single b2_upload_file takes at most 5 GB; larger needs the large-file API.
SINGLE_UPLOAD_MAX = 5_000_000_000


def log(msg: str) -> None:
    print(f"{datetime.datetime.now().isoformat(timespec='seconds')} {msg}", flush=True)


class Stop(Exception):
    """A reason not to go on, in words for the developer. Never holds a secret."""


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        raise Stop(f"no credentials at {path}")
    env = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    missing = [k for k in ("B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET") if k not in env]
    if missing:
        raise Stop(f"{path} is missing {', '.join(missing)}")
    return env


# --- disk ---------------------------------------------------------------------


def free_bytes(path: Path) -> int:
    return shutil.disk_usage(path).free


def check_space(path: Path, floor: int = FLOOR) -> int:
    """The bytes a cut may write: free space above the floor. Stops when that is
    under 1 GB, so a cut never starts that would leave under the floor."""
    room = free_bytes(path) - floor
    if room < GB:
        raise Stop(f"only {free_bytes(path) / GB:.1f} GB is free and {floor / GB:.0f} GB must stay free; nothing was cut")
    return room


# --- the build ----------------------------------------------------------------


def latest_build(today: datetime.date | None = None, head=None) -> tuple[str, str]:
    """(YYYYMMDD, url) of the newest daily build: today's may not be out yet."""
    head = head or _head_ok
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    for back in range(8):
        stamp = (today - datetime.timedelta(days=back)).strftime("%Y%m%d")
        url = BUILDS.format(date=stamp)
        if head(url):
            return stamp, url
    raise Stop("no Protomaps daily build in the last 8 days")


def _head_ok(url: str) -> bool:
    try:
        # Cloudflare refuses urllib's default User-Agent with a 403.
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "drone-survey-map-cut"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


# --- the cut ------------------------------------------------------------------


def cut(region: dict, build_url: str, out: Path) -> None:
    """`pmtiles extract`, with the disk floor enforced three ways: the kernel
    caps each file, a watcher kills the run if free space falls under the floor."""
    if not PMTILES.exists():
        raise Stop(f"{PMTILES} is not there: the go-pmtiles binary has to be put there first")
    room = check_space(WORK)
    w, s, e, n = region["bbox"]
    cmd = [str(PMTILES), "extract", build_url, str(out), f"--bbox={w},{s},{e},{n}", f"--maxzoom={region.get('maxzoom', 15)}"]
    log(f"cutting {region['id']}: {cmd[2]} bbox={w},{s},{e},{n} (may write up to {room / GB:.1f} GB)")
    proc = subprocess.Popen(
        cmd,
        cwd=WORK,
        env={**os.environ, "TMPDIR": str(WORK)},
        preexec_fn=lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (room, room)),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    stopped = threading.Event()

    def watch() -> None:
        while proc.poll() is None:
            if free_bytes(WORK) < FLOOR:
                stopped.set()
                proc.kill()
                return
            time.sleep(5)

    threading.Thread(target=watch, daemon=True).start()
    tail = []
    for line in proc.stdout:  # progress, kept short
        tail = (tail + [line.rstrip()])[-5:]
    code = proc.wait()
    if stopped.is_set():
        out.unlink(missing_ok=True)
        raise Stop("stopped: free space fell under 5 GB during the cut")
    if code != 0:
        out.unlink(missing_ok=True)
        raise Stop(f"pmtiles extract failed (exit {code}): {' | '.join(tail)[-300:]}")


# --- B2 -----------------------------------------------------------------------


def _api(auth: dict, call: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{auth['apiUrl']}/b2api/v2/{call}",
        data=json.dumps(body).encode(),
        headers={"Authorization": auth["authorizationToken"], "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise Stop(f"B2 {call} failed: {e.code} {e.reason}") from None


def list_files(auth: dict, bucket_id: str, prefix: str) -> list[dict]:
    out, start = [], None
    while True:
        body = {"bucketId": bucket_id, "prefix": prefix, "maxFileCount": 1000}
        if start:
            body["startFileName"] = start
        page = _api(auth, "b2_list_file_names", body)
        out += page["files"]
        start = page.get("nextFileName")
        if not start:
            return out


def put_bytes(auth: dict, bucket_id: str, key: str, data: bytes) -> None:
    b2.upload(auth["apiUrl"], auth["authorizationToken"], bucket_id, key, data)


def put_file(auth: dict, bucket_id: str, key: str, path: Path) -> None:
    """Stream one local file to B2 with its SHA1 sent up front, so it is never
    held in memory."""
    size = path.stat().st_size
    if size > SINGLE_UPLOAD_MAX:
        raise Stop(f"{path.name} is {size / 1e9:.1f} GB: over the 5 GB a single B2 upload takes. Cut a smaller region")
    sha = hashlib.sha1()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            sha.update(block)
    up = _api(auth, "b2_get_upload_url", {"bucketId": bucket_id})
    with path.open("rb") as f:
        req = urllib.request.Request(
            up["uploadUrl"],
            data=f,
            headers={
                "Authorization": up["authorizationToken"],
                "X-Bz-File-Name": urllib.parse.quote(key, safe="/"),
                "Content-Type": "application/octet-stream",
                "X-Bz-Content-Sha1": sha.hexdigest(),
                "Content-Length": str(size),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=3600) as r:
                stored = json.load(r).get("contentSha1")
        except urllib.error.HTTPError as e:
            raise Stop(f"upload of {key} failed: {e.code} {e.reason}") from None
    if stored != sha.hexdigest():
        raise Stop(f"upload of {key} was not stored intact (checksum disagrees)")


def read_manifest(auth: dict, bucket: str) -> dict:
    try:
        return json.loads(b2.download(auth["downloadUrl"], bucket, MANIFEST_KEY, auth["authorizationToken"]))
    except FileNotFoundError:
        return {"regions": []}


def with_region(manifest: dict, entry: dict) -> dict:
    """The manifest with `entry` in place of any region of the same id."""
    return {"regions": sorted([r for r in manifest.get("regions", []) if r["id"] != entry["id"]] + [entry], key=lambda r: r["id"])}


def delete_old(auth: dict, bucket_id: str, region_id: str, keep_key: str) -> None:
    for f in list_files(auth, bucket_id, f"{MAPS_PREFIX}{region_id}-"):
        if f["fileName"] != keep_key and f["fileName"].endswith(".pmtiles"):
            _api(auth, "b2_delete_file_version", {"fileId": f["fileId"], "fileName": f["fileName"]})


def set_request(auth: dict, bucket_id: str, request: dict, status: str, message: str | None = None) -> None:
    body = {**request, "status": status}
    if message:
        body["message"] = message
    put_bytes(auth, bucket_id, f"{REQUESTS_PREFIX}{request['id']}.json", json.dumps(body).encode())


# --- one region, start to finish ------------------------------------------------


def publish_region(region: dict, auth: dict, env: dict, upload: bool = True) -> dict:
    """Cut, upload, record in the manifest, clean up. Returns the manifest entry."""
    WORK.mkdir(parents=True, exist_ok=True)
    build, url = latest_build()
    out = WORK / f"{region['id']}-{build}.pmtiles"
    try:
        cut(region, url, out)
        size = out.stat().st_size
        log(f"cut {region['id']}: {size / 1e6:.1f} MB from build {build}")
        key = f"{MAPS_PREFIX}{region['id']}-{build}.pmtiles"
        entry = {
            "id": region["id"], "name": region["name"], "bbox": region["bbox"], "maxzoom": region.get("maxzoom", 15),
            "key": key, "bytes": size, "cut_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "build": build,
        }
        if not upload:
            log(f"--no-upload: left {out}")
            return entry
        bucket_id = auth["allowed"]["bucketId"]
        put_file(auth, bucket_id, key, out)
        log(f"uploaded {key}")
        manifest = with_region(read_manifest(auth, env["B2_BUCKET"]), entry)
        put_bytes(auth, bucket_id, MANIFEST_KEY, json.dumps(manifest, indent=1).encode())
        delete_old(auth, bucket_id, region["id"], key)
        return entry
    finally:
        if upload:
            out.unlink(missing_ok=True)


def process_queue(auth: dict, env: dict, publish=publish_region) -> int:
    """Every queued request in specs/_maps/requests/. Returns how many were cut."""
    bucket_id = auth["allowed"]["bucketId"]
    done = 0
    for f in list_files(auth, bucket_id, REQUESTS_PREFIX):
        try:
            request = json.loads(b2.download(auth["downloadUrl"], env["B2_BUCKET"], f["fileName"], auth["authorizationToken"]))
        except (FileNotFoundError, ValueError):
            continue
        if request.get("status") != "queued" or f["fileName"] != f"{REQUESTS_PREFIX}{request.get('id')}.json":
            continue
        set_request(auth, bucket_id, request, "cutting")
        try:
            publish(request, auth, env)
        except Stop as e:
            log(f"{request['id']} failed: {e}")
            set_request(auth, bucket_id, request, "failed", str(e)[:300])
            continue
        except Exception as e:  # a request must never be left "cutting"
            log(f"{request['id']} failed: {type(e).__name__}")
            set_request(auth, bucket_id, request, "failed", f"{type(e).__name__}: {str(e)[:200]}")
            continue
        _api(auth, "b2_delete_file_version", {"fileId": f["fileId"], "fileName": f["fileName"]})
        done += 1
    return done


def check() -> None:
    """What a cut would find, without cutting: no download beyond a HEAD."""
    ROOT.mkdir(parents=True, exist_ok=True)
    log(f"free: {free_bytes(ROOT) / GB:.1f} GB (floor {FLOOR / GB:.0f} GB)")
    log(f"pmtiles binary: {'present' if PMTILES.exists() else 'MISSING at ' + str(PMTILES)}")
    stamp, url = latest_build()
    log(f"newest daily build: {stamp} {url}")
    env = load_env(CONFIG)
    auth = b2.authorize(env["B2_KEY_ID"], env["B2_APP_KEY"])
    log(f"queued requests: {len(list_files(auth, auth['allowed']['bucketId'], REQUESTS_PREFIX))}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--once", action="store_true", help="cut every region queued from the planner's Developer section")
    ap.add_argument("--cut", metavar="ID", help="cut one region by hand (with --name and --bbox)")
    ap.add_argument("--name")
    ap.add_argument("--bbox", help="W,S,E,N in degrees")
    ap.add_argument("--no-upload", action="store_true", help="cut only; leave the file in ~/drone/maps/work")
    ap.add_argument("--check", action="store_true", help="report disk, binary, newest build and queue; cut nothing")
    args = ap.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    with LOCK.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("another cut is running; leaving it be")
            return 0
        try:
            if args.check:
                check()
            elif args.cut:
                if not (args.name and args.bbox):
                    raise Stop("--cut needs --name and --bbox")
                region = {"id": args.cut, "name": args.name, "bbox": [float(x) for x in args.bbox.split(",")], "maxzoom": 15}
                env = load_env(CONFIG)
                auth = b2.authorize(env["B2_KEY_ID"], env["B2_APP_KEY"])
                publish_region(region, auth, env, upload=not args.no_upload)
            elif args.once:
                env = load_env(CONFIG)
                auth = b2.authorize(env["B2_KEY_ID"], env["B2_APP_KEY"])
                log(f"cut {process_queue(auth, env)} queued region(s)")
            else:
                ap.print_help()
        except Stop as e:
            log(f"stopped: {e}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
