# Native live-save compatibility packet

Status: local scoped proof passed; lifetime gate remains open. Nothing in this packet has been published, merged, or deployed.

Pins: PR #221 head `1c927e5508da7fff3f6d3ff3e65acd16e38a4e37`; common base `dc142c0108ce7663bc03574349623c3fda1033fa`; master control `c096bea251f1a835fd4690db3c42141ec771ee9f`.

## What changed

- Preserve PR's all-owner transactional native adoption. Same-life save canonicalization uses that transaction with the current attachment policy resolver. Refusal returns a scalar save instead of falsely certifying native parity.
- Serialize retired projectile ghost pools with exact Rapier body/collider handles, native generation-bearing handles, bucket order, and captured creation/adoption-time entity life and authored contract. Preserve LIFO reuse and the native arena. Never discard or accept unidentified native bodies.
- Validate retired ghosts against current authored ghost construction, accepting both sides of Rapier's deferred parent-disable propagation. Unknown, malformed, enabled, aliased or contract-incompatible bodies still refuse atomically.
- Preserve source identity/life through mutable entity reuse; refresh a pool's key/contract after an authorized in-place mass update.
- Preserve the old unrepresented-pool negative test by removing its new optional descriptor. Add 20 targeted tests. Adapt the planar geometry fixture to require honest scalar refusal before the first native yaw mirror, then native save after stepping. No goldens changed.

## Proof and limits

- 115/115 selected native, ghost-pool, planar, save-atomicity and contact tests pass (`../proof/final-pinned/focused-and-adjacent.tap`).
- Strict save-and-continue versus save/load at ticks 60, 120, 240, 360, 480 and 600 all pass three repeats. Strict checks require a non-null native payload, a replaced canonical live owner, and native exact adoption after reload.
- Repeat-20 at 600 also passes. Candidate hash is `5bb44c205a748deab27b48ff5d57c127f7a7d70924102ddfe073a692d803e999`; this is not a replacement master golden.
- Master control repeat-20 at 600 reproduces its unchanged expected telemetry hash `f4a6217584fd4f4cbe7d401c4f91df5b19ae922d5ba9f22f254f0de9f9f12ed7`.
- Import receipts verify every loaded module: 676 candidate and 660 master modules, zero unknown or mismatched source identities. Candidate inputs come from frozen PR bytes, exact pinned-master overlays and this repair, not the concurrently edited working composition.
- Independent review cleared the bounded ghost-pool implementation at owner SHA-256 `3875b640eb9b148364ce1929f9cab6ac587231689906d9d15456ee1c9e6bc927`.

The prior candidate failure remains preserved: reload 240 refused `unrepresented_native_body`, used scalar fallback, diverged at tick 242, and produced 11 hits versus 9 by tick 720. See `../proof/candidate-compare240.*` and `../prior-candidate/`.

The wider adjacent gate still fails `ceres-workfleet-attachment-save.test.mjs:273`: repeated Restore creates a new object under the same ID and generation because the upstream allocator restoration rewinds `nextOccupantGeneration`. That assertion is unchanged. Actual stale-action consequences and an existing restore/world identity fence are still being investigated. This packet does not resolve or certify that lifetime seam.

This is focused headless evidence, not full production, browser/GPU, Ceres normal-route or CI acceptance. Supported represented pools are ordinary disabled ball-shaped projectile ghosts; incompatible or unsupported native contracts remain scalar fallback.

## Applying safely

`files/` contains exact desired postimages for the native three-file integration subset and three tests. `manifest.json` records PR preimages, postimage Git blobs/SHA-256, complete runtime overlay identities and proof receipts.

`native-subset-against-pr221.patch` applies only this six-path subset to pinned PR contents. It is not a complete master integration and must not be published blindly. `semantic-repair.patch` expresses the semantic correction against PR's owner and the clean three-way physics result; upstream `saveSystem.js` is an informational postimage there, not an extra semantic change.

The textual merge still has two conflict hunks in `src/core/sg02DynamicBodyOwner.js`. A one-parent content adaptation does not repair ancestry. Any two-parent branch integration remains subject to the user's separate approval; this packet authorizes no merge, deployment, force-push or other remote mutation.

## Remote checks

At the recorded read-only check, PR #221 remained an open draft and `mergeable=false`; no workflow run existed for current head `1c927e55`. Old run `37162822252` is terminal failure: eight workload groups failed, browser (1) was cancelled, and the aggregate check failed. That run tested older review head `98d8e3c9` on synthetic merge `4f18d9b2` with master `f857…`; its runtime/test/workflow/package inputs were master-identical and do not test the current WIP.
