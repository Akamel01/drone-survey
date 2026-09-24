<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-relativecamerauncertaintyfunctionset
     http: 200
     fetched: 2026-09-19T01:50:49Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (RelativeCameraUncertaintyFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (RelativeCameraUncertaintyFunctionSet) 

Available Functions (RelativeCameraUncertaintyFunctionSet)

Functions available within RelativeCameraUncertaintyFunctionSet. 

On this page 

ExportRelativeCameraPositionUncertainty 

Provides information about the relative uncertainty of camera position

Syntax: 

$ExportRelativeCameraPositionUncertainty( imageIndex, anyText ) 

Parameter | Type | Description | 

imageIndex
| 
UINT
| 
Index of the image.
| 

Available Variables 

Variable | Type | Description | 

posUncertCovXX 
| 
DOUBLE
| 
Covariance of the X coordinate with respect to the X coordinate.
| 

posUncertCovXY 
| 
DOUBLE
| 
Covariance of the X coordinate with respect to the Y coordinate.
| 

posUncertCovXZ 
| 
DOUBLE
| 
Covariance of the X coordinate with respect to the Z coordinate.
| 

posUncertCovYY 
| 
DOUBLE
| 
Covariance of the Y coordinate with respect to the Y coordinate.
| 

posUncertCovYZ 
| 
DOUBLE
| 
Covariance of the Y coordinate with respect to the Z coordinate.
| 

posUncertCovZZ 
| 
DOUBLE
| 
Covariance of the Z coordinate with respect to the Z coordinate.
| 

Example 

paRSer 

$IterateCameras(
Image index: $(cameraImageIndex)
$ExportRelativeCameraPositionUncertainty( "$(cameraImageIndex)",
Var XX: $(posUncertCovXX)
Var XY:
)
)
) 

$IterateCameras(
Image index: $(cameraImageIndex)
$ExportRelativeCameraPositionUncertainty( "$(cameraImageIndex)",
Var XX: $(posUncertCovXX)
Var XY:
)
)
) 
Copy full snippet (8 lines long) 

CovToEllipse2D 

Provides information about the relative uncertainty of camera position

Syntax: 

$CovToEllipse2D( Qxx, Qxy, Qyy, anyText ) 

Parameter | Type | Description | 

Qxx
| 
DOUBLE
| 
Covariance value for X with respect to X.
| 

Qxy
| 
DOUBLE
| 
Covariance value for X with respect to Y.
| 

Qyy 
| 
DOUBLE
| 
Covariance value for Y with respect to Y.
| 

Available Variables 

Variable | Type | Description | 

ellipseRadiusMax 
| 
DOUBLE
| 
Maximum radius of the ellipse.
| 

ellipseRadiusMin 
| 
DOUBLE
| 
Minimum radius of the ellipse.
| 

ellipseRot 
| 
DOUBLE
| 
Rotation angle of the ellipse.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportRelativeCameraPositionUncertainty 

Available Variables 

Example 

CovToEllipse2D 

Available Variables
