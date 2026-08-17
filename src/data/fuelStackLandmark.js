// Plan 25 — The Fuel Stack.
//
// One stable descriptor binds its chart record, coarse rumor, berth service, physical pressure
// hardware, and the bounded combat-physics cascade. Runtime state remains owned by fuelStack.js;
// this file is deterministic catalog data only.

export const FUEL_STACK = Object.freeze({
  id: 'landmark_fuel_stack',
  name: 'The Fuel Stack',
  sectorId: 'sector_helios_prime',
  stationId: 'station_fuel_stack',
  sourceStationId: 'station_helios',
  rumorId: 'frontier-rumor:landmark:fuel-stack',
  localPos: Object.freeze({ x: 2380, z: -1760 }),
  chartNote: 'Gas-skimming tower: fuel at 2 CR/u. The orange vent cages are live pressure hardware.',
  rumorText: 'Dock crews say the cheap gas is real: follow the four repeating flame-vent pulses below Helios traffic. They also say one ruptured cage can walk the whole pressure ring.',
  revealRadius: 620,
  arrivalRadius: 360,
  serviceId: 'fuel_stack_refuel',
  fuelCrPerUnit: 2,
  componentHull: 70,
  componentRadius: 22,
  components: Object.freeze([
    Object.freeze({ slot: 0, offset: Object.freeze({ x: 118, z: 0 }), rot: Math.PI }),
    Object.freeze({ slot: 1, offset: Object.freeze({ x: 0, z: 118 }), rot: -Math.PI / 2 }),
    Object.freeze({ slot: 2, offset: Object.freeze({ x: -118, z: 0 }), rot: 0 }),
    Object.freeze({ slot: 3, offset: Object.freeze({ x: 0, z: -118 }), rot: Math.PI / 2 }),
  ]),
  cookOff: Object.freeze({
    radiusWu: 130,
    impulse: 340,
    maxAffected: 12,
    provenance: 'fuel_stack_pressure_cascade',
    cueId: 'landmark.fuel_stack.rupture',
  }),
  debrisCount: 8,
});

export default FUEL_STACK;
