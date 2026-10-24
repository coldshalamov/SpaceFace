# Veil-Ray Nursery causal feedback

## Bounded increment
The existing SF20-15 nursery already provides three persistent adult identities, one visual juvenile flock, mineral ribs, disturbance/recovery behavior and a passive survey. This change explains actual scan, weapon, consumed-drive and adult-loss events through its existing text receipt lane. It does not add a population, ecology system, reward, physics controller or new visual asset.

A cue requires the nearby living player, current sector, sufficient revelation including an existing biology fitting, and a nearby living adult. One disturbance attempt and one recovery attempt are retained per episode. Repeated stimuli share that episode; the latest actual cause informs the recovery sentence. Loss wording does not assign player blame. Existing relocation feedback remains its own sole cue. Recovery says the disturbance is fading, not that every animal returned or survived.

Flags are latched before synchronous emission, and the sustained drive interval is consumed before its cue. After callback-driven ecology replacement, the old tick returns before writing its retired nursery record. Existing quiet-HUD admission and fight/hurt suppression remain: these flags record emitted attempts, not guaranteed display or acknowledgement.

## Evidence and limitations
The original public helper fails five of the initial twelve checks (7/12 pass). The first candidate passed those twelve but review regressions exposed repeat-emission, early-serialization and stale-record writes: 13/17 passed. Final R2 passes all nineteen tests, including the original five tests and fourteen feedback/lifecycle checks. Exact sanitized stdout and failures are retained in [the proof](VEIL_RAY_NURSERY_FEEDBACK_PROOF.json).

Tests exercise the actual native consumed-force witness, solid ribs, reduced-motion membrane behavior, existing receipt admission, fitting/proximity gates, reentrancy and ecology serialize/deserialize. They distinguish requested/unconsumed and stale force from a native-consumed drive flare. The local run used exact candidate sources over an immutable selected dependency snapshot, not the entire current public checkout. Restore checks call serializeAlienEcologyState/deserializeAlienEcologyState, not full Save.loadEnvelope. No browser, personally flown encounter, live-camera, GPU, performance or whole-concept acceptance is claimed.

No offline progression, new specimen population, adult replenishment, alternate HUD policy or new save owner is introduced. Existing survey reward and relocation behavior are preserved. Broader SF20-15 integration and acceptance remain open.

## Publication and gate
Fresh public parent 8d2373447b187b4f476c7fba0268910af98b2106 retains the reviewed helper/test baseline identities:
- helper: 4fff72284e3d715c4bf24de1e1b5b846f3c070a7
- test: e136431b5a4f4ee8f7ac4ea2b8992c4e14b337ba

Final helper 00d013d0cf444b7ae4dadbaf653e245163ea9647; final test d1d0dbce6fc61d386817514798a45ff85c32804e. Only these two implementation/test paths plus package, this report and sanitized proof are changed. Fresh exact-path census found no other open owner; shared world, alien ecology, renderer and Save paths are untouched.

The additive check:veil-ray-nursery-feedback alias runs only test/veil-ray-nursery.test.mjs. Its appended existing-check-chain leaf reaches static shard 2/3 with nineteen expected TAP tests, no unclassified command and all prior command order intact. No workflow or shared runner changes. Hosted full-checkout validation is pending and will be reported separately from these local results.
