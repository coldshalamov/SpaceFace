# Ceres disturbance recovery WIP

This is a separate, syntax-valid functional WIP over the earlier Ceres integration. It is not merge/deploy acceptance. Current art was rejected separately; this packet changes no art, collider geometry, mass, inertia, or engine budget.

## Dependencies and scope

- Apply the original five Ceres simulation packets and presentation composition first.
- Include independent native lifecycle correction `8b2576ffb86ab9d7eb030a0ec0ae4445be3f751e65e4aad348db2c514480a387` (stale failure receipts and absent-body retry resurrection). Its reviewed owner hash was `7eedfa88e2dca21290ddf4e77aa66f6d189c22143bd12bbcbcc448d2ccbe457c`; do not replace later convex/partition owner changes wholesale.
- Three production files change: `src/systems/ceresWorkfleet.js`, `src/systems/ceresWorkfleetRecovery.js`, and `src/data/ceresWorkfleetHardware.js`.
- The existing job gains an exact released-plate local activity lease and `reacquire` phase. It uses existing carrier thrust and native compound queries, preserves the initial one-WU cargo commissioning predicate and 211-WU close-approach limit, and can return a displaced empty carrier to work inside the existing 740-WU local area.
- Head return becomes re-entrant in the actual carrier frame. Linear/angular point-velocity feed-forward is clamped after adding correction, retaining 10 WU/s and 8 WU/s² head limits. Existing pose and relative-speed docking tolerances are retained. Native-certified clear prefixes allow approach to an intentionally flush dock without crossing solids.
- The latest revision adds a non-resetting return deadline derived from measured distance, braking and settle time. Terminal failure releases process-local leases while retaining existing physical attachments/custody. This latest deadline path still needs dedicated boundary tests.

## Evidence, with exact attribution

Executed source maps and compressed full Save fixtures are listed in `verification/ceres-disturbance-executed-source-pins.json` and `verification/ceres-disturbance-observed-results.json`. The fixtures are actual game Save envelopes, including native state, compressed without modifying the decoded bytes. Save/Continue has its existing transient-entity policy; these are not claims of bitwise equivalence to an uninterrupted world.

- Earlier frozen normal source `d31c801413aa63954e561f27678529e22d288aafecef2edd7dca74e157b84dd1` secured the original 1800-mass plate at tick 63698 and passed actual Continue through 63938. It does **not** certify this WIP or newer master.
- Actual historical tick-12000 Save: physical reacquisition reached extraction at 20160; mid-reacquire actual Save/Continue at 19146 reached extraction at 20166. One original plate identity, unchanged mass, no ghost tow.
- Actual post-second-impact Save: re-entrant head docking reached 20027; the carrier returned from about 520 WU displacement; physical extraction resumed at 99679 and remained valid through 100279. This successful run precedes the final non-resetting deadline addition. The exact older executed bytes are recorded; its success must not be restamped onto the latest revision.
- Latest focused controller/frame/sweep/lease suite: 15/15. It covers common translation, positive/opposite carrier spin, total velocity/acceleration caps, actual native moving-frame docking, late obstruction revocation, braking/clear-resume, overwritten life, broken mount, destroyed head, player custody, cancellation and restore teardown.
- The selected-owner early tick-3456 reconstruction is a different physical scenario: its plate can remain mobile rather than settle eight WU. Its recovery expectation remains red. It is neither a substitute for the full Save nor proof that moving-cargo rendezvous is complete.
- Final full-factory normal/Continue acceptance on current master is pending. Re-run after complete source composition.

## Commands in the composed repository

Focused checks:

```
node --max-old-space-size=192 --max-semi-space-size=8 --test --test-concurrency=1 test/ceres-head-relative-frame.test.mjs test/ceres-head-late-sweep.test.mjs test/ceres-reacquire-safety.test.mjs
```

Actual Save/Continue probes (the public runner was adapted from tested isolated probes and syntax-checked; it has not yet been rerun in this final layout):

```
node --max-old-space-size=256 --max-semi-space-size=8 scripts/probe-ceres-reacquire-saved.mjs test/fixtures/ceres-reacquire/seed47-mid-return.json.gz 9000
node --max-old-space-size=256 --max-semi-space-size=8 scripts/probe-ceres-reacquire-saved.mjs test/fixtures/ceres-reacquire/seed47-after-second-impact.json.gz 90000
node --max-old-space-size=256 --max-semi-space-size=8 --unhandled-rejections=strict test/ceres-workfleet-production-cycle.test.mjs
```

Single-process execution avoids the extra Node test-worker/wrapper footprint. Two prior wrapped normal runs were externally SIGKILLed; cause was unconfirmed. No assertions or physics cadence were shortened.

## Known open issues and next steps

1. Revalidate actual head pose and relative point velocity again at **mount binding time**, not only at the preceding waypoint transition. Continue frame tracking while docking is pending. A late impulse between those steps must not create custody from stale readiness.
2. Moving-frame docking removes the old implicit assumption that the carrier is already at work. Make that carrier-at-work precondition explicit before the **ordinary initial** tow gate; otherwise direct tow admission can be attempted from a displaced carrier while the plate remains at its initial pose. Route that case through bounded reacquisition instead. Do not relax the one-WU cargo predicate.
3. Add tests proving the return deadline survives obstruction/replanning and Continue, cannot reset indefinitely, fails cleanly under continued impacts, and releases every lease on timeout and owner-life loss. Test malformed/future saved budgets.
4. Re-run the actual post-impact Save with the final deadline source and a mid-return Continue. Re-run all focused suites and current-master production normal/Continue under a new source pin.
5. Moving-load rendezvous is not implemented. Do not turn a permanently `cargo-moving` hold into a claimed recovery, widen tolerances, or increase force to make it pass. First establish the real route requiring it, then design bounded current-thrust/attachment capture with native obstruction checks and finite pursuit bounds.
6. Review simultaneous carrier/head swept-path certificates independently, especially late obstacles, braking holds and repeated impacts. No solver or capsule geometry change is justified by the observed incidents.

## Incident classification and upstream seam

The initial collision is civilian: DMC/team-2 `ship_hawser` 511, passive `convoy_civilian`, role `tug`, towing the real 190-mass `civilian_manifest` lot 512 through `att_000003`. Saved route: Tow(-13349.695,8878.796) to Beltout Yard(-11508,7252), configured speed 20. The actual load struck the cradle at about 71 WU/s. The nominal route lies south of the work area; do not claim a route intersection without tracing the physical departure/overshoot. Read-only upstream review seam: `traffic._spawnYardTugLot` / `_ensureYardTugJobs`, and `npcJobsRuntime._drive`, whose transit branch follows planned route/clock without a swept-load/work-area avoidance check. No AI steering changes were made here.

The later striking ship is combat: the actual Save's enemy-mind ledger records entity 572 in `sg06_vael_wing_0015`, verb `press`, phase `engage`, target player 1, reason `hold_attention` at tick 17191. Native impacts at 17825/17826 have 71–84 WU/s closing speed and a 4748.8 impulse. The exact team/ship subtype is not retained in that serialized ledger, so it is not guessed. This is distinct from the civilian tug incident.
