<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/reconstruction-commands
     http: 200
     fetched: 2026-09-19T01:49:56Z
     extracted from HTML; wording verbatim, layout lost -->

Reconstruction Commands | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Reconstruction Commands 

Reconstruction Commands

Automate the setting of the reconstruction region and create a mesh. 

On this page 

Reconstruction Commands 

These commands can be used to calculate models and perform coloring and texturing.

Command | Required | Optional | Description | 

resetGround
| | | 
Set the ground plane back to its original orientation and position.
| 

setGroundPlaneFromReconstructionRegion
| | | 
Automatically center a model using a reconstruction region into the middle of the grid, adjusting both rotation and transformation.
| 

setReconstructionRegionAuto
| | | 
Set a reconstruction region automatically.
| 

setReconstructionRegion
| 
box.rsbox
| | 
Import a reconstruction region from the box.rsbox file.
| 

setReconstructionRegionOnCPs
| 
controlPoint

controlPoint

controlPoint

controlPoint OR heightValue
| | 
Set a reconstruction region on existing control points. Three control points define the base of the region, and the height of the region is defined by the fourth control point or by entering the height value. You can find more about this command in the examples here.
| 

setReconstructionRegionByDensity
| | | 
Set the reconstruction region to the part of the sparse point cloud with the highest density.
| 

scaleReconstructionRegion
| 
scaleX

scaleY

scaleZ
| 
origin OR center

absolute OR factor
| 
Scale the reconstruction region in each axis (scaleX, scaleY, and scaleZ). Scale parameters can be treated either as absolute values (absolute) or scale factors (factor) from the center of the region (center) or its origin (origin) defined by the first control point when using setReconstructionRegionOnCPs command. Default values are "absolute" and "center". You can find more about this command in the examples here.
| 

moveReconstructionRegion
| 
moveX

moveY

moveZ
| | 
Move the reconstruction region along the region's axes. The values are in the coordinate system’s units. You can find more about this command in the examples here.
| 

rotateReconstructionRegion
| 
rotateX

rotateYrotateZ
| | 
Rotate the reconstruction region around its axes. All values are in degrees. You can find more about this command in the examples here.
| 

offsetReconstructionRegion
| 
offsetX

offsetY

offsetZ
| | 
Offset the reconstruction region on its axes by the values of its dimensions. You can find more about this command in the examples here.
| 

exportReconstructionRegion
| 
box.rsbox
| | 
Export a reconstruction region to the box.rsbox file.
| 

calculatePreviewModel
| | | 
Calculate 3D mesh in the preview quality.
| 

calculateNormalModel
| | | 
Calculate 3D mesh in the normal quality.
| 

calculateHighModel
| | | 
Calculate 3D mesh in the highest quality.
| 

continueModelCalculation
| | | 
If the model calculation was paused or if there was a crash, it is possible to continue the calculation using this command. Find more about this command here.
| 

Examples 

The following examples demonstrate how to perform model calculations from the command line.

We’ll start with a simple script that illustrates the use of the first two reconstruction region commands.

Command Line 

RealityScan.exe -addFolder %MyPath%\Images\ -align -setReconstructionRegionAuto -exportReconstructionRegion %MyPath%\myBox.rsbox -quit

RealityScan.exe -addFolder %MyPath%\Images\ -align -setReconstructionRegionAuto -exportReconstructionRegion %MyPath%\myBox.rsbox -quit

Copy full snippet (1 line long) 

After the basic alignment, the reconstruction region will be set automatically and exported to a file.

If you want to use a custom reconstruction region, you can first export it from the application by selecting MESH & COLOR → Export → Reconstruction Region , then modify the values and parameters inside the resulting .rsbox file.

The following script opens an aligned project, selects the largest component, imports a reconstruction region, and calculates models in preview , normal , and high detail.

Command Line 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -selectMaximalComponent -setReconstructionRegion %MyPath%\myBox.rsbox -calculatePreviewModel -calculateNormalModel -calculateHighModel -save %MyPath%\NewProject.rsproj -quit

RealityScan.exe -load %MyPath%\AlignedProject.rsproj -selectMaximalComponent -setReconstructionRegion %MyPath%\myBox.rsbox -calculatePreviewModel -calculateNormalModel -calculateHighModel -save %MyPath%\NewProject.rsproj -quit

Copy full snippet (1 line long) 

In batch scripting, you can use the caret (^) to break a line and continue the command sequence on the next line, allowing the CLI to process it as a single command. The multiline script performs the same actions as the one-line version, but it’s easier to read and organized into logical parts.

Command Line 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj ^
-selectMaximalComponent -setReconstructionRegion %MyPath%\myBox.rsbox ^
-calculatePreviewModel ^
-calculateNormalModel ^
-calculateHighModel ^
-save %MyPath%\NewProject.rsproj -quit 

RealityScan.exe -load %MyPath%\AlignedProject.rsproj ^
-selectMaximalComponent -setReconstructionRegion %MyPath%\myBox.rsbox ^
-calculatePreviewModel ^
-calculateNormalModel ^
-calculateHighModel ^
-save %MyPath%\NewProject.rsproj -quit 
Copy full snippet (6 lines long) 

Set Reconstruction Region on Control Points 

You can use the -setReconstructionRegionOnCPs command to define a reconstruction region based on control points.

At least three control points are required to use this command. The first two control points define the region’s width, while the third defines its length, forming the base plane of the reconstruction region.

The region’s height can be specified either by adding a fourth control point or by entering a height value (in the coordinate system’s units). This value may also be negative.

Command Line 

RealityScan.exe -delegateTo * -setReconRegionOnCPs CP1 CP2 CP3 50 

RealityScan.exe -delegateTo * -setReconRegionOnCPs CP1 CP2 CP3 50 
Copy full snippet (1 line long) 

This example creates a reconstruction region using control points CP1 , CP2 , and CP3 , with a height of 50 in the coordinate system’s units.

The order of the control points in the command determines the axes of the reconstruction region. The region always follows a right-handed coordinate system , where the origin is placed at the first control point, and the X-axis starts at the origin and passes through the second control point.

Scale Reconstruction Region 

The reconstruction region can be scaled along its axes using the -scaleReconstructionRegion command, either by specifying absolute values or by applying multiplication factors. You can also define the scaling reference point, either the origin or the center .

By default, the command scales the reconstruction region from its center and based on absolute values .

Command Line 

RealityScan.exe -delegateTo * -scaleReconstructionRegion 1.1 1.1 1.2 center factor 

RealityScan.exe -delegateTo * -scaleReconstructionRegion 1.1 1.1 1.2 center factor 
Copy full snippet (1 line long) 

This example scales the reconstruction region from its center using the specified factors. The X and Y axes are multiplied by 1.1 , and the Z axis is multiplied by 1.2 .  

Move Reconstruction Region 

To move the reconstruction region, use the -moveReconstructionRegion command.

Command Line 

RealityScan.exe -delegateTo * -moveReconstructionRegion 10 10 10 

RealityScan.exe -delegateTo * -moveReconstructionRegion 10 10 10 
Copy full snippet (1 line long) 

This will move the reconstruction region by 10 units (defined by the coordinate system) along all axes.

Rotate Reconstruction Region 

The reconstruction region can be rotated using the -rotateReconstructionRegion command. All defined parameters for this command are specified in degrees .  

Command Line 

RealityScan.exe -delegateTo * -rotateReconstructionRegion 45 45 45 

RealityScan.exe -delegateTo * -rotateReconstructionRegion 45 45 45 
Copy full snippet (1 line long) 

This example rotates the reconstruction region by 45 degrees around all axes, causing the axes themselves to rotate as well.  

All commands that modify the lengths of the reconstruction region’s sides use the coordinate system’s units (except when scaling by a factor). For non-georeferenced projects , the behavior is undefined—you can manually scale the coordinate system using distance constraints .  

Offset Reconstruction Region 

Offset the reconstruction region using the -offsetReconstructionRegion command by specifying relative values that act as multipliers of the region’s side lengths.  

Command Line 

RealityScan.exe -delegateTo * -offsetReconstructionRegion 1 2 0.5 

RealityScan.exe -delegateTo * -offsetReconstructionRegion 1 2 0.5 
Copy full snippet (1 line long) 

This example offsets the reconstruction region along its axes as follows:

X axis: by one length of its depth

Y axis: by two lengths of its width

Z axis: by half of its height

These values are applied relative to the reconstruction region’s own XYZ axes .

Precomputation of Depth Maps 

To accelerate model computation across multiple computers, you can precompute depth maps using the PrecomputeDepthmaps setting:  

Command Line 

RealityScan.exe -set "PrecomputeDepthmaps=true" 

RealityScan.exe -set "PrecomputeDepthmaps=true" 
Copy full snippet (1 line long) 

When set to true , the preview , normal , or high command will precompute only the depth maps, which are stored in the application cache, and no model will be created.

When set to the default value false , the preview , normal , or high command performs as usual: depth maps are computed a,nd a model is generated. However, if the depth maps have already been precomputed and stored in the cache, the computation step is skipped and only the model creation process is executed.  

After finishing the precomputation, reset the value to false to restore normal operation of the preview , normal , and high commands.  

This approach is particularly useful for maximizing GPU/CPU utilization when processing multiple assets of similar size, such as a batch of full-body scans.  

For optimal performance, you can set up two machines:

One with multiple powerful GPUs but a standard CPU

One with a powerful CPU but a standard GPU

Install RealityScan on both machines, and run these two pipelines in parallel for efficient processing.

GPU-PC, Dataset (i+1): Align → Enable Precompute Depth Maps → Compute Model → Save → Move the project and cache to CPU-PC: 

Command Line 

RealityScan.exe -addFolder "C:\MyFolder_on_GPU-PC\Images\"^
-align^
-set "PrecomputeDepthmaps=true"^
-calculateNormalModel^
-save "C:\MyFolder_on_GPU-PC\Project.rsproj" -quit 

RealityScan.exe -addFolder &quot;C:\MyFolder_on_GPU-PC\Images\&quot;^
-align^
-set &quot;PrecomputeDepthmaps=true&quot;^
-calculateNormalModel^
-save &quot;C:\MyFolder_on_GPU-PC\Project.rsproj&quot; -quit 
Copy full snippet (5 lines long) 

Move Project.rsproj from C:\MyFolder_on_GPU-PC to C:\MyFolder_on_CPU-PC , and move the cache to C:\MyFolder_on_CPU-PC\Cache .  

CPU-PC, Dataset (i): Load → Import Cache → Disable Precompute Depth Maps → Compute Model → Export:  

Command Line 

RealityScan.exe -load "C:\MyFolder_on_CPU-PC\Project.rsproj"^
-importCache "C:\MyFolder_on_CPU-PC\Cache\"^
-set "PrecomputeDepthmaps=false"^
-calculateNormalModel^
-exportModel "Model 1" "C:\MyFolder_on_CPU-PC\Model.obj" "C:\MyFolder_on_CPU-PC\params.xml"^
-save "C:\MyFolder_on_CPU-PC\Project_Model.rsproj" -quit 

RealityScan.exe -load &quot;C:\MyFolder_on_CPU-PC\Project.rsproj&quot;^
-importCache &quot;C:\MyFolder_on_CPU-PC\Cache\&quot;^
-set &quot;PrecomputeDepthmaps=false&quot;^
-calculateNormalModel^
-exportModel &quot;Model 1&quot; &quot;C:\MyFolder_on_CPU-PC\Model.obj&quot; &quot;C:\MyFolder_on_CPU-PC\params.xml&quot;^
-save &quot;C:\MyFolder_on_CPU-PC\Project_Model.rsproj&quot; -quit 
Copy full snippet (6 lines long) 

We do not recommend sharing the cache via a network drive. Instead, we recommend storing the cache on a local SSD drive on both computers and copying its contents between them.  

Continue Model Calculation 

If a model computation is interrupted (for example, due to a crash or a manual pause), you can resume it using the -continueModelCalculation command. To use this command after a crash, auto-save mode must be enabled beforehand.

The command scans your project for unfinished models and resumes the first one it finds. Models are searched from the last component to the first , and within each component from the last model to the first .

Example (when paused):

Command Line 

RealityScan.exe -load project.rsproj -continueModelCalculation 

RealityScan.exe -load project.rsproj -continueModelCalculation 
Copy full snippet (1 line long) 

When pausing a calculation, you can choose not to pause it temporarily, leaving the model in a partially computed state . The following example continues the calculation of that model, provided the loaded project was saved before closing.  

Example (after a crash):

Command Line 

RealityScan.exe -load project.rsproj recoverAutosave -continueModelCalculation 

RealityScan.exe -load project.rsproj recoverAutosave -continueModelCalculation 
Copy full snippet (1 line long) 

As mentioned above, auto save mode must be enabled to use this command. When enabled, you can include the optional recoverAutosave parameter with the -load command. This allows RealityScan to scan for and resume any unfinished model 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Reconstruction Commands 

Examples 

Set Reconstruction Region on Control Points 

Scale Reconstruction Region 

Move Reconstruction Region 

Rotate Reconstruction Region 

Offset Reconstruction Region 

Precomputation of Depth Maps 

Continue Model Calculation
