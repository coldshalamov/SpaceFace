// The three ordinary work craft keep their canonical ship hardware across
// sector demotion and Continue. These are spawn recipes, never motion writers.
import { makeShipEntitySpec } from '../systems/ships.js';
import { LANTERN_WARD_ID, LANTERN_WARD_SECTOR, lanternWardPoint } from '../data/lanternWardLayout.js';
import { LANTERN_WARD_RECORD_IDS as IDS } from '../data/lanternWardHardware.js';

export const LANTERN_WARD_ACTOR_ROLES = Object.freeze(['tug', 'commuter', 'maintenance']);
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
const shipId = role => role === 'tug' ? 'ship_mule' : 'ship_drifter';
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

export function isLanternWardActorRecord(record) {
  return LANTERN_WARD_ACTOR_ROLES.some(role => record?.recordId === IDS[role]);
}

export function lanternWardActorRoleForRecord(record) {
  const role = LANTERN_WARD_ACTOR_ROLES.find(key => record?.recordId === IDS[key]);
  const recipe = record?.itinerary?.lanternWard;
  if (!role || record.extra?.lanternWardInvalid === true || record.type !== 'ship'
      || record.sectorId !== LANTERN_WARD_SECTOR || record.homeSectorId !== LANTERN_WARD_SECTOR
      || record.shipDefId !== shipId(role) || record.alive === false
      || ['destroyed', 'defeated'].includes(record.outcome)
      || record.itinerary?.kind !== 'lantern_ward_actor' || recipe?.version !== 1
      || recipe.role !== role || recipe.identity !== IDS[role]
      || !finitePoint(record.pos) || !finitePoint(record.vel)
      || !Number.isFinite(record.rot) || !Number.isFinite(record.angVel)
      || !Number.isFinite(record.hull) || !(record.hull > 0)
      || !Number.isFinite(record.hullMax) || !(record.hullMax > 0)) return null;
  return role;
}

export function lanternWardActorSpec(role, anchor, record = null) {
  if (!LANTERN_WARD_ACTOR_ROLES.includes(role)) return null;
  if (record && lanternWardActorRoleForRecord(record) !== role) return null;
  const key = role === 'tug' ? 'cradle' : role === 'commuter' ? 'bypassEast' : 'maintenanceSource';
  const offset = role === 'tug' ? [-40, 28] : role === 'commuter' ? [65, -38] : [55, 73];
  const base = record?.pos || lanternWardPoint(anchor, key);
  if (!finitePoint(base)) return null;
  const pos = record ? { ...base } : { x: base.x + offset[0], z: base.z + offset[1] };
  const spec = makeShipEntitySpec(shipId(role), {
    team: record?.team ?? 2, factionId: record?.factionId || 'faction_free', pos,
    ai: record?.ai || { passive: true, allowPassiveManeuver: false, roe: 'hold_fire', spawnContext: 'convoy_civilian' },
  });
  spec.flags = { persistent: true, ...(record ? { noInterp: true } : {}) };
  Object.assign(spec.data, {
    worldRecordId: IDS[role], identityKey: IDS[role], persistenceOwner: 'worldRecords',
    worldRecordNamed: true, lanternWardId: LANTERN_WARD_ID, lanternWardActor: role,
    lawWitness: role === 'tug', sectorId: LANTERN_WARD_SECTOR,
    homeSectorId: LANTERN_WARD_SECTOR, transientSector: false,
    activityActorSlotId: `lw01_${role}`,
    trafficRole: role === 'tug' ? 'tug' : role === 'commuter' ? 'shuttle' : 'tender',
    occupationalCraft: role === 'tug' ? 'yard_tug' : role === 'commuter' ? 'apron_shuttle' : 'rescue_lifter',
    name: role === 'tug' ? 'Nessa Venn · Last Watch Electrical'
      : role === 'commuter' ? 'Lantern Steps · Watch Launch' : 'Lantern Steps · Shutter Tender',
    scanLabel: role === 'tug' ? 'NESSA VENN · LAMP SERVICE'
      : role === 'commuter' ? 'WATCH LAUNCH · COMMUTER' : 'SHUTTER TENDER · HOUSEHOLD REPAIR',
    itinerary: { kind: 'lantern_ward_actor', lanternWard: { role, identity: IDS[role], version: 1 } },
    ...(role === 'maintenance' ? { cargoManifest: {
      manifestId: 'lantern-ward:shutter-bearing:01', lotId: 'lantern-ward:shutter-bearing:01',
      destinationId: IDS.service_face, lines: [],
      totalQty: 0, custody: { holderId: IDS.maintenance },
    } } : {}),
  });
  if (record) {
    spec.vel = { ...record.vel }; spec.rot = record.rot; spec.angVel = record.angVel;
    for (const key of ['hull', 'hullMax', 'shield', 'shieldMax', 'armorHp', 'armorMax']) {
      if (Number.isFinite(record[key])) spec[key] = record[key];
    }
    // The consumed bearing stays consumed. Restoring hardware never restocks a hold.
    spec.data.cargoManifest = clone(record.cargoManifest);
    spec.data.itinerary = clone(record.itinerary);
    spec.data.playerOwned = record.playerOwned === true;
    spec.playerOwned = record.playerOwned === true;
    spec.data.playerCreated = record.playerCreated === true;
  }
  return spec;
}
