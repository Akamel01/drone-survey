<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-controlpointsexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:18Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (ControlPointsExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (ControlPointsExportFunctionSet) 

Available Functions (ControlPointsExportFunctionSet)

Functions available within ControlPointsExportFunctionSet. 

On this page 

ExportControlPoints 

Outputs information on control points.

Syntax: 

$ExportControlPoints( noParametersJustAnyText ) 

Available Variables 

| | | 

Variable
| 
Type
| 
Description
| 

index 
| 
UINT
| 
Index of the control point.
| 

name 
| 
STRING
| 
Name of the control point.
| 

x
| 
DOUBLE
| 
The X-axis coordinate in the output CS (valid only if isGroundControl is true and output CS is Cartesian; isCoordSystemLatLon is false).
| 

y
| 
DOUBLE
| 
The Y-axis coordinate in the output CS 

(valid only if  isGroundControl  is true and output CS is Cartesian; isCoordSystemLatLon is false).  
| 

z
| 
DOUBLE
| 
The Z-axis coordinate in the output CS 

(valid only if  isGroundControl  is true and output CS is Cartesian; isCoordSystemLatLon is false).  
| 

lat
| 
DOUBLE
| 
The latitude coordinate in the output CS (valid only if isGroundControl is true and CS is geogrphic;  isCoordSystemLatLon is  true).  
| 

lon
| 
DOUBLE
| 
The longitude coordinate in the output CS (valid only if isGroundControl is true and CS is geogrphic;  isCoordSystemLatLon is  true).    
| 

alt
| 
DOUBLE
| 
The altitude coordinate in the output CS (valid only if isGroundControl is true and CS is geogrphic;  isCoordSystemLatLon is  true).    
| 

isGroundControl
| 
BOOL
| 
True for Ground control or Ground test; otherwise false.
| 

isGroundTest
| 
BOOL
| 
True for Ground test; otherwise false.
| 

isAligned 
| 
BOOL
| 
False before alignment; true after alignment.
| 

calibrationType 
| 
UINT
| 
0 = Tie point, 1 = Ground control, 2 = Ground test.
| 

measurementCount 
| 
UINT
| 
Number of images the control point is assigned to.
| 

inputCSName 
| 
STRING
| 
Name of the input coordinate system.
| 

inputCSUnit 
| 
STRING
| 
Unit of the input coordinate system.
| 

inputCSIsLatLon 
| 
BOOL
| 
True if the input system is Geographic; false if Cartesian.
| 

inputCSUnitToMeter 
| 
DOUBLE
| 
Multiplier used to convert units to meters.
| 

inx
| 
DOUBLE
| 
The input X-axis coordinate in the input CS (valid only if Cartesian).
| 

iny
| 
DOUBLE
| 
The input Y-axis coordinate in the input CS (valid only if Cartesian).
| 

inz
| 
DOUBLE
| 
The input Z-axis coordinate in the input CS (valid only if Cartesian).
| 

inlat
| 
DOUBLE
| 
The input latitude coordinate in the input CS (valid only if Geographic).
| 

inlon
| 
DOUBLE
| 
The input longitude coordinate in the input CS (valid only if Geographic).
| 

inalt
| 
DOUBLE
| 
The input altitude coordinate in the input CS (valid only if Geographic).
| 

euclidx
| 
DOUBLE
| 
The X-axis coordinate in the Euclidean CS.
| 

euclidy
| 
DOUBLE
| 
The Y-axis coordinate in the Euclidean CS.
| 

euclidz
| 
DOUBLE
| 
The Z-axis coordinate in the Euclidean CS.
| 

weight
| 
FLOAT
| 
Weight of the control point in the alignment process.
| 

actualXInCS
| 
DOUBLE
| 
The X-axis coordinate calcualted during the alignment in the input CS.
| 

actualYInCS
| 
DOUBLE
| 
The Y-axis coordinate calcualted during the alignment in the input CS.
| 

actualZInCS
| 
DOUBLE
| 
The Z-axis coordinate calcualted during the alignment in the input CS.
| 

actualLatInCS
| 
DOUBLE
| 
The latitude coordinate calcualted during the alignment in the input CS.
| 

actualLonInCS
| 
DOUBLE
| 
The longitude coordinate calcualted during the alignment in the input CS.
| 

actualAltInCS
| 
DOUBLE
| 
The altitude coordinate calcualted during the alignment in the input CS.
| 

actualXEuclid
| 
DOUBLE
| 
The X-axis coordinate calcualted during the alignment in the Euclidean CS.
| 

actualYEuclid
| 
DOUBLE
| 
The Y-axis coordinate calcualted during the alignment in the Euclidean CS.
| 

actualZEuclid 
| 
DOUBLE
| 
The Z-axis coordinate calcualted during the alignment in the Euclidean CS.
| 

actualX
| 
DOUBLE
| 
Actual X-axis coordinate computed during alignment (valid only if isAligned is true and input CS is Cartesian).
| 

actualY
| 
DOUBLE
| 
Actual Y-axis coordinate computed during alignment (valid only if isAligned is true and input CS is Cartesian).
| 

actualZ
| 
DOUBLE
| 
Actual Z-axis coordinate computed during alignment (valid only if isAligned is true and input CS is Cartesian).
| 

actualLat
| 
DOUBLE
| 
Actual latitude coordinate computed during alignment (valid only if isAligned is true and input CS is Geographic).
| 

actualLon
| 
DOUBLE
| 
Actual longitude coordinate computed during alignment (valid only if isAligned is true and input CS is Geographic).
| 

actualAlt
| 
DOUBLE
| 
Actual altitude coordinate computed during alignment (valid only if isAligned is true and input CS is Geographic).
| 

gpsLat
| 
DOUBLE
| 
Input latitude in EPSG:4326 (WGS 84), if component is georeferenced.
| 

gpsLon
| 
DOUBLE
| 
Input longitude in EPSG:4326 (WGS 84), if component is georeferenced.
| 

gpsAlt
| 
DOUBLE
| 
Input altitude in EPSG:4326 (WGS 84), if component is georeferenced.
| 

actualGpsLat
| 
DOUBLE
| 
Actual latitude in EPSG:4326 computed during alignment (valid only if isAligned is true and the component is geo-referenced).
| 

actualGpsLon
| 
DOUBLE
| 
Actual longitude in EPSG:4326 computed during alignment (valid only if isAligned is true and the component is geo-referenced).
| 

actualGpsAlt 
| 
DOUBLE
| 
Actual altitude in EPSG:4326 computed during alignment (valid only if isAligned is true and the component is geo-referenced).
| 

hasUncertainty 
| 
BOOL
| 
True if prior precision is defined.
| 

uncertaintySize
| 
DOUBLE
| 
Triangulation uncertainty in CS units.
| 

uncertaintyVectorX
| 
DOUBLE
| 
Triangulation uncertainty along the X-axis.
| 

uncertaintyVectorY
| 
DOUBLE
| 
Triangulation uncertainty along the Y-axis.
| 

uncertaintyVectorZ 
| 
DOUBLE
| 
Triangulation uncertainty along the Z-axis.
| 

inAccuracyX
| 
DOUBLE
| 
Prior accuracy on the X-axis.
| 

inAccuracyY
| 
DOUBLE
| 
Prior accuracy on the Y-axis.
| 

inAccuracyZ 
| 
DOUBLE
| 
Prior accuracy on the Z-axis.
| 

inA1
| 
FLOAT
| 
Prior accuracy matrix a1,1 (usually equals inAccuracyX).
| 

inA2
| 
FLOAT
| 
Prior accuracy matrix a1,2 (usually 0).
| 

inA3
| 
FLOAT
| 
Prior accuracy matrix a1,3 (usually 0).
| 

inA4
| 
FLOAT
| 
Prior accuracy matrix a2,1 (usually 0).
| 

inA5
| 
FLOAT
| 
Prior accuracy matrix a2,2 (usually equals inAccuracyY).
| 

inA6
| 
FLOAT
| 
Prior accuracy matrix a2,3 (usually 0).
| 

inA7
| 
FLOAT
| 
Prior accuracy matrix a3,1 (usually 0).
| 

inA8
| 
FLOAT
| 
Prior accuracy matrix a3,2 (usually 0).
| 

inA9
| 
FLOAT
| 
Prior accuracy matrix a3,3 (usually equals inAccuracyZ).
| 

Available Functions 

Functions available under the ExportControlPoints function.

ControlPointError 

Outputs the projection error of the control point.

Syntax: 

$ControlPointError( index, anyText ) 

Parameter | Type | Description | 

index 
| 
UINT
| 
Index of a control point. Use $ ExportControlPoints to obtain indexes for all control points (see the example below).
| 

Available Variables 

Variable | Type | Description | 

cpIndex 
| 
UINT
| 
Index of the control point.
| 

cpError3D 
| 
DOUBLE
| 
Total deviation: distance between the calculated and defined positions of the control point, in input coordinate system units.
| 

cpErrorX
| 
DOUBLE
| 
Alignment error along the X-axis.
| 

cpErrorY
| 
DOUBLE
| 
Alignment error along the Y-axis.
| 

cpErrorZ 
| 
DOUBLE
| 
Alignment error along the Z-axis.
| 

maxPlacementError 
| 
DOUBLE
| 
Maximal projection error for the calculated position, in pixels.
| 

Example 

paRSer 

$ExportControlPoints(
Index: $(index)
Name: $(name)
Number of measurements: $(measurementsCount)
Ground control: $(isGroundControl) 
Ground test: $(isGroundTest) 
Calibration type: $(calibrationType) 
Coordinate system name: $(inputCSName) 
Geographic coordinate system: $(inputCSIsLatLon) 
Input x: $(inx) 

Copy full snippet (47 lines long) 

ExportControlPointsMeasurements 

Outputs information on control points.

Syntax: 

$ExportControlPoints( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

measurementIndex
| 
UINT
| 
Index of the measurement.
| 

pointIndex
| 
UINT
| 
Index of the control point.
| 

imageIndex 
| 
UINT
| 
Index of the image.
| 

pointName 
| 
STRING
| 
Name of the control point.
| 

imagePath
| 
WCHAR_STRING
| 
File path to the image.
| 

imageName
| 
WCHAR_STRING
| 
Name of the image file.
| 

imageExt 
| 
WCHAR_STRING
| 
Extension of the image file.
| 

x
| 
DOUBLE
| 
The X-axis coordinate of the control point projected onto the image, in pixels.
| 

y
| 
DOUBLE
| 
The Y-axis coordinate of the control point projected onto the image, in pixels.
| 

inAccuracyX
| 
DOUBLE
| 
Expected accuracy of the manually placed control point along the X-axis, in pixels.
| 

inAccuracyY
| 
DOUBLE
| 
Expected accuracy of the manually placed control point along the Y-axis, in pixels.
| 

inAccuracyAngle 
| 
DOUBLE
| 
Rotation angle of the inaccuracy region, which can be determined when automatic marker detection is used.
| 

Available Functions 

Functions available under the ExportControlPointsMeasurements function.

ImageMeasurementError 

Outputs the projection error of the control point's image measurements. 

Syntax: 

$ImageMeasurementError( pointIndex, measurementIndex, anyText ) 

Parameter | Type | Description | 

pointIndex 
| 
UINT
| 
Index of a control point. Use ExportControlPointsMeasurements to obtain indexes of all control points (see the example below).
| 

measurementIndex 
| 
UINT
| 
Index of a measurement. Use ExportControlPointsMeasurements to obtain indexes of all measurements (see the example below).
| 

Available Variables 

Variable | Type | Description | 

measurementId 
| 
UINT
| 
Index of the measurement.
| 

measurementError 
| 
DOUBLE
| 
Deviation between the projected and defined measurement positions, in pixels.
| 

Example 

paRSer 

$ExportControlPointsMeasurements(
Measurement index: $(measurementIndex)
Control point index: $(pointIndex)
Image index: $(imageIndex)
Control point name: $(pointName)
Image path: $(imagePath)
Image name: $(imageName)
Image extension: $(imageExt)
x: $(x)
y: $(y)

Copy full snippet (15 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportControlPoints 

Available Variables 

Available Functions 

ControlPointError 

Available Variables 

Example 

ExportControlPointsMeasurements 

Available Variables 

Available Functions 

ImageMeasurementError 

Available Variables 

Example
