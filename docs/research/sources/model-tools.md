<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/model-tools
     http: 200
     fetched: 2026-09-19T01:49:54Z
     extracted from HTML; wording verbatim, layout lost -->

Model Tools | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Model Tools 

Model Tools

Colorize your model, generate textures, and perform post-processing on the resulting models. 

On this page 

Model Commands 

When you have successfully created a model, you can use these tools to process it further by means of the command line.

Command | Required | Optional | Description | 

selectModel
| 
modelName
| | 
Select a model with the specified name (modelName).
| 

deleteSelectedModel
| | | 
Delete the currently selected model.
| 

duplicateSelectedModel
| | | 
Duplicate the selected model (including textures).
| 

renameSelectedModel
| 
newModelName
| | 
Rename the currently selected model.
| 

correctColors
| | 
layerName
| 
Run color correction for all layers or a specified layer (layerName) in the selected component.
| 

unwrap
| | 
params.xml
| 
Calculate the unwrap of a model using the current settings or the settings from the params.xml (optional parameter). You can export these settings from the Unwrap tool in the application.
| 

calculateTexture
| | 
params.xml
| 
Calculate texture using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the Color and Texture Settings panel in the application.
| 

calculateQualityTexture
| | | 
Calculate texture using mesh quality values which can be calculated using the Quality Analysis tool. The values don't have to be calculated prior to using this command.
| 

reprojectTexture
| 
sourceModelresultModel
| 
params.xml
| 
Reproject texture from a textured model (sourceModel) to an unwrapped model (resultModel) using the current settings or the settings from the params.xml file (optional parameter). sourceModel and resultModel are model names from the application. You can export these settings from the Texture Reprojection tool in the application.
| 

calculateVertexColors
| | | 
Calculate coloring using the current settings.
| 

calculatePreviewVertexColors
| | | 
Calculate draft coloring using the current settings.
| 

calculateQualityColors
| | | 
Calculate vertex colors using mesh quality values which can be calculated using the Quality Analysis tool. The values don't have to be calculated prior to using this command.
| 

simplify
| | 
targetTriangleCount OR params.xml
| 
Simplify a selected model using the current settings (use it without any parameters) to the selected triangle count (targetTriangleCount) or using the settings from the params.xml file. You can export these settings from the Simplify tool in the application.
| 

smooth
| | 
params.xml
| 
Smooth a selected model using the current settings or the settings from the params.xml file. You can export these settings from the Smooth tool in the application.
| 

closeHoles
| | 
maxEdgesCount
| 
Close model holes using the current settings or a specified maximal number of edges (maxEdgesCount).
| 

cleanModel
| | | 
Clean the selected model: remove non-manifold edges and vertices, close small holes, etc.
| 

selectTrianglesInsideReconReg
| | | 
Select triangles inside the reconstruction region.
| 

selectTrianglesOutsideReconReg
| | | 
Select triangles outside the reconstruction region.
| 

selectMarginalTriangles
| | | 
Select triangles that enclose the volume but are not part of the current reconstruction.
| 

selectLargeTrianglesAbs
| 
edgeSizeThreshold
| | 
Select triangles with edge lengths larger than the threshold (edgeSizeThreshold).
| 

selectLargeTrianglesRel
| 
edgeSizeThreshold
| | 
Select triangles with an edge length larger than the threshold (edgeSizeThreshold) multiplied by the average edge length.
| 

selectLargestModelComponent
| | | 
Select triangles that belong to the largest connected component of the model.
| 

invertTrianglesSelection
| | | 
Invert a selection of triangles.
| 

deselectModelTriangles
| | | 
Deselect all model triangles.
| 

removeSelectedTriangles
| | | 
Create a new model with selected triangles left out (the same behavior as achieved with the Filter Selection tool).
| 

cutByBox
| 
inner OR outer
| 
fillHoles
| 
Filter out the triangles inside or outside of the reconstruction region. The required parameter defines which triangles will be filtered out, and the optional parameter fillHoles determines if the cut holes will be filled (can be set to true or false, corresponding to the Yes and No values). If the optional parameter is not chosen, the default value will be used (Yes). This tool creates a new model.
| 

exportModel
| 
modelNamefileName
| 
params.xml
| 
Export a model (modelName from the project) as a file (fileName including path and file extension) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export model dialog.
| 

exportSelectedModel
| 
fileName
| 
params.xml
| 
Export the selected model as a file (fileName including path and file extension) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export model dialog.
| 

exportModelToZip
| 
filePath
| 
modelFormat
| 
Export the selected model into a compressed archive. Specify the path where the archive will be saved and the name of the exported file. Including the file extension for the archive format is optional. Additionally, you can specify the model format (e.g., .obj or .fbx) as an optional parameter.
| 

importModel
| 
fileName
| 
params.xml
| 
Import a model from a file. Specify the full path to the model, as well as its name and format extension. Additionally, use the settings file (exported from the import dialog) to adjust the import settings.
| 

calculateOrthoProjection
| | 
rsorthoFilersboxFile
| 
Calculate an orthographic projection using the current settings. You can optionally use a projection parameters file (.rsortho) to define the calculation settings. This file can be exported together with an ortho projection, and its structure is described here. An additional optional parameter, the exported reconstruction region file (.rsbox), can be used to specify the area included in the ortho projection.
| 

selectOrthoProjection
| 
orthoName
| | 
Select an orthographic projection with the specified name (orthoName).
| 

editOrthoProjectionSelection
| 
"key=value"
| | 
Edit the settings/parameters of the selected ortho projections based on the value in the Selected ortho photo(s) panel or its key. More information can be found here.
| 

exportOrthoProjection
| 
orthoNamefullPathparams.xml
| | 
Export the orthographic projection (orthophoto, DSM, or DTM) using settings from the params.xml file, which can be exported from the corresponding export dialog. The params.xml file defines the export settings; orthoName is the name of the projection as it appears in the project; fullPath specifies the complete path to the exported file. For fullPath and exportName, the format extension is optional—if omitted, a TIFF file is created.
| 

exportOrthoProjection
| 
orthoNamefolderPathexportNameparams.xml
| | 
Export the orthographic projection (orthophoto, DSM, or DTM) using settings from the params.xml file, which can be exported from the corresponding export dialog.The params.xml file defines the export settings; orthoName is the name of the projection as it appears in the project; folderPath defines the directory where the file will be saved; and exportName sets the name of the exported file. For exportName, the format extension is optional—if omitted, a TIFF file is created.
| 

exportOrthoProjection
| 
fullPathparams.xml
| | 
Export the orthographic projection (orthophoto, DSM, or DTM) using settings from the params.xml file, which can be exported from the corresponding export dialog.The params.xml file defines the export settings; fullPath specifies the complete path to the exported file. For fullPath, the format extension is optional—if omitted, a TIFF file is created.
| 

calculateCrossSections
| | 
stepaxis
| 
Calculate Cross Sections either using current settings or by setting the axis (local axis of reconstruction region) and the step between each cross section.
| 

exportCrossSections
| 
fileName
| 
params.xml
| 
Export selected cross sections as a file (fileName including path and file extension) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export Cross Sections dialog.
| 

renameCrossSections
| 
crossSectionsName
| | 
Rename selected cross sections.
| 

selectCrossSections
| 
crossSectionsName
| | 
Select cross sections by name.
| 

computeContours
| | 
params.xml
| 
Compute contours for the selected Ortho using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the Contours Tool in the application.
| 

exportContours
| 
fileName
| 
params.xml
| 
Export selected contours as a file (fileName including path and file extension) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export Contours dialog.
| 

renameContours
| 
contoursName
| | 
Rename selected contours.
| 

selectContours
| 
contoursName
| | 
Select contours by name.
| 

exportShapes
| 
fileName
| 
params.xml
| 
Export selected shapes as a file (fileName including path and file extension .json) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export Shapes dialog.
| 

importShapesToSelectedOrtho
| 
fileNamemosaicing OR measurements
| | 
Import shapes from a file (fileName including path and file extension) to the selected ortho. Their type will be defined based on which shape-creating tool is activated: Measure or Enhance Mosaic.
| 

importShapesToOrtho
| 
fileNameorthoProjectionNamemosaicing OR measurements
| | 
Import shapes from a file (fileName including path and file extension) to ortho (orthoProjectionName). Their type will be defined based on which shape-creating tool is activated: Measure or Enhance Mosaic.
| 

selectShape
| 
shapeName
| | 
Select shape by name
| 

addShapeToSelection
| 
shapeName
| | 
Add a shape to the current selection by name.
| 

exportReport
| 
outputFileNametemplateFileName
| 
true OR false
| 
Export a report into a file (outputFileName including the path and the .html extension) using a template (templateFileName including the path). The default templates are stored in the installation folder\Reports. Use the optional boolean paramater (true or false) to export a file with reports found in the specified template.
| 

printReport
| 
reportString
| | 
Write out report texts in the Command Prompt. This command can be used when RealityScan is run with a batch file. It does not work with delegation. Learn more about report customization here.
| 

generateMaskFromMesh
| | | 
Generate mask images out of the existing camera views (images) and selected model. Everything around the model as seen from the camera will be masked out.
| 

exportMapsAndMask
| | 
folderNameparams.xml
| 
Export masks generated from the camera view over the model, along with depth and normal maps for the selected images. If folderName and params.xml are not specified, the results are saved alongside the original images using the current settings. The parameters file can be exported from the export dialog for maps and masks.
| 

exportLod
| 
fileName
| 
params.xml
| 
Export the selected model as a linear Level-of-Detail model into a file (fileName including path and file extension) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export LoD dialog. For export to Cesium 3D Tiles (.json) file format, use the command export3dTiles.
| 

export3dTiles
| 
fileName
| 
params.xml
| 
Export the selected model as a hierarchical Level-of-Detail model into a .json file (fileName including path and file extension) using the current settings or the settings from the params.xml (optional parameter). You can export the file from the Export LoD dialog after selecting Cesium 3D Tiles (.json) file format.
| 

exportCameraSnapshots
| 
folderName
| 
params.xml
| 
Render images of a model from the camera positions using all images if none or just one is selected, or using only the selected images. Specify the path of a folder where images will be stored, and use the optional file with parameters to use settings from the export dialog.
| 

exportSelectedCamerasSnapshots
| 
folderNamefileFormat
| 
params.xml
| 
Render images of a model from the selected camera positions. Specify the path of a folder where images will be stored and the file format of the exported images (e.g. jpg or png). Use the optional file with parameters to use settings from the export dialog.
| 

renderMeshFromCustomPositionYPR
| 
fileNameparams.xml OR fileName width height focalLength x y z yaw pitch roll
| | 
Export a render of the model from a camera position with the viewpoint defined by yaw, pitch, and roll orientation.Example for a render from above of a model at 0,0,0 in local Euclidean space:RealityScan.exe -renderMeshFromCustomPositionYPR "D:/Project/render.png" 1280 720 100 0 0 150 0 0 0
| 

renderMeshFromCustomPositionLookAt
| 
fileNameparams.xml OR fileName width height focalLength x y z atX atY atZ
| 
upXupYupZ
| 
Export a render of a model from a camera position, which looks at another defined position, with an option to specify the vertical axis.Example for a side view of a model at 0,0,0 in local Euclidean space while defining the vertical axis going up the Z axis:RealityScan.exe -renderMeshFromCustomPositionLookAt "D:/Project/render.png" 1280 720 50 0 -100 0 0 0 10 0 0 1
| 

renderMeshFromCustomGridPositionYPR
| 
fileNameparams.xml OR fileName width height focalLength x y z yaw pitch roll
| | 
Export a render of the model from a custom grid position, with the viewpoint defined by yaw, pitch, and roll orientation.
| 

renderMeshFromCustomGridPositionLookAt
| 
fileNameparams.xml OR fileName width height focalLength x y z atX atY atZOR
| 
upXupY upZ
| 
Export a model render from a custom grid position, with the viewpoint directed toward a defined target, and the option to specify the vertical axis.
| 

uploadToSketchfab
| 
APIToken
| | 
Upload your model to Sketchfab. The required parameter is the Sketchfab API token and it can be found in the account settings of your Sketchfab account.
| 

Classification Commands 

Use these settings to create and adjust classifications.

Command | Required | Optional | Description | 

dtmClassify
| | 
params.xml
| 
Classify vertices of the selected model into pre-defined classes using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the Classify tool in the application.
| 

selectClassification
| 
classificationName
| | 
Select a classification using its specified name (classificationName parameter).
| 

renameSelectedClassification
| 
newClassificationName
| | 
Rename the selected classification to the specified new name (newClassificationName).
| 

transferClassification
| | 
params.xml
| 
Transfer classification from the labels layer images. A file with parameters exported from the AI Classify tool panel can be used as an optional parameter.
| 

exportClassificationSettings
| 
XMLfilePath
| | 
Export settings from the AI Classify tool panel. For the required parameter (XMLfilePath) specify the full path for export, including the file name and format extension (.xml).
| 

importClassificationSettings
| 
XMLfilePath
| | 
Import settings to the AI Classify tool panel. For the required parameter (XMLfilePath) specify the full path for import, including the file name and format extension (.xml).
| 

overrideSelectedVertices
| | 
className
| 
Override the selected vertices and change their class to the currently selected class, or to the class specified by name (optional).
| 

selectClass
| 
className
| | 
Select a class from the selected classification using the specified class name.
| 

deselectClass
| | | 
Deselect all selected classes.
| 

renameSelectedClass
| 
newClassName
| | 
Change the name of the selected class to the specified new class name (newClassName).
| 

setSelectedClassAsGroundForDTM
| 
true OR false
| | 
Change the Use as ground for DTM setting in the Selected Class panel for the selected class. Set to true to use it as ground for DTM, or false to exclude it.
| 

setSelectedClassAsGroundForExport
| | | 
Change the Export class LAS setting in the Selected Class panel to Ground (2).
| 

setSelectedClassLasFormat
| 
0 - 12
| | 
Change the Export class LAS setting to a value corresponding to a number from 0 to 12.
| 

selectVerticesOfSelectedClass
| | | 
Select model vertices based on the selected class.
| 

selectClassificationFormat
| 
classificationFormatName
| | 
Select the classification format based on the specified classification format name.
| 

renameSelectedClassificationFormat
| 
newClassificationFormatName
| | 
Rename the selected classification format to the specified new classification format name.
| 

exportSelectedClassificationFormat
| 
filePath
| | 
Export the selected classification format by specifying the full path, including the file name and the .cfd extension.
| 

exportClassificationFormat
| 
classificationFormatName 

filePath
| | 
Export the classification format by specifying its name and the output file path, including the file name and the .cfd extension.
| 

importClassificationFormat
| 
filePath
| | 
Import the classification format by specifying its full path and name, including the .cfd extension.
| 

colorModelBySelectedClassification
| | | 
Colorize the model according to the classes in the selected classification.
| 

deleteSelectedClassification
| | | 
Delete the selected classification.
| 

Examples 

Simplify, Smooth, Texture, and Export a Model 

This script computes a normal-detail model, simplifies it to 100k triangles , smooths it, textures it, and exports the result.  

Command Line 

RealityScan.exe .... -calculateNormalModel -simplify 100000 -smooth -calculateTexture -exportModel "Model 3" %MyPath%\Object.obj %MyPath%\objParams.xml -save %Mypath%\NewProject.rsproj -quit 

RealityScan.exe .... -calculateNormalModel -simplify 100000 -smooth -calculateTexture -exportModel "Model 3" %MyPath%\Object.obj %MyPath%\objParams.xml -save %Mypath%\NewProject.rsproj -quit 
Copy full snippet (1 line long) 

You can obtain the parameters file from the Export Model dialog.  

After running this, the project contains three models:

Normal model

Simplified model

Simplified + smoothed + textured model

By default, the last created model is selected for subsequent processing.
To export a specific model by name, select it with -selectModel and then use -exportSelectedModel . The example below computes a normal model, simplifies to 100k, smooths, textures, and then exports the second model :

Command Line 

RealityScan.exe .... -calculateNormalModel -simplify 100000 -smooth -calculateTexture -selectModel “Model 2” -exportSelectedModel %MyPath%\Object.obj %MyPath%\objParams.xml -save %Mypath%\NewProject.rsproj -quit 

RealityScan.exe .... -calculateNormalModel -simplify 100000 -smooth -calculateTexture -selectModel “Model 2” -exportSelectedModel %MyPath%\Object.obj %MyPath%\objParams.xml -save %Mypath%\NewProject.rsproj -quit 
Copy full snippet (1 line long) 

Import Models Into a Component 

Suppose you have a folder called  Models and want to import all OBJ files into an aligned project (saving as a new project):  

Command Line 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -save %MyPath%\NewProject.rsproj -quit
for %%s in (%MyPath%\Models\*.obj) do (
RealityScan.exe -load %MyPath%\NewProject.rsproj -selectMaximalComponent -importModel "%%s" -save %MyPath%\NewProject.rsproj -quit
) 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -save %MyPath%\NewProject.rsproj -quit
for %%s in (%MyPath%\Models\*.obj) do (
RealityScan.exe -load %MyPath%\NewProject.rsproj -selectMaximalComponent -importModel "%%s" -save %MyPath%\NewProject.rsproj -quit
) 
Copy full snippet (4 lines long) 

  The FOR loop iterates over all OBJ files and adds them to the project.  

Calculate an Orthographic Projection 

When creating and exporting an orthographic projection via CLI, attach the files that contain the necessary parameters.

Command Line 

RealityScan.exe .... -calculateNormalModel -calculateOrthoProjection %MyPath%\params.rcortho -exportOrthoProjection %MyPath%\ortho.tiff exportOrthoParams.xml -save %MyPath%\MyProject.rsproj -quit 

RealityScan.exe .... -calculateNormalModel -calculateOrthoProjection %MyPath%\params.rcortho -exportOrthoProjection %MyPath%\ortho.tiff exportOrthoParams.xml -save %MyPath%\MyProject.rsproj -quit 
Copy full snippet (1 line long) 

You can obtain params.rsortho by exporting an orthographic projection in the GUI and setting Export projection parameters file to True .  

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Model Commands 

Classification Commands 

Examples 

Simplify, Smooth, Texture, and Export a Model 

Import Models Into a Component 

Calculate an Orthographic Projection
