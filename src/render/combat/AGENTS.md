# src/render/combat/

The contact picture, not the damage kernel. Read `src/render/AGENTS.md` and `src/presentation/causalVfxGrammar.js` first. `src/combat/damage.js` applies the hit.

- `impactRead`: an unsigned axis stays 0, 0. Do not invent a normal.
- `collisionImpactScale` uses `feelDeltaV` (pre-solve), not the solver cap.
- No `Math.random`. Phased explosions use the integer mixer.
- Arcade structural pools are fixed: blades 128, arcs 48, shards 64, plates 32.
- Do not add `THREE.Points` or `THREE.Sprite` as the impact itself.
