<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/custom-command-macros
     http: 200
     fetched: 2026-09-19T01:49:52Z
     extracted from HTML; wording verbatim, layout lost -->

Custom Command Macros | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Custom Command Macros 

Custom Command Macros

Create custom CLI command macros and use them from the user interface. 

On this page 

In addition to displaying progress, the Console view allows you to execute CLI commands directly from the RealityScan interface or to create and save command sequences to create macros.

Using CLI Commands in the Console View 

Using CLI commands in the Console view works the same way as in the Command Prompt , .rscmd files, or batch scripts .
Start each command with a hyphen (-) , then write the command followed by any required and/or optional parameters in the command text field at the bottom of the Console view.

After typing a command or a sequence of commands, press ENTER to execute it.

If you cannot recall the exact command name, you can type the beginning of the command and press TAB to cycle through matching commands. For example, typing -select and pressing TAB will toggle through all commands starting with that prefix. In the example below, the -selectImage command was found this way.

When a command is entered, a tooltip appears showing all variations of that command, along with its required and optional parameters.

If your command includes path parameters (e.g., paths to files or folders), use the following shortcuts to insert them easily:

CTRL + ENTER – Opens a Windows File Explorer to select a file.

CTRL + SHIFT + ENTER – Opens a File Explorer to select a folder.

You can also browse through previously used commands using the UP and DOWN arrow keys.
Commands are stored chronologically, allowing you to quickly reuse or edit recent commands.

Add Command Button 

Commands entered in the Console view can be saved as command buttons , accessible from the Commands section in the WORKFLOW tab.  

To create a command button:

Click Add in the Commands section.
This opens the Console view with the command text field already active.

Write your command or command sequence.

Click the Add button to confirm.

This opens the Add Command Button window, where you can name your new command button.
All saved command buttons appear in the Commands section of the WORKFLOW tab. To run a saved command sequence, simply click its button.  

To remove a command button:

Click Remove in the Commands section.

In the Remove Command Button window, select the button to remove from the dropdown list.

Click OK to confirm.

Command buttons are linked to the RealityScan application , not to a specific project.
This means all saved command buttons are available across any project and any instance of RealityScan.  

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Using CLI Commands in the Console View 

Add Command Button
