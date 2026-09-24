<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-distanceconstraintsexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:19Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (DistanceConstraintsExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (DistanceConstraintsExportFunctionSet) 

Available Functions (DistanceConstraintsExportFunctionSet)

Functions available within DistanceConstraintsExportFunctionSet. 

On this page 

ExportDistanceConstraints 

Output information on the distance constraints.

Syntax: 

$ExportDistanceConstraints( noParametersJustAnyTex ) 

Available variables 

Variable | Type | Description | 

constraintName
| 
WCHAR_STRING
| 
Name of the distance constraint.
| 

pointA
| 
WCHAR_STRING
| 
First endpoint of the distance constraint.
| 

pointB 
| 
WCHAR_STRING
| 
Second endpoint of the distance constraint.
| 

Enable 
| 
BOOL
| 
True if the distance constraint is included in calculations; otherwise false.
| 

definedDistance
| 
FLOAT
| 
User-defined distance between the two endpoints.
| 

definedAccuracy
| 
FLOAT
| 
Prior accuracy of the defined distance.
| 

calculatedDistance
| 
FLOAT
| 
Distance between the two endpoints as calculated by the software.
| 

distanceError 
| 
FLOAT
| 
Difference between calculatedDistance and definedDistance .
| 

constraintCS
| 
STRING
| 
Coordinate system in which the constraint is defined.
| 

constraintCSUnit
| 
STRING
| 
Unit of the coordinate system in which the constraint is defined.
| 

constraintCSUnitShort 
| 
STRING
| 
Abbreviated name of the coordinate system unit.
| 

constraintCSUnitToMeter 
| 
DOUBLE
| 
Multiplier used to convert units to meters.
| 

InCurrentComponent 
| 
BOOL
| 
True if both endpoints are projected onto at least one image registered in the selected component; otherwise false.
| 

Example 

paRSer 

$ExportDistanceConstraints(
Constraint name: $(constraintName)
Point A: $(pointA)
Point B: $(pointB)
Enable: $(Enable)
Defined distance: $(definedDistance)
Calculated distance: $(calculatedDistance)
Distance error: $(distanceError)
InCurrentComponent: $(InCurrentComponent)
) 

$ExportDistanceConstraints(
Constraint name: $(constraintName)
Point A: $(pointA)
Point B: $(pointB)
Enable: $(Enable)
Defined distance: $(definedDistance)
Calculated distance: $(calculatedDistance)
Distance error: $(distanceError)
InCurrentComponent: $(InCurrentComponent)
) 
Copy full snippet (10 lines long) 

DistanceConstraintError 

Output the distance constraint error information.

Syntax: 

$DistanceConstraintError( index, anyText ) 

Parameter | Type | Description | 

index 
| 
UINT
| 
Index of a distance constraint.
| 

Available variables 

Variable | Type | Description | 

constraintError 
| 
FLOAT
| 
Returns the same value as distanceError in ExportDistanceConstraints , but for a specific constraint. If the provided index is not valid, the returned error value is -1 .
| 

Example 

paRSer 

$DistanceConstraintError( 1, 
Error: $(constraintError)
) 

$DistanceConstraintError( 1, 
Error: $(constraintError)
) 
Copy full snippet (3 lines long) 

 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportDistanceConstraints 

Available variables 

Example 

DistanceConstraintError 

Available variables 

Example
