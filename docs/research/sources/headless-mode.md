<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/headless-mode
     http: 200
     fetched: 2026-09-19T01:49:53Z
     extracted from HTML; wording verbatim, layout lost -->

Headless Mode | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Headless Mode 

Headless Mode

Use RealityScan in the headless mode to hide the user interface while processing. 

On this page 

When using the command line to operate RealityScan, the user interface is normally displayed. Headless mode allows you to hide the interface, displaying only an icon in the Windows system tray instead.  

Usage 

To enable headless mode, add the -headless command after the RealityScan executable:  

Command Line 

"C:\Program Files\Epic Games\RealityScan\RealityScan.exe" -headless 

"C:\Program Files\Epic Games\RealityScan\RealityScan.exe" -headless 
Copy full snippet (1 line long) 

Multiple icons may appear in the system tray, depending on the number of RealityScan instances running. Each icon displays the instance number.

Once -headless is used, RealityScan continues to run without displaying the user interface. Other commands can still be executed, but in some cases, RealityScan may temporarily return from headless mode when:

User interaction is required

A pop-up window appears

An error message is displayed

Most of these interruptions can be suppressed by using the  -silent  or  -set "appQuitOnError=true"  options, but certain dialogs (e.g., the login window) will still require user interaction.

Menu 

Right-click the RealityScan system tray icon to open a small menu with the following options:

Show App – Toggles the user interface visibility. Turning it off activates headless mode.

About – Displays information about RealityScan and the current user account.

Exit – Closes RealityScan.

Progress Statuses 

The RealityScan system tray icon also provides visual feedback about the current processing status.

Ongoing Process 

When a process is running, a blue line moves clockwise around the icon, indicating progress. A full circle means the process is complete.

Paused Process 

If a process is paused, the background of the icon turns yellow .

Error Occurs 

If an error occurs during processing, the icon’s background turns red .

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Usage 

Menu 

Progress Statuses 

Ongoing Process 

Paused Process 

Error Occurs
