<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-sfmhistogramexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:51Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (SfmHistogramExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (SfmHistogramExportFunctionSet) 

Available Functions (SfmHistogramExportFunctionSet)

Functions available within SfmHistogramExportFunctionSet. 

On this page 

TiePointsHistogram 

Outputs a histogram of maximal tie point errors. For each tie point, it records the highest projection error among all images where the point is projected, measured in pixels.

Syntax: 

$TiePointsHistogram( componentGuid, stepSize, stepCount, anyText ) 

Parameter | Type | Description | 

componentGuid
| 
STRING
| 
GUID of the component. Use the IterateComponents function to obtain GUIDs of all components (see the example below).  
| 

stepSize
| 
UINT
| 
Size of a step (bin size), specified as a positive double value.
| 

stepCount
| 
UINT
| 
Number of steps (bins) used in the histogram.
| 

Available Variables 

| | | 

histTotalSum
| 
UINT
| 
Total number of tie points with a projection error in the interval [ 0 , stepSize × stepCount ).
| 

histMaxCount
| 
UINT
| 
Maximum histCount value among all steps (same across all steps).
| 

histMinValue
| 
DOUBLE
| 
Minimum value of the histogram on the vertical axis.
| 

histMaxValue
| 
DOUBLE
| 
Maximum value of the histogram on the vertical axis.
| 

histStepCount
| 
UINT
| 
Number of steps (bins) defined for the histogram.
| 

histIndex
| 
UINT
| 
Index of the current step (starting from 0 ; the last step has index stepCount – 1 ).
| 

histCount
| 
UINT
| 
Number of tie points with a projection error in the interval [ histValue – stepSize , histValue ).
| 

histValue
| 
DOUBLE
| 
Upper bound of the current interval; projection errors of tie points in this step are ≥ histValue – stepSize and < histValue .
| 

histCumsum
| 
UINT
| 
Cumulative sum of histCount values from the first to the current step. Equals histTotalSum by the last step.
| 

Example 

paRSer 

$IterateComponents(
$TiePointsHistogram( "$(componentGUID)", 0.5, 5,
Total sum: $(histTotalSum)
Index: $(histIndex)
Count: $(histCount)
Upper bound value: $(histValue)
Cumulative sum: $(histCumsum)
Max count: $(histMaxCount)
)
) 

$IterateComponents(
$TiePointsHistogram( "$(componentGUID)", 0.5, 5,
Total sum: $(histTotalSum)
Index: $(histIndex)
Count: $(histCount)
Upper bound value: $(histValue)
Cumulative sum: $(histCumsum)
Max count: $(histMaxCount)
)
) 
Copy full snippet (10 lines long) 

TracksStats 

Outputs a histogram of tie point track lengths, showing the distribution of how many images each tie point is visible in.

Syntax: 

$TracksStats(componentGuid, step, stepCount, anyText) 

Parameter | Type | Description | 

componentGuid
| 
STRING
| 
GUID of the component. Use the IterateComponents function to obtain GUIDs of all components (see the example below).  
| 

stepSize
| 
UINT
| 
Size of a step (bin size), specified as a positive double value.
| 

stepCount
| 
UINT
| 
Number of steps (bins) used in the histogram.
| 

Available Variables 

| | | 

histTotalSum
| 
UINT
| 
Total number of tie points with a projection error in the interval [ 0 , stepSize × stepCount ).
| 

histMaxCount
| 
UINT
| 
Maximum histCount value among all steps (same across all steps).
| 

histMinValue
| 
DOUBLE
| 
Minimum value of the histogram on the vertical axis.
| 

histMaxValue
| 
DOUBLE
| 
Maximum value of the histogram on the vertical axis.
| 

histStepCount
| 
UINT
| 
Number of steps (bins) defined for the histogram.
| 

histIndex
| 
UINT
| 
Index of the current step (starting from 0 ; the last step has index stepCount – 1 ).
| 

histCount
| 
UINT
| 
Number of tie points with a projection error in the interval [ histValue – stepSize , histValue ).
| 

histValue
| 
DOUBLE
| 
Upper bound of the current interval; projection errors of tie points in this step are ≥ histValue – stepSize and < histValue .
| 

histCumsum
| 
UINT
| 
Cumulative sum of histCount values from the first to the current step. Equals histTotalSum by the last step.
| 

Example 

paRSer 

$IterateComponents(
$TracksStats( "$(componentGUID)", 1, 17,
Total sum: $(histTotalSum)
Index: $(histIndex)
Count: $(histCount)
Upper bound value: $(histValue)
Cumulative sum: $(histCumsum)
Max count: $(histMaxCount)
)
) 

$IterateComponents(
$TracksStats( "$(componentGUID)", 1, 17,
Total sum: $(histTotalSum)
Index: $(histIndex)
Count: $(histCount)
Upper bound value: $(histValue)
Cumulative sum: $(histCumsum)
Max count: $(histMaxCount)
)
) 
Copy full snippet (10 lines long) 

CreateHistogram 

Generates an empty histogram divided into a specified number of bins ( steps ). Each bin represents an interval with a size of 1 / ((maxValue - minValue) * steps) and initially contains zero elements.  

Syntax: 

$CreateHistogram(minValue, steps, maxValue, anyText) 

Parameter | Type | Description | 

minValue 
| 
DOUBLE
| 
Lower bound of the first class (minimum value of the histogram).
| 

steps 
| 
UINT
| 
Number of intervals (bins) in the histogram.
| 

maxValue 
| 
DOUBLE
| 
Upper bound of the last class (maximum value of the histogram).
| 

Available Functions 

Functions available under the  CreateHistogram   feature.

AddData 

Finds the corresponding interval (bin) for each value and increments the count of elements within that bin. Values lower than minValue are counted in the first bin, while values higher than maxValue are counted in the last bin.

Syntax: 

$AddData( num1, num2, ..., numN ) 

Parameter | Type | Description | 

num1, num2, ..., numN
| 
DOUBLE
| 
Numerical values.
| 

IterateHistogramBins 

Iterates through all bins of the histogram and extract information about them

Syntax: 

$IterateHistogramBins( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

histTotalSum 
| 
UINT
| 
Sum of all values across all bins.
| 

histMaxCount 
| 
UINT
| 
Maximum histCount among all bins (same in every iteration).
| 

histMinValue 
| 
DOUBLE
| 
Minimum value of the histogram on the vertical axis.
| 

histMaxValue 
| 
DOUBLE
| 
Maximum value of the histogram on the vertical axis.
| 

histStepCount 
| 
UINT
| 
Number of steps (bins) defined for the histogram.
| 

histIndex
| 
UINT
| 
Index of the current bin.
| 

histCount 
| 
UINT
| 
Number of values within the interval ( histValue – step size , histValue ).
| 

histValue 
| 
DOUBLE
| 
Upper bound of the current interval.
| 

histCumsum 
| 
UINT
| 
Cumulative sum of histCount from the first bin up to the current one. Equals histTotalSum by the final bin.
| 

GetHistogramStats 

Extracts information on the histogram.

Syntax: 

$GetHistogramStats( noParametersJustAnyText ) 

Available Variables 

Variable | Type | Description | 

histTotalSum 
| 
UINT
| 
Sum of values contained in all bins.
| 

histMaxCount 
| 
UINT
| 
Maximum histCount value among all steps (same in every step).
| 

histMaxValue 
| 
DOUBLE
| 
Minimum value of the histogram on the vertical axis.
| 

histMaxValue
| 
DOUBLE
| 
Maximum value of the histogram on the vertical axis.
| 

histStepCount 
| 
UINT
| 
Number of steps (bins) defined for the histogram.
| 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

TiePointsHistogram 

Available Variables 

Example 

TracksStats 

Available Variables 

Example 

CreateHistogram 

Available Functions 

AddData 

IterateHistogramBins 

Available Variables 

GetHistogramStats 

Available Variables
