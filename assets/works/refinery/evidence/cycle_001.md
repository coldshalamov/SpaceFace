# PQ-131.04 Works refinery — Cycle 01

Immutable epoch. **Disposition: `review_pending`.** Reviewers were not launched.

**Candidate hash:** `80CF0DE0F97C1D7722DFB4A9B977B1E046D28F180701B32BF3CA52C3D62D9216`
**Export:** `assets/ships/parts/works/place_works_refinery.glb`
**Root:** `SF_WORKS_REFINERY_V1`
**Hooks:** `furnace_slit`, `stack_vent`, `lamp`

## What was built

A one-cell process train: formed insulated furnace with a recessed refractory slit, service burner on the long side, flue into a capped stack, pipe into a saddle tank, one hooded lamp. Original geometry and original 1024 maps. Concept/incubator files cited as form language only.

## Stills (from the exported GLB, 1920×1080)

| File | Camera |
|---|---|
| `works_top.png` | 31° persp, 120 px/cell, object 132×132 |
| `works_edge.png` | same camera, object+pad offset to the frame edge |
| `works_site.png` | 19 px/cell, object 22×22 |
| `works_top_clay.png` | clay, same top camera |
| `works_edge_grazing.png` | raking sun, edge offset |
| `normal_isolation.png` / `orm_isolation.png` / `id_or_material_id.png` | top |
| `hook_identity.png` | top, colored markers at the three hooks |
| `state_emission.png` | top, slit emission 1.0 |
| `*_1to1.png` | original-resolution crops of the object |

Beauty stills keep the slit inactive (lens luma ~0.11, RGB ~0.20/0.09/0.05).

## LOD

4900 / 1304 / 536 triangles (budgets 8000 / 2000 / 600). Three draws per LOD. Unique UV0, overlap 0.

## Validation (this cycle)

- Python/JSON of HASHES, inventory, cycle epoch, material contract, ledger: written.
- GLB nodes: root, three LOD meshes, three hooks, collision helper.
- Hidden-face dry-run per LOD; `--delete` not used.
- `git diff --check` on the write set.

## Remaining risk

Furnace plan is still a formed rounded rectangle. Warm slot can thumbnail as a glow. Site pairing is fragile at 22 px. Independent review not done. Not wired, not released, packet not complete.
