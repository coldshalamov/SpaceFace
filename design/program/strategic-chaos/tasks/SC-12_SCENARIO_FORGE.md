# SC-12 — Scenario Forge and Agent Workflow

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Agents can extend one validated situation, inspect what really happened and produce a reviewable implementation without rebuilding the engine or inventing evidence.

**Decision:** This is an authoring workflow, not a player menu: it should shorten the path from a gameplay hypothesis to a tested real implementation.

## Existing ownership and dependencies

Existing parents: existing deterministic gameplay lab, INFERENCE_LANES.md, build_map.md §1.8.

Capability dependencies: existing live owners; no other SC packet required to start.

Known overlap to recheck: fresh open-PR census. PR status is not frozen by this document.

**Write boundary:** Existing generic simScenario lab, scenario data and narrow authoring utilities. Narrative scenarioSchemas remains Campaign 47-A-specific.

Start at: `src/contracts/simScenarioSchema.js`, `src/testing/lab/proofSixtySeconds.js`, `scripts/agent-loop.mjs`, `scripts/sf-lab.mjs`.

## Implementation sequence

1. Start from this delivered brief generator, B12 adapter and diagnostic trial comparator. They are working foundation tools, not completed missions or new acceptance authorities.
2. Use spaceface.simScenario.v1 for generic simulation fixtures. Do not remove 47-A required beats from spaceface.scenarioContract.v1 to pretend it is the generic schema.
3. For one missing capability, extend the existing registered policy/metric/fixture seam and give it an adversarial test. Do not accept arbitrary JavaScript strings or caller-injected successful results.
4. Use SC-11’s first accepted operation as a reusable example. Author the remaining variations only after the producer/consumer path is demonstrated; document what is data-driven and what still needs code.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Turn one manual reproduction into a raw-input tape using current accepted fields.
2. Add a metric that reads an existing authoritative outcome without writing to it.
3. Shrink one agent context packet to the actual owner files, current source SHA and observed failure.

## Adversarial cases

- Unknown input keys, disabled systems, fabricated event counts, incomplete trace and mismatched source trees.
- Save/load equivalence cannot be claimed from two unrelated runs.
- A fixture may not be promoted to public-route evidence; imported JSON is diagnostic only.

## Acceptance and evidence

The same existing lab can exercise three operation variations with stable identities, raw-input control, explicit setup exceptions and real-owner assertions. Existing certification boundaries remain intact.

Run the new dependency-free tests and matching existing lab schema/false-positive guards. Use native lab commands for production checks. No new paid agent sessions are launched by these utilities.

**Do not:** Do not create a second queue, simulator, authoring language or self-certifying report framework.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-12`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
