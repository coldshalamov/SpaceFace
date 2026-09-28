# SF-106 — Make competent hauling viable through real terms

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** conditional repair  
**Basis:** repository-reported issue D80; not reproduced here  
**Domain / current routing:** THE LONG GAME · PQ-177, PQ-151; CV-DAY · [WF-06](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md) / [WF-07](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)  
**Review allocation:** strong seam/cause adjudication first when unresolved; bounded implementation; stronger batch review

[Domain workflow](../../domains/08-economy.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Reproduce D80, then choose a coherent toll/spread/contract policy that lets a competent starter hauler earn a useful return without changing benchmark thresholds merely to pass.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Lowering the acceptance band hides the problem; adding free sale bonuses fabricates a career.

## Before changing code

**Repair gate:** reproduce the stated failure at current HEAD first. A historical ledger row is not a fresh reproduction. If the failure is absent and the intended outcome already holds, report `already satisfied` in the existing task workflow and take the next admitted task; do not invent a replacement bug.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/systems/economy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js) | [`economy`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js#L840), [`quote`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js#L3190) |
| [`src/systems/economyContracts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economyContracts.js) | [`economyContracts`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economyContracts.js#L155) |
| [`src/systems/cargoCustody.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/cargoCustody.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/balance/careerCohorts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/balance/careerCohorts.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/contractClauses.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/contractClauses.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/economy/economyModel.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/economy/economyModel.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/ui/market/tradeLogic.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/market/tradeLogic.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

Read the resolved implementation specification: [deep dive](../../deep-dives/03-hauling-economy.md).

## Implementation sequence

1. **Locate the live seam.** Trace executable quantity, quote, spread, fee and receipt paths. State the source/custody/sink transaction the packet changes.
2. **Implement the chosen mechanism.** Recalculate actual executable buy/sell quantities and route costs through economy.quote, preserving the repaired cohort model. Compare three candidate interventions—route costs, replenishment cadence, compatible contract income—on live routes, then implement the smallest supported policy. Document why the rejected economic lever would create arbitrage or erase risk.
3. **Keep the player-facing chain complete.** Expose only information the pilot can legitimately know: quote age, risk reason, cargo commitment and net cost. Reuse the current market/contract surface.
4. **Cover lifecycle and counterexamples.** Test partial fills, stale quotes, duplicate receipts, full holds, interrupted travel and save/resume. Reconcile every item and credit movement.
5. **Converge on the played result.** Run several trips, including a bad one. A tradeoff should remain after the route is learned; remove grind or arbitrary taxes only when their causal role is unsupported.

## Ownership and non-goals

economy is the only credits writer, cargo the player-hold writer, and custody the operation shipment boundary. Prices must come from executable quotes; no simulation-only reward multiplier or retuned acceptance threshold.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Run several repeated trips at 30/60/90-minute horizons and a real-route sample. Report gross, costs, idle time and lost cargo separately; the gain must survive stock depletion and cannot come from a simulator-only multiplier.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Use the actual market to buy a feasible load, fly its route, pay real costs, sell the surviving load, and compare the second trip after market/world response.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/economy-professional-anti-exploit.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/economy-professional-anti-exploit.test.mjs)
- [`test/economy-honesty.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/economy-honesty.test.mjs)
- [`test/economy-market-uplink.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/economy-market-uplink.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/economy-professional-anti-exploit.test.mjs test/economy-honesty.test.mjs test/economy-market-uplink.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
