# PQ-131.04 Works refinery — Cycle 02

Immutable epoch. **Disposition: `review_pending`.** Reviewers were not launched.
Cycle 01 evidence under `evidence/cycle_001/` is unchanged.

**Candidate hash:** `7984CD679A1FC5A6259EA2BD232A8CB58834D214935D100D263E6A1222827733`
**Export:** `assets/ships/parts/works/place_works_refinery.glb`
**Root:** `SF_WORKS_REFINERY_V1`
**Hooks:** `furnace_slit` (−0.22, 0.05, 0.452), `stack_vent` (0.16, 0.78, 1.12), `lamp` (0.30, 0.62, 0.72)

## What Cycle 02 corrected

Cycle 01 stills were independently `REVISE`: orange stripe/puncture throat, rounded-lozenge furnace, primitive rust stack/pipe, shiny red drum, lamp speck, fused warm-brown site.

This cycle keeps the process-train layout and dark crown opening, and rebuilds construction:

- Blind recessed charging well ~0.46 × 0.14, ~0.28 deep, with a thick steel lip, soot-dark refractory taper, and a small recessed glass floor owned by `furnace_slit`. Beauty emission is off; the crown reads as a dark hole. `state_emission.png` is the 1.0 diagnostic only.
- Insulated jacket with modest corners (not a lozenge), three inset course bands with clamp blocks, four tapered gusseted feet, burner plenum with nozzles/flange/lid (LOD0/1).
- Rooted exhaust: rectangular takeoff, rect-to-round transition, mitered elbow, stack neck/hoops, rain cap smaller than the stack OD so the outlet sits visibly below it. `stack_vent` at the real outlet.
- Routed process pipe with mitered elbows, flanges, a clamp, and a tank nozzle. Gallery stays empty.
- Tank on two saddles/base plates with knuckle closures, manway, access lid; matte oxide-red, no peach plastic.
- Hooded lamp at the flue neck: hood, socket, recessed lens. Not a hot speck.

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

Beauty stills keep the slit inactive. One tank-matte correction was applied after the first Cycle 02 stills showed a remaining peach highlight.

## LOD

5488 / 1564 / 540 triangles (budgets 8000 / 2000 / 600). Three draws per LOD. Unique UV0, overlap 0.
LOD2 keeps the blind well (tapered jacket + ember), three-mass silhouette, feet, routed elbow, saddles, rain cap, and all hooks. Lip/burner/rect takeoff mesh are LOD0/1.

## Validation (this cycle)

- Python/JSON of HASHES, inventory, cycle epoch, material contract, ledger: written.
- GLB nodes: root, three LOD meshes, three hooks, collision helper.
- Hidden-face dry-run per LOD; `--delete` not used (slit/lamp 0-visible is coarse-grid miss).
- `git diff --check` on the write set.
- Cycle 01 evidence SHA256 lock verified after the build.

## Remaining risk

Furnace plan is a manufactured rectangle with modest corners, not a kettle/arch. Stack from directly above is still a rust disk plus a smaller cap and a rect neck. Site 22 px pairing is readable as three values but remains small. Independent review not done. Not wired, not released, packet not complete.
