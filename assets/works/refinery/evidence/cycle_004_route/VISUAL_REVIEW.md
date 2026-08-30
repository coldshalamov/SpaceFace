# Refinery Cycle 04 — Browser/Electron route review

Exact source candidate: `55B35C4E28D23972E7E130BCE35BD3D8A5AEEC261EE022B992F5D1C490692795`.
Exact release: `f612bfc5950039c1a740a7a93af235d0a6c21aeaa95fcc014c902566629ecb87`.
Exact render GLB: `e1a578574602d77c2b5b478103ad8dd3c82140e93aec0da26b68911293d3c7f3`.

The source candidate retains the independent exact-hash `KEEP` from
`/root/refinery_exact_visual_review` for whole-asset G1/G2/G4. The current source differs from the
Cycle 03 candidate only in corrected hook and collision transforms; the visible mesh BIN is
unchanged. This review covers the previously open release/runtime G6 and player-route G7 gates.

Both captures start on the canonical game root, enter flight, open Asteroid Works on a live
asteroid, install a real Massline Core, select the real `sm_refinery` palette item, place its ghost,
and then install the machine through `asteroidSites.installMachine`. No raw GLB proof root or
procedural refinery is used for the accepted pictures.

## Findings

- Browser and source Electron both mount the authored ghost, idle machine, and running machine with
  no procedural fallback body and no page errors.
- The ghost is seated on the real 13,3 gallery cell beside the rover and remains authored at both
  supported zoom registers. It does not blank or jump when work register changes to site register.
- The installed machine exposes `furnace_slit`, `stack_vent`, and `lamp`. The work register selects
  LOD0; the site register selects LOD1. Base-color textures report sRGB and normal textures report
  linear color space.
- At work register, the stepped furnace jacket, blind charging well, rooted stack/flue, transfer
  pipe, and small saddle tank read as one process train rather than a procedural box. The idle view
  preserves distinct cool jacket, oxidized flue, and dark red tank zones beside the rover.
- The real powered/lane-connected site consumes seeded iron and reaches `running` at 1.5 refined
  metals per minute, leaving 38.5 units in the lane. The furnace slit warms from dark to orange and
  the lamp comes alive without turning the whole machine into an emissive card.
- At site register, LOD1 retains the asymmetrical stack/furnace/tank mark and the running-state warm
  cue at the correct map scale. The player can distinguish installed and active states without an
  outline, label, or procedural silhouette substitute.
- Browser and Electron preserve the same geometry identity, hooks, LOD choices, state transitions,
  seating, and board relationship. Electron's PNG is 2400×1350 because the host display scale is
  1.25 over the requested 1920×1080 content size; these are distinct Electron captures.

## Verdict

`KEEP` for G6/G7. Open P0: 0. Open P1: 0. This closes the exact released candidate's ordinary
Browser/Electron route gap without broadening or replacing the independent whole-asset source
review.
