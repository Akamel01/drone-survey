# Board Load service

The Linux board next to the Controller (a Pi in the field, ADR 0016; akamel-linux stands in for it in development) serves **Load** to the phone over its hotspot. It lists the Missions waiting to Load, starts a Load of one, and reports the result. The Load itself is `scripts/mission/load.py`, unchanged, run as a child process: the service decides whether to start it and turns its output into JSON. The phone reaches it over **HTTPS**, with a certificate from our own small CA (LOADER-2, #317): see [HTTPS the iPhone trusts](#https-the-iphone-trusts).

Python standard library only (3.9+); the certificate script also needs the `openssl` command. Files: `board_service.py` (the service), `make_certs.py` (the CA, the board certificate, the iOS profile), `IPHONE-TRUST.md` (the operator's one page).

## HTTP interface

Default `https://board.local:8787` (`http://` only with `--insecure-http`). Every response is JSON. Only clients on the local network are answered (loopback, private, link-local addresses); anything else gets `403 not_local`. 

**Origins.** Only the planner's pages may call the board from a browser: `https://web-auditor-ai1.vercel.app` and `http://localhost:3000` by default. Set others with `BOARD_ALLOW_ORIGIN` (or `--allow-origin`), a comma-separated list; `*` is refused at start. The server itself answers `403 bad_origin` to any request whose `Origin` header is present and not in the list (POST, GET and the preflight alike), so it does not rely on the browser honouring CORS headers. A request with no `Origin` (curl, the host itself) is not a browser page and stays allowed from the local network. For an allowed origin the reply echoes it in `Access-Control-Allow-Origin` and adds `Access-Control-Allow-Private-Network: true`.

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

## HTTPS the iPhone trusts

Safari blocks an installed web app from plain HTTP on the local network (#252), and accepts HTTPS only from a certificate it trusts. So the board serves TLS with a certificate from our own CA, and the iPhone trusts that CA once.

**1. Make the CA and the board certificate** (on the Mac, not on the board):

```sh
python3 scripts/board/make_certs.py --ip 172.20.10.4 --ip 192.168.43.1     # the addresses the board is reached by
```

It writes to `~/.config/board-ca/` (change with `--dir`; the script refuses a folder inside any git tree):

| File | What | Goes where |
|---|---|---|
| `ca.key` | the CA's private key, mode 0600 | **Stays on this machine. Never copy, send or commit it.** |
| `ca.crt` | the CA certificate (public) | an Android phone (below) |
| `board-ca.mobileconfig` | iOS profile: `ca.crt` only, no key | the iPhone, see [IPHONE-TRUST.md](IPHONE-TRUST.md) |
| `board/board.crt`, `board/board.key` | the board's certificate and its key | copy these two to the board |

The board certificate names `board.local`, `localhost`, `127.0.0.1` and each `--ip`, and lasts 800 days. **Why 800:** Apple refuses a TLS server certificate valid longer than 825 days ([support.apple.com/en-us/103769](https://support.apple.com/en-us/103769): "TLS server certificates must have a validity period of 825 days or fewer"); `--days` above 825 is refused. The later 398-day limit does not apply to certificates from a user-added root ([support.apple.com/en-us/102028](https://support.apple.com/en-us/102028)). It uses an ECDSA P-256 key, SHA-256, the `serverAuth` extended key usage and a SAN (iOS ignores the common name). The CA is limited by name constraints to `board.local`, `localhost` and private address ranges, so a trusted CA cannot vouch for a public website.

Run it again when the board's addresses change: the CA stays, a new board certificate is issued, and the phone keeps its trust. **Renew within the 800 days** (note the date; after it every phone refuses the board). To rotate the CA, delete the folder and run again; every phone then needs the new profile. If the Mac is lost, remove the profile from the phones and start a new CA.

The keys cannot be committed: `.gitignore` covers `*.key`, `*.pem`, `*.p12`, `*.pfx` and `board-ca/`, and the script will not write into a git tree. `make_certs_test.py` checks both, and that no tracked file holds a private key.

**2. Serve with it** (on the board; no sudo):

```sh
mkdir -p ~/.config/board-service && cp board.crt board.key ~/.config/board-service/ && chmod 600 ~/.config/board-service/board.key
python3 scripts/board/board_service.py --cert ~/.config/board-service/board.crt --key ~/.config/board-service/board.key
```

The certificate and key can also come from `BOARD_TLS_CERT` and `BOARD_TLS_KEY` (the systemd unit reads them from `~/.config/board-service.env`). Without a certificate the service refuses to start, unless you pass `--insecure-http` (development only: an iPhone's installed web app cannot use it, and the traffic is readable on the hotspot). TLS 1.2 and up. The port stays 8787: 443 needs root.

**3. iPhone:** follow [IPHONE-TRUST.md](IPHONE-TRUST.md).

**4. Android.** Sources: [Chrome, Local Network Access](https://developer.chrome.com/blog/local-network-access); [Chrome Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md).

- **Local-network permission.** Chrome 142 and later asks "Look for and connect to any device on your local network" the first time a page calls a local address; the operator taps Allow. The board's replies already carry `Access-Control-Allow-Private-Network: true`. Requests to `.local` names and private IP literals are exempt from mixed-content blocking, so plain HTTP would also work on Android (with `--insecure-http`), but the board is normally HTTPS for both phones.
- **Certificate.** With an HTTPS board, Chrome checks the certificate, so the CA must be installed on the Android phone too: copy `ca.crt` to it, then Settings, Security (or Security and privacy), More security settings, Encryption and credentials, Install a certificate, **CA certificate**, pick the file, accept the warning. (Menu names vary by maker.) Chrome verifies ordinary TCP TLS connections against the platform store including user-added CAs: the Chrome Root Store FAQ says its verifier "considers local trust decisions for both adding and removing trust". An installed PWA (a WebAPK) is Chrome under its own icon and should verify the same way, but the sources document Chrome, not installed PWAs specifically: confirm it in the field.
- **Name.** Android Chrome does not resolve `.local` names (#252): use the board's address, e.g. `https://192.168.43.1:8787`. The certificate must list that exact address: re-run `make_certs.py --ip`.
- The ticket's "no certificate trust needed beyond the board's" holds only for `--insecure-http`; over HTTPS Android needs the CA installed, as above.

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
# the certificate and key from make_certs.py (see HTTPS above); the unit reads them from the same file:
printf 'BOARD_TLS_CERT=%s\nBOARD_TLS_KEY=%s\n' ~/.config/board-service/board.crt ~/.config/board-service/board.key >> ~/.config/board-service.env
systemctl --user daemon-reload
systemctl --user enable --now board-service
curl --cacert ca.crt https://localhost:8787/health    # ca.crt from the Mac's ~/.config/board-ca
```

The loader keeps its own configuration: B2 credentials at `~/.config/wayfinder/b2-status.env`, Card calibration in `wayfinder_slots.json` beside `load.py`. The service reads nothing else and never prints them.

Run by hand: `python3 scripts/board/board_service.py [--port N] [--no-mdns] [--allow-origin URL,URL]`.

To keep the service up when nobody is logged in (a headless Pi), the operator runs once: `sudo loginctl enable-linger $USER`. This is the only step that needs sudo, and it is not needed while the user has a session.

## Uninstall

```sh
systemctl --user disable --now board-service
rm ~/.config/systemd/user/board-service.service ~/.config/board-service.env
rm -r ~/.config/board-service      # the board's certificate and key
systemctl --user daemon-reload
rm -rf ~/drone-survey        # if it was cloned for this
```

## Tests

```sh
python3 scripts/board/board_service_test.py     # or: python3 scripts/board/board_service.py --selftest
python3 scripts/board/make_certs_test.py        # the certificates, the profile, the ignore rules
```

The ledger, the USB check and the loader run are faked; nothing touches the network or a Controller. The TLS tests make a CA in a temp folder and start the server on a free port: a client that trusts that CA connects; one that does not (system store, another CA, another name) is refused.
