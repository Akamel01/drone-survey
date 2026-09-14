# Pin @playcanvas/splat-transform instead of `npx`-installing it fresh on
# every compress-splat run (same reasoning as fit-splat's AlexNet cache:
# don't refetch a dependency every run). MIT licensed (ADR 0003's permissive
# rule applies to tooling too, even though this is post-processing, not a
# splat engine).
#
#   docker build -t splat-transform:local nodes/compress-splat
#
# node:22 (not -slim) on purpose: it is already pulled on the shared GPU
# host, and disk there is tight -- pulling a second, slightly smaller base
# image would cost more net bytes than reusing layers already present.
FROM node:22

RUN npm install -g @playcanvas/splat-transform@3.4.2
