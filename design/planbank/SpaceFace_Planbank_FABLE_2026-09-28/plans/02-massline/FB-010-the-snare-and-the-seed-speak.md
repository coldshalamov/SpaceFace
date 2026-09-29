# FB-010 — The transverse snare and the mass seed have voices for arming, catching, warning and collapse

**Kind:** build · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: audioRecipes.js, seam: audioSystem.js, seam: masslineSnares.js, seam: massSeed.js
**Write-set:** `src/data/audioRecipes.js`, `src/audio/audioSystem.js`, `src/render/vfx/actionEventRecipes.js`, `test/fb-snare-seed-voices.test.mjs`

## The gap
`massline:snareArmed`, `massline:snareDeployed`, `massline:snareCut`, `massline:snareEnded` and
`massSeed:deployed`, `massSeed:locking`, `massSeed:locked`, `massSeed:warning`, `massSeed:collapsing`,
`massSeed:collapsed`, `massSeed:tetherCut`, `massSeed:cleared` are all emit-only. `RECIPES` has no snare or
seed ids. The HUD polls their state (`massSeedHud.js`, `masslineHud.js`), so they have an eye and no ear.

## Why this direction
Two deployables with ten silent edges; the fix is recipe authoring on the existing synth voices, not assets.
The seed's warning-then-collapse is the one that matters most: it is a timer the player is standing on.

## Mechanism
- Author synth recipes in `RECIPES`: a snare arm tick, a snare catch is already covered (`massline:snareCaught`
  has VFX), a snare cut twang variant, a seed lock chord (locking→locked rising), a seed warning pulse that
  quickens, and a collapse drop.
- Route the ten events in `audioSystem.js` and add the arm and collapse VFX rows to `actionEventRecipes.js`.
- Pin one recipe per edge and silence when the deployable is gone.

## Done when
`test/fb-snare-seed-voices.test.mjs`: on seed 4242 deploy a seed, latch, wait to warning, let it collapse:
four recipes in order, silence after; snare arm/cut produce two; `mass-seed-adversarial.test.mjs` stays green.

## Do not
Do not add samples. Do not add a UI countdown (the seed HUD exists). Do not change seed timing.

## Focus test starting points
- `test/mass-seed-adversarial.test.mjs`
- Locate snare suites with `rg masslineSnare test/`.
