# Orchard released-pod collision shock

The released original condensate pod now uses the existing collision damage law and combat damage owner. Gentle actual native wall contacts at5WU/s preserve hull100; a40WU/s contact reduces hull to about20; a60WU/s contact destroys it and settles one finite lost lot. No commodity vent, duplicate award, hitstun, plating fracture or replacement pod is introduced.

Native impact receipts capture both endpoint generations. The pod-only consequence path checks current tick, backend, exact lives, native owner/world and native-ready finite custody. A bounded post-contact event resolves damage after native contact publication closes and before the normal lifetime sweep, without changing the production system order or ordinary ship/drone timing. Save/Continue, world replacement, stale generation and duplicate receipt controls fail closed.

## Verification

-629/629 full selected cases: previous612-case roster plus17 shock regressions.
-62/62 native contact, lifecycle, attachment and audio compatibility cases.
-51/51 independent shock and ordinary collision cases; an additional independent manifest-relative contact check passes3/3.
-The production-order regression imports the actual update order and verifies same-tick destruction and finite loss through sim.step. Its pre-fix failure is preserved.

This is focused explicit simulation evidence, not a complete production-manifest run or browser/player-feel acceptance. The broader Orchard completion boundary remains open. Active thermal-readout/UI work is excluded; the629 run completed before those content changes.

## Exact delta

- src/core/sg02DynamicBodyOwner.js
- src/core/physics.js
- src/combat/impulseKernel.js
- src/systems/collisionConsequences.js
- test/anvil-orchard-pod-shock.test.mjs

Full120-file recovery manifest and exact five-path delta accompany this handoff. Preserve newer unrelated upstream work when applying it.
