<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/error-handling-and-logging
     http: 200
     fetched: 2026-09-19T01:49:53Z
     extracted from HTML; wording verbatim, layout lost -->

Error Handling and Logging | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Error Handling and Logging 

Error Handling and Logging

Error Handling and Logging 

On this page 

With the following commands and settings you can handle potential errors occurring during the application command-line processing.

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

The following keys and values allow you to manage potential errors that may occur during command-line processing.

Name | Key | Value | Default | 

Quit on error
| 
appQuitOnError  
| 
true

false
| 
false
| 

Quit on required restart  
| 
appQuitOnReset  
| 
true

false
| 
false
| 

Suppress error messages  
| 
suppressErrors  
| 
true

false
| 
false
| 

Minimal process duration
| 
appProcessActionTime
| 
number (integer)
| 
15
| 

Action
| 
appProcessAction
| 
None

PlaySound

ExecuteProgram
| 
None
| 

Command-line process ( relevant for "appProcessAction=ExecuteProgram" )
| 
appProcessExecCmd
| 
text (string)
| | 

Examples 

Silent Crash Report 

Command Line 

RealityScan.exe -silent c:\\CrashReportFolder ^
-set "appQuitOnError=true" ^
-set "appProcessActionTime=0" ^
-set "appProcessAction=ExecuteProgram" ^
-set "appProcessExecCmd=c:\\MyScripts\\ErrorWriter.bat $(processResult) $(processId) $(processDuration:d) c:\\ErrorReportFolder\\ErrorReport.txt" 

RealityScan.exe -silent c:\\CrashReportFolder ^
-set "appQuitOnError=true" ^
-set "appProcessActionTime=0" ^
-set "appProcessAction=ExecuteProgram" ^
-set "appProcessExecCmd=c:\\MyScripts\\ErrorWriter.bat $(processResult) $(processId) $(processDuration:d) c:\\ErrorReportFolder\\ErrorReport.txt" 
Copy full snippet (5 lines long) 

The -silent command with the parameter c:\CrashReportFolder redirects crash report minidumps to the specified folder.

Setting appQuitOnError to True makes the application automatically quit whenever an error occurs.

When appProcessActionTime is set to 0 , it indicates interest in all processes lasting at least zero seconds—effectively, in every process. Setting appProcessAction to 2 defines the action to Execute a program . The appProcessExecCmd key specifies the command to run, in this case a batch script ErrorWriter.bat , with its full path
c:\MyScripts\ErrorWriter.bat and input parameters
$(processResult) $(processId) $(processDuration:d) c:\ErrorReportFolder\ErrorReport.txt .

Together, these three settings mean that if a process runs longer than the minimum defined time (0 seconds), the application executes ErrorWriter.bat .

You can use output values from the application as input parameters for the executed program, for example:

processResult – a numeric value representing the result of the process (0 indicates success)

processId – the process ID

processDuration:d – the duration of the process

You can also add your own parameters (for example, c:\ErrorReportFolder\ErrorReport.txt ) to pass additional information to the script, such as the name and path of a text file where detected errors are logged.

Here is a simple example of a short batch script ErrorWriter.bat:

Command Line 

if /i "%1" NEQ "0" ( 
if /i "%1" NEQ "1" ( 
echo An error occured by process %2 which finished with result code %1 in %3 seconds. > %4 
) 
) 

if /i "%1" NEQ "0" ( 
if /i "%1" NEQ "1" ( 
echo An error occured by process %2 which finished with result code %1 in %3 seconds. > %4 
) 
) 
Copy full snippet (5 lines long) 

Where %1 , %2 , %3 , and %4 represent the input parameters $(processResult) , $(processId) , $(processDuration:d) , and c:\ErrorReportFolder\ErrorReport.txt , respectively.

This script checks the value of the processResult parameter. If the value is not 0 , it indicates that the process has finished with an error, and the script writes a brief report to the output file ErrorReport.txt .

Command Line 

An error occurred by process 20599 which finished with result code 2181038335 in 0 seconds. 

An error occurred by process 20599 which finished with result code 2181038335 in 0 seconds. 
Copy full snippet (1 line long) 

Exit Code 

When the RealityScan process finishes successfully, the application returns an exit code of 0 , which can be viewed in the Windows Command Prompt.

If the process finishes with an error, the application returns the decimal code of the specific error , provided that the command -set "appQuitOnError=true" is used.

If the process crashes and generates a minidump , the application returns an exit code of 3 .

Example: 

Command Line 

RealityScan.exe -silent c:\\CrashReportFolder ^
-set "appQuitOnError=true"
…
echo RealityScan.exe returned with %errorlevel%. 

RealityScan.exe -silent c:\\CrashReportFolder ^
-set "appQuitOnError=true"
…
echo RealityScan.exe returned with %errorlevel%. 
Copy full snippet (4 lines long) 

Example of the result in case of red error:

Example of the result in case of crash with minidump:

Quit on Restart 

Some application settings require a restart after being changed. In such cases, you can use the -set command with the key appQuitOnReset set to True to suppress the restart dialog.

Note: When this key is used and one of the affected settings is changed, the application will quit automatically .

The following example demonstrates how to change the cache directory to a custom location and then open a new scene:

Command Line 

RealityScan.exe -set "appQuitOnReset=true" ^
-set "appCacheLocation=Custom"
RealityScan.exe -set "appQuitOnReset=true" ^
-set "appCacheCustomLocation=D:\cr-tmp"
RealityScan.exe -newScene 

RealityScan.exe -set "appQuitOnReset=true" ^
-set "appCacheLocation=Custom"
RealityScan.exe -set "appQuitOnReset=true" ^
-set "appCacheCustomLocation=D:\cr-tmp"
RealityScan.exe -newScene 
Copy full snippet (5 lines long) 

Progress Monitoring 

The -writeProgress command allows you to record progress information to a specified file ( fileName ) at defined time intervals ( timeout ).

The generated file contains the following five columns:

algId – Process ID

progress – A value in the range <0, 1> indicating the current progress stage

duration – Elapsed time in seconds

estimation – Estimated remaining time in seconds

eventType – Type of event that generated the record (started, progress, timeout, completed)

Command Line 

20561 0.00 0.04 404.08 #started
20561 0.45 0.10 0.22 #progress
20561 0.85 14.76 3.26 #progress
20561 0.90 15.04 1.70 #progress
20561 0.91 16.18 1.76 #progress
20561 0.94 16.72 1.82 #progress
20561 0.96 16.78 1.42 #progress
20561 0.97 17.06 0.55 #progress
20561 1.00 17.10 0.10 #progress
20561 1.00 17.13 0.00 #completed 

20561 0.00 0.04 404.08 #started
20561 0.45 0.10 0.22 #progress
20561 0.85 14.76 3.26 #progress
20561 0.90 15.04 1.70 #progress
20561 0.91 16.18 1.76 #progress
20561 0.94 16.72 1.82 #progress
20561 0.96 16.78 1.42 #progress
20561 0.97 17.06 0.55 #progress
20561 1.00 17.10 0.10 #progress
20561 1.00 17.13 0.00 #completed 
Copy full snippet (10 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Examples 

Silent Crash Report 

Exit Code 

Quit on Restart 

Progress Monitoring
