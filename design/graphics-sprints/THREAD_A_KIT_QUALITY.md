<!-- LIFETIME: HISTORICAL -->
<!-- Superseded lane brief. EXPANSION_PROGRAM.md supplies research context and TOP10_ROI_ASSET_PLAN.md a measured ranking; neither dispatches work. Archaeology and technical reference only; it cannot direct implementation unless explicitly reactivated through an admitted packet. -->
# Thread A — Kit Quality (Modular Parts Surfacing)

> **Manual sprint lane.** This scope is exclusive only while Thread A is explicitly activated and its
> ownership signal is live; it is not a permanent prohibition for later coherent work.

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

1. Read `assets/ships/AGENTS.md`, `docs/visual-assets/README.md`,
   `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`, and
   `.grok/skills/spaceface-blender-material-truth/SKILL.md`.
2. Read story role from `needed-assets.md` for this `id`, then complete the material-truth preflight
   for every changed camera-visible component or repeated family.
3. Load concept/bible refs per `spaceface-blender-pipeline` SKILL. If the selected
   component-reference method needs image generation and this worker lacks it, use
   `docs/visual-assets/AGENT_PROMPTS.md` § E.
4. Acquire `assets/ships/blender.LOCK` (Thread A).
5. Inspect the current GLB and representative renders; record only the material player-facing or
   contract defects that the evidence actually demonstrates.
6. Use `QUALITY_RITUAL.md` to critique and improve modeling, surfacing, and life until independent review
   supports the professional outcome.
7. Export via `spaceface_export.py` / `finalize_part.mjs`.
8. Write handoff YAML (`HANDOFF_TEMPLATE.md`).
9. Release Blender lock.

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
- `docs/visual-assets/README.md`
- `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`
- `.grok/skills/spaceface-blender-material-truth/SKILL.md`
- `.grok/skills/spaceface-blender-pipeline/SKILL.md`
- `assets/AGENTS.md` §3 registries (read only — do not edit)

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread A**.
