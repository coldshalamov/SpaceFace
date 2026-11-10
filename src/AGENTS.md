# src/ agent orientation

Read root `AGENTS.md` first. Use `docs/MODULE_MAP.md` to select an owner, then the nearest nested
instructions. Do not infer the live backend from imports; root §5 and `core/registry.js` own selection.

## Layer boundaries

- `core/` — state, event bus, loop facade, registry, physics/lifetime authority. Order and clocks:
  `src/runtime/AGENTS.md`.
- `systems/` — registered fixed-step systems and a few imported helpers.
- `ai/` and `combat/` — shared tactical/combat libraries used by registered systems.
- `data/` — stable IDs and data-driven definitions.
- `render/` — Three.js presentation and runtime asset integration; never owns sim results.
  Hazard notes also in `render/combat/`, `render/ships/`, `render/vfx/`, `render/forceLanguage/`.
- `testing/lab/` — deterministic gameplay scenarios. `testing/AGENTS.md` points at the lab.
- `ui/` — DOM presentation and input intents. UI may update explicitly UI/input-owned selection state
  such as `state.player.targetId`; it must not mutate gameplay-owned outcomes.
- `audio/`, `presentation/`, `save/`, `sim/`, `observability/` — each has an `AGENTS.md`. Audio and
  presentation do not write outcomes. Save owns the envelope. `sim/` is tapes and pure projections.
- `world/`, `story/`, `characters/`, `nemesis/`, `chronicler/`, `onboarding/`, `localization/` —
  libraries. The registered writers stay in `systems/`. Read the folder note before editing.
- `economy/`, `missions/`, `contracts/`, `careers/`, `balance/` — pure math, schemas, or harnesses.
  `missions/AGENTS.md` also covers `law/` and `physicalCargo/` (too small for their own note).
- Credits, cargo, WANTED heat, reputation, and derived ship stats still have one writer each in
  `systems/`. These folders return numbers or intents.

## Source rules

- Sim remains deterministic and independent of Three.js.
- Cross-domain changes follow root single-writer and event/intent contracts.
- Compatibility flight/AI modules are tested paths, not the default gameplay owner.
- Verify the working-tree diff before assuming `HEAD` describes the live implementation.
- For recurring hostility, fallback, heat, save, or launcher failures, use `docs/COMMON_BUGS.md`
  before broad search.
