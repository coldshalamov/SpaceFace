# FB-121 — Every enemy declares whether it is ammunition, moving terrain or a specialist, and the scan says so

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: enemies.js, seam: combatDefs.js, seam: targetPanel.js
**Write-set:** `src/data/enemies.js`, `src/systems/combat.js`, `src/ui/targetPanel.js`, `test/fb-roster-mass-class.test.mjs`
**Neighbours (extend, never restate):** SFQ-B050, SF-133, SFQ-B022

## The gap
The vision divides enemies into ammunition, moving terrain and specialists. The sim has the number
(`THROW_CLASS_MAX_MASS` in `survivalWaves.js` decides what the rope can throw) but no roster row declares its
class, so the corsair (32 t, throwable) and the reaver (60 t, not) read the same on the scan until the player
tries. SFQ-B050 asks for a readable roster; this is the one field that makes it readable.

## Why this direction
A derived class from mass is honest and cheap; declaring it on the row lets specialists override (a 24 t
tether raider is a specialist, not ammunition) and the target panel print one word.

## Mechanism
- Add `+physicalClass` to every `ENEMY_TYPES` row (ammunition / terrain / specialist), derived by a table test
  from mass against `THROW_CLASS_MAX_MASS` unless overridden for specialists.
- Copy it onto the spawned entity in `combat.js` and print it on the target panel at the reveal stage SF-133
  requires (functional edit).
- Pin the derivation rule and that every row has a class.

## Done when
`test/fb-roster-mass-class.test.mjs`: 19/19 rows classed, derivation matches mass except declared specialists,
the panel model carries the word on seed 4242.

## Do not
Do not change any mass. Do not add a fourth class. Do not overclaim on an unscanned contact.

## Focus test starting points
- `test/pq-140-02-specialists.test.mjs`
- Locate throw-class suites with `rg THROW_CLASS_MAX_MASS test/`.
