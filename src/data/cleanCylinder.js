// M30 uses the ordinary escort owner and the existing Broken Shepherd corridor.
import { MACHINE_SITES, machineKindById } from './precursorMachines.js';

const site = MACHINE_SITES.charon_broken_shepherd;
export const CLEAN_CYLINDER = Object.freeze({
  id: 'm30_clean_cylinder', stationId: 'station_expanse', sectorId: site.sectorId,
  entry: Object.freeze({ x: site.center.x - 550, z: site.center.z - 550 }),
  exit: Object.freeze({ x: site.center.x + 550, z: site.center.z + 550 }),
  pocketRadius: machineKindById('shepherd').suppressionRadius,
  speed: machineKindById('shepherd').speed,
  matchSpeed: 12, repairRadius: 100, repairSpeed: 8, repairS: 6,
  foulAt: 0.35, faultAtS: 28, warningS: 6, faultS: 12,
});

export function buildCleanCylinderOffer() {
  return {
    id: CLEAN_CYLINDER.id, type: 'escort', source: 'cleanCylinder',
    stationId: CLEAN_CYLINDER.stationId, destStationId: CLEAN_CYLINDER.stationId,
    destSectorId: CLEAN_CYLINDER.sectorId, factionId: 'faction_dmc',
    title: 'The clean cylinder', summary: 'Escort a Shepherd-class charge through the Broken Shepherd corridor.',
    brief: 'Join the charge at the entry refuge. Stay within its 420 WU pocket and match velocity within 12 WU/s. '
      + 'To repair, target the charge within 100 WU and match within 8 WU/s for 6 seconds; onboard purge supplies are included. '
      + 'When the field spikes, fly back toward the entry refuge to lead a retreat. '
      + 'Full fee for clean delivery, 50% for contaminated delivery, 25% for returning together to refuge. No cargo, purchase or special equipment required.',
    reward_cr: 1200, collateral_cr: 0, duration_s: null, time_limit_s: null,
    riskTier: 1, minRep: -149, objectiveTarget: 1,
    params: { convoySize: 1, ambushSize: 0, cleanCylinder: {
      phase: 'crossing', exposure: 0, crossingS: 0, repairS: 0, retreatS: 0,
    } },
  };
}
