# SFQ-B019 — Recover gracefully from contact

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P02 — The hand: nimble control without stealing momentum](../programs/02-flight.md). Native owner search: PQ-137 / PQ-164 / PQ-189; FUN_CONVERGENCE_LOOP.

## Player outcome

Scrapes remain steerable, hard earned impacts remain dramatic.

## Current-reality check

The G-mode relative stick is already implemented, with bounded displacement and camera-basis projection. Cruise already filters chip hits. The current Feel Contract contains later speed-normalized B2/B3 amendments: old absolute-radius numbers must not be reinstated.

Source context: [S01](../audit/SOURCES.md#s01), [S07](../audit/SOURCES.md#s07), [S08](../audit/SOURCES.md#s08), [S09](../audit/SOURCES.md#s09), [S10](../audit/SOURCES.md#s10), [S11](../audit/SOURCES.md#s11). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B001](SFQ-B001.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `src/systems/dynamicFlightStick.js`, `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/cruise.js`, `src/render/camera.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Reproduce player-knock frequency and NPC impact recovery through impulseKernel/tumble ownership; tune collision classes rather than granting universal immunity.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M18](../missions/M18.md), [M19](../missions/M19.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

B13 and current collision bars pass; minor contact never loops helm loss and major NPC slams still make physical outcomes.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

Do not strip every contact impulse or make all ships immune to terrain.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
