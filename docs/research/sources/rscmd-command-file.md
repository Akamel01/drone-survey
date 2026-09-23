<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/rscmd-command-file
     http: 200
     fetched: 2026-09-19T01:49:57Z
     extracted from HTML; wording verbatim, layout lost -->

RSCMD Command File | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

RSCMD Command File 

RSCMD Command File

Run commands using .rscmd files, which can be either dragged and dropped into the RealityScan user interface or executed through other command-line commands. 

On this page 

RealityScan allows you to execute commands without directly using the command line. You can simply drag and drop a text file containing a sequence of supported commands—saved with the .rscmd extension—into the application.  

Example Explained 

The following example shows a command sequence that loads images from C:\MyFolder\Images\ , aligns them, creates a normal-detail model , and saves the project to C:\MyFolder\MyProject.rsproj :  

Command Line 

-addFolder C:\MyFolder\Images\ -align -setReconstructionRegionAuto -calculateNormalModel -save C:\MyFolder\MyProject.rsproj 

-addFolder C:\MyFolder\Images\ -align -setReconstructionRegionAuto -calculateNormalModel -save C:\MyFolder\MyProject.rsproj 
Copy full snippet (1 line long) 

You can also place each command on a new line for better readability:

Command Line 

-addFolder C:\MyFolder\Images\
-align
-setReconstructionRegionAuto
-calculateNormalModel
-save C:\MyFolder\MyProject.rsproj 

-addFolder C:\MyFolder\Images\
-align
-setReconstructionRegionAuto
-calculateNormalModel
-save C:\MyFolder\MyProject.rsproj 
Copy full snippet (5 lines long) 

  Or break lines using the ^ character (with or without a space before it):  

Command Line 

-addFolder C:\MyFolder\Images\^
-align^
-setReconstructionRegionAuto^
-calculateNormalModel^
-save C:\MyFolder\MyProject.rsproj 

-addFolder C:\MyFolder\Images\^
-align^
-setReconstructionRegionAuto^
-calculateNormalModel^
-save C:\MyFolder\MyProject.rsproj 
Copy full snippet (5 lines long) 

In batch scripting, use the ^ symbol to continue a command sequence on the next line so that it is processed as a single command.
Lines starting with # , // , REM , or rem are treated as comments and ignored. For example:   // I am a comment 

Executing Commands Listed in a .rscmd File 

You can execute all commands listed in a .rscmd file using the -execrscmd command.
The required parameter is the full path to the .rscmd file.

This command can be used:

In the Windows Command Prompt

In a .bat script

Inside another .rscmd file

Passing Arguments into a .rscmd File 

When using -execRSCMD , you can pass up to 10 arguments in addition to the required file path.
To reference these arguments inside the .rscmd file, use $(arg0) through $(arg9) .

Example: 

Run sample.bat to open RealityScan and call addFolder.rscmd , which adds images from D:\MyFolder\Images to the project.

Command Line 

sample.bat 

"C:\Program Files\Epic Games\RealityScan\RealityScan.exe" -execRSCMD D:\MyFolder\addFolder.rscmd "D:\MyFolder\Images"

"C:\Program Files\Epic Games\RealityScan\RealityScan.exe" -execRSCMD D:\MyFolder\addFolder.rscmd "D:\MyFolder\Images"

Copy full snippet (1 line long) 

Command Line 

addFolder.rscmd 

-addFolder $(arg1) 

-addFolder $(arg1) 
Copy full snippet (1 line long) 

Using RealityScan Functions and Variables 

You can use predefined RealityScan functions and variables within commands or .rscmd files.
These functions and variables are also available in the Reports – Basic Functions section.

The example below demonstrates a loop that creates three projects in sequence by loading, aligning, and saving data from separate folders:

Command Line 

$For( "i", 1, 1, 3,
-newScene
-addFolder D:\MyFolder\$(i)
-align
-setReconstructionRegionAuto
-calculatePreviewModel
-save D:\MyFolder\project_$(i).rsproj
) 

$For( "i", 1, 1, 3,
-newScene
-addFolder D:\MyFolder\$(i)
-align
-setReconstructionRegionAuto
-calculatePreviewModel
-save D:\MyFolder\project_$(i).rsproj
) 
Copy full snippet (8 lines long) 

  The variable i iterates over the right-open interval [1, 3) with a step of 1 .  

Global Variables 

You can also use these global variables inside your .rscmd scripts:

$(appRootDir) – Path to the RealityScan installation folder (commonly C:\Program Files\Epic Games\RealityScan).

$(appStartDir) – Path to the folder from which RealityScan.exe was launched (for example, the path to a .bat file that started it).

$(cmdStartDir) – Path to the folder containing the executed .rscmd file.

$(arg1) … $(arg9) – Variables passed to the -

execRSCMD command.

Always enclose these variables in quotes when using them as arguments. If a path contains spaces, it may otherwise be treated as multiple parameters (example: -addFolder $(cmdStartDir) ).

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Example Explained 

Executing Commands Listed in a .rscmd File 

Passing Arguments into a .rscmd File 

Using RealityScan Functions and Variables 

Global Variables
