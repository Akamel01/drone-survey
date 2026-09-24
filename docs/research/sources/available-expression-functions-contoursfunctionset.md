<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-expression-functions-contoursfunctionset
     http: 200
     fetched: 2026-09-19T01:50:16Z
     extracted from HTML; wording verbatim, layout lost -->

Available Expression Functions (ContoursFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Expression Functions (ContoursFunctionSet) 

Available Expression Functions (ContoursFunctionSet)

Expression functions available within ContoursFunctionSet. 

On this page 

GetNumberOfContourSets 

Returns the number of contour sets in the selected ortho projection.

Syntax: 

GetNumberOfContourSets( orthoGuid ) 

Parameter | Type | Description | 

  orthoGuid 
| 
STRING - GUID
| 
GUID of an ortho projection.
| 

GetSelectedContourSetId 

Returns the ID of the currently selected contour set in the chosen ortho projection.

Syntax: 

GetSelectedContourSetId( orthoGuid ) 

Parameter | Type | Description | 

  orthoGuid 
| 
STRING - GUID
| 
GUID of an ortho projection.
| 

GetSimplifyingFactor 

Returns the ratio of the requested side length to the original side length.

Syntax: 

GetSimplifyingFactor( pixelSize ) 

Parameter | Type | Description | 

 pixelSize 
| 
DOUBLE
| 
Requested length of a side divided by original length of the side.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

GetNumberOfContourSets 

GetSelectedContourSetId 

GetSimplifyingFactor
