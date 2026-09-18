"""One storage adapter for the host scripts: authorize, list, verified download,
verified upload.

Three host scripts used to carry their own copy of this. They differed in ways
that mattered: the collector verified the checksum the provider returns with
every download, the status writer verified nothing in either direction, so a
truncated read of the manifest was indistinguishable from a real one. Checksum
verification belongs to the adapter, not to whichever script was called.

The credentials names are one contract too: B2_KEY_ID / B2_APP_KEY / B2_BUCKET.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account"


def authorize(key_id: str, app_key: str) -> dict:
    """v2 only: v3 nests this same data under apiInfo and breaks every field access."""
    token = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
    req = urllib.request.Request(AUTHORIZE_URL, headers={"Authorization": f"Basic {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"authorize failed: {e.code} {e.reason}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach B2: {e.reason}")


def list_names(api_url: str, token: str, bucket_id: str, prefix: str) -> list[str]:
    """Every file name under prefix, following nextFileName until the provider stops."""
    names: list[str] = []
    start = None
    while True:
        body: dict = {"bucketId": bucket_id, "prefix": prefix, "maxFileCount": 1000}
        if start:
            body["startFileName"] = start
        req = urllib.request.Request(
            f"{api_url}/b2api/v2/b2_list_file_names",
            data=json.dumps(body).encode(),
            headers={"Authorization": token, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                page = json.load(resp)
        except urllib.error.HTTPError as e:
            sys.exit(f"list failed: {e.code} {e.reason}")
        names.extend(f["fileName"] for f in page["files"])
        start = page.get("nextFileName")
        if not start:
            return names


def download(download_url: str, bucket: str, key: str, token: str) -> bytes:
    """Fetch one object and verify it against the provider's own checksum.

    A truncated or corrupted body must never be parsed as if it were real, so a
    mismatch is fatal here rather than a caller's problem.
    """
    url = f"{download_url}/file/{bucket}/{urllib.parse.quote(key, safe='/')}"
    req = urllib.request.Request(url, headers={"Authorization": token})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            expected = resp.headers.get("X-Bz-Content-Sha1", "")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise FileNotFoundError(key) from e
        sys.exit(f"download of {key} failed: {e.code} {e.reason}")
    actual = hashlib.sha1(data).hexdigest()
    if actual != expected:
        sys.exit(f"download of {key} failed its checksum: got {actual}, provider said {expected!r}")
    return data


def upload(api_url: str, token: str, bucket_id: str, key: str, body: bytes) -> None:
    """Upload one object under its own key, checksummed so the provider can verify it."""
    req = urllib.request.Request(
        f"{api_url}/b2api/v2/b2_get_upload_url",
        data=json.dumps({"bucketId": bucket_id}).encode(),
        headers={"Authorization": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            up = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"upload url for {key} failed: {e.code} {e.reason}")
    req = urllib.request.Request(
        up["uploadUrl"],
        data=body,
        headers={
            "Authorization": up["authorizationToken"],
            "X-Bz-File-Name": urllib.parse.quote(key, safe="/"),
            "Content-Type": "application/json",
            "X-Bz-Content-Sha1": hashlib.sha1(body).hexdigest(),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as e:
        sys.exit(f"upload of {key} failed: {e.code} {e.reason}")


class _FakeResponse:
    def __init__(self, body: bytes, sha1: str | None):
        self._body = body
        self.headers = {"X-Bz-Content-Sha1": sha1} if sha1 else {}

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _selftest() -> None:
    """Offline, against a stubbed transport: a good body passes, a body the
    provider's checksum disagrees with is fatal, and a missing checksum is fatal."""
    good = b'{"ok": true}'
    digest = hashlib.sha1(good).hexdigest()
    real = urllib.request.urlopen
    try:
        urllib.request.urlopen = lambda *a, **k: _FakeResponse(good, digest)
        assert download("https://dl", "bucket", "k", "tok") == good

        urllib.request.urlopen = lambda *a, **k: _FakeResponse(good, "0" * 40)
        try:
            download("https://dl", "bucket", "k", "tok")
            raise AssertionError("a checksum mismatch must be fatal")
        except SystemExit:
            pass

        urllib.request.urlopen = lambda *a, **k: _FakeResponse(good, None)
        try:
            download("https://dl", "bucket", "k", "tok")
            raise AssertionError("a missing checksum must be fatal")
        except SystemExit:
            pass
    finally:
        urllib.request.urlopen = real
    print("b2 self-check: ok")


if __name__ == "__main__":
    _selftest()
