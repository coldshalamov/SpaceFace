# FB-077 — Every presentation cue declares its reduced-motion form, and no light is deleted outright

**Kind:** deepening · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: cueRecipes.js, seam: vfxAccessibility.js
**Write-set:** `src/presentation/cueRecipes.js`, `src/render/vfxAccessibility.js`, `test/fb-reduced-cue-modes.test.mjs`
**Neighbours (extend, never restate):** SFQ-B226, SFQ-I084, NXI-196, SF-206, SF-254

## The gap
`REDUCED_CUE_MODES` (`static_dim`, `slow`, `caption_only`, `unchanged`) is a proper vocabulary, and 3 of 85
recipes declare one; the other 82 fall through a global scaler. `vfxAccessibility.js` sets
`eventLightPeakScale: 0` under reduced motion, so any cue whose only non-particle channel is its light
vanishes silently. Adjacent to SF-206/SF-254 (one effect keeps force information; mechanical timing survives);
this is the data sweep those two assume.

## Why this direction
A second global scaler was rejected; the per-recipe field is optional by design and coverage is a data task.
The light floor copies the trade `flashMinLife` already makes: hold a dim light longer rather than remove it.

## Mechanism
- Declare a `+reducedMode` on all 85 recipes; the causal families' `*Reduced` counts already show the intended
  shape (keep silhouette and layout, drop count).
- Set the reduced event-light floor to 0.1 with a longer hold, mirroring the flash rule.
- Add a recipe assertion so a new recipe without `+reducedMode` fails the test.

## Done when
`test/fb-reduced-cue-modes.test.mjs`: 85/85 recipes declare a mode; the seed-4242 Crucible run under reduced
motion shows every kill cue with a non-zero light record; `pq-165-03-reduced-motion-information.test.mjs`
stays green.

## Do not
Do not restore full motion under the flag. Do not treat reduced motion as reduced flash (they are separate
settings).

## Focus test starting points
- `test/pq-165-03-reduced-motion-information.test.mjs`
- `test/wave-e2-reduced-motion-information.test.mjs`
