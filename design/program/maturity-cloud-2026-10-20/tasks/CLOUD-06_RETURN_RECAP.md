<!-- LIFETIME: DURABLE -->
# CLOUD-06 · Where you left off

**Existing parent:** 451. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

The Chronicler already builds public fact-backed story views and a weekly digest. Add a small
“Where you left off” section to the existing mission log: current goal plus up to three distinct
recent public facts. It is a read model, not a claim that the world advanced while the app was closed.

**Verified entry points / owner trace:** `src/systems/chronicler.js; src/chronicler/narrative.js; src/ui/screens/missionLog.js; read-only current mission/navigation view`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Edit the existing mission-log composition and one pure recap projector if required, plus tests.
Read existing story views/current mission data. Do not change persistence, boot, world catch-up,
Chronicler ingestion, score or navigation restoration. No new journal screen or auto-opening modal.

## Implementation sequence

1. Trace public story-view availability and the mission log's normal entry/refresh. Reuse public
   visibility/provenance filters, never summarize raw hidden facts directly.
2. Select at most three distinct meaningful events using stable ordering; collapse multiple stages
   of the same event/story rather than reporting a kill and its aftermath as two new accomplishments.
3. Prepend the current objective from its authoritative read model. If a destination is no longer
   actionable, say so; only offer existing supported navigation actions for still-known targets.
4. Label the section “Where you left off”, not “While you were away”. Cite surviving source identity
   internally; if evidence was pruned, omit or explicitly mark the historical summary as limited.
5. Compute on requested screen entry/owner revision, not every frame. Reopening the log never
   consumes a digest, generates events, advances time or pays a reward.

## Regression and interruption cases

No history; only private stories; duplicate lineage; conflicting timestamps; pruned source;
completed/abandoned/current mission; lost target; old save; normal Continue; a new game after another
run; repeated screen open. Verify no changes to Chronicler memory, clock, reward or objective.

## Done when

After Continue, opening the existing log explains the current goal and real recorded events without
replaying them as new. The same projection is deterministic and silent. The existing weekly dockside
digest still works independently. One UI/Continue route supplements the pure projection tests.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-06 as a read-only “Where you left off” section in the current mission log, using
> public Chronicler views plus current objective. Keep it to three deduplicated events; do not invent
> offline progress, alter saves, consume the weekly digest or open a new modal. Deliver production
> wiring, lifecycle/visibility tests and a draft PR.
