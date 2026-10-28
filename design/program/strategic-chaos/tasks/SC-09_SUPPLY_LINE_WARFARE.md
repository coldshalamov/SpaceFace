# SC-09 — Supply-Line Warfare

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Controlling a local physical shipment changes useful strategic options: stock, service availability or reinforcement capacity.

**Decision:** Defend the economic asset, steal it for immediate gain, disrupt a rival’s capability, or restore the route for later access.

## Existing ownership and dependencies

Existing parents: PQ-143, PQ-170, existing economic freight / conflict seam.

Capability dependencies: SC-06.

Known overlap to recheck: #583, #480. PR status is not frozen by this document.

**Write boundary:** One existing contested route and one finite commodity/service chain. No second stock or faction-ownership writer.

Start at: `src/systems/traffic.js`, `src/systems/cargoCustody.js`, `src/systems/economy.js`, `src/data/conflictZones.js`.

## Implementation sequence

1. Select a current cargo route with actual origin inventory, shipment custody and destination settlement. Inventory not physically represented must not be claimed as a moving object.
2. Choose one strategically useful dependent service. Show a known delivery window and bounded consequences; do not simulate an entire war economy first.
3. Connect physical completion/loss to the existing stock/service owner exactly once. Separate player-caused change from background drift and disclose the latter.
4. Reflect the outcome in existing market, service and faction surfaces. Allow recovery or alternate supply without making the world freeze while the pilot is absent.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Add one origin-lot/destination-settlement identity to an existing shipment receipt.
2. Explain one real shortage through the current market read model.
3. Add duplicate, partial-delivery and stolen-then-recovered accounting cases.

## Adversarial cases

- Partial spills, mixed cargo, capture transfer, asynchronous dock completion and Continue.
- Destroying the same lot cannot mint multiple rewards or multiple shortages.
- Background market drift must not be labeled as caused by the player.

## Acceptance and evidence

A delivered, delayed, stolen and destroyed version of the same finite lot yield correctly different downstream outcomes with source-linked explanations and conserved value.

Finite-custody and market-owner tests plus paired delivery/interception trials. Record actual stock delta, service availability and conserved quantity, not a new war-pressure counter.

**Do not:** No full RTS macro economy, endless reinforcement factory or scalar strategic simulation disconnected from the physical lot.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-09`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
