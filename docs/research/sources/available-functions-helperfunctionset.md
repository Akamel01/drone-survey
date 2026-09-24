<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-helperfunctionset
     http: 200
     fetched: 2026-09-19T01:50:20Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (HelperFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (HelperFunctionSet) 

Available Functions (HelperFunctionSet)

Functions available within HelperFunctionSet. 

On this page 

ToGpsLat 

Converts a latitude value from decimal degrees to degrees, minutes, and seconds format.

Syntax: 

$ToGpsLat( decimalDegrees )

Parameter | Type | Description | 

decimalDegrees 
| 
INTEGER / DOUBLE
| 
Value in degrees.
| 

Example 

paRSer 

$ToGpsLat( 45.333333 ) 

$ToGpsLat( 45.333333 ) 
Copy full snippet (1 line long) 

ToGpsLon 

Converts a longitude value from decimal degrees to degrees, minutes, and seconds format.

Syntax: 

$ToGpsLon( decimalDegrees ) 

Parameter | Type | Description | 

decimalDegrees 
| 
INTEGER / DOUBLE
| 
Value in degrees.
| 

Example 

paRSer 

$ToGpsLon( 45.333333 ) 

$ToGpsLon( 45.333333 ) 
Copy full snippet (1 line long) 

ToDMS 

Converts an input value in degrees to degrees, minutes, and seconds format.

Syntax: 

$ToDMS( inputDegrees, anyText ) 

Parameter | Type | Description | 

inputDegrees
| 
INTEGER / DOUBLE
| 
Value in degrees.
| 

Available Variables 

Parameter | Type | Description | 

positiveHemisphere 
| 
BOOL
| 
True if inputDegrees is positive; otherwise false.
| 

degrees 
| 
UINT
| 
Use $(degrees:.6) to output the integer part of the degrees value.
| 

minutes 
| 
UINT
| 
Use $(minutes:.6) to output the integer part of the minutes value.
| 

seconds 
| 
DOUBLE
| 
Use $(seconds:.6) to output the seconds value.
| 

Example 

paRSer 

$ExportControlPoints(
$If( "$(inputCSIsLatLon)" == "true",
lat: $ToDMS( actualLat, $(degrees:.6)° $(minutes:.6)' $(seconds:.6)'' $If( positiveHemisphere, N ) $If( positiveHemisphere == false, S ) )
lon: $ToDMS( actualLon, $(degrees:.6)° $(minutes:.6)' $(seconds:.6)'' $If( positiveHemisphere, E ) $If( positiveHemisphere == false, W ) )
alt: $(actualAlt) $(unitsShort)
)
) 

$ExportControlPoints(
$If( "$(inputCSIsLatLon)" == "true",
lat: $ToDMS( actualLat, $(degrees:.6)° $(minutes:.6)' $(seconds:.6)'' $If( positiveHemisphere, N ) $If( positiveHemisphere == false, S ) )
lon: $ToDMS( actualLon, $(degrees:.6)° $(minutes:.6)' $(seconds:.6)'' $If( positiveHemisphere, E ) $If( positiveHemisphere == false, W ) )
alt: $(actualAlt) $(unitsShort)
)
) 
Copy full snippet (7 lines long) 

FormatTime 

Converts a time value from seconds to the format " dd hh:mm:ss ".

Syntax: 

$FormatTime( seconds ) 

Parameter | Type | Description | 

seconds
| 
DOUBLE
| 
Time value in seconds.
| 

Example 

paRSer 

$FormatTime( 50000 ) 

$FormatTime( 50000 ) 
Copy full snippet (1 line long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

ToGpsLat 

Example 

ToGpsLon 

Example 

ToDMS 

Available Variables 

Example 

FormatTime 

Example
