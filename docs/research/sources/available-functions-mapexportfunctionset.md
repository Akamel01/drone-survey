<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-mapexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:23Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (MapExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (MapExportFunctionSet) 

Available Functions (MapExportFunctionSet)

Functions available within MapExportFunctionSet. 

On this page 

ExportMap 

Creates and saves a map cutout.

Syntax: 

$ExportMap( mapSourceIndex or “mapSourceName”, destinationImagePath, lonWest, lonEast, latSouth, latNorth, width, height ) 

Parameter | Type | Description | 

mapSourceIndex 

or

mapSourceName
| 
INT

or

STRING
| 
ID value or full name of the map provider, as defined in mapproviders.xml located in the installation folder.
| 

destinationImagePath 
| 
STRING
| 
Path to save the map image, either relative to the attachments folder or in the format global://globalPathToFile.
| 

lonWest
| 
DOUBLE
| 
Western longitude boundary of the map cutout (must differ from lonEast ).
| 

lonEast
| 
DOUBLE
| 
Eastern longitude boundary of the map cutout (must differ from lonWest ).
| 

latSouth
| 
DOUBLE
| 
Southern latitude boundary of the map cutout (–90 ≤ latSouth < latNorth ≤ 90).
| 

latNorth 
| 
DOUBLE
| 
Northern latitude boundary of the map cutout (–90 ≤ latSouth < latNorth ≤ 90).
| 

width
| 
UINT
| 
Width of the generated map image. Should be greater than 0.
| 

height 
| 
UINT
| 
Height of the generated map image. Should be greater than 0.
| 

GetExportedMapInfo 

Returns information about the exported mao cutout.

Syntax: 

$GetExportedMapInfo( mapFilepath, anyText ) 

Parameter | Type | Description | 

mapFilepath
| 
STRING
| 
Path to the map saved during the current report export session. It should match the path used in ExportMap .
| 

Available Variables 

Variable | Type | Description | 

requestedWest 
| 
DOUBLE
| 
Western longitude value set to define the boundary of the map cutout.
| 

requestedEast 
| 
DOUBLE
| 
Eastern longitude value set to define the boundary of the map cutout.
| 

requestedSouth 
| 
DOUBLE
| 
Southern latitude value set to define the boundary of the map cutout.
| 

requestedNorth 
| 
DOUBLE
| 
Northern latitude value set to define the boundary of the map cutout.
| 

exportedWest 
| 
DOUBLE
| 
Western longitude value defining the actual boundary of the exported map.
| 

exportedEast 
| 
DOUBLE
| 
Eastern longitude value defining the actual boundary of the exported map.
| 

exportedSouth 
| 
DOUBLE
| 
Southern latitude value defining the actual boundary of the exported map.
| 

exportedNorth 
| 
DOUBLE
| 
Northern latitude value defining the actual boundary of the exported map.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportMap 

GetExportedMapInfo 

Available Variables
