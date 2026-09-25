# One container for the Showcase render Node (and the island-cut Node that
# shares it): pinned Blender plus the CC0 Poly Haven assets the island
# materials and sky are built from.  The Runner mounts only the workdir and
# sets no working directory (pipeline/runner.py:206), so the assets and the
# Node script have to travel in the image, at the path the command names.
#
# Build: stage the asset store and this Node's script into the context
# (assets are not committed):
#   mkdir -p /tmp/render-ctx/assets /tmp/render-ctx/nodes/render
#   cp -r <asset-store>/{kloofendal_overcast_puresky,cliff_side,forest_ground_04,lichen_rock,aerial_rocks_02} /tmp/render-ctx/assets/
#   cp nodes/render/render_island.py /tmp/render-ctx/nodes/render/
#   docker build -f nodes/render/Dockerfile -t drone-render-showcase:blender-5.2.2 /tmp/render-ctx
#
# Run (the Manifest's frozen command, relative script path):
#   docker run --rm --gpus all -v "$PWD":"$PWD" drone-render-showcase:blender-5.2.2 \
#       blender -b --factory-startup -P nodes/render/render_island.py -- ...
FROM nvidia/cuda:12.6.3-base-ubuntu24.04

# Blender 5.2.2 (docs/ui-theme/hero-pipeline.md:330), official linux-x64 tarball.
ARG BLENDER_URL=https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates xz-utils \
        libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxext6 \
        libxkbcommon0 libgl1 libegl1 libgomp1 libsm6 libice6 \
    && curl -fsSL "$BLENDER_URL" -o /tmp/blender.tar.xz \
    && mkdir -p /opt/blender \
    && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \
    && rm /tmp/blender.tar.xz \
    && rm -rf /var/lib/apt/lists/*
ENV PATH=/opt/blender:$PATH

# The pool the render script reads from (render_island.py:ASSETS).
COPY assets/ /opt/showcase/assets/

# The Node script at the relative path the Runner command names.  The Runner
# passes no -w/cwd, so without this the relative path resolves against / and
# fails (same pattern as nodes/export-cog/Dockerfile:12-13).
WORKDIR /work
COPY nodes/render/render_island.py /work/nodes/render/render_island.py
