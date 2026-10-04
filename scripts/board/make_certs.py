#!/usr/bin/env python3
"""Make the board's own certificate authority and the certificate the phone trusts (LOADER-2, #317).

    python3 make_certs.py --ip 172.20.10.4 --ip 192.168.43.1

Creates, in a folder OUTSIDE any git tree (default ~/.config/board-ca):

    ca.key                       the CA private key, mode 0600. Never leaves this machine.
    ca.crt                       the CA certificate (public)
    board-ca.mobileconfig        iOS profile holding ca.crt only (never a key)
    board/board.crt, board.key   the board's certificate and key: copy these two to the board

The board certificate names `board.local`, `localhost`, 127.0.0.1 and every
`--ip` given, and lives 800 days: Apple refuses a TLS server certificate valid
longer than 825 days (https://support.apple.com/en-us/103769, "TLS server
certificates ... must have a validity period of 825 days or fewer"). Certificates
from a user-added root are exempt from Apple's later 398-day limit
(https://support.apple.com/en-us/102028). Re-run any time the board's addresses
change: the CA is kept, a fresh board certificate is issued. To rotate the CA,
delete the folder and run again (the phone then needs the new profile).

Standard library plus the `openssl` command. Key material is written to files by
openssl and never printed.
"""

from __future__ import annotations

import argparse
import ipaddress
import os
import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

DEFAULT_DIR = Path.home() / ".config" / "board-ca"
HOST = "board.local"
APPLE_MAX_DAYS = 825  # Apple's cap on a TLS server certificate's validity
LEAF_DAYS = 800
CA_DAYS = 3650
# The CA may only vouch for these names: if its key ever leaked, a phone that trusts it
# could still not be shown a certificate for a real website.
PERMITTED = ("DNS:board.local", "DNS:localhost", "IP:127.0.0.0/255.0.0.0", "IP:10.0.0.0/255.0.0.0",
             "IP:172.16.0.0/255.240.0.0", "IP:192.168.0.0/255.255.0.0", "IP:169.254.0.0/255.255.0.0")


def in_git_tree(path: Path) -> bool:
    return any((p / ".git").exists() for p in [path.resolve(), *path.resolve().parents])


def openssl(*args: str) -> str:
    done = subprocess.run(["openssl", *args], capture_output=True, text=True)
    if done.returncode:
        sys.exit(f"openssl {args[0]} failed: {done.stderr.strip()}")
    return done.stdout


def private_key(path: Path) -> None:
    old = os.umask(0o077)  # never world-readable, not even for an instant
    try:
        openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(path))
    finally:
        os.umask(old)
    path.chmod(0o600)


def sign(key: Path, out: Path, subject: str, ext: str, days: int, ca: tuple[Path, Path] | None) -> None:
    """A certificate for `key`, self-signed or signed by `ca` = (cert, key), with extension text `ext`."""
    with tempfile.TemporaryDirectory() as tmp:
        csr, extfile = Path(tmp) / "req.csr", Path(tmp) / "ext.cnf"
        extfile.write_text("[ext]\n" + ext)
        openssl("req", "-new", "-key", str(key), "-subj", subject, "-out", str(csr))
        base = ["x509", "-req", "-in", str(csr), "-sha256", "-days", str(days), "-extfile", str(extfile),
                "-extensions", "ext", "-set_serial", "0x" + os.urandom(16).hex(), "-out", str(out)]
        openssl(*base, *(["-CA", str(ca[0]), "-CAkey", str(ca[1])] if ca else ["-signkey", str(key)]))


def make_ca(folder: Path) -> Path:
    crt, key = folder / "ca.crt", folder / "ca.key"
    if crt.exists() and key.exists():
        return crt
    private_key(key)
    sign(key, crt, "/CN=Wayfinder board CA", "basicConstraints=critical,CA:TRUE,pathlen:0\n"
         "keyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n"
         "nameConstraints=critical,permitted;" + ",permitted;".join(PERMITTED) + "\n", CA_DAYS, None)
    return crt


def san(hosts: list[str], ips: list[str]) -> str:
    return ",".join([f"DNS:{h}" for h in hosts] + [f"IP:{i}" for i in ips])


def issue_board_cert(folder: Path, ips: list[str], days: int = LEAF_DAYS) -> Path:
    if not 0 < days <= APPLE_MAX_DAYS:
        sys.exit(f"--days must be 1 to {APPLE_MAX_DAYS}: iOS refuses a longer-lived server certificate.")
    if subprocess.run(["openssl", "x509", "-in", str(folder / "ca.crt"), "-noout", "-checkend", str(days * 86400)],
                      capture_output=True).returncode:  # exit 1: the CA would expire first
        sys.exit("The CA expires before this certificate would: delete the folder to start a new CA.")
    out = folder / "board"
    out.mkdir(mode=0o700, exist_ok=True)
    private_key(out / "board.key")
    sign(out / "board.key", out / "board.crt", f"/CN={HOST}",
         f"basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n"
         f"subjectAltName={san([HOST, 'localhost'], ['127.0.0.1', *ips])}\nsubjectKeyIdentifier=hash\n"
         "authorityKeyIdentifier=keyid\n", days, (folder / "ca.crt", folder / "ca.key"))
    return out / "board.crt"


def make_profile(folder: Path) -> Path:
    """An iOS configuration profile carrying the CA certificate only. Unsigned: iOS says so, and asks."""
    der = subprocess.run(["openssl", "x509", "-in", str(folder / "ca.crt"), "-outform", "der"],
                         capture_output=True, check=True).stdout
    fingerprint = uuid.uuid5(uuid.NAMESPACE_URL, der.hex())  # same CA, same ids: a reinstall replaces, never doubles
    cert = {"PayloadType": "com.apple.security.root", "PayloadVersion": 1, "PayloadContent": der,
            "PayloadIdentifier": "local.wayfinder.board-ca.cert", "PayloadUUID": str(uuid.uuid5(fingerprint, "cert")),
            "PayloadDisplayName": "Wayfinder board CA certificate"}
    profile = {"PayloadType": "Configuration", "PayloadVersion": 1, "PayloadContent": [cert],
               "PayloadIdentifier": "local.wayfinder.board-ca", "PayloadUUID": str(fingerprint),
               "PayloadDisplayName": "Wayfinder board", "PayloadOrganization": "Wayfinder",
               "PayloadDescription": "Lets this iPhone trust the Wayfinder board at https://board.local. "
                                     "Holds a certificate only, no key."}
    path = folder / "board-ca.mobileconfig"
    path.write_bytes(plistlib.dumps(profile))
    return path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", type=Path, default=DEFAULT_DIR, help=f"where the CA lives (default {DEFAULT_DIR}); must be outside any git tree")
    p.add_argument("--ip", action="append", default=[], help="an address the board is reached by (repeatable)")
    p.add_argument("--days", type=int, default=LEAF_DAYS, help=f"board certificate lifetime, at most {APPLE_MAX_DAYS} (default {LEAF_DAYS})")
    args = p.parse_args()
    folder = args.dir.expanduser()
    if in_git_tree(folder):
        sys.exit(f"{folder} is inside a git tree. The CA key must never sit where it could be committed; choose another --dir.")
    try:
        ips = [str(ipaddress.ip_address(i)) for i in args.ip]
    except ValueError as e:
        sys.exit(str(e))
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    folder.chmod(0o700)
    make_ca(folder)
    crt = issue_board_cert(folder, ips, args.days)
    profile = make_profile(folder)
    print(f"CA certificate     {folder / 'ca.crt'}\nCA key (stays here) {folder / 'ca.key'}\n"
          f"iOS profile        {profile}\nBoard certificate  {crt}\nBoard key          {crt.with_suffix('.key')}\n"
          f"Copy board.crt and board.key to the board; send the profile to the iPhone. See README.md.")


if __name__ == "__main__":
    main()
