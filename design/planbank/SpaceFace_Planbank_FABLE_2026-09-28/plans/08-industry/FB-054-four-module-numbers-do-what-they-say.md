# FB-054 — Boost cooldown, boost duration, whole-wreck tractoring and docked-drone repair stop being dead fields

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: modules.js, seam: ships.js, seam: uniqueLootAbilities.js, seam: automation.js
**Write-set:** `src/systems/ships.js`, `src/systems/uniqueLootAbilities.js`, `src/systems/automation.js`, `src/data/modules.js`, `test/fb-module-dead-fields.test.mjs`
**Neighbours (extend, never restate):** SFQ-B005, NXB-030

## The gap
`src/data/modules.js` authors `boostCdS`, `boostDurS`, `tractorWholeWrecks` and `repairDockedDrones`; none has
a reader outside the data file (and two tests). A module promises a boost cooldown the sim ignores; the
whole-wreck verb is hardcoded to one unique via `isTidelineWholeWreckEligible`; drones never repair when
parked.

## Why this direction
Deleting the fields was rejected: each is a verb the fitting screen already advertises. Folding them into the
single writer of derived stats and the two existing owners is surfacing.

## Mechanism
- Fold `boostCdS`/`boostDurS` into `derived.boost` in `getDerivedStats` (the sole writer) and read them where
  boost fires in `flightV3.js`.
- Make `isTidelineWholeWreckEligible` read the `tractorWholeWrecks` flag from the fitted module instead of the
  unique id.
- In `_parkDroneEntities` in `automation.js`, restore drone durability when the bay carries
  `repairDockedDrones`.

## Done when
`test/fb-module-dead-fields.test.mjs`: a fitted booster changes cooldown and duration by the authored numbers,
a tractor-flagged module lifts a whole wreck, parked drones regain durability;
`automation-drone-bay-capacity.test.mjs` stays green.

## Do not
Do not add fields. Do not let modules write derived stats directly. Do not change the Tideline unique's own
behaviour.

## Focus test starting points
- `test/automation-drone-bay-capacity.test.mjs`
- Locate boost suites with `rg boostCdS src/ test/` (the authored field) and name what you verified.
