# SC-07 — Combinatorial Combat

**Implementation commission, not a shipped-feature claim.**

## Player outcome

The player learns a small vocabulary of reliable powers and combines it into ridiculous but intelligible physical results.

**Decision:** Spend energy on control or escape, commit a deployable position or remain mobile, preserve useful mass or destroy it.

## Existing ownership and dependencies

Existing parents: PQ-137, PQ-146, Arsenal experience / combat convergence.

Capability dependencies: SC-02, SC-06.

Known overlap to recheck: #605. PR status is not frozen by this document.

**Write boundary:** Continue/reconcile the existing Controlled Chaos owner after its relevant hunks land; never independently recreate pylons, collection or target authority.

Start at: `src/systems/gyreSnare.js`, `src/systems/fields.js`, `src/systems/emergentPrimitives.js`, `src/combat/attackLineage.js`.

## Implementation sequence

1. Inspect PR605 and current master per feature: planned, implemented, integrated and player-accepted are different states.
2. Choose one composition and trace every step from ordinary input through acquisition, force, hit, consequence and presentation. Repair handoff mismatches before adding variants.
3. Specify mass/geometry/energy constraints through existing capabilities. Avoid arbitrary invulnerabilities; large objects should demand a different intervention rather than silently ignore input.
4. Bound descendants, cascades and reactive VFX using existing attack lineage and presentation budgets. Preserve attribution through a thrown enemy and secondary collision.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Add a denied-placement preview using the actual pylon owner’s geometry/cost query.
2. Connect a real aggregate-release result to mass/material-scaled feedback.
3. Add actor-generation and relation-change regressions for one propagated attack.

## Adversarial cases

- Friendly/neutral interception, actor dies or changes allegiance mid-chain, repeated input.
- Leave/Continue while a field/deployable owns resources; no duplicated charge or orphaned effect.
- Dense collateral must not hide incoming threats or create unbounded descendant work.

## Acceptance and evidence

Three compositions work through real owner paths: collect-and-release mass, a linked shielding corridor, and displaced enemies entering useful machinery. Each has a cost, tell, vulnerability and recovery behavior.

Owned combo tests and actual public input route after combat integration. Compare objective progress and resource expenditure, not damage alone.

**Do not:** No extra power list, second weapon kernel or cosmetic black hole whose impressive picture has no useful physical result.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-07`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
