# Fabricator cycle 03 — material and shape audit

Candidate `31E7E0F70CED279B5FFBEFD6A482362688044306BDF4CE68D6A37294E9387B1F` root `SF_WORKS_FABRICATOR_V1`. State: design_candidate. Gates G1/G2/G4 open (`evidence_ready` only). No whole-asset KEEP.

## Cycle 03 correction
Independent review of cycle 02 (`F14445BFF3…`) returned REVISE. Original-resolution
works_top was a dark square around a gold plate; works_site was a generic warm block;
grazing showed cabinet side walls and a sine-quilt that read as diamond plate; the lamp
was a top-facing can. Cycle 03 repairs G1 first: remove the continuous side web and the
cell-filling plinth, root hat-section rails on C-beams and posts, raise the T-slot bed
on stanchions so the work volume is open, hang the ram/ceramic off the +X face of the
bridge, hood the lamp toward the bed, and replace the linear-sine hash.

## Cycle 02 leftover
Travel parenting from cycle 01 remains: gantry/lamp meshes are hook-local. Cycle 02's
carriage/tool, bearing saddles, and energy-chain trough are kept and re-rooted.

## Shape grammar
Open H-gantry: T-slot bed on four legs, two C-beams on posts, hat-section rails,
wrap-around bearing blocks, box-section bridge, hanging ram with spindle/shroud/nozzle,
rooted energy chain, one hooded lamp aimed at the bed. No cabinet wall. No floor plate.

## Load path
tool → quill → bridge → bearing blocks → hat rails → C-beam → posts/gussets → sills/feet → z=0.
Bed is a separate table on stanchions in the open cell.

## LOD triangles
{
  "lod0": 8872,
  "lod1": 808,
  "lod2": 428
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
  "works_top": "assets/works/fabricator/evidence/cycle_003/works_top.png",
  "works_edge": "assets/works/fabricator/evidence/cycle_003/works_edge.png",
  "works_top_clay": "assets/works/fabricator/evidence/cycle_003/works_top_clay.png",
  "works_site": "assets/works/fabricator/evidence/cycle_003/works_site.png",
  "works_site_clay": "assets/works/fabricator/evidence/cycle_003/works_site_clay.png",
  "works_site_lod2": "assets/works/fabricator/evidence/cycle_003/works_site_lod2.png",
  "works_site_lod2_clay": "assets/works/fabricator/evidence/cycle_003/works_site_lod2_clay.png",
  "grazing_close": "assets/works/fabricator/evidence/cycle_003/grazing_close.png",
  "normal_isolation": "assets/works/fabricator/evidence/cycle_003/normal_isolation.png",
  "orm_isolation": "assets/works/fabricator/evidence/cycle_003/orm_isolation.png",
  "material_id": "assets/works/fabricator/evidence/cycle_003/material_id.png",
  "hook_view": "assets/works/fabricator/evidence/cycle_003/hook_view.png",
  "progress_0": "assets/works/fabricator/evidence/cycle_003/progress_0.png",
  "progress_05": "assets/works/fabricator/evidence/cycle_003/progress_05.png",
  "progress_1": "assets/works/fabricator/evidence/cycle_003/progress_1.png",
  "uv0_layout": "assets/works/fabricator/evidence/cycle_003/uv0_layout.png"
}

## Travel collisions
{
  "progress_0": {
    "ok": true,
    "overBed": true,
    "inCell": true,
    "gantryBounds": [
      -0.818,
      -0.438,
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
      0.262,
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
      0.962,
      -0.912,
      0.912,
      0.368,
      0.797
    ]
  }
}
