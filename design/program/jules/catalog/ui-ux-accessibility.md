<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# UI, UX, input reachability, and accessibility

Make every player-facing surface reachable, stable, legible, responsive, and consistent with the instrument grammar.

**Tasks:** 15 · **Range:** `JULES-0097`–`JULES-0111`

## JULES-0097 — Main menu and new game entry — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-main-menu`

**Objective:** Audit main menu and New Game entry using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** main menu and New Game entry: first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.

**Inspect:** `src/main.js` `src/ui/uiRoot.js` `src/ui/screens/`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise main menu and New Game entry on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0097 --format prompt`

## JULES-0098 — Flight hud — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-hud`

**Objective:** Audit flight HUD using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** flight HUD: attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.

**Inspect:** `src/ui/hud.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise flight HUD on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0098 --format prompt`

## JULES-0099 — Radar/minimap — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-radar`

**Objective:** Audit radar/minimap using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** radar/minimap: player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.

**Inspect:** `src/ui/radar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise radar/minimap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0099 --format prompt`

## JULES-0100 — Target panel — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-target-panel`

**Objective:** Audit target panel using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** target panel: shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise target panel on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0100 --format prompt`

## JULES-0101 — Comms and one-voice queue — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-comms`

**Objective:** Audit comms and one-voice queue using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** comms and one-voice queue: priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.

**Inspect:** `src/ui/comms.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise comms and one-voice queue on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0101 --format prompt`

## JULES-0102 — Alerts, toasts, and floating feedback — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-alerts`

**Objective:** Audit alerts, toasts, and floating feedback using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** alerts, toasts, and floating feedback: priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.

**Inspect:** `src/ui/alerts.js` `src/ui/toasts.js` `src/ui/floatingText.js` `src/ui/damageIndicators.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise alerts, toasts, and floating feedback on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0102 --format prompt`

## JULES-0103 — Galaxy starmap — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-starmap`

**Objective:** Audit galaxy starmap using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** galaxy starmap: search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise galaxy starmap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0103 --format prompt`

## JULES-0104 — Local map — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-local-map`

**Objective:** Audit local map using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** local map: player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.

**Inspect:** `src/ui/screens/localmap.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise local map on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0104 --format prompt`

## JULES-0105 — Technology tree — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-tech-tree`

**Objective:** Audit technology tree using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** technology tree: dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.

**Inspect:** `src/ui/screens/techTree.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise technology tree on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0105 --format prompt`

## JULES-0106 — Mission log — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-mission-log`

**Objective:** Audit mission log using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** mission log: active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.

**Inspect:** `src/ui/screens/missionLog.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise mission log on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0106 --format prompt`

## JULES-0107 — Settings screen — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-settings`

**Objective:** Audit settings screen using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** settings screen: binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.

**Inspect:** `src/ui/screens/settings.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise settings screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0107 --format prompt`

## JULES-0108 — Pause and modal stack — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-pause-modals`

**Objective:** Audit pause and modal stack using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** pause and modal stack: nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.

**Inspect:** `src/ui/screenManager.js` `src/ui/uiRoot.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise pause and modal stack on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0108 --format prompt`

## JULES-0109 — Control prompts and rebinding — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-control-prompts`

**Objective:** Audit control prompts and rebinding using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** control prompts and rebinding: active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.

**Inspect:** `src/ui/controlPrompts.js` `src/ui/bindings.js` `src/ui/input.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise control prompts and rebinding on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0109 --format prompt`

## JULES-0110 — Accessibility controls — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-accessibility`

**Objective:** Audit accessibility controls using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** accessibility controls: motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.

**Inspect:** `src/ui/accessibility.js`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise accessibility controls on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0110 --format prompt`

## JULES-0111 — Responsive ui and style tokens — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-responsive-styles`

**Objective:** Audit responsive UI and style tokens using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** responsive UI and style tokens: small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.

**Inspect:** `styles/` `index.html`

**Read first:** `build_map.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise responsive UI and style tokens on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0111 --format prompt`
