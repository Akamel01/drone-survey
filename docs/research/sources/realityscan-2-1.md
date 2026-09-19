<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-2-1
     http: 200
     fetched: 2026-09-19T01:49:59Z
     extracted from HTML; wording verbatim, layout lost -->

RealityScan 2.1 | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

RealityScan 2.1 

RealityScan 2.1

The new RealityScan 2.1 version brings you automation improvements and interesting updates to the LiDAR import and workflow. 

On this page 

New updates 

Copy improvements 

Improved the visibility and findability of tools and buttons within the ribbons.

SLAM support 

Importing point clouds from SLAM scanners, such as XGrids, is now supported.

First import images and their trajectories, or open a Colmap Scene that is also provided with XGrids data.

Import the point cloud and generate virtual cameras based on camera pose priors or an imported component from a Colmap scene.

Combine with photogrammetry or other LiDAR data.

More about the SLAM support in this tutorial .

LiDAR classification 

ASPRS classes can now be imported from .las and .laz point clouds.

Class visibility can be controlled from the SCENE 3D/VIEW tab.

A class legend has been added to the 1Ds View.

Classes can be used for selective meshing, with class selection available in the Model settings.

Check out the tutorial to find out how to use classes.

New registration exports 

Added support for OpenCV export.

New XMP export available for both undistorted and original distorted images

Colmap export has been improved, allowing you to export files that match the original distorted images.

Flight log import improvements 

Flight log was renamed to Trajectory.

Now possible to set a custom format for the flight log import.

Added options to select the Euler angles order and the mount direction for Yaw, Pitch, and Roll import.

Updated existing format options and added new formats.

Updated names of the available parameters for the Custom format description.

List of available parameters for the custom format description.

Render camera view 

Images of models can now be rendered from the exact positions of the input dataset cameras.

Rendered images can match the precise camera intrinsics and extrinsics of the source images or be undistorted.

Render camera normals 

Render surface normals in either camera space or world space, adhering to standard conventions.

UV unwrap improvements 

Introduced a colorful checkerboard that visually displays how the unwrap appears on the texture.

Increased the default large triangle removal threshold value to 400.

Enabled texture defragmentation charts by default to provide higher-quality UVs.

REST/gRPC API plugin 

Enables remote control of the software through REST or gRPC APIs, allowing for offloading to different machines within your fleet setup.

Check out our REST and gRPC samples.

RealityScan on Linux 

A command-line build of RealityScan for automated processing on Linux servers. Runs in a bundled Wine environment and supports CLI workflows for alignment, reconstruction, texturing, and export.

The desktop UI can be launched, but it is not recommended due to graphical and focus issues. Use the CLI only, either through the Remote Command Plugin (gRPC/REST) or local commands.

In-App AI model updater 

Update AI models seamlessly without requiring a complete application reinstall.

New CLI Commands 

importColmap

Required parameter: filePath

Options parameter: params.xml

Imports a COLMAP project using the path to any of the three COLMAP text files and, optionally, a configuration file defining scene transformation settings. The configuration file can adjust the coordinate system or apply custom transformations during import.

importBundler

Required parameter: filePath

Options parameter: params.xml

Imports a Bundler project using the path to the Bundler file and, optionally, a configuration file defining scene transformation settings. The configuration file allows you to adjust the coordinate system or apply custom transformations during import.

exportMapsAndMasks

Optional parameters: PathToDestinationFolder PathToConfig.xml

Exports depth maps, mask images generated from the mesh, and surface normal maps. You can specify a destination folder or omit it to use the default location. The export uses only the configuration exported from the export dialog in XML format. If no destination folder is specified, the files are saved next to the original inputs.

exportCameraSnapshots    exportCameraSnapshots "PathToDestinationFolder" "PathToConfig.xml"

Required parameter: PathToDestinationFolder

Optional parameters: PathToConfig.xml

Exports rendered images of the currently selected model from the positions of the selected cameras. If no cameras or only one camera is selected, all camera poses in the component are used. Specify the destination folder and use the export settings file exported as XML from the export dialog.

Fixed Issues 

Alignment 

Heading is used instead of Yaw in the Registration exports.

Importing a LiDAR scan without classification shows the classes in the 1Ds view.

Using LSP files in components significantly slows down alignment with images.

Feature detection detects more features per image than the set limit in the Alignment settings when using LiDAR scans.

Calibration or lens group is not accepted when importing images with corresponding XMP files.

The reporting (templating) system's camera and anchor variables are incorrect.

Inconsistent Feature Detection Quality notification used “Yes” instead of “OK”.

The Explorer Window becomes unresponsive during the import of the LiDAR scan.

RAM is not released after alignment.

Image panels cannot be reopened once closed.

Tooltip for “Save Settings” hovers over the button.

Omega and Kappa values are swapped in the export.

Texturing 

Crash occurring during the texturing of specific projects.

Texturing process hangs and does not complete.

Image Layers in 1Ds view show the path to the geometry folder instead of the texture folder.

“Unexpected program state” error in large projects.

Resource exhaustion when texturing large models.

Editor 

The SCENE 3D track length tool causes a crash when used.

The file format field appears twice in the export dialog when exporting mask images.

Texture layers not displayed in IMAGE 2D/VIEW.

“Set Region by Point Density” does not work for single imported LiDAR scans.

Sort by Name does not affect constraints in the 1Ds view.

Large decimal values in scene transformation cause rounding errors in Component Import.

The Map Wizard configuration file is still named RCMW.

RSNode.exe continues running after stopping Real-Time Assistance.

Tie point quality does not respect the Clipping Box.

The Quality Analysis layer reappears after moving the Clipping Box.

Opening a project with an ortho projection causes a crash.

Exporting cameras as parts fails when the mesh is saved as parts.

The Track Length tool does not function properly in IMAGE 2D/VIEW.

The HEIC image format fails to import and shows an error.

Long project names can cause crashes or “Path not found” errors when being saved.

The PLY format displays a number format option during export, even when the Binary file type is selected.

Not all background colors are accepted when exporting undistorted images.

The Set Ground Plane behaves incorrectly for small-scale models.

Color palette in MAP ORTHO VIEW changes color for all orthos in the map view.

Model required to export STMaps.

Poor UX when trying to “Render Image” from the ANIMATION 4D VIEW tab.

Line shape is not updated in 3D or 2D height profile views after editing.

Command Line Interface 

Exporting a model with selected cameras exports all cameras, not just the selected ones.

Commands -importLaserScan and -importLaserScanFolder do not work.

Known Issues 

Alignment 

The pop-up dialog for camera selection used when exporting registrations and image lists is not applied to XMP export.

Using different coordinate systems for images disables the rotation option for all selected images in the 1Ds view.

Exporting COLMAP with a mask layer using CLI does not export the masks.

Enhanced COLMAP export shows quality degradation when using the original images.

Exported classes are not imported consistently.

Aligning images from a folder with a long path results in a red error message.

Attempting to use the Colorize tool on a classified model displays a “The model is already colorized” warning, even when it is not.

Aligning datasets with different coordinate systems and large distances between them aligns successfully, but not all data are visible in the 3Ds view.

The “Unexpected program state” internal error (MSS_STR001) appears for a specific dataset during alignment.

Meshing 

RAM estimation produces poor clustering for some datasets.

Texturing 

Mesh is displayed as a point cloud after the texture reprojection, even when the view is set to Color/Texture after computation.

The alpha layer is not omitted during the texturing process.

No option to export color-corrected data when “Correct color” is set to No in Color and Texture Settings.

Editor 

“Optimal texel size” shows a placeholder string (“< processing >”) instead of a value.

The small component dropdown menu collapses when another component is selected.

Typo in “Level of detail” export.

Button labels start with lowercase letters.

Cannot export contours from the MAP ORTHO ribbon.

The 2D view appears twice when switching between the map view and the 2D view.

Export option for LAS ASPRS classification format is available but not functional.

Importing a classification format twice results in a red error message.

Crash occurs with specific settings when exporting LOD.

Enabling “Export cameras as a model part” when exporting sample points produces an error.

Exporting cameras as a model part does not work for textured models.

Multiple tools for region/shape manipulation can be active simultaneously in the ORTHO 2D ribbon.

Unable to import PLY files from the CGAL library.

Tooltip and panel for Region Settings still use the old name.

Sparse Point Cloud export contains duplicate options, and some formats cannot be opened.

After resetting and redoing the alignment, the alignment settings revert to their previous values.

Possible to set extreme values for Position/Orientation prior hardness.

The 3Ds and 2D views display different units for defined distances.

A crash occurs after stopping RealityScan with Real-Time Assistance minimized.

Unable to display layers immediately after alignment.

The Define Distance shortcut icon does not appear immediately.

Changing the UI language to another and back to the default keeps partial translations in input Windows.

Exporting a Map View Report for a model in a local coordinate system results in an infinite process.

Adding a quick tool for a map provider disables its functionality.

Some tooltips contain incomplete icons.

The control point disappears when it is placed using the scroll wheel.

Side ortho export uses incorrect top-left corner coordinates.

All images are shown after each image import in 1Ds view.

Exporting one or more orthos from MAP ORTHO/VIEW exports all orthos.

The image layer for classes does not appear in the panel.

Clicking “Texture” or “Input” in the 1Ds view (from double-view layout) opens Help instead of the 2D texture window in 1+1+1 layout.

Missing ''layer 1'' prevents using the “All texturing layers” option.

The “Import shapes” option appears in Edit Region mode, but does not import regions.

Dragging and dropping a .rsalign file into the UI displays a “Could not find file” message.

The processing status is not displayed after minimizing the “Calculations in Progress” window when using MapWizard.

Turning Real-Time Assistance on/off during AI masking computation causes a mini dump.

Selecting the same image layer in 1Ds view incorrectly shows “< Different values >”.

Using French in “Reset layouts” causes a visibility error.

Some exported masks are entirely black when exported using the Maps and Masks export.

Some exported files contain raster artifacts when exported using the Maps and Masks export.

Exported files do not match the corresponding input cameras when exported using the Maps and Masks export.

Command Line Interface 

Exporting COLMAP with a mask layer does not export the masks.

Using -addFolder for a folder with layers returns “Added 0 images” in the console.

Linux-Specific Issues 

Custom flight log import is not accepted.

Exit and Minimize buttons are missing.

Quality texture renders incorrectly.

DSM is not rendered.

Unable to export a mesh with a displacement map.

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

New updates 

Copy improvements 

SLAM support 

LiDAR classification 

New registration exports 

Flight log import improvements 

Render camera view 

Render camera normals 

UV unwrap improvements 

REST/gRPC API plugin 

RealityScan on Linux 

In-App AI model updater 

New CLI Commands 

Fixed Issues 

Alignment 

Texturing 

Editor 

Command Line Interface 

Known Issues 

Alignment 

Meshing 

Texturing 

Editor 

Command Line Interface 

Linux-Specific Issues
