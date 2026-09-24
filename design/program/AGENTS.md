<!-- LIFETIME: STABLE -->
# `design/program/` agent notes

Admitted roadmap work, bounded INFERENCE work, and short mutation coordination. Not a replacement
for source plans or live code.

- Start at [`../../build_map.md`](../../build_map.md). Named doors:
  [`../../docs/TASK_ROUTER.md`](../../docs/TASK_ROUTER.md).
- [`NOW.md`](./NOW.md) records exact dirty hunks being mutated now — not a task-long lease.
- `NEXT` / a named `PQ-*`: queue row, exactly one active packet, and
  [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md).
- Leftover worktrees / unused models: [`ORPHAN_HARVEST_PLAYBOOK.md`](./ORPHAN_HARVEST_PLAYBOOK.md).
- `INFERENCE N ...`: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md). An OPEN line in
  [`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md) is the grunt assignment — do that line.
  Open feelings are `build_map.md` §23, not this pass. Do not convert autonomous
  production into a PQ or acceptance-infrastructure campaign.
- After changing the INFERENCE control surface: `node scripts/check-inference-control.mjs`.
- Checkpoints, NOW liveness, and tree safety: root `AGENTS.md` §3 and
  [`../../docs/AGENT_OPERATIONS.md`](../../docs/AGENT_OPERATIONS.md). Do not restate them here.

## Production-first invariant

For autonomous or multi-unit work, production means a committed change to runtime code, game data,
shipped assets, or live asset integration that changes what the player can perceive or do.
Documentation, receipts, reviews, tests, probes, harnesses, and status rows are support work and
never count as production units.

An `INFERENCE N` task finishes and commits one coherent production slice, then selects the next.
The one-unit rule means one focused commit at a time; it does not truncate a user-requested
multi-unit task after the first unit.

Do not build new acceptance infrastructure unless the user asked for it or it is the narrowest way
to verify the current production claim. Lifecycle and acceptance are independent: `integrated` does
not imply `route_accepted`; `implemented` does not imply wired. Use exact labels.

Keep global state out of packet prose. Link receipts. A green check proves only its contract.
