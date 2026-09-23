<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/realityscan-for-linux
     http: 200
     fetched: 2026-09-19T01:49:47Z
     extracted from HTML; wording verbatim, layout lost -->

RealityScan for Linux | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

RealityScan for Linux 

RealityScan for Linux

Learn more about requirements for RealityScan for Linux and how to set it up. 

On this page 

In cloud and large‑scale automated environments, RealityScan Linux can run fully inside a Docker container with GPU passthrough. When administrators enable a REST server , gRPC server , or both , they can remotely send commands to RealityScan, query processing status, and control workflows programmatically.

RealityScan also supports a passive notification mode , where you provide a notification address and receive asynchronous events (progress, completion, errors) without polling. This is useful when running existing pipelines—such as .rscmd command files—inside a container without an active server loop.

Both active (server) and passive (notifications) workflows can be combined depending on the environment.

RealityScan for Linux (Wine) 2.1 offers a command-line–focused build of RealityScan, designed for automated processing on Linux servers. This version is built on a bundled Wine environment and supports RealityScan’s CLI pipeline for alignment, reconstruction, texturing, and export.

The Linux (Wine) release is experimental . Editing or modifying files within the bundled Wine prefix is  not recommended  and should be done  at your own risk , as it may cause the installation to break or lead to unstable behavior.

The desktop UI can be launched, but its use is  not recommended  due to graphical glitches, window focus issues, and unsupported HTML dialogs. The supported workflow is CLI-only , typically executed through the Remote Command Plugin via gRPC or REST or locally via CLI commands. Please see our Python samples too

Download and licensing for RealityScan Linux are available at:  https://www.realityscan.com/en-US/linux 

System Requirements 

RealityScan Linux requires a modern 64‑bit Linux distribution and an NVIDIA GPU. Recommended:

Ubuntu 24.04 (Kernel 6.14) or Fedora 39 (Kernel 6.10), 64‑bit

NVIDIA GPU with at least 8 GB VRAM

16 GB system RAM or more

For full hardware details, refer to:  https://dev.epicgames.com/documentation/en-us/realityscan/hardware-and-software-requirements 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

System Requirements
