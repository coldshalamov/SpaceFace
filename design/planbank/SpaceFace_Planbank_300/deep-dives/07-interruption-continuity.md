# Resolved specification — interruptions preserve one coherent consequence

Companions: [SF-271 — Latest valid route wins an interleaved load](../plans/19-continuity/SF-271-latest-valid-route-wins-an-interleaved-load.md), [SF-273 — An interrupted cargo handoff conserves the same lot](../plans/19-continuity/SF-273-an-interrupted-cargo-handoff-conserves-the-same-lot.md) and [SF-278 — Once-only rewards survive repeated resume](../plans/19-continuity/SF-278-once-only-rewards-survive-repeated-resume.md).

## Start from existing protections

Read [saveSystem](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/saveSystem.js), [migrations](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/migrations.js), [runTransitionGuard](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/runTransitionGuard.js), [timeEffects](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/timeEffects.js) and the selected economic/custody owner. Candidate validation, latest-route ownership and bounded imports already exist. This specification strengthens a selected boundary; it does not replace the save architecture.

## Durable versus transient

Persist consequences that cannot be reconstructed without changing the player's history: owned goods, committed quantities, settled reward identity, site modifications and canonical mission progress. Reconstruct derived fit values, current UI projections and live entity instances through their owners. Keep render handles, pending DOM references, held input, old one-shot effects and named time-effect requests transient unless current policy explicitly requires otherwise.

A numeric entity ID alone is not durable identity. Use current stable world records and validated transient generation/identity. A restored reference must not target an unrelated body that reused the number.

## Selected transaction semantics

For one cargo transfer or reward, identify the existing stable transaction/receipt. Before commit, the source still owns the uncommitted quantity/value. After commit, the destination/settlement owner owns it and retries must return or recognize that existing result. The UI's success message does not create the commit. A save boundary cannot make both sender and receiver own the same units, and an exception cannot erase both.

Do not introduce a global two-phase-commit framework. Use the actual current owner boundary and minimal durable marker needed to make its existing operation idempotent. If the source architecture has multiple synchronous writes in one owner, protect that operation there rather than inventing distributed transactions between every game system.

## Route ownership semantics

A validated current route may commit through the issued branded guard. An older completion cannot replace it. An older failure cannot publish an error over a newer success. Clear only the losing route's transient state and release resources no winner uses. Preserve the previous valid game until candidate validation permits destructive restore under current policy.

Pause belongs to current named request owners, not a raw saved timeScale. After restore, rebuild pause state from the actual screen/route and ensure a dismissed old modal cannot retain a hold. Reset stale held input without changing bindings or firing a synthetic press.

## Interruption matrix

Test before validation, after validation but before route commit, before resource settlement, immediately after settlement, after target removal and after a newer route replaces the old one. Repeat resume twice for each durable boundary. Deliver the same completion callback twice. Use an old valid save, malformed data, unavailable storage and reused entity IDs. Keep all tests in isolated slots/storage; never mutate real player saves.

For each case, reconcile credits, personal cargo, operation cargo, surviving pods, settled receipts, current route identity, pause owners and controllability. Assert what remains playable after the interruption, not only that no exception was thrown.

## Completion

The selected feature is implemented when its production boundary and direct adversarial tests agree. It is accepted only after its normal interrupted route resumes into truthful usable play. Unsupported Browser/Electron cross-shell execution or missing media stays explicitly unproven. Do not 'fix' a difficult case by wiping the campaign, dropping unresolved cargo, granting a replacement reward or loosening import safety.
