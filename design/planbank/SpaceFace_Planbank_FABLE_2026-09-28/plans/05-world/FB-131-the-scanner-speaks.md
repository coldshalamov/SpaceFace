# FB-131 — A ghost that escapes, a bearing that lands and a wreck that reveals each have a voice and a mark

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: scanner.js, seam: audioSystem.js, seam: worldCueRecipes.js
**Write-set:** `src/systems/scanner.js`, `src/audio/audioSystem.js`, `src/render/vfx/worldCueRecipes.js`, `test/fb-scanner-speaks.test.mjs`
**Neighbours (extend, never restate):** SF-124, SFQ-B163

## The gap
`scanner:ghostEscaped`, `anomaly:bearing`, `band:bearingReceipt`, `scan:wreckRevealed` and `scan:debrisCache`
are emitted with no listener. Seven scan voices exist for the pulse and classification stages; the three most
consequential scanner outcomes (a contact slipped away, a bearing counted toward a fix, a wreck opened its
story) are silent and unmarked.

## Why this direction
The survey cue family in `worldCueRecipes.js` already composes pulse/resolved/classified; three variants and
three recipe routes close it.

## Mechanism
- Add `survey-escaped`, `survey-bearing` (pitched by bearing count toward the required pings) and
  `survey-revealed` variants to the world cue recipes and route the five events.
- Play the bearing ping through the existing scan voice at a pitch step per bearing; the escape gets a falling
  tone and the contact list note.
- Pin one cue per event on a seed-4242 anomaly triangulation and a ghost escape.

## Done when
`test/fb-scanner-speaks.test.mjs`: five events, five cues, bearing pitch rises with count;
`world-cue-recipes.test.mjs` stays green.

## Do not
Do not reveal the anomaly position before the required bearings. Do not add a scanner screen.

## Focus test starting points
- `test/world-cue-recipes.test.mjs`
- `test/ghost-bearing-choice.test.mjs`
- `test/seam-scan-reveal.test.mjs`
