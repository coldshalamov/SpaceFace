<!-- LIFETIME: DURABLE -->
# Anvil Storm Orchard: reconciled implementation candidate

This is the SF20-14/P01 implementation evidence update, dated 2026-10-14. It preserves the outcome, ownership, source constraints and all five acceptance cases in `TWENTY_CONCEPT_MAP.json`. It does not declare full feature acceptance.

The recovered Orchard implementation has been reconciled against tested public master `f564e4ee4c8fffb9afd9d64e3f747891ed29abb4`: 107 original source/asset/test paths plus two new regression files. All six GLBs retain their exact recovered bytes. The later ba7 pose/readiness fixture is included. Newer native post-step dirtiness, parts-library registration/LOD, renderer scene-truth/matrix/camera, live atomic pose publication, and foundry-environment first-frame safeguards are preserved. This candidate excludes the separate GPU increment; its renderer composes cleanly with GPU head `b9bfe3f7941191b7d49f84a3dfdcda9de6551a21` and passes 30 focused Orchard presentation/pose, atomic-publication and foundry-environment checks in combination.

A reproduced Continue defect is repaired: the persistent Orchard frame can now restore outside Anvil without losing its original finite custody. Structural retention no longer incorrectly requires the active sector; player intake, release, collection and ready observation still require Anvil. Twenty-four cases cover native/scalar and direct/paced restores, empty/stowed/drifting custody, retirement/re-entry, and stale ledger/source refusal. Two additional dirty-post-step Continue cases preserve actual native pose and the original four-unit lot.

Fresh automated results on this public baseline:
- 548/548 Orchard, ordinary-route, custody, Continue, package-helper and pose checks
- 97/97 compiler/package, native-save, lifetime, residency, atomic-presentation and foundry-environment neighbor checks
- 30/30 Orchard presentation/pose and current atomic/foundry-environment checks with the composed GPU renderer

Reproduction: run `node --test --test-concurrency=3 test/anvil-orchard-*.test.mjs test/planet-runtime-anvil-orchard-route.test.mjs test/render-package-orchard-helpers.test.mjs test/sg02-pose-readback.test.mjs` after normal repository integration. A dependency-symlink staging harness additionally requires `--preserve-symlinks --preserve-symlinks-main`; without them, imported modules can bypass the candidate and produce misleading failures.

Remaining acceptance: direct ordinary player-input route review, live game-camera visual/feel review, and target-device performance measurement. Automated route/package checks do not replace those gates or the largest-hull/maximal-tow safe-pocket review. Historical browser or authorization failures are not assumed current. This receipt describes a tested reconciliation candidate, not a claim that it has been merged or that every SF20-14 acceptance case is complete.

## Exported-state visual evidence

The separately delivered CPU exported-package render uses the exact Orchard assets and recorded native Continue poses. The [machine-readable state observation](evidence/orchard-continue-state-20261014.json) records native and scalar Continue, all six measured collider and decoded-package visual rig transforms, original four-unit custody, pod position, and package hashes. Both observations preserve the original state after returning to Anvil; ready observation is denied while away. The image was inspected for framing and clipping. It is an exported-state visualization, not the live game camera or target-device performance evidence. No geometry/material edits were made for the image.

## Publication reconciliation and next goal

The publication base is `680260a967fa151b344d3bcd00095b1f06ff0727`. Its 23 changed paths since the tested baseline have no overlap with these 109 source/asset/test files or the two planning/evidence documents. Every frozen source byte was verified unchanged. Current upstream dependency changes are preserved by using this newer commit as the publication base.

Continue SF20-14/P01 through its original five acceptance cases without changing scope or relaxing assertions. The next remaining evidence is ordinary player-input interaction, live game-camera visual/feel review, target-device performance, and maximal-tow/large-hull safe-pocket validation. The CPU preview was delivered separately and is not embedded in this commit; the linked state JSON documents exported-state observations only. This remains a draft implementation candidate; no full acceptance or merge is claimed.
