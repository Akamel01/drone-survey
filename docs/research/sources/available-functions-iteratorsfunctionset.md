<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-iteratorsfunctionset
     http: 200
     fetched: 2026-09-19T01:50:22Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (IteratorsFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (IteratorsFunctionSet) 

Available Functions (IteratorsFunctionSet)

Functions available within IteratorsFunctionSet. 

On this page 

SelectComponent 

Selects a component for internal use within this function set. The selection affects only the IterateImages and IterateCameras functions.

Syntax: 

$SelectComponent( componentGuid )  

Parameter | Type | Description | 

componentGUID
| 
  STRING - GUID
| 
GUID of the component.
| 

Example 

paRSer 

$IterateComponents(
$SelectComponent ( "$(componentGUID)"
)
) 

$IterateComponents(
$SelectComponent ( "$(componentGUID)"
)
) 
Copy full snippet (4 lines long) 

IterateImages 

Output information on each input in the project

Syntax: 

$IterateImages( noParametersJustAnyText ) 

Available Variables 

Parameter | Type | Description | 

inputImageName 
| 
STRING
| 
File name of the image without its extension.
| 

inputImageExt 
| 
STRING
| 
Extension of the image file.
| 

inputImagePath 
| 
STRING
| 
Absolute path to the image directory, excluding the file name.
| 

inputIndex 
| 
UINT
| 
Index of the input image.
| 

inputWidth 
| 
UINT
| 
Width of the image.
| 

inputHeight 
| 
UINT
| 
Height of the image.
| 

inputIsAligned 
| 
BOOL
| 
Indicates whether the image has been aligned.
| 

inputCameraIndex 
| 
INT
| 
Camera index if the image is aligned; otherwise -1 .  
| 

inputAlignmentEnabled 
| 
BOOL
| 
Returns true if the input is enabled for alignment; otherwise false .
| 

inputMeshingEnabled 
| 
BOOL
| 
Returns true if the input is enabled for meshing; otherwise false .
| 

inputTexturingEnabled 
| 
BOOL
| 
Returns true if the input is enabled for texturing; otherwise false.  
| 

inputCalibrationGroup 
| 
INT
| 
Input's calibration group.
| 

inputDistortionGroup 
| 
INT
| 
Input's distortion group.
| 

Variables inputIsAligned and inputCameraIndex give information based on the selected component

Example 

paRSer 

$IterateImages(
Image name: $(inputImageName)
Extension: $(inputImageExt)
Path: $(inputImagePath)
Index: $(inputIndex)
Width: $(inputWidth)
Height: $(inputHeight)
) 

$IterateImages(
Image name: $(inputImageName)
Extension: $(inputImageExt)
Path: $(inputImagePath)
Index: $(inputIndex)
Width: $(inputWidth)
Height: $(inputHeight)
) 
Copy full snippet (8 lines long) 

IterateCameras 

Retrieves the indexes of all cameras and the indexes of their corresponding images in the selected component.

Syntax: 

$IterateCameras( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

cameraIndex 
| 
UINT
| 
Index of the camera.
| 

cameraImageIndex 
| 
UINT
| 
Index of the image associated with the camera.
| 

Example 

HLSL 

$IterateCameras(
Camera index: $(cameraIndex)
Image index: $(cameraImageIndex)
) 

$IterateCameras(
Camera index: $(cameraIndex)
Image index: $(cameraImageIndex)
) 
Copy full snippet (4 lines long) 

IterateComponents 

Iterates through and outputs basic information on all components.

Syntax: 

$IterateComponents( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

componentGUID  
| 
CHAR_STRING
| 
GUID of the component.
| 

componentName
| 
STRING
| 
Name of the component.
| 

componentCamerasCount 
| 
UINT
| 
Number of registered cameras in the component.
| 

Example 

paRSer 

$IterateComponents(
Component GUID: $(componentGUID)
Component name: $(componentName)
Cameras count: $(componentCamerasCount)
) 

$IterateComponents(
Component GUID: $(componentGUID)
Component name: $(componentName)
Cameras count: $(componentCamerasCount)
) 
Copy full snippet (5 lines long) 

IterateModels 

Iterates through and outputs basic information on all models in a component.

Syntax: 

$IterateModels( componentGUID, anyText ) 

Parameter | Type | Description | 

componentGUID
| 
STRING - GUID
| 
GUID of a component. Use the IterateComponents function to obtain GUIDs of all components (see the example below).
| 

Available Variables 

Variable | Type | Description | 

modelGUID 
| 
CHAR_STRING
| 
GUID of the model.
| 

modelName 
| 
STRING
| 
Name of the model.
| 

modelTrianglesCount 
| 
UINT
| 
Number of triangles in the model.
| 

modelVerticesCount 
| 
UINT
| 
Number of vertices in the model.
| 

Example 

paRSer 

$IterateComponents(
$IterateModels( "$(componentGUID)",
Model GUID: $(modelGUID)
Model name: $(modelName)
Triangles count: $(modelTrianglesCount)
Vertices count: $(modelVerticesCount)
)
) 

$IterateComponents(
$IterateModels( "$(componentGUID)",
Model GUID: $(modelGUID)
Model name: $(modelName)
Triangles count: $(modelTrianglesCount)
Vertices count: $(modelVerticesCount)
)
) 
Copy full snippet (8 lines long) 

IterateControlPoints 

Iterates through and outputs basic information on all control points.

Syntax: 

$IterateControlPoints( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

controlPointId   
| 
UINT
| 
Index of the control point.
| 

controlPointGUID 
| 
CHAR_STRING
| 
GUID of the control point.
| 

controlPointName 
| 
STRING
| 
Name of the control point.
| 

controlPointMeasurementsCount 
| 
UINT
| 
Number of measurements, indicating how many images the control point is assigned to.
| 

Example 

paRSer 

$IterateControlPoints(
Index: $(controlPointId)
GUID: $(controlPointGUID)
Name: $(controlPointName)
Images count: $(controlPointMeasurementsCount)
) 

$IterateControlPoints(
Index: $(controlPointId)
GUID: $(controlPointGUID)
Name: $(controlPointName)
Images count: $(controlPointMeasurementsCount)
) 
Copy full snippet (6 lines long) 

IterateMeasurements 

Iterates through and outputs basic information on all measurements of a control points.

Syntax: 

$IterateMeasurements( controlPointId, anyText ) 

Parameter | Type | Description | 

controlPointId
| 
STRING
| 
Index of the control point. Use  IterateControlPoints to obtain all control point indexes.  
| 

Available Variables 

Variable | Type | Description | 

measurementIndex 
| 
UINT
| 
Index of the measurement.
| 

measurementImage 
| 
UINT
| 
Index of the image containing the measurement.
| 

measurementFeature 
| 
UINT
| 
Index of the control point within the image.
| 

measurementImageX 
| 
FLOAT
| 
The X-axis coordinate of the control point projected onto the image, in pixels.
| 

measurementImageY 
| 
FLOAT
| 
The Y-axis coordinate of the control point projected onto the image, in pixels.
| 

Example 

paRSer 

$IterateControlPoints( 
$IterateMeasurements( controlPointId,
Measurement index: $(measurementIndex)
Image index: $(measurementImage)
Index of the control point in the image: $(measurementFeature)
x: $(measurementImageX)
y: $(measurementImageY)
)
) 

$IterateControlPoints( 
$IterateMeasurements( controlPointId,
Measurement index: $(measurementIndex)
Image index: $(measurementImage)
Index of the control point in the image: $(measurementFeature)
x: $(measurementImageX)
y: $(measurementImageY)
)
) 
Copy full snippet (9 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

SelectComponent 

Example 

IterateImages 

Available Variables 

Example 

IterateCameras 

Available Variables 

Example 

IterateComponents 

Available Variables 

Example 

IterateModels 

Available Variables 

Example 

IterateControlPoints 

Available Variables 

Example 

IterateMeasurements 

Available Variables 

Example
