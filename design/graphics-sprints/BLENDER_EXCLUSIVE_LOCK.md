# Blender Exclusive Lock — One MCP Agent at a Time

> **Activated-sprint coordination only.** The A–E thread labels below apply only during a named
> graphics sprint. The underlying rule is general: one current Blender/source-GLB writer, recorded by
> a marker and corroborated by live process/build/edit evidence. When no valid owner exists, this document does not permanently reserve
> files or tools for a historical thread.

## Rule

**At most one agent/session may use Blender MCP or write source GLBs in a sprint.**

Threads **A** (kit quality) and **E** (wholeship repair) compete for this lock. Thread **B** acquires it only when A/E release it.

Within the activated A–E sprint, Threads **C** and **D** do not acquire the lock because their assigned
work is integration/presentation. A later explicitly assigned Blender task may acquire it normally.

## Lock file

Path: `assets/ships/blender.LOCK`

Format (plain text):

```
owner: thread-A | agent-session-id
asset_ids: engine_vector, engine_resonator
started: 2026-07-08T14:30:00Z
heartbeat: 2026-07-08T14:45:00Z
process: blender/export process id if available
contact: optional
```

### Acquire (before first `execute_blender_code`)

1. Inspect `assets/ships/release.__building/` together with the release process and recent writes. If a
   build is live and overlaps the GLBs, coordinate or wait for its safe completion. Recover stale build
   residue only after confirming no process owns it.
2. If `blender.LOCK` exists, verify its owner/session against live Blender/export processes, recent
   writes, and agent activity. Coordinate a live owner; a stale marker does not reserve the lane.
3. When the lane is free or handed off, write `blender.LOCK` with your thread/session, planned
   `asset_ids`, start/heartbeat, and process identity where available.
4. Refresh the heartbeat during long authoring runs so another agent can distinguish live work from
   residue.

### Release (after sprint batch or handoff)

1. Finish evidence bundle per `QUALITY_RITUAL.md`.
2. Delete your `blender.LOCK`, or update it during an explicit handoff and record that handoff.
3. Do not delete a verified live owner's marker. A stale marker may be removed or replaced only after
   checking that no Blender/export process or active agent still owns the recorded paths.

## Coordination with release lock

| Lock | Meaning |
|------|---------|
| `assets/ships/blender.LOCK` | Claimed Blender/source-GLB writer; verify owner/process/heartbeat |
| `assets/ships/release.__lock/` | Claimed graphics-lane owner; verify live edits/process before excluding work |
| `assets/ships/release.__building/` | Claimed release build; verify a matching process/recent build activity |

**Order when processes overlap:** finish or hand off the live release build → Blender work → release
build → integrate. Stale directories do not add a waiting stage.

## Thread B (world places)

Thread B sprint plan is **data + concept + queue** until Blender lock free. When lock acquired:

- Prefer one place ID per sub-sprint when hero-scale review would otherwise become diffuse.
- Follow `design/world-identity/PIPELINE.md` bootstrap → promote flow.

## Violations

If two agents write overlapping GLBs concurrently, pause further writes, identify each process's exact
outputs, preserve both evidence sets, run `npm run check:asset-status`, and designate one current owner
before resuming or merging through a safe handoff. Trust filesystem/process evidence over chat claims.
