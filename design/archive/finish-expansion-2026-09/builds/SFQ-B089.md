# SFQ-B089 — Stress economy exploits

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P09 — An economy the pilot can understand and physically influence](../programs/09-economy.md). Native owner search: PQ-177 / current economyMissionTerms and custody owners.

## Player outcome

Transfers, refunds, partial deliveries and save interruption remain conservative.

## Current-reality check

The repo already owns supply/demand, mission quotes, cargo, markets and physical trade consequences. This is a coherence and usability expansion, not a replacement economy. All balance values require current route measurement.

Source context: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S15](../audit/SOURCES.md#s15), [S16](../audit/SOURCES.md#s16). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B001](SFQ-B001.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `src/systems/economy.js`, `src/systems/cargo.js`, `src/systems/missions.js`, `src/data/commodities.js`, `src/ui/market/tradeLogic.js`, `src/ui/screens/market.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Test buy/sell spread, split stacks, cancelled collateral, mission resumption and physical collection accounting on current owners.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M03](../missions/M03.md), [M13](../missions/M13.md), [M15](../missions/M15.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

No reproducible positive-credit or item loop exists in the admitted routes without new value creation.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

Do not redesign all pricing in response to one transaction bug.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
