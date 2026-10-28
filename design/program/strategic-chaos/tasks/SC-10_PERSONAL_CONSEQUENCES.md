# SC-10 — Personal Consequences

**Implementation commission, not a shipped-feature claim.**

## Player outcome

A recognizable person reacts later to a real encounter with the player, changing an opportunity or behavior without inventing history.

**Decision:** Help someone now for access or intelligence later, exploit a short-term opening at a relationship cost, or leave them alone.

## Existing ownership and dependencies

Existing parents: existing captain / ace / moral memory seam, build_map.md §1.8.

Capability dependencies: SC-01, SC-08.

Known overlap to recheck: #609, #526. PR status is not frozen by this document.

**Write boundary:** One existing named/remembered captain and one readout or encounter consumer. Reuse current identity and memory owners.

Start at: `src/systems/captainMemory.js`, `src/systems/aceMemory.js`, `src/systems/moralMemory.js`, `src/systems/chronicler.js`.

## Implementation sequence

1. Choose one real captain identity already supported by traffic/memory and trace a witnessed outcome into durable storage.
2. Give the memory one useful later consumer: altered cooperation, a legitimate lead, defensive behavior or a bounded grudge. Dialogue alone is not enough for this packet.
3. Keep knowledge and survival honest. A rescued person knows what they saw; a faction can know a report only after the existing reporting route.
4. Express the change through the current contact/Chronicler presentation without flooding every return visit with recap text.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Connect one existing memory field to an available service or behavior.
2. Repair one stale captain reference across pod ejection and capture.
3. Add a negative case for an unknown/unwitnessed action and one terminal-save case.

## Adversarial cases

- Captain died, identity was recycled, another actor rescued them, save was reloaded.
- Duplicate rescue signals or two systems consuming one reward.
- Do not turn every loss into an identical revenge encounter.

## Acceptance and evidence

A verified rescue, betrayal or humiliation changes a later decision/opportunity; death, lack of evidence and save/load cannot create false memories or replay payment.

Actual memory-writer and consumer tests plus a return-visit scenario. Demonstrate changed behavior and explain the source event; absence remains absence.

**Do not:** No second memory database, universal nemesis framework or procedural claims about events that never happened.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-10`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
