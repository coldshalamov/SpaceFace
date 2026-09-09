<!-- LIFETIME: DURABLE -->
# PQ-131.07 — authored Gas Tap report

## Outcome

Asteroid Works loads the authored `place_works_gas_tap` release asset wherever the gas tap machine
is installed on the surface route. The procedural gas-tap body is no longer reachable: `sm_gas_tap`
routes to `buildAuthoredGasTapAt` (installed), `beginAuthoredGasTapGhost` (ghost), and the proof
mount, with no procedural mesh fallback. Hooks `valve_wheel`, `gauge_needle`, and `lamp` drive
movement-only wheel phase (frame-delta, motion-reduce aware, no resume jump), transform-only needle
angle, and lens-only lamp materials on the LOD0/LOD1 lamp shells (the shared authored atlas is never
mutated). Work zoom uses LOD0, site zoom uses LOD1, LOD2 stays authoring/evidence-only, and late
loads release without mounting.

Seating: authored 1x scale, one-cell footprint, in-plane yaw only toward the live gas contact, and
the proof route numerically mirrors the permanent mount (zero rotation, position offset `cellY -
S/2` toward the wall, world z = 0). The proof camera frames `WORKS_PROOF_CELL` (20,4) — which the
capture now carves into a three-cell gallery so the wall-mounted tap has a real rock face to clamp
to and is visible in the evidence stills.

## Frozen artifacts

- Authoring source (cycle-2 candidate bytes preserved): `8DA1D98DAFE6EF475FF94C0F47E320C90128756BFB215CE7F362C8C52AF8AA60`, 2,569,116 bytes
- Parts GLB: `F4509BC7A3D353028C9B57EC26EA2D33BE07551EB7C3A921DD66A80FD2F7DF5F`, 2,564,824 bytes
- Release GLB: `FA91D34BF614205E782DD20BA7EA14F619AB57931A45BBC0CBFDEB6DEFBC1184`, 297,200 bytes
- Render package GLB: `8BB2153DD93A9919B4ABD8D4D69390129EEC876448CBF39B249CF42EA9E5DF2B`, 358,276 bytes
- Work still: `DCB70875C821EC425DE31CA88D5CEE68AEDA070CED3AAFEC4AE9B092468B4F51`
- Site still: `F822E52C1C7D84315087015B68C8D189D49AA879F5928371D3A9AE7D2438A83F`

## Review and player-route acceptance

- Three independent reviews returned KEEP on the frozen cycle_003 evidence and exact release bytes:
  a visual judge (manufactured read, seating, legibility vs the derrick precedent), a
  material-truth judge (metal/brass/glass response against the Blender material-truth skill), and
  an integration review (wiring, hook semantics, seating contract, LOD policy, additive manifests,
  wire tests).
- First review round honestly returned REVISE: the `--part` proof stills showed no tap at all —
  the proof route mounted it inside uncarved rock at the proof cell. Root cause was the capture
  scenario, not the asset or the permanent route (the full-route still showed the authored tap
  running). Fix: `capture-asteroid-works.mjs` now carves a three-cell gallery at the proof cell
  before mounting, matching production context. Recaptured and re-reviewed from scratch.
- Focused tests: `test/works-gas-tap-wire.test.mjs` 6/6, `test/works-part-loader.test.mjs` 5/5.
- Baseline: 14/14 green.
- Manifests stayed additive: `release_manifest.json`, `parts_manifest.json`, `pilots.json`,
  `renderPackageManifest.js` gained only gas-tap rows; zero conduit or other rows removed
  (verified by diff).
- Known residual, owned elsewhere: `check:asteroid-theater` §5 hopper-refusal replay currently
  fails inside the live conduit-kit diff (its `rebuildOverlays`/conduit-lifecycle hunks in
  `asteroidRenderer3d.js` and its capture-script edits), not in any gas-tap path. The conduit
  thread's NOW row names those exact files.

## Next product unit

`PQ-131.08` — authored Fabricator.
