<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-orthoprojectionfunctionset
     http: 200
     fetched: 2026-09-19T01:50:48Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (OrthoProjectionFunctionSet ) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (OrthoProjectionFunctionSet ) 

Available Functions (OrthoProjectionFunctionSet )

Functions available within OrthoProjectionFunctionSet . 

On this page 

IterateOrthoProjections 

Iterates through the selected ortho projections. If no ortho projection is selected, it iterates through all available ortho projections.

Syntax: 

$IterateOrthoProjections( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

orthoIndex 
| 
INT
| 
Index of an ortho projection.
| 

orthoGuid 
| 
WCHAR_STRING
| 
GUID of an ortho projection.
| 

orthoName 
| 
WCHAR_STRING
| 
Name of an ortho projection.
| 

orthoCount 
| 
UINT
| 
Number of selected ortho projections or total ortho projections in the project.
| 

orthoHasDtm 
| 
BOOL
| 
True if the ortho projection includes a Digital Terrain Model (DTM); otherwise false .
| 

orthoIsMosaic 
| 
BOOL
| 
True if the ortho projection is an image mosaic; otherwise false .
| 

orthoColorSource 
| 
WCHAR_STRING
| 
Name of the color source used for the ortho projection.
| 

orthoColorSourceLabel 
| 
WCHAR_STRING
| 
Name of the label layer used for classification.
| 

Example 

paRSer 

$IterateOrthoProjections(
orthoIndex: $(orthoIndex), orthoGuid: $(orthoGuid), orthoName: $(orthoName)
) 

$IterateOrthoProjections(
orthoIndex: $(orthoIndex), orthoGuid: $(orthoGuid), orthoName: $(orthoName)
) 
Copy full snippet (3 lines long) 

OrthoProjectionVolume 

Outputs the calculated volumes and surface areas of an ortho projection.

Syntax: 

$OrthoProjectionVolume( orthoGuid, anyText ) 

Parameter | Type | Description | 

orthoGuid
| 
WCHAR_STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of the selected ortho projections (see the example below).  
| 

Available Variables 

Variable | Type | Description | 

orthoCutVolume 
| 
DOUBLE
| 
Volume between the visible surface and the bottom side of the reconstruction region.
| 

orthoFillVolume 
| 
DOUBLE
| 
Volume between the visible surface and the top side of the reconstruction region.
| 

orthoArea2d 
| 
DOUBLE
| 
Area of the projection of the visible surface onto the bottom side of the reconstruction region.
| 

orthoArea3d 
| 
DOUBLE
| 
Area of the visible surface.
| 

Example 

paRSer 

$IterateOrthoProjections(
$OrthoProjectionVolume( "$(orthoGuid)",
Cut Volume: $(orthoCutVolume)
Fill Volume: $(orthoFillVolume)
Area 2D: $(orthoArea2d)
Area 3D: $(orthoArea3d) 
)
) 

$IterateOrthoProjections(
$OrthoProjectionVolume( "$(orthoGuid)",
Cut Volume: $(orthoCutVolume)
Fill Volume: $(orthoFillVolume)
Area 2D: $(orthoArea2d)
Area 3D: $(orthoArea3d) 
)
) 
Copy full snippet (8 lines long) 

OrthoProjectionTiming 

Returns the time taken to calculate individual stages of an ortho projection.

Syntax: 

$OrthoProjectionTiming( orthoGuid, anyText ) 

Parameter | Type | Description | 

orthoGuid 
| 
WCHAR_STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of the selected ortho projections (see the example below).  
| 

Available Variables 

Variable | Type | Description | 

orthoRasterizeTime 
| 
DOUBLE
| 
Time taken to rasterize the ortho projection, in seconds.
| 

orthoDtmTime 
| 
DOUBLE
| 
Time taken to generate the Digital Terrain Model (DTM), in seconds.
| 

orthoMosaicTime 
| 
DOUBLE
| 
Time taken to create the image mosaic, in seconds.
| 

orthoTotalTime 
| 
DOUBLE
| 
Total time taken to generate the ortho projection, in seconds.
| 

Example 

paRSer 

$IterateOrthoProjections(
$OrthoProjectionTiming( "$(orthoGuid)",
Ortho Mosaic Time: $(orthoMosaicTime)
)
) 

$IterateOrthoProjections(
$OrthoProjectionTiming( "$(orthoGuid)",
Ortho Mosaic Time: $(orthoMosaicTime)
)
) 
Copy full snippet (5 lines long) 

BeginOrthoProjections 

Provides access to the Project function, which can be used to project 3D points into ortho projections.

Syntax: 

$BeginOrthoProjections( orthoGuid, width, height, anyText ) 

Parameter | Type | Description | 

orthoGuid
| 
WCHAR_STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of the selected ortho projections (see the example below).  
| 

width
| 
UINT
| 
Width of the orthographic projection in pixels.
| 

height 
| 
UINT
| 
Height of the orthographic projection in pixels.
| 

Available Variables 

Variable | Type | Description | 

orthoScaleX 
| 
DOUBLE
| 
Scale value of the ortho projection along the X axis.
| 

orthoScaleY 
| 
DOUBLE
| 
Scale value of the ortho projection along the Y axis.
| 

Available Functions 

Functions available under the  BeginOrthoProjections function.

Project 

Project 3D points into ortho projections.

Syntax: 

$Project( x, y, z, anyText ) 

Parameter | Type | Description | 

x
| 
DOUBLE
| 
X coordinate of the 3D point.
| 

y
| 
DOUBLE
| 
Y coordinate of the 3D point.
| 

z
| 
DOUBLE
| 
Z coordinate of the 3D point.
| 

Available Variables 

Variable | Type | Description | 

oxpx
| 
DOUBLE
| 
X coordinate of the point after projection.
| 

oypx
| 
DOUBLE
| 
Y coordinate of the point after projection.
| 

Example 

paRSer 

$IterateOrthoProjections(
$BeginOrthoProjections( "$(orthoGuid)", 100, 100,
$ExportControlPoints(
$Project( euclidx, euclidy, euclidz,
oxpx: $(oxpx)
oypx: $(oypx)
)
)
)
) 

$IterateOrthoProjections(
$BeginOrthoProjections( "$(orthoGuid)", 100, 100,
$ExportControlPoints(
$Project( euclidx, euclidy, euclidz,
oxpx: $(oxpx)
oypx: $(oypx)
)
)
)
) 
Copy full snippet (10 lines long) 

SaveOrtho 

Saves an ortho image to the specified folder.

Syntax: 

$SaveOrtho( orthoGuid, inputLayer, filepath, width, height ) 

Parameter | Type | Description | 

orthoGuid 
| 
STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of selected orthographic projections (see the example below).  
| 

inputLayer 
| 
STRING
| 
Options: "color", "altitude", "depth" for the DSM layer; or "color@1", "altitude@1", "depth@1" for the DTM layer (if available).
| 

filePath 
| 
STRING
| 
Output path to save the image, either relative to the attachments folder or in the format global://globalPathToFile .  
| 

width
| 
UINT
| 
Image width in pixels.
| 

height 
| 
UINT
| 
Image height in pixels.
| 

Example 

paRSer 

$IterateOrthoProjections(
$SaveOrtho( "$(orthoGuid)", "color", "ortho_$(orthoIndex)_color.jpg", 800, 800 )
) 

$IterateOrthoProjections(
$SaveOrtho( "$(orthoGuid)", "color", "ortho_$(orthoIndex)_color.jpg", 800, 800 )
) 
Copy full snippet (3 lines long) 

SaveOrthoWithRegions 

Saves an ortho image with its defined regions to the specified folder.

Syntax: 

$SaveOrthoWithRegions( orthoGuid, inputLayer, filepath, width, height ) 

Parameter | Type | Description | 

orthoGuid 
| 
STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of selected orthographic projections (see the example below).  
| 

inputLayer 
| 
STRING
| 
Options: "color", "altitude", "depth" for the DSM layer; or "color@1", "altitude@1", "depth@1" for the DTM layer (if available).
| 

filePath 
| 
STRING
| 
Output path to save the image, either relative to the attachments folder or in the format global://globalPathToFile .  
| 

width
| 
UINT
| 
Image width in pixels.
| 

height 
| 
UINT
| 
Image height in pixels.
| 

Example 

paRSer 

$IterateOrthoProjections(
$SaveOrthoWithRegions( "$(orthoGuid)", "color", "ortho_$(orthoIndex)_color.jpg", 800, 800 )
) 

$IterateOrthoProjections(
$SaveOrthoWithRegions( "$(orthoGuid)", "color", "ortho_$(orthoIndex)_color.jpg", 800, 800 )
) 
Copy full snippet (3 lines long) 

ExportOrthoProjection 

Syntax: 

$ExportOrthoProjection( orthoGuid, anyText ) 

Parameter | Type | Description | 

orthoGuid 
| 
STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of selected orthographic projections (see the example below).  
| 

Available Variables 

Variable | Type | Description | 

orthoName 
| 
WCHAR_STRING
| 
Name of the ortho projection.
| 

orthoWidth 
| 
UINT
| 
Width of the ortho image in pixels.
| 

orthoHeight 
| 
UINT
| 
Height of the ortho image in pixels.
| 

orthoUppx 
| 
DOUBLE
| 
Units per column pixel.
| 

orthoUppy 
| 
DOUBLE
| 
Units per row pixel.
| 

orthoCoordSystem 
| 
WCHAR_STRING
| 
Coordinate system of the ortho projection.
| 

orthoCoordUnits 
| 
WCHAR_STRING
| 
Name of the coordinate system units.
| 

orthoCoordUnitsShort 
| 
WCHAR_STRING
| 
Short name of the coordinate system units.
| 

orthoCoordPrimeMeridian 
| 
WCHAR_STRING
| 
Prime meridian of the coordinate system.
| 

orthoCoordProjection 
| 
WCHAR_STRING
| 
Projection used for the ortho projection.
| 

orthoGUID 
| 
WCHAR_STRING
| 
GUID of the ortho projection.
| 

componentGUID 
| 
WCHAR_STRING
| 
GUID of the component in which the ortho projection was created.
| 

orthoCentreLon 
| 
DOUBLE
| 
Longitudeof the bounding box center (valid only if orthoType is “Map (GPS)” and values are in EPSG:4326 – WGS 84).
| 

orthoCentreLat 
| 
DOUBLE
| 
Latitude of the bounding box center (valid only if orthoType is “Map (GPS)” and values are in EPSG:4326 – WGS 84).
| 

orthoCentreAlt 
| 
DOUBLE
| 
Altitude of the bounding box center (valid only if  orthoType  is “Map (GPS)” and values are in EPSG:4326 – WGS 84).  
| 

orthoWidthInOrthoCoordUnits 
| 
 DOUBLE
| 
Bounding box width (length along the Y axis).
| 

orthoHeightInOrthoCoordUnits 
| 
DOUBLE
| 
Bounding box height (length along the Z axis).
| 

orthoDepthInOrthoCoordUnits 
| 
DOUBLE
| 
Bounding box depth (length along the X axis).
| 

orthoType 
| 
WCHAR_STRING
| 
Type of the ortho projection.
| 

orthoCornerNWLon 
| 
DOUBLE
| 
Longitude of the northwest corner of the ortho projection.
| 

orthoCornerNWLat 
| 
DOUBLE
| 
Latitude of the northwest corner of the ortho projection.
| 

orthoCornerNELon 
| 
DOUBLE
| 
Longitude of the northeast corner of the ortho projection.
| 

orthoCornerNELat 
| 
DOUBLE
| 
Latitude of the northeast corner of the ortho projection.
| 

orthoCornerSELon 
| 
DOUBLE
| 
Longitude of the southeast corner of the ortho projection.
| 

orthoCornerSELat 
| 
DOUBLE
| 
Latitude of the southeast corner of the ortho projection.
| 

orthoCornerSWLon 
| 
DOUBLE
| 
Longitude of the southwest corner of the ortho projection.
| 

orthoCornerSWLat 
| 
DOUBLE
| 
Latitude of the southwest corner of the ortho projection.
| 

Example 

paRSer 

$IterateOrthoProjections(
$ExportOrthoProjection( "$(orthoGuid)",
GUID: $(orthoGUID)
Component GUID: $(componentGUID)
Ortho projection name: $(orthoName)
Width [pixels]: $(orthoWidth)
Height [pixels]: $(orthoHeight)
Units per column pixel: $(orthoUppx)
Units per row pixel: $(orthoUppy)
Bounding box depth: $(orthoDepthInOrthoCoordUnits)

Copy full snippet (25 lines long) 

IterateOrthoMapTiles 

Iterate through and save the ortho projection tiles. This function is applicable only to Top or Map (GPS) types of georeferenced ortho projections.  

Syntax: 

IterateOrthoMapTiles(orthoGuid, inputLayer, anyText) 

Parameter | Type | Description | 

orthoGuid
| 
STRING
| 
GUID of the ortho projection. Use IterateOrthoProjections to obtain GUIDs of the selected ortho projections.
| 

inputLayer
| 
STRING
| 
Options: "color", "altitude", "depth" for the DSM layer; or "color@1", "altitude@1", "depth@1" for the DTM layer (if available).
| 

Available Variables 

Variable | Type | Description | 

tileX 
| 
UINT
| 
First part of the tile index, increasing from west to east.
| 

tileY 
| 
UINT
| 
Second part of the tile index, increasing from north to south.
| 

tileZ 
| 
UINT
| 
Third part of the tile index, representing the zoom level.
| 

Available Functions 

Functions available under the  IterateOrthoMapTiles function.

SaveOrthoMapTile 

Saves tiles of ortho projections. Each exported tile has a resolution of 256 × 256 pixels.

Syntax: 

$SaveOrthoMapTile( “filePath“) 

Parameter | Type | Description | 

filePath
| 
STRING
| 
Output path to save the tile, either relative to the attachments folder or in the format global://globalPathToFile . Supported formats: png , bmp , dib , tiff .  
| 

SaveOrthoMapTileMask 

Saves tiles of ortho projections with masks. Each exported tile has a resolution of 256 × 256 pixels.

Syntax: 

$SaveOrthoMapTileMask( “filePath“) 

Parameter | Type | Description | 

filePath
| 
STRING
| 
Output path to save the tile, either relative to the attachments folder or in the format global://globalPathToFile . Supported formats: png , bmp , dib , tiff .  
| 

Example 

paRSer 

$IterateOrthoProjections(
$IterateOrthoMapTiles( "$(orthoGuid)", "color",
$SaveOrthoMapTile("$(orthoIndex)-color_$(tileZ)_$(tileX)_$(tileY).png")
)
) 

$IterateOrthoProjections(
$IterateOrthoMapTiles( "$(orthoGuid)", "color",
$SaveOrthoMapTile("$(orthoIndex)-color_$(tileZ)_$(tileX)_$(tileY).png")
)
) 
Copy full snippet (5 lines long) 

IterateOrthoMapPalette 

Iterates through the colors and corresponding values in the palette of an ortho projection’s altitude or depth layer.

Syntax: 

$IterateOrthoMapPalette( orthoGuid, inputLayer, anyText ) 

Parameter | Type | Description | 

orthoGuid 
| 
STRING
| | 

inputLayer 
| 
STRING
| | 

Available Variables 

Variable | Type | Description | 

orthoMapPalIndex 
| 
UINT
| 
Palette index (0–255).
| 

orthoMapPalRed 
| 
UINT
| 
Red component of the RGB color, ranging from 0 to 255.
| 

orthoMapPalGreen 
| 
UINT
| 
Green component of the RGB color, ranging from 0 to 255.
| 

orthoMapPalBlue 
| 
UINT
| 
Blue component of the RGB color, ranging from 0 to 255.
| 

orthoMapPalValue 
| 
DOUBLE
| 
Altitude or depth value associated with the palette entry.
| 

Example 

paRSer 

$IterateOrthoProjections(
$ExportOrthoProjection( "$(orthoGuid)",
$IterateOrthoMapPalette( "$(orthoGuid)", "altitude",
Index: $(orthoMapPalIndex)
Red: $(orthoMapPalRed)
Green: $(orthoMapPalGreen)
Blue: $(orthoMapPalBlue)
Altitude: $(orthoMapPalValue:.2f) $(orthoCoordUnitsShort)
)
)

Copy full snippet (11 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

IterateOrthoProjections 

Available Variables 

Example 

OrthoProjectionVolume 

Available Variables 

Example 

OrthoProjectionTiming 

Available Variables 

Example 

BeginOrthoProjections 

Available Variables 

Available Functions 

Project 

Available Variables 

Example 

SaveOrtho 

Example 

SaveOrthoWithRegions 

Example 

ExportOrthoProjection 

Available Variables 

Example 

IterateOrthoMapTiles 

Available Variables 

Available Functions 

SaveOrthoMapTile 

SaveOrthoMapTileMask 

Example 

IterateOrthoMapPalette 

Available Variables 

Example
