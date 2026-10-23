import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';

// One workplace, three different physical accidents. Coordinates below are local to the worksite,
// never sector-local once materialized. The ordinary encounter owns the invitation, not the clock.
export const SITE = deepFreeze({
  id: 'industrial_hinge_works', label: 'Hinge Works', sectorId: 'sector_ceres_belt',
  localAnchor: { x: -1520, z: 240 },
  anchor: sectorLocalToGlobalForSector({ x: -1520, z: 240 }, 'sector_ceres_belt'),
  radius: 220, discoverRadius: 560, safeBerth: { x: 100, z: 45 }, safeRadius: 18,
  factionId: 'faction_dmc', assetId: 'place_claim_outpost_refinery',
  refugeAssetId: 'place_shuttle_dock',
});

function body(role, kind, label, assetId, x, z, radius, mass, extra = {}) {
  return { role, kind, label, assetId, offset: { x, z }, radius, mass,
    hull: 100, velocity: { x: 0, z: 0 }, ...extra };
}

export const SCENARIOS = deepFreeze({
  drift: {
    id: 'drift', label: 'RUNAWAY CONSIGNMENT',
    briefing: 'A conveyor hauler has lost thrust. Its course crosses two solvent tanks. Two loading crews are still on the gantry.',
    firstHint: 'Tow the drifting hauler sideways, or push a solvent tank out of its path.',
    recoveryHint: 'The immediate danger has passed. Bring surviving pods and damaged equipment into the lit refuge berth.',
    threatRole: 'transport', equipmentRoles: ['transport', 'storageA', 'storageB'],
    crewRoles: ['crewA', 'crewB'], cargoRoles: [],
    bodies: [
      body('transport', 'wreck', 'Morrow / disabled hauler', 'place_conveyor_barge', -115, -26, 13, 36,
        { hull: 180, velocity: { x: 4, z: 0 } }),
      body('storageA', 'machine', 'Solvent tank A', 'place_slurry_tank', 0, -26, 10, 20),
      body('storageB', 'machine', 'Solvent tank B', 'place_slurry_tank', 35, -26, 10, 20),
      body('crewA', 'crew', 'Iona / loading crew', 'place_habitat_pod', 0, 7, 5, 6),
      body('crewB', 'crew', 'Merrit / tank crew', 'place_habitat_pod', 35, 8, 5, 6),
    ],
  },
  corridor: {
    id: 'corridor', label: 'THE CLOSED LANE',
    briefing: 'A hot scrap carrier is drifting toward the shelter. Two torn plates obstruct the only clear departure lane.',
    firstHint: 'Pull a plate off the marked lane. The shelter pods will use the opening; diverting the hot wreck buys them room.',
    recoveryHint: 'Tow any stranded pods to the refuge; the medical consignment may still be recoverable.',
    threatRole: 'hotWreck', equipmentRoles: ['hotWreck'],
    crewRoles: ['crewA', 'crewB'], cargoRoles: ['cargoA'],
    corridor: { start: { x: -70, z: 0 }, end: { x: 83, z: 0 }, halfWidth: 9,
      blockers: ['blockerA', 'blockerB'] },
    bodies: [
      body('hotWreck', 'wreck', 'Kiln carrier / hot slag', 'place_conveyor_barge', -154, -6, 14, 32,
        { hull: 180, velocity: { x: 2.5, z: 0 } }),
      body('blockerA', 'wreck', 'Port plate', 'place_aftermath_frag_plate_curl', -18, -5, 10, 12),
      body('blockerB', 'wreck', 'Starboard plate', 'place_aftermath_frag_plate_curl', 22, 5, 10, 12),
      body('crewA', 'crew', 'Lio / shelter pod one', 'place_habitat_pod', -65, 0, 5, 6),
      body('crewB', 'crew', 'Paz / shelter pod two', 'place_habitat_pod', -81, 0, 5, 6),
      body('cargoA', 'cargo', 'Medical consignment', 'place_cargo_pod_standard', -58, 30, 7, 8),
    ],
  },
  cascade: {
    id: 'cascade', label: 'LIVE FEED',
    briefing: 'A damaged power skid is feeding a fault through its flexible service coupling. Both process machines are drawing the fault.',
    firstHint: 'Pull the coupling free, or haul the faulted power skid away from the machinery.',
    recoveryHint: 'The circuit is isolated. Tow disabled crew and damaged parts to the refuge; an intact machine can still be preserved.',
    threatRole: 'reactor', equipmentRoles: ['reactor', 'machineA', 'machineB'],
    crewRoles: ['crewA'], cargoRoles: ['cargoA'],
    connection: { id: 'power', fromRole: 'reactor', toRole: 'coupler',
      feedRoles: ['machineA', 'machineB'], detachDistance: 14, isolationDistance: 55 },
    bodies: [
      body('reactor', 'machine', 'Faulted power skid', 'place_power_skid', -14, -20, 10, 18),
      body('coupler', 'wreck', 'Flexible feed coupling', 'place_tanker_coupling', 10, -20, 5, 5),
      body('machineA', 'machine', 'Separation mill', 'place_works_refinery', 20, 12, 11, 24),
      body('machineB', 'machine', 'Polishing mill', 'place_works_refinery', 54, 12, 11, 24),
      body('crewA', 'crew', 'Sena / line engineer', 'place_habitat_pod', 48, 44, 5, 6),
      body('cargoA', 'cargo', 'Refined catalyst pallet', 'place_cargo_pod_standard', 5, 48, 7, 8),
    ],
  },
});

export const SCENARIO_IDS = Object.freeze(Object.keys(SCENARIOS));
export function getScenario(id) { return typeof id === 'string' && Object.hasOwn(SCENARIOS, id) ? SCENARIOS[id] : null; }
export function sitePoint(local, anchor = SITE.anchor) {
  return { x: anchor.x + local.x, z: anchor.z + local.z };
}
function deepFreeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
  return Object.freeze(value);
}
