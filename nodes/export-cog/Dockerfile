# export-cog needs gdal_translate/gdalinfo and osgeo's Python bindings, which
# are not present on either host bare-metal (checked: the Mac's default
# python3 can't import osgeo per #15's own comment; akamel-linux has neither
# GDAL nor pip installed). ghcr.io/osgeo/gdal:ubuntu-small-3.10.3 has both
# already (confirmed live, 2026-09-13) and was already pulled on the GPU
# host, so this Dockerfile only adds this Node's own script on top of it --
# same pattern as nodes/Dockerfile does for the head Nodes on a Python base.
#
# Build:  docker build -t drone-export-cog -f nodes/export-cog/Dockerfile .
FROM ghcr.io/osgeo/gdal:ubuntu-small-3.10.3

WORKDIR /work
COPY nodes/export-cog/ /work/nodes/export-cog/
