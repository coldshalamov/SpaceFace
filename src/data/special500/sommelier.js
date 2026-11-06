// src/data/special500/sommelier.js — SP2-065 "The Sommelier of Coolant" (vendor leg data).
//
// The depot bar's sole bartender is a retired Choir censer machine that has rebranded its
// incense burn as "beverage temperature control" (catalog entry SP2-065,
// src/data/special500/entries-world-a.js). Buying "the Thursday" — a small credits purchase
// poured at the bar — is the leg's payoff: a fuel-efficiency pour for one run (two unsealed
// fuel cells into the hold, which crack into the tank through the world owner's ordinary cell
// path), Choir rep +1 ("the censer remembers patronage"), once per game.
//
// Pure data + pure reads. The bar contact row lives in src/ui/station/barContacts.js
// (CANONICAL_CONTACTS); the purchase settles in src/systems/special500Sommelier.js, which
// charges through the economy owner's exact-payment intent and pays rep through
// factions.js's repDelta intent. Credits: 12. The pour: 2 × cmdty_fuel_cells.

export const SOMMELIER = Object.freeze({
  contactKey: 'sommelier',
  stationId: 'station_depot3',       // Refuel Depot, Choir-run (sector_vesta_forge)
  choiceId: 'the_thursday',
  receiptEvent: 'special500:sommelierReceipt',
  pourFlag: 'the_thursday_poured',   // plain-named, no special500. prefix
  pourCr: 12,
  pourCells: 2,
  pourCommodity: 'cmdty_fuel_cells',
  choirRepDelta: 1,
});
