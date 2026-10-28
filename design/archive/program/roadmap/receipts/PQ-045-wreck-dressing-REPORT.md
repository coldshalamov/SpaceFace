<!-- LIFETIME: HISTORICAL -->
# PQ-045.wreck-dressing — receipt

```yaml
unit: PQ-045.wreck-dressing
resultCommit: d12412ee (master; candidate fd719775 on fable/wreck-dressing)
date: 2026-08-10
workers: grok-4.5 (author-down + binding), fable controller (verification, integration)
verdict: PASS (focused_green; whole-asset G1/G2/G4 human art verdict OPEN)
```

## What changed

Seven selected aftermath-pack assets authored down and composed into the two anonymous Ceres wreck
slots:

- `ceres_ambush_bait_wreck` → `place_ceres_bait_wreck` (liner bow/boatbay + freighter hopper +
  armor slab; 7 draws / 7 materials; LOD0/1/2 2496/1190/452 tris; release ~1.72 MB KTX2).
- `ceres_cathedral_grave_shard` → `place_ceres_grave_shard` (hopper lid + liner panel + grating
  instanced x3; 5 draws / 5 materials; 596/280/113 tris; release ~1.15 MB KTX2).

Raw pack state for the seven: 0 textures, 0 LODs, 185 unmerged meshes. Authored down to 28 meshes
with real basecolor/normal/ORM and material-truth preflight records. Slot bindings + dressing radii
in `src/systems/world.js`; place admission in `src/render/partsLibrary.js`. Salvor job still
targets `object:ceres_cathedral_grave_shard`; no activity-slot identity changed.

## What passed

- `test/pq045-wreck-dressing-binding.test.mjs` + Ceres pocket tests — 15/15 (worker) and re-run
  green in the primary at d12412ee.
- `check:graphics:asset-receipts` (extended coverage) PASS, `check:asset-reachability` OK,
  `check:baseline` 11/11 — worker run and primary re-run.

## What remains unproven / excluded

- Whole-asset G1/G2/G4 human art verdict OPEN (geometry is authored-down blockout density under
  real materials; close camera may read low-poly mass). Evidence-ready.
- No headed Browser/Electron proof in this unit (reserved to PQ-045.five-minute-h1).
- The other 30 pack GLBs stay unpromoted; three unbuilt hull families stay unbuilt; Cathedral hero
  landmark untouched.
