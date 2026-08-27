# PQ-131.04 Works refinery — Cycle 03

Immutable epoch. **Disposition: `review_pending`.** Reviewers were not launched.
Cycle 01 evidence under `evidence/cycle_001/` and Cycle 02 under `evidence/cycle_002/` are unchanged.

**Candidate hash:** `1D0F648E023AED996A76BE91255C869CBAF1554F3D25DE9EAD701F1BC62022C0`
**Export:** `assets/ships/parts/works/place_works_refinery.glb`
**Root:** `SF_WORKS_REFINERY_V1`
**Hooks:** `furnace_slit` (−0.22, 0.04, 0.292), `stack_vent` (0.18, 0.80, 1.12), `lamp` (0.31, 0.65, 0.74)

## What Cycle 03 corrected

Independent top/edge/site reads of Cycle 02 still asked for one coherent repair: the furnace was a rounded box with a slot, the throat was a bright picture-frame around a shallow hole, the flue read as a copper bar, the tank as a rectangular block, and the site register painted the cell warm.

This cycle keeps the three-mass process train, rooted flue, separate oxide tank, real pipe/nozzle, and non-emissive dark throat, and rebuilds construction:

- Formed insulated jacket: chamfered plan with structural corner returns, flared skirt, visible waist inset and course rings — not a cube with a slot and not a lozenge.
- Blind refractory well ~0.50 × 0.20, ~0.48 deep. Inner walls and floor separate at 120 px/cell. Thin dark steel lip, not a copper picture-frame. Beauty emission off; `state_emission.png` is the 1.0 floor diagnostic only.
- Four tapered gusseted feet with a visible pad gap under the jacket.
- Stack rooted by rectangular takeoff, banded rect-to-round, flange/union, and a mitered elbow — heat-stained steel, not a copper bar. `stack_vent` at the real outlet under the rain cap.
- Matte oxide-red tank on two wrapped saddles with pads, manway, and a nozzle fitting. Not a single rectangular block.
- LOD1/2 and site values keep furnace, offset stack, and tank as three separated masses with an empty gallery slit. Jacket is cooler and AO-segmented so the cell does not go warm.

One post-inspect fix: the first Cycle 03 beauty still crushed the well walls and floor into one black slot. Wall charcoal was lifted against a darker floor; maps and stills were rebuilt.

Recovery completion added one final play-distance correction without changing the keep-set: the jacket waist was deepened, its returned shoulder course broadened, the crown narrowed, folded corner returns made more legible, and cool graphite value lifted enough to reveal the construction without warming the cell. Original-resolution top/edge/site stills were rerendered from the resulting export. Recovery judgment is **KEEP for the Cycle 03 correction scope**; independent whole-asset acceptance remains open.

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

Beauty stills keep the slit inactive.

## LOD

7442 / 1840 / 560 triangles (budgets 8000 / 2000 / 600). Three draws per LOD. Unique UV0, overlap 0.
LOD2 keeps the chamfered jacket with waist, blind well, feet, elbowed stack, oval tank with pads/manway, routed pipe, and all hooks.

## Validation (this cycle)

- Python/JSON of HASHES, inventory, cycle epoch, material contract, ledger: written.
- GLB nodes: root, three LOD meshes, three hooks, collision helper.
- Hidden-face dry-run per LOD; `--delete` not used (slit/lamp 0-visible is coarse-grid miss).
- Cycle 01 and Cycle 02 evidence SHA256 locks verified after the build.
- `git diff --check` on the write set after deterministic LF receipt normalization.

## Remaining risk

Stack from directly above is still a rust disk plus cap and rooted elbow. Site 22 px pairing preserves the three values and gallery slit but cannot retain meso construction. The legal edge camera remains nearly top-down, so feet/gussets are modest. Independent whole-asset review is not done. Not wired, released, or promoted.
