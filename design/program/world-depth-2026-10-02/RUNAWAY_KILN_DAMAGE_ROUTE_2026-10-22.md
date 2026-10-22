# Runaway Kiln: ordinary damage route

## Scope and public base

Prepared against public master `5e5b619b57c53be410e90c7e5f21bbb2fd0127f5`.
The runtime and package blobs were rechecked against `master` on 2026-10-22 at 21:28 UTC and remained identical.
Allocation: `CLAIM_RUNAWAY_KILN_2026-10-22.md` at handoff commit `bab31e22740171ac937f19848d88739d50c81594`.

Four implementation/handoff files plus three source-preview review artifacts:

- `src/systems/runawayKilnRuntime.js`: fire() spawns a damageable `payload`, not a damage-filtered `beacon`; explanatory comment only otherwise.
- `test/encounter-runaway-kiln-damage-route.test.mjs`: new actual combat-route and physical eligibility regression.
- `package.json`: adds only `check:runaway-kiln-damage-route`; preserves all pre-existing scripts and fields.
- This evidence handoff.
- `evidence/runaway-kiln-20261022/extract.mjs`, `render.py`, and `review.json`: reproducible static source-preview recipe and measured primitive bounds. Generated JPEG/geometry output is not a game asset.

Baseline Git blob hashes:

- Runtime: `6aba14b2e60f15992e52a204319482e9ebe83295`.
- Package: `ed7d24f41bca13fd1035b026c325e0aa9ab12f4b`.
- Existing Kiln test, unchanged: `adf87fcf2f1a2f77e46c2ffb853e60c6605f152c`.

No combat allowlist, renderer, geometry, world, traffic/mining, Vesta enemy owner, persistent owner or shared system changes.

## Reproduction and fixture boundary

The fixture admits the existing authored encounter with `force:true`, but does not synthesize combat events, outcomes, payout or physical completion. It uses the actual Vesta Forge zone center and Depot Three anchor: global spawn (-480,17104), depot (1120,15824), closing speed 24 WU/s. It tests existing owner APIs rather than browser input or projectile aiming.

Original source rejects both ordinary kinetic scratches and a lethal hit as `target_not_damageable`. The authored warning and detonation handlers are therefore unreachable through these normal combat packets. Existing encounter tests emit combat events directly and do not catch the routing rejection.

With the sole payload change, a real first scratch lowers hull and warns without finishing; a second scratch records `detonated`, without rescue payout. A lethal ordinary hit also records `detonated` without rescue payout. No fixture overwrites the spawned entity type.

The actual SG-02 owner still constructs mass 150, proxy `kilnback:forge:v1:00`, one collider. Actual tether eligibility remains true. Production salvage configuration rejects it, and the pickup collector admits no collection. No commodity or loot ownership is added.

## Checks

- New regression against original public runtime: 1 passed, 2 failed, both failures at ordinary damage admission (`target_not_damageable`).
- Candidate: `node --test test/encounter-runaway-kiln-damage-route.test.mjs`, 3/3 passed.
- Package command: `npm run check:runaway-kiln-damage-route`, 3/3 passed.
- Existing suite separately: `node --test test/encounter-runaway-kiln.test.mjs`, 6/6 passed.
- Parsed package comparison confirms the unique command is the only package change.

Execution used an existing exact-public source overlay with a private import loader supplying only the candidate runtime module. No copied source tree or private Git ancestry is part of this delivery. Loaded closure grew from 766 source files for initial combat reproduction, to 971 for side-effect checks, to a cumulative 1,028 including the reproduction, side-effect/save probes and test runs. The independent focused tests plus edge loaded 897 unique source URLs. All underlying public source hashes matched the public inventory plus complete verified upstream deltas; the sole intentional runtime replacement is the shipping file. No aggregate tests or `anvil-receiver-delivery` test ran.

## Known limits and visual implication

This is not ordinary-browser acceptance. Payload changes rendering from the old procedural beacon to generic cargo presentation. It restores the gameplay failure route, but does not claim a finished molten-crucible silhouette.

An existing generic per-prop model hook (`packagedPropFile`, `packagedPropSlot`, `packagedPropRadius`) was verified. The shipped Kilnback model has two external casks, but this encounter uses the core-only native body. Binding that entire model would add a visual/collider mismatch; no model was bound, no hook invented, and no Kilnback persistence/key/loot identity was spoofed. Dedicated visual acceptance remains separate.

Interrupted Save/Continue is an existing unsolved limitation: transient Kiln entities are not persisted and the director does not restore this active encounter. The payload change does not repair that behavior; the regression deliberately does not require this failure as a future invariant. Existing continuous sector transitions preserve live runtime, whereas hard exits abort it. Completed story/receipt persistence is source-inspected, not a newly demonstrated full Save/Continue rescue acceptance.

Independent review found no blocker in the bounded damage correction. Publication and browser acceptance remain pending.

## Independent review and reproducibility

The reviewer reran all nine named tests with an independently instrumented loader, then a scratch → lethal → extra hit → 70-tick edge. Exactly one history row, resolution, headline and danger impulse appeared; no credits or reputation were awarded. The extra hit rejected target_missing. An unrelated ordinary beacon remained damage-filtered and a hostile ship remained damageable. The actual loader-returned source hash changed exactly one module to the candidate.

Overlay execution requires `--preserve-symlinks`; omitting it resolves backing paths and bypasses the exact-URL candidate replacement, reproducing the two original failures. This was a harness invocation error, not a candidate regression. On a normal checkout with the candidate files applied, the named npm command needs no private loader. The reviewed composed public inventory is not a newly cloned clean checkout, and dependencies, vendor and native binaries were reused rather than comprehensively re-audited.

## Actual procedural visual review

The exact public visualFactory blob `aba8b7cb9aa411907eb3d867f0f38892463484bd` was fetched at the public base and hash-verified. A static source-slice comparison was rendered in Blender from its unchanged beacon/payload primitive builders, both at entity radius 23. The change selects a sealed cargo canister instead of a navigation buoy. It does not introduce a new authored model.

The primitive slice changes from 304 triangles / five mesh objects to 336 triangles / four mesh objects. These are not live GPU draw calls, residency measurements or frame-time results. Material scalar properties were transferred; game lighting, tone mapping, blink/animation and material-role processing were not reproduced. The canister still does not match the dedicated core-only collider precisely, so no finished-art or collision-silhouette acceptance is claimed. The existing full Kilnback mesh was intentionally rejected because its external casks also mismatch that collider.

Reproduce the static comparison from a checkout containing the source baseline: run `node design/program/world-depth-2026-10-02/evidence/runaway-kiln-20261022/extract.mjs`, then `blender -b --python design/program/world-depth-2026-10-02/evidence/runaway-kiln-20261022/render.py`. The extractor rejects a different factory source hash. Outputs are geometry.json, review.json and source-comparison.jpg beside the recipes. This is a source preview, not an exported-package render or live game-camera capture.
