# One shared image for ingest/exif-audit/filter/correct (ADR 0013: every Node
# runs in a freshly provisioned environment, no reliance on local state).
# One Dockerfile is smaller than four near-identical ones -- same deps for
# all four Nodes, so nothing is gained by splitting.
#
# Build:  docker build -t drone-head -f nodes/Dockerfile .
# Run:    docker run --rm -v "$PWD":"$PWD" -e INGEST_SOURCE=... drone-head \
#             python3 nodes/ingest/ingest.py --out /workdir/nodes/ingest/images
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends libimage-exiftool-perl \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir Pillow

WORKDIR /work
COPY nodes/ /work/nodes/
