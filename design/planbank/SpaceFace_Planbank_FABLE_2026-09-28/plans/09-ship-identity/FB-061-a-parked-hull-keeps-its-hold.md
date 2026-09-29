# FB-061 — Cargo stays with a parked hull and can be moved between owned ships at a shipyard

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: shipworks.js, seam: cargo.js, seam: saveSystem.js
**Write-set:** `src/systems/cargo.js`, `src/ui/station/screens/shipworks.js`, `src/ui/navigation/cargoDeck.js`, `test/fb-parked-hull-keeps-hold.test.mjs`
**Neighbours (extend, never restate):** NXI-136

## The gap
Multiple owned ships and hangar swap exist (`ui:setActiveShip` and the sell verb), but cargo does not stay
with a parked hull and there is no locker. Swapping hulls at a shipyard silently strands or merges the hold.

## Why this direction
A station warehouse was rejected (a second cargo owner). `ownedShips[i]` records are saved objects; a `cargo`
field on the parked record, written only by the cargo owner, plus the cargo deck as the transfer surface,
keeps one writer.

## Mechanism
- On swap, the cargo owner moves the active hold into the parked record's `cargo` and loads the new hull's
  stored hold, respecting capacity (overflow stays parked).
- Add a transfer verb on the cargo deck when docked at a shipyard with two owned hulls (functional edit).
- Pin conservation: total units across active and parked holds is constant across three swaps on seed 4242, and
  survives save/load.

## Done when
`test/fb-parked-hull-keeps-hold.test.mjs`: conservation across swaps and a save round-trip;
`ships-station-service-authority.test.mjs` stays green.

## Do not
Do not let the UI write cargo. Do not add a station locker. Do not sell a hull with cargo without the confirm
naming the units.

## Focus test starting points
- `test/ships-station-service-authority.test.mjs`
- `test/save-envelope-fidelity.test.mjs`
