# Board Load service

The Linux board next to the Controller (a Pi in the field, ADR 0016; akamel-linux stands in for it in development) serves **Load** to the phone over its hotspot. It lists the Missions waiting to Load, starts a Load of one, and reports the result. The Load itself is `scripts/mission/load.py`, unchanged, run as a child process: the service decides whether to start it and turns its output into JSON. HTTPS arrives in LOADER-2; this is plain HTTP.

Python standard library only (3.9+). One file: `board_service.py`.

## HTTP interface

Default `http://board.local:8787`. Every response is JSON. Only clients on the local network are answered (loopback, private, link-local addresses); anything else gets `403 not_local`. CORS allows any origin, plus `Access-Control-Allow-Private-Network: true` on preflight; narrow it with `--allow-origin`.

A refusal is `{"error": "<code>", "reason": "<a sentence for the operator>"}` with a 4xx status.

### `GET /health`

```json
{"ok": true, "controller": true, "busy": null}
```

`controller`: the Controller's USB id (2ca3:1021) is on the board. `busy`: the id of the Load running now, or `null`.

### `GET /missions`

The Missions ready to Load: Collected, not yet Loaded, not withdrawn, and holding a Reservation in the Card Ledger (the same set cron would Load).

```json
{"missions": [{"id": "g-z2m4tx/2026-09-26/20260926T214926Z-8636f888.json",
               "site": "g-z2m4tx", "date": "2026-09-26", "stamp": "20260926T214926Z-8636f888",
               "cards": ["way finder 4"]}]}
```

`id` is the Spec's path under `specs/`. If the Ledger cannot be read the Missions are still listed, with `"cards": null` and a `"ledger_error"` sentence (the loader will refuse if it must). With no record of past Loads on the board, the list is empty and a `"note"` says why.

### `POST /loads`

Body `{"mission": "<id from /missions>"}`. Only an id from `/missions` is accepted.

| Status | `error` | Meaning |
|---|---|---|
| 202 | | Started. Body is the Load record (below), `state: "running"`. |
| 400 | `bad_request` | Not JSON, or no `mission`. |
| 404 | `not_loadable` | Not waiting to Load: not Collected, already Loaded or withdrawn, or no Reservation. |
| 409 | `controller_absent` | The Controller is not plugged in. Nothing was touched. |
| 409 | `busy` | A Load is running (body has `"load": "<id>"`), or the autoload cron holds its lock. |

### `GET /loads/<id>` and `GET /loads`

```json
{"id": "fb44f056", "mission": "g-z2m4tx/.../20260926T214926Z-8636f888.json",
 "state": "loaded", "started_at": "2026-09-30T09:48:23Z", "finished_at": "2026-09-30T09:49:01Z",
 "reason": null,
 "cards": [{"card": "way finder 4", "mission": "GeorgeTown2 2026-09-26", "waypoints": 125}],
 "output": "<the loader's own words>"}
```

`state` is one of:

- `running`: in flight; poll again.
- `loaded`: written and read back. `cards` lists each Card written and the waypoints (points) inside it.
- `refused`: the loader stopped and put everything back, or touched nothing. `reason` is its message verbatim (locked Controller, Card pool changed, no Reservation, ...).
- `failed`: the loader itself broke, or found no Cards to report, or ran past 15 minutes. `reason` is the last line of its error.

`GET /loads` returns `{"loads": [...]}`, newest first. The last 20 are kept in memory; a restart forgets them.

## Never two Loads at once

Three locks, one per way a second Load could start:

1. **This process.** A second `POST /loads` while one runs gets `409 busy` at once.
2. **The autoload cron.** The service takes the same `flock` the cron line wraps around `collect.py` and `load.py` (`/tmp/wayfinder-load.lock`) for the length of its Load. Cron's `flock -n` then skips that minute, and the service refuses (`409 busy`) while cron is Loading. **The crontab does not change.**
3. **The loader's own Controller lock** (`/tmp/wayfinder-controller.lock`), which `load.py` takes itself, so a Load run by hand is refused too.

## Discovery: `board.local`

The service answers mDNS queries for `board.local` itself (UDP 5353, A records only), so no Avahi and no sudo are needed. It answers with the address the asker can reach, so it follows the hotspot's address. It joins the multicast group on the default interface only.

If the board runs Avahi anyway, the alternative is one line: `sudo hostnamectl set-hostname board`, then start the service with `--no-mdns`. Android Chrome does not resolve `.local` (see #252): use the board's address there.

## Install (no sudo)

The loader is read and run from `../mission`; it is never modified.

```sh
git clone https://github.com/Akamel01/drone-survey ~/drone-survey        # or copy scripts/board and scripts/mission
mkdir -p ~/.config/systemd/user
cp ~/drone-survey/scripts/board/board-service.service ~/.config/systemd/user/
# edit ExecStart if the checkout is elsewhere. If the loader lives somewhere else (akamel-linux: the
# deployed ~/wayfinder/bin, with its calibrated slots), point at it:
echo "BOARD_LOADER_DIR=$HOME/wayfinder/bin" > ~/.config/board-service.env    # optional
systemctl --user daemon-reload
systemctl --user enable --now board-service
curl localhost:8787/health
```

The loader keeps its own configuration: B2 credentials at `~/.config/wayfinder/b2-status.env`, Card calibration in `wayfinder_slots.json` beside `load.py`. The service reads nothing else and never prints them.

Run by hand: `python3 scripts/board/board_service.py [--port N] [--no-mdns] [--allow-origin URL]`.

To keep the service up when nobody is logged in (a headless Pi), the operator runs once: `sudo loginctl enable-linger $USER`. This is the only step that needs sudo, and it is not needed while the user has a session.

## Uninstall

```sh
systemctl --user disable --now board-service
rm ~/.config/systemd/user/board-service.service ~/.config/board-service.env
systemctl --user daemon-reload
rm -rf ~/drone-survey        # if it was cloned for this
```

## Tests

```sh
python3 scripts/board/board_service_test.py     # or: python3 scripts/board/board_service.py --selftest
```

The ledger, the USB check and the loader run are faked; nothing touches the network or a Controller.
