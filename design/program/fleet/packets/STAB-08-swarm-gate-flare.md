# STAB-08 — Keep the Swarm arrival flare fixed at the gate

The first-round player truth trace recorded a passive beacon moving at almost 10 units/s at
the first active frame. Its tick, type and one-second lifetime match the arrival flare.
`_lightArrivalGate` declares it a nonphysical lamp, but the spawn inherits physical defaults
and the Foundry field pushes it. Match the authored nonphysical circuit markers. Keep the
existing lifetime, light cue, and all collision damage rules.

Owned files: `src/systems/survivalWave.js` and `test/swarm-round-shape.test.mjs`. Cover the
real spawn shape and its lack of physical admission. Run `node --test test/swarm-round-shape.test.mjs`.
The lead will review the locked player route.
