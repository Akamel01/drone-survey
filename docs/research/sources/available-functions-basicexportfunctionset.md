<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-basicexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:13Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (BasicExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (BasicExportFunctionSet) 

Available Functions (BasicExportFunctionSet)

Functions available in the BasicExportFunctionSet set. 

On this page 

WriteFile 

This function saves the specified text to a file. If the file does not exist, it will be created automatically.

Syntax: 

$WriteFile( "filePath", anyText ) 

Parameter | Type | Description | 

filePath
| 
STRING
| 
Path relative to the attachments folder, or a path in the format global://globalPathToFile .  
| 

CopyFile 

This function copies a file to the specified directory. 

Syntax: 

$CopyFile( "srcFilePath", "dstFilePath" ) 

Parameter | Type | Description | 

srcFilePath 
| 
STRING
| 
Path of the file to be copied relative to the attachments folder, or a path in the format global://globalPathToFile .  
| 

dstFilePath
| 
STRING
| 
Path of the copied file relative to the attachments folder, or a path in the format  global://globalPathToFile .  
| 

ImportFile 

This function copies a file to the specified directory.

Syntax: 

$ImportFile( "srcFilePath", "dstFilePath" )  

Parameter | Type | Description | 

srcFilePath 
| 
STRING
| 
Global path or path relative to the work folder.
| 

dstFilePath
| 
STRING
| 
Path of the copied file relative to the attachments folder, or a path in the format  global://globalPathToFile .  
| 

Ifdef 

This function outputs the specified text only if the input variable is defined.

Syntax: 

$Ifdef( variable, anyText ) 

Example: 

paRSer 

$Ifdef( dateTime, $(dateTime) ) 

$Ifdef( dateTime, $(dateTime) ) 
Copy full snippet (1 line long) 

Ifndef 

This function outputs the specified text only if the input variable is not defined.

Syntax: 

$Ifndef( variable, anyText ) 

Example: 

paRSer 

$Ifndef( dateTime, dateTime variable is not defined ) 

$Ifndef( dateTime, dateTime variable is not defined ) 
Copy full snippet (1 line long) 

If 

Outputs the specified text only if the condition is met using numerical and logical expressions.

Syntax: 

$If( expression operator expression, anyText ) 

Example: 

paRSer 

$If( 1 > 0, One is more than zero. )
$If( 1, One is more than zero. )
$If( isGeoreferenced == 1, The selected component is georeferenced. )
$If( "$(units)" == "meter", The measurement unit of the selected component is meter. ) 

$If( 1 > 0, One is more than zero. )
$If( 1, One is more than zero. )
$If( isGeoreferenced == 1, The selected component is georeferenced. )
$If( "$(units)" == "meter", The measurement unit of the selected component is meter. ) 
Copy full snippet (4 lines long) 

For 

Allows the enclosed code to be executed repeatedly.

Syntax: 

$For( "iteratorVariable", start, step, end, anyText ) 

| | 

iteratorVariable
| 
Variable that holds the current iteration index, taking values from the right-open interval [start, end) with increments or decrements defined by step.
| 

start
| 
Starting value of the iteratorVariable.
| 

step
| 
Value by which the iteratorVariable is incremented or decremented in each loop iteration.
| 

end
| 
Value at which the loop stops when the iteratorVariable reaches it .
| 

Example: 

paRSer 

$For( "cameraIndex", 0, 1, cameraCount,
cameraIndex: $(cameraIndex),
) 

$For( "cameraIndex", 0, 1, cameraCount,
cameraIndex: $(cameraIndex),
) 
Copy full snippet (3 lines long) 

Declare 

Declares (defines) a new variable.

Syntax: 

Syntax: $Declare( "variable", value ) 

| | 

variable
| 
The name of the new variable.
| 

value
| 
A new value for the new variable.
| 

Example: 

paRSer 

$Declare( "myVariable1", 0 )
$Declare( "myVariable2", "test" ) 

$Declare( "myVariable1", 0 )
$Declare( "myVariable2", "test" ) 
Copy full snippet (2 lines long) 

Set 

Used to assign a new value to a variable.

Syntax: 

$Set( "variable", value ) 

| | 

variable
| 
The name of the variable.
| 

value
| 
A new value for the specified variable.
| 

Example: 

paRSer 

$Declare( "myVariable", 1 )
$Set( "myVariable", myVariable + 1 ) 

$Declare( "myVariable", 1 )
$Set( "myVariable", myVariable + 1 ) 
Copy full snippet (2 lines long) 

Min 

Finds and saves the minimal value from the given values as a new value for the specified variable.

Syntax: 

$Min( "outputVar", var1, var2, ..., varN ) 

| | 

outputVar
| 
The name of the variable.
| 

var1, var2, ..., varN
| 
A new value for the specified variable.
| 

Example:

paRSer 

$Declare( "sqrtVar", 0)
$Sqrt( "sqrtVar", 25) 

$Declare( "sqrtVar", 0)
$Sqrt( "sqrtVar", 25) 
Copy full snippet (2 lines long) 

Max 

Finds and saves the maximum value from the given values as a new value for the specified variable.

Parameter | Description | 

outputVar
| 
The name of the variable.
| 

var1, var2, ..., varN
| 
A new value for the specified variable.
| 

Example: 

paRSer 

$Declare( "sqrtVar", 0)
$Sqrt( "sqrtVar", 25) 

$Declare( "sqrtVar", 0)
$Sqrt( "sqrtVar", 25) 
Copy full snippet (2 lines long) 

Sqrt 

Calculates the square root of the given value and stores it in the specified variable.

Syntax: 

$Sqrt( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "sqrtVar", 0)
$Sqrt( "sqrtVar", 25) 

$Declare( "sqrtVar", 0)
$Sqrt( "sqrtVar", 25) 
Copy full snippet (2 lines long) 

Abs 

Returns the absolute value of the given value and stores it in the specified variable.

Syntax: 

$Abs( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "absVar", 0)
$Abs( "absVar", -12) 

$Declare( "absVar", 0)
$Abs( "absVar", -12) 
Copy full snippet (2 lines long) 

Floor 

Returns the largest lower integer of the given value and stores it in the specified variable.

Syntax: 

$Floor( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "floorVar", 0)
$Floor( "floorVar", 2.6) 

$Declare( "floorVar", 0)
$Floor( "floorVar", 2.6) 
Copy full snippet (2 lines long) 

Ceil 

Returns the largest higher integer of the given value and stores it in the specified variable.

Syntax: 

$Ceil( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "ceilVar", 0)
$Ceil( "ceilVar", 2.6) 

$Declare( "ceilVar", 0)
$Ceil( "ceilVar", 2.6) 
Copy full snippet (2 lines long) 

Log 

Returns the natural logarithmic value of the given value and stores it in the specified variable.

Syntax: 

$Log( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "logVar", 0)
$Log( "logVar", 2.6) 

$Declare( "logVar", 0)
$Log( "logVar", 2.6) 
Copy full snippet (2 lines long) 

Log10 

Returns the natural logarithmic value of 10 of the given value and stores it in the specified variable.

Syntax: 

$Log10( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "logVar", 0)
$Log10( "logVar", 2.6) 

$Declare( "logVar", 0)
$Log10( "logVar", 2.6) 
Copy full snippet (2 lines long) 

ATan 

Returns the arctangent (inverse tangent) of the given value and stores it in the specified variable.

Syntax: 

$ATan( "outputVar", var ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "atanVar", 0)
$ATan( "atanVar", 2.6) 

$Declare( "atanVar", 0)
$ATan( "atanVar", 2.6) 
Copy full snippet (2 lines long) 

Pow 

Calculates the value raised to the power of the exponent and stores the result as the specified variable.

Syntax: 

$Pow( "outputVar", base, exponent ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

base
| 
A number or numeric variable.
| 

exponent
| 
A number or numeric variable.
| 

Example: 

paRSer 

$Declare( "powVar", 0)
$Pow( "powVar", 4 , 3) 

$Declare( "powVar", 0)
$Pow( "powVar", 4 , 3) 
Copy full snippet (2 lines long) 

Sum 

Returns the sum of the given values and stores it in the specified variable.

Syntax: 

$Sum( "outputVar", var1, var2, ..., varN ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var1, var2, ..., varN
| 
Numeric variables or values separated by commas.
| 

Example: 

paRSer 

$Declare( "sum", 0 )
$Sum( "sum", 1, 2 ) 

$Declare( "sum", 0 )
$Sum( "sum", 1, 2 ) 
Copy full snippet (2 lines long) 

Prod 

Returns the product (multiplied values) of the given values and stores it in the specified variable.

Syntax: 

$Prod( "outputVar", var1, var2, ..., varN ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var1, var2, ..., varN
| 
Numeric variables or values separated by commas.
| 

Example: 

paRSer 

$Declare( "prod", 0 )
$Prod( "prod", 1, 2 ) 

$Declare( "prod", 0 )
$Prod( "prod", 1, 2 ) 
Copy full snippet (2 lines long) 

Mean 

Returns the mean value of the given values and stores it in the specified variable.

Syntax: 

$Mean( "outputVar", var1, var2, ..., varN ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var1, var2, ..., varN
| 
Numeric variables or values separated by commas.
| 

Example: 

paRSer 

$Declare( "mean", 0 )
$Mean( "mean", 1, 2, 3) 

$Declare( "mean", 0 )
$Mean( "mean", 1, 2, 3) 
Copy full snippet (2 lines long) 

StdDevS 

Calculates the sample standard deviation of the given values and stores the result in the specified variable. Use this function when the values represent a sample rather than the entire population.

Syntax: 

$

StdDevS( "outputVar", var1, var2, ..., varN ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var1, var2, ..., varN
| 
Numeric variables or values separated by commas.
| 

Example: 

paRSer 

$Declare( "stddevs", 0 )
$StdDevS( "stddevs", 1, 2, 3, 4) 

$Declare( "stddevs", 0 )
$StdDevS( "stddevs", 1, 2, 3, 4) 
Copy full snippet (2 lines long) 

StdDevP 

Calculates the population standard deviation of the given values and stores the result in the specified variable. Use this function when the values represent the entire population.

Syntax: 

$

StdDevP( "outputVar", var1, var2, ..., varN ) 

Parameter | Description | 

outputVar
| 
The name of the variable where the result will be stored.
| 

var1, var2, ..., varN
| 
Numeric variables or values separated by commas.
| 

Example: 

paRSer 

$Declare( "stddevp", 0 )
$StdDevP( "stddevp", 1, 2, 3) 

$Declare( "stddevp", 0 )
$StdDevP( "stddevp", 1, 2, 3) 
Copy full snippet (2 lines long) 

Map 

Compares all variables to the given expression and returns the one that best matches the comparison. The comparison follows these rules:

Returns R[i] if t[i] ≤ expression < t[i+1] ; returns R0 if expression < t1 ; returns Rn if expression > tn .  

Syntax: 

$Map( expression, "text0", t1, "text1", t2, "text2", ..., tN, "textN" ) 

Parameter | Type | Description | 

expression 
| 
DOUBLE
| 
The name of the variable where the result will be stored.
| 

R1, ..., RN
| 
STRING
| 
The values that may be returned based on the comparison.
| 

t1, ..., tN
| 
DOUBLE
| 
Specify the values or expressions used for comparison with the defined expression parameter.  
| 

Example: 

paRSer 

$Declare( "lvl1", 1 ) $Declare( "lvl1Color", "#fff040" )
$Declare( "lvl2", 1.5 ) $Declare( "lvl2Color", "#ff8040" )
$Declare( "lvl3", 2 ) $Declare( "lvl3Color", "#ff1040" )
$Declare("cpxStd", 3)
$Declare("cpxMeanAcc", 1.5)
"$Map(Abs(cpxStd),"",lvl1*cpxMeanAcc,"$(lvl1Color)",lvl2*cpxMeanAcc,"$(lvl2Color)",lvl3*cpxMeanAcc,"$(lvl3Color)")" 

$Declare( "lvl1", 1 ) $Declare( "lvl1Color", "#fff040" )
$Declare( "lvl2", 1.5 ) $Declare( "lvl2Color", "#ff8040" )
$Declare( "lvl3", 2 ) $Declare( "lvl3Color", "#ff1040" )
$Declare("cpxStd", 3)
$Declare("cpxMeanAcc", 1.5)
"$Map(Abs(cpxStd),"",lvl1*cpxMeanAcc,"$(lvl1Color)",lvl2*cpxMeanAcc,"$(lvl2Color)",lvl3*cpxMeanAcc,"$(lvl3Color)")" 
Copy full snippet (6 lines long) 

Include 

Outputs the content of the specified file.

Syntax: 

$Include( "filePath" ) 

Parameter | Description | 

filePath
| 
A path to the file whose content will be output.
| 

Example: 

paRSer 

$Include( "Reports\style.css" ) 

$Include( "Reports\style.css" ) 
Copy full snippet (1 line long) 

EscapeBackslashes 

Replaces backslashes ( \ ) with double backslashes ( \\ ).

Syntax: 

$EscapeBackslashes( noParametersJustAnyText ) 

Example: 

paRSer 

$EscapeBackslashes( D:\project\data\images ) 

$EscapeBackslashes( D:\project\data\images ) 
Copy full snippet (1 line long) 

EscapeSpaces 

Syntax: 

$EscapeSpaces( noParametersJustAnyText ) 

Example: 

paRSer 

$EscapeSpaces(D:\Project 01\Data\Images HDR) 

$EscapeSpaces(D:\Project 01\Data\Images HDR) 
Copy full snippet (1 line long) 

Replace 

Replaces the specified string with a new string within the given text.

Syntax: 

$Replace( "search", "replace", subject ) 

Parameter | Description | 

search
| 
The string to be found and replaced.
| 

replace
| 
The replacement string that will replace the found occurrences.
| 

subject
| 
The text in which the search and replacement will be performed.
| 

Example: 

paRSer 

$Replace( "world", "my friend", Hello world! ) 

$Replace( "world", "my friend", Hello world! ) 
Copy full snippet (1 line long) 

Append 

Concatenates the given strings into a single string.

Syntax: 

$Append( "variable", var1, var2, ..., varN )  

Parameter | Description | 

variable
| 
Name of the variable to which the remaining parameters are appended.
| 

var1, var2, ..., varN
| 
Variables or values, separated by commas, that will be concatenated.
| 

Example: 

paRSer 

$Declare( "text", "The measurement unit" )
$Declare( "text2", " of the selected component is " )
$Append( "text", text2, "$(units)", "." ) 

$Declare( "text", "The measurement unit" )
$Declare( "text2", " of the selected component is " )
$Append( "text", text2, "$(units)", "." ) 
Copy full snippet (3 lines long) 

Echo 

The parameters of this function will be displayed in the report.

Syntax: 

$Echo( anyDeclaration ) 

Example: 

paRSer 

$Echo( 
$Declare( "lvl1", 0.025 ) $Declare( "lvl1Color", "#fff040") 
$Declare( "lvl1ColorBright", "#fff0a0") 
) 

$Echo( 
$Declare( "lvl1", 0.025 ) $Declare( "lvl1Color", "#fff040") 
$Declare( "lvl1ColorBright", "#fff0a0") 
) 
Copy full snippet (4 lines long) 

EchoOff 

The parameters of this function will not be displayed in the report.

Syntax: 

$EchoOff( anyDeclaration ) 

Example: 

paRSer 

$EchoOff( 
$Declare( "lvl1", 0.025 ) $Declare( "lvl1Color", "#fff040")
$Declare( "lvl1ColorBright", "#fff0a0")
) 

$EchoOff( 
$Declare( "lvl1", 0.025 ) $Declare( "lvl1Color", "#fff040")
$Declare( "lvl1ColorBright", "#fff0a0")
) 
Copy full snippet (4 lines long) 

ProgressSection 

Marks a block of template code so the report generator can estimate completion time. Wrap the longest-running operations inside ProgressSection , and you may nest these sections. At each nesting level, the sum of all fractionOfOne values must equal 1.

Syntax: 

$ProgressSection( fractionOfOne, anyText ) 

Parameter | Description | 

fractionOfOne 
| 
A decimal number between zero and one.
| 

Example: 

paRSer 

$ProgressSection( 0.3,
call some function that takes long time to execute, e.g. IterateOrthoMapTiles
)
$ProgressSection( 0.7,
$ProgressSection( 0.2,
call another function that takes long time to execute
)
$ProgressSection( 0.3,
call another function
)

Copy full snippet (14 lines long) 

IfFileExists 

Writes out the written text or executes a function if the defined file exists.

Syntax: 

$IfFileExists( "filePath", anyText ) 

Parameter | Description | 

filePath
| 
A path to the file whose existence is tested.
| 

anyText
| 
Any text, expression, or function.
| 

Example: 

paRSer 

$Declare("Var", 0)
$IfFileExists("D:\Test\file.xml", $Max("var", 1, 4, 3)) 

$Declare("Var", 0)
$IfFileExists("D:\Test\file.xml", $Max("var", 1, 4, 3)) 
Copy full snippet (2 lines long) 

IfFileNotExists 

Writes out the written text or executes a function if the defined file does not exist.

Syntax: 

$IfFileNotExists( "filePath", anyText ) 

Parameter | Description | 

filePath
| 
A path to the file whose existence is tested.
| 

anyText
| 
Any text, expression, or function.
| 

Example: 

paRSer 

$Declare("Var", 0)
$IfFileNotExists("D:\Test\file.xml", $Max("var", 1, 4, 3)) 

$Declare("Var", 0)
$IfFileNotExists("D:\Test\file.xml", $Max("var", 1, 4, 3)) 
Copy full snippet (2 lines long) 

Sleep 

Creates a pause for the specified duration in milliseconds.

Syntax: 

$Sleep( timeSec ) 

Parameter | Description | 

timeSec
| 
Time in milliseconds.
| 

Example: 

paRSer 

$Sleep( 100 ) 

$Sleep( 100 ) 
Copy full snippet (1 line long) 

Strip 

Remove the last characters from the output. 

Syntax: 

$Strip( count ) 

Parameter | Description | 

count
| 
Number of characters that will be removed.
| 

Example: 

paRSer 

$Strip( 4 ) 

$Strip( 4 ) 
Copy full snippet (1 line long) 

Nop 

Ignores the given content.

Syntax: 

$Nop( anyText ) 

Example: 

paRSer 

$Nop( This text will be ignored. ) 

$Nop( This text will be ignored. ) 
Copy full snippet (1 line long) 

WriteInterleaved 

Syntax: 

$WriteInterleaved(stride, anyText ) 

Parameter | Description | 

stride
| 
Stride, which will be used to interleave the given content.
| 

Example: 

paRSer 

$WriteInterleaved( 3 , This text will be interleaved. ) 

$WriteInterleaved( 3 , This text will be interleaved. ) 
Copy full snippet (1 line long) 

ShellExecute 

Executes the given parameters using Shell.

Syntax: 

$ShellExecute( "filePath" ) 
or
$ShellExecute( "filePath", "arguments" ) 
or
$ShellExecute( "filePath", "arguments", "workDir" ) 

Parameter | Description | 

filePath
| 
Global path to an external file.
| 

Example: 

paRSer 

$ShellExecute( "cmd.exe", "/c cd /d \"$(cmdStartDir)\" && python hardMasks.py" ) 

$ShellExecute( "cmd.exe", "/c cd /d \"$(cmdStartDir)\" && python hardMasks.py" ) 
Copy full snippet (1 line long) 

QuaternionFromMatrix 

Calculates the quaternion rotation from an orthonormal orientation matrix, where Rij represents the element in the i-th row and j-th column of the input matrix.

Syntax: 

$QuaternionFromMatrix( R00, R01, R02, R10, R12, R13, R20, R21, R22, anyText ) 

Parameter | Description | 

R00, ..., R22
| 
Elements of the rotation matrix.
| 

Available Variables 

Variable | Type | Description | 

qx
| 
DOUBLE
| 
The x component of the quaternion.
| 

qy
| 
DOUBLE
| 
The y component of the quaternion.
| 

qz
| 
DOUBLE
| 
The z component of the quaternion.
| 

qw
| 
DOUBLE
| 
The w (scalar) component of the quaternion.
| 

Mat44Inv 

Calculates the inverse matrix of a given 4x4 matrix.

Syntax: 

$Mat44Inv( M00,M01,M02,M03,...,M33, anyText ) 

Parameter | Description | 

M00, ..., M33
| 
Values of the matrix.
| 

Available Variables 

Variable | Type | Description | 

MInv00, ..., MInv33
| 
DOUBLE
| 
The elements of the resulting inverted 4×4 matrix.
| 

ParentFolder 

Outputs the parent folder name—the substring between the second-to-last and last path separators ( \ or / ).  

Syntax: 

$ParentFolder( path ) 

Parameter | Description | 

path
| 
Global path to an external file.
| 

Example: 

paRSer 

$ParentFolder( D:\Project\Images\FolderName\file.ext ) 

$ParentFolder( D:\Project\Images\FolderName\file.ext ) 
Copy full snippet (1 line long) 

FileName 

Outputs the file name if it exists. 

Syntax: 

$FileName( path ) 

Parameter | Description | 

path
| 
Global path to an external file.
| 

Example: 

paRSer 

$ParentFolder( D:\Project\Images\FolderName\file.ext ) 

$ParentFolder( D:\Project\Images\FolderName\file.ext ) 
Copy full snippet (1 line long) 

FileExt 

$FileExt( path ) 

Parameter | Description | 

path
| 
Global path to an external file.
| 

Example: 

paRSer 

$ParentFolder( D:\Project\Images\FolderName\file.ext ) 

$ParentFolder( D:\Project\Images\FolderName\file.ext ) 
Copy full snippet (1 line long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

WriteFile 

CopyFile 

ImportFile 

Ifdef 

Ifndef 

If 

For 

Declare 

Set 

Min 

Max 

Sqrt 

Abs 

Floor 

Ceil 

Log 

Log10 

ATan 

Pow 

Sum 

Prod 

Mean 

StdDevS 

StdDevP 

Map 

Include 

EscapeBackslashes 

EscapeSpaces 

Replace 

Append 

Echo 

EchoOff 

ProgressSection 

IfFileExists 

IfFileNotExists 

Sleep 

Strip 

Nop 

WriteInterleaved 

ShellExecute 

QuaternionFromMatrix 

Available Variables 

Mat44Inv 

Available Variables 

ParentFolder 

FileName 

FileExt
