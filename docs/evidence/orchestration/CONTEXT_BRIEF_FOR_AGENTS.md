# Compressed context for dispatched agents

## What SpaceFace is

Three.js browser/Electron space game. Flat GameState, event bus, systems registry, 60 Hz fixed sim. XZ plane. Determinism via `state.rng` / `state.simTime`. Default flight: `flightV3.js`. Default AI: `tacticalAI.js`. Physics: rapier-dynamic.

## Authority

user → ARCHITECTURE.md → GDD_2_0 → design/program → activated plan. Live checks outrank prose.

## Current multi-agent campaign goal

Bring SpaceFace to modern Steam space-game polish: Depth “galaxy keeps receipts” player-visible, plus polish/expansion where weak — **without** colliding with graphics worktree.

## Already done in depth worktree (do not redo)

- F2 soak global coords, GT1 table pin, SP1 destStation, K1 EMP dmg
- A2 pause Ship's Ledger
- S4 titles registered
- A1 physical Quiessence (Pallas + 17 hulls) and Hush (Eunomia)

## Key paths

| Concern | Path |
|---|---|
| Registry order | src/core/registry.js |
| Unique wrecks | src/systems/uniqueWrecks.js, src/data/uniqueWrecks.js |
| Encounters | src/systems/encounterDirector.js, src/data/encounters/* |
| Band | src/systems/bandRadio.js |
| Ledger | src/systems/shipLedger.js, src/ui/screens/shipLedgerScreen.js |
| Titles | src/systems/titles.js |
| World POIs | src/systems/world.js, src/data/sectors.js, src/data/frontierRegions/* |
| Mining | src/systems/mining.js, drill.js (polish only) |
| Flight | src/systems/flightV3.js, src/core/flight/* |
| Depth checks | npm run check:depth-program:* |

## Coordinates

Authored zone/POI centers are often **sector-local**. Live entities use **galactic-global** via `sectorLocalToGlobalForSector` from `src/data/sectorCoordinates.js`.

## Failure classes

REAL | STALE | HARNESS — see 01_LIVE_TRUTH.md examples.

## Graphics fence

Do not edit assets/ships production remasters, thruster textures, or presentation-heavy render paths owned by `codex/graphics-overhaul`.
