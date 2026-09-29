# FB-135 — Low fuel is a two-stage voice: a reserve-crossing bed, then an empty sting, never a menu beep

**Kind:** build · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: audioSystem.js, seam: fuelReserveWarning.js, seam: audioRecipes.js
**Write-set:** `src/audio/audioSystem.js`, `src/data/audioRecipes.js`, `src/ui/fuelReserveWarning.js`, `test/fb-fuel-voice.test.mjs`
**Neighbours (extend, never restate):** SFQ-B195, SF-252

## The gap
`fuel:empty` maps to the generic `alert` cue (`sfx_ui_alert`); the code comment admits there was no sound
before. There is no cue before empty although `fuelReserveWarning.js` already detects the reserve crossing as
a clean edge. A run-ending state gets a menu beep.

## Why this direction
`HULL_BREACH_MIX` is the precedent for a state that changes the mix rather than firing a beep; the reserve bed
follows it and the empty sting is one authored synth recipe.

## Mechanism
- On the reserve downward crossing (the warning's existing edge), start a low reserve bed on the ambient bus
  that ends on the upward crossing; on `fuel:empty`, play an authored `+sfx_fuel_empty` sting and hold a thinner
  mix until refuel.
- Route through the caption table (see FB-123).
- Pin the two edges and silence after refuel on seed 4242.

## Done when
`test/fb-fuel-voice.test.mjs`: bed starts and stops on the crossings, sting once on empty, mix restored on
refuel; `fuel-reserve-warning.test.mjs` stays green.

## Do not
Do not add samples. Do not beep every tick below reserve. Do not touch fuel numbers.

## Focus test starting points
- `test/fuel-reserve-warning.test.mjs`
- `test/audio-wanted-heat.test.mjs`
