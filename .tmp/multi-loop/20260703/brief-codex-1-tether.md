# TASK: Wire the dormant tether/attachment system into live gameplay (SpaceFace WS-D1)

You are Codex working in the SpaceFace repo (Three.js top-down space game, XZ-plane sim, 60 Hz fixed timestep).
Read `design/GDD_2_0.md` §4.3 and `design/BUILD_PLAN_2_0.md` (input contract + your file ownership) FIRST.
Then read: `src/combat/attachments.js` (full), `src/core/constraints/masslineController.js`,
`src/combat/combatDefs.js`, `src/systems/weapons.js`, `ARCHITECTURE.md` §0 (state/event contracts),
`src/systems/mining.js` lines 1-120 (for target-acquisition pattern reference).

## What exists (do not rebuild)
`attachments.create(spec)`, `.reel(id, delta)`, `.cut(id)` — Rapier-joint rope constraints with tension
telemetry and break thresholds. They are implemented and tested but called by nothing.

## Build exactly this
1. New file `src/systems/tetherGameplay.js` — a registry system `{ id:'tetherGameplay', init(ctx), update(dt, state) }`:
   - Consumes the LOCKED input contract fields on `state.input.actions`: `tetherFire` (edge-triggered bool),
     `tetherCut` (bool), `reelDelta` (float per-tick winch intent). These fields may not exist yet at runtime —
     guard with `?.` and test via sim-harness scripted inputs, NOT the keyboard. Do NOT edit `src/systems/input.js`.
   - On `tetherFire`: acquire target = nearest attachable entity within 260 wu of `state.input.aimWorld`
     (asteroids, wrecks, cargo pickups >5u, ships, station anchor nodes). Spawn attachment via
     `attachments.create` with type `tether_standard` (define in combatDefs — see 3).
   - Only ONE player tether active at a time; firing while attached re-targets only after cut.
   - On `tetherCut` or break: release. Apply NO artificial exit impulse — the Rapier joint's conserved
     momentum is the slingshot; just remove the constraint.
   - `reelDelta` calls `attachments.reel` clamped to the def's `reelRate`.
   - Mass-ratio rule: if playerMass / targetMass >= 1.67, the target is "yankable" (joint pulls target
     dominantly); between 0.6 and 1.67 both bodies swing; below 0.6 the player is the pendulum. This should
     emerge from Rapier mass properties — verify it does, and set body masses from entity `def.mass` if they
     currently default to uniform.
2. Events (emit via bus, exact names): `tether:latched {targetId, type}`, `tether:strain {ratio}` (emit at
   most 5/s, ratio = tension/breakThreshold), `tether:broke {targetId}`, `tether:released {targetId}`.
   VFX/audio/HUD consume these later — you do not touch UI, render, or audio files.
3. In `src/combat/combatDefs.js` add an `attachments` def table entry:
   `tether_standard: { maxLength: 260, minLength: 18, reelRate: 46, breakTension: <tune>, snapImpulseNoise: 0 }`
   — tune breakTension so a scout-class ship at boost speed CAN break it on a station anchor but not on a
   mid asteroid. Derive from existing mass/thrust values in `src/data/ships.js`; show your derivation in a comment.
4. In `src/systems/weapons.js`: ONLY suppress primary fire while `state.input.actions.tetherFire` is edge-firing
   this tick (one guard clause). No other changes there.
5. Registry: register `tetherGameplay` in the appropriate init list (find where `mining` is registered and
   register adjacent to it, same pattern).
6. New check script `scripts/check-tether-gameplay.mjs` (copy the structure of an existing sg02 check):
   scenario — spawn player + mid asteroid 200 wu apart, scripted inputs: thrust to 80% max speed on a path
   tangent to the asteroid, tetherFire at closest approach, hold 1.2 s of arc, tetherCut. ASSERT: post-cut
   speed >= 1.25x pre-latch speed AND heading changed >= 70 degrees AND events latched/released both fired.
   Also assert `check:sg02:tether` and `check:sg02:tether-break` still pass.

## Constraints
- Sim purity: no Three.js imports anywhere in your files. All randomness via `state.rng`. Determinism must
  hold: `npm run check:sim` must stay green.
- Do NOT touch: `src/systems/input.js`, `src/ui/**`, `src/render/**`, `src/audio/**`, any `test/*.expected.json`.
- Match the code style of `src/systems/mining.js` (module pattern, private `_helpers`, JSDoc-light).

## Verify before you finish (run these, fix failures)
```
npm run check:sg02:tether && npm run check:sg02:tether-break && node scripts/check-tether-gameplay.mjs && npm run check:sim
```
Write the files. Print a 10-line summary max: files written + verification results. Do not paste file contents.
