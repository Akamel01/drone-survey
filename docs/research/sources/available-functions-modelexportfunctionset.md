<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-modelexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:35Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (ModelExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (ModelExportFunctionSet) 

Available Functions (ModelExportFunctionSet)

Functions available within ModelExportFunctionSet. 

On this page 

ExportModels 

Output detailed information on all models in the selected component.

Syntax: 

$ExportModels( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

modelName 
| 
STRING
| 
Name of the model.
| 

modelVertexCount 
| 
UINT64
| 
Number of vertices in the model.
| 

modelTriangleCount 
| 
UINT64
| 
Number of triangles in the model.
| 

modelPartCount 
| 
UINT
| 
Number of parts the model consists of.
| 

modelGuid 
| 
CHAR_STRING
| 
GUID of the model.
| 

modelIsTextured 
| 
BOOL
| 
True if the model includes texture data; otherwise false .
| 

modelIsColored 
| 
BOOL
| 
True if the model includes color information; otherwise false .
| 

modelUnitSize 
| 
DOUBLE
| 
Size of one unit in the model’s coordinate system.
| 

modelUnits 
| 
STRING
| 
Name of the unit used in the model.
| 

Available Functions 

Functions available under the  ExportModels function.

ExportTextureInfo 

Returns information about the model's texture layer.

Syntax: 

$ExportTextureInfo(noParametersJustAnyText) 

Available Variables 

Variable | Type | Description | 

selectedTextureLayerGuid 
| 
CHAR_STRING
| 
Index value of the selected texture layer.
| 

modelTextureLayerCount 
| 
  UINT
| 
Number of texture layers in the model.
| 

modelUnwrapStyle 
| 
  STRING
| 
Unwrapping style applied to the model.
| 

modelTextureCount 
| 
  UINT
| 
Number of textures in the model.
| 

modelTextureResolutionX 
| 
  UINT
| 
Texture width in pixels.
| 

modelTextureResolutionY 
| 
  UINT
| 
Texture height in pixels.
| 

modelTextureUtilization 
| 
  DOUBLE
| 
Texture space utilization, including gutter areas.
| 

modelTextureQuality 
| 
  DOUBLE
| 
Quality level of the generated texture.
| 

modelGutterSize 
| 
  DOUBLE
| 
Gutter size between texture charts.
| 

modelOptimalTexelSize 
| 
  DOUBLE
| 
Optimal texel size for the model.
| 

modelTexelSize 
| 
  DOUBLE
| 
Actual texel size used in the texture.
| 

Available Functions 

Functions available under the  ExportTextureInfo function.

IterateTextureLayers 

Iterate through texture layers and extract their GUID.

Syntax: 

$IterateTextureLayers( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

textureLayerGuid 
| 
WCHAR_STRING
| 
Index value of the texture layer.
| 

ExportTextureLayerInfo 

Exports information about the texture layer.

Syntax: 

$ExportTextureLayerInfo( layerGuid, anyText ) 

Parameter | Type | Description | 

LayerGuid 
| 
WCHAR_STRING
| 
Index value of the texture layer.
| 

Available Variables 

Variable | Type | Description | 

textureLayerGuid 
| 
CHAR_STRING
| 
Index value of the texture layer.
| 

textureLayerStyle 
| 
STRING
| 
Texturing style used to create the texture layer.
| 

textureLayerType 
| 
STRING
| 
Type of the texture layer.
| 

textureLayerName 
| 
STRING
| 
Name of the texture layer.
| 

textureLayerPixelFormat 
| 
STRING
| 
Pixel format of the texture layer.
| 

textureLayerHasInputLayer 
| 
BOOL
| 
Returns true if an input image layer was used to create the texture layer; otherwise false .  
| 

textureLayerInputLayer 
| 
STRING
| 
Image layer used to create the texture layer.
| 

textureLayerHasSourceModel 
| 
BOOL
| 
Returns true if the texture layer was created with the Texture Reprojection tool and contains source model information; otherwise false .  
| 

textureLayerSourceModelGuid 
| 
CHAR_STRING
| 
Index of the source model used for reprojection.
| 

textureLayerHasSourceLayer 
| 
BOOL
| 
Returns true if the texture layer was created with the Texture Reprojection tool and contains source layer information; otherwise false .  
| 

textureLayerSourceLayerGuid 
| 
CHAR_STRING
| 
Index of the source layer used for reprojection.
| 

textureLayerTime 
| 
DOUBLE
| 
Time taken to calculate the texture layer.
| 

ModelStats 

Returns information about the model reconstruction process.

Syntax: 

$ModelStats( modelGuid, anyText ) 

Parameter | Type | Description | 

modelGuid
| 
CHAR_STRING
| 
GUID of the model.
| 

Available Variables 

Variable | Type | Description | 

modelDepthMapsTime 
| 
DOUBLE
| 
Time taken to compute depth maps, in seconds.
| 

modelMeshingTime 
| 
DOUBLE
| 
Time taken for the meshing process, in seconds.
| 

modelPostprocessTime 
| 
DOUBLE
| 
Time taken for post-processing, in seconds.
| 

modelColoringTime 
| 
DOUBLE
| 
Time taken for coloring, in seconds.
| 

modelUnwrapTime 
| 
DOUBLE
| 
Time taken for unwrapping, in seconds
| 

ModelSettings 

Returns information about the model reconstruction settings.

Syntax: 

$ModelStats( modelGuid, anyText ) 

Parameter | Type | Description | 

modelGuid
| 
CHAR_STRING
| 
GUID of the model.
| 

Available Variables 

Variable | Type | Description | 

modelQuality 
| 
DOUBLE
| 
Quality level mode used to create the model.
| 

modelImageDownscaleFactor 
| 
DOUBLE
| 
Image downscale factor used for generating depth maps.
| 

Example 

paRSer 

$ExportModels( 
Model name: $(modelName)
Model GUID: $(modelGuid)
Triangles count: $(modelTriangleCount)
Vertices count: $(modelVertexCount)
Parts count: $(modelPartCount)
Unit size: $(modelUnitSize)
Units: $(modelUnits)
Colored: $(modelIsColored)
Textured: $(modelIsTextured)

Copy full snippet (32 lines long) 

RenderMesh 

Exports a rendered image of the model to filePath at the specified width and height , using the viewpoint of the camera identified by cameraIndex .  

Syntax: 

$RenderMesh( modelGuid, “filepath”, width, height, cameraIndex ) 
or
$RenderMesh( modelGuid, “filepath”, width, height, cameraIndex, textureLayerGuid ) 

Parameter | Type | Desr | 

modelGuid 
| 
STRING
| 
Index of the model.
| 

filePath 
| 
STRING
| 
Path to the rendered image, either relative to the attachments folder or in the format global://globalPathToFile .  
| 

width
| 
UINT 
| 
Width of the rendered image.
| 

height 
| 
UINT 
| 
Height of the rendered image.
| 

cameraIndex 
| 
INT
| 
Index of the camera used for rendering. Use - 1 to render automatically from a camera providing a good overview of the model.
| 

textureLayerGuid 
| 
STRING
| 
Index of the texture layer. This parameter is optional; if not specified and the model is textured, the selected texture layer is used by default.
| 

RenderMeshFromCustomPositionYPR 

Renders an image of the model from a custom camera position and rotation to filePath at the specified width and height. 

Syntax: 

$RenderMeshFromCustomPositionYPR( modelGUID, "outputFile", width, height, focalLength, x, y, z, yaw, pitch, roll ) 
or
$RenderMeshFromCustomPositionYPR( modelGUID, "outputFile", width, height, focalLength, x, y, z, yaw, pitch, roll, textureLayerGUID ) 

Parameter | Type | Description | 

modelGuid 
| 
STRING
| 
Index of the model.
| 

filePath 
| 
STRING
| 
Full output path, including the image format extension. The path can be relative to the attachments folder or in the format global://globalPathToFile.
| 

width
| 
UINT 
| 
Width of the rendered image in pixels.
| 

height 
| 
UINT 
| 
Height of the rendered image in pixels.
| 

focalLength35mm 
| 
DOUBLE 
| 
Focal length used for the render in the 35mm format.
| 

x
| 
DOUBLE 
| 
Camera X coordinate.
| 

y
| 
DOUBLE 
| 
Camera Y coordinate.
| 

z
| 
DOUBLE 
| 
Camera Z coordinate.
| 

yaw
| 
DOUBLE 
| 
Camera yaw rotation.
| 

pitch
| 
DOUBLE 
| 
Camera pitch rotation.
| 

roll
| 
DOUBLE 
| 
Camera roll rotation.
| 

textureLayerGuid 
| 
STRING
| 
Index of the texture layer to use for the render. This is an optional parameter. If not specified and the model is textured, the selected texture layer is used by default.
| 

Example 

paRSer 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomPositionYPR( "$(modelGUID)", 
"renderMesh.png", 6000, 4000, 24, -21, 19, 17, 0, 90, 0
)
)
) 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomPositionYPR( "$(modelGUID)", 
"renderMesh.png", 6000, 4000, 24, -21, 19, 17, 0, 90, 0
)
)
) 
Copy full snippet (7 lines long) 

RenderMeshFromCustomPositionLookAt 

Renders an image of the model from a custom camera position and a custom look-at position to filePath at the specified width and height. 

Syntax: 

$RenderMeshFromCustomPositionLookAt( modelGUID, "outputFile", width, height, focalLength, x, y, z, atX, atY, atZ ) 
or
$RenderMeshFromCustomPositionLookAt( modelGUID, "outputFile", width, height, focalLength, x, y, z, atX, atY, atZ, upX, upY, upZ ) 
or
$RenderMeshFromCustomPositionLookAt( modelGUID, "outputFile", width, height, focalLength, x, y, z, atX, atY, atZ, upX, upY, upZ, textureLayerGUID ) 

Parameter | Type | Description | 

modelGuid 
| 
STRING
| 
Index of the model.
| 

filePath 
| 
STRING
| 
Full output path, including the image format extension. The path can be relative to the attachments folder or in the format global://globalPathToFile.
| 

width
| 
UINT 
| 
Width of the rendered image in pixels.
| 

height 
| 
UINT 
| 
Height of the rendered image in pixels.
| 

focalLength35mm 
| 
DOUBLE 
| 
Focal length used for the render in the 35mm format.
| 

x
| 
DOUBLE 
| 
Camera X coordinate.
| 

y
| 
DOUBLE 
| 
Camera Y coordinate.
| 

z
| 
DOUBLE 
| 
Camera Z coordinate.
| 

atX
| 
DOUBLE 
| 
Camera yaw rotation.
| 

atY
| 
DOUBLE 
| 
Camera pitch rotation.
| 

atZ
| 
DOUBLE 
| 
Camera roll rotation.
| 

upX
| 
DOUBLE 
| 
The X-axis coordinate of up-vector.
| 

upY
| 
DOUBLE 
| 
The Y-axis coordinate of up-vector.
| 

upZ
| 
DOUBLE 
| 
The Z-axis coordinate of up-vector.
| 

textureLayerGuid 
| 
STRING
| 
Index of the texture layer to use for the render. This is an optional parameter. If not specified and the model is textured, the selected texture layer is used by default.
| 

Example 

paRSer 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomPositionLookAt( "$(modelGUID)", 
"global://D:\\Project\\Render\\renderMesh.jpg", 6000, 4000, 24, 120, 95, 25, 0, 10, 15, 0, 0, 1)
)
)
) 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomPositionLookAt( "$(modelGUID)", 
"global://D:\\Project\\Render\\renderMesh.jpg", 6000, 4000, 24, 120, 95, 25, 0, 10, 15, 0, 0, 1)
)
)
) 
Copy full snippet (7 lines long) 

RenderMeshFromCustomGridPositionYPR 

Exports a viewport-style image of the model to filePath at the specified width and height , using the given position. The render matches what is shown in the view and does not remove the display scale . For calibrated models, if you use a camera position from the reporting system, multiply it by displayScale from SfmExportFunctionSet .  

Syntax: 

$RenderMeshFromCustomGridPositionYPR( modelGuid, “filepath”, width, height, focalLength35mm, x, y, z, yaw, pitch, roll) 
or
$RenderMeshFromCustomGridPositionYPR( modelGuid, “filepath”, width, height, focalLength35mm, x, y, z, yaw, pitch, roll, textureLayerGuid) 

Parameter | Type | Description | 

modelGuid 
| 
STRING
| 
Index of the model.
| 

filePath 
| 
STRING
| 
Full output path, including the image format extension. The path can be relative to the attachments folder or in the format global://globalPathToFile.
| 

width
| 
UINT 
| 
Width of the rendered image in pixels.
| 

height 
| 
UINT 
| 
Height of the rendered image in pixels.
| 

focalLength35mm 
| 
DOUBLE 
| 
Focal length used for the render in the 35mm format.
| 

x
| 
DOUBLE 
| 
Camera X coordinate in the grid coordinate system.
| 

y
| 
DOUBLE 
| 
Camera Y coordinate in the grid coordinate system.
| 

z
| 
DOUBLE 
| 
Camera Z coordinate in the grid coordinate system.
| 

yaw
| 
DOUBLE 
| 
Camera yaw rotation in the grid coordinate system.
| 

pitch
| 
DOUBLE 
| 
Camera pitch rotation in the grid coordinate system.
| 

roll
| 
DOUBLE 
| 
Camera roll rotation in the grid coordinate system.
| 

textureLayerGuid 
| 
STRING
| 
Index of the texture layer to use for the render. This is an optional parameter. If not specified and the model is textured, the selected texture layer is used by default.
| 

Example 

paRSer 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomGridPositionYPR( "$(modelGUID)", 
"renderMesh.png", 6000, 4000, 24, -21, 19, 17, 0, 90, 0
)
)
) 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomGridPositionYPR( "$(modelGUID)", 
"renderMesh.png", 6000, 4000, 24, -21, 19, 17, 0, 90, 0
)
)
) 
Copy full snippet (7 lines long) 

RenderMeshFromCustomGridPositionLookAt 

Exports a viewport-rendered image of the model to filePath at the specified width and height , using the given position. The render matches the on-screen view and preserves the display scale. For calibrated models, if you use a camera position from the reporting system, multiply it by displayScale from SfmExportFunctionSet .  

Syntax: 

$RenderMeshFromCustomGridPositionLookAt ( modelGUID, "outputFile", width, height, focalLength, x, y, z, atX, atY, atZ ) 
or
$RenderMeshFromCustomGridPositionLookAt ( modelGUID, "outputFile", width, height, focalLength, x, y, z, atX, atY, atZ, upX, upY, upZ ) 
or
$RenderMeshFromCustomGridPositionLookAt ( modelGUID, "outputFile", width, height, focalLength, x, y, z, atX, atY, atZ, upX, upY, upZ, textureLayerGUID ) 

Parameter | Type | Description | 

modelGuid 
| 
STRING
| 
Index of the model.
| 

filePath 
| 
STRING
| 
Full output path, including the image format extension. The path can be relative to the attachments folder or in the format global://globalPathToFile.
| 

width
| 
UINT 
| 
Width of the rendered image in pixels.
| 

height 
| 
UINT 
| 
Height of the rendered image in pixels.
| 

focalLength35mm 
| 
DOUBLE 
| 
Focal length used for the render in the 35mm format.
| 

x
| 
DOUBLE 
| 
Camera X coordinate in the grid coordinate system.
| 

y
| 
DOUBLE 
| 
Camera Y coordinate in the grid coordinate system.
| 

z
| 
DOUBLE 
| 
Camera Z coordinate in the grid coordinate system.
| 

atX
| 
DOUBLE 
| 
Camera yaw rotation in the grid coordinate system.
| 

atY
| 
DOUBLE 
| 
Camera pitch rotation in the grid coordinate system.
| 

atZ
| 
DOUBLE 
| 
Camera roll rotation in the grid coordinate system.
| 

upX
| 
DOUBLE 
| 
The X-axis coordinate of up-vector.
| 

upY
| 
DOUBLE 
| 
The Y-axis coordinate of up-vector.
| 

upZ
| 
DOUBLE 
| 
The Z-axis coordinate of up-vector.
| 

textureLayerGuid 
| 
STRING
| 
Index of the texture layer to use for the render. This is an optional parameter. If not specified and the model is textured, the selected texture layer is used by default.
| 

Example 

paRSer 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomGridPositionLookAt ( "$(modelGUID)", 
"global://D:\\Project\\Render\\renderMesh.jpg", 6000, 4000, 24, 120, 95, 25, 0, 10, 15, 0, 0, 1)
)
)
) 

$IterateComponents(
$IterateModels( "$(componentGUID)",
$RenderMeshFromCustomGridPositionLookAt ( "$(modelGUID)", 
"global://D:\\Project\\Render\\renderMesh.jpg", 6000, 4000, 24, 120, 95, 25, 0, 10, 15, 0, 0, 1)
)
)
) 
Copy full snippet (7 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ExportModels 

Available Variables 

Available Functions 

ExportTextureInfo 

Available Variables 

Available Functions 

IterateTextureLayers 

ExportTextureLayerInfo 

ModelStats 

Available Variables 

ModelSettings 

Available Variables 

Example 

RenderMesh 

RenderMeshFromCustomPositionYPR 

Example 

RenderMeshFromCustomPositionLookAt 

Example 

RenderMeshFromCustomGridPositionYPR 

Example 

RenderMeshFromCustomGridPositionLookAt 

Example
