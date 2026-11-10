# SC-01 — Causal Playground

**Implementation commission, not a shipped-feature claim.**

## Player outcome

A pilot deliberately intervenes in a working Ceres freight encounter and can understand the physical and social consequences.

**Decision:** Defend the shipment, disable and steal it, or intervene with physical tools. Choosing to leave must remain valid. No compulsory civilian harm to complete normal play.

## Existing ownership and dependencies

Existing parents: PQ-141, PQ-138, PQ-143.

Capability dependencies: existing live owners; no other SC packet required to start.

Known overlap to recheck: #605, #583, #631. PR status is not frozen by this document.

**Write boundary:** One Ceres pocket/encounter and its focused fixtures. Shared encounter, traffic and physics owners only through exact, freshly checked hunks.

Start at: `src/testing/lab/proofSixtySeconds.js`, `src/data/sectorActivityPockets.js`, `src/systems/encounterDirector.js`, `src/systems/traffic.js`.

## Implementation sequence

1. Trace New Game/arrival through the existing Ceres pocket to actual freight, raiders, workers and patrols. Reconcile B12 against current implementation instead of trusting the dated Not attempted cell.
2. Repair the first missing production link: visible work, physical interception, meaningful shove/throw, finite spill, civilian flight, witnessed dispatch, recovery and escape. Keep each repair in its owning system.
3. Author enough geometry and timing for an opportunity, not a guaranteed result. The player supplies the action; no forced collision, invulnerability, teleport, synthetic receipt or hidden reward.
4. Extend an existing player-input fixture with two purposeful strategies and one aborted/failed route. Preserve original event identities and original cargo ownership across the whole chain.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Attach stable actor-life and originating-incident references at the one missing producer/consumer seam found by the trace.
2. Repair one camera-scale threat/opportunity cue through existing presentation owners.
3. Add a negative case in which an unrelated collision cannot count as the player-created disaster.

## Adversarial cases

- The player declines or misses; the encounter still resolves honestly.
- A different pirate or a recycled entity ID is struck: it must not inherit the first actor’s causal chain.
- Leave/re-enter and Continue during cargo recovery: no duplicated lot, patrol or reward.

## Acceptance and evidence

The existing B12 owner meets its unchanged five-seed gate; a separate ordinary-route demonstration supports at least two deliberately different outcomes. Receipt coverage alone is not causality or fun.

Run node scripts/strategic-chaos.mjs proof on a complete source checkout. Diagnose a miss through the existing owner. Then run the affected Adventure player-truth route; disclose fixture setup. Do not turn B12 into a larger forced sequence just to get eleven cells.

**Do not:** Do not build a new director or widen the galaxy. One excellent intervention is the unit of delivery.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-01`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
