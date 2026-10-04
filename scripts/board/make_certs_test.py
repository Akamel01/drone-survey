#!/usr/bin/env python3
"""make_certs.py's tests: SANs, lifetime, key permissions, the profile, and that no key can be committed.

    python3 scripts/board/make_certs_test.py

Needs the `openssl` command. Everything is made in a temp dir; nothing is printed of any key.
"""

from __future__ import annotations

import plistlib
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import make_certs  # noqa: E402


def text(cert: Path) -> str:
    return subprocess.run(["openssl", "x509", "-in", str(cert), "-noout", "-text"], capture_output=True, text=True, check=True).stdout


def lifetime_days(cert: Path) -> float:
    dates = dict(l.split("=", 1) for l in subprocess.run(["openssl", "x509", "-in", str(cert), "-noout", "-dates"],
                 capture_output=True, text=True, check=True).stdout.split("\n") if "=" in l)
    parse = lambda s: datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)  # noqa: E731
    return (parse(dates["notAfter"]) - parse(dates["notBefore"])).total_seconds() / 86400


class CertsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(tmp.cleanup)
        cls.dir = Path(tmp.name) / "ca"
        cls.dir.mkdir(mode=0o700)
        make_certs.make_ca(cls.dir)
        cls.crt = make_certs.issue_board_cert(cls.dir, ["172.20.10.4", "192.168.43.1"])
        cls.profile = make_certs.make_profile(cls.dir)

    def test_san_names_board_local_and_every_address_given(self):
        sans = re.search(r"Subject Alternative Name:.*\n\s+(.*)", text(self.crt))[1]
        for want in ("DNS:board.local", "IP Address:172.20.10.4", "IP Address:192.168.43.1", "IP Address:127.0.0.1"):
            self.assertIn(want, sans)

    def test_leaf_is_what_ios_wants(self):
        t = text(self.crt)
        self.assertIn("CA:FALSE", t)
        self.assertIn("TLS Web Server Authentication", t)  # required for a certificate issued after 2019-07-01
        self.assertIn("ecdsa-with-SHA256", t)

    def test_leaf_lifetime_is_within_apples_825_days(self):
        self.assertLessEqual(lifetime_days(self.crt), 825)
        self.assertGreater(lifetime_days(self.crt), 365)  # long enough that the operator is not re-trusting yearly

    def test_days_over_825_is_refused(self):
        for days in (826, 0):
            with self.assertRaises(SystemExit):
                make_certs.issue_board_cert(self.dir, [], days)

    def test_the_chain_verifies_and_the_ca_is_constrained(self):
        done = subprocess.run(["openssl", "verify", "-CAfile", str(self.dir / "ca.crt"), str(self.crt)], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        t = text(self.dir / "ca.crt")
        self.assertIn("CA:TRUE", t)
        self.assertIn("Name Constraints: critical", t)

    def test_a_certificate_for_an_outside_name_does_not_verify_under_the_ca(self):
        # the CA cannot vouch for a real website, even with its own key
        with tempfile.TemporaryDirectory() as tmp:
            key, crt = Path(tmp) / "k", Path(tmp) / "c"
            make_certs.private_key(key)
            make_certs.sign(key, crt, "/CN=example.com", "basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n"
                            "subjectAltName=DNS:example.com\n", 30, (self.dir / "ca.crt", self.dir / "ca.key"))
            done = subprocess.run(["openssl", "verify", "-CAfile", str(self.dir / "ca.crt"), str(crt)], capture_output=True, text=True)
            self.assertNotEqual(done.returncode, 0)

    def test_private_keys_are_owner_only(self):
        for key in (self.dir / "ca.key", self.dir / "board" / "board.key"):
            self.assertEqual(key.stat().st_mode & 0o777, 0o600, key)
        self.assertEqual(self.dir.stat().st_mode & 0o777, 0o700)

    def test_the_profile_holds_the_ca_certificate_and_no_key(self):
        raw = self.profile.read_bytes()
        self.assertNotIn(b"PRIVATE KEY", raw)
        plist = plistlib.loads(raw)
        (payload,) = plist["PayloadContent"]
        self.assertEqual(payload["PayloadType"], "com.apple.security.root")
        der = subprocess.run(["openssl", "x509", "-in", str(self.dir / "ca.crt"), "-outform", "der"], capture_output=True, check=True).stdout
        self.assertEqual(payload["PayloadContent"], der)
        for f in (self.dir / "ca.key", self.dir / "board" / "board.key"):
            self.assertNotIn(f.read_bytes().split(b"\n")[1], raw)  # nothing from a key file

    def test_rerun_keeps_the_ca_and_the_profile_identity(self):
        before = (self.dir / "ca.crt").read_bytes(), plistlib.loads(self.profile.read_bytes())["PayloadUUID"]
        make_certs.make_ca(self.dir)
        make_certs.issue_board_cert(self.dir, ["172.20.10.4", "192.168.43.1"])  # same addresses: tests share this folder
        self.assertEqual(((self.dir / "ca.crt").read_bytes(), plistlib.loads(make_certs.make_profile(self.dir).read_bytes())["PayloadUUID"]), before)


class CannotCommitTest(unittest.TestCase):
    ROOT = HERE.parent.parent

    def test_a_folder_inside_a_git_tree_is_refused(self):
        self.assertTrue(make_certs.in_git_tree(self.ROOT / "scripts" / "board-ca"))
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(make_certs.in_git_tree(Path(tmp) / "ca"))
        done = subprocess.run([sys.executable, str(HERE / "make_certs.py"), "--dir", str(self.ROOT / "scripts" / "board-ca")],
                              capture_output=True, text=True)
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("inside a git tree", done.stderr)
        self.assertFalse((self.ROOT / "scripts" / "board-ca").exists())

    def test_git_ignores_keys_and_the_ca_folder(self):
        for name in ("ca.key", "board/board.key", "scripts/board-ca/anything", "x.pem", "x.p12", "deep/dir/board.key"):
            done = subprocess.run(["git", "-C", str(self.ROOT), "check-ignore", "-q", name])
            self.assertEqual(done.returncode, 0, f"{name} is not git-ignored")

    def test_no_tracked_file_holds_a_private_key(self):
        if not (self.ROOT / ".git").exists():
            self.skipTest("not a git checkout")
        # -e with a split literal so this file does not match itself
        done = subprocess.run(["git", "-C", str(self.ROOT), "grep", "-l", "-e", "-----BEGIN [A-Z ]*" + "PRIVATE KEY"],
                              capture_output=True, text=True)
        self.assertEqual(done.stdout, "", "a tracked file holds a private key")


def run() -> int:
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run())
