<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-localizationexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:22Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (LocalizationExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (LocalizationExportFunctionSet) 

Available Functions (LocalizationExportFunctionSet)

Functions available within LocalizationExportFunctionSet. 

On this page 

SetLocalization 

Sets the path to the file with localized strings (localization file).

Syntax: 

$SetLocalization( “filePath” ) 

Parameter | Type | Description | 

filePath 
| 
STRING
| 
Global path or a path relative to the work directory.
| 

Localize 

Searches for a string mapped to STRING_ID in a localization file. It outputs a found string, if it exists. Otherwise, it outputs defaultText .

Syntax: 

$Localize( “STRING_ID”, “defaultText” ) 

Parameter | Type | Description | 

STRING_ID
| 
STRING
| 
Identifier of the string from the localization file.
| 

defaultText 
| 
STRING
| 
Default text displayed if the localized string is not found.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

SetLocalization 

Localize
