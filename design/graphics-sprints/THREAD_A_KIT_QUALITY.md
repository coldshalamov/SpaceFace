# Thread A — Kit Quality (Modular Parts Surfacing)

## Domain (exclusive)

**Owns:** Blender MCP (via lock), source GLBs for manifest kit parts, `revamp-evidence/**`, `.blend` saves under `assets/ships/parts/blender/`.

**Forbidden:** `src/render/**`, `src/data/**`, `parts_manifest.json` (integrator only), `release/` hand edits, Thread B/C/D/E scopes.

## Sprint scope rule

One **category** per sprint (not the whole 63 at once):

| Sprint example | IDs from `needed-assets.md` §A |
|----------------|--------------------------------|
| A-engines | 6 engines |
| A-weapons | 6 weapons |
| A-hulls-batch1 | hull_starter, hull_fighter, hull_interceptor |
| A-fins-greebles | 6 fins + 7 greebles |

## Task list (per asset)

1. Read story role from `needed-assets.md` for this `id`.
2. Load concept/bible refs per `spaceface-blender-pipeline` SKILL.
3. Acquire `assets/ships/blender.LOCK` (Thread A).
4. Inspect current GLB + MCP renders → `deficiency.md` iter0.
5. Use `QUALITY_RITUAL.md` to critique and improve modeling, surfacing, and life until independent review
   supports the professional outcome.
6. Export via `spaceface_export.py` / `finalize_part.mjs`.
7. Write handoff YAML (`HANDOFF_TEMPLATE.md`).
8. Release Blender lock.

## Verification

| Gate | When |
|------|------|
| Representative neutral, lit, detail, and player-route evidence | Before handoff |
| Independent visual review addresses material gaps | Before handoff |
| Exporter assertions green | Before handoff |
| Integrator: `INTEGRATION_GATE.md` | After handoff (not your job) |

## References

- `FULL_GRAPHICS_REVAMP_GOAL.md`
- `needed-assets.md` §A
- `.grok/skills/spaceface-blender-pipeline/SKILL.md`
- `assets/AGENTS.md` §3 registries (read only — do not edit)

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread A**.
