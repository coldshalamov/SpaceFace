# Extractor Cycle 07 — Browser/Electron route review

Exact source candidate: `3E071A9A7A143480AF6A09088F032207153D441D4A0D3E0409BD5EBA21D92BA8`.
Exact release: `3bef83c35dc4ea5a964005427faca26ccd220aabfa84509b25be1f9a7b36436a`.
Exact render GLB: `d5573dd1b099c742f2eb3fc5f7312f2a9da5e80688ff7f713167580037b9a3be`.

The source candidate retains its independent Cycle 06 `KEEP`; this review covers only the previously
open release/runtime G6 and player-route G7 gates. Both captures start on the canonical game root,
enter flight, open Asteroid Works on a live asteroid, carve a rover-adjacent seat, and install
`sm_extractor` through `asteroidSites.installMachine`. No raw GLB proof root or procedural machine is
used for the accepted pictures.

## Findings

- Browser and source Electron both mount the authored `place_works_extractor` with no procedural
  fallback body.
- The work register selects LOD0. The site register selects LOD1. Neither transition blanks or
  relocates the installed machine.
- `head_face`, `belt`, and `lamp` are present in both runtimes. Base-color textures report sRGB and
  normal textures report linear color space.
- At work register, the open crusher frame, dark transverse head/belt path, warm drive case, and
  hooded lamp remain readable beside the rover. The machine is seated in its real one-cell gallery,
  rather than floating at the board origin.
- At site register, LOD1 preserves the asymmetrical machine mark and bright cutting/drive structure
  without a color or emissive silhouette cheat. The machine appropriately becomes a site-scale map
  fact instead of retaining work-register detail.
- Browser and Electron preserve the same geometry identity, LOD choices, colors, seating, and board
  relationship. Electron's PNG is 2400×1350 because the host display scale is 1.25 over the requested
  1920×1080 content size; this is a distinct runtime capture, not a resized Browser still.

## Verdict

`KEEP` for G6/G7. Open P0: 0. Open P1: 0. This does not replace or broaden the independent source
review; it closes the exact released candidate's ordinary Browser/Electron route gap.
