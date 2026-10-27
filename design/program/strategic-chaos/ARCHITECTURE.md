# Architecture — strategic decisions over one physical world

This is a design/implementation contract for the commissions, not a new engine. Root architecture, VISION, current product decisions, the live build map and actual source remain authoritative.

## One universe, three timescales

In seconds, the pilot maneuvers, reads threats, orders a wing and manipulates mass. Over minutes, the same actors contest a shipment, route, component or rescue. Over longer sessions, the actual outcomes alter stocks, services, access, remembered relationships and future opportunities. Do not implement these as unrelated strategic meters. A physical shipment that was stolen must be the shipment missing at its destination.

Strategic depth means useful alternatives under opportunity cost and imperfect information. It does not mean additional buttons or compulsory micromanagement. Wild play comes from composable rules; trustworthy control comes from understandable preconditions, responsive input and bounded recovery. These are complementary goals.

## Authority map

| Concern | Existing authority to extend | Boundary |
|---|---|---|
| Entity identity and life | core entity/world records | Recycled numeric IDs must not inherit old jobs, aggression, orders or rewards |
| Movement and impacts | physicsAuthority / authoritative dynamic-body owner | Features issue intent, force or impulse; never write pose to force a cool result |
| Player command | input → wingOrders → wingmen/AI ports | UI expresses intent; recipient owner validates and acknowledges |
| Enemy knowledge | scanner/perception and existing known-world projections | Internal AI state is not automatically player knowledge |
| Hostility and lawful engagement | current shared scanner/engagement/law owners | Faction color and legacy team number are not separate hostility laws |
| Cargo and physical custody | cargo/cargoCustody and freight owners | One finite lot, partial amounts, explicit transfer and exactly-once settlement |
| Money, markets, reputation, wanted state | economy, factions, heat/law respectively | Other domains use established intents; no second writer |
| Durable personal consequences | captain/ace/moral memory and world records | Remember only events the actor or legitimate report could establish |
| Presentation | descriptors, orchestrator, ORRERY, audio, Look/NOCTURNE | Read accepted state, arbitrate attention; do not invent outcomes |
| Tests and content authoring | generic simScenario lab, agent-loop, existing B12 | No replacement simulator, arbitrary expression evaluator or evidence promotion |

## Command transaction

The relevant owner should expose the equivalents of issued → validated → accepted/rejected → executing → completed/cancelled. Use existing events/state where present rather than introducing a parallel transaction service. A command includes recipient scope, target/anchor, sector and sequence identity. Validation reads current relation, capabilities, actor life and reachability. Acknowledgment is not completion. A captured/dead target invalidates the old command; a successor actor does not inherit it.

Cancellation releases only the activity/physics lease owned by that command. A foreign successor maneuver or existing coasting momentum must survive. Repeated input cannot spend resources twice or settle an objective twice. Hold and screen need meaningful fallback behavior when the original anchor disappears.

## Information contract

Separate what is true, what an actor observed, and what the player may know. A readout can show known role, current visible action, a justified threat and valid affordances. It must not disclose a hidden future plan or stale exact location. Lost information is unknown, not zero. Reacquisition, expiry and uncertainty use simulation time and stable identity.

A useful tactical cue says what can happen and when the player can respond. A useful denial says what currently prevents the chosen action. Both derive from the same underlying owner that will accept or reject the command. Avoid UI-only eligibility checks that disagree with real execution.

## Causal chain and finite value

Chronological adjacency is not causality. A shove, collision, cargo spill and patrol dispatch in the same second may concern four unrelated actors. Preserve original actor-life, attack lineage, incident, cargo-lot and destination references through real owner receipts. Add missing provenance at the producer, not by guessing in the report consumer.

Conservation applies to cargo/rewards, not an invented promise of perfect physical energy conservation: powers legitimately add energy through their defined costs. An explosion can be wild without duplicating salvage. A failed recovery can leave a real wreck without silently recreating the lost cargo next visit. Identify every irreversible settlement and its idempotency key.

## Encounter grammar

Author a place, parties with independent goals, useful physical objects, a known or discoverable pressure, multiple interventions, explicit retreat/failure, and persistent aftermath. The director may create opportunities and pace arrivals; it cannot force the player's chain reaction or retroactively declare a choice completed.

Each operation needs a noncombat or lower-violence alternative where the situation supports it, not universally. A freighter captain may bargain; a mindless hazard may not. The optional chaos route must not be the only way to obtain basic progression. Factions should be recognizable through goals, tactics, machines and material culture, not solely palette.

## Performance, determinism and lifecycle

Use current scheduler, spatial queries and budgets; do not add per-frame all-pairs actor scans. Cache only with an explicit invalidation/lifecycle owner. Bound histories, descendant attacks, reactive audio/VFX and expensive planning cadence. Critical intent/outcome must survive cosmetic budget reduction. Do not meet a performance target by deleting authored gameplay or lowering default visual quality.

All gameplay clocks and random choices use existing deterministic sources. Handle pause, sector exit/entry, death, capture, load, renderer rebuild and repeated init/dispose. Serialize durable facts, not live entity pointers or transient UI state. Existing performance targets are hardware/profile-bound; this document does not invent universal millisecond promises.

## Architecture cuts

Do not build RTS base construction, multiplayer, walking interiors, a universal quest VM, an LLM-controlled runtime, a second faction simulator, a second lighting stack, a second fleet ledger or another global planner for this program. These are scope cuts, not statements that the ideas can never work. First prove a coherent local situation.
