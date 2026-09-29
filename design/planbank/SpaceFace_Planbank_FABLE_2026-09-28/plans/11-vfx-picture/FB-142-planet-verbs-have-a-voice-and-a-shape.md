# FB-142 — Skimming, harvesting, plunging and the recovery burn at the Anvil have voices and cues

**Kind:** wire · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: planetRuntime.js, seam: worldCueRecipes.js, seam: audioSystem.js
**Write-set:** `src/systems/planetRuntime.js`, `src/render/vfx/worldCueRecipes.js`, `src/audio/audioSystem.js`, `test/fb-planet-verbs-cues.test.mjs`
**Neighbours (extend, never restate):** SFQ-B187

## The gap
Planets are on in production (`PRODUCTION_FEATURES.planets.enabled`), the Anvil has a band state machine, skim
harvest and staged reentry, and `planet:harvest`, `planet:harvestDenied`, `planet:collector`,
`planet:plungeStage` and `planet:recoveryBurn` are emitted with no listener. The HUD polls planet state
(`planetHud.js`); the ear and the picture get nothing.

## Why this direction
The travel cue family is the precedent (nine composed cues); five planet variants and five audio routes make a
whole feature audible.

## Mechanism
- Add planet variants to `worldCueRecipes.js` (skim intake, harvest deposit, plunge stage ring, recovery burn
  plume) and route the five events; deny goes to the refusal voice.
- Pin one cue per event on a seed-4242 skim→plunge→recover script.

## Done when
`test/fb-planet-verbs-cues.test.mjs`: five events, five cues, deny routed to the refusal voice;
`planet-vertical.test.mjs` stays green.

## Do not
Do not change band physics. Do not add particles beyond the cue budgets.

## Focus test starting points
- `test/planet-vertical.test.mjs`
- `test/depth-program-w1-planet-states.test.mjs`
- `test/world-cue-recipes.test.mjs`
