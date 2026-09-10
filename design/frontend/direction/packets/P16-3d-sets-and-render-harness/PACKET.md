```yaml
packet: P16
title: 3D sets for the UI stage and the hull render harness (Blender + GLB + scripts)
lane: 3D
tool: Codex (local terminal agent with Blender) — runs inside the repository, not a zip round-trip
dependsOn: [P01, P03]
current: [title, station-dock, ship]
inputs: [design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/plate-title.png, design/frontend/direction/approved/frame-station-dock.png, design/frontend/direction/approved/kit-notes.md]
returns: commits on a branch + design/frontend/direction/receipts/P16-REPORT.md
turns: local; bounded by the material-truth preflight
```

# P16 — 3D sets and the hull render harness

## Objective

The three-dimensional things the interface stands on, built to the repository's own asset
standard: (1) a **hangar set** for the Title and New Game stage; (2) a **berth set** for docking
and the station bench windows; (3) an **arena diorama framing** for the Crucible door; and (4) a
**hull render harness** that produces tiles and portraits of every hull from the real GLBs at one
fixed studio lighting, so no hull is ever a drawn picture.

## Read (in the repository)

`docs/visual-assets/README.md` → `VISUAL_ASSET_PRODUCTION_STANDARD.md` → the material-truth
preflight in `.grok/skills/spaceface-blender-material-truth/SKILL.md` (mandatory) → `_COMMON`
(this packet's zip is a brief; the standard governs craft) → `inputs/` (the approved Title and
docking frames are the pictures to match).

## Deliverables

1. `assets/ships/parts/place_ui_hangar.glb` (+ `.blend` source under the repo's authoring root):
   gantry, floor with markings, work lights as emissive materials, cable runs, an open bay-door
   frame, sized to the Kestrel's real scale; ≤ 60k triangles, ≤ 2×2048² textures; LOD1.
2. `place_ui_berth.glb`: the dock interior as the approved docking frame shows it — gantry arms,
   service lights, crew equipment — reusing or extending `place_dock_interior` rather than
   duplicating it; same budgets.
3. `place_ui_arena_foundry.glb` **or** a documented camera/lighting rig over the existing Crucible
   arena geometry that produces the Crucible door's diorama shot; whichever the material-truth
   preflight selects.
4. **Hull render harness**: extend `src/render/shipPreview.js` + `scripts/run-ship-preview.mjs`
   (the existing dev-only turntable) into `scripts/render-hull-tiles.mjs` producing, for every
   roster hull: `assets/ui/tiles/hull-<id>.png` 640×360 (three-quarter, fixed key/fill/rim), 
   `assets/ui/tiles/hull-<id>-portrait.png` 480×640, `assets/ui/tiles/hull-<id>-mask.png`; one
   lighting rig, one lens, reproducible from a clean checkout.
5. Render review evidence per the standard (G0–G7 as applicable), a `P16-REPORT.md` receipt,
   provenance for every third-party input.

## Invariants

- No change to gameplay, the simulation, or any runtime hull GLB.
- New files admitted through the manifests the standard names; nothing hand-edited in generated
  release metadata.
- The hangar and berth sets are camera-first: judged from the approved frames' camera, not from
  the outliner.

## Acceptance

Each set renders, from the approved frame's camera, a picture a reviewer cannot tell from the
frame's plate in composition and light (put the side-by-side in the receipt); the harness runs
end-to-end and produces a tile for every roster hull; checks named by the standard are green.

## The way this gets faked

Primitive boxes named "gantry"; emissive planes instead of built lights; a harness that screenshots
the live game at whatever camera it happens to have; a claim of "sets built" without the frame
side-by-side.
