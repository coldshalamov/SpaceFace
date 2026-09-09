<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Flight, combat, AI, and game feel

Strengthen live V3 flight and tactical AI through bounded invariants, readable telegraphs, and focused gameplay scenarios.

**Tasks:** 100 · **Range:** `JULES-0601`–`JULES-0700`

## JULES-0601 — Pilot control scheme — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-pilot-controls`

**Objective:** Define and protect one live invariant for Pilot control scheme based on keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Pilot control scheme: keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset.

**Inspect:** `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Pilot control scheme; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0601 --format prompt`

## JULES-0602 — Pilot control scheme — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-pilot-controls`

**Objective:** Probe Pilot control scheme at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** Pilot control scheme: keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset.

**Inspect:** `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Pilot control scheme; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0602 --format prompt`

## JULES-0603 — Pilot control scheme — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-pilot-controls`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in Pilot control scheme readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** Pilot control scheme: keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset.

**Inspect:** `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Pilot control scheme; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0603 --format prompt`

## JULES-0604 — Pilot control scheme — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-pilot-controls`

**Objective:** Build a bounded deterministic scenario matrix for Pilot control scheme, measure the relevant handling/combat/AI outcomes from keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** Pilot control scheme: keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset.

**Inspect:** `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Pilot control scheme; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0604 --format prompt`

## JULES-0605 — Pilot control scheme — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-pilot-controls`

**Objective:** Create or extend one small deterministic scenario that exercises Pilot control scheme with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** Pilot control scheme: keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset.

**Inspect:** `src/systems/input.js`, `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Pilot control scheme; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0605 --format prompt`

## JULES-0606 — Classic and helm assist scheme parity — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-control-schemes`

**Objective:** Define and protect one live invariant for Classic and Helm Assist scheme parity based on scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Classic and Helm Assist scheme parity: scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence.

**Inspect:** `src/systems/input.js`, `src/ui/screens/settings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Classic and Helm Assist scheme parity; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0606 --format prompt`

## JULES-0607 — Classic and helm assist scheme parity — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-control-schemes`

**Objective:** Probe Classic and Helm Assist scheme parity at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** Classic and Helm Assist scheme parity: scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence.

**Inspect:** `src/systems/input.js`, `src/ui/screens/settings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Classic and Helm Assist scheme parity; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0607 --format prompt`

## JULES-0608 — Classic and helm assist scheme parity — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-control-schemes`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in Classic and Helm Assist scheme parity readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** Classic and Helm Assist scheme parity: scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence.

**Inspect:** `src/systems/input.js`, `src/ui/screens/settings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Classic and Helm Assist scheme parity; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0608 --format prompt`

## JULES-0609 — Classic and helm assist scheme parity — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-control-schemes`

**Objective:** Build a bounded deterministic scenario matrix for Classic and Helm Assist scheme parity, measure the relevant handling/combat/AI outcomes from scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** Classic and Helm Assist scheme parity: scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence.

**Inspect:** `src/systems/input.js`, `src/ui/screens/settings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Classic and Helm Assist scheme parity; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0609 --format prompt`

## JULES-0610 — Classic and helm assist scheme parity — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-control-schemes`

**Objective:** Create or extend one small deterministic scenario that exercises Classic and Helm Assist scheme parity with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** Classic and Helm Assist scheme parity: scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence.

**Inspect:** `src/systems/input.js`, `src/ui/screens/settings.js`, `src/ui/controlPrompts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Classic and Helm Assist scheme parity; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0610 --format prompt`

## JULES-0611 — Cruise engagement and interdiction — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-cruise`

**Objective:** Define and protect one live invariant for cruise engagement and interdiction based on charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** cruise engagement and interdiction: charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions.

**Inspect:** `src/systems/cruise.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for cruise engagement and interdiction; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0611 --format prompt`

## JULES-0612 — Cruise engagement and interdiction — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-cruise`

**Objective:** Probe cruise engagement and interdiction at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** cruise engagement and interdiction: charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions.

**Inspect:** `src/systems/cruise.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for cruise engagement and interdiction; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0612 --format prompt`

## JULES-0613 — Cruise engagement and interdiction — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-cruise`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in cruise engagement and interdiction readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** cruise engagement and interdiction: charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions.

**Inspect:** `src/systems/cruise.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for cruise engagement and interdiction; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0613 --format prompt`

## JULES-0614 — Cruise engagement and interdiction — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-cruise`

**Objective:** Build a bounded deterministic scenario matrix for cruise engagement and interdiction, measure the relevant handling/combat/AI outcomes from charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** cruise engagement and interdiction: charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions.

**Inspect:** `src/systems/cruise.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for cruise engagement and interdiction; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0614 --format prompt`

## JULES-0615 — Cruise engagement and interdiction — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-cruise`

**Objective:** Create or extend one small deterministic scenario that exercises cruise engagement and interdiction with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** cruise engagement and interdiction: charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions.

**Inspect:** `src/systems/cruise.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for cruise engagement and interdiction; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0615 --format prompt`

## JULES-0616 — Boost and dash behavior — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-boost-dash`

**Objective:** Define and protect one live invariant for boost and dash behavior based on tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** boost and dash behavior: tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for boost and dash behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0616 --format prompt`

## JULES-0617 — Boost and dash behavior — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-boost-dash`

**Objective:** Probe boost and dash behavior at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** boost and dash behavior: tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for boost and dash behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0617 --format prompt`

## JULES-0618 — Boost and dash behavior — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-boost-dash`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in boost and dash behavior readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** boost and dash behavior: tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for boost and dash behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0618 --format prompt`

## JULES-0619 — Boost and dash behavior — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-boost-dash`

**Objective:** Build a bounded deterministic scenario matrix for boost and dash behavior, measure the relevant handling/combat/AI outcomes from tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** boost and dash behavior: tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for boost and dash behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0619 --format prompt`

## JULES-0620 — Boost and dash behavior — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-boost-dash`

**Objective:** Create or extend one small deterministic scenario that exercises boost and dash behavior with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** boost and dash behavior: tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for boost and dash behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0620 --format prompt`

## JULES-0621 — Massline target acquisition — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-massline-acquisition`

**Objective:** Define and protect one live invariant for Massline target acquisition based on nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js`, `src/systems/masslineInputGrammar.js`, `src/systems/autoTargetAssist.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline target acquisition; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:massline:acquisition-contract`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0621 --format prompt`

## JULES-0622 — Massline target acquisition — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-acquisition`

**Objective:** Probe Massline target acquisition at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js`, `src/systems/masslineInputGrammar.js`, `src/systems/autoTargetAssist.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline target acquisition; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:massline:acquisition-contract`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0622 --format prompt`

## JULES-0623 — Massline target acquisition — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-acquisition`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in Massline target acquisition readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js`, `src/systems/masslineInputGrammar.js`, `src/systems/autoTargetAssist.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline target acquisition; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:massline:acquisition-contract`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0623 --format prompt`

## JULES-0624 — Massline target acquisition — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-acquisition`

**Objective:** Build a bounded deterministic scenario matrix for Massline target acquisition, measure the relevant handling/combat/AI outcomes from nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js`, `src/systems/masslineInputGrammar.js`, `src/systems/autoTargetAssist.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline target acquisition; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:massline:acquisition-contract`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0624 --format prompt`

## JULES-0625 — Massline target acquisition — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-acquisition`

**Objective:** Create or extend one small deterministic scenario that exercises Massline target acquisition with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js`, `src/systems/masslineInputGrammar.js`, `src/systems/autoTargetAssist.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline target acquisition; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:massline:acquisition-contract`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0625 --format prompt`

## JULES-0626 — Massline line control — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-massline-control`

**Objective:** Define and protect one live invariant for Massline line control based on reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline line control; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0626 --format prompt`

## JULES-0627 — Massline line control — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-control`

**Objective:** Probe Massline line control at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline line control; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0627 --format prompt`

## JULES-0628 — Massline line control — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-control`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in Massline line control readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline line control; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0628 --format prompt`

## JULES-0629 — Massline line control — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-control`

**Objective:** Build a bounded deterministic scenario matrix for Massline line control, measure the relevant handling/combat/AI outcomes from reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline line control; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0629 --format prompt`

## JULES-0630 — Massline line control — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-control`

**Objective:** Create or extend one small deterministic scenario that exercises Massline line control with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for Massline line control; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0630 --format prompt`

## JULES-0631 — Impulse charges — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-impulse-charges`

**Objective:** Define and protect one live invariant for impulse charges based on lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** impulse charges: lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup.

**Inspect:** `src/systems/impulseCharges.js`, `src/data/impulseCharges.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for impulse charges; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0631 --format prompt`

## JULES-0632 — Impulse charges — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-impulse-charges`

**Objective:** Probe impulse charges at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** impulse charges: lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup.

**Inspect:** `src/systems/impulseCharges.js`, `src/data/impulseCharges.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for impulse charges; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0632 --format prompt`

## JULES-0633 — Impulse charges — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-impulse-charges`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in impulse charges readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** impulse charges: lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup.

**Inspect:** `src/systems/impulseCharges.js`, `src/data/impulseCharges.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for impulse charges; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0633 --format prompt`

## JULES-0634 — Impulse charges — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-impulse-charges`

**Objective:** Build a bounded deterministic scenario matrix for impulse charges, measure the relevant handling/combat/AI outcomes from lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** impulse charges: lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup.

**Inspect:** `src/systems/impulseCharges.js`, `src/data/impulseCharges.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for impulse charges; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0634 --format prompt`

## JULES-0635 — Impulse charges — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-impulse-charges`

**Objective:** Create or extend one small deterministic scenario that exercises impulse charges with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** impulse charges: lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup.

**Inspect:** `src/systems/impulseCharges.js`, `src/data/impulseCharges.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for impulse charges; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0635 --format prompt`

## JULES-0636 — Weapon aiming and autofire — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-weapon-aim`

**Objective:** Define and protect one live invariant for weapon aiming and autofire based on player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** weapon aiming and autofire: player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states.

**Inspect:** `src/systems/weapons.js`, `src/systems/aiFireIntent.js`, `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for weapon aiming and autofire; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0636 --format prompt`

## JULES-0637 — Weapon aiming and autofire — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-weapon-aim`

**Objective:** Probe weapon aiming and autofire at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** weapon aiming and autofire: player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states.

**Inspect:** `src/systems/weapons.js`, `src/systems/aiFireIntent.js`, `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for weapon aiming and autofire; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0637 --format prompt`

## JULES-0638 — Weapon aiming and autofire — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-weapon-aim`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in weapon aiming and autofire readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** weapon aiming and autofire: player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states.

**Inspect:** `src/systems/weapons.js`, `src/systems/aiFireIntent.js`, `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for weapon aiming and autofire; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0638 --format prompt`

## JULES-0639 — Weapon aiming and autofire — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-weapon-aim`

**Objective:** Build a bounded deterministic scenario matrix for weapon aiming and autofire, measure the relevant handling/combat/AI outcomes from player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** weapon aiming and autofire: player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states.

**Inspect:** `src/systems/weapons.js`, `src/systems/aiFireIntent.js`, `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for weapon aiming and autofire; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0639 --format prompt`

## JULES-0640 — Weapon aiming and autofire — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-weapon-aim`

**Objective:** Create or extend one small deterministic scenario that exercises weapon aiming and autofire with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** weapon aiming and autofire: player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states.

**Inspect:** `src/systems/weapons.js`, `src/systems/aiFireIntent.js`, `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for weapon aiming and autofire; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0640 --format prompt`

## JULES-0641 — Countermeasures — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-countermeasures`

**Objective:** Define and protect one live invariant for countermeasures based on decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** countermeasures: decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback.

**Inspect:** `src/systems/countermeasures.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for countermeasures; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0641 --format prompt`

## JULES-0642 — Countermeasures — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-countermeasures`

**Objective:** Probe countermeasures at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** countermeasures: decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback.

**Inspect:** `src/systems/countermeasures.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for countermeasures; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0642 --format prompt`

## JULES-0643 — Countermeasures — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-countermeasures`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in countermeasures readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** countermeasures: decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback.

**Inspect:** `src/systems/countermeasures.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for countermeasures; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0643 --format prompt`

## JULES-0644 — Countermeasures — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-countermeasures`

**Objective:** Build a bounded deterministic scenario matrix for countermeasures, measure the relevant handling/combat/AI outcomes from decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** countermeasures: decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback.

**Inspect:** `src/systems/countermeasures.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for countermeasures; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0644 --format prompt`

## JULES-0645 — Countermeasures — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-countermeasures`

**Objective:** Create or extend one small deterministic scenario that exercises countermeasures with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** countermeasures: decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback.

**Inspect:** `src/systems/countermeasures.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for countermeasures; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0645 --format prompt`

## JULES-0646 — Damage triangle readability — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-damage-triangle`

**Objective:** Define and protect one live invariant for damage triangle readability based on energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** damage triangle readability: energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response.

**Inspect:** `src/combat/damage.js`, `src/data/weapons.js`, `src/ui/targetPanel.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for damage triangle readability; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0646 --format prompt`

## JULES-0647 — Damage triangle readability — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-damage-triangle`

**Objective:** Probe damage triangle readability at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** damage triangle readability: energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response.

**Inspect:** `src/combat/damage.js`, `src/data/weapons.js`, `src/ui/targetPanel.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for damage triangle readability; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0647 --format prompt`

## JULES-0648 — Damage triangle readability — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-damage-triangle`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in damage triangle readability readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** damage triangle readability: energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response.

**Inspect:** `src/combat/damage.js`, `src/data/weapons.js`, `src/ui/targetPanel.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for damage triangle readability; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0648 --format prompt`

## JULES-0649 — Damage triangle readability — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-damage-triangle`

**Objective:** Build a bounded deterministic scenario matrix for damage triangle readability, measure the relevant handling/combat/AI outcomes from energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** damage triangle readability: energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response.

**Inspect:** `src/combat/damage.js`, `src/data/weapons.js`, `src/ui/targetPanel.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for damage triangle readability; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0649 --format prompt`

## JULES-0650 — Damage triangle readability — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-damage-triangle`

**Objective:** Create or extend one small deterministic scenario that exercises damage triangle readability with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** damage triangle readability: energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response.

**Inspect:** `src/combat/damage.js`, `src/data/weapons.js`, `src/ui/targetPanel.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for damage triangle readability; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0650 --format prompt`

## JULES-0651 — Combat statuses and subsystem damage — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-status-subsystems`

**Objective:** Define and protect one live invariant for combat statuses and subsystem damage based on stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** combat statuses and subsystem damage: stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence.

**Inspect:** `src/combat/statuses.js`, `src/combat/subsystems.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for combat statuses and subsystem damage; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0651 --format prompt`

## JULES-0652 — Combat statuses and subsystem damage — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-status-subsystems`

**Objective:** Probe combat statuses and subsystem damage at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** combat statuses and subsystem damage: stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence.

**Inspect:** `src/combat/statuses.js`, `src/combat/subsystems.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for combat statuses and subsystem damage; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0652 --format prompt`

## JULES-0653 — Combat statuses and subsystem damage — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-status-subsystems`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in combat statuses and subsystem damage readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** combat statuses and subsystem damage: stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence.

**Inspect:** `src/combat/statuses.js`, `src/combat/subsystems.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for combat statuses and subsystem damage; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0653 --format prompt`

## JULES-0654 — Combat statuses and subsystem damage — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-status-subsystems`

**Objective:** Build a bounded deterministic scenario matrix for combat statuses and subsystem damage, measure the relevant handling/combat/AI outcomes from stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** combat statuses and subsystem damage: stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence.

**Inspect:** `src/combat/statuses.js`, `src/combat/subsystems.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for combat statuses and subsystem damage; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0654 --format prompt`

## JULES-0655 — Combat statuses and subsystem damage — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-status-subsystems`

**Objective:** Create or extend one small deterministic scenario that exercises combat statuses and subsystem damage with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** combat statuses and subsystem damage: stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence.

**Inspect:** `src/combat/statuses.js`, `src/combat/subsystems.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for combat statuses and subsystem damage; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0655 --format prompt`

## JULES-0656 — Tactical perception and contact classification — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ai-perception`

**Objective:** Define and protect one live invariant for tactical perception and contact classification based on visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** tactical perception and contact classification: visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry.

**Inspect:** `src/ai/perception.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for tactical perception and contact classification; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0656 --format prompt`

## JULES-0657 — Tactical perception and contact classification — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-perception`

**Objective:** Probe tactical perception and contact classification at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** tactical perception and contact classification: visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry.

**Inspect:** `src/ai/perception.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for tactical perception and contact classification; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0657 --format prompt`

## JULES-0658 — Tactical perception and contact classification — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-perception`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in tactical perception and contact classification readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** tactical perception and contact classification: visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry.

**Inspect:** `src/ai/perception.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for tactical perception and contact classification; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0658 --format prompt`

## JULES-0659 — Tactical perception and contact classification — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-perception`

**Objective:** Build a bounded deterministic scenario matrix for tactical perception and contact classification, measure the relevant handling/combat/AI outcomes from visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** tactical perception and contact classification: visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry.

**Inspect:** `src/ai/perception.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for tactical perception and contact classification; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0659 --format prompt`

## JULES-0660 — Tactical perception and contact classification — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-perception`

**Objective:** Create or extend one small deterministic scenario that exercises tactical perception and contact classification with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** tactical perception and contact classification: visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry.

**Inspect:** `src/ai/perception.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for tactical perception and contact classification; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0660 --format prompt`

## JULES-0661 — Engagement authority and response windows — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-engagement-authority`

**Objective:** Define and protect one live invariant for engagement authority and response windows based on motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** engagement authority and response windows: motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for engagement authority and response windows; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0661 --format prompt`

## JULES-0662 — Engagement authority and response windows — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-engagement-authority`

**Objective:** Probe engagement authority and response windows at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** engagement authority and response windows: motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for engagement authority and response windows; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0662 --format prompt`

## JULES-0663 — Engagement authority and response windows — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-engagement-authority`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in engagement authority and response windows readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** engagement authority and response windows: motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for engagement authority and response windows; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0663 --format prompt`

## JULES-0664 — Engagement authority and response windows — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-engagement-authority`

**Objective:** Build a bounded deterministic scenario matrix for engagement authority and response windows, measure the relevant handling/combat/AI outcomes from motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** engagement authority and response windows: motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for engagement authority and response windows; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0664 --format prompt`

## JULES-0665 — Engagement authority and response windows — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-engagement-authority`

**Objective:** Create or extend one small deterministic scenario that exercises engagement authority and response windows with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** engagement authority and response windows: motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for engagement authority and response windows; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0665 --format prompt`

## JULES-0666 — Squad formations and leader loss — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-squad-formations`

**Objective:** Define and protect one live invariant for squad formations and leader loss based on wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** squad formations and leader loss: wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation.

**Inspect:** `src/ai/squad.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for squad formations and leader loss; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0666 --format prompt`

## JULES-0667 — Squad formations and leader loss — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-squad-formations`

**Objective:** Probe squad formations and leader loss at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** squad formations and leader loss: wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation.

**Inspect:** `src/ai/squad.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for squad formations and leader loss; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0667 --format prompt`

## JULES-0668 — Squad formations and leader loss — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-squad-formations`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in squad formations and leader loss readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** squad formations and leader loss: wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation.

**Inspect:** `src/ai/squad.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for squad formations and leader loss; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0668 --format prompt`

## JULES-0669 — Squad formations and leader loss — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-squad-formations`

**Objective:** Build a bounded deterministic scenario matrix for squad formations and leader loss, measure the relevant handling/combat/AI outcomes from wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** squad formations and leader loss: wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation.

**Inspect:** `src/ai/squad.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for squad formations and leader loss; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0669 --format prompt`

## JULES-0670 — Squad formations and leader loss — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-squad-formations`

**Objective:** Create or extend one small deterministic scenario that exercises squad formations and leader loss with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** squad formations and leader loss: wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation.

**Inspect:** `src/ai/squad.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for squad formations and leader loss; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0670 --format prompt`

## JULES-0671 — Ai maneuver selection — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ai-maneuver`

**Objective:** Define and protect one live invariant for AI maneuver selection based on intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** AI maneuver selection: intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion.

**Inspect:** `src/ai/shipDecision.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for AI maneuver selection; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0671 --format prompt`

## JULES-0672 — Ai maneuver selection — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-maneuver`

**Objective:** Probe AI maneuver selection at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** AI maneuver selection: intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion.

**Inspect:** `src/ai/shipDecision.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for AI maneuver selection; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0672 --format prompt`

## JULES-0673 — Ai maneuver selection — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-maneuver`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in AI maneuver selection readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** AI maneuver selection: intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion.

**Inspect:** `src/ai/shipDecision.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for AI maneuver selection; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0673 --format prompt`

## JULES-0674 — Ai maneuver selection — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-maneuver`

**Objective:** Build a bounded deterministic scenario matrix for AI maneuver selection, measure the relevant handling/combat/AI outcomes from intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** AI maneuver selection: intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion.

**Inspect:** `src/ai/shipDecision.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for AI maneuver selection; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0674 --format prompt`

## JULES-0675 — Ai maneuver selection — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-maneuver`

**Objective:** Create or extend one small deterministic scenario that exercises AI maneuver selection with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** AI maneuver selection: intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion.

**Inspect:** `src/ai/shipDecision.js`, `src/ai/maneuver.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for AI maneuver selection; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0675 --format prompt`

## JULES-0676 — Encounter director pacing — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ai-director`

**Objective:** Define and protect one live invariant for encounter director pacing based on pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** encounter director pacing: pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation.

**Inspect:** `src/ai/director.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for encounter director pacing; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0676 --format prompt`

## JULES-0677 — Encounter director pacing — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-director`

**Objective:** Probe encounter director pacing at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** encounter director pacing: pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation.

**Inspect:** `src/ai/director.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for encounter director pacing; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0677 --format prompt`

## JULES-0678 — Encounter director pacing — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-director`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in encounter director pacing readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** encounter director pacing: pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation.

**Inspect:** `src/ai/director.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for encounter director pacing; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0678 --format prompt`

## JULES-0679 — Encounter director pacing — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-director`

**Objective:** Build a bounded deterministic scenario matrix for encounter director pacing, measure the relevant handling/combat/AI outcomes from pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** encounter director pacing: pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation.

**Inspect:** `src/ai/director.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for encounter director pacing; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0679 --format prompt`

## JULES-0680 — Encounter director pacing — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ai-director`

**Objective:** Create or extend one small deterministic scenario that exercises encounter director pacing with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** encounter director pacing: pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation.

**Inspect:** `src/ai/director.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for encounter director pacing; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0680 --format prompt`

## JULES-0681 — Reinforcement package spawning — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-reinforcements`

**Objective:** Define and protect one live invariant for reinforcement package spawning based on package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** reinforcement package spawning: package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup.

**Inspect:** `src/systems/aiEncounter.js`, `src/data/enemies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for reinforcement package spawning; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0681 --format prompt`

## JULES-0682 — Reinforcement package spawning — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-reinforcements`

**Objective:** Probe reinforcement package spawning at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** reinforcement package spawning: package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup.

**Inspect:** `src/systems/aiEncounter.js`, `src/data/enemies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for reinforcement package spawning; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0682 --format prompt`

## JULES-0683 — Reinforcement package spawning — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-reinforcements`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in reinforcement package spawning readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** reinforcement package spawning: package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup.

**Inspect:** `src/systems/aiEncounter.js`, `src/data/enemies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for reinforcement package spawning; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0683 --format prompt`

## JULES-0684 — Reinforcement package spawning — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-reinforcements`

**Objective:** Build a bounded deterministic scenario matrix for reinforcement package spawning, measure the relevant handling/combat/AI outcomes from package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** reinforcement package spawning: package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup.

**Inspect:** `src/systems/aiEncounter.js`, `src/data/enemies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for reinforcement package spawning; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0684 --format prompt`

## JULES-0685 — Reinforcement package spawning — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-reinforcements`

**Objective:** Create or extend one small deterministic scenario that exercises reinforcement package spawning with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** reinforcement package spawning: package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup.

**Inspect:** `src/systems/aiEncounter.js`, `src/data/enemies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for reinforcement package spawning; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0685 --format prompt`

## JULES-0686 — Flee, morale, and surrender behavior — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-flee-morale`

**Objective:** Define and protect one live invariant for flee, morale, and surrender behavior based on visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** flee, morale, and surrender behavior: visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence.

**Inspect:** `src/ai/shipDecision.js`, `src/systems/aceMemory.js`, `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for flee, morale, and surrender behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0686 --format prompt`

## JULES-0687 — Flee, morale, and surrender behavior — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-flee-morale`

**Objective:** Probe flee, morale, and surrender behavior at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** flee, morale, and surrender behavior: visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence.

**Inspect:** `src/ai/shipDecision.js`, `src/systems/aceMemory.js`, `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for flee, morale, and surrender behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0687 --format prompt`

## JULES-0688 — Flee, morale, and surrender behavior — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-flee-morale`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in flee, morale, and surrender behavior readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** flee, morale, and surrender behavior: visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence.

**Inspect:** `src/ai/shipDecision.js`, `src/systems/aceMemory.js`, `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for flee, morale, and surrender behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0688 --format prompt`

## JULES-0689 — Flee, morale, and surrender behavior — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-flee-morale`

**Objective:** Build a bounded deterministic scenario matrix for flee, morale, and surrender behavior, measure the relevant handling/combat/AI outcomes from visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** flee, morale, and surrender behavior: visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence.

**Inspect:** `src/ai/shipDecision.js`, `src/systems/aceMemory.js`, `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for flee, morale, and surrender behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0689 --format prompt`

## JULES-0690 — Flee, morale, and surrender behavior — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-flee-morale`

**Objective:** Create or extend one small deterministic scenario that exercises flee, morale, and surrender behavior with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** flee, morale, and surrender behavior: visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence.

**Inspect:** `src/ai/shipDecision.js`, `src/systems/aceMemory.js`, `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for flee, morale, and surrender behavior; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0690 --format prompt`

## JULES-0691 — Wingmen — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-wingmen`

**Objective:** Define and protect one live invariant for wingmen based on team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** wingmen: team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity.

**Inspect:** `src/systems/wingmen.js`, `src/systems/aiPorts.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for wingmen; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0691 --format prompt`

## JULES-0692 — Wingmen — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-wingmen`

**Objective:** Probe wingmen at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** wingmen: team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity.

**Inspect:** `src/systems/wingmen.js`, `src/systems/aiPorts.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for wingmen; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0692 --format prompt`

## JULES-0693 — Wingmen — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-wingmen`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in wingmen readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** wingmen: team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity.

**Inspect:** `src/systems/wingmen.js`, `src/systems/aiPorts.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for wingmen; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0693 --format prompt`

## JULES-0694 — Wingmen — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-wingmen`

**Objective:** Build a bounded deterministic scenario matrix for wingmen, measure the relevant handling/combat/AI outcomes from team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** wingmen: team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity.

**Inspect:** `src/systems/wingmen.js`, `src/systems/aiPorts.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for wingmen; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0694 --format prompt`

## JULES-0695 — Wingmen — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-wingmen`

**Objective:** Create or extend one small deterministic scenario that exercises wingmen with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** wingmen: team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity.

**Inspect:** `src/systems/wingmen.js`, `src/systems/aiPorts.js`, `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for wingmen; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0695 --format prompt`

## JULES-0696 — Collision and ramming feel — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ramming`

**Objective:** Define and protect one live invariant for collision and ramming feel based on momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** collision and ramming feel: momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling.

**Inspect:** `src/core/physicsAuthority.js`, `src/combat/damage.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for collision and ramming feel; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The test reaches the live backend selected by registry/default state.
- The invariant is expressed in player/gameplay terms rather than private implementation shape.
- The repair respects physics authority, engagement authority, and single writers.
- Legacy compatibility paths remain loadable but are not mistaken for the default game.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0696 --format prompt`

## JULES-0697 — Collision and ramming feel — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ramming`

**Objective:** Probe collision and ramming feel at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** collision and ramming feel: momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling.

**Inspect:** `src/core/physicsAuthority.js`, `src/combat/damage.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for collision and ramming feel; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The exact edge is reproducible from a seed/input/state fixture.
- The player or AI has a readable recovery/counterplay path unless the authored outcome is terminal.
- No global stat inflation, arbitrary timer, or hidden exception substitutes for the mechanic.
- The normal midrange behavior remains unchanged or intentionally improved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0697 --format prompt`

## JULES-0698 — Collision and ramming feel — add or repair a readable telegraph

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ramming`

**Objective:** Make one intent, state transition, threat, opportunity, or physical load in collision and ramming feel readable before its consequence. Reuse presentation, VFX, audio, comms, and HUD owners rather than adding a parallel cue system.

**Context:** collision and ramming feel: momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling.

**Inspect:** `src/core/physicsAuthority.js`, `src/combat/damage.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for collision and ramming feel; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The cue precedes or accompanies the causal gameplay transition at a useful timescale.
- Silhouette, motion, audio, or one concise cue carries meaning without adding a permanent text wall.
- Cue priority/dedupe and reduced-motion/flash behavior are respected.
- The cue is driven by canonical live state and disappears when the state no longer applies.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0698 --format prompt`

## JULES-0699 — Collision and ramming feel — run a deterministic tuning experiment

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ramming`

**Objective:** Build a bounded deterministic scenario matrix for collision and ramming feel, measure the relevant handling/combat/AI outcomes from momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling, and tune one parameter family only when the evidence identifies a clear defect.

**Context:** collision and ramming feel: momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling.

**Inspect:** `src/core/physicsAuthority.js`, `src/combat/damage.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for collision and ramming feel; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The matrix names seeds, starting states, inputs, and outcome metrics.
- The change improves the target envelope without flattening role identity or difficulty.
- No expected golden is blindly re-recorded; motion deltas are explained.
- The PR includes before/after results and the parameter rollback point.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0699 --format prompt`

## JULES-0700 — Collision and ramming feel — deliver one integrated gameplay scenario

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-ramming`

**Objective:** Create or extend one small deterministic scenario that exercises collision and ramming feel with at least one interacting live system. Use it to repair or strengthen the complete player-facing loop, not merely a hidden state transition.

**Context:** collision and ramming feel: momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling.

**Inspect:** `src/core/physicsAuthority.js`, `src/combat/damage.js`, `src/systems/presentationOrchestrator.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

**Work:**
1. Confirm the live V3/tactical/physics owners for collision and ramming feel; do not edit legacy controllers for default behavior.
2. Build a deterministic fixture or scenario around momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling and the exact facet.
3. Implement the smallest behavior, tuning, or presentation slice that completes the player-facing result.
4. Run focused behavior proof and inspect motion/authority deltas before accepting any golden change.

**Acceptance:**
- The scenario is reachable through an existing lab/check/content seam and terminates deterministically.
- Player input, AI/system response, presentation, and outcome/recovery are all observable.
- The implementation reuses existing owners and does not create a second combat/flight/AI framework.
- Focused scenario proof and the smallest surrounding regression gate pass.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the invariant already holds or tuning evidence does not support a change. Do not force novelty through arbitrary stat changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0700 --format prompt`
