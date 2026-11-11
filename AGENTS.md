<!-- LIFETIME: STABLE -->
# SpaceFace agent front door

SpaceFace is a top-down 2.5D space game for browser and Electron: fly, mine, trade, fight, take
missions, upgrade, and build income in a living universe. Its core is a `GameState`, event bus, and
60 Hz simulation, separate from rendering. Read [`docs/ORIENTATION.md`](docs/ORIENTATION.md) for the
repo map; [`ARCHITECTURE.md`](ARCHITECTURE.md) is the technical contract.

**Current program (owner, 2026-11-11): [`design/program/fleet/README.md`](design/program/fleet/README.md).**
Work comes only from [`design/program/fleet/QUEUE.md`](design/program/fleet/QUEUE.md) — four lanes; an agent told
"you are Agent N" works only Lane N. The design authority is [`design/game/`](design/game/README.md).
Every older plan bank (`build_map.md`, `design/program/*.md`, `design/program/finish/**`, the INFERENCE
lanes, the EC PR descriptions) is history unless a queue row links it.

## Start by task

| Need | Start here |
|---|---|
| Any assignment, "you are Agent N", or whole-game finishing | [`design/program/fleet/README.md`](design/program/fleet/README.md) → [`QUEUE.md`](design/program/fleet/QUEUE.md) (your lane) → [`HANDOFF.md`](design/program/fleet/HANDOFF.md) |
| Repo overview or module owner | [`docs/ORIENTATION.md`](docs/ORIENTATION.md) → [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md) → nearest nested `AGENTS.md` |
| Product or system intent | [`design/game/`](design/game/README.md) first, then [`design/VISION.md`](design/VISION.md) and [`design/GDD_2_0.md`](design/GDD_2_0.md) |
| Named campaign, symptom, or special workflow | [`docs/TASK_ROUTER.md`](docs/TASK_ROUTER.md) |
| Tests and checks | `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md`; then the check relevant to the change |
| Visual asset or lighting work | [`docs/visual-assets/README.md`](docs/visual-assets/README.md); for Blender/GLB follow the Forge route it names |
| Current write claims | `design/program/NOW.md` and `node scripts/check-now-liveness.mjs`; these protect paths, not unrelated work |

Read only the relevant sections. Do not sweep design archives, assets, transcripts, or captures for
an ordinary code task.

## Authority and contracts

Follow current user direction, then `ARCHITECTURE.md` for technical invariants, `design/VISION.md`
and `design/GDD_2_0.md` for product intent, the active Finish board and selected spec, then supporting
references. [`docs/POLICY_MANIFEST.md`](docs/POLICY_MANIFEST.md) describes document roles. Live code
and relevant behavior checks establish whether descriptive claims are true.

- Keep simulation code independent of Three.js. Use `state.rng` and `state.simTime` rather than
  ambient randomness or wall time for deterministic behavior. Do not edit expected goldens to pass.
- Preserve single writers: other systems send intents/events to the canonical owner. Preserve save,
  input/rebind, and state ownership contracts.
- Player-facing work must be reachable through the ordinary route. A hidden flag, disconnected
  system, report, or test-only path is not a shipped player outcome.
- Exact asset manifests, release metadata, and runtime maps outrank prose inventories. Preserve
  authored visuals when improving performance or loading.
- Keep input reachable, text legible, and reduced-motion/flash behavior accessible. Performance
  changes must retain the visual contract; the active Finish README defines current quality targets.

## Shared checkout

Concurrent work may be newer than `HEAD`. Before editing, inspect `git status --short` and the exact
diff for each path you need. Preserve foreign changes. Ownership is path-specific and current; a
lane label or stale claim does not grant a broad subsystem lock. Use `NOW.md` and checkpoints to
resolve a real path overlap, then continue on disjoint paths.

Never use tree-wide reset, restore, clean, or stash in this shared checkout. Do not create a second
repo copy or worktree. Stage and commit only exact owned paths; never use `git add -A` or `commit -a`.
Before publishing, fetch and integrate remote changes by merge, not rebase/reset. Never force-push.
The Finish README describes current board updates and publication; it supersedes older review-queue
and provider rituals.

## Direct verification

Run the smallest check that answers the claim: a focused behavior check for an owner invariant, the
ordinary player route for a player-facing result, and a matched within-session measurement for a
performance comparison. Use the Finish Program’s batch verification rule for touched modes; do not
invent per-packet review or capture quotas. A failed result requires a relevant fix before repeating
the same check. Report implementation, focused checks, player-route evidence, and unresolved risks
separately.

For the complete operating agreement see [`docs/AGENT_OPERATIONS.md`](docs/AGENT_OPERATIONS.md).
