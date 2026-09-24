<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-orthomeasurementfunctionset
     http: 200
     fetched: 2026-09-19T01:50:46Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (OrthoMeasurementFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (OrthoMeasurementFunctionSet) 

Available Functions (OrthoMeasurementFunctionSet)

Functions available within OrthoMeasurementFunctionSet. 

On this page 

IterateOrthoMeasurements 

Iterates through the ortho projection's shapes and regions, extracting information about the measurements and metadata.

Syntax: 

$IterateOrthoMeasurements( orthoGuid, anyText ) 

Parameter | Type | Description | 

  orthoGuid
| 
WCHAR_STRING
| 
GUID of the ortho projection.
| 

Available Variables 

Variable | Type | Description | 

regionIndex 

| 
UINT
| 
Index of the region.
| 

regionColor_A 
| 
UINT
| 
Alpha channel value of the region’s color.
| 

regionColor_R 
| 
UINT
| 
Red channel value (RGB).
| 

regionColor_G 
| 
UINT
| 
Green channel value (RGB).
| 

regionColor_B 
| 
UINT
| 
Blue channel value (RGB).
| 

dimensionality 
| 
UINT
| 
Dimensionality of the region (1D or 2D).
| 

regionGuid 
| 
WCHAR_STRING
| 
GUID of the region.
| 

regionName 
| 
WCHAR_STRING
| 
Name of the region.
| 

hasOrthoVolume 
| 
BOOL
| 
True if the region contains volume information; otherwise false .
| 

hasOrthoArea 
| 
BOOL
| 
True if the region contains area information; otherwise false .
| 

hasOrthoBoundary 
| 
BOOL
| 
True if the region has a defined boundary and contains no holes; otherwise false .
| 

cutVolume
| 
DOUBLE
| 
Cut volume of the region.
| 

fillVolume 
| 
DOUBLE
| 
Fill volume of the region.
| 

area2d
| 
DOUBLE
| 
2D area of the region.
| 

area3d 
| 
DOUBLE
| 
3D area of the region.
| 

isClosed
| 
BOOL
| 
True if the region is closed (contains no holes); otherwise false .
| 

isAllHoles 
| 
BOOL
| 
True if the region lies entirely outside the ortho projection; otherwise false .
| 

orthoPerimeter
| 
DOUBLE
| 
Perimeter of the region in the ortho projection.
| 

boundaryMinBoxHeight
| 
DOUBLE
| 
Minimum height of the reconstruction region.
| 

boundaryMaxBoxHeight
| 
DOUBLE
| 
Maximum height of the reconstruction region.
| 

boundaryMinOrthoCSHeight
| 
DOUBLE
| 
Minimum height in the ortho projection’s coordinate system.
| 

boundaryMaxOrthoCSHeight 
| 
DOUBLE
| 
Maximum height in the ortho projection’s coordinate system.
| 

numPolygonVertices
| 
UINT
| 
Number of vertices in the region polygon.
| 

numBoundarySamples 
| 
UINT
| 
Number of boundary samples.
| 

labelBoxX
| 
DOUBLE
| 
Suitable X coordinate for label placement. For a closed boundary, it is positioned midway between the minimum and maximum X coordinate values. For an open boundary, it represents the midpoint along the boundary’s X direction. Defined only if hasOrthoBoundary is true.
| 

labelBoxY 
| 
DOUBLE
| 
Suitable Y coordinate for label placement. For a closed boundary, it is positioned midway between the minimum and maximum Y coordinate values. For an open boundary, it represents the midpoint along the boundary’s Y direction. Defined only if hasOrthoBoundary is true.
| 

boundaryMinAltitude
| 
DOUBLE
| 
Minimum altitude of the region (for georeferenced ortho projections).
| 

boundaryMaxAltitude
| 
DOUBLE
| 
Maximum altitude of the region (for georeferenced ortho projections).
| 

gpsPerimeter 
| 
DOUBLE
| 
Perimeter of the region when the ortho projection is georeferenced.
| 

Example 

paRSer 

$IterateOrthoProjections(
$IterateOrthoMeasurements( "$(orthoGuid)",
Region index: $(regionIndex )
Alpha channel value: $(regionColor_A)
Red value (RGB): $(regionColor_R)
Green value (RGB): $(regionColor_G)
Blue valuere: $(regionColor_B )
Dimensionality: $(dimensionality)
RegionGuid: $(regionGuid)
Region name: $(regionName)

Copy full snippet (32 lines long) 

IterateOrthoBoundarySamples 

Iterates through the boundary points of a region (2D) and extracts information about them.

Syntax: 

$IterateOrthoBoundarySamples( regionGuid, start, step, end, anyText ) 

Parameter | Type | Description | 

regionGuid
| 
STRING
| 
GUID of the ortho projection's region or a shape.
| 

start 
| 
INT
| 
Index of the first point.
| 

step 
| 
INT
| 
Step size in the number of points along the boundary.
| 

end 
| 
INT
| 
Index of the last point: the largest number smaller than end if step is positive, or the smallest number greater than end if step is negative.
| 

Available Variables 

Variable | Type | Description | 

pointIndex 
| 
INT
| 
Index of the point.
| 

isHole 
| 
BOOL
| 
Indicates if the point lies outside the ortho projection (true/false).
| 

boxX
| 
DOUBLE
| 
X coordinate of the point in the reconstruction region.
| 

boxY
| 
DOUBLE
| 
Y coordinate of the point in the reconstruction region.
| 

boxZ 
| 
DOUBLE
| 
Z coordinate of the point in the reconstruction region.
| 

orthoX
| 
DOUBLE
| 
X coordinate of the point in the ortho projection’s coordinate system.
| 

orthoY
| 
DOUBLE
| 
Y coordinate of the point in the ortho projection’s coordinate system.
| 

orthoZ 
| 
DOUBLE
| 
Z coordinate of the point in the ortho projection’s coordinate system.
| 

orthoDistanceFromStart 
| 
DOUBLE
| 
Distance from the starting point in the ortho projection’s coordinate system.
| 

euclidx
| 
DOUBLE
| 
X coordinate of the point in the Euclidean coordinate system.
| 

euclidy
| 
DOUBLE
| 
Y coordinate of the point in the Euclidean coordinate system.
| 

euclidz
| 
DOUBLE
| 
Z coordinate of the point in the Euclidean coordinate system.
| 

longitude
| 
DOUBLE
| 
Longitude (GPS).
| 

latitude
| 
DOUBLE
| 
Latitude (GPS).
| 

altitude
| 
DOUBLE
| 
Altitude (GPS).
| 

gpsDistanceFromStart 
| 
DOUBLE
| 
Distance from the starting point in the GPS coordinate system.
| 

Example 

paRSer 

$IterateOrthoProjections(
$IterateOrthoMeasurements( "$(orthoGuid)", 
$IterateOrthoBoundarySamples( "$(regionGuid)", 1, 50, 1000,
Point index: $(pointIndex)
Is hole: $(isHole)
Box X: $(boxX)
Box Y: $(boxY)
Box Z: $(boxZ)
Ortho X: $(orthoX)
Ortho Y: $(orthoY)

Copy full snippet (22 lines long) 

IterateOrthoBoundaryVertices 

Iterates through the boundary points of a region (3D) and extracts information about them.

Syntax: 

 $IterateOrthoBoundaryVertices( regionGuid, start, step, end, anyText ) 

Parameter | Type | Description | 

regionGuid
| 
STRING
| 
GUID of the ortho projection's region or a shape.
| 

start 
| 
INT
| 
Index of the first point.
| 

step 
| 
INT
| 
Step size in the number of points along the boundary.
| 

end 
| 
INT
| 
Index of the last point: the largest number smaller than end if step is positive, or the smallest number greater than end if step is negative.
| 

Available Variables 

Variable | Type | Description | 

pointIndex 
| 
INT
| 
Index of the point.
| 

isHole 
| 
BOOL
| 
Indicates if the point lies outside the ortho projection (true/false).
| 

boxX
| 
DOUBLE
| 
X coordinate of the point in the reconstruction region.
| 

boxY
| 
DOUBLE
| 
Y coordinate of the point in the reconstruction region.
| 

boxZ 
| 
DOUBLE
| 
Z coordinate of the point in the reconstruction region.
| 

orthoX
| 
DOUBLE
| 
X coordinate of the point in the ortho projection’s coordinate system.
| 

orthoY
| 
DOUBLE
| 
Y coordinate of the point in the ortho projection’s coordinate system.
| 

orthoZ 
| 
DOUBLE
| 
Z coordinate of the point in the ortho projection’s coordinate system.
| 

orthoDistanceFromStart 
| 
DOUBLE
| 
Distance from the starting point in the ortho projection’s coordinate system.
| 

euclidx
| 
DOUBLE
| 
X coordinate of the point in the Euclidean coordinate system.
| 

euclidy
| 
DOUBLE
| 
Y coordinate of the point in the Euclidean coordinate system.
| 

euclidz
| 
DOUBLE
| 
Z coordinate of the point in the Euclidean coordinate system.
| 

longitude
| 
DOUBLE
| 
Longitude (GPS).
| 

latitude
| 
DOUBLE
| 
Latitude (GPS).
| 

altitude
| 
DOUBLE
| 
Altitude (GPS).
| 

gpsDistanceFromStart 
| 
DOUBLE
| 
Distance from the starting point in the GPS coordinate system.
| 

Example 

paRSer 

$IterateOrthoProjections(
$IterateOrthoMeasurements( "$(orthoGuid)", 
$IterateOrthoBoundaryVertices( "$(regionGuid)", 1, 50, 1000,
Point index: $(pointIndex)
Is hole: $(isHole)
Box X: $(boxX)
Box Y: $(boxY)
Box Z: $(boxZ)
Ortho X: $(orthoX)
Ortho Y: $(orthoY)

Copy full snippet (22 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

IterateOrthoMeasurements 

Available Variables 

Example 

IterateOrthoBoundarySamples 

Available Variables 

Example 

IterateOrthoBoundaryVertices 

Available Variables 

Example
