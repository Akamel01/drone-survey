<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-inputsfunctionset
     http: 200
     fetched: 2026-09-19T01:50:21Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (InputsFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (InputsFunctionSet) 

Available Functions (InputsFunctionSet)

Functions available within InputsFunctionSet. 

On this page 

ExportImageResolutionStats 

Outputs all image resolutions along with the corresponding image counts.

Syntax: 

$ExportImageResolutionStats( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

imageWidth
| 
UINT
| 
Width of the image.
| 

imageHeight
| 
UINT
| 
Height of the image.
| 

imageCount 
| 
UINT
| 
Number of images with dimensions equal to imageWidth and imageHeight. 
| 

Example 

paRSer 

$ExportImageResolutionStats(
Image width: $(imageWidth)
Image height: $(imageHeight)
Number of images: $(imageCount)
) 

$ExportImageResolutionStats(
Image width: $(imageWidth)
Image height: $(imageHeight)
Number of images: $(imageCount)
) 
Copy full snippet (5 lines long) 

ExportCameraModels 

Exports all camera model types used to capture photos and LiDAR scans.

Syntax: 

$ExportCameraModels( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

cameraModel 
| 
STRING
| 
A model of the camera.
| 

Example 

paRSer 

$ExportCameraModels(
Camera model: $(cameraModel)
) 

$ExportCameraModels(
Camera model: $(cameraModel)
) 
Copy full snippet (3 lines long) 

ExportInputsGrouping 

Export information about input groups.

Syntax: 

$ExportInputsGrouping( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

groupCount
| 
INT
| 
Number of groups.
| 

groupedInputCount
| 
INT
| 
Number of inputs that are part of a group.
| 

ungroupedInputCount
| 
INT
| 
Number of inputs that are not part of any group.
| 

Available Functions 

Functions available under the  ExportInputsGrouping function.

IterateGroups 

Iterates through input groups.

Syntax: 

$IterateGroups( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

groupIndex
| 
INT
| 
Index value of the group.
| 

calibrationGroup
| 
INT
| 
alibration group identifier.
| 

distortionGroup
| 
INT
| 
Distortion group identifier.
| 

refWidth
| 
UINT
| 
Reference image width.
| 

refHeight
| 
UINT
| 
Reference image height.
| 

refImageIndex
| 
UINT
| 
Index of the reference image.
| 

count
| 
UINT
| 
Number of images in the group.
| 

cameraModel
| 
STRING
| 
Camera model used.
| 

lensModel
| 
STRING
| 
Lens model used.
| 

Example 

paRSer 

$ExportInputsGrouping( 
Group count: $(groupCount)
Grouped Input Count: $(groupedInputCount)
Ungrouped Input Count: $(ungroupedInputCount)
$IterateGroups(
Group index: $(groupIndex)
Calibration Group: $(calibrationGroup)
Distortion Group: $(distortionGroup)
Width: $(refWidth)
Height: $(refHeight)

Copy full snippet (16 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportImageResolutionStats 

Available Variables 

Example 

ExportCameraModels 

Available Variables 

Example 

ExportInputsGrouping 

Available Variables 

Available Functions 

IterateGroups 

Available Variables 

Example
