```yaml
packet: P37
title: The shell — Load, Settings, Pause, Game over, Credits, Photo mode
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P22, P11, P16]
current: [save-load, settings, pause, game-over, credits, photo-mode]
inputs: [design/frontend/direction/approved/frame-settings.png, design/frontend/direction/approved/frame-load.png, design/frontend/direction/approved/frame-game-over.png, design/frontend/direction/approved/crops-controls.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P37-REPORT.md
mutex: [meta-shell]
```

# P37 — The shell screens

## Objective

**Load** to its frame: saves as engraved rows, the focused save's hull on the stage (P20 with the
P16 tiles as the fallback), name at 140, credits as a hero numeral, LOAD / DELETE (hazard) / BACK.
**Settings** to its frame: section keys, engraved rows, the four physical controls (P11 toggle,
slider, stepper, key-bind cell). **Pause** as EDGE over the held world: one word, the flight brief,
the actions as legend keys down the left; HUD dimmed to 38 %. **Game over** to its frame on the
wanted-cold temperature. **Credits** as a POSTER roll over the hangar stage. **Photo mode**:
everything gone but a fine hint that fades.

## Write set

`src/ui/screens/saveLoad.js`, `settings.js`, `pause.js`, `gameOver.js`, `credits.js`,
`src/ui/screens/stageHull.js` (stage handoff), `styles/fh.css`, `styles/orbital.css` (retire).

## Checks and evidence

`npm run check:baseline` · `npm run check:confirm-dialog-safety` · `npm run check:ui-a11y` ·
`node scripts/capture-ui-matrix.mjs --world --headed --only=save-load,settings,pause,game-over,credits,photo-mode
--out=.devshots/frontend/P37` with six populated saves.

## Acceptance

Load, Settings and Game over pass the rubric beside their frames; six saves fit at 1280 without
crushing; every setting is a physical control; pause holds the world.

## The way this gets faked

Settings as label/value rows with native inputs; Load as timestamps; Pause hiding the world.
