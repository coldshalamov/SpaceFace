// src/data/gateThree.js — the Gate 3 weir (W-CAST-HANDS row 542, §34.8 / 03 §4.1).
// Hale and Dree share one post: the Customs Gate's weir cordon across the Tethys lane.
// Crossing the ring IS submitting — the scale reads hull plus loose freight against the
// manifest the papers declare (the hull's own mass), exactly the row-513 model encounter
// 700 runs. Hale files REF 44-C: the second fine, correctly, every time. Dree's mercy is
// the waved weir — one small over-mass, once ever, walked through open.
export const GATE_THREE_WEIR = Object.freeze({
  sectorId: 'sector_tethys_junction',
  // The Customs Gate station (station_customs, sectorAnchors -640,-1180) — 'Everything
  // transits; nothing transits unread.'
  post: Object.freeze({ x: -640, z: -1180 }),
  // The cordon is a lane-scale ring, not a pad — you submit by crossing it.
  weirRadius: 180,
  // What the papers declare: the hull's own mass, like the barge's manifest minimum.
  manifestMinT: 1,
  finePerTCr: 38,          // REF 44-C is priced per unmanifested tonne, same tariff as 700.
  fineMinCr: 120,
  // Dree's wave covers a small over-mass — a lane's worth of slack, not a smuggler's hold.
  dreeWaveMaxT: 25,
  announceFlag: 'gate3_weir_announced',
  waveFlag: 'dree_weir_waived',
  countFlag: 'hale_fines_filed',
  sender: 'GATE 3 CUSTOMS',
  announce: 'Gate 3 reads every hull that crosses its weir. The scale is honest; the manifest is on you.',
  clean: 'Weighing {read}t against a {manifest}t manifest — clean. Transit logged.',
  waived: 'OVER MASS: {over}t your papers do not carry. Inspector Dree waves the weir — once. REF 44-C stayed in the drawer.',
  fined: 'OVER MASS: {over}t your papers do not carry. REF 44-C filed — {fine} cr against the note. Hale files the second fine correctly.',
});
