<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# UI, UX, input reachability, and accessibility

Make every player-facing surface reachable, stable, legible, responsive, and consistent with the instrument grammar.

**Tasks:** 100 · **Range:** `JULES-0501`–`JULES-0600`

## JULES-0501 — Main menu and new game entry — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-main-menu`

**Objective:** Audit main menu and New Game entry using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** main menu and New Game entry: first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.

**Inspect:** `src/main.js`, `src/ui/uiRoot.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0501 --format prompt`

## JULES-0502 — Main menu and new game entry — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-main-menu`

**Objective:** Exercise main menu and New Game entry across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** main menu and New Game entry: first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.

**Inspect:** `src/main.js`, `src/ui/uiRoot.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise main menu and New Game entry on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0502 --format prompt`

## JULES-0503 — Main menu and new game entry — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-main-menu`

**Objective:** Test main menu and New Game entry at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** main menu and New Game entry: first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.

**Inspect:** `src/main.js`, `src/ui/uiRoot.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise main menu and New Game entry on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0503 --format prompt`

## JULES-0504 — Main menu and new game entry — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-main-menu`

**Objective:** Review main menu and New Game entry against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** main menu and New Game entry: first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.

**Inspect:** `src/main.js`, `src/ui/uiRoot.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise main menu and New Game entry on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0504 --format prompt`

## JULES-0505 — Main menu and new game entry — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-main-menu`

**Objective:** Exercise main menu and New Game entry with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** main menu and New Game entry: first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.

**Inspect:** `src/main.js`, `src/ui/uiRoot.js`, `src/ui/screens/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise main menu and New Game entry on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to first-run clarity, Continue/New Game state, keyboard/gamepad entry, loading feedback, and repeated click protection.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0505 --format prompt`

## JULES-0506 — Flight hud — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-hud`

**Objective:** Audit flight HUD using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** flight HUD: attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0506 --format prompt`

## JULES-0507 — Flight hud — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-hud`

**Objective:** Exercise flight HUD across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** flight HUD: attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise flight HUD on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0507 --format prompt`

## JULES-0508 — Flight hud — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-hud`

**Objective:** Test flight HUD at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** flight HUD: attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise flight HUD on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0508 --format prompt`

## JULES-0509 — Flight hud — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-hud`

**Objective:** Review flight HUD against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** flight HUD: attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise flight HUD on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0509 --format prompt`

## JULES-0510 — Flight hud — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-hud`

**Objective:** Exercise flight HUD with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** flight HUD: attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise flight HUD on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to attention hierarchy, speed/flight telemetry, objectives, control clutter, legibility, and stale state.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0510 --format prompt`

## JULES-0511 — Radar/minimap — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-radar`

**Objective:** Audit radar/minimap using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** radar/minimap: player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0511 --format prompt`

## JULES-0512 — Radar/minimap — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-radar`

**Objective:** Exercise radar/minimap across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** radar/minimap: player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise radar/minimap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0512 --format prompt`

## JULES-0513 — Radar/minimap — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-radar`

**Objective:** Test radar/minimap at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** radar/minimap: player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise radar/minimap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0513 --format prompt`

## JULES-0514 — Radar/minimap — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-radar`

**Objective:** Review radar/minimap against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** radar/minimap: player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise radar/minimap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0514 --format prompt`

## JULES-0515 — Radar/minimap — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-radar`

**Objective:** Exercise radar/minimap with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** radar/minimap: player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise radar/minimap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player glyph, IFF roles, waypoint salience, overlap, offscreen direction, and bloom-free crispness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0515 --format prompt`

## JULES-0516 — Target panel — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-target-panel`

**Objective:** Audit target panel using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** target panel: shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0516 --format prompt`

## JULES-0517 — Target panel — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-target-panel`

**Objective:** Exercise target panel across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** target panel: shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise target panel on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0517 --format prompt`

## JULES-0518 — Target panel — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-target-panel`

**Objective:** Test target panel at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** target panel: shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise target panel on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0518 --format prompt`

## JULES-0519 — Target panel — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `ui-target-panel`

**Objective:** Review target panel against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** target panel: shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise target panel on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0519 --format prompt`

## JULES-0520 — Target panel — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-target-panel`

**Objective:** Exercise target panel with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** target panel: shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.

**Inspect:** `src/ui/targetPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise target panel on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to shield/armor/hull hierarchy, target identity, status legibility, stale target cleanup, and compactness.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0520 --format prompt`

## JULES-0521 — Comms and one-voice queue — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-comms`

**Objective:** Audit comms and one-voice queue using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** comms and one-voice queue: priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.

**Inspect:** `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0521 --format prompt`

## JULES-0522 — Comms and one-voice queue — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-comms`

**Objective:** Exercise comms and one-voice queue across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** comms and one-voice queue: priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.

**Inspect:** `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise comms and one-voice queue on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0522 --format prompt`

## JULES-0523 — Comms and one-voice queue — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-comms`

**Objective:** Test comms and one-voice queue at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** comms and one-voice queue: priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.

**Inspect:** `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise comms and one-voice queue on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0523 --format prompt`

## JULES-0524 — Comms and one-voice queue — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `ui-comms`

**Objective:** Review comms and one-voice queue against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** comms and one-voice queue: priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.

**Inspect:** `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise comms and one-voice queue on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0524 --format prompt`

## JULES-0525 — Comms and one-voice queue — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-comms`

**Objective:** Exercise comms and one-voice queue with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** comms and one-voice queue: priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.

**Inspect:** `src/ui/comms.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise comms and one-voice queue on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority, dedupe, stale-drop, twelve-word copy, accessibility equivalent, and silence cadence.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0525 --format prompt`

## JULES-0526 — Alerts, toasts, and floating feedback — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-alerts`

**Objective:** Audit alerts, toasts, and floating feedback using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** alerts, toasts, and floating feedback: priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.

**Inspect:** `src/ui/alerts.js`, `src/ui/toasts.js`, `src/ui/floatingText.js`, `src/ui/damageIndicators.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0526 --format prompt`

## JULES-0527 — Alerts, toasts, and floating feedback — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-alerts`

**Objective:** Exercise alerts, toasts, and floating feedback across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** alerts, toasts, and floating feedback: priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.

**Inspect:** `src/ui/alerts.js`, `src/ui/toasts.js`, `src/ui/floatingText.js`, `src/ui/damageIndicators.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise alerts, toasts, and floating feedback on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0527 --format prompt`

## JULES-0528 — Alerts, toasts, and floating feedback — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-alerts`

**Objective:** Test alerts, toasts, and floating feedback at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** alerts, toasts, and floating feedback: priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.

**Inspect:** `src/ui/alerts.js`, `src/ui/toasts.js`, `src/ui/floatingText.js`, `src/ui/damageIndicators.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise alerts, toasts, and floating feedback on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0528 --format prompt`

## JULES-0529 — Alerts, toasts, and floating feedback — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `ui-alerts`

**Objective:** Review alerts, toasts, and floating feedback against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** alerts, toasts, and floating feedback: priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.

**Inspect:** `src/ui/alerts.js`, `src/ui/toasts.js`, `src/ui/floatingText.js`, `src/ui/damageIndicators.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise alerts, toasts, and floating feedback on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0529 --format prompt`

## JULES-0530 — Alerts, toasts, and floating feedback — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-alerts`

**Objective:** Exercise alerts, toasts, and floating feedback with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** alerts, toasts, and floating feedback: priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.

**Inspect:** `src/ui/alerts.js`, `src/ui/toasts.js`, `src/ui/floatingText.js`, `src/ui/damageIndicators.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise alerts, toasts, and floating feedback on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to priority collisions, duplicate notifications, offscreen placement, reduced motion, timeout ownership, and information overload.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0530 --format prompt`

## JULES-0531 — Station hub — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-station-hub`

**Objective:** Audit station hub using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** station hub: primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.

**Inspect:** `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise station hub on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0531 --format prompt`

## JULES-0532 — Station hub — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-station-hub`

**Objective:** Exercise station hub across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** station hub: primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.

**Inspect:** `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise station hub on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0532 --format prompt`

## JULES-0533 — Station hub — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-station-hub`

**Objective:** Test station hub at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** station hub: primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.

**Inspect:** `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise station hub on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0533 --format prompt`

## JULES-0534 — Station hub — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-station-hub`

**Objective:** Review station hub against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** station hub: primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.

**Inspect:** `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise station hub on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0534 --format prompt`

## JULES-0535 — Station hub — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-station-hub`

**Objective:** Exercise station hub with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** station hub: primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.

**Inspect:** `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise station hub on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to primary actions, visual hierarchy, keyboard traversal, stale station data, small-window layout, and dock/undock flow.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0535 --format prompt`

## JULES-0536 — Market screen — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-market`

**Objective:** Audit market screen using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** market screen: buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.

**Inspect:** `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise market screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0536 --format prompt`

## JULES-0537 — Market screen — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-market`

**Objective:** Exercise market screen across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** market screen: buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.

**Inspect:** `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise market screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0537 --format prompt`

## JULES-0538 — Market screen — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-market`

**Objective:** Test market screen at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** market screen: buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.

**Inspect:** `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise market screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0538 --format prompt`

## JULES-0539 — Market screen — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-market`

**Objective:** Review market screen against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** market screen: buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.

**Inspect:** `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise market screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0539 --format prompt`

## JULES-0540 — Market screen — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-market`

**Objective:** Exercise market screen with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** market screen: buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.

**Inspect:** `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise market screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to buy/sell clarity, known-vs-live prices, quantity controls, transaction feedback, focus, and empty/full states.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0540 --format prompt`

## JULES-0541 — Shipyard screen — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-shipyard`

**Objective:** Audit shipyard screen using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** shipyard screen: ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.

**Inspect:** `src/ui/screens/shipyard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise shipyard screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0541 --format prompt`

## JULES-0542 — Shipyard screen — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `ui-shipyard`

**Objective:** Exercise shipyard screen across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** shipyard screen: ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.

**Inspect:** `src/ui/screens/shipyard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise shipyard screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0542 --format prompt`

## JULES-0543 — Shipyard screen — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `ui-shipyard`

**Objective:** Test shipyard screen at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** shipyard screen: ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.

**Inspect:** `src/ui/screens/shipyard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise shipyard screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0543 --format prompt`

## JULES-0544 — Shipyard screen — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `ui-shipyard`

**Objective:** Review shipyard screen against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** shipyard screen: ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.

**Inspect:** `src/ui/screens/shipyard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise shipyard screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0544 --format prompt`

## JULES-0545 — Shipyard screen — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `ui-shipyard`

**Objective:** Exercise shipyard screen with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** shipyard screen: ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.

**Inspect:** `src/ui/screens/shipyard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise shipyard screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to ship comparison, affordability, current ship identity, preview/live parity, keyboard reach, and purchase confirmation.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0545 --format prompt`

## JULES-0546 — Outfitting screen — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-outfitting`

**Objective:** Audit outfitting screen using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** outfitting screen: slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.

**Inspect:** `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise outfitting screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0546 --format prompt`

## JULES-0547 — Outfitting screen — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-outfitting`

**Objective:** Exercise outfitting screen across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** outfitting screen: slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.

**Inspect:** `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise outfitting screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0547 --format prompt`

## JULES-0548 — Outfitting screen — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-outfitting`

**Objective:** Test outfitting screen at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** outfitting screen: slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.

**Inspect:** `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise outfitting screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0548 --format prompt`

## JULES-0549 — Outfitting screen — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-outfitting`

**Objective:** Review outfitting screen against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** outfitting screen: slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.

**Inspect:** `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise outfitting screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0549 --format prompt`

## JULES-0550 — Outfitting screen — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-outfitting`

**Objective:** Exercise outfitting screen with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** outfitting screen: slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.

**Inspect:** `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise outfitting screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to slot compatibility, stat deltas, invalid drop feedback, undo/rollback, keyboard reach, and compact comparison.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0550 --format prompt`

## JULES-0551 — Galaxy starmap — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-starmap`

**Objective:** Audit galaxy starmap using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** galaxy starmap: search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0551 --format prompt`

## JULES-0552 — Galaxy starmap — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-starmap`

**Objective:** Exercise galaxy starmap across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** galaxy starmap: search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise galaxy starmap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0552 --format prompt`

## JULES-0553 — Galaxy starmap — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-starmap`

**Objective:** Test galaxy starmap at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** galaxy starmap: search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise galaxy starmap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0553 --format prompt`

## JULES-0554 — Galaxy starmap — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-starmap`

**Objective:** Review galaxy starmap against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** galaxy starmap: search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise galaxy starmap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0554 --format prompt`

## JULES-0555 — Galaxy starmap — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-starmap`

**Objective:** Exercise galaxy starmap with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** galaxy starmap: search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.

**Inspect:** `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise galaxy starmap on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to search, route ribbon, selection confidence, waypoint identity, camera controls, and never-lost context.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:map-never-lost`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0555 --format prompt`

## JULES-0556 — Local map — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-local-map`

**Objective:** Audit local map using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** local map: player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.

**Inspect:** `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0556 --format prompt`

## JULES-0557 — Local map — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-local-map`

**Objective:** Exercise local map across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** local map: player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.

**Inspect:** `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise local map on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0557 --format prompt`

## JULES-0558 — Local map — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-local-map`

**Objective:** Test local map at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** local map: player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.

**Inspect:** `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise local map on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0558 --format prompt`

## JULES-0559 — Local map — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-local-map`

**Objective:** Review local map against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** local map: player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.

**Inspect:** `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise local map on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0559 --format prompt`

## JULES-0560 — Local map — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-local-map`

**Objective:** Exercise local map with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** local map: player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.

**Inspect:** `src/ui/screens/localmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise local map on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to player orientation, nearby role differentiation, route/waypoint cues, zoom, clutter, and parity with starmap.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0560 --format prompt`

## JULES-0561 — Technology tree — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-tech-tree`

**Objective:** Audit technology tree using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** technology tree: dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.

**Inspect:** `src/ui/screens/techTree.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0561 --format prompt`

## JULES-0562 — Technology tree — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-tech-tree`

**Objective:** Exercise technology tree across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** technology tree: dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.

**Inspect:** `src/ui/screens/techTree.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise technology tree on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0562 --format prompt`

## JULES-0563 — Technology tree — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-tech-tree`

**Objective:** Test technology tree at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** technology tree: dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.

**Inspect:** `src/ui/screens/techTree.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise technology tree on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0563 --format prompt`

## JULES-0564 — Technology tree — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `ui-tech-tree`

**Objective:** Review technology tree against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** technology tree: dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.

**Inspect:** `src/ui/screens/techTree.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise technology tree on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0564 --format prompt`

## JULES-0565 — Technology tree — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-tech-tree`

**Objective:** Exercise technology tree with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** technology tree: dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.

**Inspect:** `src/ui/screens/techTree.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise technology tree on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to dependency readability, locked reasons, current currency/resources, keyboard navigation, zoom/pan, and focus restoration.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0565 --format prompt`

## JULES-0566 — Mission log — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `ui-mission-log`

**Objective:** Audit mission log using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** mission log: active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.

**Inspect:** `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0566 --format prompt`

## JULES-0567 — Mission log — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-mission-log`

**Objective:** Exercise mission log across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** mission log: active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.

**Inspect:** `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise mission log on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0567 --format prompt`

## JULES-0568 — Mission log — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-mission-log`

**Objective:** Test mission log at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** mission log: active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.

**Inspect:** `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise mission log on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0568 --format prompt`

## JULES-0569 — Mission log — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `ui-mission-log`

**Objective:** Review mission log against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** mission log: active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.

**Inspect:** `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise mission log on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0569 --format prompt`

## JULES-0570 — Mission log — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `ui-mission-log`

**Objective:** Exercise mission log with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** mission log: active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.

**Inspect:** `src/ui/screens/missionLog.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise mission log on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active/completed separation, objective clarity, waypoint action, expired/canceled states, keyboard reach, and stale mission removal.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0570 --format prompt`

## JULES-0571 — Settings screen — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-settings`

**Objective:** Audit settings screen using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** settings screen: binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.

**Inspect:** `src/ui/screens/settings.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0571 --format prompt`

## JULES-0572 — Settings screen — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-settings`

**Objective:** Exercise settings screen across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** settings screen: binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.

**Inspect:** `src/ui/screens/settings.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise settings screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0572 --format prompt`

## JULES-0573 — Settings screen — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-settings`

**Objective:** Test settings screen at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** settings screen: binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.

**Inspect:** `src/ui/screens/settings.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise settings screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0573 --format prompt`

## JULES-0574 — Settings screen — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-settings`

**Objective:** Review settings screen against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** settings screen: binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.

**Inspect:** `src/ui/screens/settings.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise settings screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0574 --format prompt`

## JULES-0575 — Settings screen — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-settings`

**Objective:** Exercise settings screen with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** settings screen: binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.

**Inspect:** `src/ui/screens/settings.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise settings screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to binding labels, flight-model selection, accessibility toggles, unsaved changes, defaults, and input-device parity.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0575 --format prompt`

## JULES-0576 — Asteroid works screen — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-asteroid-works`

**Objective:** Audit Asteroid Works screen using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** Asteroid Works screen: board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.

**Inspect:** `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise Asteroid Works screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Every interactive action in the scoped surface is reachable without a mouse.
- Focus order follows visual/task order and remains visible without excessive decoration.
- Back/cancel and confirm semantics are consistent across repeated opens and nested modals.
- Control prompts reflect the active scheme rather than hard-coded keys.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0576 --format prompt`

## JULES-0577 — Asteroid works screen — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-asteroid-works`

**Objective:** Exercise Asteroid Works screen across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** Asteroid Works screen: board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.

**Inspect:** `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise Asteroid Works screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0577 --format prompt`

## JULES-0578 — Asteroid works screen — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-asteroid-works`

**Objective:** Test Asteroid Works screen at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** Asteroid Works screen: board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.

**Inspect:** `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise Asteroid Works screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0578 --format prompt`

## JULES-0579 — Asteroid works screen — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-asteroid-works`

**Objective:** Review Asteroid Works screen against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** Asteroid Works screen: board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.

**Inspect:** `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise Asteroid Works screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0579 --format prompt`

## JULES-0580 — Asteroid works screen — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-asteroid-works`

**Objective:** Exercise Asteroid Works screen with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** Asteroid Works screen: board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.

**Inspect:** `src/ui/screens/drill.js`, `styles/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise Asteroid Works screen on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to board sovereignty, one-cell intent, hover lens, warm visual grammar, fifteen-word cap, and site/drive zoom registers.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:asteroid-theater`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0580 --format prompt`

## JULES-0581 — Pause and modal stack — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-pause-modals`

**Objective:** Audit pause and modal stack using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** pause and modal stack: nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.

**Inspect:** `src/ui/screenManager.js`, `src/ui/uiRoot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0581 --format prompt`

## JULES-0582 — Pause and modal stack — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-pause-modals`

**Objective:** Exercise pause and modal stack across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** pause and modal stack: nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.

**Inspect:** `src/ui/screenManager.js`, `src/ui/uiRoot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise pause and modal stack on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0582 --format prompt`

## JULES-0583 — Pause and modal stack — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-pause-modals`

**Objective:** Test pause and modal stack at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** pause and modal stack: nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.

**Inspect:** `src/ui/screenManager.js`, `src/ui/uiRoot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise pause and modal stack on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0583 --format prompt`

## JULES-0584 — Pause and modal stack — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-pause-modals`

**Objective:** Review pause and modal stack against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** pause and modal stack: nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.

**Inspect:** `src/ui/screenManager.js`, `src/ui/uiRoot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise pause and modal stack on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0584 --format prompt`

## JULES-0585 — Pause and modal stack — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-pause-modals`

**Objective:** Exercise pause and modal stack with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** pause and modal stack: nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.

**Inspect:** `src/ui/screenManager.js`, `src/ui/uiRoot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise pause and modal stack on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to nested pause ownership, Escape behavior, modal backdrop, focus return, gamepad close, and exception recovery.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0585 --format prompt`

## JULES-0586 — Control prompts and rebinding — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-control-prompts`

**Objective:** Audit control prompts and rebinding using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** control prompts and rebinding: active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.

**Inspect:** `src/ui/controlPrompts.js`, `src/ui/bindings.js`, `src/ui/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0586 --format prompt`

## JULES-0587 — Control prompts and rebinding — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-control-prompts`

**Objective:** Exercise control prompts and rebinding across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** control prompts and rebinding: active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.

**Inspect:** `src/ui/controlPrompts.js`, `src/ui/bindings.js`, `src/ui/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise control prompts and rebinding on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0587 --format prompt`

## JULES-0588 — Control prompts and rebinding — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-control-prompts`

**Objective:** Test control prompts and rebinding at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** control prompts and rebinding: active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.

**Inspect:** `src/ui/controlPrompts.js`, `src/ui/bindings.js`, `src/ui/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise control prompts and rebinding on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0588 --format prompt`

## JULES-0589 — Control prompts and rebinding — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-control-prompts`

**Objective:** Review control prompts and rebinding against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** control prompts and rebinding: active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.

**Inspect:** `src/ui/controlPrompts.js`, `src/ui/bindings.js`, `src/ui/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise control prompts and rebinding on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0589 --format prompt`

## JULES-0590 — Control prompts and rebinding — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-control-prompts`

**Objective:** Exercise control prompts and rebinding with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** control prompts and rebinding: active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.

**Inspect:** `src/ui/controlPrompts.js`, `src/ui/bindings.js`, `src/ui/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise control prompts and rebinding on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to active scheme/device labels, remapped key display, conflicts, localization-safe composition, and stale prompts.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0590 --format prompt`

## JULES-0591 — Accessibility controls — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-accessibility`

**Objective:** Audit accessibility controls using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** accessibility controls: motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.

**Inspect:** `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0591 --format prompt`

## JULES-0592 — Accessibility controls — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-accessibility`

**Objective:** Exercise accessibility controls across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** accessibility controls: motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.

**Inspect:** `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise accessibility controls on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0592 --format prompt`

## JULES-0593 — Accessibility controls — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-accessibility`

**Objective:** Test accessibility controls at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** accessibility controls: motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.

**Inspect:** `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise accessibility controls on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0593 --format prompt`

## JULES-0594 — Accessibility controls — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-accessibility`

**Objective:** Review accessibility controls against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** accessibility controls: motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.

**Inspect:** `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise accessibility controls on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0594 --format prompt`

## JULES-0595 — Accessibility controls — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-accessibility`

**Objective:** Exercise accessibility controls with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** accessibility controls: motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.

**Inspect:** `src/ui/accessibility.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise accessibility controls on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to motionReduce, flashReduce, contrast, cue equivalence, persistence, runtime toggle, and effects that bypass the multiplier.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0595 --format prompt`

## JULES-0596 — Responsive ui and style tokens — complete keyboard and gamepad reachability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-responsive-styles`

**Objective:** Audit responsive UI and style tokens using keyboard-only and gamepad-equivalent navigation. Repair unreachable actions, ambiguous focus order, missing back/confirm behavior, or stale prompts while preserving pointer use.

**Context:** responsive UI and style tokens: small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.

**Inspect:** `styles/`, `index.html`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0596 --format prompt`

## JULES-0597 — Responsive ui and style tokens — stabilize focus and pointer lifecycle

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-responsive-styles`

**Objective:** Exercise responsive UI and style tokens across open, close, reopen, route change, pointer capture, modal layering, and rapid activation. Fix one demonstrated focus trap, click-through, stale handler, or duplicate-action defect.

**Context:** responsive UI and style tokens: small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.

**Inspect:** `styles/`, `index.html`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise responsive UI and style tokens on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Opening chooses a deliberate focus target and closing restores focus to a valid owner.
- Hidden/covered elements cannot receive pointer or keyboard activation.
- Repeated mounting does not duplicate listeners or actions.
- The fix works for both browser and Electron on the shared game route.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0597 --format prompt`

## JULES-0598 — Responsive ui and style tokens — harden responsive and text-scale behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-responsive-styles`

**Objective:** Test responsive UI and style tokens at representative small/large windows, high text scale, and long localized-style strings. Repair clipping, overlap, off-screen controls, unreadable density, or pointer-target shrinkage.

**Context:** responsive UI and style tokens: small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.

**Inspect:** `styles/`, `index.html`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise responsive UI and style tokens on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Primary actions and critical state remain visible and operable at the repository’s supported minimum viewport.
- Text can grow without covering irreplaceable gameplay information or forcing horizontal page scroll.
- Tap/click targets remain usable and no solution relies on truncating critical meaning.
- The change follows existing design tokens and screen grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0598 --format prompt`

## JULES-0599 — Responsive ui and style tokens — sharpen hierarchy, copy, and state semantics

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `ui-responsive-styles`

**Objective:** Review responsive UI and style tokens against ordinary-player questions: where am I, what matters now, what can I do, and what changed. Make one bounded information-hierarchy or copy/state correction grounded in live data.

**Context:** responsive UI and style tokens: small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.

**Inspect:** `styles/`, `index.html`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise responsive UI and style tokens on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- The surface distinguishes identity, status, threat/opportunity, selection, and disabled reasons without relying on subtle color alone.
- Copy is concise, concrete, and generated from canonical state rather than duplicated guesses.
- Transient messaging does not compete with persistent navigation or objective context.
- The change avoids generic card-grid chrome and obeys the instrument grammar.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0599 --format prompt`

## JULES-0600 — Responsive ui and style tokens — protect reduced-motion and repeated-open behavior

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-responsive-styles`

**Objective:** Exercise responsive UI and style tokens with motionReduce/flashReduce, pause/slow-time, and repeated open-close cycles. Repair animation, flashing, timer, or transition behavior that becomes inaccessible or leaks state.

**Context:** responsive UI and style tokens: small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.

**Inspect:** `styles/`, `index.html`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `src/ui/AGENTS.md`, `styles/AGENTS.md`, `design/frontend/INSTRUMENT_GRAMMAR.md`

**Work:**
1. Open and exercise responsive UI and style tokens on the ordinary route at a normal and constrained window.
2. Inspect canonical state, input ownership, focus/pointer lifecycle, and the instrument grammar relevant to small windows, 125–200% text scaling, safe-area insets, overflow, pointer targets, color/type tokens, and z-layer contract.
3. Implement one complete bounded correction and add focused behavioral coverage where practical.
4. Verify keyboard, pointer, repeated-open, and relevant accessibility state without restyling unrelated screens.

**Acceptance:**
- Essential state change remains perceivable with motion and flash reductions enabled.
- Animations stop, settle, or reduce deterministically on close/pause instead of continuing behind the screen.
- Repeated cycles do not accumulate DOM, timers, listeners, or stale visual state.
- The ordinary presentation remains intact; accessibility is not implemented as a blanket style downgrade.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE if the scoped surface already satisfies the exact acceptance criteria. Do not make taste-only restyling or generic card/chrome changes.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0600 --format prompt`
