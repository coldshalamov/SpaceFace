# SFQ-B074 — Build the physical heist trilogy

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P08 — Mission craft and authored world-site interactions](../programs/08-missions.md). Native owner search: PQ-152 / PQ-171 / current world-site kernel; mission briefs M01–M36.

## Player outcome

Theft is a problem of trajectories, custody and escape.

## Current-reality check

The mission catalog already includes tow_recovery, demolition, rescue_under_fire, authored_set_piece, capital_boss and breakaway_recovery. The human opening raid and Third Shift must be extended or polished, not duplicated.

Source context: [S14](../audit/SOURCES.md#s14), [S16](../audit/SOURCES.md#s16), [S17](../audit/SOURCES.md#s17). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B061](SFQ-B061.md), [SFQ-B071](SFQ-B071.md), [SFQ-B072](SFQ-B072.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `src/data/missions.js`, `src/systems/missions.js`, `src/data/worldSiteManifests.js`, `src/systems/worldSiteKernel.js`, `src/systems/worldSiteRuntime.js`, `src/data/encounters/015-opening-hauler-raid.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Implement selected M06, M07 and M08 variants through current heist/smuggling/set-piece owners with distinct target motion and lawful witnesses.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M06](../missions/M06.md), [M07](../missions/M07.md), [M08](../missions/M08.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

The player can go quiet, fast or destructive; detection and lost cargo have observable consequences.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

No instant invisible theft interaction or scripted chase immunity.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
