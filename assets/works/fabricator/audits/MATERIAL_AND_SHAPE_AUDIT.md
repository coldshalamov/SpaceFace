# Fabricator cycle 02 — material and shape audit

Candidate `F14445BFF3A83DA6891A3CBD5A96CC79091C8A395588537F04EE6393E2E3B549` root `SF_WORKS_FABRICATOR_V1`. State: design_candidate. Gates G1/G2/G4 open (`evidence_ready` only).

## Cycle 02 correction

Cycle 02 replaces the salmon plank/bead head with a complete rail-wrapping carriage, service deck,
bearing saddles, ram, spindle, dry ceramic shroud and side nozzle. The worn fixture bed is now the
brightest directional mass; frame and bridge are darker, rail response is ground rather than chrome,
the cable chain is isolated polymer, and ORM/normal diagnostics are distinct. LOD2 removes the filled
plinth and keeps two rooted sills so the site glyph preserves negative space. At legal 19 px/cell the
bed and open cell survive, but the H/head construction still compresses toward a dark C-shaped rail
around a bright bed. Controller inspection therefore keeps G1/G2/G4 open pending independent review.

## Cycle 01 inspect fix
Original-resolution `works_top` showed the gantry floating beside the bed: mesh data was authored in world space and then parented to `gantry_head`, which already sat at progress 0, so the bridge double-offset along −X. Gantry and lamp meshes are now shifted into hook-local space and parented with identity parent inverse. Travel 0 / 0.5 / 1 must sit on the rail over the bed.

## Shape grammar
Stand-in was a sealed box with a glowing pane and a cube head. Replacement is an open H-gantry:
T-slot bed, two C-section side frames rooted to a plinth, hat-section rails, wrap-around bearing blocks,
box-section bridge, U-saddle ram with spindle/shroud/nozzle, rooted energy chain, one hooded lamp.

## Load path
tool → ram plate → U-saddle → bridge → bearing blocks → profile rails → side posts/gussets → plinth → z=0.

## LOD triangles
{
  "lod0": 8580,
  "lod1": 836,
  "lod2": 432
}

## Travel
{
  "axis": [
    1.0,
    0.0,
    0.0
  ],
  "length": 1.4,
  "progress0": [
    -0.7,
    0.0,
    0.7
  ],
  "progress1": [
    0.7,
    0.0,
    0.7
  ],
  "authoredProgress": 0,
  "space": "blender_z_up",
  "gltfNote": "export_yup: Blender +X stays glTF +X; runtime drives gantry_head local +X * length * progress"
}

## Evidence
{
  "works_top": "assets/works/fabricator/evidence/cycle_002/works_top.png",
  "works_edge": "assets/works/fabricator/evidence/cycle_002/works_edge.png",
  "works_top_clay": "assets/works/fabricator/evidence/cycle_002/works_top_clay.png",
  "works_site": "assets/works/fabricator/evidence/cycle_002/works_site.png",
  "works_site_clay": "assets/works/fabricator/evidence/cycle_002/works_site_clay.png",
  "grazing_close": "assets/works/fabricator/evidence/cycle_002/grazing_close.png",
  "normal_isolation": "assets/works/fabricator/evidence/cycle_002/normal_isolation.png",
  "orm_isolation": "assets/works/fabricator/evidence/cycle_002/orm_isolation.png",
  "material_id": "assets/works/fabricator/evidence/cycle_002/material_id.png",
  "hook_view": "assets/works/fabricator/evidence/cycle_002/hook_view.png",
  "progress_0": "assets/works/fabricator/evidence/cycle_002/progress_0.png",
  "progress_05": "assets/works/fabricator/evidence/cycle_002/progress_05.png",
  "progress_1": "assets/works/fabricator/evidence/cycle_002/progress_1.png",
  "uv0_layout": "assets/works/fabricator/evidence/cycle_002/uv0_layout.png"
}

## Travel collisions
{
  "progress_0": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      -0.818,
      -0.568,
      -0.912,
      0.912,
      0.368,
      0.797
    ]
  },
  "progress_05": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      -0.118,
      0.132,
      -0.912,
      0.912,
      0.368,
      0.797
    ]
  },
  "progress_1": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      0.582,
      0.832,
      -0.912,
      0.912,
      0.368,
      0.797
    ]
  }
}
