<!-- LIFETIME: RECEIPT -->
# PQ-130.05 The vehicle — receipt

**State:** done (2026-08-21). **Law:** design law §4 (the rover), §2.7, §5 (hopper full / heat critical rows).

## What shipped (src/render/asteroidInteriorPreview.js `makeRover`, src/ui/asteroid/asteroidRenderer3d.js)
- Diagnosis: the `.03` rover's panels used a metal shader at 0.82 metalness, which goes black in an
  unlit bore — a value/contiguity problem, not size. **No scale multiplier** (playfield §3 names
  `makeRover ×1.4` as the failure). Paint is paint (metalness 0.12); the safety yellow runs as one
  connected region deck → hopper cage → cab → boom (104×71 px at work zoom, 18× the next yellow blob).
- Real tracked undercarriage (two stadium-frame track units, drive sprockets, tread plates laid along
  the loop so the tread crawls); open cage hopper; cab with a camera-facing lit pane; chevrons as
  applied plates; boom as a yellow feed beam with a steel rod, mounted outboard so a straight-down aim
  no longer buries the arm. Panel clusters welded (~55 meshes vs ~90).
- Envelope ≈ 0.85 × 0.81 of a cell (the `.03` envelope; slightly shorter).
- Worn state off real data: hopper = five welded rubble layers switched by `state.player.cargo`
  used/cap at 2/22/42/62/82% (the bin and the crest hold gauge are one number told twice); the lid
  latches shut on the sim's `drill:cargoFull` refusal and clears when it drains; bit emissive
  `#9a6f4a` → `#ff6242` off `drillTemp` peaking above every lamp; coolant stack puffs steam when
  cooling from a bore above 44% via the existing particle helpers at the rover's own depth (new
  optional per-particle z); one real `SpotLight` (512 shadow map) parented to the chassis — the `.03`
  build carried two overlapping mis-aimed spots. Measured 16.7 ms median with the shadow vs 17.1 ms
  without (vsync-locked).

## Evidence
- `check:asteroid-theater` passes (96.3% / 94.4%, 8 words, flatness 0.000 px). `check:playable` 14/14
  twice mid-session; a later CLEAN trip reproduced identically with both files reverted (known blob
  flake + the asset lane's in-progress `hornet_production_v1_lod0.glb`).
- Nine capture iterations at 1920×1080 plus a scratch harness forcing cargo 0/30/55/75/100%, hot →
  cooling, four facings (the shipped capture never loads the hold or heats the bit). Orchestrator
  reviewed `01-cutaway-fresh.png`: the rig reads as a drill in under a second.

## Recorded
- At the site register the rover's connected-yellow margin over gold seam outlines is thin (57 vs
  42 px); ore-cluster and seam-outline palettes crowd the same hue at 19 px cells — `.10`.
- Aiming up, the yellow boom crosses the yellow cab; the steel bit above the roofline carries the
  facing. Down/left/right read at a glance.
- A capture run failed transiently on `palette.setVisible is not a function` — the concurrent `.09`
  palette rewrite mid-edit, not this leaf.
