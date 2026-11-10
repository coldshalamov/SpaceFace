<!-- LIFETIME: RECEIPT -->
# PQ-130.10 The site reads — receipt

**State:** implemented (2026-08-21) — **not accepted**; see the art gate in `PQ-130.md` and `PQ-131`.
**Law:** design law §7, §6.5 (as amended: no solid fills), §6.6, §6.7, §9, §2.7.

## What shipped
- **`.10a` (commit `ea21e540`)** — drawers (Ledger / Site / Help as a bottom sheet, `Tab` or a wordless
  crest glyph, `display:none` closed), site-zoom return on re-entering a rock with machines,
  `site:machineStatus` emitted only on real transitions. 19-section test `check:asteroid-drawers`.
- **`.10b` (this commit)** — in `src/ui/asteroid/asteroidRenderer3d.js` + five small geometries in
  `src/render/asteroidInteriorPreview.js` (crate stack, flow dot, junction node, why-glyph plate, seat
  bracket); `asteroidRenderer2d.js` fault colours aligned to the law's coral.
  - **Owner feedback first:** the solid green valid-seat fills and the solid red blocked box are deleted
    (four full-cell wash quads, three of which predated this unit). Every seat / contact / refusal
    verdict is four corner brackets on the block's own bevel ring, 1.8 screen px, 2.6–3.8 % of a cell;
    a check asserts under 20 % so a fill cannot return. Blocked = thin coral edge + one corner why-glyph.
  - **Conduits are bodies at both registers:** cable = dark armoured casing with a lit conductor and a
    saddle clamp per cell; lane = covered conveyor (bolted floor plate, side rails, lit channel,
    dark-glass lid, cross strap per cell, junction box where three runs meet). Everything casts shadow;
    run width is solved per register (a conveyor at 1920, 6.6 px at 1280, never a hairline).
  - **Network states from the sim's own connected components:** powered cable = warm gold conductor at a
    low emissive floor; no generator = desaturated bare metal; a lane with stock or a running machine
    is lit, a lane bolted to nothing is dark steel; flow dots walk a real leaf-to-port path at constant
    speed, **buffer sets spacing** (full = queue, empty = trickle, stalled = frozen). Machines: mint lamp
    running, dark + gold want chip hungry, coral lamp only for the two unresolvable faults (wrong rock,
    no lane); lamps hold a 5 px floor at site zoom.
  - **Lenses:** `V` cycles none → Faces → Network → Plan → none (canvas listener, cleaned up in
    teardown; `setLens` / `cycleLens` / `getLens` exported). Heat deliberately absent. Faces auto-on
    with a live ghost. Plan adds mono numerals (rate under each working machine, one port-income chip).
  - **Build mode:** mint brackets on legal seats (`canInstall` with a machine in hand), coral edge on a
    refusal, up to six why-glyph plates near the cursor, gridlines gather ~15 % more shadow.
  - **Crates:** five stages at 1 / 3 / 6 / 12 / 24 units of `projection.exportBuffer`.
  - **Site register:** seam outlines to 0.2 alpha on the material's own colour; inclusions lose specular.

## Evidence
- `check:asteroid-theater` green at 1920×1080 and 1280×720 incl. "§6.7 seat mark ink 3.8 % of a cell";
  `check-drill-smooth` PASS; `asteroid-drive-cadence` PASS; `check:asteroid-drawers` 19/19.
- Stills reviewed by the orchestrator: `11-site-network.png`, `11b-faces-lens.png`.
- `check:baseline` 8/12 — the four 47a sim links are a stale golden on master (proved in the `.10a`
  receipt by a clean-tree rebuild).
- `check:playable` **6/14 red at close — not this leaf:** `CONTINUE` hangs and CLEAN carries
  `[dbg10]` / `[dbgsync]` console errors from another lane's in-progress sim-worker / persistence
  refactor (its dirty files: `src/core/simWorker*.js`, `worldActivityManager.js`, `assetResidency.js`,
  `audioSystem.js`), plus the ship-texture blob flake. The implementer reproduced the identical failure
  with this leaf's three source files reverted; it was 14/14 earlier in the same session before those
  writes landed.

## Why "implemented", not "done"
The rover and machines are the procedural boxes the owner rejected on 2026-08-21; this unit left them
alone by instruction. Acceptance of the whole screen is gated on `PQ-131` (authored assets).

## Recorded
- At site zoom the body reads as mineral confetti: the generator rolls every cell independently
  (189 seam bodies, biggest 3). That is `PQ-132` (formation generator), planned.
- "Simplify ore to a swatch" at site zoom is a shine-damping only; the thin-yellow-margin defect is
  verified by proxy (outline weight/hue), not a measured contrast reading.
