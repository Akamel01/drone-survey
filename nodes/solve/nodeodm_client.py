"""Minimal NodeODM HTTP client -- stdlib only, no `requests` dependency.

ADR 0006 (revision): the Runner delegates ODM work to NodeODM's own job
queue rather than reimplementing scheduling. This module is that delegation
seam: submit images (+ optional gcp_list.txt), poll, download, restart from
a stage, remove. Every endpoint here was hand-verified against the real
`nodeodm` container on `akamel-linux` (NodeODM 2.2.4 / ODM 3.5.6) on
2026-09-13 -- see docs/research/golden-capture-v1.md. Two things are *not*
where NodeODM's own docs/most examples imply:

  - Restart is `POST /task/restart` with `{"uuid": ..., "options": [...]}`
    in the body, not `/task/{uuid}/restart`.
  - Remove is `POST /task/remove` with `{"uuid": ...}`, not a path param.

Both were 404 ("Cannot POST ...") until moved into the body, confirmed live.

`/task/{uuid}/download/<name>` only serves a fixed whitelist of asset names
(historically "all.zip" plus a few named outputs); an arbitrary in-project
path returns HTTP 200 with `{"error": "Invalid asset"}` -- checked for
explicitly in `download_all_zip`, since a 200 status alone is not evidence
of a real file (ADR 0018's whole point, applied to our own client code).
"""

from __future__ import annotations

import http.client
import json
import mimetypes
import time
import urllib.parse
import uuid as uuid_mod
from pathlib import Path

STATUS = {10: "QUEUED", 20: "RUNNING", 30: "FAILED", 40: "COMPLETED", 50: "CANCELED"}
TERMINAL = {30, 40, 50}


class NodeODMError(Exception):
    pass


def _split_host(host: str) -> tuple[str, int, bool]:
    parsed = urllib.parse.urlparse(host)
    is_https = parsed.scheme == "https"
    port = parsed.port or (443 if is_https else 80)
    return parsed.hostname, port, is_https


def _connect(host: str) -> http.client.HTTPConnection:
    hostname, port, is_https = _split_host(host)
    cls = http.client.HTTPSConnection if is_https else http.client.HTTPConnection
    return cls(hostname, port, timeout=60)


def _multipart_body(fields: list[tuple[str, str]], files: list[tuple[str, str, Path]]):
    """Build a multipart/form-data body. `files` is (field_name, upload_filename, local_path).

    Streamed as one bytes blob -- fine up to a few GB on a 62GB-RAM host
    (ponytail: the simple version first; switch to chunked streaming if a
    real Capture's upload ever gets big enough to matter, which measured
    Captures so far -- studiokitchen 3.5GB, aukerman 1.1GB -- do not).
    """
    boundary = uuid_mod.uuid4().hex
    parts = []
    for name, value in fields:
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        )
    for field_name, upload_name, path in files:
        ctype = mimetypes.guess_type(upload_name)[0] or "application/octet-stream"
        header = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field_name}\"; "
            f"filename=\"{upload_name}\"\r\nContent-Type: {ctype}\r\n\r\n"
        ).encode()
        parts.append(header + Path(path).read_bytes() + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    return body, f"multipart/form-data; boundary={boundary}"


def _request(host: str, method: str, path: str, body: bytes = b"", headers: dict | None = None) -> dict:
    conn = _connect(host)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        raw = resp.read()
    finally:
        conn.close()
    try:
        data = json.loads(raw.decode())
    except json.JSONDecodeError:
        raise NodeODMError(f"{method} {path}: non-JSON response (status {resp.status}): {raw[:200]!r}")
    if resp.status >= 400:
        raise NodeODMError(f"{method} {path}: HTTP {resp.status}: {data}")
    return data


def new_task(host: str, name: str, image_paths: list[Path], options: list[dict],
             gcp_path: Path | None = None) -> str:
    """Submit images (+ optional gcp_list.txt) as a new task. Returns the task uuid."""
    files = [("images", p.name, p) for p in image_paths]
    if gcp_path is not None:
        # ODM auto-detects ground control by this exact filename among the
        # uploaded files (docs.opendronemap.org/gcp) -- rename on upload
        # regardless of the source file's own name.
        files.append(("images", "gcp_list.txt", gcp_path))
    fields = [("name", name), ("options", json.dumps(options))]
    body, content_type = _multipart_body(fields, files)
    data = _request(host, "POST", "/task/new", body=body, headers={"Content-Type": content_type})
    if "uuid" not in data:
        raise NodeODMError(f"task/new did not return a uuid: {data}")
    return data["uuid"]


def info(host: str, task_uuid: str) -> dict:
    return _request(host, "GET", f"/task/{task_uuid}/info")


def output(host: str, task_uuid: str) -> list[str]:
    data = _request(host, "GET", f"/task/{task_uuid}/output")
    return data if isinstance(data, list) else []


def wait_for_completion(host: str, task_uuid: str, poll_seconds: float = 10.0,
                         timeout_seconds: float = 3 * 3600) -> dict:
    """Block until the task leaves QUEUED/RUNNING. Never softens a failure -- the
    caller decides what a FAILED/CANCELED status means (ADR 0018: exit code / a
    Node's own check is the evidence, not "it returned").
    """
    started = time.monotonic()
    while True:
        current = info(host, task_uuid)
        code = current.get("status", {}).get("code")
        if code in TERMINAL:
            return current
        if time.monotonic() - started > timeout_seconds:
            raise NodeODMError(
                f"task {task_uuid} did not finish within {timeout_seconds}s "
                f"(boundary: a single ODM run may not exceed 3 hours)"
            )
        time.sleep(poll_seconds)


def download_all_zip(host: str, task_uuid: str, dest: Path) -> Path:
    hostname, port, is_https = _split_host(host)
    cls = http.client.HTTPSConnection if is_https else http.client.HTTPConnection
    conn = cls(hostname, port, timeout=300)
    try:
        conn.request("GET", f"/task/{task_uuid}/download/all.zip")
        resp = conn.getresponse()
        raw = resp.read()
    finally:
        conn.close()
    # A 200 with {"error": "Invalid asset"} is NodeODM's real failure shape
    # for this endpoint (measured live) -- never trust status 200 alone.
    if raw[:20].lstrip().startswith(b'{"error"'):
        raise NodeODMError(f"download all.zip for {task_uuid}: {raw[:200]!r}")
    if resp.status >= 400:
        raise NodeODMError(f"download all.zip for {task_uuid}: HTTP {resp.status}")
    dest.write_bytes(raw)
    return dest


def restart(host: str, task_uuid: str, options: list[dict]) -> None:
    """Resume a task from wherever ODM's own on-disk state left it (e.g.
    `rerun-from` in `options`), reusing NodeODM's stored project directory --
    this is the resume mechanism ADR 0006 says the Runner should not have to
    build itself. Confirmed live: a fresh opensfm-only task, restarted with
    rerun-from=opensfm, resumed past feature matching straight into dense
    reconstruction rather than restarting the whole task.
    """
    body = json.dumps({"uuid": task_uuid, "options": options}).encode()
    data = _request(host, "POST", "/task/restart", body=body, headers={"Content-Type": "application/json"})
    if not data.get("success"):
        raise NodeODMError(f"restart {task_uuid} failed: {data}")


def remove(host: str, task_uuid: str) -> None:
    """Delete a task's data from the container. Task data lives inside NodeODM's
    own volume, not the Runner's workdir, so nothing else frees it."""
    body = json.dumps({"uuid": task_uuid}).encode()
    try:
        _request(host, "POST", "/task/remove", body=body, headers={"Content-Type": "application/json"})
    except NodeODMError:
        pass  # best-effort cleanup; a missing task is not this caller's problem
