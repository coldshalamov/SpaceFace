# SC-13 — Cinematic Causal Feedback

**Implementation commission, not a shipped-feature claim.**

## Player outcome

Anticipation, action, impact and aftermath communicate what happened and how much it mattered, while the player retains control and tactical visibility.

**Decision:** The player can judge whether to commit, evade, repeat or recover from the action because feedback explains the actual state.

## Existing ownership and dependencies

Existing parents: PQ-139, PQ-144, existing Look / NOCTURNE / ORRERY lanes.

Capability dependencies: SC-02.

Known overlap to recheck: #554, #605, #631. PR status is not frozen by this document.

**Write boundary:** One complete interaction’s existing presentation/audio consumers; respect NOCTURNE, current Look and ORRERY ownership.

Start at: `src/systems/presentationOrchestrator.js`, `src/combat/presentationImpact.js`, `src/render/vfx.js`, `src/audio/audioSystem.js`.

## Implementation sequence

1. Trace a single interaction from intent and windup to contact, physical reaction, consequence and quiet aftermath.
2. Drive audio, VFX, lighting and optional camera response from the same authoritative event and causal identity, not several independent guesses.
3. Use real mass/material/impulse where available. Avoid constant camera shake, excessive hitstop and flashes that erase the next tactical decision.
4. Qualify source fixes separately from real-GPU appearance/performance. Continue useful implementation when a capture host is unavailable, but do not claim that missing measurement.

## Bounded follow-on work

Each item is a complete player-visible or truth-preserving change, not a ticket to increase line count.

1. Replace one generic impact with owner-driven material/mass differentiation.
2. Add a cancellation/rejection response for an action that currently appears to do nothing.
3. Give one overload/reduced-motion case a lower-cost presentation path without changing gameplay.

## Adversarial cases

- Dense simultaneous impacts, offscreen event, dead camera anchor and duplicate event.
- Reduced motion/flash, audio mute, pause/resume and renderer rebuild.
- Effects may be budgeted down but gameplay consequences and critical warnings must remain.

## Acceptance and evidence

One light-body throw, one heavy collision and one field interaction have distinctive readable responses based on real mass/material/outcome; incoming threats remain identifiable and existing performance/accessibility contracts are met.

Presentation-owner tests and actual normal-camera inspection for the changed interaction. Performance qualification uses existing hardware-bound budgets; a headless test does not certify lighting quality.

**Do not:** No independent lighting system, perpetual spectacle or animation that contradicts physical results.

## Workflow and delivery

Use the existing build map, exact live claims and nearest AGENTS instructions. Inspect the current owner and open PR overlap before changing files. A dependency is a required capability, not permission to wait indefinitely: verify whether it already exists, coordinate an exact shared hunk, and complete disjoint useful work. Do not silently absorb another open PR.

State one falsifiable player-outcome hypothesis. Reproduce the gap at the cheapest truthful layer; implement through existing owners; run focused and adversarial checks; review the integrated outcome. Agent review continues without waiting for the owner to play. Evidence limitations remain explicit. No metrics-only claim that the game is fun.

Commit only the owned paths. Return one scoped draft PR, exact commit, reproduction, checks and unmeasured boundaries. A partial child slice does not close its broader parent. No deployment, automatic merge, paid-agent launch, new dependencies or save-schema migration without the relevant existing workflow.

Generate this packet as an assignment with `node scripts/strategic-chaos.mjs brief SC-13`. See [foundations](../FOUNDATIONS.md), [architecture](../ARCHITECTURE.md) and [agent workflow](../AGENT_WORKFLOW.md).
