<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-variables-sfmexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:50Z
     extracted from HTML; wording verbatim, layout lost -->

Available Variables (SfmExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Variables (SfmExportFunctionSet) 

Available Variables (SfmExportFunctionSet)

Variables available within SfmExportFunctionSet. 

On this page 

Variable | Type | Description | 

cameraCount 
| 
UINT
| 
Number of all or selected cameras registered in the selected component.
| 

pointCount 
| 
UINT
| 
Number of registered points in the selected component.
| 

measurementCount 
| 
UINT
| 
Number of measurements in the selected component.
| 

commonWidth 
| 
UINT
| 
Width of an undistorted image.
| 

commonHeight 
| 
UINT
| 
Height of an undistorted image.
| 

cameraImageModelId 
| 
UINT
| 
Index of the camera image model.
| 

isGeoreferenced 
| 
INT
| 
Returns 1 if the selected component is geo-referenced, otherwise 0 .  
| 

isCoordSystemLatLon 
| 
BOOL
| 
True if the output coordinate system is Geographic; false if Cartesian.
| 

units 
| 
STRING
| 
Measurement unit of the selected component (e.g., meter).
| 

unitsShort 
| 
STRING
| 
Short name of the measurement unit (e.g., m).
| 

coordSystemName 
| 
STRING
| 
Name of the output coordinate system if the selected component is geo-referenced ( isGeoreferenced = 1); otherwise outputs "Grid Plane" .  
| 

coordSystemUnit2Meter 
| 
DOUBLE
| 
Conversion factor from the coordinate system units to meters.
| 

displayScale 
| 
FLOAT
| 
Recommended size of one unit for rendering.
| 

Component Anchor Variables 

To maximize calculation accuracy, components are computed in coordinates centered near zero. The Anchor (rotation + translation) transforms this local coordinate system into a global Euclidean space, as defined by:

EuclideanX = anchor.Rotation T * X + anchor 

EuclideanY = anchor.Rotation T    * Y + anchor 

EuclideanZ = anchor.Rotation T    * Z + anchor 

Variable | Type | Description | 

anchorX
| 
DOUBLE
| 
X coordinate of the anchor.
| 

anchorY
| 
DOUBLE
| 
Y coordinate of the anchor.
| 

anchorZ
| 
DOUBLE
| 
Z coordinate of the anchor.
| 

anchorR00
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR01
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR02
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR10
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR11
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR12
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR20
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR21
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorR22
| 
DOUBLE
| 
Element of the anchor rotation matrix with respect to the anchor coordinate system.
| 

anchorYaw
| 
DOUBLE
| 
Yaw value of the anchor.
| 

anchorPitch
| 
DOUBLE
| 
Pitch value of the anchor.
| 

anchorRoll
| 
DOUBLE
| 
Roll value of the anchor.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Component Anchor Variables
