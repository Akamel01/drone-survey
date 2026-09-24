<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-2-1-1
     http: 200
     fetched: 2026-09-19T01:50:00Z
     extracted from HTML; wording verbatim, layout lost -->

RealityScan 2.1.1 | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

RealityScan 2.1.1 

RealityScan 2.1.1

The new RealityScan 2.1.1 version brings you updates to COLMAP import and export, updates to the XMP and image list exporters, along with several bug fixes. 

On this page 

New updates 

COLMAP improvements 

The export now supports both a flat folder structure and the standard COLMAP directory layout, making exports easier to use in 3rd-party applications.

Exporting masks was improved to also support exporting AI-generated masks and to allow choosing whether to use the .mask.ext  suffix when exporting to the standard COLMAP directory layout.

You can also choose whether to export files in binary or ASCII format, depending on your preferred workflow.

During export, points are automatically filtered to remove low-accuracy data.

On the import side, support for the FULL_OPENCV camera model has been added, expanding compatibility with a wider range of camera calibration data.

New XMPs with image list exporter 

The new “RealityScan XMPs with Image List” export has been added to the Registration exports. The exporter enables options to export XMPs that correspond to original distorted images or undistorted images, as well as an option to select either the “local:1 Euclidean (Formerly ‘Same as XMP’)” or “Grid plane” coordinate system.

Image list exporter 

The Image list export in the Alignment tab was removed because the same functionality was already available in the Registration export. Now, all exported image lists end with the .imagelist file extension, which is reusable in RealityScan when importing inputs or input selections.

Texture layer names 

The texture layer names will now respect the specified name. This can be seen, for example, when choosing which layer to use for texturing.

Other changes include removing some information (e.g., 16-bit and HDR prefixes) and updates to the numbering.

Updated CLI commands 

loadColmap replaces the importColmap command.

loadBundler replaces the importBundler command.

importTrajectory replaces the importFlightLog command.

Fixed Issues 

Alignment 

Fixed an incorrect "The model is already colorized" warning when using the Colorize tool on uncolorized, classified LiDAR models.

 Added support for the FULL_OPENCV camera model during COLMAP imports. 

Resolved a quality degradation issue in COLMAP exports when using original distorted images.

Fixed a CLI issue where exporting COLMAP with a selected mask layer failed to export the masks.

Fixed an issue where intrinsic parameters were ignored during Flight Log imports.

Ensured the camera selection pop-up dialogue correctly applies to XMP exports, matching the behavior of registration and image list exports.

Resolved an issue that prevented the import of Flight log/Trajectory parameters via both the GUI and CLI.

Added a missing selection warning when exporting a component with specifically selected cameras.

Fixed a crash during .zfprj import caused by setting Feature Detection Quality to "High" alongside "Use mosaic images as feature source". 

Corrected an incorrect variable type mapping in Ground Control Point (GCP) exports.

Editor 

Removed the option to export normals for LAS files, as this format does not natively support them.

Fixed an issue where AI classification assigned identical colors to different classes.

Resolved an issue that prevented the import of certain EXR files.

Fixed an issue where placing a pivot and rotating an image outside of a component disabled the Reset View function.

Fixed an issue where Tutorial Mode did not apply immediately after being enabled in Application Settings.

Resolved a "Could not find file" error that occurred when dragging and dropping .rsalign files directly into the UI.

Corrected an issue where constraints with one defined endpoint incorrectly displayed a "No end points" message.

Fixed an issue where clicking "Texture" or an "Input" in the 1Ds view (from a double-view layout) opened the Help documentation instead of the 2D texture window.

Fixed an issue where the image layer for LiDAR classes was missing from the panel.

Fixed an issue where exporting specific selected cameras as a model part did not apply correctly to the exported model.

Fixed the 1Ds view behavior so it no longer resets to show all images after every individual image import.

Addressed various edge cases that previously prevented certain images from importing successfully.

Fixed a crash that occurred when resizing or changing the console view window during a long computation.

Fixed incomplete icons displaying in various tooltips.

Updated the Real-Time Assistance QR code link to use the correct application name instead of "rcnode".

Fixed an infinite loading issue when exporting a Map View Report for a model using a local coordinate system.

Fixed a localization bug where input windows retained partial translations after switching the UI language back to the default.

Resolved a crash that occurred when stopping RealityScan while Real-Time Assistance was minimized.

Updated outdated tooltips and panel names for Region Settings to match current terminology.

Added support for importing PLY files generated by the CGAL library.

Fixed an issue that prevented the "Export cameras as a model part" tool from working on textured models.

Resolved an error that appeared when enabling "Export cameras as a model part" during sample point export.

Fixed a crash related to specific LOD export settings.

Fixed a red error message that appeared if a classification format was imported twice.

Fixed the LAS ASPRS classification format export so it functions properly when selected.

Fixed an issue preventing contour export from the MAP ORTHO ribbon.

Fixed the small component dropdown menu so it no longer unexpectedly collapses when another component is selected.

Fixed an issue where COLMAP and Bundler imports incorrectly retained previous scene transformations.

Fixed an issue where Nira Terms and Conditions were unnecessarily prompted during every upload attempt.

Resolved a "Feature not implemented" error that occurred during Nira uploads.

Fixed an issue where imported masks were applied in the wrong position.

Eliminated raster artifacts that appeared in certain depth and mask exports.

Resolved an issue where some exported masks would render entirely black during Maps and Masks exports.

Fixed an issue to allow the export of virtual layer masks (both AI-generated and mesh-based) via the COLMAP exporter.

Command Line Interface 

Fixed an issue where the load command did not work for COLMAP files.

Fixed the addFolder command so it correctly recognizes and adds images from folders containing layers, rather than returning "Added 0 images".

Fixed the exportOrthoProjection command so it functions correctly when only a params.xml file is provided.

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

New updates 

COLMAP improvements 

New XMPs with image list exporter 

Image list exporter 

Texture layer names 

Updated CLI commands 

Fixed Issues 

Alignment 

Editor 

Command Line Interface
