# SC-05 — Signal Warfare

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Scouting and deception change what the player and opponents can reasonably know, making preparation and concealment useful.

**Decision:** Spend time and exposure scouting, use the known safe window, or attempt a noisy shortcut with incomplete information.

## Existing ownership and dependencies

Existing parents: existing scanner / cloak / perception seam, build_map.md §1.8.

Capability dependencies: SC-02.

Known overlap to recheck: #605. PR status is not frozen by this document.

**Write boundary:** One existing information producer and perception consumer, plus minimal known-world presentation. No new global sensor truth.

Start at: `src/systems/scanner.js`, `src/systems/cloak.js`, `src/ai/perception.js`, `src/systems/bandRadio.js`.

## Implementation sequence

1. Trace current sensor confidence, cloak revelation and contact expiry before introducing any new effect.
2. Complete one concrete information intervention through existing physical equipment: a decoy signature or an existing jamming-capable component. State precisely what information it changes and what it cannot change.
3. Make active scanning and deception expose a cost or opportunity to an opponent. A lawful scan, combat sensor and map intelligence need not have identical rules.
4. Persist only appropriate knowledge/last-known observations under stable identities; transient sensor leases expire through simulation time.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Display age/confidence for one existing stale contact without inventing exact coordinates.
2. Add a legitimate reacquisition counter to one deception effect.
3. Test cloak break/reveal on attack, collision or scanning using actual owners.

## Adversarial cases

- No hostile target exists; effect must remain bounded and retire.
- Repeated scans, stale contact IDs, sector travel and Continue.
- HUD and agent actors must not use internal state to route around uncertainty.

## Acceptance and evidence

An observed patrol/weakness changes a tactical opportunity; a decoy or bounded interference can mislead an eligible observer and can be countered. Hidden facts remain hidden.

Perception and information-gating regressions plus paired approach trials with the same seed and equipment. Verify the affected ordinary route, not only a map flag.

**Do not:** No universal fog rewrite, omniscient tactical overlay or magic disable-everything jammer.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-05`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
