# SC-11 — Multi-Party Operations

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Three replayable operations behave like situations with competing goals, not corridors with a single required trick.

**Decision:** Which party or objective to favor, how much risk to accept, and when to leave rather than destroy everything.

## Existing ownership and dependencies

Existing parents: existing mission-craft / encounter seam, PQ-141, build_map.md §1.8.

Capability dependencies: SC-03, SC-04, SC-05, SC-06, SC-07, SC-08, SC-09, SC-10.

Known overlap to recheck: #583, #590, #599. PR status is not frozen by this document.

**Write boundary:** One operation at a time under existing mission/encounter owners. New authored data modules are preferable to broad monolith edits.

Start at: `src/systems/missionBoardOps.js`, `src/systems/missionObjectiveOps.js`, `src/systems/encounterScripts.js`, `src/systems/workingBattlefieldRuntime.js`.

## Implementation sequence

1. Use OPERATIONS.md as the situation specification; reconcile each actor/place with current canon and existing content.
2. Build one complete operation first. Bind independent actors to actual goals and resources; a neutral rival is not secretly another enemy wave.
3. Evaluate objectives from authoritative world outcomes. A menu selection expresses intent; it does not award a completed physical action.
4. After one operation survives lifecycle and ordinary-route review, author the next through the same owner interfaces, retaining differences in geography, incentives and timing.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Author one actor’s legible goal/tell and its noncombat outcome.
2. Add a partial-success settlement to one existing mission family.
3. Cover a player who leaves halfway, returns later or resolves the situation in an unexpected order.

## Adversarial cases

- Player uses an unplanned physical solution, refuses the offer or kills an essential actor.
- Target is captured rather than destroyed; cargo is recovered by a third party.
- Abandon/Continue/return must preserve the true aftermath and not respawn consumed value.

## Acceptance and evidence

Convoy interception, contested salvage and an industrial defense each support three materially different strategies, an honest exit, partial success and physical aftermath.

Existing lab and mission-owner tests; actual public offer → intervention → settlement → return route. Use strategy comparisons only as diagnostic support, never to manufacture a fun score.

**Do not:** Do not create a universal quest generator, another scripting VM or three reskins of kill-all-hostiles.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-11`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
