<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-expression-functions-mapexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:23Z
     extracted from HTML; wording verbatim, layout lost -->

Available Expression Functions (MapExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Expression Functions (MapExportFunctionSet) 

Available Expression Functions (MapExportFunctionSet)

Expression functions available within MapExportFunctionSet. 

On this page 

MapProviderCredentialsAreValid 

Returns a BOOL value ( true or false ). If the map provider is valid, the function returns true .  

Syntax: 

MapProviderCredentialsAreValid( mapSourceIndex or “mapSourceName” ) 

Parameter | Type | Description | 

mapSourceIndex       

or                             

mapSourceName                 
| 
INT             

or                        

STRING                       
| 
ID value or full name of the map provider, as defined in mapproviders.xml located in the installation folder.
| 

MapProviderCredentialsAreNeeded 

Returns a BOOL value (true or false). If credentials are needed, the function returns true .

Syntax: 

MapProviderCredentialsAreNeeded( mapSourceIndex or “mapSourceName” ) 

Parameter | Type | Description | 

mapSourceIndex       

or                             

mapSourceName                 
| 
INT             

or                        

STRING                       
| 
ID value or full name of the map provider, as defined in mapproviders.xml located in the installation folder.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

MapProviderCredentialsAreValid 

MapProviderCredentialsAreNeeded
