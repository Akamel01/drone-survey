# Trust the board on your iPhone (once)

The installed web app can only talk to the board over HTTPS, and Safari only accepts the board's certificate if the phone trusts our own small certificate authority (CA). You install the CA once, turn on trust once, and the phone then accepts `https://board.local:8787`. The profile holds a certificate only, never a key.

You need: the file `board-ca.mobileconfig` (made on the Mac by `make_certs.py`, see README.md), and the board running with its certificate.

## Install

1. Send `board-ca.mobileconfig` to the iPhone: AirDrop it from the Mac (simplest), or save it to iCloud Drive and open it in Files.
2. Tap it. iOS says **Profile Downloaded**.
3. Open **Settings**. Tap **Profile Downloaded** near the top (or **General**, **VPN & Device Management**, **Downloaded Profile**).
4. Tap **Install**, enter the phone passcode, tap **Install** again. iOS shows "Not Signed" in red: that is expected, the profile is ours and unsigned. Tap **Install**, then **Done**.

## Turn on full trust (installing alone is not enough)

5. **Settings**, **General**, **About**, **Certificate Trust Settings** (at the very bottom).
6. Under "Enable full trust for root certificates", switch on **Wayfinder board CA**. Tap **Continue** on the warning.

If **Certificate Trust Settings** is missing, no profile with a certificate is installed: repeat steps 1 to 4.

## Check it

On the phone's own hotspot with the board joined to it, open Safari at `https://board.local:8787/health`. You should see `{"ok": true, ...}` with no warning. A warning page means: trust is off (step 6); or the board's certificate does not list the address you typed (re-run `make_certs.py --ip <the board's address>` and copy the two board files over again); or the board is not running with `--cert` and `--key`.

## Remove it

**Settings**, **General**, **VPN & Device Management**, tap **Wayfinder board**, **Remove Profile**, enter the passcode. This removes the CA and its trust in one step. Do this if the phone or the Mac holding the CA key is lost; then delete `~/.config/board-ca` on the Mac and run `make_certs.py` again for a new CA.

What this trust allows: only names inside the board's own network (`board.local`, `localhost` and private addresses). The CA is built so that even a stolen CA key cannot make a certificate iOS accepts for a real website.

Sources: [Trust manually installed certificate profiles in iOS](https://support.apple.com/en-us/102390) (Settings, General, About, Certificate Trust Settings); [TLS server certificate requirements, 825 days](https://support.apple.com/en-us/103769).
