# src/ — Agent Notes

> **Read root `AGENTS.md` §3 (uncommitted-tree trap) + §5 (live/legacy) + §7 (bug routing) first.**
> Most core systems here have TWO implementations and the defaults pick the V3/tactical stack.
> Editing the legacy file has no effect in normal play. Full file map: `docs/MODULE_MAP.md`.
> Verify claims against the working tree; implementation and line numbers move quickly.

## Live vs legacy — the short version

| System | 🟢 LIVE (default-on) | ⚪ LEGACY (don't edit) |
|---|---|---|
| Flight | `systems/flightV3.js` + `core/flight/*` | `systems/flight.js`, `core/flightDynamics.js` (default-off compatibility/CI paths) |
| AI | `systems/tacticalAI.js` + `ai/*` + `systems/aiPorts.js` | `systems/ai.js` (default-off compatibility/CI path) |
| Physics | Rapier dynamic (`core/rapierCollisionWorld.js`, `core/physicsAuthority.js`) | `core/physics.js` legacy integrator |

Backend selection: `core/registry.js` (`selectAISystem`, `selectFlightSystem`). Defaults live in
`core/gameState.js` and are force-stamped during save normalization in `save/saveSystem.js`.

**Confirm the selected runtime before editing.** Both legacy controllers are statically imported by
`core/registry.js` and directly exercised by compatibility checks; import presence alone does not mean
the controller is selected in default play.

## The contracts that gate every change

- **Single flat `GameState`** (`core/gameState.js`) — every system reads/writes this one object. Raw
  axes live on `state.input`; edge verbs live on `state.input.actions.*` and are created by `systems/input.js`.
- **Event bus** (`core/eventBus.js`) — cross-system comms. Names are `domain:verb`, lowercase, `:`-delimited.
- **Single-writer ownership** (ARCHITECTURE §0.6): credits→`economy`, rep→`factions`, cargo→`cargo`, derived stats→`ships`, WANTED heat→`heat`, sector owner→`factions`.
- **Sim never imports Three.js.** UI emits intents only. XZ plane, y=0. `Math.random()` forbidden in sim (use `state.rng`).
- **60 Hz fixed-timestep** (`core/loop.js`); determinism gated by the 47a golden replay. Update order in `AGENTS.md` §8.

## Subdirectory maps

- `src/systems/AGENTS.md` — flight, AI, combat, mining, economy, world (the sim systems)
- `src/render/AGENTS.md` — renderer, asset loader, VFX, the asset pipeline runtime side
- `src/ui/AGENTS.md` — HUD, screens, radar, accessibility
- `src/core/`, `src/data/`, `src/save/`, `src/audio/`, `src/combat/`, `src/ai/`, `src/presentation/` — see `docs/MODULE_MAP.md`.

## Where to look for the common bugs

`docs/COMMON_BUGS.md` has full playbooks. Quick routing:
- "Fix didn't apply" → (a) you edited a legacy file (table above), OR (b) the fix already exists in the uncommitted working tree — `git diff <file>` first.
- "Attacked on spawn / friendly fire" → **subtle.** The final engagement gate and hostility oracle
  live in `ai/engagementAuthority.js`; `systems/aiPorts.js` consumes them. Read `docs/COMMON_BUGS.md`
  §2 before changing squad votes, teams, heat, or station protection.
- "Model won't render" → `render/assetLoader.js` records validation/load failure and returns `null`,
  retaining a procedural fallback. `render/partsLibrary.js` currently routes production whole-ship
  bodies for Kestrel and Wasp; other definitions use modular hull mappings. See `assets/AGENTS.md`.
