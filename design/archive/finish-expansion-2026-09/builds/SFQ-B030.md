# SFQ-B030 — Compose a three-verb physical scene

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P03 — Massline, contact, and terrain as the signature toy](../programs/03-massline.md). Native owner search: PQ-026–031 / PQ-137 / PQ-146 / PQ-154.

## Player outcome

Players combine rope, field and ordnance with ordinary terrain in a repeatable combat situation.

## Current-reality check

The constraint and physics-authority seams are established. The latest master commit specifically protects kinematic opt-outs; physical affordances must agree with body eligibility.

Source context: [S01](../audit/SOURCES.md#s01), [S07](../audit/SOURCES.md#s07), [S08](../audit/SOURCES.md#s08), [S12](../audit/SOURCES.md#s12). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B011](SFQ-B011.md), [SFQ-B023](SFQ-B023.md), [SFQ-B026](SFQ-B026.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `src/core/constraints/masslineController.js`, `src/combat/attachments.js`, `src/systems/tetherGameplay.js`, `src/core/physicsAuthority.js`, `src/systems/masslineImpacts.js`, `src/systems/terrainAnchors.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Stage a shared test-and-content pocket using current throw, Well/Repulsor and concussion paths; fix the first interaction discontinuity rather than adding a new toy.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M02](../missions/M02.md), [M04](../missions/M04.md), [M05](../missions/M05.md), [M16](../missions/M16.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

A legitimate two-step combination changes the fight, replay/save behavior remains coherent, and a miss can create salvage or collateral.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

Do not reward a combo label without actual motion/damage receipts.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
