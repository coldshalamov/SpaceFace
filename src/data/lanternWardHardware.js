// LW-01 finite hardware recipes. These describe bodies; worldRecords owns their
// durable capture/materialization and SG-02 alone writes their physical motion.
import { SECTORS } from './sectors.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import {
  LANTERN_WARD_ID, LANTERN_WARD_SECTOR, LANTERN_WARD_ANCHOR,
  LANTERN_WARD_BODY_CONTRACTS, lanternWardPoint,
} from './lanternWardLayout.js';

export const LANTERN_WARD_RECORD_IDS = Object.freeze(Object.fromEntries(
  ['cradle', 'lamp', 'receiver', 'obstruction', 'service_face', 'maintenance_part', 'tug', 'commuter', 'maintenance']
    .map(role => [role, `lantern-ward:${role}`]),
));
export const LANTERN_WARD_LAMP_SERIAL = 'venn-family-lamp:01';
export const LANTERN_WARD_PART_SERIAL = 'lantern-ward:shutter-bearing:01';
export const LANTERN_WARD_HARDWARE_ROLES = Object.freeze(['cradle', 'lamp', 'receiver', 'obstruction', 'service_face', 'maintenance_part']);
// Existing cargo-canister renderer, measured at radius5. No new art producer.
const partContract = Object.freeze({ radius: 5, size: [6.25, 5, 5],
  collision: [{ x: 0, z: 0, hx: 3.125, hz: 2.4 }] });
const contract = role => role === 'maintenance_part' ? partContract : LANTERN_WARD_BODY_CONTRACTS[role];
const roleById = new Map(LANTERN_WARD_HARDWARE_ROLES.map(role => [LANTERN_WARD_RECORD_IDS[role], role]));
const phases = new Set(['waiting', 'approach', 'brace', 'connect', 'finish', 'retreat', 'damaged']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const unit = n => Math.max(0, Math.min(1, finite(n)));
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const names = Object.freeze({
  cradle: 'Lantern Ward · Borrowable Procession Cradle',
  lamp: 'Venn Family Lamp · Serial 01',
  receiver: 'Venn Household Receiver · Family Lamp Seat',
  obstruction: 'Fallen Service Mast · Tow Eye',
  service_face: 'Lantern Steps · Household Service Shutter',
  maintenance_part: 'Lantern Steps · Shutter Bearing 01',
});
const masses = Object.freeze({ cradle: 54, lamp: 9, receiver: 1600, obstruction: 120, service_face: 1600, maintenance_part: 9 });
const hulls = Object.freeze({ cradle: 280, lamp: 90, receiver: 1400, obstruction: 540, service_face: 1000, maintenance_part: 90 });

export function lanternWardCanonicalAnchor() {
  const sector = SECTORS.find(row => row.id === LANTERN_WARD_SECTOR);
  const local = sector?.pois?.find(row => row.id === LANTERN_WARD_ANCHOR)?.pos;
  return local ? sectorLocalToGlobalForSector(local, LANTERN_WARD_SECTOR) : null;
}

export function lanternWardHardwareCollision(role) {
  const c = contract(role);
  if (!c || !LANTERN_WARD_HARDWARE_ROLES.includes(role)) return null;
  return {
    schemaVersion: 1, id: `lantern-ward:${role}:v1`, referenceRadius: 'radius',
    primitives: c.collision.map((b, i) => ({
      kind: 'obb', id: `${role}_${i}`, x: b.x / c.radius, z: b.z / c.radius,
      hx: b.hx / c.radius, hz: b.hz / c.radius, angle: 0,
    })),
  };
}

export function isLanternWardRecordIdentity(record) { return roleById.has(record?.recordId); }

export function lanternWardHardwareRoleForRecord(record) {
  const role = roleById.get(record?.recordId), saved = record?.itinerary?.lanternWard;
  if (!role || record.extra?.lanternWardInvalid === true || record.type !== 'payload' || record.sectorId !== LANTERN_WARD_SECTOR
      || record.alive === false || ['destroyed', 'defeated'].includes(record.outcome)
      || record.itinerary?.kind !== 'lantern_ward' || saved?.role !== role
      || saved.version !== 1 || saved.identity !== record.recordId
      || (role === 'lamp' && saved.serial !== LANTERN_WARD_LAMP_SERIAL)
      || (role === 'maintenance_part' && saved.serial !== LANTERN_WARD_PART_SERIAL)
      || ![record.pos?.x, record.pos?.z, record.vel?.x, record.vel?.z,
        record.rot, record.angVel, record.hull, record.hullMax].every(Number.isFinite)
      || record.hull <= 0 || record.hull > record.hullMax
      || !validSavedCustody(role, saved.custody)
      || (role === 'lamp' && !validLampManifest(saved.manifest))
      || (role === 'maintenance_part' && !validPartManifest(saved.manifest))) return null;
  return role;
}

function validLampManifest(manifest) {
  return manifest?.manifestId === LANTERN_WARD_LAMP_SERIAL && manifest.lotId === LANTERN_WARD_LAMP_SERIAL
    && manifest.destinationId === LANTERN_WARD_RECORD_IDS.receiver && manifest.totalQty === 1
    && Array.isArray(manifest.lines) && manifest.lines.length === 1
    && manifest.lines[0]?.commodityId === 'cmdty_electronics' && manifest.lines[0]?.qty === 1
    && typeof manifest.custody?.holderId === 'string' && manifest.custody.holderId.length > 0;
}
function validSavedCustody(role, custody) {
  if (!custody || typeof custody !== 'object' || Array.isArray(custody)
      || !['ward', 'cradle', 'receiver', 'loose', 'player', 'source', 'maintenance', 'service_face'].includes(custody.holder)) return false;
  return role !== 'lamp' || custody.serial === LANTERN_WARD_LAMP_SERIAL;
}
function validPartManifest(m) {
  return m?.manifestId === LANTERN_WARD_PART_SERIAL && m.lotId === LANTERN_WARD_PART_SERIAL
    && m.destinationId === LANTERN_WARD_RECORD_IDS.service_face && m.totalQty === 1
    && Array.isArray(m.lines) && m.lines.length === 1 && m.lines[0]?.commodityId === 'cmdty_comp_hullplate'
    && m.lines[0]?.qty === 1 && typeof m.custody?.holderId === 'string';
}

/** Pure catch-up gate. A remembered load is fixed only by an exact accepted
 * native clamp receipt; a loose/stolen body retains normal ballistic catch-up. */
export function lanternWardRecordHasCustody(record) {
  const actor = ['tug', 'commuter', 'maintenance'].find(role => record?.recordId === LANTERN_WARD_RECORD_IDS[role]);
  if (actor) return record.type === 'ship' && record.alive !== false && record.playerOwned !== true
    && record.sectorId === LANTERN_WARD_SECTOR && record.jobId === `job:${record.recordId}`
    && record.itinerary?.kind === 'lantern_ward_actor' && record.itinerary.lanternWard?.version === 1
    && record.itinerary.lanternWard.role === actor && record.itinerary.lanternWard.identity === record.recordId
    && record.itinerary.lanternWard.workLease === 'lantern_ward_attended_work';
  const role = lanternWardHardwareRoleForRecord(record);
  if (role === 'receiver' || role === 'service_face') return true;
  if (role === 'maintenance_part') {
    const c = record.itinerary.lanternWard.custody, link = c?.clamp;
    return ['maintenance', 'service_face'].includes(c.holder) && c.serial === LANTERN_WARD_PART_SERIAL
      && link?.active === true && typeof link.attachmentId === 'string'
      && link.ownerRecordId === LANTERN_WARD_RECORD_IDS[c.holder]
      && link.targetRecordId === LANTERN_WARD_RECORD_IDS.maintenance_part;
  }
  if (role !== 'lamp' && role !== 'cradle') return false;
  const custody = record.itinerary.lanternWard.custody, clamp = custody?.clamp;
  return clamp?.active === true && typeof clamp.attachmentId === 'string' && clamp.attachmentId.length > 0
    && clamp.targetRecordId === LANTERN_WARD_RECORD_IDS.lamp
    && (clamp.ownerRecordId === LANTERN_WARD_RECORD_IDS.cradle
      || (role === 'lamp' && clamp.ownerRecordId === LANTERN_WARD_RECORD_IDS.receiver))
    && (role === 'cradle' ? custody.loadSerial === LANTERN_WARD_LAMP_SERIAL
      : custody.serial === LANTERN_WARD_LAMP_SERIAL && ['cradle', 'receiver'].includes(custody.holder));
}

/** Allocation-free recipe admission. Runtime bindings independently require
 * the same entity object and occupant generation before admitting live work. */
export function isLanternWardHardwareEntity(entity) {
  const d = entity?.data, role = d?.lanternWardRole;
  return entity?.type === 'payload' && roleById.get(d?.worldRecordId) === role
    && role != null && d.lanternWardId === LANTERN_WARD_ID
    && (role !== 'lamp' || d.lanternWardSerial === LANTERN_WARD_LAMP_SERIAL)
    && (role !== 'maintenance_part' || d.lanternWardSerial === LANTERN_WARD_PART_SERIAL);
}

/** Capture only an exact recipe identity, never a same-name or recycled-id body. */
export function captureLanternWardHardware(entity) {
  if (!isLanternWardHardwareEntity(entity)) return null;
  const d = entity.data, role = d.lanternWardRole;
  return {
    kind: 'lantern_ward',
    lanternWard: {
      version: 1, role, identity: d.worldRecordId,
      serial: role === 'lamp' ? LANTERN_WARD_LAMP_SERIAL : role === 'maintenance_part' ? LANTERN_WARD_PART_SERIAL : null,
      custody: copy(d.lanternWardCustody), manifest: copy(d.cargoManifest),
      phase: phases.has(d.lanternWardPhase) ? d.lanternWardPhase : 'waiting',
      progress: unit(d.lanternWardProgress01), clamp: unit(d.lanternWardClamp01),
      damage: unit(d.lanternWardDamage01), lit: d.lanternWardLit === true,
      repaired: d.lanternWardRepaired === true,
    },
  };
}

/** Fresh construction or exact world-record restoration. No clocks or live writes. */
export function lanternWardHardwareSpec(role, record = null) {
  if (!LANTERN_WARD_HARDWARE_ROLES.includes(role)) throw new RangeError(`Unknown Lantern Ward hardware ${role}`);
  if (record && lanternWardHardwareRoleForRecord(record) !== role) return null;
  const c = contract(role), saved = record?.itinerary?.lanternWard;
  const anchor = lanternWardCanonicalAnchor();
  if (!anchor) return null;
  const pos = record ? { ...record.pos } : role === 'maintenance_part'
    ? lanternWardPoint(anchor, 'maintenanceSource')
    : lanternWardPoint(anchor, role === 'service_face' ? 'maintenanceFace' : role);
  const dynamic = role === 'cradle' || role === 'lamp' || role === 'obstruction' || role === 'maintenance_part';
  const manifest = record ? saved.manifest : (role === 'lamp' ? {
    manifestId: LANTERN_WARD_LAMP_SERIAL, lotId: LANTERN_WARD_LAMP_SERIAL,
    destinationId: LANTERN_WARD_RECORD_IDS.receiver,
    lines: [{ commodityId: 'cmdty_electronics', qty: 1 }], totalQty: 1,
    custody: { holderId: LANTERN_WARD_RECORD_IDS.cradle },
  } : role === 'maintenance_part' ? {
    manifestId: LANTERN_WARD_PART_SERIAL, lotId: LANTERN_WARD_PART_SERIAL,
    destinationId: LANTERN_WARD_RECORD_IDS.service_face,
    lines: [{ commodityId: 'cmdty_comp_hullplate', qty: 1 }], totalQty: 1,
    custody: { holderId: 'lantern-ward:maintenance-source' },
  } : null);
  const spec = {
    type: 'payload', alive: true, team: 2, factionId: 'faction_free',
    pos, vel: record ? { ...record.vel } : { x: 0, z: 0 },
    rot: record ? record.rot : role === 'obstruction' ? Math.PI / 2 : 0,
    angVel: record ? record.angVel : 0,
    radius: c.radius, mass: masses[role], hull: record?.hull ?? hulls[role], hullMax: hulls[role],
    collides: true, flags: { persistent: true }, homeSectorId: LANTERN_WARD_SECTOR,
    physicsBody: {
      schemaVersion: 1, dynamic, radius: c.radius, mass: masses[role],
      inertiaY: masses[role] * (c.size[0] ** 2 + c.size[2] ** 2) / 12,
      shape: 'compound', collisionProxyManifest: lanternWardHardwareCollision(role),
      ccd: true, material: dynamic ? 'payload' : 'prop', revision: 0,
    },
    data: {
      name: names[role], scanLabel: names[role], lanternWardId: LANTERN_WARD_ID,
      lanternWardRole: role, worldRecordId: LANTERN_WARD_RECORD_IDS[role],
      identityKey: LANTERN_WARD_RECORD_IDS[role], persistenceOwner: 'worldRecords',
      worldRecordNamed: true, homeSectorId: LANTERN_WARD_SECTOR, sectorId: LANTERN_WARD_SECTOR,
      transientSector: false, lifetime: Infinity, physicalCustodyOnly: true,
      worldSiteTargetable: true,
      towable: dynamic, masslineTetherable: dynamic, salvagePool: {}, loot: [],
      ...(role === 'lamp' ? { lanternWardSerial: LANTERN_WARD_LAMP_SERIAL } : {}),
      ...(role === 'maintenance_part' ? { lanternWardSerial: LANTERN_WARD_PART_SERIAL, commodityId: 'cmdty_comp_hullplate' } : {}),
      ...(['cradle', 'receiver', 'service_face'].includes(role)
        ? { combatProfileId: 'combat_profile_lantern_hardware' } : {}),
      lanternWardCustody: record ? copy(saved.custody) : (role === 'lamp' ? { holder: 'cradle', serial: LANTERN_WARD_LAMP_SERIAL }
        : role === 'maintenance_part' ? { holder: 'source', serial: LANTERN_WARD_PART_SERIAL } : { holder: 'ward' }),
      ...(manifest ? { cargoManifest: copy(manifest) } : {}),
      lanternWardPhase: saved?.phase || 'waiting', lanternWardProgress01: unit(saved?.progress),
      lanternWardClamp01: unit(saved?.clamp), lanternWardDamage01: unit(saved?.damage),
      lanternWardLit: saved?.lit === true, lanternWardRepaired: saved?.repaired === true,
      lanternWardWorkerPresent: false,
    },
  };
  spec.data.itinerary = captureLanternWardHardware(spec);
  return spec;
}
