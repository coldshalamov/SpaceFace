# PERF-05 — Avoid unused detailed diagnostics in physics ticks

The production physics caller reads only the body, dynamic body, attachment, and sync totals
after each step. SG-02 also walks all admitted bodies and colliders to compute detailed totals
that caller never reads. Skip those walks in the production step's summary. Keep the default
step result and explicit diagnostics complete, including current CCD and compound colliders.

Own `src/core/physics.js`, `src/core/sg02DynamicBodyOwner.js`, and
`test/physics-performance-cache.test.mjs`. Preserve stepping, contact order and state writes.
Run the named test and use the 160-rock, 14-enemy `scripts/probe-sim-step.mjs` fixture for a
matched Node measurement when the machine is free. The lead handles live measurements.
