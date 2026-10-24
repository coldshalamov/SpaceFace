// src/data/rook.js — Rook's bounty booth (W-CAST-HANDS row 542, §34.8 / 03 §4.1).
// The bounty broker at Charon's Expanse Refinery takes physical delivery: rest a wreck
// inside the pad ring and the book pays by the mass. The canon record says a clean tag
// is useful because it can be billed twice — the player is paid once; the double-bill
// lives on Rook's side of the ledger, in the receipt line.
export const ROOK_BOOTH = Object.freeze({
  sectorId: 'sector_charon_expanse',
  stationId: 'station_expanse',
  // Pad ring off the Expanse Refinery dock apron (station sits at 880,-640) — close enough
  // to read as his, clear enough that berthed traffic never parks inside it.
  pad: Object.freeze({ x: 1040, z: -540 }),
  padRadius: 100,
  // Same arrival law as every cradle in the game: inside AND at rest. A fast pass is not
  // a delivery and never gets paid.
  restSpeed: 8,
  // cr per unit wreck mass — a standard 1800-mass kill wreck reads ~324 cr, under a live
  // bounty contract but real money for a tow.
  ratePerMass: 0.18,
  // Payout floor so a fistful of sort-debris still reads as a sale, not a rounding error.
  minPayoutCr: 25,
  announceFlag: 'rook_booth_announced',
  countFlag: 'rook_wrecks_delivered',
  sender: "ROOK'S BOOTH",
  announce: 'Pad light is on at the Expanse. Hull goes in the ring at rest, cr comes back. I do the counting — do not do it for me.',
  receipt: 'Hull logged. {cr} cr against the ring. The book says it twice; you are paid once.',
  firstReceipt: 'First hull. {cr} cr — the book already said it twice. Welcome to the pad.',
});
