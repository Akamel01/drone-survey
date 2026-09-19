<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/configure-selected-items
     http: 200
     fetched: 2026-09-19T01:49:51Z
     extracted from HTML; wording verbatim, layout lost -->

Configure Selected Items | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Configure Selected Items 

Configure Selected Items

Use these keys and values to modify the selected items within your project. 

On this page 

Some selections allow you to modify their settings and parameters using CLI commands, including inputs , control points , constraints , and ortho projections . Each command requires a key (identifying the setting to change) and a value . The tables below list the keys and values available for each configurable setting.

In the table, each value is listed together with its definition. When using these values in commands, include only the value , not its definition.  

Input Selection 

The following settings are available in the Selected Inputs panel and can be modified using the -editInputSelection command.

Setting | Key | Value | 

How to use masking layer
| 
inpMaskOpts
| 
0 – Do not use

1 – Only in alignment

2 – Only in meshing

3 – Both in alignment and meshing
| 

Features source
| 
aligFeaturesMode
| 
0 – Merge using overlaps

1 – Use component features

2 – Use all image features
| 

Visible
| 
inpVisible
| 
true – Enable camera cone in the 3Ds view

false – Disable camera cone in the 3Ds view
| 

Enable alignment
| 
inpEnabled
| 
true – Enable in the alignment process

false – Disable in the alignment process
| 

Enable meshing
| 
inpMeshing
| 
true – Enable in the reconstruction process

false – Disable in the reconstruction process
| 

Enable texturing and coloring
| 
inpTexturing
| 
true – Enable in the coloring and texturing process

false – Disable in the coloring and texturing process
| 

Weight in texturing
| 
inpImageColorsWeight
| 
number (float) – A value between 0 and 1 that determines the weight of an input in the texture calculation
| 

Color correction reference
| 
inpColorRef
| 
true – Enable as a color reference in color correction

false – Disable as a color reference in color correction
| 

Color correction
| 
inpColorNorm
| 
true – Enable in color-correction calculation

false – Disable in color-correction calculation
| 

Downscale for depth maps
| 
inpImageDepthMapDownscale
| 
number (integer) – Any positive whole number
| 

Prior Pose Settings 

Setting | Key | Value | 

Locked pose group
| 
inpPosePriorRelativeGroup
| 
text (string) – Any alphanumeric value
| 

Relative pose
| 
inpPosePriorRelative
| 
0 – Unknown

1 – Draft

2 – Exact
| 

Absolute pose
| 
inpPose
| 
0 – Unknown

1 – Position

2 – Position and orientation

3 – Locked
| 

x
| 
inpTx
| 
number (float) – Any number
| 

y
| 
inpTy
| 
number (float) – Any number
| 

z
| 
inpTz
| 
number (float) – Any number
| 

Yaw / Heading
| 
inpRx
| 
number (float) – Any value between −180 and 180
| 

Pitch / Elevation
| 
inpRy
| 
number (float) – Any value between −90 and 90
| 

Roll / Bank
| 
inpRz
| 
number (float) – Any value between −180 and 180
| 

Latitude
| 
inpTy
| 
DMS – Degrees/minutes/seconds with cardinal prefix (e.g., N54,49,31.25)

decimal degree – Decimal degrees with prefix (e.g., N54.825347)
| 

Longitude
| 
inpTx
| 
DMS – Degrees/minutes/seconds with cardinal prefix (e.g., E32,08,25.18)

decimal degree – Decimal degrees with prefix (e.g., E32.140328)
| 

Altitude
| 
inpTz
| 
number (float) – Any number
| 

Pose Accuracy Settings 

Setting | Key | Value | 

Accuracy settings source
| 
inpPriorAccuracyInh
| 
0 – Global camera prior settings1 – Edit custom values
| 

Position X accuracy
| 
inpuTx
| 
number (float)  – Any positive number or zero
| 

Position Y accuracy
| 
inpuTy
| 
number (float) – Any positive number or zero
| 

Position Z accuracy
| 
inpuTz
| 
number (float) – Any positive number or zero
| 

Yaw accuracy
| 
inpuRx
| 
number (float) – Any positive number or zero
| 

Pitch accuracy
| 
inpuRy
| 
number (float) – Any positive number or zero
| 

Roll accuracy
| 
inpuRz
| 
number (float) – Any positive number or zero
| 

Latitude accuracy
| 
inpuTy
| 
number (float) – Any positive number or zero
| 

Longitude accuracy
| 
inpuTx
| 
number (float) – Any positive number or zero
| 

Altitude accuracy
| 
inpuTz
| 
number (float) – Any positive number or zero
| 

Prior Calibration 

Setting | Key | Value | 

Calibration group
| 
inpCalibrationGroup
| 
number (integer) – Any positive whole number, zero, or −1 (groupless)
| 

Prior
| 
inpCalibration
| 
0 – Unknown

1 – Approximate

2 – Fixed
| 

Focal length (35mm)
| 
inpFocal
| 
number (float) – Any positive number
| 

Principal point x [mm]
| 
inpPPX
| 
number (float) – Any number
| 

Principal point y [mm]
| 
inpPPY
| 
number (float) – Any number
| 

Skew
| 
inpSkew
| 
number (float) – Any number
| 

Aspect ratio
| 
inpSkew
| 
number (float) – Any number
| 

Prior Lens Distortion 

Setting | Key | Value | 

Lens group
| 
inpLensGroup
| 
number (integer) – Any positive whole number, zero, or −1 (groupless)
| 

Prior
| 
inpDistortion
| 
0 – Unknown

1 – Approximate

2 – Fixed
| 

Camera model
| 
inpDistortionModel
| 
0 – No lens distortion

1 – Division

2 – Brown3

3 – Brown4

4 – Brown3 with tangential distortion

5 – Brown4 with tangential distortion
| 

Radial 1
| 
inpRadial1
| 
number (float) – Any number
| 

Radial 2
| 
inpRadial2
| 
number (float) – Any number
| 

Radial 3
| 
inpRadial3
| 
number (float) – Any number
| 

Radial 4
| 
inpRadial4
| 
number (float) – Any number
| 

Tangential 1
| 
inpTangential1
| 
number (float) – Any number
| 

Tangential 2
| 
inpTangential2
| 
number (float) – Any number
| 

Control Point Selection 

With the following keys and values, you can change settings found in the Selected control point(s) panel using the -editControlPointSelection command.

Setting | Key | Value | 

Name
| 
gpName
| 
text (string) – Any alphanumeric value
| 

Enable
| 
gpEnabled
| 
true – Enable in the alignment process

false – Disable in the alignment process
| 

Type
| 
gpType
| 
0 – Tie point

1 – Ground control

2 – Ground test
| 

Weight
| 
gpWeight
| 
number (float) – Any number
| 

x
| 
gpP1
| 
number (float) – Any number
| 

y
| 
gpP2
| 
number (float) – Any number
| 

z
| 
gpP3
| 
number (float) – Any number
| 

Latitude
| 
gpP2
| 
DMS – Degrees/minutes/seconds with cardinal prefix (e.g., N54,49,31.25)

decimal degree – Decimal degrees with prefix (e.g., N54.825347)
| 

Longitude
| 
gpP1
| 
DMS – Degrees/minutes/seconds with cardinal prefix (e.g., E32,08,25.18)

decimal degree – Decimal degrees with prefix (e.g., E32.140328)
| 

Altitude
| 
gpP3
| 
number (float) – Any number
| 

Position Accuracy Settings 

Setting | Key | Value | 

Position X accuracy
| 
gpuP1
| 
number (float) – Any positive number or zero
| 

Position Y accuracy
| 
gpuP2
| 
number (float) – Any positive number or zero
| 

Position Z accuracy
| 
gpuP3
| 
number (float) – Any positive number or zero
| 

Latitude accuracy
| 
gpuP2
| 
number (float) – Any positive number or zero
| 

Altitude accuracy
| 
gpuP3
| 
number (float) – Any positive number or zero
| 

Longitude accuracy
| 
gpuP1
| 
number (float) – Any positive number or zero
| 

Constraint Selection 

The following keys and values are used to change settings found in the Selected constraint(s) panel with the -editConstraintSelection command.

Setting | Key | Value | 

Name
| 
cName
| 
text (string) – Any alphanumeric value
| 

A
| 
cA
| 
text (string) – The name of an existing control point
| 

B
| 
cB
| 
text (string) – The name of an existing control point
| 

Enable
| 
cEnabled
| 
true – Enable in the alignment process

false – Disable in the alignment process
| 

Defined distance
| 
cValue1
| 
number (float) – Any positive number
| 

Ortho Projection Selection 

Use the following keys and values to change settings found in the Selected ortho projection(s) panel with the -editOrthoProjectionSelection command.

Setting | Key | Value | 

Name
| 
orthoProjectionName
| 
text (string) - Any alphanumeric value
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Input Selection 

Prior Pose Settings 

Pose Accuracy Settings 

Prior Calibration 

Prior Lens Distortion 

Control Point Selection 

Position Accuracy Settings 

Constraint Selection 

Ortho Projection Selection
