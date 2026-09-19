<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/installation-linux
     http: 200
     fetched: 2026-09-19T01:51:29Z
     extracted from HTML; wording verbatim, layout lost -->

Installation (Linux) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Installation and Use (Linux) 

Installation and Use (Linux)

Find out how to install and run RealityScan on Linux. 

On this page 

Package Installation 

RealityScan Linux is distributed as:

.deb packages for Debian/Ubuntu

.rpm packages for Fedora/RHEL/Rocky

Download installation packages here .

Debian/Ubuntu Installation 

Download the  .deb  package and run:

Command Line 

sudo apt install ~/Downloads/<your-new-realityscan-version>.deb 

sudo apt install ~/Downloads/<your-new-realityscan-version>.deb 
Copy full snippet (1 line long) 

RealityScan installs under  /opt/realityscan .  

RPM Installation 

For Fedora/RHEL‑based systems:

Command Line 

sudo rpm install ~/Downloads/<your-new-realityscan-version>.rpm 

sudo rpm install ~/Downloads/<your-new-realityscan-version>.rpm 
Copy full snippet (1 line long) 

File Layout 

Executables: /opt/realityscan/bin/ 

Wine prefix: ~/.realityscan/realityscan/ 

Windows path (inside Wine):
C:\Program Files\Epic Games\RealityScan\RealityScan.exe 

Running RealityScan 

RealityScan Linux includes a launcher script:

/opt/realityscan/bin/run_app 

The UI is available for troubleshooting only; for production workflows, use the CLI .  

CLI Usage 

RealityScan supports the same command-based pipeline as the Windows version.

Commands are passed directly to the executable inside the Wine container.

General format: 

Command Line 

realityscan-cli "<path-to-RealityScan.exe>" -command1 -command2 "arg" -command3 ... 

realityscan-cli "<path-to-RealityScan.exe>" -command1 -command2 "arg" -command3 ... 
Copy full snippet (1 line long) 

Executable path (Wine): 

  "/opt/realityscan/support/realityscan/drive_c/Program Files/Epic Games/RealityScan/RealityScan.exe" 

Example 

The following example aligns a folder of images, generates a normal‑detail model, textures it, saves a project, and exports a textured FBX.

Command Line 

realityscan-cli" \
-newScene \
-addFolder "Z:\mnt\c\Users\<username>\Downloads\Project\Images" \
-align \
-selectMaximalComponent \
-setReconstructionRegionAuto \
-calculateNormalModel \
-calculateTexture \
-save "Z:\mnt\c\Users\<username>\Downloads\Project\result.rsproj" \
-exportModel "Model 1" "Z:\mnt\c\Users\<username>\Downloads\Project\model.fbx" "Z:\mnt\c\Users\<username>\Downloads\Project\export.xml" \

Expand code Copy full snippet (11 lines long) 

-exportModel requires two parameters — the model name and the path to an export-parameter XML file.  

Parameter Files 

Use the RealityScan UI (Windows or Linux Wine) to create and save an XML file containing export parameters and settings. This file can then be referenced and reused in CLI commands.

Wine Tools 

RealityScan Linux bundles an isolated Wine environment.
Useful commands include:

Action | Command | 

Run batch files
| 
/opt/realityscan/bin/wine start your.bat
| 

Reset RealityScan
| 
realityscan-cli -reset all
| 

Open Wine Task Manager
| 
/opt/realityscan/bin/wine --bottle=default taskmgr
| 

Configure Wine
| 
WINEPREFIX=/home/<username>/.realityscan/realityscan /opt/realityscan/bin/wine winecfg
| 

Delegated Commands 

RealityScan supports command delegation between instances.

Example: 

Command Line 

realityscan-cli -delegateTo \* \ -addFolder "Z:\Documents\Projects\Sample" 

realityscan-cli -delegateTo \* \ -addFolder "Z:\Documents\Projects\Sample" 
Copy full snippet (1 line long) 

Delegation is particularly useful when integrating with the Remote Command Plugin .  

Remote Command Plugin Integration 

RealityScan Linux functions as a backend processor for the Remote Command Plugin , allowing remote control, job distribution, and automation.

Supported communication methods: 

gRPC

REST

See the Remote Command Plugin documentation for configuration and usage.

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Package Installation 

Debian/Ubuntu Installation 

RPM Installation 

File Layout 

Running RealityScan 

CLI Usage 

Example 

Parameter Files 

Wine Tools 

Delegated Commands 

Remote Command Plugin Integration
