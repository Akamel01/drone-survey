<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-componentfunctionset
     http: 200
     fetched: 2026-09-19T01:50:16Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (ComponentFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (ComponentFunctionSet) 

Available Functions (ComponentFunctionSet)

Functions available in the BasicExportFunctionSet set. 

On this page 

ComponentInfo 

Output basic information on a component.

Syntax: 

  ComponentInfo( componentGUID, anyText ) 

Parameter | Type | Description | 

componentGUID
| 
STRING / GUID
| 
A GUID of a component. Use the IterateComponents function to obtain the GUIDs of all components (see the example below). If this value is a null GUID, the currently selected component is used.  
| 

Available Variables 

Variable | Type | Description | 

componentName
| 
STRING
| 
Name of the component.
| 

componentId 
| 
CHAR_STRING
| 
GUID of the component.
| 

componentReconstructionId 
| 
CHAR_STRING
| 
GUID of the reconstruction run (all components created in the same alignment run) associated with the component.
| 

componentCameraCount 
| 
UINT
| 
Number of registered cameras in the component.
| 

componentPointCount 
| 
UINT
| 
Number of registered points in the component.
| 

componentControlPointCountUsed 
| 
UINT
| 
Number of control points used in the component.
| 

componentConstraintCountUsed 
| 
UINT
| 
Number of distance constraints used in the component.
| 

Available Functions 

All functions available under the function  ComponentInfo .

GetImageCamera 

Directly outputs the local camera index. The result is -1 if sfmIndex is not valid  

Syntax: 

$GetImageCamera( sfmIndex ) 

Parameter | Type | Description | 

sfmIndex 
| 
UINT
| 
The sfm index of the camera. 
| 

Available Expression Functions 

All expression functions available under the function  ComponentInfo .

GetImageCamera 

Directly outputs the local camera index. The result is -1 if sfmIndex is not valid  

Syntax: 

GetImageCamera( sfmIndex ) 

Parameter | Type | Description | 

sfmIndex 
| 
UINT
| 
The sfm index of the camera. 
| 

Example 

paRSer 

$IterateComponents(
$ComponentInfo( "$(componentGUID)",
Component name: $(componentName)
Component GUID: $(componentId)
Reconstruction-run GUID: $(componentReconstructionId)
Cameras' count: $(componentCamerasCount)
Points' count: $(componentPointsCount)
Control points' count used: $(componentControlPointsCountUsed)
Constraints' count used: $(componentConstraintsCountUsed)
)

Copy full snippet (11 lines long) 

ComponentStats 

Output statistical information on a component.

Syntax: 

$ComponentStats( componentGUID, anyText ) 

Parameter | Type | Description | 

componentGUID 
| 
STRING / GUID
| 
A GUID of a component. Use the IterateComponents function to obtain the GUIDs of all components (see the example below). If this value is a null GUID, the currently selected component is used.  
| 

Available Variables 

Variable | Type | Description | 

componentTotalProjection 
| 
UINT
| 
Total number of image projections in the component.
| 

componentAverageTrackLength
| 
FLOAT
| 
Average number of images in which each 3D point is observed.
| 

componentMaximalError
| 
FLOAT
| 
Maximum reprojection error in pixels.
| 

componentMedianError
| 
FLOAT
| 
Median reprojection error in pixels.
| 

componentMeanError 
| 
FLOAT
| 
Mean reprojection error in pixels.
| 

componentIsGeoreferenced
| 
BOOL
| 
Indicates whether the component is georeferenced.
| 

componentMetric 
| 
BOOL
| 
Indicates whether the component is scaled to match real dimensions.
| 

componentAlignmentTimeSec
| 
DOUBLE
| 
Total alignment time for all components calculated in a single alignment run.
| 

featureDetectionTimeSec
| 
DOUBLE
| 
Total feature detection time for all components calculated in a single alignment run.
| 

registrationTimeSec 
| 
DOUBLE
| 
Total registration time for all components calculated in a single alignment run.
| 

Example 

paRSer 

$IterateComponents(
$ComponentStats( "$(componentGUID)",
Total projections: $(componentTotalProjection)
Average track length: $(componentAverageTrackLength)
Maximal reprojection error [pixels]: $(componentMaximalError)
Median reprojection error [pixels]: $(componentMedianError)
Mean reprojection error [pixels]: $(componentMeanError)
Georeferenced: $(componentIsGeoreferenced)
Metric: $(componentMetric)
Alignment time: $(componentAlignmentTime)

Copy full snippet (12 lines long) 

ComponentSettings 

Output information on the alignment settings.

Syntax: 

$ComponentSettings( componentGUID, anyText ) 

Parameter | Type | Description | 

componentGUID 
| 
STRING / GUID
| 
A GUID of a component. Use the IterateComponents function to obtain the GUIDs of all components (see the example below). If this value is a null GUID, the currently selected component is used.  
| 

Available Variables 

Variable | Type | Description | 

componentAlignmentEngine 
| 
WCHAR_STRING
| 
Alignment engine used for component creation.
| 

componentAlignmentMode 
| 
WCHAR_STRING
| 
Alignment mode applied during processing.
| 

componentFeatureDetectionQuality 
| 
WCHAR_STRING
| 
Feature detection quality used to detect feature during an alignment.
| 

componentMaxFeaturesPerMpx 
| 
UINT
| 
Maximum number of features detected per megapixel.
| 

componentMaxFeaturesPerImage 
| 
UINT
| 
Maximum number of features detected per image.
| 

componentDetectorSensitivity 
| 
WCHAR_STRING
| 
Detector sensitivity during an alignment.
| 

componentPreselectorFeatures 
| 
UINT
| 
Number of preselected features used before matching.
| 

componentImageDownscaleFactor 
| 
FLOAT
| 
Factor by which input images were downscaled before feature
| 

componentMaxFeatureReprojectionError 
| 
DOUBLE
| 
Maximum allowed feature reprojection error in pixels.
| 

componentUseCameraPositions 
| 
BOOL
| 
Indicates whether prior positions of camera centers were used during alignment.
| 

componentLensDistortionModel 
| 
WCHAR_STRING
| 
Lens distortion model applied to the component.
| 

componentFinalOptimization 
| 
BOOL
| 
Indicates whether final optimization was performed.
| 

Example 

paRSer 

$IterateComponents(
$ComponentSettings( "$(componentGUID)",
Alignment engine: $(componentAlignmentEngine)
Alignment mode: $(componentAlignmentMode)
Max features per Mpx: $(componentMaxFeaturesPerMpx)
Max features per image: $(componentMaxFeaturesPerImage)
Detector sensitivity: $(componentDetectorSensitivity)
Preselector features: $(componentPreselectorFeatures)
Image downscale factor: $(componentImageDownscaleFactor)
Maximal feature reprojection error [pixels]: $(componentMaxFeatureReprojectionError)

Copy full snippet (15 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ComponentInfo 

Available Variables 

Available Functions 

GetImageCamera 

Available Expression Functions 

GetImageCamera 

Example 

ComponentStats 

Available Variables 

Example 

ComponentSettings 

Available Variables 

Example
