<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Flight, combat, AI, and game feel

Strengthen live V3 flight and tactical AI through bounded invariants, readable telegraphs, and focused gameplay scenarios.

**Tasks:** 22 · **Range:** `JULES-0112`–`JULES-0133`

## JULES-0112 — Pilot control scheme — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-pilot-controls`

**Objective:** Define and protect one live invariant for Pilot control scheme based on keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Pilot control scheme: keyboard flight/mouse weapon separation, contextual A/D, Q/E strafe, brake on Digit0, and focus reset.

**Inspect:** `src/systems/input.js` `src/systems/flightV3.js` `src/core/flight/propulsionKernel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0112 --format prompt`

## JULES-0113 — Classic and helm assist scheme parity — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-control-schemes`

**Objective:** Define and protect one live invariant for Classic and Helm Assist scheme parity based on scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Classic and Helm Assist scheme parity: scheme-specific yaw/strafe/throw bindings, prompt accuracy, switching at runtime, and save persistence.

**Inspect:** `src/systems/input.js` `src/ui/screens/settings.js` `src/ui/controlPrompts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0113 --format prompt`

## JULES-0114 — Cruise engagement and interdiction — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-cruise`

**Objective:** Define and protect one live invariant for cruise engagement and interdiction based on charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** cruise engagement and interdiction: charge/drop conditions, agility crush, weapon lockout, mass-lock, damage drop, and readable state transitions.

**Inspect:** `src/systems/cruise.js` `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0114 --format prompt`

## JULES-0115 — Boost and dash behavior — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-boost-dash`

**Objective:** Define and protect one live invariant for boost and dash behavior based on tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** boost and dash behavior: tap-versus-hold, energy consumption, disabled states, collision response, and feedback timing.

**Inspect:** `src/systems/flightV3.js` `src/core/flight/propulsionKernel.js` `src/systems/input.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0115 --format prompt`

## JULES-0116 — Massline target acquisition — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-massline-acquisition`

**Objective:** Define and protect one live invariant for Massline target acquisition based on nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js` `src/systems/masslineInputGrammar.js` `src/systems/autoTargetAssist.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0116 --format prompt`

## JULES-0117 — Massline target acquisition — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-acquisition`

**Objective:** Probe Massline target acquisition at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** Massline target acquisition: nearest/explicit target choice, line-of-sight, range, self/passive filtering, preview stability, and Ctrl override.

**Inspect:** `src/combat/attachments.js` `src/systems/masslineInputGrammar.js` `src/systems/autoTargetAssist.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0117 --format prompt`

## JULES-0118 — Massline line control — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-massline-control`

**Objective:** Define and protect one live invariant for Massline line control based on reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js` `src/systems/masslineInputGrammar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0118 --format prompt`

## JULES-0119 — Massline line control — repair an edge case or missing counterplay

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `gameplay-massline-control`

**Objective:** Probe Massline line control at extreme mass, speed, range, angle, target loss, disabled state, crowded contact set, or recovery boundary relevant to reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience. Fix one unfair, incoherent, or stuck edge only when reproduced.

**Context:** Massline line control: reel/pay-out/orbit/pump intent, tap cut, remembered axes, slack catch, and standard-line resilience.

**Inspect:** `src/core/constraints/masslineController.js` `src/systems/masslineInputGrammar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0119 --format prompt`

## JULES-0120 — Impulse charges — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-impulse-charges`

**Objective:** Define and protect one live invariant for impulse charges based on lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** impulse charges: lob/adhere/arm/detonate, self-tail use, radial impulse, friendly fire, cargo count, and cleanup.

**Inspect:** `src/systems/impulseCharges.js` `src/data/impulseCharges.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0120 --format prompt`

## JULES-0121 — Weapon aiming and autofire — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-weapon-aim`

**Objective:** Define and protect one live invariant for weapon aiming and autofire based on player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** weapon aiming and autofire: player 360-degree gimbal, NPC arc, target lead, autofire edges, authorization, and no-shot states.

**Inspect:** `src/systems/weapons.js` `src/systems/aiFireIntent.js` `src/ui/targetPanel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0121 --format prompt`

## JULES-0122 — Countermeasures — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-countermeasures`

**Objective:** Define and protect one live invariant for countermeasures based on decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** countermeasures: decoy spawn, missile retargeting, cooldown, inventory/energy, repeated input, and clear feedback.

**Inspect:** `src/systems/countermeasures.js` `src/systems/weapons.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0122 --format prompt`

## JULES-0123 — Damage triangle readability — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-damage-triangle`

**Objective:** Define and protect one live invariant for damage triangle readability based on energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** damage triangle readability: energy/shield, kinetic/armor, explosive/hull relationships, resist bounds, target bars, and physical hit response.

**Inspect:** `src/combat/damage.js` `src/data/weapons.js` `src/ui/targetPanel.js` `src/render/vfx.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0123 --format prompt`

## JULES-0124 — Combat statuses and subsystem damage — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-status-subsystems`

**Objective:** Define and protect one live invariant for combat statuses and subsystem damage based on stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** combat statuses and subsystem damage: stack/refresh rules, disable effects, repair/clear paths, HUD feedback, and save persistence.

**Inspect:** `src/combat/statuses.js` `src/combat/subsystems.js` `src/systems/ships.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0124 --format prompt`

## JULES-0125 — Tactical perception and contact classification — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ai-perception`

**Objective:** Define and protect one live invariant for tactical perception and contact classification based on visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** tactical perception and contact classification: visibility, hostility, threat, passive actors, lawful patrols, sensor signatures, and stale contact expiry.

**Inspect:** `src/ai/perception.js` `src/systems/aiPorts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0125 --format prompt`

## JULES-0126 — Engagement authority and response windows — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-engagement-authority`

**Objective:** Define and protect one live invariant for engagement authority and response windows based on motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** engagement authority and response windows: motive, trigger, doctrine, leash, jurisdiction, first-fire cap, and fail-closed action authorization.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0126 --format prompt`

## JULES-0127 — Squad formations and leader loss — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-squad-formations`

**Objective:** Define and protect one live invariant for squad formations and leader loss based on wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** squad formations and leader loss: wedge offsets, collision avoidance, leader identity, scatter/morale window, regroup, and role separation.

**Inspect:** `src/ai/squad.js` `src/ai/maneuver.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0127 --format prompt`

## JULES-0128 — Ai maneuver selection — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ai-maneuver`

**Objective:** Define and protect one live invariant for AI maneuver selection based on intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** AI maneuver selection: intercept/orbit/range control, overshoot recovery, mass/agility differences, obstacles, and readable motion.

**Inspect:** `src/ai/shipDecision.js` `src/ai/maneuver.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0128 --format prompt`

## JULES-0129 — Encounter director pacing — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ai-director`

**Objective:** Define and protect one live invariant for encounter director pacing based on pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** encounter director pacing: pressure ramps, threat interpretation, quiet windows, reinforcement requests, player recovery, and no runaway escalation.

**Inspect:** `src/ai/director.js` `src/ai/perception.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0129 --format prompt`

## JULES-0130 — Reinforcement package spawning — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-reinforcements`

**Objective:** Define and protect one live invariant for reinforcement package spawning based on package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** reinforcement package spawning: package composition, spawn distance, authored roles, duplicate requests, player state, and post-wave cleanup.

**Inspect:** `src/systems/aiEncounter.js` `src/data/enemies.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0130 --format prompt`

## JULES-0131 — Flee, morale, and surrender behavior — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-flee-morale`

**Objective:** Define and protect one live invariant for flee, morale, and surrender behavior based on visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** flee, morale, and surrender behavior: visible break-off, cargo dump, leader loss, surrender/flee thresholds, re-engagement, and comms cadence.

**Inspect:** `src/ai/shipDecision.js` `src/systems/aceMemory.js` `src/ui/comms.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0131 --format prompt`

## JULES-0132 — Wingmen — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-wingmen`

**Objective:** Define and protect one live invariant for wingmen based on team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** wingmen: team-0 protection, follow/attack commands, target selection, jump/dock persistence, revive/removal, and map identity.

**Inspect:** `src/systems/wingmen.js` `src/systems/aiPorts.js` `src/ui/radar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0132 --format prompt`

## JULES-0133 — Collision and ramming feel — lock a live behavior invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `gameplay-ramming`

**Objective:** Define and protect one live invariant for collision and ramming feel based on momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling. Use the selected V3/tactical/physics owners and add the narrowest test plus production repair if the invariant currently fails.

**Context:** collision and ramming feel: momentum-scaled damage/trauma, low-speed contacts, friendly collisions, heavy-vs-light asymmetry, and accessibility scaling.

**Inspect:** `src/core/physicsAuthority.js` `src/combat/damage.js` `src/systems/presentationOrchestrator.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0133 --format prompt`
