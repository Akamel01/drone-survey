# Derived nerfstudio image with the LPIPS/AlexNet weights baked in at build
# time (ADR 0013, option 1 from ticket #24's first comment). This is the
# splatfacto path only (remote-3090/rented in fit_splat.py's MEMORY_POLICY);
# the local target uses OpenSplat, which never needs these weights.
#
# Without this, nerfstudio fetches 233 MB from download.pytorch.org on every
# --rm container run, and a run with no network fails at startup rather than
# partway through.
#
#   docker build -f nodes/fit-splat/nerfstudio.Dockerfile -t nerfstudio-splat:local nodes/fit-splat
FROM ghcr.io/nerfstudio-project/nerfstudio:latest

RUN mkdir -p /root/.cache/torch/hub/checkpoints && \
    wget -q -O /root/.cache/torch/hub/checkpoints/alexnet-owt-7be5be79.pth \
        https://download.pytorch.org/models/alexnet-owt-7be5be79.pth
