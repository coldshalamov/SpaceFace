# FLEET BREADTH FOUNDRY — common contract (read first)

You are one lane of a multi-agent asset-production batch for **SpaceFace**, a Three.js
top-down space game. The batch goal: make the game feel materially broader and less
repetitive using the assets it already has. Ships are seen from a steep top-down camera
at roughly 60–150 px on screen; the DORSAL (top) surface is what the player sees.

## Workspace

- Work ONLY inside `C:\Users\93rob\sf-fleet-breadth` — an isolated git worktree on branch
  `codex/fleet-breadth-foundry-20260720` (base master c740ae01).
- NEVER touch the primary checkout `C:\Users\93rob\Documents\GitHub\SpaceFace` or any other
  worktree (`sf-pq011`, `SpaceFace-graphics-overhaul`).

## Hard rules

1. Create NEW files only, under the foundry paths named in your task. NEVER modify:
   `assets/ships/parts/parts_manifest.json`, anything under `assets/ships/release/`,
   `src/render/partsLibrary.js`, `src/render/visualFactory.js`, `src/core/registry.js`,
   `src/core/gameState.js`, anything under `design/program/`, or ANY existing source file.
2. NEVER run git write commands (add / commit / reset / restore / checkout / stash / clean).
   Read-only git (`status`, `log`, `diff`) is fine. The orchestrator stages and commits.
3. Never delete or overwrite a file you did not create in this session.
4. **Determinism:** every generator must be fully seeded — no wall-clock time, no unseeded
   random, no uuid, no dict-iteration-order dependence. Running your generator twice must
   produce byte-identical outputs.
5. Honesty: report failures as failures. A red check + honest report beats a green lie.

## Environment facts

- Windows 11. Blender 5.1.2 at `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`.
  Headless: `blender -b --factory-startup -P script.py -- [args]`. Headless CYCLES rendering
  works (verified). glTF export: `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB',
  export_yup=True, export_apply=True)`.
- Node 22 (`node`). The worktree has its own `node_modules` (three, @gltf-transform, pngjs…).
- Python 3.14 (`python`) with PIL/Pillow 12.2 available.

## Foundry layout (already created)

- `assets/ships/foundry/fleet_breadth_20260720/{kit,materials,textures,variants,scenery}/` — candidate assets
- `tools/foundry/{kitgen,texgen}/` — generation + validation scripts
- `design/foundry/` — design documents
- `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/{reports,renders}/` — evidence

## Art-direction constitution

- Detail must communicate **construction and maintenance** — how a thing is joined,
  reinforced, serviced, fabricated. No random greebles, no noise-as-detail.
- **SAME NEED, DIFFERENT ANSWER:** the organizing principle of this batch. Every family
  answers one engineering need several structurally different ways (e.g. a panel repair is
  a color-matched replacement plate for a navy, a riveted overplate for miners, a welded
  scrap patch for pirates). Variation must be construction, not tint.
- Detail must survive gameplay distance: bold reads (panel splits, big fasteners, trim
  bands) over micro-noise that shimmers or vanishes under mipmapping.
- A rectangular bar is not finished because its corners are rounded. Show how it is joined,
  reinforced, serviced.

## Finish protocol

When done, write `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/reports/<LANE>-REPORT.md`:
deliverable list with exact paths, commands you ran with exit codes, self-identified defects
or shortcuts, and anything unfinished. Do not stop early: if a step fails, debug and retry
until your check passes or you have exhausted genuinely different approaches (document each).
# LANE A — LIVE REPETITION AUDIT (read-only)

Read `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/briefs/common.md` first and
obey it. This lane is **strictly read-only on game source**: you write ONLY your two output
files + your report.

## Mission

Determine, from live runtime mappings and default-route content — NOT from filenames or
prose docs — what the player actually sees repeated, so downstream lanes know which donors
to vary first. Every claim about a runtime mapping must carry a `file:line` citation.

## Required reading (trace the actual code paths)

1. `src/render/partsLibrary.js` — ALL selection maps: hull-by-defId, whole-ship map,
   role/archetype maps, station archetype files, place files, the generic seed-pick pools,
   `paletteFor`, part scaling rules, LOD handling. This file is large; read it thoroughly.
2. `src/render/visualFactory.js` — which procedural props/stations appear and when the
   procedural fallback shows instead of authored assets.
3. `src/data/factions.js`, `src/data/palettes.js` — faction ids, palettes, paint profiles.
4. `src/data/sectorAnchors.js` + `src/data/frontierRegions/*.js` — every station/place
   anchor with its `archetypeGlb`, sector, and owning faction.
5. `src/systems/world.js` — what spawns on the default route (stations, squads, mining
   traffic, props): which ship defIds, which factions, what counts/weights.
6. Spawn/encounter systems (`src/systems/` — spawnBudget / encounterDirector / ambient
   traffic if present) — which ship defIds each faction actually flies, how often.
7. Ship def sources (wherever defIds map to hulls/roles — e.g. combat/ship def data files).
8. `assets/ships/parts/parts_manifest.json` — READ ONLY — per-part tris/bytes/dims/materials.

## Deliverable 1: `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/repetition-audit.json`

```json
{
  "generatedFrom": "codex/fleet-breadth-foundry-20260720 @ c740ae01",
  "donors": [
    {
      "runtimeId": "hull_fighter",
      "kind": "part|wholeship|place|prop",
      "sourcePath": "assets/ships/parts/hulls/hull_fighter.glb",
      "releasePath": "assets/ships/release/parts/hulls/hull_fighter.glb",
      "manifestMapping": "parts_manifest.json entry summary",
      "runtimeSelection": [{"map": "HULL_FILE_BY_DEF_ID", "cite": "partsLibrary.js:NNN", "defIds": ["..."]}],
      "factionsUsing": ["faction_scn", "..."],
      "rolesUsing": ["patrol", "..."],
      "routeFrequencyEstimate": "how often + WHY (spawn weights, sector counts, cite)",
      "visibleDeficiencies": ["single uniform material over N units", "..."],
      "recommendedReuseStrategy": "e.g. armor-overlay variants ×3 factions; keep silhouette",
      "constraints": {"sockets": [], "pivots": "", "scaleRule": "", "lod": "", "materials": []}
    }
  ],
  "repetitionFindings": {
    "mostRepeatedShipHulls": [],
    "mostRepeatedParts": {"engines": [], "fins": [], "rails": [], "weapons": [], "pods": [], "greebles": []},
    "factionsSharingSilhouettes": [{"factions": [], "sharedAsset": "", "cite": ""}],
    "oversizedSingleMaterials": [{"asset": "", "evidence": "manifest dims/tris vs material count"}],
    "primitiveBarMeshes": [],
    "largestRepeatedFieldProps": [{"asset": "", "where": "", "approxInstanceCount": ""}],
    "detailSurvivability": "which existing details are visible at gameplay distance and which vanish"
  },
  "top10VariationTargets": [{"runtimeId": "", "why": "", "suggestedFamilies": []}]
}
```

Rank `donors` by route frequency × visibility. Include AT LEAST: the top 6 ship
hulls/wholeships actually spawned, the top engines/fins/weapons picked by the seed pools,
every station archetype used by ≥2 factions, and the 4 most-instanced scenery props.

## Deliverable 2: `.../repetition-audit.md`

Human-readable: a one-page executive summary (what a player sees repeated in their first
30 minutes), the top-10 variation targets with reasoning, and a "faction sameness table"
(which factions currently look like recolors of each other and where).

## Method rules

- NEVER infer runtime use from a filename or from `needed-assets.md` prose. If a GLB exists
  but no live map references it, record it as `"runtimeSelection": []` (unreferenced).
- Distinguish "mapped" from "actually spawns on the default route" — a map entry that no
  spawner selects is not repetition the player sees.
- If a mapping is ambiguous, say so explicitly rather than guessing.
- You may run read-only node one-liners (e.g. to parse JSON manifests) but do not install
  anything and do not modify any file outside your two deliverables + report.

Finish per the common finish protocol (report file: `reports/A-AUDIT-REPORT.md`).
