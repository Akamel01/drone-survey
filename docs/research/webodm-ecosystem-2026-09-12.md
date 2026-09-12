# WebODM ecosystem (github.com/WebODM, webodm.org) vs current stack — 2026-09-12

Context: solo Canadian aerial-survey operation. Current stack: OpenDroneMap via NodeODM REST API in Docker (RTX 4070 SUPER, 12 GB, one task at a time, custom COG fix-up step), splatfacto (nerfstudio 1.1.5/gsplat 1.4.0, OOMs at 12 GB full-res, 3090 fallback), automated GCP file built from painted markers projected via first-solve camera poses into a second ODM solve. Constraints: containerized steps, quality gates not human review, AGPL fine as a separate process, not fine linked-in or exposed to clients.

## Verdict

| Tool | Verdict | Why |
|---|---|---|
| **ODX** (WebODM/ODX) | **Test** | Drop-in ODM replacement, same CLI/output layout, AGPL-3.0, faster release cadence than ODM post-split. "Faster than ODM" is the vendor's own claim, no independent benchmark found. Low switching cost since NodeODM/NodeODX API is compatible — worth a side-by-side run on your own dataset before swapping the RTX 4070 box over. |
| **OpenSplat** | **Test — high priority** | AGPL-3.0, C++, reads ODM's own `opensfm/` project directly (no format conversion), CPU+GPU (CUDA/ROCm/Metal), Gaussian count is a tunable `-n` flag rather than a fixed target, so it can be throttled to fit 12 GB where splatfacto-big cannot. This is the one genuinely likely to fix your OOM problem — test it against your actual full-resolution job before rebuilding the pipeline around it. |
| **NodeODX / ClusterODX** | **Test (NodeODX), Ignore for now (ClusterODX)** | NodeODX is a REST-compatible NodeODM replacement, same automation fit. ClusterODX only pays off once you actually run multiple concurrent nodes (local + borrowed + rented GPU) — you run one task at a time today, so there's nothing to cluster yet; revisit if that changes. Also note: ClusterODX requires Node.js ≤14 (breaks on 16+) per its own README — an operational wart to weigh in. |
| **WebODM** (the web app) | **Ignore** | It is a UI, task-scheduling DB, and GCP-editing frontend over NodeODX. Everything your automated pipeline needs — task queue, REST API, GCP file upload, presets via the `options` JSON — is already in NodeODM/NodeODX directly, which is what you're driving today. WebODM adds nothing for a headless, human-review-free pipeline. |
| **CameraLib** | **Test** | Does forward/backward pixel↔ground projection on ODX/ODM output (needs `odm_dem/dsm.tif` or `dtm.tif`, `odm_report/shots.geojson`, `cameras.json` — all things ODM already produces). This is close to what you hand-built for marker detection; worth comparing against your existing script rather than rewriting it, but only if CameraLib is measurably less code to maintain. |
| **posm-gcpi** | **Ignore** | Interactive GCP-picking web UI. Your workflow explicitly avoids human review; this tool exists for the opposite workflow. Also: **no LICENSE file in the repo** — all-rights-reserved by default, cannot even be run as an internal tool with confidence of a grant. |
| **RSCalibration** | **Test (one-time)** | A documented DIY rig (Arduino + blinking LED) to measure your camera's rolling-shutter readout time. Cheap, one-time exercise; the output number feeds directly into ODX's rolling-shutter compensation and informs how fast you can fly before motion smear becomes a registration problem. Worth doing once, not a pipeline dependency. |
| **CloudODX / PyODX** | **Ignore** | CloudODX is a CLI wrapper around cloud VM provisioning for ODX (GPL-3.0, not AGPL — note the license actually differs from the rest of the stack). PyODX is a Python SDK (BSD-3-Clause) for calling NodeODX. Neither adds anything over calling the NodeODX REST API yourselves, which you already do. |

## Evidence

### 1. What is ODX / NodeODX / ClusterODX?

On **2026-04-06**, Piero Toffanin (WebODM's original author) split WebODM out of the OpenDroneMap nonprofit, citing "irreconcilable differences with my co-founder" ([announcement](https://webodm.org/blog/announcement/)). He forked the whole engine stack under a new **WebODM GitHub org**, distinct from the **OpenDroneMap org** (still run separately by Stephen Mather): `ODM→ODX`, `NodeODM→NodeODX`, `ClusterODM→ClusterODX`, `PyODM→PyODX`, and `CloudODM→CloudODX`. Both orgs continue independently; OpenDroneMap/ODM is still updated (confirmed: [OpenDroneMap/ODM](https://github.com/OpenDroneMap/ODM) pushed 2026-09-10, latest tag v3.6.2 2026-08-12) but at a visibly slower cadence than ODX post-split (ODX: v3.7.2→v3.8.3, six releases 2026-04-19 to 2026-09-04; ODM: v3.6.0→v3.6.2, three releases spanning 2025-10-24 to 2026-08-12 — confirmed via `gh api repos/.../releases`).

- **Maintainer**: Piero Toffanin and "former core and lead contributors of ODM" per [webodm.org/opendronemap](https://webodm.org/opendronemap/); NodeODX Dockerfile lists `MAINTAINER Piero Toffanin <pt@masseranolabs.com>`.
- **Licence**: confirmed by reading LICENSE text directly (not GitHub's badge) — [WebODM/ODX](https://github.com/WebODM/ODX) is AGPL-3.0 (full GNU AGPLv3 text present in repo), same for [NodeODX](https://github.com/WebODM/NodeODX) and [ClusterODX](https://github.com/WebODM/ClusterODX). CloudODX is **GPL-3.0**, not AGPL — a real difference, though CloudODX is just a provisioning CLI, not a network service, so the distinction has little practical effect for you.
- **Source is fully public**: all four repos are un-archived, non-fork, with visible commit history and 30 contributors on ODX.
- **Differences claimed vs ODM**: OpenSfM 1.0 support, GPU-based feature matching, RTX 50-series support, checkpoint/resume support (all from the [announcement](https://webodm.org/blog/announcement/) and repo README badges). **"Faster than ODM" is the maintainer's own tagline** ("Forked from, faster than ODM" — [repo description](https://github.com/WebODM/ODX)); no independent benchmark was found.
- **Risk of paid/closed fork**: ODX/NodeODX/ClusterODX themselves are fully open AGPL source with public history — no evidence of a closed core. However, the wider WebODM ecosystem does have paid/closed pieces adjacent to it: **LGT** is an explicitly proprietary processing engine sold through **WebODM Lightning** (webodm.net, operated by UAV4GEO, pay-as-you-go credits, 30-day money-back guarantee) — LGT is a separate, closed product from ODX, offered as an alternative engine inside WebODM/NodeODX's multi-engine design. Also, OpenSplat for Windows has a paid pre-built binary sold via MasseranoLabs/FastSpring alongside its free-to-build AGPL source ([OpenSplat README](https://github.com/WebODM/OpenSplat)). Treat these as commercial upsells layered on top of open code, not evidence the open code itself is compromised.

### 2. OpenSplat

- **Licence**: confirmed AGPL-3.0 by reading `LICENSE.txt` in [WebODM/OpenSplat](https://github.com/WebODM/OpenSplat) (full GNU AGPLv3 text).
- **Language/backends**: C++, CPU or GPU (CUDA, ROCm/HIP, Apple Metal via MPS) — confirmed from README build instructions.
- **Reads ODM output directly**: yes — README states it accepts "camera poses + sparse points in ODX, OpenSfM, COLMAP, OpenMVG or nerfstudio project format," and ODM's own `opensfm/` working directory *is* an OpenSfM project, so no conversion step should be needed. This was not independently tested against your actual ODM output in this research pass.
- **VRAM vs splatfacto**: community/vendor figures found via search (not independently verified): OpenSplat ≈2 GB VRAM per million Gaussians; standard splatfacto ≈6 GB, splatfacto-big ≈12 GB. Gaussian count in OpenSplat is a `-n` command-line parameter you set, not a fixed architecture choice — so unlike splatfacto-big's fixed ~12 GB footprint, you can dial OpenSplat's count down to fit your 12 GB card. **This is inference from the tool's design (a tunable cap exists), not a confirmed benchmark that your specific full-resolution dataset fits** — you'd need to actually run it to know the quality/VRAM tradeoff at a given `-n`.
- **Real caveats found in issues, not marketing**: [issue #134](https://github.com/WebODM/OpenSplat/issues/134) — multiple users report OpenSplat loading all images into **system RAM** at once (one report: ~160 GB RAM committed on a 3564-image COLMAP dataset before an OOM kill); the maintainer's response was "You need more RAM, currently... We'd welcome a PR." Downsampling images was the reported workaround. This is a **RAM**, not VRAM, ceiling — worth checking against your box's system RAM, not just the GPU, before committing to it for full-resolution jobs.
- **Quality/speed**: no independent third-party benchmark of OpenSplat vs splatfacto found; only the vendor's own description ("production-grade," "portable, lean and fast," ~100x slower on CPU than GPU).

### 3. WebODM vs driving NodeODM/NodeODX directly

- WebODM's own README states plainly: "WebODM is not affiliated with OpenDroneMap and is not a user interface to OpenDroneMap... For processing, WebODM uses ODX, not ODM" ([WebODM/WebODM](https://github.com/WebODM/WebODM)).
- NodeODX's REST API (documented at [docs/index.adoc](https://github.com/WebODM/NodeODX/blob/master/docs/index.adoc), read directly) already provides: a task queue (`POST /task/new`, queue-position tracking, status codes QUEUED/RUNNING/FAILED/COMPLETED/CANCELED), GCP file upload as multipart form data on task creation, image-groups and seed-archive support for reprocessing, and a serialized JSON `options` array functioning as your presets. This is the same surface NodeODM already exposes and the same one your pipeline already drives.
- WebODM's added value on top of that is a database-backed multi-user UI, an interactive GCP editor (posm-gcpi), and historically a plugin system — none of which serve a single-operator, no-human-review, containerized pipeline. A plugins directory search on the current WebODM/WebODM repo returned nothing, and the old plugin catalog now lives in an explicitly named "[WebODM-Plugins-Archive](https://github.com/OpenDroneMap/WebODM-Plugins-Archive)" ("Plugins waiting for a hero to fix them") — the plugin ecosystem looks stalled, not a reason to adopt WebODM.
- **What webodm.org charges for**: WebODM the software is free ("100% free to install and use," confirmed on [webodm.org](https://webodm.org)). The paid product is **WebODM Lightning** (webodm.net), a hosted cloud service with pay-as-you-go credits running the proprietary LGT engine, run by UAV4GEO — unrelated to whether you self-host ODX/NodeODX for free.

### 4. ClusterODX for local + borrowed + rented GPU

- ClusterODX ([README](https://github.com/WebODM/ClusterODX)) is a reverse proxy / load balancer / task tracker in front of multiple NodeODX-compatible nodes, with cloud autoscaling hooks for DigitalOcean, Hetzner, Scaleway, and AWS. Architecturally it fits your three-tier GPU plan (local RTX 4070, borrowed RTX 3090 as another static node, a rented cloud GPU as an autoscaled node) — you'd register each as a NodeODX endpoint.
- Requirements/caveats found directly in the README, not inferred: needs **Node.js 14 or earlier** ("ClusterODX has compatibility issues with NodeJS 16 and later" — a real, stated constraint); autoscaling needs `docker-machine` (a discontinued upstream project now maintained as a GitLab fork) and an S3-compatible bucket; you always need at least one static "reference node" even when relying on autoscaling.
- **Verdict is "ignore for now"** not because it's broken, but because you run one task at a time today — there is nothing to load-balance yet. It becomes relevant only once you're running the local GPU and a second GPU concurrently.

### 5. CameraLib, posm-gcpi, RSCalibration

- **CameraLib** ([repo](https://github.com/WebODM/CameraLib), AGPL-3.0, confirmed via `gh api` license field): Python library for forward projection (ground coordinate → pixel/image) and its inverse (pixel → ground), operating on an ODX/ODM project's `odm_dem/dsm.tif` or `dtm.tif`, `odm_report/shots.geojson`, and `cameras.json`. This is functionally the same operation your pipeline already does by hand for marker detection (projecting known marker positions into images using first-solve camera poses). Worth a side-by-side comparison against your existing script; adopt only if it's genuinely less code to own.
- **posm-gcpi** ([repo](https://github.com/WebODM/posm-gcpi)): a web GCP-picking interface (Node/React app). Built for interactive human placement of ground control points — the opposite of your "quality gates, not human review" design. Also: the repo root has **no LICENSE file at all** (checked directly), meaning it carries no explicit open-source grant and is all-rights-reserved by default under copyright law — a real blocker even if you wanted to reuse it.
- **RSCalibration** ([repo](https://github.com/WebODM/RSCalibration), AGPL-3.0): a documented, cheap (Arduino + LED + resistor) procedure to physically measure a camera's rolling-shutter readout time by photographing a fast-blinking LED and counting scan lines. The output number is what ODX's rolling-shutter compensation needs, and separately tells you how much motion blur/geometric skew to expect at a given flight speed — a useful one-time calibration exercise, not a pipeline component.

### 6. Licences of everything recommended

All confirmed by reading each repo's actual LICENSE file (not GitHub's auto-detected badge, though badge and file agreed in every case):

| Repo | Licence | Source |
|---|---|---|
| WebODM/ODX | AGPL-3.0 | LICENSE.md, full text |
| WebODM/NodeODX | AGPL-3.0 | GitHub API license field, matches ODX org convention |
| WebODM/ClusterODX | AGPL-3.0 | GitHub API license field |
| WebODM/OpenSplat | AGPL-3.0 | LICENSE.txt, full text |
| WebODM/WebODM | AGPL-3.0 | LICENSE.md, full text |
| WebODM/CameraLib | AGPL-3.0 | GitHub API license field |
| WebODM/RSCalibration | AGPL-3.0 | GitHub API license field |
| WebODM/CloudODX | GPL-3.0 (not AGPL) | GitHub API license field |
| WebODM/PyODX | BSD-3-Clause | GitHub API license field |
| WebODM/posm-gcpi | **none** | repo root has no LICENSE file |

**What AGPL means for your setup**: AGPL's extra clause over plain GPL triggers when you modify the software *and* let others interact with it over a network (e.g., offering it as a hosted service to clients) — at that point you'd owe them the modified source. Running ODX/OpenSplat/NodeODX as unmodified, separate containerized processes that only your own pipeline talks to — never exposed to clients, never linked into your codebase — does not trigger that obligation. This matches your stated constraint exactly; nothing here changes your risk posture versus running vanilla OpenDroneMap/NodeODM today (also AGPL).

## Could not verify

- Any independent, third-party benchmark of ODX vs ODM speed or output quality — only the maintainer's own "faster than ODM" claim was found.
- Any independent benchmark of OpenSplat output quality or wall-clock speed vs splatfacto on the same dataset.
- Whether OpenSplat, at a `-n` Gaussian count you'd choose for full-resolution quality, actually fits in 12 GB VRAM on your specific dataset — the 2 GB/million-Gaussians figure is a secondhand community estimate, not something pulled from OpenSplat's own documentation or tested here.
- Current status/health of WebODM's plugin system in the post-split WebODM org (the old plugin catalog is explicitly archived; no equivalent catalog was found for the new org).
- Exact pricing tiers/credit costs for WebODM Lightning (webodm.net) beyond "150 free credits" and "pay-as-you-go" — not relevant to your self-hosted setup, so not pursued further.
