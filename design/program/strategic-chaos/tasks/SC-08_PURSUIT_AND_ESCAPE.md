# SC-08 — Pursuit and Escape

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Illegal or accidental interventions produce understandable searches and escapes, not an arbitrary punishment meter.

**Decision:** Avoid identification, interrupt a report before it legitimately completes, outrun an active search, break a real checkpoint, surrender or settle.

## Existing ownership and dependencies

Existing parents: PQ-138, PQ-151.

Capability dependencies: SC-01, SC-02.

Known overlap to recheck: #583, #590, #605. PR status is not frozen by this document.

**Write boundary:** One witnessed incident → existing response → existing escape/settlement path. Keep heat, law, custody and economy authority separate.

Start at: `src/systems/heat.js`, `src/systems/lawSecurity.js`, `src/systems/warrantHunterWaves.js`, `src/systems/shipjack.js`.

## Implementation sequence

1. Trace one actual collateral/cargo-custody incident through witness validation, jurisdiction, incident identity, heat and response dispatch.
2. Make existing response tiers feel different through behavior and geometry, not only extra health. Use existing search zone, hunter and checkpoint owners.
3. Expose the reason for pursuit and the currently valid escape or settlement condition without revealing unseen patrol positions.
4. Keep short-term heat separate from persistent reputation, custody or a remembered grudge. Ending a search must not silently erase the latter.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Add a causal explanation for one genuine dispatch from its incident receipt.
2. Test an unwitnessed assault cannot acquire a fabricated conviction.
3. Repair one escape/impound route that continues to reference a dead or captured hull.

## Adversarial cases

- Minor scrape versus deliberate attack; witnesses cannot identify an unseen cause.
- Repeat/duplicate receipts, interrupted reporting, source death, return through a gate.
- Surrender/payment/recovery must settle once and preserve foreign cargo.

## Acceptance and evidence

The player can explain who observed what, why a response escalated, and what legitimate action ends or changes the pursuit. Finite consequences survive return/Continue correctly.

Law-owner and heat-owner regressions, then one chase/escape and one settlement route through ordinary inputs. Keep existing native versus fixture distinctions explicit.

**Do not:** Do not add another wanted meter or guarantee police spawn beside the player just to create excitement.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-08`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
