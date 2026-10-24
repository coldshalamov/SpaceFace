// src/data/slate.js — Slate's column (W-CAST-HANDS row 542, §34.8 / 03 §4.1 / 06 B3).
// The welder's ledger-pillar beside the Forge yard: every weld your hull takes is a
// pressure spike on the seam, and the column keeps the count. His law is the canon one —
// the seam holds to the third spike and goes at the fourth. Reading the column shows you
// your number before the seam shows you his. The receipt: the fourth spike puts your
// entry in the column — 'Slate's column has your entry.'
export const SLATE_COLUMN = Object.freeze({
  sectorId: 'sector_vesta_forge',
  // The pillar stands beside the Forge Outlying Yard berth (-820,280) — the welder's own
  // ground, where the rebuilds happen.
  pos: Object.freeze({ x: -760, z: 340 }),
  readRadius: 110,
  // Canon: the seam holds to the third pressure spike and goes at the fourth (06 B3).
  failureSpike: 4,
  // A weld this small is a patch, not a rebuild — it does not ring the column.
  spikeMinHull: 8,
  announceFlag: 'slate_column_announced',
  entryFlag: 'slate_column_entry',
  spikeFlag: 'slate_spikes',
  sender: 'SLATE — FORGE YARD',
  announce: 'The pillar by the yard is my column. Every weld your hull takes rings it. It holds to three; it goes at four.',
  // {n} = the hull's logged spike count.
  readOne: 'Column reads {n} weld-spike on this hull. It holds to three.',
  readMany: 'Column reads {n} weld-spikes on this hull. It holds to three.',
  readFailed: 'Your number is already in the column — {n} spikes. The seam went at four, same as he said.',
  spike: 'The weld rings the column — {n} on this hull.',
  // {n} is always 4 here: the prediction lands the moment the count reaches it.
  fourth: 'Fourth spike. The column wrote your name the day it predicted it — Slate welds the seam again and logs the entry.',
});
