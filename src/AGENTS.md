# src/ — Agent Notes

> **Read root `AGENTS.md` §3 (uncommitted-tree trap) + §5 (live/legacy) + §7 (bug routing) first.**
> Most core systems here have TWO implementations and the defaults pick the V3/tactical stack.
> Editing the legacy file has no effect in normal play. Full file map: `docs/MODULE_MAP.md`.
> **All claims verified first-hand 2026-07-05.**

## Live vs legacy — the short version

| System | 🟢 LIVE (default-on) | ⚪ LEGACY (don't edit) |
|---|---|---|
| Flight | `systems/flightV3.js` + `core/flight/*` | `systems/flight.js` (zero importers), `core/flightDynamics.js` (still imported by aiPorts) |
| AI | `systems/tacticalAI.js` + `ai/*` + `systems/aiPorts.js` | `systems/ai.js` (zero importers) |
| Physics | Rapier dynamic (`core/rapierCollisionWorld.js`, `core/physicsAuthority.js`) | `core/physics.js` legacy integrator |

Backend selection: `src/core/registry.js:170-186`. Defaults: `src/core/gameState.js:16`, force-stamped on every save at `src/save/saveSystem.js:1411-1413`.

**Confirm a file is live before editing:** `grep -rl "systems/<file>" src/ scripts/ test/` — if nothing imports it, it isn't running.

## The contracts that gate every change

- **Single flat `GameState`** (`core/gameState.js`) — every system reads/writes this one object. `state.input` raw axes at line 85; `state.input.actions.*` (edge verbs) created lazily at `systems/input.js:300-303`.
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
- "Attacked on spawn / friendly fire" → **subtle.** `systems/aiPorts.js:784` `isHostile` HAS the lawful+heat gate in the working tree (HEAD is team-only); there's also a squad fallback (`ai/squad.js:272`). Read `docs/COMMON_BUGS.md` §2 before grepping.
- "Model won't render" → `render/assetLoader.js:117-125` catches contract failures → returns null → silent procedural fallback. The whole-ship map (`partsLibrary.js:220`) is EMPTY; live path is modular hulls (`partsLibrary.js:202`). See `assets/AGENTS.md`.
