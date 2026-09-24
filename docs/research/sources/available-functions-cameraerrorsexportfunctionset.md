<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-cameraerrorsexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:14Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (CameraErrorsExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (CameraErrorsExportFunctionSet) 

Available Functions (CameraErrorsExportFunctionSet)

Functions available in the CameraErrorsExportFunctionSet set. 

On this page 

CameraErrors 

This function outputs information about camera errors and track lengths. 

The output is generated only if cameraIndex represents a valid camera index.  

Syntax: 

$CameraErrors ( cameraIndex, anyText ) 

Parameter | Type | Description | 

  cameraIndex 
| 
INT
| 
An index of a camera in the selected component. Use the IterateCameras function to obtain the indexes of all cameras registered in the selected component (see the example below).  
| 

Available Variables 

Variable | Type | Description | 

numPoints 
| 
UINT
| 
Number of tie points detected in the image.
| 

imageCoverage 
| 
UINT
| 
Percentage of the image area covered by tie points.
| 

Available Functions 

Functions available under the function  CameraErrors .

ReprojectionError 

Returns the reprojection error, the difference in pixels between the position of a point in an image and the projection of its corresponding 3D point onto the same image. The ReprojectionError type uses parameters <16, 0, 2> representing DistributionSize , minValue , and maxValue .  

Syntax: 

$ReprojectionError(noParametersJustAnyText) 

Available Variables 

Variable | Type | Description | 

min
| 
DOUBLE
| 
The minimal reprojection error, representing the smallest value among all point projection errors.
| 

max
| 
DOUBLE     
| 
The maximal reprojection error, representing the largest value among all point projection errors.
| 

mean
| 
DOUBLE
| 
The average value of all reprojection errors.
| 

stdev
| 
DOUBLE
| 
The standard deviation of the reprojection errors.
| 

median
| 
DOUBLE
| 
The middle value of all reprojection errors, indicating that half of the errors are smaller and half are larger (as defined in statistics).
| 

mode
| 
DOUBLE
| 
The most frequently occurring reprojection error.
| 

minDistBin
| 
DOUBLE
| 
Always zero, since negative reprojection errors cannot occur.
| 

maxDistBin
| 
DOUBLE
| 
Number of tie points with a reprojection error equal to or greater than 16.
| 

distributionSize      
| 
UINT
| 
A constant value set to 16.
| 

Available Functions 

Functions available under the function ReprojectionError .

Distribution 

Calculates and outputs the distribution of tie points according to their reprojection error values.

Syntax: 

Syntax: $Distribution( i, anyText ) 

Parameter | Type | Description | 

i
| 
INT
| 
The lower bound of the projection error interval being evaluated.
| 

Available variables: 

Variable | Type | Description | 

ithValue 
| 
DOUBLE / STRING
| 
Number of tie points with a projection error greater than or equal to i and less than i + 1 . Note that a single tie point can have parts with different projection errors, so the ithValue variable can be a decimal. If the number i is out of range, its value is "N/A" ; otherwise, it holds a numerical value.  
| 

TrackingError 

Statistics showing how many tie points of a camera are visible in 0, 1, 2, …, 15 other cameras. The TrackingError type uses parameters <16, 0, 15> representing DistributionSize , minValue , and maxValue .  

Syntax: 

$TrackingError( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

min
| 
DOUBLE
| 
Should always be one or more, since each tie point must be visible by at least two cameras.
| 

max
| 
DOUBLE     
| 
The maximum number of cameras that can see a tie point is max + 1 .  
| 

mean
| 
DOUBLE
| 
The average number of cameras that can see a tie point.
| 

stdev
| 
DOUBLE
| 
The standard deviation of the number of cameras that can see a tie point.
| 

median
| 
DOUBLE
| 
The median number of cameras that can see a tie point.
| 

mode
| 
DOUBLE
| 
The most frequent number of cameras that can see a tie point.
| 

minDistBin
| 
DOUBLE
| 
Always zero, as there cannot be a tie point visible by zero cameras.
| 

maxDistBin
| 
DOUBLE
| 
Number of tie points visible by 17 or more cameras.
| 

distributionSize      
| 
UINT
| 
A constant value set to 16.
| 

Available Functions 

Functions available under the function TrackingError.

Distribution 

Calculates and outputs the distribution of tie points based on their visibility across cameras.

Syntax: 

$Distribution( i, anyText ) 

Parameter | Type | Description | 

i
| 
INT
| 
The index of the distribution bin, representing one less than the number of cameras in which the tie points are visible.
| 

Available variables: 

Variable | Type | Description | 

ithValue 
| 
DOUBLE / STRING
| 
A number of tie points visible by i + 1 camera. 

If the number  i  is out of range, its value is "N/A"; otherwise, it holds a numerical value.   
| 

Example 

paRSer 

$IterateCameras(
$CameraErrors( cameraIndex,

Number of tie points in image: $(numPoints)
Percentage of image covered with tie points: $(imageCoverage)%

ReprojectionError:
$ReprojectionError(
min: $(min), max: $(max), mean: $(mean), stdev: $(stdev), median: $(median), mode: $(mode), minDistBin: $(minDistBin), maxDistBin: $(maxDistBin)
distribution: [

Copy full snippet (27 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

CameraErrors 

Available Variables 

Available Functions 

ReprojectionError 

Available Variables 

Available Functions 

Distribution 

TrackingError 

Available Variables 

Available Functions 

Distribution 

Example
