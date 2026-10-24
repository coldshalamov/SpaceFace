// src/data/receipt.js — RECEIPT / PR-8, the printer filing every kill (W-SHIFT row 506, 03 §4.3).
// Kepler Scar is a wreck-yard market; the printer trails any pilot doing honest violence and
// files every hull the player retires as a numbered receipt — one per kill, bulk returns
// batched, the counter running since long before you arrived. If you kill the printer, it
// files its own final receipt. That's the whole play: your kill feed, printed on paper.
export const RECEIPT = Object.freeze({
  sectorId: 'sector_kepler_scar',
  // The printer posts up just off the Scar Bazaar berth (station anchor -520,720).
  spawn: Object.freeze({ x: -560, z: 640 }),
  // It follows the player at a paperwork-appropriate pace and stops inside the follow ring.
  followOffset: 140,
  followRadius: 60,
  followSpeed: 85,
  // Durable counter in story flags — the serial never resets; it was printing before you.
  serialFlag: 'receipt_serial',
  serialStart: 4409,
  announceFlag: 'receipt_announced',
  sender: 'RECEIPT / PR-8',
  callsign: 'PR-8',
  announce: 'PR-8 print head warm. Every hull you retire gets a receipt. Keep the stubs.',
  // Line bodies: victimClass fills "one <class>"; lawful kills get a different filing.
  itemHostile: 'returned to sender',
  itemInnocent: 'final notice issued',
  bulkSuffix: 'bulk return accepted',
  finalLine: 'FINAL RECEIPT — PR-8, returned to sender.',
});
