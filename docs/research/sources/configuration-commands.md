<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/configuration-commands
     http: 200
     fetched: 2026-09-19T01:49:51Z
     extracted from HTML; wording verbatim, layout lost -->

Configuration Commands | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Configuration Commands 

Configuration Commands

Change various settings across RealityScan and output a progress log. 

On this page 

You can use these commands to alter the settings and behavior of the application.

Command | Required | Optional | Description | 

set
| 
"key=value"
| | 
Change an application setting. Learn more about how to use this command here.
| 

preset
| 
"key=value"
| | 
Change an application setting during the setup phase. Ideal for changes that require a reset of the application. Learn more about how to use this command here.
| 

reset
| 
ui OR cfg OR cfgui OR all
| | 
Reset the user interface, settings, or both. It is also possible to make RealityScan like a clean install. This command works only when used in a batch file, and it won't work with delegation commands. What is going to be reset is determined by the chosen parameter: ui - reset user interface, cfg - reset application settings, cfgui - reset both interface and settings, all - make it like a clean install.
| 

silent
| 
crashReportPath
| | 
Suppress warning dialogs and uploading of the crash reports. The application will store reports in the specified location instead of showing the upload wizard. This command has to be used at the startup.
| 

writeProgress
| 
fileName
| 
timeout
| 
Write any new progress change into a specified file (fileName including the path). Optional timeout parameter will also output during a defined period of time (timeout in seconds). More about the file structure can be found in the section Error-handling Commands.
| 

printProgress
| | 
timeout
| 
Print progress change into the Windows Command Prompt for any new change. Optional timeout parameter will also output during a defined period of time (timeout in seconds).
| 

tag
| | | 
Writes out a tag into the Windows Command Prompt. It respects the order of the used commands and will be run after the process ran before it finishes.
| 

stdConsole
| | | 
Enables console redirection to the application standard output. When used, you will see the application console content mirrored also in the standard Windows console. This also enables further redirections for CLI purposes.
| 

disableOnlineCommunication
| | | 
Disable any online communication.
| 

importGlobalSettings
| 
settings.rcconfig
| | 
Import application global settings from the settings.rcconfig file.
| 

exportGlobalSettings
| 
settings.rcconfig
| | 
Export application global settings to the settings.rcconfig file.
| 

setProjectCoordinateSystem
| 
authority:id
| | 
Set a project coordinate system defined by an authority, and its ID (can be found in a specific database, e.g. epsg.xml and local.xml). An example can be found here.
| 

setOutputCoordinateSystem
| 
authority:id
| | 
Set an output coordinate system defined by an authority, and its ID (can be found in a specific database, e.g. epsg.xml and local.xml). An example can be found here.
| 

Examples 

Command Line 

RealityScan.exe -set "sfmDistortionModel=Brown3" ^
-set "unwrapMaximalTexCount=1" ^
-set "unwrapStyle=1" 

RealityScan.exe -set "sfmDistortionModel=Brown3" ^
-set "unwrapMaximalTexCount=1" ^
-set "unwrapStyle=1" 
Copy full snippet (3 lines long) 

With the following commands, you can set the local Euclidean coordinate system as a project coordinate system, and the GPS (WGS84) with EPSG code 4326 as an output coordinate system:

Command Line 

RealityScan.exe -setProjectCoordinateSystem Local:1 ^
-setOutputCoordinateSystem epsg:4326 

RealityScan.exe -setProjectCoordinateSystem Local:1 ^
-setOutputCoordinateSystem epsg:4326 
Copy full snippet (2 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Examples
