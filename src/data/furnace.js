// src/data/furnace.js — CR-FEED intake (W-BOOKS-0-2 row 533, §34.7 Book 1).
// The Ceres yard's furnace mouth beside the closed refinery: fling the infested ore
// hauler's pods into the ring and the yard burns them. The intake is a marked hazard
// ring — anything edible that crosses the lip is taken; the scenery wants a body.
export const FURNACE_INTAKE = Object.freeze({
  sectorId: 'sector_ceres_belt',
  // Mouth ring beside The Closed Refinery (poi 1600,1800) — the refinery row's feed.
  mouth: Object.freeze({ x: 1480, z: 1640 }),
  mouthRadius: 90,
  // Edible freight: jettisoned pods and loose rock — a furnace takes ore, not hulls.
  // The player's own hull, stations, wrecks and living things are not food.
  announceFlag: 'furnace_intake_announced',
  fedFlag: 'furnace_intake_fed',
  countFlag: 'furnace_intake_count',
  sender: 'CR-FEED',
  announce: 'CR-FEED intake live beside the old refinery. The yard eats what crosses the lip — keep your own hull clear.',
  fed: 'CR-FEED took the load. The yard burns what it is given.',
});
