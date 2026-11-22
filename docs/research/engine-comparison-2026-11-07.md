# RealityScan vs OpenDroneMap vs Gaussian splatting vs hybrids (#366)

Written 2026-11-07 from the repo's own docs and measurements. **This is the
measurement method plus what is already known. It is not the answer the ticket
asks for**: nobody has run RealityScan on a Capture yet, and no run in the repo
measures checkpoint RMSE. The cells marked *unmeasured* need one session on the
box (method below). Related: [realityscan-validation](realityscan-validation-2026-09-19.md),
[odx-benchmark](odx-benchmark-2026-09-12.md), [post-processing-chain](post-processing-chain-2026-10-21.md).

## What is already measured

All on `akamel-linux` (RTX 4070 SUPER 12 GB), on the Bellus Golden Capture
(122 images, 12.3 MP, GPS but no ground control) unless noted.

| | ODM / NodeODM | Gaussian splatting (OpenSplat, gsplat) | RealityScan 2.2 |
|---|---|---|---|
| Runs unattended | yes | yes | starts and exits 0 headless under Wine; reconstruction **untested** (validation tier 1) |
| Wall time, whole Capture | 1,027 s at `high`/`high`, 10 cm orthophoto (PR #116) | 15,000 steps in about 900 s on 180 kitchen frames (opensplat-first-run); gsplat 6,000 steps, half resolution, 818 s (PR #116) | *unmeasured* |
| Memory limit hit | 27.3 GiB RAM in texturing, 85% of the 32 GiB cap | 12 GB card, bounded by model cap and tile (PR #116) | *unmeasured* |
| Visual quality | no score taken; orthophoto and mesh produced | held-out views, PSNR 21.6 to 21.8, SSIM 0.58, LPIPS 0.63 to 0.66 (PR #116) | *unmeasured* |
| Checkpoint RMSE | *unmeasured* (no checkpoints on Bellus; `gcp_list.txt` is unused) | not applicable (no map product) | *unmeasured* |
| Licence | open source | open source | free tier; commercial and unattended use still a reading task (validation T1.4) |
| Cost per Site | box electricity only; not metered | same | same, plus licence tier if the free tier does not cover it |

Two cautions from earlier runs: ODX looked 33% faster than ODM only because it
reconstructed a third as much (odx-benchmark), so a speed number means nothing
without a coverage number beside it; and the kitchen frames are video, not a
grid-mission Capture, so only speed and memory transfer.

## Method (one session on the box)

1. **Site.** One real Site flown as a grid Mission, with at least 5 surveyed
   checkpoints (points not given to any engine as control) and, if possible,
   3 to 4 Ground Control Points. Without checkpoints the accuracy column stays
   empty; Bellus cannot serve because it has none.
2. **Engines, same images, same hardware, one at a time.** ODM at `high`/`high`
   with the real GSD; RealityScan at normal and high detail through
   `realityscan-cli`; gsplat from the ODM or RealityScan alignment, MCMC with
   `cap-max 3000000`, 30,000 steps.
3. **Hybrids come free.** ODM ortho plus RealityScan mesh, and RealityScan mesh
   plus splat Showcase, reuse the single-engine outputs; score the pairing, do
   not re-run.
4. **Accuracy.** Checkpoint RMSE, horizontal and vertical, in metres, read off
   each engine's orthomosaic and DSM at the checkpoint positions. Run once with
   GCPs and once without.
5. **Time and cost.** Wall time per stage from `scripts/measure/odm-stage-profile.sh`
   style sampling; cost is box electricity (a plug meter) plus licence share.
6. **Visual quality.** Orthomosaic: valid-pixel fraction, seam count by eye on
   three fixed crops, and the operator's blind pick. 3D model: held-out-view
   PSNR/SSIM/LPIPS for splats; for meshes, render the same held-out views and
   score the same way.
7. **Scored table.** One row per engine or hybrid, one column per deliverable
   (orthomosaic, 3D model, Showcase), each 1 to 5 against the measured values,
   with the raw numbers beside the score.

## Provisional leaning (not a recommendation)

- Orthomosaic: keep ODM, the one engine proven end to end in the Pipeline.
- 3D model for delivery: ODM mesh now; RealityScan only if its headless run
  passes tier 1 and its accuracy beats ODM by more than the licence is worth.
- Showcase: a splat, since a splat already exists as a product; the mesh
  engine behind it is undecided.

## Blocks

- A Site with checkpoints (needs a flight: the operator).
- RealityScan reconstruction headless test (box, no hardware).
