# SF-107 — Net profit that uses the load the player can actually buy

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE LONG GAME · PQ-177, PQ-151; CV-DAY · [WF-06](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md) / [WF-07](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/08-economy.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Ensure route advice and trade confirmation compare sale proceeds against the exact feasible purchase quantity, including stock, hold room and credits.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Full-hold theoretical profit misleads; duplicating pricing formulas creates future divergence.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/economy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js) | [`quote`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js#L3190), [`economy`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js#L840) |
| [`src/systems/cargoCustody.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/balance/careerCohorts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/balance/careerCohorts.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Trace executable quantity, quote, spread, fee and receipt paths. State the source/custody/sink transaction the packet changes.
2. **Implement the chosen mechanism.** Reuse canonical quote/quantity helpers and the existing trade-intelligence surface. Compute a single executable candidate quantity, use it for both legs and attach quote age/assumptions. Avoid mixing full-lot sale revenue with stock-clamped purchase cost, the same class of error previously fixed in the cohort model.
3. **Keep the player-facing chain complete.** Expose only information the pilot can legitimately know: quote age, risk reason, cargo commitment and net cost. Reuse the current market/contract surface.
4. **Cover lifecycle and counterexamples.** Test partial fills, stale quotes, duplicate receipts, full holds, interrupted travel and save/resume. Reconcile every item and credit movement.
5. **Converge on the played result.** Run several trips, including a bad one. A tradeoff should remain after the route is learned; remove grind or arbitrary taxes only when their causal role is unsupported.

## Ownership and non-goals

economy is the only credits writer, cargo the player-hold writer, and custody the operation shipment boundary. Prices must come from executable quotes; no simulation-only reward multiplier or retuned acceptance threshold.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Compare a stocked route, a nearly empty seller and a poor pilot with a partly full hold. Recommended profit must reconcile with actual accepted trades and visibly change when the executable quantity changes.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Use the actual market to buy a feasible load, fly its route, pay real costs, sell the surviving load, and compare the second trip after market/world response.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/pq-177-06-cargo-custody.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-177-06-cargo-custody.test.mjs)
- [`test/m3-hunter-balance.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/m3-hunter-balance.test.mjs)
- [`test/automation-operational-limits.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/automation-operational-limits.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/pq-177-06-cargo-custody.test.mjs test/m3-hunter-balance.test.mjs test/automation-operational-limits.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
