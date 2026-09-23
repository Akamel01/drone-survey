<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-contoursfunctionset
     http: 200
     fetched: 2026-09-19T01:50:17Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (ContoursFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (ContoursFunctionSet) 

Available Functions (ContoursFunctionSet)

Functions available within ContoursFunctionSet. 

On this page 

IterateContourSets 

Iterates the contour sets of the selected ortho projection.

Syntax: 

$IterateContourSets( orthoGuid, anyText ) 

Parameter | Type | Description | 

orthoGuid
| 
STRING - GUID
| 
GUID of the ortho projection.
| 

Available Variables 

Variable | Type | Description | 

ContourSetIndex 
| 
UINT
| 
An index of the contour set.
| 

Example 

paRSer 

$IterateOrthoProjections( 
$IterateContourSets ( "$(orthoGuid)", $(ContourSetIndex))
) 

$IterateOrthoProjections( 
$IterateContourSets ( "$(orthoGuid)", $(ContourSetIndex))
) 
Copy full snippet (3 lines long) 

ExportContourSet 

Iterates the contour sets of the selected ortho projection.

Syntax: 

$ExportContourSet(orthoGuid, setId, epsilon, anyText) 

Parameter | Type | Description | 

orthoGuid
| 
STRING - GUID
| 
GUID of the ortho projection.
| 

setId
| 
UINT
| 
Identifier of the contour set.
| 

epsilon 
| 
FLOAT
| 
Tolerance (real number) used by the polyline simplification algorithm.
| 

Available Variables 

Variable | Type | Description | 

contoursName 
| 
STRING
| 
Name of the contour set.
| 

contoursPixelType 
| 
WCHAR_STRING
| 
Specifies whether the contours were generated from the Depth or Altitude layer.  
| 

contoursLayer 
| 
WCHAR_STRING
| 
Indicates whether the contours were created on the DSM or DTM layer.  
| 

contoursMin 
| 
DOUBLE
| 
Minimal depth or altitude value, depending on the pixel type.
| 

contoursMax 
| 
DOUBLE
| 
Maximal depth or altitude value, depending on the pixel type.
| 

contoursInterval 
| 
DOUBLE
| 
Depth or altitude difference between two consecutive contours.
| 

contoursCount 
| 
UINT
| 
Number of contours in the set.
| 

Available Functions 

Functions available under the ExportContourSet function.

GetRenderParameters 

Provides the proposed parameters for rendering contours.

Syntax: 

$GetRenderParameters( pixelSize, anyText ) 

Parameter | Type | Description | 

pixelSize
| 
DOUBLE
| 
Requested side length divided by the original side length.
| 

Available Variables 

Variable | Type | Description | 

contoursRenderStep 
| 
UINT
| 
Step size, in contour indexes, between rendered contours. The value is either 1 or a multiple of 5.
| 

contoursRenderFirstIndex 
| 
UINT
| 
Index of the first contour to be rendered.
| 

contoursRenderMajorIndex 
| 
UINT
| 
Index of the first highlighted contour, chosen so that every fifth rendered contour is highlighted and corresponds to a rounded depth or altitude value.
| 

ToWorldPoint 

Determines the world coordinates of the given point.

Syntax: 

$ToWorldPoint( imageX, imageY, Z, anyText ) 

Parameter | Type | Description | 

imageX
| 
DOUBLE
| 
The X-axis image coordinate.
| 

imageY 
| 
DOUBLE
| 
The Y-axis image coordinate.
| 

Z
| 
DOUBLE
| 
Altitude or depth is expressed in the world coordinate system (for example, in meters above sea level) and should have the same value as the worldZ variable.
| 

Available Variables 

Variable | Type | Description | 

worldX 
| 
DOUBLE
| 
The X-axis world coordinate.
| 

worldZ
| 
DOUBLE
| 
The Y-axis world coordinate.
| 

worldZ
| 
DOUBLE
| 
The Z-axis world coordinate.
| 

IterateContours 

Determines the world coordinates of the given point. Iterates through the contours of the contour set, functioning like a for-loop:
for (contourIndex = startIndex; contourIndex < endIndex; contourIndex += step) 

Syntax: 

$IterateContours( startIndex, endIndex, step, anyText ) 

Parameter | Type | Description | 

startIndex
| 
UINT
| 
Index of the contour where the iteration begins.
| 

endIndex
| 
UINT
| 
Index of the contour where the iteration ends.
| 

step 
| 
UINT
| 
Step value used to increment the contour index during iteration.
| 

Available Variables 

Variable | Type | Description | 

contourAltitude 
| 
DOUBLE
| 
Altitude or depth value of the contour.
| 

contourPolylineCount 
| 
UINT
| 
Number of polylines that form the contour.
| 

contourIndex 
| 
UINT
| 
Index of the contour within the contour set.
| 

Available Functions 

Functions available under the IterateContours function.

IterateLabels 

Finds positions for labels placed at intervals of the specified number of pixels along the polyline.

Syntax: 

$IterateLabels( interval, anyText ) 

Parameter | Type | Description | 

interval 
| 
DOUBLE
| 
The interval is defined in pixels of the original image.
| 

Available variables 

Variable | Type | Description | 

labelX   
| 
DOUBLE
| 
The X-axis image coordinate of the center of a label.
| 

labelY
| 
DOUBLE
| 
The Y-axis image coordinate of the center of a label.
| 

labelAngleRad 
| 
DOUBLE
| 
Angle of the label in radians; 0 is horizontal, increasing clockwise.
| 

labelAngleDeg 
| 
DOUBLE
| 
Angle of the label in degrees; 0 is horizontal, increasing clockwise.
| 

IteratePolylines 

Iterates through the polylines that make up the contour.

Syntax: 

$IteratePolylines( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

polylineLastPointX
| 
DOUBLE
| | 

polylineLastPointY
| 
DOUBLE
| | 

polylineLastPointZ 
| 
DOUBLE
| | 

polylineFirstPointX
| 
DOUBLE
| | 

polylineFirstPointY
| 
DOUBLE
| | 

polylineFirstPointZ 
| 
DOUBLE
| | 

polylineRealLength 
| 
DOUBLE
| | 

polylineRealLengthImg 
| 
DOUBLE
| | 

polylineIndex 
| 
UINT
| | 

polylineIsClosed 
| 
BOOL
| | 

polylinePointCount 
| 
UINT
| | 

Available Functions 

IteratePoints

Iterates through the points that form the polylines.

Syntax:

$IteratePoints( noParametersJustAnyText ) 

Available variables:

Variable | Type | Description | 

pointX
| 
DOUBLE
| 
The X-axis image coordinate of the point.
| 

pointY
| 
DOUBLE
| 
The Y-axis image coordinate of the point.
| 

pointZ
| 
DOUBLE
| 
The Z-axis image coordinate of the point.
| 

pointIndex
| 
UINT
| 
Index of the point within the polyline.
| 

Example 

paRSer 

$IterateOrthoProjections( 
$Declare("setID", GetSelectedContourSetId("$(orthoGuid)"))
$ExportOrthoProjection( "$(orthoGuid)", 
$Declare("pixelSize" , GetSimplifyingFactor(orthoUppx))
$ExportContourSet( "$(orthoGuid)", setID, pixelSize,
Contour Set Name: $(contoursName)
Pixel type: $(contoursPixelType)
Layer: $(contoursLayer)
Minimal value: $(contoursMin)
Maximal value: $(contoursMax)

Copy full snippet (22 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

IterateContourSets 

Available Variables 

Example 

ExportContourSet 

Available Variables 

Available Functions 

GetRenderParameters 

Available Variables 

ToWorldPoint 

Available Variables 

IterateContours 

Available Variables 

Available Functions 

IterateLabels 

IteratePolylines 

Example
