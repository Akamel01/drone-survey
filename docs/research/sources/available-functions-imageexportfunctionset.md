<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/available-functions-imageexportfunctionset
     http: 200
     fetched: 2026-09-19T01:50:21Z
     extracted from HTML; wording verbatim, layout lost -->

Available Functions (ImageExportFunctionSet) | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Available Functions (ImageExportFunctionSet) 

Available Functions (ImageExportFunctionSet)

Functions available within ImageExportFunctionSet. 

On this page 

SaveImage 

Save an image to your machine.

Syntax: 

$SaveImage( srcImage, dstImageFileName ) 
or 
$SaveImage( srcImage, dstImageFileName, maxWidth, maxHeight ) 

Parameter | Type | Description | 

srcImage 
| 
UINT/STRING
| 
Image source, given as an image index (number without quotes) or an image file path (string in quotes). Use IterateImages to obtain image indexes.  
| 

dstImageFileName 
| 
STRING
| 
Output path where the image will be saved.
| 

maxWidth
| 
INT
| 
If the image width exceeds this value, the image is downscaled so its width is ≤ maxWidth . Use a negative value to keep the original width. An optional parameter used together with maxHeight .
| 

maxHeight 
| 
INT
| 
If the image height exceeds this value, the image is downscaled so its height is ≤ maxHeight . Use a negative value to keep the original height. An optional parameter used together with maxWidth.
| 

Example 

paRSer 

$IterateImages(
$SaveImage( inputIndex, "$(inputImageName)$(inputImageExt)", -1, -1 )
) 

$IterateImages(
$SaveImage( inputIndex, "$(inputImageName)$(inputImageExt)", -1, -1 )
) 
Copy full snippet (3 lines long) 

GetImageInfo 

Get information about an image.

Syntax: 

$GetImageInfo( filePath, anyText ) 

Parameter | Type | Description | 

filePath 
| 
STRING
| 
Path to the image, either relative to the attachments folder or in the format global://globalPathToFile.
| 

Available Variables 

Variable | Type | Description | 

width
| 
UINT
| 
Width of the image.
| 

height 
| 
UINT
| 
Height of the image.
| 

ratio 
| 
FLOAT
| 
Aspect ratio calculated as width/height.
| 

relWidth
| 
FLOAT
| 
Equals 1 if the width is greater than the height; otherwise equals the aspect ratio.
| 

relHeight 
| 
FLOAT
| 
Equals 1 if the height is greater than the width; otherwise equals the aspect ratio.
| 

Example 

paRSer 

$IterateOrthoProjections(
$SaveOrtho( "$(orthoGuid)", "color", "ortho_$(orthoIndex)_color.jpg", 800, 800 )
$GetImageInfo( "ortho_$(orthoIndex)_color.jpg",
orthoName: $(orthoName), width: $(width), height: $(height), ratio: $(ratio), relWidth: $(relWidth), relHeight: $(relHeight)
)
) 

$IterateOrthoProjections(
$SaveOrtho( "$(orthoGuid)", "color", "ortho_$(orthoIndex)_color.jpg", 800, 800 )
$GetImageInfo( "ortho_$(orthoIndex)_color.jpg",
orthoName: $(orthoName), width: $(width), height: $(height), ratio: $(ratio), relWidth: $(relWidth), relHeight: $(relHeight)
)
) 
Copy full snippet (6 lines long) 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

SaveImage 

Example 

GetImageInfo 

Available Variables 

Example
