// Reactive-matter budgets. Forces are Newtons in world-units (mass · WU/s²);
// impulses are mass · WU/s. The authoritative clock is 60 Hz (src/core/sim.js SIM_DT).
// Heat thresholds are the environment material numbers so this alphabet does not
// invent a second ignition scale.

import { ENVIRONMENT_MATERIALS } from '../environmentMaterials.js';

export const REACTIVE_SCHEMA = 1;
export const REACTIVE_DT = 1 / 60;

/** Crystal fracture heat and volatile ignition heat, owned by environment materials. */
export const BRITTLE_HEAT_THRESHOLD = ENVIRONMENT_MATERIALS.crystal.fractureHeat;
export const VOLATILE_HEAT_THRESHOLD = ENVIRONMENT_MATERIALS.volatile.ignitionHeat;

export const REACTIVE_BUDGETS = Object.freeze({
  maxBodies: 64,
  maxMachines: 8,
  maxContactsPerTick: 128,
  maxReactionsPerTick: 8,
  maxChainDepth: 3,
  maxDebrisAlive: 24,
  maxSpawnsPerTick: 6,
  maxSaveBodies: 64,
  maxEventLog: 16,
  maxDeferred: 32,
  maxCuesPerTick: 32,
  maxTerminal: 64,
  heatCap: 200,
  // Law inputs above this closing speed are sanitized. Not a flight speed limit.
  speedCap: 4000,
  dtMin: 1 / 240,
  dtMax: 1 / 20,
  // Magnetic crane force cap. Gentle next to a taut massline, sharp up close.
  ferroMaxForce: 960,
  ferroFieldMul: 2.5,
  volatileImpactSpeed: 48,
  volatileImpulseCap: 720,
  volatileBlastRadius: 28,
  volatileDebris: 3,
  volatileDebrisSpeed: 18,
  volatileDebrisMassFraction: 0.22,
  // A sibling canister inside the blast receives one ignition quantum of heat.
  volatileNeighborHeat: VOLATILE_HEAT_THRESHOLD,
  // Documented chemical injection (energy units). Not momentum conservation.
  volatileChemicalEnergy: 1800,
  brittleImpactSpeed: 62,
  brittleShards: 2,
  brittleOffsetFraction: 0.55,
  brittleShardRadiusFraction: 0.42,
  brittleLugReachPad: 1.5,
  elasticK: 90,
  elasticMaxStored: 280,
  elasticRelease: 0.8,
  elasticReleaseMin: 0.5,
  impactHeatScale: 0.2,
  impactHeatCap: 24,
  reapAge: 900,
  playerWitnessSpeed: 120,
});

export const REACTIVE_STEP_ORDER = Object.freeze([
  'sanitize-dt',
  'clock',
  'heat',
  'ferromagnetic',
  'elastic',
  'volatile',
  'brittle',
  'deferred',
  'reap',
  'cues',
]);
