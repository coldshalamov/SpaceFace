<!-- LIFETIME: DURABLE -->
# PQ-131.08 — authored Fabricator report

## Outcome

Asteroid Works installs the authored `place_works_fabricator` (one-cell open gantry fabricator,
8,872-tri LOD0 / 808-tri LOD1, 1024² nine-texture atlas) wherever the fabricator machine is placed
on the surface route. The procedural fabricator body is retired from `makeMachine` — `sm_fabricator`
routes to `buildAuthoredFabricatorAt` (installed), `beginAuthoredFabricatorGhost` (ghost), and the
proof mount, with no procedural fallback. The authored gantry head keeps the progressBar contract:
the head slides the authored +X rail (base −0.7, travel 1.4 m) with the sim's build progress, and
only the hooded lamp lenses carry live status (instance-owned material shells; the shared authored
atlas is never mutated). Work zoom uses LOD0, site zoom LOD1, LOD2 stays authoring-only, late loads
release without mounting.

## Frozen artifacts

- Authoring source (cycle-3 candidate): `50C6540E7E627D739E822FE5B79348C1F6A6665D6EB5A8E762314783E6277FD8`, 2,091,592 bytes
- Parts GLB (selected runtime, LOD2-stripped): `82888BE86823B8347A76BE01E11A7F2575A7DBDFE9A9897E5C43B4BBA46E4F19` → see HASHES.json for the full value, 2,091,108 bytes
- Release GLB: `F901E819EDE217A19C0E621DDF4420BF46102F0B352FC5592B77C53A3C01B44`-family (full value in HASHES.json), 760,160 bytes
- Render package GLB: 953,228 bytes
- Work/site stills frozen in `assets/works/fabricator/evidence/cycle_003/`

## Review and player-route acceptance

- Three independent reviews returned KEEP on the frozen cycle_003 evidence and exact release bytes:
  visual (manufactured read, seating, scale at both registers vs the derrick precedent),
  material-truth (steel/brass/paint differentiation under the repo's Blender material-truth
  standard), and integration (routing order, hook hierarchy, instance-owned lamp isolation, GLB
  contract: root `SF_WORKS_FABRICATOR_V1`, zero LOD2, works_hook markers, hash-bound
  release/package/manifests).
- Focused tests: works-fabricator-wire 4/4, works-part-loader 5/5, works-gas-tap-wire 6/6.
- Full-route capture: all six machines run with the authored fabricator in scene
  (`03-site-running.png`), palette keys include `sm_fabricator:ready`, captures seed-fixed.

## Adoption note

The authoring subagent (zcode-fab-08) rebuilt the cycle-3 source then died at its quota limit; its
row went stale per NOW rule 3a and zcode-main adopted the diff, completed promotion (the selected-
runtime parts copy needed a correct index-based LOD2 strip — the copied draft had lost its scene
root), wiring, procedural removal, test, captures, reviews, and this receipt.

## Next product unit

`PQ-131.09` — authored Cargo port + crates + courier pod.
