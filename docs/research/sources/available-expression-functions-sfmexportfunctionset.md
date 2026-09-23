<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-expression-functions-sfmexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:50Z
     extracted from HTML; wording verbatim, layout lost -->

Available Expression Functions (SfmExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Expression Functions (SfmExportFunctionSet) 

Available Expression Functions (SfmExportFunctionSet)

Expression functions available within SfmExportFunctionSet. 

On this page 

GetPointCount 

Returns the number of points visible by at least one selected camera, matching the specified flags, and observed by at least the minimum and at most the maximum number of tracks defined.

Syntax: 

GetPointCount( flags, minTrack, maxTrack ) 

| | | 

flags
| 
STRING
| 
Defines which points to exclude from export
| 

minTrack
| 
UINT
| 
Minimal number of cameras from which the point is seen.
| 

maxTrack
| 
UINT
| 
Maximal number of cameras from which the point is seen.
| 

Available Flags 

Multiple flags can be combined by listing them (e.g.,  "weak outlier ill" ). Points with at least one of the specified flags will be excluded.  

| | 

active
| 
Point is active in the reconstruction.
| 

ill
| 
Point’s apical angle is smaller than the minimum required value.
| 

outlier
| 
Point has an invalid projection.
| 

weak
| 
Point is an unverified two-view point.
| 

fixed
| 
Point coordinate is fixed and cannot be moved.
| 

selected
| 
Point is selected.
| 

hidden
| 
Point is hidden.
| 

ImageToCameraIndex 

Returns the camera index corresponding to the specified image.

Syntax: 

ImageToCameraIndex( imageIndex ) 

Parameter | Type | Description | 

  imageIndex 
| 
UINT
| 
Index of the image.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

GetPointCount 

Available Flags 

ImageToCameraIndex
