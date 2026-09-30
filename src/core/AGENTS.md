# src/core/ agent notes

Core owns state creation, the event bus, fixed-step loop, system registry, lifetime/physics authority,
and shared low-level contracts.

- `gameState.js` defines default state and backend flags; save normalization must agree with it.
- `registry.js` owns system selection and update order. Reorder only with an explicit dependency
  reason and focused order/determinism tests.
- `loop.js` owns fixed-timestep simulation and render decoupling. Preserve bounded catch-up and frame
  pacing; never make simulation frame-rate dependent.
- `runtimeWitness.js` is the 1 Hz flight recorder (`window.__SF_WITNESS__`). It is how agents see
  whether the 3D picture is presenting and where the last frames went. Do not guess freeze or
  performance from source first; run `npm run probe:runtime-witness`.
- Sim uses `state.rng` and `state.simTime`, never ambient randomness or wall time.
- `physicsAuthority.js`/Rapier own live physics authority. Compatibility modules are not the default
  gameplay seam.
- `physicsBody` (schema v1) authors a body's shape plus optional `density`, `contact` overrides,
  `impactDamageScale`, `fieldResponseMult`, and `collisionProxyManifest` — the same proxy manifest
  shared with measured skins. Bump `physicsBody.revision` to rebuild a mutated body spec.
- Core changes are broad: run focused tests, sim comparison, and the relevant launch/perf floor.
- Production calendar owners run at their authored phases on every fixed tick, including catch-up; `partitionUpdateSystems(..., { state, bus }).updateDt` supplies their elapsed simulation time. Table/near/glass keep fixed dt, keepalive is separate, and New Game/save restoration reset calendar baselines. Regressions: `test/sim-clock-catchup.test.mjs` and `test/calendar-elapsed-time.test.mjs`.
- `periodicClock.js` bounds due work per invocation without discarding valid accumulated time. Imported impossible clocks are repaired separately from runtime-corruption rejection. Focused proof: `node --test test/numeric-update-liveness.test.mjs test/calendar-elapsed-time.test.mjs`; do not replace carried backlog with a blanket elapsed-time clamp.
