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
