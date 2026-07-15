# Thread C — Backend Wiring (Runtime Maps)

## Domain (exclusive)

**Owns:** `src/render/partsLibrary.js` (slots + role maps), `src/data/sectorAnchors.js`, commodity→place spawn maps, `assets/ASSET_STATUS.json` wiring fields, handoff processing for **RELEASE_BUILT+** IDs only.

**Forbidden:** `assets/ships/parts/**` GLBs, Blender MCP, `revamp-evidence/` art passes, `vfx.js` (Thread D), sim goldens.

## Sprint scope rule

One **wiring pack** per sprint from integrator inbox:

| Sprint | Work |
|--------|------|
| C-kit-slot | Wire new manifest slot entries to `PART_LIBRARY_CONTRACT` |
| C-role-maps | Extend `*RecordFor()` (engine, weapon, fin, cockpit) |
| C-sector-pack | Wire 3 stations + 1 landmark for one sector band |
| C-asteroid-map | Map `cmdty_*` → `place_asteroid_*` in spawn path |
| C-module-vis | Wire `module_vis_*` when GLBs exist (future) |

## Task list (per handoff ID)

1. Confirm `lifecycle >= RELEASE_BUILT` in handoff YAML.
2. Add to `PART_LIBRARY_CONTRACT.slots.<slot>` if missing.
3. Add role map entry (`HULL_FILE_BY_DEF_ID`, `ENGINE_FILE_BY_*`, `PLACE_FILES`, etc.).
4. For places: update `sectorAnchors.js` `archetypeGlb` / `landmarkGlb`.
5. Run the relevant checks after the coherent change; diagnose and rerun any failure until green.
6. Update `assets/ASSET_STATUS.json` `wired` array.
7. Mark lifecycle `RUNTIME_MAP` or `VISIBLE_IN_PLAY`.

## Verification (all required)

```bash
npm run check:assets:live
npm run check:asset-reachability
npm run check:station-archetype-wiring   # if places
npm run check:sector-geography           # if anchors touched
node scripts/check-parts-manifest.mjs
```

**Do not** run release build — integrator already did.

## References

- `assets/AGENTS.md` §3 three registries
- `design/world-identity/PIPELINE.md` §7
- `HANDOFF_TEMPLATE.md`
- `INTEGRATION_GATE.md`

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread C**.
