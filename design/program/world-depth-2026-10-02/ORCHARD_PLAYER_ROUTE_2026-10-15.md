<!-- LIFETIME: DURABLE -->
# Orchard player-input and Continue integration

Source/test snapshot base: `e3e6065c35d6d7bc59e9609120dc058517493f4e`. This feature branch starts from fresh public master `60415197397351f988b85e51884fa8624fb71939` (verified 2026-10-15 00:23 UTC). The intervening master commit touched four paths outside this 114-file snapshot; those current files remain intact. A targeted current-base `test/frame-solid-delayed-readiness.test.mjs` check passed 4/4. The full candidate suites below remain runs on the e3 source/test snapshot, not a complete rerun on 60415. This 114-file snapshot retains the original authored asset bytes and original twenty-concept acceptance scope.

## Three failures reproduced and repaired

1. UI Continue retains loading mode during native cold adoption. A private current cold-restore plan now permits custody retention in that phase, while all active operations still require flight in Anvil.
2. Continue marks restored bodies noInterp. Rewriting already-exact fixed Orchard roots through Rapier setRotation renormalized their f32 quaternions, invalidating strict geometry custody. Existing exact canonical checks now avoid that redundant rewrite for the fixed frame and fixed pod only. Dynamic pods keep the existing resync path; geometry tolerances are unchanged.
3. Successful fixed-to-dynamic pod release retained a cached static physics partition. The next ordinary tick retired the dynamic native body, preventing collection near the player. Atomic handoff now invalidates the retained partition cell after descriptor/currentness validation. Both parked and flying whole-frame classification caches reject invalid partition values and recompute the normal dynamic classification. Accessor, nonwritable and stale-after-prepare cells refuse before mutation. No callback-capable activity API runs inside final atomic commit.

## Ordinary-input evidence

A focused headless test uses production flight key reduction, unchanged target/component UI handlers, raw KeyB, normal sim ticks, natural planet-worker harvesting, and actual proximity-to-cargo settlement. It does not call private release, handoff or pickup operations. Target/component commands use production bus dispatch; this is not a browser click test.

Seed424214: fly roughly1450world units; naturally fill one original four-unit lot at tick2579; save during opening progress9; invoke the UI finalizer and resume; release that same lot at2612; physically collect at2769. Cargo is4, source remaining44, exactly one pickup event. A second Continue invokes the finalizer again, ends in flight, and does not resurrect the consumed pod or duplicate cargo.

Independent review passes13focused cases, including canonical/noncanonical roots, retained frame-source replacement, warmed parked/flying partition caches, and fail-closed handoff cells. Both exact-quaternion cases and both warmed classification variants fail against their saved pre-fix sources. Existing activity/classification checks pass94/94. Root independently reran93current compiler/package/save/residency/atomic/foundry neighbors successfully. The full final Orchard command passed579/579 with zero failures, cancellations or skips.

## Remaining gates

This proves the focused production-handler route, not full browser input integration, live game-camera visual quality or target-device performance. Browser launch did not reach a page; no live capture is claimed. Largest-hull/maximal-tow safe-pocket review and all original acceptance fields remain open. Prior CPU views use actual exported package geometry and recorded poses but are not live camera captures.

SF-GAME, SF-ORCHARD, SF-PUBLISH, SF-RECOVER, SF-VISUALS, SF-ASSETBANK and SF-ASSET-QUALITY remain open. Recovery-namespaced snapshots are not a merged playable feature. Separate GPU PR383 stays draft under reviewer HOLD. No merge, deployment, credentials or security configuration is changed by this work.
