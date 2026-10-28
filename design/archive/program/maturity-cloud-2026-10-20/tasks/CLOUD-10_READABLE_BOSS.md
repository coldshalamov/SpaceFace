<!-- LIFETIME: DURABLE -->
# CLOUD-10 · Understand the threat before the hit

**Existing parent:** 463. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

Capital bosses already run a score with explicit telegraph/detach/rebind facts. Make one reachable
Adventure boss communicate its current move, supported counter and recovery window through that
existing presentation path. No new attacks, HP tuning, detachable plates or second boss clock.

**Verified entry points / owner trace:** `src/presentation/capitalBossPresentation.js; src/ui/capitalBossOverlayMount.js; read-only capitalBossEncounters/capitalBossScore and encounter catalog`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Own the existing overlay/presentation adapter's exact move/counter hunk plus one small data-copy
entry if genuinely needed and focused tests. Simulation score, damage, AI, mission rewards and
Swarm lifecycle remain read-only. Respect src/presentation/AGENTS.md: pure cue code must not import
systems or render owners.

## Implementation sequence

1. Pick one catalog boss that is reachable by its existing ordinary offer. Trace current score
   fields and telegraph events into the overlay; verify which counter text already exists.
2. Display one compact move/counter phrase only while that move is genuinely active. Derive geometry,
   timing and recovery from the existing score clock, never wall-clock guesses or global sim drift.
3. Keep warning shape and text redundant; reduced motion/flash must retain the useful signal. Do not
   change the attack to match a misleading phrase; correct the phrase to the real counter.
4. Clear the old cue on telegraph end, death, detach, target replacement, mode change and failed
   restoration. A rebound fight adopts its new valid warning rather than replaying stale geometry.
5. Route any voice through the current arbiter and preserve primary combat visibility. A move card
   is not permission for a new permanent panel or a duplicate boss bar.

## Regression and interruption cases

Intro/cast/recovery; paused score; interrupted cast; two fights with different clocks; unknown beat;
rebind; target/boss death; leaving range; return; reduced motion; Continue; repeated init/destroy.
Assert no score, damage, reward or actor mutation and bounded active overlay entries.

## Done when

During one ordinary reachable boss fight, a player can identify what is coming, a real response,
and the recovery opportunity. Automated timing/lifecycle tests prove correspondence to score;
shipping-camera observation proves legibility. Do not close all eight bosses or row448 from this.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-10 for one reachable Adventure capital boss using the existing score-driven
> overlay. Surface a truthful move/counter/recovery cue, preserve accessibility and clear stale cues
> on lifecycle transitions. No combat, HP, reward or new clock changes. Prove production-score timing
> and list any unperformed visual acceptance; publish one draft PR.
