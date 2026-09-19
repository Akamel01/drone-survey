<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-configexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:16Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (ConfigExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (ConfigExportFunctionSet) 

Available Functions (ConfigExportFunctionSet)

All functions available within the ConfigExportFunctionSet set. 

On this page 

GetProperty 

Outputs the value of the variable from the configuration. If the variable does not exist, it outputs the default value if defined; otherwise, it outputs the string "NUL" .  

Syntax: 

$GetProperty( "variable", "string_default"/numeral_default) 
or 
$GetProperty("variable") 

SetProperty 

Set the variable (configuration parameter) to the specified value.

Syntax: 

$SetProperty( "variable", "string_value"/numeral_value)  

ResetProperty 

Removed the value of the specified variable (configuration parameter).

Syntax: 

$ResetProperty( "variable" )  

The " variable"  parameters represent the names of configuration settings. These names can be viewed by exporting the settings as an XML file.  

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

GetProperty 

SetProperty 

ResetProperty
