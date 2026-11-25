# CAM-RENDER-SPLIT-1 — land only architecture render wins, repair fidelity cuts

Surface: Neon implementation. Model: gemini-4-neon-xhigh. Do not commit.

Mission: split the 11 dirty render-performance files surgically. Land pure CPU/architecture wins and repair/revert direct fidelity cuts. Do not land the whole pile. The owner explicitly forbids making the game emptier, uglier, dumber, blurrier, or darker for speed.

Own exactly:
- src/render/actionVfx.js
- src/render/combat/structuredBurstGeometry.js
- src/render/farPlaneLife.js
- src/render/forceLanguage/flowEnvironment.js
- src/render/forceLanguage/sweptSurfaceBatch.js
- src/render/parallaxLayers.js
- src/render/thruster/ribbon/contrailTrail.js
- src/render/thruster/ribbon/plasmaRibbons.js
- src/render/thruster/systems/plasmaStream.js
- src/render/vfx/combatContactVfx.js
- src/render/weapons/projectileGeometries.js
- tightly scoped render tests only if behavior contracts need update

Required dispositions from the read-only audit:
1. Land architecture wins: flowEnvironment movement-query gate; actionVfx telegraph cache; plasmaStream squared ring math/lazy inactive-slot allocation/cold early return; farPlaneLife distant-traffic transform time-slicing if visually safe.
2. Repair/revert now: parallax integrated-GPU population halving; contrail 384/8/7 -> 160/6/5; plasma ribbon 12/7/56 -> 8/5/32; farPlaneLife survival total-hide unless independently proven mode-correct; projectile shell tessellation cut.
3. Hold quality-sensitive cuts out of the final diff unless there is strong matched A/B evidence: structured burst tessellation, swept surface tessellation, contact tessellation, actionVfx caps/culling, plasma low-tier single-wake collapse/shader simplification.
4. Do not add new rfx switches as shipping complexity unless necessary for measurement. This packet is implementation triage, not a measurement lane.
5. Preserve foreign lines. Inspect current diffs before editing. Use git show HEAD:<path> as baseline and produce the smallest correct final diff.

Verification: focused render tests; node --check; no game boot unless serialized by game lock. If you capture frames, inspect them. Report file-by-file final dispositions, exact tests, and anything still held.
