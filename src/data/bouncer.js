// src/data/bouncer.js — BOUNCER / DR-0, the bazaar's door robot (W-SHIFT row 506, 03 §4.3).
// Sker Haven is lawless; the ring around the bazaar is the one law it keeps. Any weapon
// fired inside the cordon is a strike — the door robot warns once, then throws the rowdy
// hull out through the ring. Rocks are fine: a shoved stone never tripped a firing line,
// so thrown mass is legal tender here. You can be its backup, or its problem.
export const BOUNCER = Object.freeze({
  sectorId: 'sector_sker_haven',
  // The no-weapons cordon circles the Sker Bazaar berth (station_sker, -540,680).
  center: Object.freeze({ x: -540, z: 680 }),
  ringRadius: 300,
  // The robot posts up just off the bazaar gate and drifts home if it is pushed.
  post: Object.freeze({ x: -480, z: 620 }),
  leashRadius: 60,
  driftSpeed: 22,
  // Door law: one spoken warning, then the throw.
  strikesBeforeEject: 1,
  strikeWindowS: 45,
  ejectCooldownS: 6,
  ejectDeltaV: 150,
  announceFlag: 'bouncer_announced',
  ejectCountFlag: 'bouncer_ejections',
  playerEjectedFlag: 'bouncer_threw_you',
  sender: 'BOUNCER / DR-0',
  callsign: 'DR-0',
  announce: 'Ring around the bazaar is mine. No guns inside it. Rocks are fine — throw what you like.',
  warn: 'No guns in the ring. Rocks are fine. That was the warning.',
  eject: 'Asked once. Out you go.',
  ejectPlayer: 'Out. The ring does not care whose name is on the hull.',
  backup: 'They fired inside. They fly outside. Backup noted.',
});
