# FB-126 — Losing window focus can mute the game and pause the sim, each behind its own setting

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: presentationRunner.js, seam: audioSystem.js, seam: gameState.js
**Write-set:** `src/core/presentationRunner.js`, `src/audio/audioSystem.js`, `src/core/gameState.js`, `src/ui/screens/settings.js`, `test/fb-focus-loss-mute-pause.test.mjs`
**Neighbours (extend, never restate):** SFQ-B199, SFQ-I090

## The gap
`input.js` releases held controls on blur and `presentationRunner.js` throttles on `visibilitychange`, but
nothing mutes audio or pauses the sim when the window loses focus. `contextResourceLifecycle.js` already
proves a sim hold through the time-effects ledger (`pauseSimForContextLoss`).

## Why this direction
Two mature options with the mechanism already present for one of them. The hold must use the same ledger so
the sim clock and determinism are untouched.

## Mechanism
- Add `+audio.muteOnFocusLoss` and `+gameplay.pauseOnFocusLoss` to `defaultSettings()` with Settings rows; on
  blur, mute through the master gain (loop state preserved, NXI-206) and hold the sim through the existing
  time-effects minimum ledger; restore on focus.
- Never pause inside the Crucible results or a save write; the hold waits for the boundary.
- Pin both toggles and that a hold during a fight resumes the same tick with identical state.

## Done when
`test/fb-focus-loss-mute-pause.test.mjs`: mute restores loops, pause resumes deterministically;
`context-resource-lifecycle.test.mjs` stays green.

## Do not
Do not advance the sim clock during the hold. Do not destroy loop state on mute. Do not pause the browser-tab
throttling path differently from the Electron path.

## Focus test starting points
- `test/context-resource-lifecycle.test.mjs`
- `test/input-lifecycle.test.mjs`
