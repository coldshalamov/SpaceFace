# Thread E — Wholeship Repair (Blocked Heroes)

> **Manual sprint lane.** This scope is exclusive only while Thread E is explicitly activated and its
> ownership signal is live. Verify each exact whole-ship route and status from current manifests and
> checks; this historical thread title is not family-wide status.

## Domain (exclusive)

**Owns:** `wholeships/kestrel.glb`, `pelican.glb`, `wasp.glb` source + repair evidence. Blender lock **instead of** Thread A for this sprint.

**Forbidden:** Other kit parts (defer to A), runtime wiring until integrator clears `status:blocked`, `WHOLE_SHIP_FILE_BY_DEF_ID` edits (Thread C after repair).

## Preconditions

This thread began when several candidates were accessory-only, but whole-ship routing has since changed.
Inspect the live manifest/classification, `WHOLE_SHIP_FILE_BY_DEF_ID`, and player route before selecting work.
Do not overwrite or disconnect a current production Kestrel or Wasp route to match the dated diagnosis. Repair
only a currently incomplete candidate and do not wire it until the live body/classification and asset checks
pass.

## Sprint scope

Prefer one wholeship per sprint so a hero-scale repair receives coherent review and evidence.

## Task list

1. Read `assets/ships/AGENTS.md`, `docs/visual-assets/README.md`,
   `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`, and
   `.grok/skills/spaceface-blender-material-truth/SKILL.md`; complete the material-truth preflight for
   the exact changed whole-ship components.
2. Pause Thread A — acquire `blender.LOCK` as Thread E.
3. Round-trip through `spaceface_export.py` with a credible complete `Material_Hull` body. The live contract
   owns exact validation thresholds.
4. Bake AO/roughness/normal per contract.
5. Use `QUALITY_RITUAL.md` until the complete ship reads professionally at the player camera and independent
   review finds no material gaps.
6. Update manifest `statusNote` only via integrator after checks pass.
7. Handoff YAML with `blocked: false` only after exporter + hull audit green.
8. Release lock → Thread A may resume.

## Verification

```bash
npm run check:asset-status
npm run check:assets:live
npm run check:sg04-release-assets
```

Thread C wires `WHOLE_SHIP_FILE_BY_DEF_ID` **only after** integrator + checks.

## References

- `design/spec3/SPEC3-F9-asset-pipeline.md` §SPEC3-37 step 2
- `assets/AGENTS.md` §2.1 blocked wholeships
- `docs/visual-assets/README.md`
- `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`
- `.grok/skills/spaceface-blender-material-truth/SKILL.md`
- `FULL_GRAPHICS_REVAMP_GOAL.md` Batch 5

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread E**.
