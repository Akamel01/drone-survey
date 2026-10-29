# Field test — board speaks HTTPS the iPhone trusts (issue #317, AC 5)

**Human-only gate.** This document is a template; filling it in is operator work, not agent work. AC 5 is not closed until a human runs the test on real hardware and records the result on issue #317.

CA rotation guidance: [README.md](README.md) "HTTPS the iPhone trusts", step 1 — renew within 800 days; delete folder + re-run to rotate CA.

## iOS

- Device model: ___
- iOS version: ___
- Network topology: ___ (e.g. phone hotspot, board joined)
- URL used: ___ (e.g. https://board.local:8787/health or https://<ip>:8787/health)
- Result: PASS / FAIL
- Date: ___
- Notes: ___

## Android (WebAPK trust confirmation)

Android Chrome does not resolve `.local` (#252); use the board's IP and re-run `make_certs.py --ip`. The cert must list that exact address.

- Device model: ___
- Android / Chrome version: ___
- WebAPK installed (Y/N): ___
- Local-network permission granted (Y/N): ___
- CA installed via ca.crt (Y/N): ___
- URL used: ___ (https://<ip>:8787)
- WebAPK verifies TLS the same as Chrome (Y/N): ___
- Result: PASS / FAIL
- Date: ___
- Notes: ___
