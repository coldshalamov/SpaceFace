# FB-101 — A dry tank with no credits is a situation with a way out, not a soft lock

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: world.js, seam: stationServices.js, seam: economy.js
**Write-set:** `src/systems/world.js`, `src/systems/stationServices.js`, `src/systems/economy.js`, `test/fb-out-of-fuel-door.test.mjs`
**Neighbours (extend, never restate):** SFQ-B086, SFQ-B228

## The gap
`fuel:empty` from `_spendFuel` in `world.js` has two subscribers: an audio alert and the OUT OF FUEL banner.
No rescue, tow, reserve or distress path listens. Fuel is spent on jumps only, so a player dry in a sector
whose station lacks refuel, or with no credits (`stationServices.js` has no hardship branch), has no exit.
Death already has one: `buildRecoveryPlan` clamps cost with `hardshipCoveredCr`.

## Why this direction
Failure must create content, not a reload. Two mechanisms mirror what exists: the hardship clamp ported into
the refuel job, and a one-jump emergency reserve booked as debt.

## Mechanism
- Port the hardship clamp into `enqueuePlayerJob` in `stationServices.js` for refuel: a broke player gets the
  minimum jump's fuel with the shortfall filed as debt through the economy (single writer).
- On `fuel:empty` away from any refuel station, grant a one-jump reserve once per day, filed as debt, announced
  through the alerts path with the debt figure.
- Pin both doors and that the reserve cannot be farmed (one per day boundary).

## Done when
`test/fb-out-of-fuel-door.test.mjs`: dry + broke at a refuel station yields a minimum fill and a debt entry;
dry in a station-less sector yields one reserve and one debt entry; `fuel-reserve-warning.test.mjs` stays
green.

## Do not
Do not make fuel free. Do not teleport the ship. Do not add a distress mission in this packet.

## Focus test starting points
- `test/fuel-reserve-warning.test.mjs`
- `test/station-services.test.mjs`
- `test/custody-settles-debt.test.mjs`
