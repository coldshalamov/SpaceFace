# WAKE REPORT — depth-research handoff

**Checkpoint date:** 2026-07-13
**Status:** Research corpus and planning handoff present; implementation and player-facing acceptance remain governed by the live ledgers.
**Scope of this report:** Documentation state only. It does not claim a clean working tree, a specific revision, current branch parity, green runtime checks, accepted assets, or completed alpha/depth milestones.

## Durable result

The repository now contains two clearly separated research layers:

| Layer | Use | Trust boundary |
|---|---|---|
| `design/depth-program/research/verified/` | Source-grounded professional-game comparisons, SpaceFace baseline, synthesis, candidate pools, and production pipeline | Primary research evidence; implementation status still comes from live code, checks, and player-facing evidence. |
| `design/vision/ASSET_DEPTH_AND_PIPELINE_PLAN.md` and `design/vision/research/` | Earlier concept catalogues and design hypotheses | Legacy reference only. Exact counts, statistics, completeness labels, asset-license conclusions, and uncited game details require revalidation. |

The useful professional-game lessons preserved across the verified corpus include:

- Freelancer's placed wreckage and rumor chain as progression rather than decoration.
- Starsector's declarative faction identity and doctrine data.
- Naev's self-registering content and separation of authored events from engine code.
- Endless Sky's faction/species partitioning and dense prose/content layer.
- Distinct landmarks, named contacts, faction kits, encounter grammars, and persistent aftermath as higher-value depth than undifferentiated asset volume.

These are research inputs, not instructions to copy another game's presentation or mechanics unchanged.

## What is not established by this documentation

- No external asset is approved for reuse merely because a project or marketplace appears in a source list. File-level provenance and license compatibility remain mandatory.
- No fixed triangle or texture ceiling is accepted. Asset quality and performance must be evaluated in the actual browser/Electron route with representative scenes and quality-preserving optimization.
- The 25 legacy concepts are candidates, not registered factions, locations, wrecks, landmarks, or props.
- The depth program is not complete. `design/depth-program/PROGRESS_LEDGER.md` is the dated execution record and currently requires implementation evidence for its packets.
- No runtime check result is refreshed by this docs-only reconciliation. Run the checks named by the active implementation packet when its code or assets change.

## Current handoff route

1. Read `design/vision/ALPHA_PROGRAM.md` for the active milestone and unresolved player-visible work.
2. Use `design/depth-program/BUILD_PLAN.md` for packet scope and dependencies.
3. Use `design/depth-program/research/verified/README.md` to trace recommendations back to evidence.
4. Record real implementation progress in `design/depth-program/PROGRESS_LEDGER.md` with checks and player-facing evidence.
5. Require independent visual acceptance before any Blender candidate becomes release truth.

This is the truthful status as of the checkpoint date: the research and planning foundation exists; the game-building work continues through the active ledgers.
