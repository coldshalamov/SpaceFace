// src/data/kessler.js — Kessler's scale (W-CAST-HANDS row 542, §34.8 / 03 §4.1 / 06 B1).
// The cargo registrar's weigh-slip deck at Tethys: put a pod on the plate and the plate
// reads low — his thumb is on the seal. Your Line's strain gauge and the pod's own stamp
// read true; the variance between them is the clue B1 plants. "The world's scales lie."
export const KESSLER_SCALE = Object.freeze({
  sectorId: 'sector_tethys_junction',
  // The Weigh-Slip Buoy's deck (poi_tethys_weigh at 720,-980), beside the held-for-count
  // racks — a pod left to rest here goes on the registrar's plate.
  pad: Object.freeze({ x: 720, z: -980 }),
  padRadius: 90,
  restSpeed: 8,
  // The skim: the plate reports true mass × this. Twice-thumbed — close enough to pass a
  // glance, short enough to flag a pilot who weighs her own freight.
  plateFactor: 0.94,
  // Reads resolve to a tenth of a mass unit — finer rounding than Rook's whole-credit book.
  announceFlag: 'kessler_scale_announced',
  varianceFlag: 'kessler_variance_seen',
  countFlag: 'kessler_reads_counted',
  sender: 'KESSLER DESK',
  announce: 'Scale deck open at the weigh-slip. Pods rest on the plate, the plate reports. Mind the seal.',
  // {plate} = skimmed read, {true} = the honest mass the pod stamps.
  read: 'Plate reads {plate}t. Your stamp says {true}t. Desk codes it within tolerance.',
  firstVariance: 'Plate reads {plate}t. Your stamp says {true}t — a thumb-width short. The desk logs the variance; you saw it. Keep the plate honest by weighing what you already weighed.',
});
