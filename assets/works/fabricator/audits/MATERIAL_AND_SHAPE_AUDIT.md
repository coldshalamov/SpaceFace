# Fabricator cycle 01 — material and shape audit

Candidate `7CE2C148CF961D39EE1B35E8E14FF7414480BCA9808BDD046D2105D04808961F` root `SF_WORKS_FABRICATOR_V1`. State: design_candidate. Gates G1/G2/G4 open (`evidence_ready` only).

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
  "lod0": 8140,
  "lod1": 940,
  "lod2": 616
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
  "works_top": "assets/works/fabricator/evidence/cycle_001/works_top.png",
  "works_edge": "assets/works/fabricator/evidence/cycle_001/works_edge.png",
  "works_top_clay": "assets/works/fabricator/evidence/cycle_001/works_top_clay.png",
  "works_site": "assets/works/fabricator/evidence/cycle_001/works_site.png",
  "works_site_clay": "assets/works/fabricator/evidence/cycle_001/works_site_clay.png",
  "grazing_close": "assets/works/fabricator/evidence/cycle_001/grazing_close.png",
  "normal_isolation": "assets/works/fabricator/evidence/cycle_001/normal_isolation.png",
  "orm_isolation": "assets/works/fabricator/evidence/cycle_001/orm_isolation.png",
  "material_id": "assets/works/fabricator/evidence/cycle_001/material_id.png",
  "hook_view": "assets/works/fabricator/evidence/cycle_001/hook_view.png",
  "progress_0": "assets/works/fabricator/evidence/cycle_001/progress_0.png",
  "progress_05": "assets/works/fabricator/evidence/cycle_001/progress_05.png",
  "progress_1": "assets/works/fabricator/evidence/cycle_001/progress_1.png",
  "uv0_layout": "assets/works/fabricator/evidence/cycle_001/uv0_layout.png"
}

## Travel collisions
{
  "progress_0": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      -0.8,
      -0.5525,
      -0.91,
      0.928,
      0.36,
      0.797
    ]
  },
  "progress_05": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      -0.1,
      0.1475,
      -0.91,
      0.928,
      0.36,
      0.797
    ]
  },
  "progress_1": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      0.6,
      0.8475,
      -0.91,
      0.928,
      0.36,
      0.797
    ]
  }
}
