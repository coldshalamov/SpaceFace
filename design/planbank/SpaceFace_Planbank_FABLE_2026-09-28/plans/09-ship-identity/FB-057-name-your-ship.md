# FB-057 — The persistent ship can be named by its owner

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: hullIdentity.js, seam: shipworks.js, seam: saveSystem.js
**Write-set:** `src/data/hullIdentity.js`, `src/ui/station/screens/shipworks.js`, `src/systems/ships.js`, `test/fb-name-your-ship.test.mjs`
**Neighbours (extend, never restate):** SFQ-B118

## The gap
`hullNameForOwnedShip` draws from `HULL_NAME_BANK` by seed and already prefers `ownedShip.name` if set; there
is no rename affordance anywhere (zero hits for a rename intent). `shipworks.js` already emits
`ui:setShipAppearance` and `ownedShips` is persisted. The "my fucking ship" fantasy has no name field.

## Why this direction
The mechanism is a twin of the appearance intent: one intent, one writer, one text input on the existing
nameplate. Everything that reads the name (traffic recognition, barks, the ledger) already reads the resolved
name.

## Mechanism
- Add a `+ui:setShipName` intent handled by the ships owner, writing `ownedShip.name` (trimmed, length-capped,
  profanity-agnostic).
- Add a text input on the nameplate in `shipworks.js` (functional edit, ORRERY-consistent) that emits the
  intent.
- Pin that the resolved name changes everywhere `hullNameForOwnedShip` is read and survives save/load.

## Done when
`test/fb-name-your-ship.test.mjs`: rename persists across save/load and appears in a traffic recognition bark
on seed 4242; `save-envelope-fidelity.test.mjs` stays green.

## Do not
Do not let the UI write the record directly. Do not rename NPC hulls. Do not add a name generator screen.

## Focus test starting points
- `test/save-envelope-fidelity.test.mjs`
- Locate hull-identity suites with `rg hullIdentity test/`.
