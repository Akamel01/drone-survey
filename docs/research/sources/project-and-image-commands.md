<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/project-and-image-commands
     http: 200
     fetched: 2026-09-19T01:49:56Z
     extracted from HTML; wording verbatim, layout lost -->

Project and Image Commands | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Project and Image Commands 

Project and Image Commands

Find out how to set up your project and import images and other data. 

On this page 

Many features in RealityScan can be executed directly from the command line or through a batch file. Commands are passed to the application as parameters of RealityScan.exe and executed sequentially, similar to how the same actions would be performed through the graphical user interface (GUI). The application launches normally, allowing you to interact with it during processing.

You can run a command sequence in the Windows Command Prompt or by executing a file with the .bat extension. The following example shows how a command sequence works: it begins by launching the application using its full path. Each command starts with a hyphen and can be followed by additional parameters.

Command Line 

"C:\Program Files\Epic Games\RealityScan\RealityScan.exe" -load C:\MyFolder\MyProject.rsproj -selectMaximalComponent -calculateNormalModel -simplify 1000000 -save C:\MyFolder\MyProject.rsproj -quit 

"C:\Program Files\Epic Games\RealityScan\RealityScan.exe" -load C:\MyFolder\MyProject.rsproj -selectMaximalComponent -calculateNormalModel -simplify 1000000 -save C:\MyFolder\MyProject.rsproj -quit 
Copy full snippet (1 line long) 

To use a simple RealityScan.exe command instead of the full application path, add the application’s directory to the system PATH variable.

To temporarily add the RealityScan folder to the path (valid only for the current command-line session), include the following line at the beginning of your script:

Command Line 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\
RealityScan.exe -load ... -quit 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\
RealityScan.exe -load ... -quit 
Copy full snippet (2 lines long) 

Basic Project and Image Commands 

The following are the basic commands used to control the current project, manage the application, and add images.

Command | Required | Optional | Description | 

headless
| | | 
Hides user interface. Find more about this command here.
| 

hideUI
| | | 
Hide user interface. Unlike headless, this command doesn't need to be run at startup and does not suppress actions that require user interaction.
| 

showUI
| | | 
Shows hidden user interface. Unlike headless, this command doesn't need to be run at startup.
| 

newScene
| | | 
Create a new empty scene.
| 

load
| 
MyProject.rsproj
| 
recoverAutosaveORdeleteAutosave
| 
Load an existing project from the MyProject.rsproj file. Use optional parameters to define the action if there is an autosaved file present for this project. Using recoverAutosave will open the autosaved project, while deleteAutosave will delete the autosaved project and load the original one. More information about the Autosave feature can be found here.To set the preference globally for all projects, use set command with appAutoSaveCliHandling key. Find more information in the section CLI Settings Keys & Values.
| 

save
| | 
MyProject.rsproj
| 
Save the current project to its original location or save as MyProject.rsproj.
| 

start
| | | 
Run the processes configured for the Start button. Adjust these settings in the Start button settings which can be accesed from the Start button dropdown menu.
| 

unlockPPIProject
| 
myProject.rcproj
| | 
Save and unlock your PPI projects to make them compatible for use with the latest RealityScan versions. Use the whole path with the project's name and extension where you want to store the unlocked project.
| 

add
| 
imageName
| | 
Import one or more images from a specified file path or from an image list. The image list is a text file with the .imagelist extension, containing full paths to the images, each on a separate line.
| 

addFolder
| 
folderName
| | 
Add all images to the specified folder. To include subdirectories, use the command set with a key appIncSubdirs as follows: -set "appIncSubdirs=true". Find more information in the section CLI Settings Keys & Values.
| 

importVideo
| 
videoFileNameextractedVideoFramesLocationjumpsLength
| | 
Import frames extracted from a video (videoFileName including the path). The frames are extracted into a folder (extractedVideoFramesLocation) using an interval between frames defined by the jumpsLength (in seconds).
| 

importLeicaBlk3D
| 
fileName
| | 
Import image sequence with .cmi extension (fileName including path) captured by Leica BLK3D.
| 

importLaserScan
| 
laserscanName
| 
params.xml
| 
Add a LiDAR scan or a LiDAR scan list using the current settings or the settings from the params.xml file (optional parameter). You can export these settings from the application in the LiDAR Scan Import dialog.
| 

importLaserScanFolder
| 
folderName
| 
params.xml
| 
Add all LiDAR scans in the specified folder using settings from the params.xml file. You can export these settings from the application in the LiDAR Scan Import dialog.
| 

importHDRimages
| 
fileName OR folderName OR imageList
| 
params.xml
| 
Import HDR image (imageName), list of images (imageList) or all images from a folder (folderName) using the current settings or the settings from params.xml. You can export these settings from the application in the 16-bit/HDR Images Import dialog.
| 

addImageWithCalibration
| 
fileNamexmpFileName
| | 
Import an image as well as the corresponding XMP file. Use whole paths to the files.
| 

importImageSelection
| 
fileName
| | 
Select some scene images and/or LiDAR scans listed in a file (filename including the path).
| 

selectImage
| 
imagePath OR regexp
| 
setunionsubintersecttoggle
| 
Select a specified image (imagePath) or images defined by regular expression (regexp). See below examples. One of the optional parameters may be used to more select images with more flexibility.
| 

selectAllImages
| | | 
Select all images in the project.
| 

deselectAllImages
| | | 
Deselect all images in the project.
| 

invertImageSelection
| | | 
Invert the current image selection.
| 

removeCalibrationGroups
| | | 
Clear all inputs from their calibration groups.
| 

generateAIMasks
| | | 
Use AI Masking to generate masks by isolating the object of interest in your images.
| 

exportMasks
| 
folderPathparams.xml
| | 
Export the mask images currently used in the project. Specify the output folder and, optionally, the full path to the XML file with export parameters (this file can be exported from the Export Mask Images dialog).
| 

setImageLayer
| 
indexpathImagelayerType
| | 
Set the layer from the image defined with the pathImage parameter (path to the layer image) to the image defined with the index parameter. The index corresponds to the image order in the 1Ds view, starting at 0 (zero). The layerType parameter defines which layer to set onto the chosen image (e.g., mask, texture).
| 

setImagesLayer
| 
pathImagelayerType
| | 
Set the layer from the image defined with the pathImage parameter (path to the layer image) to the selection of images. The layerType parameter defines which layer to set onto the selected images (e.g., mask, texture).
| 

removeImageLayer
| 
layerType
| | 
Remove the layers corresponding to the layerType parameter (e.g. mask, texture) from the selected images.
| 

importCache
| 
folderName
| | 
Import resource cache data from a specified folder.
| 

clearCache
| | | 
Clear the application cache. You must save the project before clearing the application cache.
| 

execRSCMD
| 
Commands.rscmd
| | 
Execute commands from an .rscmd (or .rccmd file), optionally using report parameters. The file format and syntax are described in the Commands Outside Command Prompt section. You can define up to nine arguments, acting as variables, by listing them after the path to the .rscmd file. Inside the file, reference these variables using $(arg1)–$(arg9).
| 

quit
| | | 
Quit the application.
| 

Image Selection 

Select an image specified by direct path:

Command Line 

-selectImage D:\sample\Images\IMG_0018.JPG 

-selectImage D:\sample\Images\IMG_0018.JPG 
Copy full snippet (1 line long) 

Select images with "DSC" in their name:

Command Line 

-selectImage g/DSC/ 

-selectImage g/DSC/ 
Copy full snippet (1 line long) 

Select images that contain "2" and "1" and some other character in between (e.g., image_1251.jpg):

Command Line 

-selectImage g/2.1/ 

-selectImage g/2.1/ 
Copy full snippet (1 line long) 

Select every image that ends with an even number and has a .jpg extension (e.g., 222.jpg or img_0018.jpg):

Command Line 

-selectImage g/[02468]\.jpg/ 

-selectImage g/[02468]\.jpg/ 
Copy full snippet (1 line long) 

Select every image that contains "DSC", ends with an even number, and has a .jpg extension (e.g., img_DSC_222.jpg or DSC_14.jpg):

Command Line 

-selectImage g/DSC.*[02468]\.jpg/ 

-selectImage g/DSC.*[02468]\.jpg/ 
Copy full snippet (1 line long) 

Optional Parameters 

set 

Select only those images that meet the chosen condition and deselect all others. This operation is used by default even if none of the optional parameters are being used.

intersect

Select only those images that are already selected and that correspond to the chosen condition. All others will be removed from the selection.

toggle 

Invert the selection status of images that meet the chosen condition. Already selected images will be deselected, and vice versa.

union 

Create a union with already selected images. This will not deselect already selected images, but will only add images that meet the chosen conditions to the selection.

sub

Deselect images that are already selected and that correspond to the chosen condition.

Commands for Selected Images 

The following commands allow you to configure preferences for subsequent image processing.

| | | | 

setFeatureSource
| 
0 OR 1 OR 2
| | 
Define a feature source mode for the selected images:0 – Merge using overlaps,1 – Use component features,2 – Use all image features.
| 

enableAlignment
| 
true OR false
| | 
Enable/disable selected images in the registration process.
| 

enableMeshing
| 
true OR false
| | 
Enable/disable selected images in the model computation/meshing.
| 

enableTexturingAndColoring
| 
true OR false
| | 
Enable/disable selected images during the coloring and texture calculation.
| 

setWeightInTexturing
| 
<0,1>
| | 
Set weight for selected images during the coloring and texture calculation.
| 

enableColorNormalizationReference
| 
true OR false
| | 
Set selected images as color references in the color normalization process. The colors for these images will not be changed.
| 

enableColorNormalization
| 
true OR false
| | 
Enable or disable selected images in the color normalization process.
| 

setDownscaleForDepthMaps
| 
integer
| | 
Set a downscale factor for depth-map computation for the selected images.
| 

enableInComponent
| 
true OR false
| | 
Enable selected images in meshing and continue. Applicable only for the registered images.
| 

setCalibrationGroupByExif
| | | 
Set the calibration group of all inputs based on their Exif.
| 

setConstantCalibrationGroups
| | | 
Group all selected inputs into a single calibration group.
| 

lockPoseForContinue
| 
true OR false
| | 
Set relative camera pose unchanged for the selected images during the next registration. Applicable only for the registered images.
| 

setPriorCalibrationGroup
| 
number
| | 
Set a prior calibration group for the selected images:-1 - do not group,another number - group into the same calibration group.
| 

setPriorLensGroup
| 
number
| | 
Set a prior lens group for the selected images. Using -1 means do not group; any other number means to group the selected images into the same distortion group.
| 

editInputSelection
| 
"key=value"
| | 
Edit the settings of the selected inputs based on the value in the Selected inputs panel or its key. More information can be found here.
| 

Delegate Commands 

Use these commands to delegate actions to an active or specific RealityScan instance.

| | | | 

setInstanceName
| 
instanceName
| | 
Assign a name to a RealityScan instance.
| 

delegateTo
| 
instanceName OR *
| | 
Delegate a command or a sequence of commands to a specific instance of RealityScan (instanceName) or to the first available instance (using the * symbol as a parameter).
| 

waitCompleted
| 
instanceName OR *
| | 
Pause execution of other commands until the current process is finished in a specified instance of RealityScan (instanceName) or in the first available instance (using the * as a parameter).
| 

getStatus
| 
instanceName OR *
| | 
Return the progress status of a running process in a specified instance of RealityScan (instanceName) or in the first available instance (using the * symbol as a parameter).
| 

pauseInstance
| 
instanceName OR *
| | 
Pause a currently running process in a specified instance of RealityScan (instanceName) or in the first available instance (using the * symbol as a parameter).
| 

unpauseInstance
| 
instanceName OR *
| | 
Unpause a currently paused process in a specified instance of RealityScan (instanceName) or in the first available instance (using the * symbol as a parameter).
| 

abortInstance
| 
instanceName OR *
| | 
Abort a currently running process in a specified instance of RealityScan (instanceName) or in the first available instance (using the * symbol as a parameter). If processing is done using the CLI commands, all processes after the running process will also be aborted.
| 

execRSCMDIndirect
| 
instanceName OR *commands.rscmd
| | 
Execute commands listed in the .rscmd (or .rccmd) file in the specified instance, optionally using report parameters. The file format and syntax are described in the Commands Outside Command Prompt section. You can define up to nine arguments, acting as variables, by listing them after the path to the .rscmd file. Inside the file, reference these variables using $(arg1)–$(arg9).
| 

Examples 

All examples use Windows command-line syntax. For instance, imagine a batch script in C:\MyFolder where you want to load C:\MyFolder\PlainProject.rsproj , add images from C:\MyFolder\Images , save the progress as MyProject.rsproj , and then exit.  

Command Line 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\
RealityScan.exe -load C:\MyFolder\PlainProject.rsproj -addFolder C:\MyFolder\Images\ -save C:\MyFolder\MyProject.rsproj -quit 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\
RealityScan.exe -load C:\MyFolder\PlainProject.rsproj -addFolder C:\MyFolder\Images\ -save C:\MyFolder\MyProject.rsproj -quit 
Copy full snippet (2 lines long) 

To improve readability (especially with long paths) and make your script more flexible, store the working folder in an environment variable.

Command Line 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\set MyPath=C:\MyFolderRealityScan.exe -load %MyPath%\PlainProject.rsproj -addFolder %MyPath%\Images\ -save %MyPath%\MyProject.rsproj -quit 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\set MyPath=C:\MyFolderRealityScan.exe -load %MyPath%\PlainProject.rsproj -addFolder %MyPath%\Images\ -save %MyPath%\MyProject.rsproj -quit 
Copy full snippet (1 line long) 

Adding either an image list or a single image works the same way.

Command Line 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\set MyPath=C:\MyFolderRealityScan.exe -load %MyPath%\PlainProject.rsproj -add %MyPath%\images.imagelist -add %MyPath%\Images\image_123.jpg -save %MyPath%\MyProject.rsproj -quit 

set PATH=%PATH%;C:\Program Files\Epic Games\RealityScan\set MyPath=C:\MyFolderRealityScan.exe -load %MyPath%\PlainProject.rsproj -add %MyPath%\images.imagelist -add %MyPath%\Images\image_123.jpg -save %MyPath%\MyProject.rsproj -quit 
Copy full snippet (1 line long) 

Using the -newScene command is usually unnecessary because the application starts with a new scene by default. It’s useful, however, when you want to begin a new project without relaunching the application.  

In batch scripts, use the caret ( ^ ) to continue a sequence of RealityScan commands on the next line, so they’re processed as one.
Lines starting with # , // , REM , or rem are treated as comments and skipped. For example: // I am a comment .  

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Basic Project and Image Commands 

Image Selection 

Optional Parameters 

Commands for Selected Images 

Delegate Commands 

Examples
