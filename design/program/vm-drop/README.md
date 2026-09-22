# VM drop

This folder is the other machine's outbox. It is the only place that machine is allowed to write.

A job arrives as `design/program/vm-drop/<job-id>/` with the file, an `IMPORT.md`, and a `DONE.md`.
Nothing here is in the live game. Importing means a person on this machine copies or wires it on
purpose, in a later session.

Local agents do not add work here and do not edit a job that already has a folder. The job list
lives in [`../VM_LANES.md`](../VM_LANES.md).
