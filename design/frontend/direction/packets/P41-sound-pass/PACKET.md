```yaml
packet: P41
title: The sound pass — one mechanical instrument across the interface, and the mute default
lane: CODE
tool: local (the controller, or Codex with the controller reviewing)
dependsOn: [P40]
current: [title, station-dock, flight]
inputs: []
returns: commits + receipt design/frontend/direction/receipts/P41-REPORT.md
mutex: [audio-cues]
```

# P41 — The sound pass

## Objective

Every interaction fires the right P17 cue and nothing else: key press, plate slide, legend on/off,
confirm, deny, open, back, tab, dock, undock, wanted, Crucible enter, tick. Gains set so the whole
interface sounds like one instrument at one distance. The game currently **ships muted by default**
(`src/core/gameState.js` `audio.muted: true`); this packet proposes and, if the owner agrees,
implements an unmuted default with a first-run volume prompt — an A-list game is not silent on
first boot. Record the owner's answer in the receipt.

## Write set

`src/ui/kit/sound.js`, `src/data/audioRecipes.js` (cue gains), `src/audio/audioSystem.js`
(`AUDIO_CUE_TO_RECIPE` only), `src/core/gameState.js` (the default, if approved), the screen
modules' cue calls.

## Checks and evidence

`npm run check:baseline` · `npm run check:one-voice` · the save-schema and determinism goldens
untouched (`check:sim`, `check:save-reload`) · an audio capture of a boot → dock → undock → wanted
walk with `window.__SF_CAPTURE_AUDIO = true`.

## Acceptance

Every cue in the table plays where the spec says; no hover sound; the mute decision recorded.
