# SC-04 — Adversarial Tactics

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Enemies execute recognizable plans with exploitable commitments instead of orbiting as interchangeable damage sources.

**Decision:** Attack the screen, interrupt the disabling specialist, threaten the cargo runner or exploit the retreat window.

## Existing ownership and dependencies

Existing parents: PQ-140, existing sg06-tactical / squad seam.

Capability dependencies: SC-02, SC-03.

Known overlap to recheck: #605. PR status is not frozen by this document.

**Write boundary:** One existing squad doctrine and its perception/action adapter; exact paths coordinated with combat convergence.

Start at: `src/ai/squad.js`, `src/ai/squadFrame.js`, `src/ai/perception.js`, `src/systems/tacticalAI.js`.

## Implementation sequence

1. Choose one existing squad recipe and identify its actual objective and sensed information. Preserve doctrine dwell, hysteresis and engagement authorization.
2. Give roles mutually supporting jobs: one threatens the protected asset, another screens or disables, a third takes the resource. Use existing maneuver and fire ports.
3. Expose commitment and recovery windows through SC-02, not extra omniscient UI. Breaking a useful component or separating roles should disrupt the plan.
4. Use faction doctrine and authored capabilities to vary tactics; do not add a runtime LLM or deterministic-looking random omniscience.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Add a lost-contact case that uses last-known information and then expires it.
2. Give one tactic a visible windup/commit/recovery cue.
3. Repair one target-switch oscillation with existing hysteresis rather than hard immunity.

## Adversarial cases

- Sensor loss, destroyed specialist, captured ship and invalid world record.
- Repeated provocation must not retarget every tick or bypass lawful fire discipline.
- High entity counts must not introduce per-unit full-world scans.

## Acceptance and evidence

A raiding squad can commit to cargo interception, cover its withdrawal and abandon an unfavorable fight. Different player interventions change the plan through observed information, not hidden knowledge.

Fixed-seed squad tests with legal perceived inputs, authority-port observations and one production encounter. Record objective progress, commitment, escape and failure rather than just kills.

**Do not:** Do not equate intelligence with perfect aim, faster reaction, higher health or knowledge of the player’s unissued command.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-04`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
