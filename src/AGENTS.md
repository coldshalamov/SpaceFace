# src/ agent orientation

Read root `AGENTS.md` first. Use `docs/MODULE_MAP.md` to select an owner, then the nearest nested
instructions. Do not infer the live backend from imports; root §5 and `core/registry.js` own selection.

## Layer boundaries

- `core/` — state, event bus, loop, registry, physics/lifetime authority.
- `systems/` — registered fixed-step systems and a few imported helpers.
- `ai/` and `combat/` — shared tactical/combat libraries used by registered systems.
- `data/` — stable IDs and data-driven definitions.
- `render/` — Three.js presentation and runtime asset integration; never owns sim results.
- `testing/lab/` — deterministic gameplay scenarios, evidence classes, equivalence, and focused
  Chromium parity; read its `AGENTS.md` and `docs/VALIDATION_WORKFLOW.md`.
- `ui/` — DOM presentation and input intents. UI may update explicitly UI/input-owned selection state
  such as `state.player.targetId`; it must not mutate gameplay-owned outcomes.
- `save/`, `audio/`, `presentation/`, `story/`, `world/` — use `docs/MODULE_MAP.md`.

## Source rules

- Sim remains deterministic and independent of Three.js.
- Cross-domain changes follow root single-writer and event/intent contracts.
- Compatibility flight/AI modules are tested paths, not the default gameplay owner.
- Verify the working-tree diff before assuming `HEAD` describes the live implementation.
- For recurring hostility, fallback, heat, save, or launcher failures, use `docs/COMMON_BUGS.md`
  before broad search.
