"""Tell the operator's phone what only the host sees (PWA-5, #319).

Collected, Loaded (with the Card to open) and a Load refused are POSTed to the
planner's /api/push/host, which words them and sends the Web Push / ntfy
notices. The host keeps no push keys and no subscriptions; it holds one
shared token.

Configuration, beside the status key's credentials (mode 600):

    ~/.config/wayfinder/push.env
        PLANNER_URL=https://<the planner's domain>
        PUSH_HOST_TOKEN=<the same value as the planner's PUSH_HOST_TOKEN>

No file, no notices -- and nothing else changes. Telling the phone is
bookkeeping after the store has been told: this prints one line and never
raises, whatever the planner or the network does. Flown is never sent; it
stays the operator's own mark.

Stdlib only, like every host script.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPEAT_AFTER_S = 30 * 60  # the same refusal is said again after half an hour (load_core.REPEAT_AFTER_S)


def read_config(path: Path) -> dict[str, str] | None:
    """PLANNER_URL and PUSH_HOST_TOKEN, or None when the file or either is missing."""
    try:
        lines = path.read_text().splitlines()
    except OSError:
        return None
    env = {}
    for line in lines:
        key, sep, value = line.strip().partition("=")
        if sep and not key.startswith("#"):
            env[key.strip()] = value.strip()
    if not env.get("PLANNER_URL") or not env.get("PUSH_HOST_TOKEN"):
        return None
    return env


def is_news(record: Path, event: dict, now: float) -> bool:
    """A refusal repeated every cron minute is said once per half hour; every
    other event is always news (each Collect and Load happens once)."""
    if event.get("event") != "refused":
        return True
    try:
        last = json.loads(record.read_text())
    except (OSError, ValueError):
        last = None
    return not (last and last.get("reason") == event["reason"] and now - float(last.get("at", 0)) <= REPEAT_AFTER_S)


def tell(config_dir: Path, event: dict, *, now: float | None = None,
         opener=urllib.request.urlopen) -> bool:
    """POST one event to the planner. True when it was taken. Never raises."""
    try:
        config = read_config(config_dir / "push.env")
        if config is None:
            return False
        record = config_dir / "push-last-refusal.json"
        now = time.time() if now is None else now
        if not is_news(record, event, now):
            return False
        request = urllib.request.Request(
            config["PLANNER_URL"].rstrip("/") + "/api/push/host",
            data=json.dumps(event).encode(),
            headers={"content-type": "application/json", "x-push-token": config["PUSH_HOST_TOKEN"]},
            method="POST",
        )
        with opener(request, timeout=15) as response:
            response.read()
        if event.get("event") == "refused":
            # Only once it was taken: a refusal the planner never heard is
            # tried again on the next run, not silenced for half an hour.
            try:
                record.write_text(json.dumps({"reason": event["reason"], "at": now}))
            except OSError:
                pass
        print(f"Told the phone: {event['event']}")
        return True
    except urllib.error.HTTPError as e:
        print(f"the phone was not told ({event.get('event')}): the planner answered {e.code}")
    except Exception as e:  # noqa: BLE001  -- bookkeeping: nothing here may cost the run
        print(f"the phone was not told ({event.get('event')}): {e}")
    return False


def overflow_reason(needed: int, have: int) -> str:
    return (f"Load refused: {needed} parts do not fit {have} Cards. Nothing was Loaded. "
            "Dispatch fewer Missions or clear a Card, then plug the Controller in again.")


def _selftest() -> int:
    import tempfile

    sent: list[tuple[str, dict, dict]] = []

    class Answer:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"{}"

    def opener(request, timeout):
        sent.append((request.full_url, dict(request.header_items()), json.loads(request.data)))
        return Answer()

    def failing(request, timeout):
        raise urllib.error.URLError("no route to host")

    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        loaded = {"event": "loaded", "loads": [{"key": "specs/a/b/c.json", "cards": ["way finder 1"]}]}
        assert tell(d, loaded, opener=opener) is False and not sent, "no push.env: nothing is sent"
        (d / "push.env").write_text("# host push\nPLANNER_URL=https://planner.example/\nPUSH_HOST_TOKEN=t0k\n")
        assert tell(d, loaded, opener=opener) is True
        url, headers, body = sent[-1]
        assert url == "https://planner.example/api/push/host", url
        assert headers.get("X-push-token") == "t0k", headers
        assert body == loaded
        refused = {"event": "refused", "keys": [], "reason": overflow_reason(3, 2)}
        assert tell(d, refused, now=1000, opener=opener) is True
        assert tell(d, refused, now=1060, opener=opener) is False, "the same refusal a minute later is not news"
        assert tell(d, refused, now=1000 + REPEAT_AFTER_S + 1, opener=opener) is True, "said again after half an hour"
        assert tell(d, loaded, opener=failing) is False, "a dead network is printed, never raised"
        other = {"event": "refused", "keys": [], "reason": "The Controller is locked."}
        assert tell(d, other, now=5000, opener=failing) is False
        assert tell(d, other, now=5060, opener=opener) is True, "a refusal that was not taken is tried again"
        (d / "push.env").write_text("PLANNER_URL=https://planner.example\n")
        assert tell(d, loaded, opener=opener) is False, "no token: nothing is sent"
    print("host_push selftest ok")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    print("usage: host_push.py --selftest  (imported by host_store.py)")
