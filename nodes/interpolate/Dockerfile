# One container for the interpolate Node: RIFE + rife-v4.6 model + ffmpeg.
# Same pattern as nodes/render/Dockerfile:17-39 -- the Runner mounts only the
# workdir and sets no working directory, so the binary, the model and the Node
# script travel in the image, at the paths the frozen command names. No
# ~/hero3d host paths; fresh-env build from pinned tarball + apt ffmpeg.
#
# Build (context = repo root):
#   docker build -f nodes/interpolate/Dockerfile -t drone-interpolate:rife-v4.6 .
#
# Run (the Manifest's frozen command, relative script path):
#   docker run --rm --gpus all -v "$PWD":"$PWD" drone-interpolate:rife-v4.6 \
#       python3 nodes/interpolate/interpolate.py \
#       --graded-wide "$PWD/graded-wide" --graded-tall "$PWD/graded-tall" \
#       --out-dir "$PWD/masters" \
#       --rife-bin /opt/rife/rife-ncnn-vulkan --rife-model /opt/rife/rife-v4.6
FROM nvidia/cuda:12.6.3-base-ubuntu24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates unzip ffmpeg python3 python3-pil \
    && rm -rf /var/lib/apt/lists/*

# RIFE ncnn-vulkan 20221029 (the binary scripts/hero/up4k.sh:8 runs);
# the rife-v4.6 model ships inside the same release asset.
ARG RIFE_URL=https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-ubuntu.zip
RUN curl -fsSL "$RIFE_URL" -o /tmp/rife.zip \
    && mkdir -p /opt/rife \
    && unzip -q /tmp/rife.zip -d /opt/rife \
    && rm /tmp/rife.zip \
    && chmod +x /opt/rife/rife-ncnn-vulkan \
    && test -d /opt/rife/rife-v4.6

# The Node script at the relative path the Runner command names (same reason
# as nodes/render/Dockerfile:38-39: no -w/cwd from the Runner).
WORKDIR /work
COPY nodes/interpolate/interpolate.py /work/nodes/interpolate/interpolate.py
