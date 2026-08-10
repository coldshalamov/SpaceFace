<!-- LIFETIME: STABLE -->
# SpaceFace program control surface

This directory is the only whole-program status and acceptance surface. It separates short live
mutation windows, machine-indexed work, executable packets, and retained evidence so an agent can
orient without ingesting the repository's history.

## Read by need

| Need | Read |
|---|---|
| Make the game richer (NPCs, enemies, sectors, economy, story, graphics, VFX, audio, feel, content, a slice) | [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) — reusable `WF-01`–`WF-19` workflows and `1x`/`3x`/`5x` scale; concrete work still flows through the queue below |
| Close the gap between the build and the owner's vision (combat feel, visual energy, living world, rewards) | [`VISION_ALIGNMENT_PLAN.md`](./VISION_ALIGNMENT_PLAN.md) — audited file-level gap map, the Big Five unlocks, phased fixes |
| Copy-ready prompt for any thread | [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md) |
| First exact ready unit, every ready unit, or one parent row | `node scripts/program-dispatch.mjs --next`, `--ready`, or `--id PQ-XXX` |
| Threads editing now and exact dirty hunks to preserve | [`NOW.md`](./NOW.md) |
| Maintain stable packet IDs, dependencies, broad checks/evidence | [`roadmap/program-queue.json`](./roadmap/program-queue.json) |
| Executable instructions for admitted packets | [`roadmap/active/README.md`](./roadmap/active/README.md) |
| Finite implementation/review/verification protocol | [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md) |
| Verified outcomes | [`01_VERIFIED_DONE.md`](./01_VERIFIED_DONE.md) |
| Admitted remaining work | [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) |
| Live acceptance evidence | [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md) |
| Worktree/integration history when specifically needed | [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md) |
| Retained unscheduled ideas | [`06_RETAINED_FUTURE_BACKLOG.md`](./06_RETAINED_FUTURE_BACKLOG.md) |
| Plan-family navigation | [`PROGRAM_MAP.md`](./PROGRAM_MAP.md) |

## State model

Lifecycle and acceptance are tracked separately:

- lifecycle: `planned`, `ready`, `claimed`, `implemented`, `integrated`, plus `blocked`, `deferred`, `historical`;
- acceptance: `unproven`, `focused_green`, `route_accepted`, `milestone_accepted`.

Never infer one axis from the other. A source asset can be implemented but not runtime-wired.
Integrated code can retain an open route or visual acceptance debt. The legacy `blocked` value is
retained for schema compatibility and has no current queue rows. Human-only action uses `deferred`;
another thread, an in-repo dependency, a dirty unrelated path, Blender, a GPU, or a missing in-repo
implementation never becomes durable task status.

The queue's parent `state` field is a transitional legacy value and can contain acceptance-like
labels. Exact `dispatchUnits` own claimability, dependencies, and terminal receipt references. Use
the active packet and exact-revision receipts for separate claims; the compact dispatch command
labels the parent field accordingly and omits narrative payloads.

## Maintenance

- `NOW.md` contains only active mutation rows, exact dirty-hunk preservation notes, brief publication windows, and an expiry marker.
- Queue rows stay compact over time; exact dispatch units link receipts instead of embedding incident histories and test transcripts.
- Active packets are the implementation handoff. Retire or replace them when the live seam changes materially.
- The finishing agent updates its packet checkboxes, receipt, exact queue row, and affected global
  status in one bounded transaction. It reports `DONE` or `NOT DONE`; no coordinator handoff is needed.
- Run `node scripts/check-program-docs.mjs` after changing these control surfaces.
