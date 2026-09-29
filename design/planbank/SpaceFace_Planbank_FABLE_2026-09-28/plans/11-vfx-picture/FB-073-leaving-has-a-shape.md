# FB-073 — Undocking and jettison have a world answer: the cradle releases outward and pods are flung

**Kind:** wire · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: dockingCradle.js, seam: actionVfx.js, seam: audioRecipes.js
**Write-set:** `src/render/dockingCradle.js`, `src/render/actionVfx.js`, `src/data/audioRecipes.js`, `src/audio/audioSystem.js`, `test/fb-leaving-has-a-shape.test.mjs`

## The gap
`dockingCradle.js` draws inbound chevrons and acquisition brackets from `state.dockingCorridor`, but
`dock:undocked` reaches only a berth pulse and a hull pose. Jettison has only a micro-motion pose
(`onJettison`) and borrows `sfx_massline_jettison` for its voice, flag-gated against a double. Pods leave the
ship and nothing leaves visually.

## Why this direction
A new departure burst was rejected. The cradle already owns the geometry: play it in reverse. The `fling` verb
already exists in `ACTION_VFX_RECIPES`. A jettison voice can share the `dash_punch` sample binding at a lower
rate, so no new asset.

## Mechanism
- On `dock:undocked`, run the cradle with a reversed phase: brackets release, chevrons point outbound, fade over
  the same 0.28 s.
- Add an `ACTION_VFX_RECIPES` row for `cargo:jettisoned` using verb `fling` along the jettison impulse direction
  from `jettisonImpulse.js`.
- Author `+sfx_cargo_jettison` in `RECIPES` (sample binding shared with the massline kick, rate 0.8) and route
  the jettison cue to it, removing the borrow and its double-guard.

## Done when
Seed 4242: dock and undock at Helios, jettison two lots; the VFX record shows one reversed-cradle sequence and
two fling rows; `test/audio-cargo-jettison.test.mjs` updated to the new recipe id;
`test/fb-leaving-has-a-shape.test.mjs` pins all three.

## Do not
Do not add particles to undock. Do not change the docking corridor or the jettison impulse. Do not gate on the
station type.

## Focus test starting points
- `test/docking-cradle-quiet-skip.test.mjs`
- `test/audio-cargo-jettison.test.mjs`
- `test/seam-jettison-impulse.test.mjs`
