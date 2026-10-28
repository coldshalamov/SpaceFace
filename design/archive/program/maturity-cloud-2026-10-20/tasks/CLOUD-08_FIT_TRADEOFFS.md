<!-- LIFETIME: DURABLE -->
# CLOUD-08 · Buy a possibility, understand the sacrifice

**Existing parent:** 469; existing PQ-142 capability work. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

The physical capability calculator already exists. Improve one existing fit comparison so a player
can understand a changed tow/handling/field possibility and a real tradeoff under the same cargo and
damage conditions. This is not a new stat engine or an excuse to change hull balance.

**Verified entry points / owner trace:** `src/systems/shipCapabilities.js; current Shipworks fit preview consumer; read-only ships derived-stat authority`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Trace and name the current Shipworks preview file before mutation; own that consumer, at most one
pure comparison formatter and tests. ships.js/flight/attachments remain read-only. Reuse existing
preview and capability APIs; no invented thrust, stopping, mass or field equations.

## Implementation sequence

1. Trace one legal module swap from highlighted candidate through canonical preview to confirmed fit.
   Record which current capability and propulsion fields the UI actually receives.
2. Compute before/after from the same operating conditions through the existing preview owner.
   Distinguish governed ceilings from mass-sensitive acceleration and response.
3. Show at most three meaningful differences: newly enabled action, relevant cost/limitation, and
   unchanged/unknown when appropriate. Prefer concrete authored hull/tool names to internal IDs.
4. Retain the existing detailed stats as requested detail. Do not claim safety guarantees, unlimited
   tow capability or routine rope failure from a generic rule that the current simulation rejects.
5. On confirmation, compare the installed authoritative block to the preview. Cancel, denied fit,
   changed cargo and rapid hover changes cannot install or charge anything through the presenter.

## Regression and interruption cases

No change; legal upgrade; tradeoff rather than strict upgrade; loaded/damaged ship; missing derived
fields; denied slot/tech/cost; stale preview; repeated confirm; cancel; rapid hover; Continue.
Use the existing capability-verbs scenario where applicable to check predictions against live laws.

## Done when

The current fit screen explains a real physical outcome and any relevant sacrifice, and the
installed fit produces the same derived result. No parallel formulas or writer appear. A normal
buy/fit/use route and focused preview/identity tests accompany the draft.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-08 in the existing Shipworks comparison, not in a new calculator. Trace its real
> preview API, compare capabilities under equal cargo/damage conditions, and explain concrete gains
> and sacrifices with honest unknowns. Preserve the ships single writer. Verify cancel/stale/denied
> paths and preview-to-installed parity; publish a draft PR.
