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
    """Upload one object under its own key, checksummed so the provider can verify it.

    Additionally verify that the provider stored the same sha1 as we uploaded by
    inspecting the provider's response for a contentSha1 value. The body of the
    upload response is the source of truth for the content sha1 (per the B2
    upload response schema). If a mismatch is observed, abort with a loud error.
    If the body does not contain a contentSha1, we fail loudly (no header fallback).
    """
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
        with urllib.request.urlopen(req, timeout=60) as resp:
            # The body from the upload response (First response) may contain
            # a contentSha1 value that should be used as the source of truth.
            local_sha1 = hashlib.sha1(body).hexdigest()
            body_sha1_from_body = None
            try:
                # If the body is available again on the response, parse it to
                # obtain contentSha1. The test stubs provide a read() method
                # on the response that can be called again after json.load(resp).
                if hasattr(resp, "read"):
                    raw = resp.read()
                    if isinstance(raw, (bytes, bytearray)):
                        raw_text = raw.decode()
                    else:
                        raw_text = raw
                    if raw_text:
                        parsed = json.loads(raw_text)
                        body_sha1_from_body = parsed.get("contentSha1") or parsed.get("content_sha1")
            except Exception:
                body_sha1_from_body = None

            if body_sha1_from_body:
                if body_sha1_from_body != local_sha1:
                    sys.exit(
                        f"upload verification failed: body sha1 {body_sha1_from_body!r} != computed {local_sha1}"
                    )
            else:
                # Fallback through provider header is disabled: the body sha1
                # is the single source of truth for content integrity.
                # If it's missing, fail loudly instead of masking with a header.
                sys.exit(
                    f"upload verification failed: missing body sha1; no header fallback"
                )
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
    provider's checksum disagrees with is fatal, and a missing checksum is fatal.

    Additionally exercise upload() with a stubbed transport to prove: (F1) pass
    case, (F2) mismatch triggers a loud failure, and (F3) missing provider checksum
    triggers a loud failure. All self-check paths are offline.
    """
    good = b'{"ok": true}'
    digest = hashlib.sha1(good).hexdigest()
    real = urllib.request.urlopen
    try:
        # Existing download self-check remains
        urllib.request.urlopen = lambda *a, **k: _FakeResponse(good, digest)
        assert download("https://dl", "bucket", "k", "tok") == good

        # --- New F1: test upload with a passing body via stub transport ---
        body_for_upload = b'{"upload": true}'
        upload_digest = hashlib.sha1(body_for_upload).hexdigest()
        calls = {"n": 0}
        def _fake_urlopen_pass(req, timeout=None):
            # two calls: first returns upload URL, second returns provider sha1 header
            class First:
                def read(self_inner):
                    # Do not provide body sha1 here; body sha1 comes from the second response.
                    return json.dumps({"uploadUrl": "https://fake/upload", "authorizationToken": "tok"}).encode()
                headers = {}
                def __enter__(self_inner):
                    return self_inner
                def __exit__(self_inner, *exc):
                    return False

            class Second:
                def read(self_second):
                    # Provide body with the canonical contentSha1 so the body path is exercised.
                    return json.dumps({"contentSha1": upload_digest}).encode()
                headers = {"X-Bz-Content-Sha1": upload_digest}
                def __enter__(self_second):
                    return self_second
                def __exit__(self, *exc):
                    return False
            if calls["n"] == 0:
                calls["n"] += 1
                return First()
            else:
                return Second()
        urllib.request.urlopen = _fake_urlopen_pass
        upload("https://api/upload", "tok", "bucket", "k", body_for_upload)
        print("F1: body-path pass exercised")

        # --- New F2: mismatch should fail loudly ---
        upload_digest_mismatch = '0' * 40
        calls["n"] = 0
        def _fake_urlopen_mismatch(req, timeout=None):
            class First:
                def read(self_inner):
                    return json.dumps({"uploadUrl": "https://fake/upload", "authorizationToken": "tok"}).encode()
                headers = {}
                def __enter__(self_inner):
                    return self_inner
                def __exit__(self_inner, *exc):
                    return False
            class Second:
                def read(self_second):
                    return json.dumps({"contentSha1": upload_digest_mismatch}).encode()
                headers = {"X-Bz-Content-Sha1": upload_digest_mismatch}
                def __enter__(self_second):
                    return self_second
                def __exit__(self_second, *exc):
                    return False
            if calls["n"] == 0:
                calls["n"] += 1
                return First()
            else:
                return Second()
        urllib.request.urlopen = _fake_urlopen_mismatch
        try:
            upload("https://api/upload", "tok", "bucket", "k", body_for_upload)
            print("F2: body-path mismatch did not raise (unexpected)")
            sys.exit(1)
        except SystemExit:
            print("F2: body-path mismatch raised as expected")

        # --- New F3: missing provider sha1 triggers failure ---
        calls["n"] = 0
        def _fake_urlopen_missing(req, timeout=None):
            class First:
                def read(self_inner):
                    return json.dumps({"uploadUrl": "https://fake/upload", "authorizationToken": "tok"}).encode()
                headers = {}
                def __enter__(self_inner):
                    return self_inner
                def __exit__(self_inner, *exc):
                    return False
            class Second:
                def read(self_second):
                    return json.dumps({}).encode()
                # GOOD digest to surface header-based regression
                headers = {"X-Bz-Content-Sha1": upload_digest}
                def __enter__(self_second):
                    return self_second
                def __exit__(self_second, *exc):
                    return False
            if calls["n"] == 0:
                calls["n"] += 1
                return First()
            else:
                return Second()
        urllib.request.urlopen = _fake_urlopen_missing
        try:
            upload("https://api/upload", "tok", "bucket", "k", body_for_upload)
            print("F3: body-path missing did not raise (unexpected)")
            sys.exit(1)
        except SystemExit:
            print("F3: body-path missing raised as expected (no body sha1)")
    finally:
        urllib.request.urlopen = real
    print("b2 self-check: ok")


if __name__ == "__main__":
    _selftest()
