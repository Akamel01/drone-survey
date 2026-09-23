<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/alignment-commands
     http: 200
     fetched: 2026-09-19T01:49:49Z
     extracted from HTML; wording verbatim, layout lost -->

Alignment Commands | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Alignment Commands 

Alignment Commands

Use these commands to align and register your images, as well as manipulate components. 

On this page 

The following commands are used to compute camera poses and calibration, and to manage components and control points.

Command | Required | Optional | Description | 

align
| | | 
Align images using the current settings.
| 

draft
| | | 
Align images in the draft mode using the current settings.
| 

update
| | | 
Update all components and models by a rigid transformation to fit the actual constraints and control points.
| 

detectFeatures
| | | 
Run feature detection according to the alignment settings. Detected features will be saved in the application cache.
| 

mergeComponents
| | | 
Merge already created components. When using this command, no new images are added to the existing components.
| 

exportXMP
| | 
params.xml
| 
Export camera metadata of components created in the last alignment in the XMP format using the current settings or the settings from params.xml file (optional parameter). You can export this file from the XMP metadata export dialog. The components must fulfill the condition defined by the command setMinComponentSize.NOTE: XMP files are stored in the same folder as the respective images.
| 

exportXMPForSelectedComponent
| | | 
Export camera metadata of a selected component in XMP format using the current settings. An example is available in the paragraph "Metadata (XMP) Export Settings" below.NOTE: XMP files are stored in the same folder as the respective images.
| 

importComponent
| 
component.rsalign
| | 
Import a component from the component.rsalign file.
| 

importBundler
| 
filePath
| 
params.xml
| 
Import a Bundler project. The command requires the path to the Bundler file and, optionally, a configuration file that defines the scene transformation settings saved from the import dialog. The configuration file can be used to adjust the coordinate system or apply custom transformations during import.
| 

importColmap
| 
filePath
| 
params.xml
| 
Import a COLMAP project. The command requires the path to the COLMAP file (any of the three text files) and, optionally, a configuration file that defines the scene transformation settings saved from the import dialog. The configuration file can be used to adjust the coordinate system or apply custom transformations during import.
| 

exportLatestComponents
| 
folderName
| | 
Export components created in the last alignment as RealityScan Alignment Components (.rsalign) into a specified folder. The components must fulfill the condition defined by the command setMinComponentSize.
| 

setMinComponentSize
| 
size
| | 
Specify the minimal component size for export when using the exportLatestComponents and exportXMP commands. The default value is 5.
| 

exportSelectedComponentDir
| 
folderName
| | 
Export the selected component into a folder (folderName including the path) as a RealityScan Alignment Component (.rsalign).
| 

exportSelectedComponentFile
| 
fileName
| | 
Export the selected component into a RealityScan Alignment Component file.
| 

exportRegistration
| 
fileName
| 
params.xml
| 
Export registration to a specified file using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Export Registration dialog.
| 

exportUndistortedImages
| 
folderName
| 
params.xml
| 
Export undistorted images into a specified folder using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Export Registration dialog.
| 

exportSTMap
| | 
folderName params.xml
| 
Export ST maps for the selected images. If folderName and params.xml are not specified, results are stored along with the original images using the current settings. You can export the settings file from the application in the Export Registration dialog.
| 

exportSparsePointCloud
| 
fileName
| 
params.xml
| 
Export 3D tie points (a sparse point cloud) into a specified file (fileName including the path and format extension) using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application within the Export Point Cloud dialog.
| 

selectComponent
| 
componentName
| | 
Select a component with the specified name (componentName) for further processing.
| 

selectMaximalComponent
| | | 
Select the largest component for further processing.
| 

selectComponentWithLeastReprojectionError
| | | 
Select the component with the smallest reprojection error, based on the calculated Mean error [pixels], for further processing.
| 

renameSelectedComponent
| 
newComponentName
| | 
Rename the currently selected component.
| 

deleteSelectedComponent
| | | 
Delete the currently selected component.
| 

deleteComponent
| 
index
| | 
Delete a component based on the chosen index. Keep in mind that index numbers start at 0 (zero).
| 

deleteAllComponents
| | | 
Delete all components.
| 

importFlightLog
| 
flFileName
| 
params.xml
| 
Import a trajectory file using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Import Trajectory dialog.
| 

importGroundControlPoints
| 
gcpFileName
| 
params.xml
| 
Import ground control points using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Export Ground Control Points dialog.
| 

importControlPointsMeasurements
| 
cpmFileName
| 
params.xml
| 
Import measurements of control points (CPs) using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Export Control Points Measurements dialog.
| 

editControlPointSelection
| 
"key=value"
| | 
Edit the settings/parameters of the selected control points based on the value in the Selected control point(s) panel or its key. More information can be found here.
| 

listControlPoints
| 
fileName
| | 
Export a list of control points to the specified file path, including the file name and extension (fileName paramater). Each control point will be listed with its index.
| 

selectControlPoint
| 
controlPointName
| | 
Select a control point by its name.
| 

invertControlPointSelection
| | | 
Invert the control point selection. If no control points are selected, all will be selected.
| 

renameControlPoint
| 
controlPointNamenewName
| | 
Rename a control point. Specify control point by its current name (controlPointName) and the new name you want to assign (newName).
| 

renameSelectedControlPoint
| 
newName
| | 
Rename the selected control point to the specified new name (newName).
| 

deleteControlPoint
| | 
index
| 
Delete a selected control point. If an optional parameter index is used, a control point with a corresponding index will be removed. Index numbers start at 0 (zero) and follow the order of control points in the 1Ds view.
| 

selectMeasurementByError
| 
errorValue
| 
controlPointName
| 
Select any measurement with a position error (in pixels) equal to or greater than the specified errorValue (float value). If no control point is specified (controlPointName), the selection applies to all measurements regardless of their assigned control point.
| 

selectMeasurementByIndex
| 
controlPointNameindex
| | 
Select a control point measurement by its index within the specified control point.
| 

deleteControlPointMeasurement
| | | 
Remove selected control point measurements (images assigned to a control point). Images have to be selected in the 1Ds view under the corresponding control point.
| 

exportGroundControlPoints
| 
gcpFileName
| 
params.xml
| 
Export ground control points using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Export Ground Control dialog.
| 

exportControlPointsMeasurements
| 
cpmFileName
| 
params.xml
| 
Export measurements of control points using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Export Control Points Measurements dialog when pressing the Shift key together with the button Control Points in the Export part of the Alignment tab.
| 

defineDistance
| 
PointNameAPointNameBdistance
| 
constraintName
| 
Define a distance constraint between two control points. If constraintName is not defined, the distance name is created automatically. Alternatively, you can load distance constraints from a file (see below).
| 

defineDistance
| 
fileName
| 
params.xml
| 
Import a distance constraint from a file (filename including path) using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the Import Distance Definitions dialog. The list of supported formats distancedefinitions.xml can be found in the installation folder.
| 

editConstraintSelection
| 
"key=value"
| | 
Edit the settings/parameters of the selected constraints based on the value in the Selected constraint(s) panel or its key. More information can be found here.
| 

deleteConstraint
| | 
index
| 
Remove the selected distance constraints. The constraints must be selected in the 1Ds view. You can use an index as an optional parameter to specify which constraint to remove. Indexes start at 0 and follow the order of constraints in the 1Ds view.
| 

detectMarkers
| | 
params.xml
| 
Detect markers in images using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the Detect Markers tool in the application.
| 

setCamerasGravityDirection
| | 
componentID
| 
If the image's XMP file contains gravity information (xcr:Gravity), the component will be rotated so the -z vector is in the direction of the gravity vector. This does not apply to the dense point cloud (mesh/model), only to the sparse point cloud (alignment). Will apply to the selected component or to the component defined with the optional parameters (component ID).
| 

Examples 

Follow these examples to learn how to align images using the command line.

Alignment and Draft 

Suppose you want to add images, perform a quick draft alignment, review the result, and then continue with a full alignment and further processing.

Command Line 

RealityScan.exe -addFolder %MyPath%\Images\ -save %MyPath%\MyProject.rsproj -draft
RealityScan.exe -load %MyPath%\MyProject.rsproj -align .... -quit 

RealityScan.exe -addFolder %MyPath%\Images\ -save %MyPath%\MyProject.rsproj -draft
RealityScan.exe -load %MyPath%\MyProject.rsproj -align .... -quit 
Copy full snippet (2 lines long) 

The first line does not end with -quit, so the command will wait until the application is closed before continuing.

Export XMP to Reuse Alignment 

Now we will reuse an existing alignment. Imagine you have a properly aligned project,  Project1.rsproj,  that uses images from  Images1 , and you want to create a new project,  Project2.rsproj,  with images from  Images2 , using the same alignment.

We assume that corresponding images in Images1 and Images2 share the same names but may differ in their file extensions.  

Command Line 

RealityScan.exe -load %MyPath%\Project1.rsproj -exportXMP -quit
copy Images1/*.xmp Images2/
RealityScan.exe -addFolder %MyPath%\Images2\ -align -save %MyPath%\Project2.rsproj -quit 

RealityScan.exe -load %MyPath%\Project1.rsproj -exportXMP -quit
copy Images1/*.xmp Images2/
RealityScan.exe -addFolder %MyPath%\Images2\ -align -save %MyPath%\Project2.rsproj -quit 
Copy full snippet (3 lines long) 

This script exports XMP files from Project1 to the Images1 folder, copies them to Images2 , and then aligns the images using the camera positions and calibration data stored in those XMP files and the application settings.  

Select and Export the Largest Component 

The next example selects the largest component and loads it into an empty scene.

Command Line 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -selectMaximalComponent -exportComponent %MyPath%\max -quit
for %%s in ("maxComponent *.rsalign") do (
RealityScan.exe -importComponent "%MyPath%\%%s" -save %MyPath%\NewProject.rsproj -quit
) 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -selectMaximalComponent -exportComponent %MyPath%\max -quit
for %%s in ("maxComponent *.rsalign") do (
RealityScan.exe -importComponent "%MyPath%\%%s" -save %MyPath%\NewProject.rsproj -quit
) 
Copy full snippet (4 lines long) 

Since the name of the component is not known beforehand, it must be searched for outside the application.
By default, components are named Component 0 , Component 1 , etc. The largest component will therefore be saved as maxComponent 1.rsalign or a similar file.  

Export Components Above a Minimal Size 

The final example exports all components containing more than five cameras and imports them one by one into a new project.

Command Line 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -minComponentSize 5 -exportComponent %MyPath%\ -newScene -save %MyPath%\NewProject.rsproj -quit
for %%s in (*.rsalign) do (
RealityScan.exe -load %MyPath%\NewProject.rsproj -importComponent "%MyPath%\%%s" -save %MyPath%\NewProject.rsproj -quit
) 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -minComponentSize 5 -exportComponent %MyPath%\ -newScene -save %MyPath%\NewProject.rsproj -quit
for %%s in (*.rsalign) do (
RealityScan.exe -load %MyPath%\NewProject.rsproj -importComponent "%MyPath%\%%s" -save %MyPath%\NewProject.rsproj -quit
) 
Copy full snippet (4 lines long) 

You can also import each component into its own project and process them separately if needed.

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Examples 

Alignment and Draft 

Export XMP to Reuse Alignment 

Select and Export the Largest Component 

Export Components Above a Minimal Size
