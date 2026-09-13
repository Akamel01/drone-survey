#!/usr/bin/env python3
"""nodes/publish/publish.py — upload a Delivery Bundle to Backblaze B2 (ADR 0011).

Talks to B2's native API directly over stdlib `urllib` (no boto3/S3 SDK
installed, and none is added for this). Reads the bundle's own
bundle-manifest.json (written by nodes/bundle/build.py) for the file list,
sizes, and bundle id, and uploads each file to
`b2://<bucket>/bundles/<bundle-id>/<path>`, verifying the provider's response
size/hash against what was sent (ADR 0018's verification spirit — a 200
response is not proof of a good upload).

Credentials come from an env file (KEY=VALUE lines), default
~/.config/wayfinder/b2-delivery.env, holding B2_KEY_ID and
B2_APPLICATION_KEY. That file's contents are never printed. Without it (or
without both keys in it), a real run refuses outright rather than failing
silently or partway through; --dry-run needs no credentials at all, since
the bucket and key this ticket targets do not exist yet.

    python3 publish.py --bundle DIR --bucket NAME --dry-run
    python3 publish.py --bundle DIR --bucket NAME               # real upload
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
from pathlib import Path
from urllib import error, parse, request

B2_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v3/b2_authorize_account"


def load_bundle_manifest(bundle_dir: Path) -> dict:
    manifest_path = bundle_dir / "bundle-manifest.json"
    if not manifest_path.is_file():
        sys.exit(f"{bundle_dir} has no bundle-manifest.json — is this a built Bundle? (run nodes/bundle/build.py first)")
    return json.loads(manifest_path.read_text())


def read_credentials(path: Path) -> tuple[str, str]:
    """Refuse loudly if the credentials file is missing or incomplete. Never printed."""
    if not path.is_file():
        sys.exit(f"refusing to publish: no credentials file at {path}")
    key_id = app_key = None
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip("'\"")
        if k == "B2_KEY_ID":
            key_id = v
        elif k == "B2_APPLICATION_KEY":
            app_key = v
    if not key_id or not app_key:
        sys.exit(f"refusing to publish: {path} is missing B2_KEY_ID and/or B2_APPLICATION_KEY")
    return key_id, app_key


def b2_call(url: str, headers: dict, data: bytes | None = None) -> dict:
    req = request.Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
    try:
        with request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except error.HTTPError as e:
        sys.exit(f"B2 request to {url.split('?')[0]} failed: HTTP {e.code} {e.reason}")
    except error.URLError as e:
        sys.exit(f"B2 request to {url.split('?')[0]} failed: {e.reason}")


def b2_authorize(key_id: str, app_key: str) -> dict:
    token = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
    return b2_call(B2_AUTHORIZE_URL, {"Authorization": f"Basic {token}"})  # GET, no body


def b2_get_upload_url(api_url: str, auth_token: str, bucket_id: str) -> dict:
    return b2_call(
        f"{api_url}/b2api/v3/b2_get_upload_url",
        {"Authorization": auth_token, "Content-Type": "application/json"},
        data=json.dumps({"bucketId": bucket_id}).encode(),
    )


def b2_upload_file(upload_url: str, upload_auth_token: str, key: str, data: bytes, sha1_hex: str) -> dict:
    headers = {
        "Authorization": upload_auth_token,
        "X-Bz-File-Name": parse.quote(key),
        "Content-Type": mimetypes.guess_type(key)[0] or "b2/x-auto",
        "Content-Length": str(len(data)),
        "X-Bz-Content-Sha1": sha1_hex,
    }
    return b2_call(upload_url, headers, data=data)


def dry_run(bundle_dir: Path, manifest: dict, bucket: str, creds_path: Path) -> None:
    bundle_id = manifest["bundle_id"]
    files = manifest["files"]
    found = "found" if creds_path.is_file() else "MISSING (a real run would refuse)"
    print(f"DRY RUN: credentials file {creds_path}: {found} — not read")
    print(f"DRY RUN: would publish bundle {bundle_id} ({len(files)} files) to b2://{bucket}/bundles/{bundle_id}/")
    total = 0
    for f in files:
        print(f"  would upload bundles/{bundle_id}/{f['path']}  {f['size']} bytes  sha256={f['sha256'][:12]}...")
        total += f["size"]
    print(f"DRY RUN: total {total} bytes across {len(files)} files; no network request made")


def publish(bundle_dir: Path, manifest: dict, bucket: str, creds_path: Path) -> None:
    bundle_id = manifest["bundle_id"]
    files = manifest["files"]

    key_id, app_key = read_credentials(creds_path)
    auth = b2_authorize(key_id, app_key)
    allowed = auth.get("allowed") or {}
    if allowed.get("bucketName") and allowed["bucketName"] != bucket:
        sys.exit(f"refusing to publish: this application key is scoped to bucket '{allowed['bucketName']}', not '{bucket}'")
    bucket_id = allowed.get("bucketId")
    if not bucket_id:
        sys.exit("refusing to publish: could not determine a bucket id from this application key (expected a single-bucket-scoped key; see docs/business/object-storage-setup.md)")

    upload_info = b2_get_upload_url(auth["apiUrl"], auth["authorizationToken"], bucket_id)
    total = 0
    for f in files:
        full = bundle_dir / f["path"]
        data = full.read_bytes()
        sha1_hex = hashlib.sha1(data).hexdigest()
        key = f"bundles/{bundle_id}/{f['path']}"
        result = b2_upload_file(upload_info["uploadUrl"], upload_info["authorizationToken"], key, data, sha1_hex)
        # ADR 0018: a 200 isn't proof of a good upload — check what the provider says it stored.
        if result.get("contentSha1") != sha1_hex or result.get("contentLength") != len(data):
            sys.exit(f"upload verification failed for {key}: provider reported a different size/hash than sent")
        print(f"uploaded {key}  {len(data)} bytes  verified")
        total += len(data)
    print(f"published {len(files)} files ({total} bytes) to b2://{bucket}/bundles/{bundle_id}/")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--bundle", required=True, help="a Bundle directory built by nodes/bundle/build.py")
    p.add_argument("--bucket", required=True, help="the B2 bucket name, e.g. wayfinder-delivery-bundles")
    p.add_argument(
        "--creds",
        default=os.environ.get("WAYFINDER_B2_DELIVERY_CREDS", str(Path.home() / ".config" / "wayfinder" / "b2-delivery.env")),
        help="env file with B2_KEY_ID / B2_APPLICATION_KEY (never printed)",
    )
    p.add_argument("--dry-run", action="store_true", help="print the upload plan; no network request")
    args = p.parse_args()

    bundle_dir = Path(args.bundle)
    manifest = load_bundle_manifest(bundle_dir)
    creds_path = Path(args.creds).expanduser()

    if args.dry_run:
        dry_run(bundle_dir, manifest, args.bucket, creds_path)
    else:
        publish(bundle_dir, manifest, args.bucket, creds_path)


if __name__ == "__main__":
    main()
