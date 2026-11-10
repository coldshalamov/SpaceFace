# Resolved specification — restore the real Ceres work chain

Companion to [SF-076 — Restore the real Ceres miner-to-hauler cycle](../plans/06-jobs/SF-076-restore-the-real-ceres-miner-to-hauler-cycle.md). Root cause remains to be reproduced and localized; this specification resolves the diagnosis and repair boundaries, not an invented cause.

## Starting evidence

D89 reports no loaded authored hauler reaching the approach within the scenario window, and explicitly excludes ambientPredation eligibility for the designated slot. Start in [traffic](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/traffic.js#L7691-L7965), [NPC jobs](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobs.js), [job runtime](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/npcJobsRuntime.js) and [custody](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js). Read the actual [evidence-ledger test](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-138-05-evidence-ledger.test.mjs) before executing its long scenario.

## The chain that must exist

A miner performs real work and produces a real lot. A valid handoff request reserves a compatible receiver. The actors rendezvous under legitimate job control. The existing transfer mechanism moves quantity into the hauler's operation custody. The loaded hauler resumes the approach route. The refinery receives and consumes/sells according to its current law. Downstream loss/evidence tests can then observe a real loaded ship.

A 'loaded' flag without commodity quantity is not success. Neither is cargo inserted by the test or a special loaded spawn that bypasses mining.

## Minimal diagnostic record

Use existing handoff/job tracing or a bounded development-only ring for this selected chain. At each transition, record simulation time, stable handoff ID, actor slot plus current entity identity, job claim holder, phase, produced quantity, sender/receiver/pod quantity, current route target and refusal reason. Record the **first** reason a transition cannot proceed; avoid per-frame dumps of the entire state.

Compare the earliest missing stage, not only the final timeout. Distinguish no production, unreachable rendezvous, conflicting claim, invalid endpoint, lost transfer commit, capacity refusal, and loaded route not resumed. Do not assume the last visible actor is where the bug originated.

## Repair decision table

| First failed boundary | Bounded repair target | Forbidden shortcut |
|---|---|---|
| Miner never produces | Existing mining/job/tool eligibility and real source | Grant a synthetic lot |
| Receiver claim cannot progress | Current control-claim lifecycle and release | A second job controller |
| Rendezvous never stabilizes | Existing steering/relative-speed/transfer eligibility | Teleport actors together |
| Transfer accepted but quantity missing | Current custody operation/receipt | Set an unrelated loaded boolean |
| Load exists but route remains claimed | Existing completion/release of handoff control | Despawn and replace the hauler |
| Endpoint disappears | Current interruption and recoverable custody continuation | Delete the lot or replay a sale |

## Conservation and exactly-once behavior

For the selected source lot, compare cumulative real production with live quantities at every owner plus explicitly consumed, sold or destroyed quantities. Transfers change location, not total value by themselves. Use the current lot/shipment/receipt identity where present; do not introduce a universal tracking service solely for this repair. Retry and restore must not repeat an accepted transfer or settlement.

A sender with insufficient quantity must not overdraw. A receiver whose capacity changes may refuse or accept only under the current explicit partial-transfer law; the remaining load stays somewhere real. Destroying a transfer endpoint must preserve whichever quantities have already committed and handle the uncommitted remainder through existing interruption semantics.

## Verification sequence

Reproduce at current HEAD, then add a short focused case around the first broken boundary. Check ordinary completion, claim cancellation, endpoint loss, partial load, receiver-full, and repeated delivery callback. Run the original longer scenario only after the short cause-focused case is meaningful. Assert that the authored hauler itself reaches the approach with actual cargo, not that some other hauler satisfies a broad predicate.

The source-only planning session did not run that long scenario. An implementer who cannot reproduce should report current evidence and avoid patching the previously excluded piracy path. When fixed, remove unnecessary diagnostic scaffolding and keep only the smallest regression support. The production result is a functioning workday, not a new telemetry file.
