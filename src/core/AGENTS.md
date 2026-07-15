# src/core/ agent notes

Core owns state creation, the event bus, fixed-step loop, system registry, lifetime/physics authority,
and shared low-level contracts.

- `gameState.js` defines default state and backend flags; save normalization must agree with it.
- `registry.js` owns system selection and update order. Reorder only with an explicit dependency
  reason and focused order/determinism tests.
- `loop.js` owns fixed-timestep simulation and render decoupling. Preserve bounded catch-up and frame
  pacing; never make simulation frame-rate dependent.
- Sim uses `state.rng` and `state.simTime`, never ambient randomness or wall time.
- `physicsAuthority.js`/Rapier own live physics authority. Compatibility modules are not the default
  gameplay seam.
- Core changes are broad: run focused tests, sim comparison, and the relevant launch/perf floor.
