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

When an agent begins editing, it adds its own short exact-path row to `NOW.md`; when mutation stops,
it removes that row. The finishing agent updates only status artifacts proportionate to the actual
claim. Research, reading, testing, and review do not reserve files, and in-repo work is not declared
blocked merely because another thread exists.

Keep global state out of packet prose. Link receipts instead of copying test transcripts and incident
histories into queue rows. A green check proves only its contract; it does not prove visual quality,
discoverability, reachability, performance, or fun unless those are the contract it actually exercises.
