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
# LANE G — FLEET COMPOSITION MATRIX (machine-readable breadth demonstration)

Read `briefs/common.md` first and obey it. You produced the Lane A audit; this lane turns it
into the integration blueprint. Read: `repetition-audit.json` (yours),
`design/foundry/FACTION_SURFACE_LANGUAGE.md` (esp. §12 module preferences + consumption notes),
`assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json`,
`tools/foundry/kitgen/kit_manifest.json` (wait for it to exist), the variant candidates in
`assets/ships/foundry/fleet_breadth_20260720/variants/` + `variants_manifest.json`, the decal
atlas `textures/decals_atlas.json`, and the LIVE composition grammar in
`src/render/partsLibrary.js` (whole-ship maps, modular def maps, seed pools — read-only).

## Deliverable 1: `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/fleet_composition_matrix.json`

For every cell of factions × roles that actually occurs on the default route (use your audit:
traffic roles, hostile pools, station-security patrols) PLUS the three hostile-gap roles
(`choir_zealot`, `quiet_ghost`, `lancer_sniper` — currently rendering as production Wasp):

```json
{
  "schema": "sf-foundry-composition/1",
  "cells": [{
    "faction": "faction_dmc",
    "role": "miner",
    "currentLive": {"defId": "ship_pelican", "visual": "wholeships/helios_cradle.glb", "cite": "..."},
    "proposed": {
      "donor": "wholeships/helios_cradle.glb",
      "variantParts": ["var_... or kit families with placement zone"],
      "materialProfile": "faction_dmc",
      "wearTierDistribution": {"fresh": 0.1, "serviceWorn": 0.7, "patched": 0.2},
      "decalSet": ["digit cells for DMC-#### registration", "warn_stripe_block", "..."],
      "socketsUsed": ["..."],
      "expectedRuntimeCost": {"trisAdded": 0, "materialsAdded": 0, "texturesShared": true},
      "integrationRequirement": "exact map/file that must change later, e.g. WHOLE_SHIP map entry; NONE if pure asset swap"
    }
  }],
  "sharedResources": {"kitMaterials": ["KitMat_*"], "atlases": ["decals_atlas.png", "trim_*"], "drawCallStrategy": "..."},
  "cloneFleetProof": {"before": [{"factions": [...], "sharedVisual": "..."}], "after": [{"cell": "...", "distinguishedBy": "construction axes from the bible"}]}
}
```

Rules:
- Every proposed cell must be buildable from EXISTING foundry candidates + kit + profiles — no
  hypothetical assets. Where a needed candidate does not exist yet, put it in a top-level
  `"gaps"` list instead of inventing it in a cell.
- Same-faction cells must share construction language (bible §) across roles; same-role cells
  must diverge across factions on ≥3 named contrast-table axes — name them in `distinguishedBy`.
- `wearTierDistribution` is the place/time depth lever: vary it by sector security in a
  `"sectorModifiers"` note (high-sec skews fresh; fringe skews patched).
- Runtime cost must be arithmetic from real manifest numbers (kit_manifest tris, variant
  manifest tris), not guesses.
- Prefer recomposable donor+parts+profile cells over demanding new complete GLBs.

## Deliverable 2: `.../fleet_composition_matrix.md`

Human summary: the before/after clone-fleet table, a per-faction fleet lineup description
(patrol/miner/hauler/raider/military), the total new-asset cost (tris/textures/materials
added, shared vs unique), and the TOP 5 integration actions (exact file+map, still NOT to be
edited in this batch) ranked by first-hour visibility.

Finish per common protocol (report: `reports/G-MATRIX-REPORT.md`).
