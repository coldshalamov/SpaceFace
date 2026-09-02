# PQ-131.10 — Authored inclusion kit: wired, captured, reviewed

**Date:** 2026-09-02 · **Unit:** `PQ-131.10` (Inclusion kit: ore, exotic, ice, gas, scars, lock
plate, authored) · **Verdict:** implemented — one named check (`check:playable` BOOT) red with an
undetermined fingerprint, recorded below; all other named checks green.

## What shipped

The authored 18-variant inclusion kit (`assets/works/inclusion_kit`, cycle 02, root
`SF_WORKS_INCLUSION_KIT_V1`) is live on the Asteroid Works board:

- **Ore veins** render authored variants per commodity, bucket-keyed `(variantId, locked)` so a
  seam mixes its commodity's shapes instead of stamping one: silverium → silver wire/sheet,
  goldium → gold leaf/ribbon, iron → chip ridge/specular plates, bronzium → nickel cubic/dendrite,
  diamond → ice sheen plate/fracture vein, einsteinium/emerald/ruby/amazonite → exotic
  octahedral cage/prismatic truss/hopper cube. Instance scale normalizes per-variant by measured
  footprint to a contracted fraction of a 2.2 wu cell. Locked veins use one cached dulled clone of
  the shared atlas material (same oxidise treatment `oreMaterial` applies to procedural veins).
- **Gas pockets** wear the authored fissure variants (radial/branch/shear, dark mouth baked — the
  procedural core disc is skipped when authored); the vapor breath and the per-cell hot vapor
  material swap are unchanged.
- **Vented scars** are the authored dead split, swapped in place on kit arrival and on new blows.
- **MK lock plate**: the authored claim hardware (gasket, four anchors, hinge, latch) with a
  live engraved tier line `MK{req}` (canvas text on a plate-face quad, transparent, fading with
  the plate). The kit's LOD0 bakes fixed "MK2" strokes which cannot carry the real per-vein tier
  (req spans 1–4 from live ore tiers), so the runtime stamp uses the digit-neutral LOD1 register;
  procedural `mkStampGeo` + full-plate canvas remain only as first-frame fill before the kit
  settles.
- **Procedural shapes retained, by law**: the renderer's own "every vein is visible from the first
  frame" contract beats fail-closed absence for inclusions (a bare pad hides information), so the
  procedural ice/exotic/gas/scar/stamp geometry stays as pre-settlement fill, and copper,
  platinium and silicate stay procedural permanently (not in the kit contract — their authoring
  cycles have not happened). Kit arrival is atomic: ore buckets are destroyed and rebuilt from the
  field (their `n` counters are append-only and can never be refilled in place), gas/scar meshes
  swap geometry+material in place, the procedural stamp yields to the authored one at the next aim.
- **Register support**: work→LOD0, site→LOD1; the zoom flip swaps `InstancedMesh.geometry` per
  bucket in place (both registers share the pivot convention, so matrices stay valid).

## Pipeline artifacts

- Selected runtime `assets/ships/parts/works/place_works_inclusion_kit.glb` — LOD2 stripped
  (55 nodes / 36 meshes), `exportedLods ['lod0','lod1']`, via the new committed
  `scripts/build-works-selected-runtime.mjs` (JSON-chunk index remap, bin untouched — the proven
  pattern from Rover through cargo port).
- Release GLB (1.43 MiB, KTX2 3/3, meshopt) + release_manifest row, published transactionally by
  `build-place-release-assets.mjs --ids=place_works_inclusion_kit`.
- Render package `works-inclusion-kit` + pilots row + regenerated `src/render/renderPackageManifest.js`.
- Loader: `INCLUSION_KIT_VARIANT_IDS`, `extractWorksInclusionKit` (fail-closed, clones geometry,
  bakes the Y-up→board seat Rx(+90°), measures footprint), refcounted
  `acquireWorksInclusionKit()`; renderer owns unlocked/locked/plateFade material clones and
  disposes clones + extracted geometries at teardown (generation token guards late arrivals).

## Evidence

Capture route stills (this run set): `06-cells-speak.png`, `07-deep-materials.png` (families at
work register), `10f-lock-plate.png` (authored plate + legible MK4 at a locked diamond vein),
`10g-gas-fissure.png`, `10h-vented-scar.png`, `05/11` site register. New capture steps 10f/g/h
were added to `scripts/capture-asteroid-works.mjs` (frame the rig's carved berth — `frameCell`
eases the camera toward the look point, so an intact cell flies the lens into the rock).

## Reviews (three independent, calibrated)

- **R1 (silhouettes) — REVISE.** Silver/gold/iron pass with real variety; flagged copper
  "teal shards" and exotic/nickel legibility.
- **R2 (process pieces) — KEEP.** Gas danger-not-treasure, scar dead, plate reads as bolted
  hardware; MK4 legible but borderline → applied the suggested contrast bump (dark shadow pocket
  under a brighter bone cut), verified legible in re-capture.
- **R3 (material truth) — REVISE.** Kit passes its own gates (clay/identity stills), silver/ice
  translate faithfully; same copper-fallback flag; "cell-aligned tint washes" finding rejected
  with reason: the family-tinted pad is the law §3.5 cells-speak design, not a paint overlay.

Triage: the copper finding is the documented procedural fallback (copper is outside the kit
contract; authoring a copper variant is a future cycle) — recorded as a lead, not a defect of
this unit. Exotic/nickel dark-host legibility under the dusk key follows the brief's authored
hosts; recorded as a lighting-pass lead for a later cycle.

## Verification

- `test/works-inclusion-wire.test.mjs` 5/5 (GLB contract, release/manifest/package/pilot binding,
  seat-baked extraction + fail-closed, loader acquire, ore→variant contract pins). Works suite
  25/25. `check:baseline` 14/14. `check:asteroid-theater` holds at both resolutions.
  `check-program-docs` PASS.
- **`check:playable` RED — open item.** `BOOT: never reached the main menu in 30s — {"sf":true,
  "overlay":"none","screens":[]}`, twice, identical fingerprint; CLEAN/SHADER/ASSETS all PASS
  (no uncaught errors, no shader failures, every request served) and the log shows the flight
  world rendering (GPU brick warn ~1.7–1.8s on `bloomScene`). None of this unit's files execute
  on the boot path (the works screen and the kit GLB are not in the bootstrap preload; module
  import verified clean). The headless environment showed two boot-timeout flakes in the capture
  harness earlier the same day. **Not diagnosed — do not assume environmental.** Next step: boot
  the route headless outside the check and diff the menu-mount flow (`data-screen="mainMenu"`
  never becomes visible while the loading overlay is already hidden), then diff against a HEAD
  worktree if the boot probe shows nothing.

## Notes for the next agent

- The works-unit pipeline now has a committed reusable strip tool; five units (gas tap, conduit,
  fabricator, cargo port, inclusions) have run it end to end.
- `scripts/capture-asteroid-works.mjs` 10f/g/h depend on `window.__inclPlate`/`__inclRig` stashed
  by the 10c locked-vein seat; `frameCell(col, row)` takes TWO arguments — passing a cell object
  writes NaN into the camera leash and blacks every later still (cost several debug loops here).
- The Drifter promotion Basis-encoder blocker (4096² UASTC "Encode failed") is unchanged.
