# SC-02 — Battlefield Intelligence

**Implementation commission, not a shipped-feature claim.**

## Player outcome

At fighting speed the player can distinguish an enemy, neutral worker and ally, read an imminent threat, and identify a legitimate intervention.

**Decision:** Which target deserves attention, whether it is threatening me or pursuing another objective, and whether to attack, protect, hail, manipulate or ignore it.

## Existing ownership and dependencies

Existing parents: PQ-140, PQ-144, build_map.md §1.8.

Capability dependencies: existing live owners; no other SC packet required to start.

Known overlap to recheck: #605, #496. PR status is not frozen by this document.

**Write boundary:** Existing descriptor/target projection plus a minimal ORRERY presentation consumer. Coordinate shared targeting and telegraph hunks with PR605.

Start at: `src/systems/interactionDescriptors.js`, `src/systems/scanner.js`, `src/systems/presentationOrchestrator.js`, `src/ai/perception.js`.

## Implementation sequence

1. Trace existing shared contact/target identity and attack eligibility. Maintain one relation authority: do not derive hostility independently from faction paint or legacy team numbers.
2. Project a compact known-intent description from actual public observations: guarding, approaching, charging, withdrawing, working or disabled. Unknown intent stays unknown; never expose internal future AI plans.
3. Give an imminent attack a directional, time-bounded cue and an opportunity a lower-priority cue. An unavailable verb names the current owner denial, not a second eligibility rule.
4. Use existing icon, contour and transient-message arbitration. Keep selected target distinct from the engaged gun/line target.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Add one missing intent-to-existing-glyph mapping with a non-color discriminator.
2. Connect one existing owner denial to its interaction readout.
3. Add a stale-target, capture or relation-change regression to the exact descriptor seam.

## Adversarial cases

- Target dies, changes control or is recycled while a cue is displayed.
- A neutral becomes hostile or vice versa without a faction-color change.
- A cloaked or out-of-sensor actor must not leak position, objective or exact health.

## Acceptance and evidence

Selection, relation, intent, action eligibility and the actual command agree in focused tests; a visual review at the ordinary camera confirms readable priority and shape-based identity.

Test pure descriptors, then exercise the real command path. Use the current ui-bench screen IDs after discovering them; inspect ordinary combat composition with reduced-motion/flash settings. DOM presence is not visual acceptance.

**Do not:** Do not add a second HUD, identify unknown contacts omnisciently, or mark everything with equal-brightness labels.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-02`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
