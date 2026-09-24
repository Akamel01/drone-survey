<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/command-delegation
     http: 200
     fetched: 2026-09-19T01:49:50Z
     extracted from HTML; wording verbatim, layout lost -->

Command Delegation | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Command Delegation 

Command Delegation

Delegate commands to the RealityScan instances. 

On this page 

This tutorial introduces how to name running instances of RealityScan, delegate commands to them, and control their processes (pause, resume, abort, or check status) using the command-line interface.

Instance Naming 

RealityScan allows multiple   instances to run simultaneously. To open them, use the executable file located in the installation folder.

When working through the CLI, you can assign a name to each instance using the -setInstanceName command with the parameter instanceName . The instance name cannot contain spaces.

Example – set the instance name to RS1 :

Command Line 

RealityScan.exe -setInstanceName RS1 

RealityScan.exe -setInstanceName RS1 
Copy full snippet (1 line long) 

Delegation of Commands 

You can delegate a single command or a sequence of commands to an already opened instance of RealityScan using the -delegateTo command with two parameters:

instanceName

commandsDefinition

Instead of specifying the instance name, you can use the * symbol to delegate the command to the first active instance found.

Example 1 – add an image to the first opened instance of RealityScan:

Command Line 

RealityScan.exe -delegateTo * -add D:\\datasets\\test\\img001.JPG 

RealityScan.exe -delegateTo * -add D:\\datasets\\test\\img001.JPG 
Copy full snippet (1 line long) 

   Example 2 – add an image to the instance named RS1 :  

Command Line 

RealityScan.exe -delegateTo RS1 -add D:\\datasets\\test\\img001.JPG 

RealityScan.exe -delegateTo RS1 -add D:\\datasets\\test\\img001.JPG 
Copy full snippet (1 line long) 

   Example 3 – add every fifth image from a folder, align them, save the project, and quit the application:  

Command Line 

start RealityScan.exe
TIMEOUT 2
for /l %%A in (1,5,100) do (
RealityScan.exe -delegateTo * -add D:\\datasets\\test\\img%%A.JPG
)
RealityScan.exe -delegateTo * -align
RealityScan.exe -delegateTo * -save d:\\datasets\\test\\processed\\scene.rsproj
RealityScan.exe -delegateTo * -quit 

start RealityScan.exe
TIMEOUT 2
for /l %%A in (1,5,100) do (
RealityScan.exe -delegateTo * -add D:\\datasets\\test\\img%%A.JPG
)
RealityScan.exe -delegateTo * -align
RealityScan.exe -delegateTo * -save d:\\datasets\\test\\processed\\scene.rsproj
RealityScan.exe -delegateTo * -quit 
Copy full snippet (8 lines long) 

Waiting for Completion 

The -waitCompleted command pauses script execution until the current process in the specified instance is finished.
When used with instanceName or the asterisk ( * ) symbol, subsequent commands will run only after the referenced process has completed.

Example – run alignment in the first instance, wait for it to finish, then check the result:

Command Line 

...
RealityScan.exe -delegateTo * -align
RealityScan.exe -waitCompleted *
call CheckResult
... 

...
RealityScan.exe -delegateTo * -align
RealityScan.exe -waitCompleted *
call CheckResult
... 
Copy full snippet (5 lines long) 

Checking Instance Status 

Use the -getStatus command with instanceName (or * ) to display the progress of a running instance.

Example – retrieve the current status from instance RS1 :

Command Line 

RealityScan.exe -getStatus RS1 

RealityScan.exe -getStatus RS1 
Copy full snippet (1 line long) 

Result:

Console Output 

id:0x10001 progress:57.5% runtime:4.26sec endEstimation:3.40sec 

id:0x10001 progress:57.5% runtime:4.26sec endEstimation:3.40sec 
Copy full snippet (1 line long) 

You can also redirect the output of -getStatus to a text file:  

Command Line 

RealityScan.exe -getStatus * > D:\statusreport.txt 

RealityScan.exe -getStatus * > D:\statusreport.txt 
Copy full snippet (1 line long) 

Controlling Processes 

You can manage running processes in an opened instance using the following commands:

-pauseInstance

-unpauseInstance

-abortInstance

Each accepts the parameter instanceName (or * ).

These commands are especially useful when working on servers or render farms, allowing you to pause a process to prioritize another, resume it later, or terminate it completely.

Example – pause a process running in instance RS1 :

Command Line 

RealityScan.exe -pauseInstance RS1 

RealityScan.exe -pauseInstance RS1 
Copy full snippet (1 line long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Instance Naming 

Delegation of Commands 

Waiting for Completion 

Checking Instance Status 

Controlling Processes
