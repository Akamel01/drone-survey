<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/remote-command-plugin
     http: 200
     fetched: 2026-09-19T01:49:47Z
     extracted from HTML; wording verbatim, layout lost -->

Remote Command Plugin | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Remote Command Plugin 

Remote Command Plugin

Learn how to use and what the Remote Command Plugin (REST/gRPC) is for. 

On this page 

The Remote Command Plugin turns RealityScan into more than just a standalone desktop application. It enables you to control the software remotely, automate tasks, and even run multiple machines in a fleet. This enables the processing of large datasets more efficiently, handling multiple projects simultaneously, and reducing manual effort through automation.

By exposing RealityScan’s functionality through REST and gRPC, the plugin allows you to:

Send commands to RealityScan without touching the UI

Monitor progress and receive real-time notifications of task updates

Run jobs across several machines

Control your worker machines from any master PC

Automate repetitive or large-scale photogrammetry workflows

Practical Examples 

Here are some examples of what becomes possible when you use multiple machines with the plugin:

Batch Processing of Multiple Datasets on Multiple Machines Instead of manually processing each dataset one by one, you can queue multiple projects and let RealityScan handle them automatically. With multi-machine control, each system can process a different preconfigured dataset at the same time.

Fleet Setup for Faster Processing Big datasets can be divided into smaller tasks and distributed across several RealityScan worker machines. Each worker runs RealityScan with the plugin enabled, and a master node coordinates the workflow. The result: faster processing times through parallel execution.

Remote Control from Any Master PC Whether you are at your workstation, a laptop at home, or even another operating system (Windows, macOS, Linux), you can remotely control RealityScan tasks running on Windows or Wine(Linux) based worker machines. Start, stop, pause, or resume jobs from anywhere.

Centralized Monitoring All worker machines report their progress to a single master PC, allowing you to monitor multiple jobs simultaneously. The system provides real-time updates when a task starts, finishes, or encounters an error. Through a listener, it automatically communicates job statuses, enabling synchronization of work.

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library 

On this page

Practical Examples
