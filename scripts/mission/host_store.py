"""The host's one door to the store: credentials, the Card Ledger, the manifest
and the skip list.

Collect, Load and the board used to each carry their own copy of "read the env
file, authorize, download, merge, upload", with different catches; load.py even
imported its authorization from the Collect CLI. They all come here now, and
there is one error convention: transport failures (refused, unreachable, timed
out, failed a checksum, unparseable) arrive as `StoreError`; nothing in this
file exits. A script decides whether that is fatal. The reports are the
exception by design: they are bookkeeping after the Cards are written, so they
print what failed and never raise (ADR 0019).

No Controller and no mount: importing this cannot touch one.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import b2
import b2_status
import host_push
import keys
from b2 import StoreError
from load_core import LedgerUnreadable  # the Load module's error; raised here, handled there

__all__ = ["StoreError", "LedgerUnreadable", "Session", "HostStore", "load_env", "update_ledger"]


def load_env(path: Path, required: tuple[str, ...] = ("B2_KEY_ID", "B2_APP_KEY")) -> dict[str, str]:
    """Parse KEY=VALUE lines from a credentials file. Never logs a value."""
    if not path.exists():
        raise StoreError(f"no credentials at {path}")
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    missing = [k for k in required if k not in env]
    if missing:
        raise StoreError(f"{path} is missing {', '.join(missing)}")
    return env


class Session:
    """An authorized connection: the verified list, download and upload of b2.py."""

    def __init__(self, auth: dict):
        self.auth = auth
        self.token = auth["authorizationToken"]
        self.bucket = auth["allowed"]["bucketName"]
        self.bucket_id = auth["allowed"]["bucketId"]

    @classmethod
    def open(cls, config: Path, required: tuple[str, ...] = ("B2_KEY_ID", "B2_APP_KEY")) -> "Session":
        env = load_env(config, required)
        return cls(b2.authorize(env["B2_KEY_ID"], env["B2_APP_KEY"]))

    def list_names(self, prefix: str) -> list[str]:
        return b2.list_names(self.auth["apiUrl"], self.token, self.bucket_id, prefix)

    def download(self, key: str) -> bytes:
        """Raises FileNotFoundError when the key is not there, StoreError on any fault."""
        return b2.download(self.auth["downloadUrl"], self.bucket, key, self.token)

    def upload(self, key: str, body: bytes) -> None:
        b2.upload(self.auth["apiUrl"], self.token, self.bucket_id, key, body)

    def read_json(self, key: str, missing):
        """The object parsed, `missing` when it was never written, StoreError when unparseable."""
        try:
            return json.loads(self.download(key))
        except FileNotFoundError:
            return missing
        except ValueError as e:
            raise StoreError(f"{key} is not valid JSON ({e})") from e

    def write_json(self, key: str, obj) -> None:
        self.upload(key, json.dumps(obj, indent=1, sort_keys=True).encode())


def update_ledger(store, change: Callable[[dict], dict], *, settle_s: float,
                  sleep: Callable[[float], None], tries: int = 3) -> dict:
    """Apply change to the Ledger as it is now, write it only if it changed, and
    check the write survived. Works over anything with fetch_ledger/publish_ledger.

    Re-read immediately before writing, as the planner does: a Load takes long
    enough for the operator to Dispatch in the middle of it, and writing back
    the copy read at the start would erase that Reservation. Then read back
    after a moment, because the store has no compare-and-swap: a planner write
    in flight when ours landed can overwrite it, and ours can overwrite theirs
    -- the planner checks its side the same way (#152).
    """
    # ponytail: narrows the race to the settle window; only a store with
    # compare-and-swap, or one writer, closes it.
    for _ in range(tries):
        base = store.fetch_ledger()
        changed = change(base)
        if changed == base:
            return changed
        store.publish_ledger(changed)
        if settle_s:
            sleep(settle_s)
        after = store.fetch_ledger()
        if b2_status.change_survived(base, changed, after):
            return after
    raise LedgerUnreadable("the Card Ledger kept changing while the host was writing it, "
                           "so its change could not be confirmed")


class HostStore:
    """The store as the host uses it, over the status key's credentials file.

    Each report also tells the operator's phone (host_push, #319) when a
    push.env sits beside the status credentials; without one, nothing is sent.
    """

    def __init__(self, status_config: Path, *, connect: Callable[[Path], Session] | None = None):
        self.status_config = status_config
        self._connect = connect or Session.open

    def _tell(self, event: dict) -> None:
        host_push.tell(self.status_config.parent, event)

    def _session(self) -> Session:
        return self._connect(self.status_config)

    # --- the Card Ledger: raises, because a caller must not act on a guess ---

    def fetch_ledger(self) -> dict:
        """The Card Ledger from the store; an empty one only if it was never written.

        A Ledger that cannot be read raises instead of coming back empty. It used to
        come back empty, and every run then published the pool onto that empty
        copy -- erasing every Reservation and every written Card on one failed
        read, after which a Dispatch could be given a Card still holding an unflown
        Mission (#161). The host never chooses Cards for itself, and never writes a
        Ledger it did not read.
        """
        if not self.status_config.exists():
            raise LedgerUnreadable(f"no status credentials at {self.status_config}")
        try:
            found = self._session().read_json(keys.LEDGER_KEY, None)
            if found is None:
                return dict(b2_status.EMPTY_LEDGER)
            return {"pool": found.get("pool", []), "holdings": found.get("holdings", {}),
                    **({"verified_at": found["verified_at"]} if "verified_at" in found else {})}
        except (StoreError, AttributeError) as e:
            raise LedgerUnreadable(f"the Card Ledger could not be read ({e})") from e

    def publish_ledger(self, ledger: dict) -> None:
        """Write the Ledger back. Raises LedgerUnreadable: the caller (update_ledger)
        is bookkeeping after the Cards are written and decides how loud to be."""
        if not self.status_config.exists():
            raise LedgerUnreadable(f"no status credentials at {self.status_config}; the Card Ledger was not updated")
        try:
            self._session().write_json(keys.LEDGER_KEY, ledger)
        except StoreError as e:
            raise LedgerUnreadable(f"the Card Ledger was not updated ({e})") from e
        print("Updated the Card Ledger")

    def update_ledger(self, change: Callable[[dict], dict], *, settle_s: float,
                      sleep: Callable[[float], None]) -> dict:
        return update_ledger(self, change, settle_s=settle_s, sleep=sleep)

    # --- the skip list ---

    def fetch_skipped(self) -> dict:
        """specKey -> {withdrawn_at}; {} if never written. Raises StoreError."""
        found = self._session().read_json(keys.SKIPPED_KEY, {})
        return found if isinstance(found, dict) else {}

    # --- the manifest: bookkeeping, loud and never fatal ---

    def _bookkeep(self, change: Callable[[dict], object], *, missing: str, failed: str, done: str) -> None:
        """Read-merge-write the manifest. Prints one line and never raises."""
        if not self.status_config.exists():
            print(f"no status credentials at {self.status_config}; {missing}")
            return
        try:
            session = self._session()
            manifest = session.read_json(keys.STATUS_KEY, {})
            change(manifest)
            session.write_json(keys.STATUS_KEY, manifest)
        except StoreError as e:
            print(failed.format(e))
            return
        print(done)

    def report_drift(self, drift: list[dict]) -> None:
        """Put the disagreement where the planner can withhold readiness over it."""
        self._bookkeep(lambda m: b2_status.merge_drift(m, drift, b2_status.utcnow()),
                       missing="drift not reported", failed="drift report failed ({})",
                       done=f"Reported {len(drift)} disagreeing Card(s) to the manifest" if drift
                       else "Card Ledger agrees with the Controller")

    def report_refusal(self, kind: str, spec_keys: list[str], reason: str) -> None:
        """Write a refusal into the manifest so the planner shows it above the
        Missions it held up. The operator must never learn of it only from a cron log."""
        self._bookkeep(lambda m: b2_status.merge_refusal(m, kind, spec_keys, reason, b2_status.utcnow()),
                       missing="the refusal was not reported", failed="the refusal was not reported ({})",
                       done="Reported the refusal to the manifest")
        self._tell({"event": "refused", "keys": spec_keys[:50], "reason": reason})

    def report_overflow(self, spec_keys: list[str], needed: int, have: int) -> None:
        """The atomic refusal, shown against the waiting missions on the Status tab."""
        self._bookkeep(lambda m: b2_status.merge_overflow(m, spec_keys, needed, have, b2_status.utcnow()),
                       missing="overflow not reported", failed="overflow report failed ({})",
                       done="Reported the overflow refusal to the manifest")
        self._tell({"event": "refused", "keys": spec_keys[:50], "reason": host_push.overflow_reason(needed, have)})

    def report_loaded(self, entries: list[tuple[str, list[tuple[str, dict]]]]) -> None:
        """Stamp the manifest so the planner shows Loaded with card names. The cards
        are already written, so a failure here must not cost the run."""
        def change(m: dict) -> None:
            b2_status.clear_notice(m)
            b2_status.merge_loaded(m, entries, b2_status.utcnow())
        self._bookkeep(change, missing="manifest not updated",
                       failed="manifest update failed ({}); the Load itself succeeded",
                       done=f"Reported {len(entries)} Loaded to the manifest")
        # The notice that matters: which Card to open.
        if entries:
            self._tell({"event": "loaded", "loads": [{"key": key, "cards": [card for card, _ in loaded]}
                                                     for key, loaded in entries][:50]})

    def report_collected(self, spec_keys: list[str]) -> None:
        self._bookkeep(lambda m: b2_status.merge_collected(m, spec_keys, b2_status.utcnow()),
                       missing="manifest not updated", failed="manifest update failed ({}); the Collect itself succeeded",
                       done=f"Reported {len(spec_keys)} Collected to the manifest")
        if spec_keys:
            self._tell({"event": "collected", "keys": spec_keys[:50]})
