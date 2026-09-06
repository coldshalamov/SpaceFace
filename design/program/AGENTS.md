<!-- LIFETIME: STABLE -->
# `design/program/` agent notes

This tree owns admitted roadmap work, bounded autonomous INFERENCE work, brief mutation coordination,
and exact-revision status. It does not replace source plans or live code.

- Start at [`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md).
- Read [`NOW.md`](./NOW.md) only for threads mutating now and exact dirty hunks that must be preserved.
- For `NEXT` / a named `PQ-*`, read the queue row, exactly one active packet, and
  [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md).
- For leftover worktrees / unused models, follow
  [`ORPHAN_HARVEST_PLAYBOOK.md`](./ORPHAN_HARVEST_PLAYBOOK.md). Do not invent a
  new parking lot.
- For `INFERENCE N ...`, follow [`INFERENCE_LANES.md`](./INFERENCE_LANES.md). Do not silently convert
  autonomous production into a PQ campaign or acceptance-infrastructure campaign.
- Run `node scripts/check-inference-control.mjs` after changing the INFERENCE control surface.

## Production-first invariant

For autonomous or multi-unit work, production means a committed change to runtime code, game data,
shipped assets, or live asset integration that changes what the player can perceive or do.

Documentation, candidate lists, receipts, reviews, tests, probes, validation manifests, harnesses,
status rows, and acceptance infrastructure are support work. They never count as production units.

An `INFERENCE N` task executes units sequentially. Finish and commit one coherent production slice,
record it as `implemented` or `accepted`, then select the next. The one-unit rule in the canonical map
means one unit at a time and one focused commit at a time; it does not truncate a user-requested
multi-unit task after the first unit.

Do not build new acceptance infrastructure unless the user explicitly asked for it or it is the
narrowest necessary way to verify the current production claim. Additional support work requires a
named load-bearing uncertainty and a possible material delta. A unit may terminate honestly as
`implemented` after sufficient direct verification, with a broader route claim remaining `unproven`
or `focused_green`; route acceptance is a separate axis and may remain open.

Lifecycle and acceptance are independent. `integrated` does not imply `route_accepted`; `implemented`
does not imply wired; an asset may be source-complete while runtime-unproven. Use exact labels and
never compress these distinctions into “done.”

When an agent begins editing, it creates one local checkpoint with
`node scripts/agent-checkpoint.mjs start`, containing 5–10 exact, bounded todos and every path it
will mutate. A multi-task session may reserve the current task plus at most four next tasks with
repeated `--reserve` flags; that is lookahead intent, not task-long ownership. It then adds a short
exact-path row to `NOW.md` with the checkpoint path in a backtick cell. At each meaningful todo
boundary it runs `agent-checkpoint.mjs check`; this is not a heartbeat and does not require periodic
file churn. When mutation stops, it removes the NOW row. A checkpoint with no progress for 90 minutes
is stale by definition: the next agent inspects the diff, adopts the checkpoint, preserves the
existing hunks, and continues the same task. It does not create a parallel implementation or revert
work because the original thread disappeared. Rows without checkpoints use the legacy path-mtime
fallback and are not permanent ownership.

`node scripts/program-dispatch.mjs --next` skips fresh lookahead reservations; `--ready` annotates
them. At each task boundary, close the current checkpoint and start the next one before mutating. If
another live agent claims a future reservation, re-plan around it rather than contesting its files.

The finishing agent updates only status artifacts proportionate to the actual claim. Research,
reading, testing, and review do not reserve files, and in-repo work is not declared blocked merely
because another thread exists. No human verdict is an execution gate: convert legacy human/owner
review wording into an independent agent review against the named evidence and record the residual
honestly. Only an explicit user-requested external action may remain deferred.

Keep global state out of packet prose. Link receipts instead of copying test transcripts and incident
histories into queue rows. A green check proves only its contract; it does not prove visual quality,
discoverability, reachability, performance, or fun unless those are the contract it actually exercises.
