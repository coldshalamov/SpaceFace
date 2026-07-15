# Thread D — Presentation Code (VFX, Feel, Maps)

> **Manual sprint lane.** This scope is exclusive only while Thread D is explicitly activated and its
> ownership signal is live; it is not a permanent prohibition for later coherent work.

## Domain (exclusive)

**Owns:** `src/render/vfx.js`, `src/render/vfxProfiles.js`, `src/render/feel.js`, `src/render/spaceBackground.js` (sector mood only), `src/systems/presentationOrchestrator.js` consumers, commodity visual mapping in `world.js` / `visualFactory.js` **only when not touching GLBs**.

**Forbidden:** `assets/**`, Blender, `partsLibrary.js` (Thread C), `parts_manifest.json`, `test/*.expected.json`, `src/systems/input.js`.

## Sprint scope rule

One **presentation vertical** per sprint:

| Sprint | Deliverable |
|--------|-------------|
| D-projectile-trails | Trail wisps per weapon class in vfx update loop |
| D-impact-families | Shield/hull/EMP/explosive impact differentiation |
| D-tier-greebles | Use `ships.js` `visuals.tiers` in composition hints (coordinate C) |
| D-asteroid-surface | Commodity → procedural surface variant (no new GLB) |
| D-beam-sustain | Lighter per-tick beam muzzle + sustain slit |

## Task list

1. Read root `AGENTS.md` for the non-diegetic HUD and performance rules, then the activated presentation spec.
2. Implement smallest diff for sprint vertical.
3. Run the checks that cover the changed presentation seam; fix failures and rerun:

```bash
node scripts/check-sg08-render-vfx.mjs
npm run check:juce-contract   # if juice-related
npm run check:vfx-sleep
npm run check:visual-stability   # if render-visible
```

4. Capture `.devshots/thread-D/<sprint>/wide.png` + `close.png` if visual.
5. Document profile/behavior in handoff note (no YAML unless C dependency).

## Verification bar

- Checks green (evidence in terminal output).
- No silent quality reduction (forbidden per `AGENTS.md` performance policy).
- `Math.random()` only in render/vfx (cosmetic).

## References

- `design/spec3/SPEC3-F8-graphics-visuals.md`
- `src/data/combatDefs.js` `WEAPON_CUE_TABLES`
- `QUALITY_RITUAL.md` Thread D section

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread D**.
