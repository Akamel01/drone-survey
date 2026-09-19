<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-2-2
     http: 200
     fetched: 2026-09-19T01:50:00Z
     extracted from HTML; wording verbatim, layout lost -->

RealityScan 2.2 | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

RealityScan 2.2 

RealityScan 2.2

RealityScan 2.2 brings long-awaited support for AMD GPUs. 

On this page 

New Updates 

AMD GPU Support 

One of the most-requested features in RealityScan history has landed: full AMD GPU support . RealityScan is no longer NVIDIA-only. Every reconstruction stage that's accelerated on GeForce and Quadro is now equally accelerated on Radeon and Radeon PRO — same pipeline, same speed, no compromises.

The cherry on top: you don't have to choose. Mix AMD and NVIDIA in the same machine and RealityScan will use both at once , splitting the work across every supported GPU in parallel. Got a GeForce and a Radeon sitting in the same rig? Great — they'll both crunch the job side by side. More hardware, less idle silicon, faster reconstructions.

This release covers the full breadth of modern AMD desktop and workstation silicon, from RDNA 4 gaming cards to RDNA 3 PRO workstation GPUs.

Available on Windows. Linux coming later. 

Newly supported AMD GPUs and APUs: 

RDNA 3 (gfx1100): Radeon RX 7900 XTX/XT, Radeon PRO W7900/W7800

RDNA 3 (gfx1101): Radeon RX 7800 XT, RX 7700 XT, PRO W7700

RDNA 3 (gfx1102): Radeon RX 7600 XT / 7600 / 7650 GRE

RDNA 3.5 (gfx1151): Ryzen AI Max series "Strix Halo" APUs

RDNA 4 (gfx1200): Radeon RX 9060 XT / 9060

RDNA 4 (gfx1201): Radeon RX 9070 XT / 9070 / 9070 GRE, Radeon AI PRO R9700

360 Cameras: Tutorial 

A new tutorial on the Epic Developer Community walks through the 360 camera workflow, converting equirectangular photos into cube-face views with the calibration metadata RealityScan needs (focal length, undistorted) so it can skip lens correction during alignment. Faster to capture a whole space, and 360 hardware you may already own becomes a usable input.

Using 360 Cameras in RealityScan 

Bug Fixes 

Editor 

Fixed an "end of physical tape" error that occurred when importing COLMAP data from the 3D Maker Pro Eagle SLAM scanner.

Fixed an "end of physical tape" error when importing COLMAP data caused by a trailing space in the input.

Fixed a crash that could occur when using the Marginal Triangle Selection and Set Reconstruction Region tools in a specific sequence.

Fixed an issue where the camera selection chosen in the Render Image dialog was not being applied when exporting renders.

Alignment 

Fixed an issue where saved Trajectory settings produced a config file that could not be parsed.

Fixed incorrect camera rotation in sparse reconstruction reports exported for viewing in a web browser.

Fixed an issue where alignment could hang and never complete for specific datasets

Fixed a crash that occurred during alignment when using locked camera positions.

Fixed an issue where alignment incorrectly produced a component containing only a single camera.

Texturing 

Fixed an issue where reprojecting a texture between two planes produced a displacement map with visible patterning artifacts.

CLI 

Fixed an issue in CLI where the -addImageWithCalibration command did not apply the proposed XMP when importing an image already present in the project.

Fixed an issue in CLI where the -importLaserScanFolder command misplaced .lsp files.

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

New Updates 

AMD GPU Support 

360 Cameras: Tutorial 

Bug Fixes 

Editor 

Alignment 

Texturing 

CLI
