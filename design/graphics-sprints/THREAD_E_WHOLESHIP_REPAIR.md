# Thread E — Wholeship Repair (Blocked Heroes)

## Domain (exclusive)

**Owns:** `wholeships/kestrel.glb`, `pelican.glb`, `wasp.glb` source + repair evidence. Blender lock **instead of** Thread A for this sprint.

**Forbidden:** Other kit parts (defer to A), runtime wiring until integrator clears `status:blocked`, `WHOLE_SHIP_FILE_BY_DEF_ID` edits (Thread C after repair).

## Preconditions

Current manifest status:

| ID | Issue |
|----|-------|
| wholeship_kestrel | Accessory-only — 0 hull body tris |
| wholeship_pelican | Same |
| wholeship_wasp | Same |

Do **not** wire until `check:assets:live` passes with real hull bodies.

## Sprint scope

**One wholeship per sprint** (hero complexity — 20+ iterations each).

## Task list

1. Pause Thread A — acquire `blender.LOCK` as Thread E.
2. Round-trip through `spaceface_export.py` with full hull body (≥800 Material_Hull tris).
3. Bake AO/roughness/normal per contract.
4. **20 iterations** minimum per wholeship (`QUALITY_RITUAL.md`).
5. Update manifest `statusNote` only via integrator after checks pass.
6. Handoff YAML with `blocked: false` only after exporter + hull audit green.
7. Release lock → Thread A may resume.

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
- `FULL_GRAPHICS_REVAMP_GOAL.md` Batch 5

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread E**.