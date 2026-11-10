# SFQ-B041 — Give each encounter an ingress and exit

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P05 — Readable adversaries and a living encounter director](../programs/05-ai.md). Native owner search: PQ-140 / PQ-174 / PQ-175 / PQ-206.

## Player outcome

Threats arrive from somewhere and leave for a reason rather than appearing in the pilot's lap.

## Current-reality check

The selected AI is SG-06 tactical, not legacy ai.js. The package does not claim current opponents were playtested; behavior weaknesses below are focused questions resolved on ordinary routes.

Source context: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S12](../audit/SOURCES.md#s12). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B011](SFQ-B011.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `src/systems/tacticalAI.js`, `src/ai/stack.js`, `src/ai/perception.js`, `src/ai/squad.js`, `src/ai/maneuver.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js`, `src/systems/encounterDirector.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Reuse current director pressure, entry lanes, off-camera placement and final engagement checks; author one clear arrival for each selected threat role.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M01](../missions/M01.md), [M14](../missions/M14.md), [M19](../missions/M19.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

No untelegraphed hostile appears in immediate firing range; fleeing and timed-out actors become sensible world traffic.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

Do not disguise spawning inside a bright effect or despawn everyone at mission completion.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
