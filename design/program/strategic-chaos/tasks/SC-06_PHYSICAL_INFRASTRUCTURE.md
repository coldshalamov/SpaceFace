# SC-06 — Physical Infrastructure

**Implementation commission, not a shipped-feature claim.**

## Player outcome

A working industrial place becomes cover, leverage, hazard and objective; changing a physical component changes what the place can do.

**Decision:** Protect throughput, disable the sensor/control advantage, use moving machinery against attackers, or contain a failure while sacrificing output.

## Existing ownership and dependencies

Existing parents: PQ-143, existing environmentalMachinery / worldSite seam.

Capability dependencies: existing live owners; no other SC packet required to start.

Known overlap to recheck: #583, #590. PR status is not frozen by this document.

**Write boundary:** One existing industrial site, its authored data and narrow operation hooks. Physics writes remain behind physicsAuthority.

Start at: `src/systems/environmentalMachinery.js`, `src/systems/worldSiteKernel.js`, `src/systems/workingBattlefieldRuntime.js`, `src/combat/physicalEffects.js`.

## Implementation sequence

1. Choose an existing Ceres/working-battlefield location and enumerate actual moving bodies, powers, finite workpieces and operation owners.
2. Implement an explicit component dependency using existing site state: disabling the chosen component changes a supported operation, not just color or a notification.
3. Author geometry with useful cover and approach routes at the normal camera. Provide a readable anticipation state and a recoverable aftermath.
4. Route heat, impulses, damage and cargo through canonical owners; define bounded propagation so chain reactions cannot recursively spawn unlimited work.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Wire one existing damage state to actual machine throughput or availability.
2. Repair a collision proxy or approach clearance for the chosen interaction.
3. Add a destruction/recovery/Continue test for one component and finite workpiece.

## Adversarial cases

- Workpiece is removed early, source dies mid-action, control transfers, intervention is repeated.
- Debris interacts with actors outside the authored encounter; general rules still apply.
- No permanent dead-end or unlimited manufactured salvage when the facility resets.

## Acceptance and evidence

At one site, a handling mechanism, a sensing/control component and a bounded hazardous component produce distinct causal interventions. Sabotage, defense and rescue are possible without scripted imitation.

Real physics/site-owner tests, unchanged owner accounting and a deterministic intervention scenario. Visual/performance acceptance uses existing supported routes and budget contracts.

**Do not:** Do not invent another destruction engine, turn all scenery into lethal explosives, or use animation-only machinery to fake consequences.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-06`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
