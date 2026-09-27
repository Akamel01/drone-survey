# Can a phone Load a Mission onto the RC2 without the Linux host? (2026-09-27)

Research for ticket [#230](https://github.com/Akamel01/drone-survey/issues/230), per platform
(Android, iPhone): is it feasible, how would it work, and what could break. This is a
question about the USB link to the Controller, not about the planner — the planner already
runs on a phone.

Method: primary sources (Android/Apple developer docs, USB-IF/vendor application notes,
project source) preferred; forum and vendor pages labelled as such; one measured
experiment already in the repo is cited rather than repeated. Sources were read on
2026-09-27. Anything not read or measured is marked **INFERRED**.

## Verdict

| Platform | Can Load without the Linux host? | Blocking fact |
|---|---|---|
| Android phone | **No**, on this exact pairing | The RC2 keeps the USB host role; the phone stays a device. Measured. |
| iPhone / iPad | **No**, over USB at all | RC2 exposes MTP; iOS has no general USB API and only reads USB *mass storage* drives. |
| Small Linux board (Raspberry Pi class) | **Yes** — this is the chosen path | A fixed USB-A host port leaves no role to negotiate, and the existing loader runs unchanged. |

A phone can still **drive** the board over Wi-Fi (hotspot/UI) and feed it internet for
Collecting. It cannot be the thing that writes to the Controller.

## Direct answers

### 1. Android: can the phone take USB host role and initiate MTP?

**Not on this pairing, and the reason is measured, not software.** Cabled directly USB-C to
USB-C, and again through a USB-C OTG adapter and a USB-A-to-USB-C data cable, the RC2 kept
the USB host role and only charged the phone; the phone offered no way to take the role
(`docs/adr/0016-mission-generation-and-loading-for-the-rc2.md:480-485`). That is the decisive
result for Android.

**What decides host role.** Android has two USB modes. In **host** mode the Android device
"acts as the USB host, powers the bus, and enumerates connected USB devices"; the API exists
from Android 3.1 (API 12), but "support for USB host and accessory modes [is] ultimately
dependant on the device's hardware" and must be declared in the manifest as
`android.hardware.usb.host`
([developer.android.com USB host overview](https://developer.android.com/develop/connectivity/usb/host),
read 2026-09-27;
[USB host and accessory overview](https://developer.android.com/develop/connectivity/usb),
read 2026-09-27). The library that lets an Android app be an ADB *host* also relies on this:
it "uses USB-Host Mode apis available since Android 3.1"
([github.com/charlesmuchene/adb](https://github.com/charlesmuchene/adb), read 2026-09-27).
So an Android app can be a USB protocol initiator **only if the phone is the host**.

**Why it is not the host here.** On USB-C the roles are set at attach by the CC resistor
network: the power *source* presents Rp and is the downstream-facing port (DFP/host); the
power *sink* presents Rd and is the upstream-facing port (UFP/device)
([TI, *An Engineer's Guide to USB Type-C*, p.18](https://www.ti.com/lit/eb/slyy228/slyy228.pdf),
read 2026-09-27). In a basic Type-C system without USB Power Delivery, "a power source can
never be a data UFP, and a power sink can never be a data DFP"
([Microchip AN3265, §2.2.1](https://www.microchip.com/content/dam/mchp/documents/UNG/ApplicationNotes/ApplicationNotes/AN3265-UPD301A-USB-Power-Delivery-00003265A.pdf),
read 2026-09-27). Reversing the data role requires a **DR_Swap** over USB Power Delivery,
accepted by both partners
([Microchip AN1974, §1.4](https://ww1.microchip.com/downloads/aemDocuments/documents/OTH/ApplicationNotes/ApplicationNotes/00001974A.pdf),
read 2026-09-27). The RC2 stayed the source in the measurement, so the phone stayed the sink
and therefore the device — no DR_Swap was offered or accepted. On most Androids the role
nodes are root-only and depend on kernel/hardware support; a root module "cannot add USB role
switching support to hardware, firmware, or kernels that do not already support it"
([kernel.org `sysfs-class-usb_role`](https://www.kernel.org/doc/Documentation/ABI/testing/sysfs-class-usb_role),
read 2026-09-27;
[usb_role_switch module README — third party](https://github.com/ciallothu/usb_role_switch),
read 2026-09-27).

**BC1.2 is not the lever.** USB Battery Charging 1.2 defines charger detection on the D+/D−
lines (DCP/CDP/SDP) to allow current above the standard 500 mA; it governs charging, not who
is host ([USB-IF Battery Charging 1.2 spec](https://www.usb.org/document-library/battery-charging-v12-spec-and-adopters-agreement),
landing page read 2026-09-27;
[TI SLUAA94](https://www.ti.com/lit/pdf/SLUAA94), read 2026-09-27). It does not grant the
phone host role. **INFERRED.**

**Could a host-role phone even be an MTP initiator?** In principle yes — the phone would talk
the MTP protocol over its own `UsbManager`/USB-host interfaces, exactly as a PC does. Android
ships no MTP-initiator library; it would be a libmtp/libusb-style implementation. But the
necessary condition (phone = host) fails on this pairing, so this is academic here.

**Does anything need Android's scoped storage to matter?** No — and for a *phone* it is a
distractor. Scoped storage blocks an app from reading another app's `Android/data/` on its
**own** device: `MANAGE_EXTERNAL_STORAGE` grants write access to all internal storage "except
`/Android/data/`, `/sdcard/Android`, and most subdirectories", and apps holding it "still
can't access the app-specific directories that belong to other apps"
([developer.android.com Manage all files](https://developer.android.com/training/data-storage/manage-all-files),
read 2026-09-27); `ACTION_OPEN_DOCUMENT_TREE` likewise cannot request `Android/data/` on
Android 11+ ([Access documents and other files](https://developer.android.com/training/data-storage/shared/documents-files),
read 2026-09-27). That is why an app sideloaded **onto the RC2** could not do the job
(`docs/adr/0016-...:405-416`). A phone cabled to a *different* device would be on the winning
side of MTP (a PC is), if only it could be the host.

### 2. Android: the ADB route — does the RC2 expose ADB, and can a phone be an ADB host?

**The RC2 does not expose ADB.** The DJI Mission Installer project (C#, ADB via
AdvancedSharpAdbClient, MTP via MediaDevices) documents ADB for the **DJI RC, RC Pro and
Smart Controller**, but for the **DJI RC2** it states: "The DJI RC2 connects in MTP mode by
default and does not officially support ADB. For the vast majority of users, MTP is the only
option" ([github.com/Alos-no/DJI-Mission-Installer](https://github.com/Alos-no/DJI-Mission-Installer),
read 2026-09-27; the ticket's `MjosDrone/` URL redirects here). This matches the earlier
finding at `docs/research/controller-and-loader-facts-2026-09-11.md:111-114`.

**And an Android app can be an ADB host only over USB host mode** (`charlesmuchene/adb`,
above). The ADB-for-Android libraries that exist target a daemon over TCP/TLS or wireless
debugging, not USB
([libadb-android README](https://github.com/MuntashirAkon/libadb-android), read 2026-09-27),
so they would need the RC2 to be listening on a network socket, which it is not.

**State plainly:** with no ADB interface on the Controller and no host role for the phone,
the ADB route is closed twice over.

### 3. iPhone: does any USB route exist?

**No.** Three independent primary facts close it:

- The iOS Files app reads **USB mass-storage** devices only — "USB drives and SD cards" that
  have a single data partition formatted APFS, APFS (encrypted), HFS+, exFAT, FAT32 or FAT
  ([Apple Support, *Connect external storage devices to iPhone*](https://support.apple.com/guide/iphone/external-storage-devices-iph95baac91f/ios),
  read 2026-09-27). The RC2 is an **MTP** device, not mass storage, so it never appears as a
  Files-app location.
- iOS has no general-purpose USB API: an Apple Developer Forums answer states "iOS does not
  support access to USB accessories in general... there's no general-purpose USB API"
  ([developer.apple.com/forums/thread/119030](https://developer.apple.com/forums/thread/119030),
  read 2026-09-27; Apple-hosted forum, Apple-staff answer).
- The one USB device-class framework, **ImageCaptureCore** (iOS 13+), browses **cameras and
  scanners** and speaks **PTP** (Picture Transfer Protocol), listing media files and
  downloading them; its upload API (`ICCameraDevice.requestUploadFile`) is deprecated and
  `requestSendPTPCommand` writes no file
  ([Apple ImageCaptureCore](https://developer.apple.com/documentation/imagecapturecore),
  read 2026-09-27;
  [`ICCameraDevice`](https://developer.apple.com/documentation/imagecapturecore/iccameradevice),
  read 2026-09-27). It is aimed at PTP cameras; it offers no way to write a KMZ into an
  Android app-private folder.

MavenBridge's own page lists iPhone/iPad as supported, but the mechanism is vendor-stated and
undocumented ([mavenpilot.com/mavenbridge](https://www.mavenpilot.com/mavenbridge/);
recorded as unverified at `docs/research/controller-and-loader-facts-2026-09-11.md:181-187,290-294`).
Treat "iPhone works" as marketing, not a route.

**Non-USB routes that do exist for an iPhone.** None of them make the phone the Loader:

- **Drive the small Linux board.** The phone provides a hotspot and the planner UI; the board
  does the USB work (see §4).
- **Cloud.** Cloud storage serves the *planner* on any device, and "whatever sits cabled to
  the Controller Collects from it"; "loading over Wi-Fi alone is not possible"
  (`docs/adr/0016-...:495-497`). iCloud is no exception — it is not in the USB path.

### 4. The small Linux board, driven from the phone

This is the path the project already chose (`docs/adr/0016-...:487-493`). Shape:

- **Hardware:** a board with a **USB-A host port** cabled to the Controller. "A USB-A host
  port leaves no role to negotiate" (`docs/adr/0016-...:488-489`). This is the whole point —
  it sidesteps the CC/DR_Swap problem that defeats the phone.
- **Software:** `scripts/mission/load.py` unchanged. It mounts the Controller over MTP with
  `jmtpfs` and writes each Mission into the way-finder Card that its Spec reserved. The
  transport is a filesystem mount, not a bespoke protocol: `MOUNT = ~/rc2` joined with
  `STORAGE = "Internal shared storage"` (`scripts/mission/load.py:48-49`), then
  `WAYPOINT_DIR = "Android/data/dji.go.v5/files/waypoint"`
  (`scripts/mission/kmz.py:17`). Success is a read-back hash after a fresh mount,
  with rollback on mismatch (`load.py:354-427`). It is stdlib Python plus `jmtpfs`, so it runs
  on the board as-is.
- **What the phone provides:** a Wi-Fi hotspot (internet for Collecting) and the planner UI
  that says which Card to open (`docs/adr/0016-...:490-493`). Not the USB link.
- **Operator steps unchanged:** Controller unlocked, pilot opens the Card
  (`docs/adr/0016-...:492-493`).

Board choice caveats, from Raspberry Pi's own guidance: on Pi 4/5 the **USB-A ports "can only
operate as USB hosts"**, and the **USB-C power/OTG port is the only peripheral-mode port**;
Pi Zero's single data micro-USB port is OTG and needs an OTG/ID-grounded cable to act as host
([Raspberry Pi, *Using OTG mode*](https://pip.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-009276-WP/Using-OTG-mode-on-Raspberry-Pi-SBCs.pdf),
read 2026-09-27;
[raspberrypi.com USB gadget mode](https://www.raspberrypi.com/news/usb-gadget-mode-in-raspberry-pi-os-ssh-over-usb/),
read 2026-09-27). A fixed host port is the simplest choice; if you enable gadget mode on the
only OTG port, that port stops working as a host
([raspberrypi.com, same](https://www.raspberrypi.com/news/usb-gadget-mode-in-raspberry-pi-os-ssh-over-usb/);
[cnx-software.com — third party](https://www.cnx-software.com/2026/01/22/raspberry-pi-os-adds-easier-usb-gadget-mode-support/),
read 2026-09-27).

### 5. What could break, per platform

**All platforms**

- **DJI Fly / firmware update changes the folder or its visibility.** Forum reports name DJI
  Fly v1.18.2 as making the waypoint folder disappear, and an RC2 firmware update as deleting
  saved missions, later fixed in v1.17.1
  (`docs/research/controller-and-loader-facts-2026-09-11.md:24-27,131-140` — forum-reported).
  The ADR's answer is to update deliberately and re-prove with a short Mission
  (`docs/adr/0016-...:51-59`).
- **The Controller must be unlocked and answering MTP.** If it is not, the loader reports
  "plugs in but its storage cannot be read... Unlock it, and choose file transfer if it asks"
  (`load.py:301-309`).
- **A stale `jmtpfs` mount** (Controller rebooted/replugged) raises `EIO` rather than reading
  as absent; the loader treats that as not-mounted (`load.py:284-289`).
- **`libmtp` does not recognise the Controller** — `2ca3:1021 DJI KATMAI-IDP`, "VID=2ca3 and
  PID=1021 is UNKNOWN" — and falls back to generic Android handling
  (`docs/research/rc2-native-mission-2026-09-12.md:16-19`).

**Android phone**

- **USB role (decisive).** The phone cannot become host against the RC2; nothing on the phone
  offers the swap. Root on the phone does not create hardware/kernel support that is absent
  (`sysfs-class-usb_role`; `usb_role_switch` README, above).
- **Host mode implies the phone powers the bus** (`developer.android.com USB host overview`,
  above) — so a phone that *did* win host role would be charging the RC2 from its own battery,
  a power drain on a field day.
- **Hardware feature gate.** Host mode is not guaranteed; an app must declare
  `android.hardware.usb.host` and the device must actually support it
  (`developer.android.com`, above).

**iPhone / iPad**

- **Files-app format rule** — only single-partition APFS/HFS+/exFAT/FAT32/FAT drives; MTP is
  not in scope at all (Apple support, above).
- **Accessory approval.** Accessories must be approved; by default the device must be
  unlocked to communicate, and `Settings > Privacy & Security > Wired Accessories` controls
  auto-approval ([Apple Support 111806](https://support.apple.com/en-us/111806), read
  2026-09-27).
- **No write path.** ImageCaptureCore is read/download-oriented for PTP cameras; the upload
  API is deprecated (`developer.apple.com`, above). There is no hook for a KMZ into
  `Android/data/dji.go.v5`.

**Small Linux board**

- **Power.** It needs its own supply so it does not drain the Controller (ADR 0016:490). On a
  Pi Zero, do not feed the power and data ports at once — the 5 V rails are common
  ([Raspberry Pi forums](https://forums.raspberrypi.com/viewtopic.php?t=223891), read
  2026-09-27 — forum-reported).
- **Port discipline.** Use the fixed host port; enabling gadget mode on the sole OTG port
  removes host capability (raspberrypi.com, above).
- **Tooling.** `jmtpfs`/`fusermount` must be present and the board must be allowed to hold the
  Controller lock (`load.py:312-330`).

## Could not verify

- **Whether the RC2 implements USB Power Delivery DR_Swap at all.** No DJI source documents
  the Controller's USB-C role behaviour. The measured failure
  (`docs/adr/0016-...:480-485`) is the only direct evidence; the Type-C role explanation here
  is **INFERRED** from vendor application notes, not from the RC2's own documentation.
- **Whether any Android phone — rooted or not — can force DFP against the RC2 and then mount
  it over MTP.** Not tested. The hardware/kernel support required is device-specific.
- **Whether iOS `ImageCaptureCore` can speak to an Android *MTP* device** (as opposed to PTP
  cameras). The Apple Developer Forums thread that asks exactly this
  ([thread/670718](https://developer.apple.com/forums/thread/670718)) could not be fetched —
  it returns a browser security-verification page — so only the framework's PTP documentation
  was read. Even if it could read media, it offers no KMZ write path.
- **The exact Android version on the RC2**, and therefore which `UsbManager`/role-switch
  behaviour applies — still not stated by DJI
  (`docs/research/controller-and-loader-facts-2026-09-11.md:280-283`).
- **The USB Type-C specification text itself.** `usb.org` hosts it behind an adopter
  agreement; the role-swap description here rests on Microchip/TI application notes rather
  than the specification.
- **The mechanism behind MavenBridge's claimed iOS support** — vendor-stated only, as
  recorded earlier (`docs/research/controller-and-loader-facts-2026-09-11.md:290-294`).
