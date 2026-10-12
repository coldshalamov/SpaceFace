# INFERENCE: ten production repairs (2026-10-12)

Integrated published master: `e68c5a6578461e8cf6e2211fd365a60b35c37251`.

Requested: 10. Implemented / focused green: 10. Accepted / rendered player-route proven: 0.

These are ten separately committed production repairs. Tests, source transport, integration, and this receipt are support-only. Ordinary rendered Adventure/Continue and the full player-truth landing gate have not been demonstrated; publish as a draft PR, not a master acceptance claim.

## Production ledger

### inference-ten-01-beacon-hostility (WF-01)
Commit: `6f00efbb1247cd54a475eb01525853701fedea0c`.

Claim beacons no longer hijack civilian jobs or clean patrols; only live hostile relations lure and prolong the skirmish.

CONSIDERED: New civilian barks; longer beacon life; civilian-safe beacon lure. Chose lure because a live deploy was overwriting neutral work and fabricating combat interest.

Focused verification: `test/inference-beacon-hostility.test.mjs`, `test/seam-beacons.test.mjs`, `test/beacon-hold-skirmish.test.mjs`.

Limits: Existing beacon-hold fixture now authors its raider as pirate instead of relying on team 1 alone; its original lifetime assertions are unchanged.

### inference-ten-02-cruise-return (WF-15)
Commit: `9a13c21181482561024938b67e68f85c6049f561`.

Docking and death end cruise and its weapon lockout without a yaw penalty; return input and subscriptions are lifecycle-safe while pause and Continue preserve flight.

CONSIDERED: Change cruise speed; change charge duration; repair dock/death continuity. Chose continuity because cruise stayed active across berths and respawns; duplicate listeners also multiplied chip damage.

Focused verification: `test/inference-cruise-lifecycle.test.mjs`, `test/infer-cruise-dead-drive.test.mjs`, `test/infer-cruise-hit-drop.test.mjs`, `test/infer-cruise-masslock-toast.test.mjs`, `test/verb-16-cruise-charge-meter.test.mjs`.

Limits: Audio voice fixture additionally needs the absent local three package; rerun on dependency-equipped remote verification. Standard cruise acceptance script passes unchanged.

### inference-ten-03-survey-continuity (WF-10)
Commit: `54094b1e2328d6076df443bc1aa312d5bfe9b179`.

Previously investigated wrecks and chart milestones remain spent after Continue; retained loss history stays recognizable after the survey cache rotates.

CONSIDERED: Raise the history cap; add more survey bonuses; preserve survey identity across saves and eviction. Chose continuity because forgetting discoveries both erases useful knowledge and pays duplicate rewards.

Focused verification: `test/inference-survey-continuity.test.mjs`, `test/survey-cartography.test.mjs`, `test/seam-scan-reveal.test.mjs`, `test/scan-wreck-provenance.test.mjs`, `test/loss-ledger-kill-provenance.test.mjs`, `test/ghost-convoy-bounty.test.mjs`.

Limits: Cold restore tested through the real lossLedger serialize/deserialize carrier; full browser Continue route remains unproven.

### inference-ten-04-pd-coverage (WF-15)
Commit: `654ed98d52046952f4432343aef3c9204f36d029`.

Flak batteries now answer reachable front-arc threats even when a nearer missile is behind the turret; blind spots and saturation remain real.

CONSIDERED: Increase flak range; widen its turret arc; select a reachable threat before prioritizing missiles. Chose valid-target acquisition so the existing directional tool works without removing counterplay.

Focused verification: `test/inference-pd-target-coverage.test.mjs`, `test/fb-flak-interception.test.mjs`, `test/fb-flak-intercepts.test.mjs`, `test/countermeasure-denied-readiness.test.mjs`, `test/pd-screen.test.mjs`.

Limits: Three yaw cases plus missile/bolt priority, no-target resource preservation, and servo negative control. Catalog chance, arc, energy and cadence unchanged.

### inference-ten-05-yard-booking (WF-06)
Commit: `e8ef0e1fa06b669cc5609d25e3ee2f308306d1b6`.

Repair/refuel repeat presses no longer sell the same missing hull or fuel twice, and emergency-fuel notes cannot stack while the first pump is pending.

CONSIDERED: Shorten all yard waits; disable every service button while any job runs; prevent duplicate purchases of the same pending service at the credit owner. Chose typed pending-job prevention to keep crew queues and simultaneous repair/refuel useful.

Focused verification: `test/inference-yard-repeat-booking.test.mjs`, `test/station-services.test.mjs`, `test/yard-abort-refund.test.mjs`, `test/station-yard-frozen-dock.test.mjs`, `test/station-service-dock-gate.test.mjs`.

Limits: Real economy and yard booking owners; queued/active duplicate presses, debt, mixed service queue, partial-fill top-up, abort/refund and legacy instant lane verified.

### inference-ten-06-drill-field-memory (WF-16)
Commit: `f0169d9ce64e45d2f9b9530ffa7f235149fca45e`.

Deep-core ore extraction persists before the drill screen closes, survives interrupted sessions, and no longer reports a surviving asteroid as destroyed.

CONSIDERED: Make drill sessions persistent; raise the field recovery rate; record accepted cargo at the durable extraction boundary. Chose atomic field memory without a second cargo or procedural-session save owner.

Focused verification: `test/inference-drill-field-accounting.test.mjs`, `test/drill-yield-feedback.test.mjs`, `test/drill-depleted-rock.test.mjs`, `test/infer-drill-commitment.test.mjs`, `test/field-regrowth-heartbeat.test.mjs`.

Limits: 20 drilling checks plus field-regrowth suite; maintains the original per-session 0.08 depletion cap, no payment for rejected ore, no double booking on end, legacy tail compatibility. Browser save route remains unproven.

### inference-ten-07-volatile-rupture-truth (WF-12)
Commit: `730c849bad5307f864cbf05e5e0a2fcc124c22d2`.

A surviving volatile pod remains critical and recoverable instead of announcing that its freight is gone; actual destruction still produces one loss cue.

CONSIDERED: Force-kill resistant containers; suppress all rupture presentation; report only actual combat-owned destruction. The last preserves material strength, recoverable cargo and honest terminal feedback.

Focused verification: `test/inference-volatile-rupture-truth.test.mjs`, `test/nxb-008-volatile-exposure.test.mjs`, `test/nxi-029-volatile-manifest-pod.test.mjs`.

Limits: Four new regressions fail on unchanged source. Combat-owner nonlethal-to-lethal sequence passes. Extended volatile-cargo-expansion native-physics suite could not initialize Rapier in source-only checkout; retry remotely. Ordinary rendered route unproven.

### inference-ten-08-recovery-choice-commitment (WF-09)
Commit: `84343587bc183414353ed73ce44723527902d5b6`.

Partial stripping commits its real recovery method and consequence; the decision deck offers Continue Strip, and full-hold retries cannot convert stolen components into a rescue payout.

CONSIDERED: Roll back already accepted cargo; reserve an all-or-nothing extraction; preserve physical partial pickup and commit its method. The last keeps useful imperfect recovery without free moral or payout switching.

Focused verification: `test/inference-recovery-choice-commitment.test.mjs`, `test/recovery-encounter.test.mjs`, `test/prompt-deck.test.mjs`.

Limits: Four new regressions fail before repair. Live cargo/recovery/event/prompt paths and serialized commitment pass. A completely refused pickup still allows another method. Separate pq195 wreck-heist suite needs missing Three dependency; not counted. No rendered acceptance claim.

### inference-ten-09-wingman-loss-settlement (WF-07)
Commit: `0c3d62cf92d5701056c42a0788a2d8d5dc218ab6`.

Destroyed wingmen now leave the real fleet ledger and loss log exactly once instead of returning alive after a jump; simultaneous casualties and damaged survivors settle correctly at hard departure.

CONSIDERED: Only correct the damage field; delete fleet rows directly; share owner-routed loss settlement between live update and hard departure. The third prevents resurrection at both boundaries without taking ownership from automation.

Focused verification: `test/inference-wingman-loss-settlement.test.mjs`, `test/infer-wingman-down-toast.test.mjs`, `test/wingmen-damage-and-moving-rock.test.mjs`, `test/wingmen-lifecycle.test.mjs`, `test/wingman-mining-order.test.mjs`, `test/wingman-guard-asset.test.mjs`.

Limits: Three new regressions fail on baseline. Uses actual automation loss owner, not a mocked event consumer. Normal life-cycle, damaged survivor, mining, guard and continuous handoff tests pass. Ordinary route unproven.

### inference-ten-10-route-combat-authority (WF-14)
Commit: `bad8fa2a5eedc5d335e1bfdaf1d3d8b5026f0fde`.

Autotravel now yields to actual shield or hull damage from the live combat kernel, ignores refused/zero-damage requests and keeps the itinerary resumable without rearming itself.

CONSIDERED: Interrupt on every damage request; poll hull loss each tick; consume the existing applied-damage receipt. The receipt covers modern direct-kernel weapons, shield hits and refusal truth without polling or a second controller.

Focused verification: `test/inference-route-combat-authority.test.mjs`, `test/infer-route-dead-drive.test.mjs`, `test/infer-route-engage-denied.test.mjs`, `test/route-engage-action.test.mjs`.

Limits: All six new regressions fail on unchanged production after correcting the test to the actual totalApplied return contract. Main route-follower and brake-feedback suites need absent installed dependencies; run remotely. Existing direct route unit fixture now emits canonical applied receipts without weakening its assertions. Ordinary route unproven.

## Combined verification

Command: `node --test --test-concurrency=1 --test-timeout=60000 <45 distinct focused test files listed above>`.

```text
  ...
1..259
# tests 259
# suites 0
# pass 259
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 11036.009506
```

Also ran `node scripts/check-cruise.mjs`, `node scripts/check-player-facing-labels.mjs`, syntax checks on all owned JS/MJS files, and staged diff whitespace checks.

## Expanded integration checks

- `test/inst-22-cruise-engage-voice.test.mjs`: exit `1` (raw logs in the integration Actions artifact).
- `test/volatile-cargo-expansion.test.mjs`: exit `0` (raw logs in the integration Actions artifact).
- `test/pq195-06-wreck-recovery.test.mjs`: exit `0` (raw logs in the integration Actions artifact).
- `test/route-follower.test.mjs`: exit `0` (raw logs in the integration Actions artifact).
- `test/verb-28-route-brake-feedback.test.mjs`: exit `0` (raw logs in the integration Actions artifact).

## Acceptance limits

No balance values, golden snapshots, test thresholds, package versions, or asset readiness gates were weakened. Existing beacon/route fixtures were changed only to emit the real hostility/damage contract. Expanded failures, if present, remain visible; a focused-green outcome is not a full-game acceptance claim.
