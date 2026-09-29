# FB-059 — Five heavy hulls stop sharing one drive feel; the authored gravimetric drive is fitted

**Kind:** deepening · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: propulsionCatalog.js, seam: ships.js
**Write-set:** `src/core/flight/propulsionCatalog.js`, `src/data/ships.js`, `test/fb-heavy-ladder-drives.test.mjs`
**Neighbours (extend, never restate):** NXB-030, SF-122

## The gap
`PROPULSION_PROFILES` has eight authored profiles; four hulls have a private one, five heavies (hawser,
bastion, warden, colossus, leviathan) share `drive_torch_l` and three share `drive_reaction_m`.
`drive_gravimetric_m` is authored and fitted to no hull. The T3–T5 ladder flies one feel.

## Why this direction
New profiles were rejected; the unfitted one exists. Assigning it and one variant of the torch (by mass band)
gives the ladder three feels with numbers to compare.

## Mechanism
- Fit `drive_gravimetric_m` to the Bastion and the Warden; author `+drive_torch_xl` as the Colossus/Leviathan
  variant with the torch's law and a slower slew, leaving the Hawser on the torch.
- Record the handling numbers (time to 90% governed speed, 180° turn time, stop distance) per hull in the test
  as the feel receipt.
- Keep every hull's mass and thrust unchanged; only the profile law moves.

## Done when
`test/fb-heavy-ladder-drives.test.mjs`: three distinct handling triples across the five heavies on seed 4242;
`vp220-propulsion-family.test.mjs` and `thruster-propulsion-vocabulary.test.mjs` stay green.

## Do not
Do not add drag or a speed cap. Do not change starter hulls. Do not touch NPC input slew.

## Focus test starting points
- `test/vp220-propulsion-family.test.mjs`
- `test/thruster-propulsion-vocabulary.test.mjs`
