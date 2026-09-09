// PQ-133.11 / CRU-059 — Crucible arena laws → authored Adventure sites.
// Pure frozen data. Coordinates are sector-local. No new atlas places: every site already exists.

import { CINDER_SLUICE_LOCAL_POS, CINDER_SLUICE_SITE_ID } from './environmentalMachinery.js';

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

export const ADVENTURE_ARENA_SITES = freezeDeep([
  {
    arenaId: 'helios_core',
    law: 'ricochet',
    siteId: 'zone_vesta_forge',
    name: 'The Forge',
    sectorId: 'sector_vesta_forge',
    center: { x: -480, z: 720 },
    standingPhase: 'loose_plate',
    machinery: 'reflective industrial plant — plates, shutters, and a slow sag',
    fiction: 'Ricochet Foundry as an industrial weapons plant. Bounce is the room, not a draft.',
    living: ['ambushes', 'missions', 'salvage', 'faction battles'],
  },
  {
    arenaId: 'lagrange_crucible',
    law: 'pull',
    siteId: 'station_coalition',
    name: 'Coalition gravitic range',
    sectorId: 'sector_helios_prime',
    center: { x: -500, z: 800 },
    standingPhase: 'idle',
    machinery: 'two-pylon saddle — the midpoint holds, the axis throws',
    fiction: 'Lagrange Crucible as a gravitic research site off the Coalition yard.',
    living: ['patrols', 'missions', 'emergencies'],
  },
  {
    arenaId: 'cinder_sluice',
    law: 'current',
    siteId: CINDER_SLUICE_SITE_ID,
    name: 'Cinder Sluice',
    sectorId: 'sector_ceres_belt',
    center: { x: CINDER_SLUICE_LOCAL_POS.x, z: CINDER_SLUICE_LOCAL_POS.z },
    standingPhase: 'idle',
    machinery: 'directional cone current — warning, surge, calm',
    fiction: 'The Crucible sluice is the same world machine. Downstream is cheap; upstream is paid.',
    living: ['mining', 'salvage', 'heists', 'refinery traffic'],
  },
  {
    arenaId: 'cryo_drift',
    law: 'freeze_control',
    siteId: 'zone_vesta_slag',
    name: 'Slag Radiation Field',
    sectorId: 'sector_vesta_forge',
    center: { x: 680, z: 320 },
    standingPhase: 'idle',
    machinery: 'thermal quadrants — cold Cryo Lock, heat Burning, both Thermal Shock',
    fiction: 'Cryo Drift as a coolant extraction failure in the Forge slag glow.',
    living: ['emergencies', 'salvage', 'missions'],
  },
  {
    arenaId: 'storm_lattice',
    law: 'conduct',
    siteId: 'world_site_helios_relay',
    name: 'Helios Recovery Relay',
    sectorId: 'sector_helios_prime',
    center: { x: 760, z: -620 },
    standingPhase: 'idle',
    machinery: 'conductivity graph over pylons, relays, and Massline cables',
    fiction: 'Storm Lattice as station power infrastructure — the recovery relay and its field coil.',
    living: ['patrols', 'repair', 'emergencies'],
  },
]);

export const ADVENTURE_ARENA_SITE_BY_ARENA = freezeDeep(
  Object.fromEntries(ADVENTURE_ARENA_SITES.map((row) => [row.arenaId, row])),
);

export const ADVENTURE_LIVE_ARENA_IDS = Object.freeze([
  'helios_core',
  'lagrange_crucible',
  'cinder_sluice',
  'cryo_drift',
  'storm_lattice',
]);
