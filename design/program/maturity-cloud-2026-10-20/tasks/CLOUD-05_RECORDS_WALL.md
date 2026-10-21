<!-- LIFETIME: DURABLE -->
# CLOUD-05 · Records that tell the truth

**Existing parent:** 471. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

The statistics screen already uses ORRERY and a pure grouped model. Numeric normalization currently
turns missing/invalid inputs into zero. Improve the existing surface with trustworthy availability
semantics and up to three meaningful highlights from counters that really exist.

**Verified entry points / owner trace:** `src/core/statistics.js; src/ui/screens/statistics.js; read-only src/systems/achievements.js`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Edit the statistics model/screen plus focused tests. Do not add counter writers, storage, rewards,
achievements or another Records screen. Existing layout primitives are reused; no global CSS rewrite.
Treat career and current-save scope separately.

## Implementation sequence

1. Trace careerStats and player.stats defaults to distinguish a supported true zero from an absent
   historical field or unsupported metric. Preserve real zero values; do not hide all empty history.
2. Mark unavailable values honestly without fabricating them from unrelated counters. Define finite,
   deterministic formatting for negative valid trade outcomes and corrupt numeric inputs.
3. Add up to three highlights drawn from existing records, such as biggest throw, observed contract
   completions and an actual recorded trade result. A highlight names its scope and provenance.
4. Rank highlights deterministically and give an empty-state action that is actually reachable,
   such as returning to play. Do not invent a target or install a default ship to make stats nonzero.
5. Refresh on screen entry as the existing paused-modal contract specifies; no polling loop.

## Regression and interruption cases

Brand-new supported zero; old save with missing fields; invalid/NaN/Infinity; actual negative profit;
nonzero career with empty current save; deterministic tie; no highlight; unknown catalog name;
Continue; keyboard/back; long labels and narrow viewport. Assert no source counter mutation.

## Done when

The existing Statistics screen displays real activity and never confuses missing history with a
measured zero. At least one actual completed activity updates a corresponding record through its
existing writer. Screen rendering and Back work at existing supported layouts; no new store exists.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-05 in the existing statistics model and screen: distinguish unavailable history
> from measured zero and display up to three source-backed highlights. Keep career/current-save
> scopes explicit and all counters read-only. Verify real activity flow, empty/invalid cases and screen
> controls. Publish a draft PR, not a new records subsystem.
