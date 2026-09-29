# FB-100 — HUD scale and opacity, camera distance, post-processing, sharpen and the voice bus get rows and defaults

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** open
**Seam tags:** seam: gameState.js, seam: settings.js, seam: hudLayout.js
**Write-set:** `src/core/gameState.js`, `src/ui/screens/settings.js`, `src/ui/hudLayout.js`, `src/systems/barkDirector.js`, `test/fb-video-audio-parity.test.mjs`
**Neighbours (extend, never restate):** SFQ-B199, SFQ-I080, SFQ-B225

## The gap
Live but UI-less: `video.chaseClose` (a working tighter chase profile), `video.postFx`, `video.sharpen`,
`video.bloomLevels`, `video.pixelRatioCap`, `video.bloomThreshold`. Missing entirely: HUD scale (only global
`uiScale`), HUD opacity (the pause dim is hardcoded). `barkDirector.js` gates voice on `audio.voice`, which
has no default, no row and no writer; five audio buses live only as `== null ? 0.7` fallbacks. Every mature
title ships these.

## Why this direction
The profile snapshot copies the whole `audio`/`video` subtrees, so any key inside persists for free. Rows use
the existing builders; readers exist for most keys already.

## Mechanism
- Add `+video.hudScale`, `+video.hudOpacity` to `defaultSettings()`, read by `hudLayout.js` as two CSS
  variables; add rows for them and for the six live-but-hidden keys under Video (advanced block).
- Add `audio.voice` and the five bus defaults (engine, ambient, combat, ui, comms) to `defaultSettings().audio`;
  add the voice row.
- Pin that every new key has a reader and round-trips through the profile snapshot.

## Done when
`test/fb-video-audio-parity.test.mjs`: nine new keys default, persist and have readers;
`check-settings-profile-persistence` passes; `graphics-settings-continue-parity.test.mjs` stays green.

## Do not
Do not change any default value that alters today's picture or mix. Do not add a preset. Do not redesign the
settings screen (ORRERY).

## Focus test starting points
- `test/graphics-settings-continue-parity.test.mjs`
- `test/accessibility-settings-parity.test.mjs`
