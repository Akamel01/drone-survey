<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-misalignmentfunctionset
     http: 200
     fetched: 2026-09-19T01:50:24Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (MisalignmentFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (MisalignmentFunctionSet) 

Available Functions (MisalignmentFunctionSet)

Functions available within MisalignmentFunctionSet. 

On this page 

ExportMisalignmentPoints 

Returns point indexes and their misalignments.

Syntax: 

$ExportMisalignmentPoints( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

index 
| 
UINT
| 
Index of the point.
| 

misalignment 
| 
UINT
| 
Misalignment value of the point.
| 

Example 

paRSer 

$ExportMisalignmentPoints(
Index: $(index)
Misalignment: $(misalignment)
) 

$ExportMisalignmentPoints(
Index: $(index)
Misalignment: $(misalignment)
) 
Copy full snippet (4 lines long) 

ExportMisalignmentCameras 

Returns camera misalignment information.

Syntax: 

$ExportMisalignmentCameras( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

cameraSfmImage 
| 
UINT
| 
Index of the image (camera).
| 

connectionCount 
| 
UINT
| 
Number of connections associated with the image.
| 

Available Functions 

Function available under the ExportMisalignmentCameras function.

ExportMisalignmentCameraConnections 

Exports information about the misalignment of the camera connections.

Syntax: 

$ExportMisalignmentCameraConnections( cameraSfmImage, anyText ) 

Parameter | Type | Description | 

cameraSfmImage 
| 
UINT
| 
Index of the image (camera).
| 

Available Variables 

Variable | Type | Description | 

neighborSfmImage 
| 
UINT
| 
Index of the neighboring image.
| 

connectionStrength 
| 
UINT
| 
Strength of the connection to the neighboring image.
| 

Example 

paRSer 

$ExportMisalignmentCameras(
Image index: $(cameraSfmImage)
Connection count: $(connectionCount)
$ExportMisalignmentCameraConnections( 1,
Neighbor Image Index: $(neighborSfmImage)
Connection strength: $(connectionStrength)
) 

$ExportMisalignmentCameras(
Image index: $(cameraSfmImage)
Connection count: $(connectionCount)
$ExportMisalignmentCameraConnections( 1,
Neighbor Image Index: $(neighborSfmImage)
Connection strength: $(connectionStrength)
) 
Copy full snippet (7 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportMisalignmentPoints 

Available Variables 

Example 

ExportMisalignmentCameras 

Available Variables 

Available Functions 

ExportMisalignmentCameraConnections 

Available Variables 

Example
