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
const mobileRoles = new Set(['cradle', 'lamp', 'obstruction', 'maintenance_part']);
const canonicalSectorIds = new Set(SECTORS.map(row => row.id));
const actorById = new Map(['tug', 'commuter', 'maintenance'].map(role => [LANTERN_WARD_RECORD_IDS[role], role]));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const finitePose = value => Number.isFinite(value?.pos?.x) && Number.isFinite(value.pos.z)
  && Number.isFinite(value.vel?.x) && Number.isFinite(value.vel.z)
  && Number.isFinite(value.rot) && Number.isFinite(value.angVel);
const validVitals = (value, role) => value?.hullMax === hulls[role]
  && Number.isFinite(value.hull) && value.hull > 0 && value.hull <= value.hullMax;

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

function validRecordSector(record, role, holder) {
  if (record.homeSectorId !== LANTERN_WARD_SECTOR) return false;
  if (record.sectorId === LANTERN_WARD_SECTOR) return true;
  // Custody can travel; provenance cannot. Moving an original across an ordinary
  // sector boundary must not turn it into a missing object after Continue.
  return mobileRoles.has(role) && canonicalSectorIds.has(record.sectorId)
    && !(role === 'lamp' && holder === 'receiver')
    && !(role === 'maintenance_part' && holder === 'service_face');
}

export function lanternWardHardwareRoleForRecord(record) {
  const role = roleById.get(record?.recordId), saved = record?.itinerary?.lanternWard;
  if (!role || record.extra?.lanternWardInvalid === true || record.type !== 'payload'
      || !validRecordSector(record, role, saved?.custody?.holder)
      || record.enemyTypeId != null || record.shipDefId != null || record.identityKey !== record.recordId
      || record.alive === false || ['destroyed', 'defeated'].includes(record.outcome)
      || record.itinerary?.kind !== 'lantern_ward' || saved?.role !== role
      || saved.version !== 1 || saved.identity !== record.recordId || saved.invalid === true
      || (role === 'lamp' && saved.serial !== LANTERN_WARD_LAMP_SERIAL)
      || (role === 'maintenance_part' && saved.serial !== LANTERN_WARD_PART_SERIAL)
      || !finitePose(record) || !validVitals(record, role)
      || !validCustody(role, saved.custody)
      || (role === 'lamp' || role === 'maintenance_part')
        && !validManifest(role, saved.manifest, saved.custody)) return null;
  return role;
}

function validClamp(clamp, ownerRecordId, targetRecordId, defId) {
  return clamp?.active === true && nonempty(clamp.attachmentId)
    && clamp.ownerRecordId === ownerRecordId && clamp.targetRecordId === targetRecordId
    // v1 custody receipts predate these optional provenance fields. A restored
    // receipt never authorizes service: the live job must adopt an actual native
    // attachment with the required definition, mode and occupant generations.
    && (clamp.defId == null || clamp.defId === defId)
    && (clamp.controlMode == null || clamp.controlMode === 'lantern_ward_attended_work');
}
function validCustody(role, custody) {
  if (!custody || typeof custody !== 'object' || Array.isArray(custody)) return false;
  const holder = custody.holder, link = custody.clamp;
  if (role === 'lamp' || role === 'maintenance_part') {
    const lamp = role === 'lamp', serial = lamp ? LANTERN_WARD_LAMP_SERIAL : LANTERN_WARD_PART_SERIAL;
    if (custody.serial !== serial) return false;
    if (holder === 'loose' || holder === 'player') return link == null;
    if (lamp && holder === 'cradle') return link == null
      || validClamp(link, LANTERN_WARD_RECORD_IDS.cradle, LANTERN_WARD_RECORD_IDS.lamp, 'attachment_transport_clamp');
    if (lamp && holder === 'receiver') return validClamp(link,
      LANTERN_WARD_RECORD_IDS.receiver, LANTERN_WARD_RECORD_IDS.lamp, 'attachment_transport_clamp');
    if (!lamp && holder === 'source') return link == null;
    if (!lamp && (holder === 'maintenance' || holder === 'service_face')) return validClamp(link,
      LANTERN_WARD_RECORD_IDS[holder], LANTERN_WARD_RECORD_IDS.maintenance_part,
      holder === 'maintenance' ? 'tether_standard' : 'attachment_transport_clamp');
    return false;
  }
  if (role === 'cradle') {
    if (holder !== 'ward' && holder !== 'player') return false;
    if (custody.loadSerial == null && link == null) return true;
    return custody.loadSerial === LANTERN_WARD_LAMP_SERIAL
      && validClamp(link, LANTERN_WARD_RECORD_IDS.cradle, LANTERN_WARD_RECORD_IDS.lamp, 'attachment_transport_clamp');
  }
  return holder === 'ward' && link == null && custody.loadSerial == null;
}
function validManifest(role, manifest, custody) {
  const lamp = role === 'lamp', serial = lamp ? LANTERN_WARD_LAMP_SERIAL : LANTERN_WARD_PART_SERIAL;
  const holderId = custody?.holder === 'source' ? 'lantern-ward:maintenance-source'
    : LANTERN_WARD_RECORD_IDS[custody?.holder] || custody?.holder;
  return manifest?.manifestId === serial && manifest.lotId === serial
    && manifest.destinationId === LANTERN_WARD_RECORD_IDS[lamp ? 'receiver' : 'service_face'] && manifest.totalQty === 1
    && Array.isArray(manifest.lines) && manifest.lines.length === 1
    && manifest.lines[0]?.commodityId === (lamp ? 'cmdty_electronics' : 'cmdty_comp_hullplate')
    && manifest.lines[0]?.qty === 1 && nonempty(holderId) && manifest.custody?.holderId === holderId;
}

/** Pure catch-up gate. A remembered load is fixed only by an exact accepted
 * native clamp receipt; a loose/stolen body retains normal ballistic catch-up. */
export function lanternWardRecordHasCustody(record) {
  const actor = actorById.get(record?.recordId);
  if (actor) return record.type === 'ship' && record.alive !== false && record.playerOwned !== true
    && record.extra?.lanternWardInvalid !== true && !['destroyed', 'defeated'].includes(record.outcome)
    && record.sectorId === LANTERN_WARD_SECTOR && record.homeSectorId === LANTERN_WARD_SECTOR
    && record.shipDefId === (actor === 'tug' ? 'ship_mule' : 'ship_drifter')
    && record.jobId === `job:${record.recordId}` && finitePose(record)
    && Number.isFinite(record.hull) && record.hull > 0 && Number.isFinite(record.hullMax)
    && record.hullMax > 0 && record.hull <= record.hullMax
    && record.itinerary?.kind === 'lantern_ward_actor' && record.itinerary.lanternWard?.version === 1
    && record.itinerary.lanternWard.role === actor && record.itinerary.lanternWard.identity === record.recordId
    && record.itinerary.lanternWard.workLease === 'lantern_ward_attended_work';
  const role = lanternWardHardwareRoleForRecord(record);
  if (role === 'receiver' || role === 'service_face') return true;
  if (role === 'maintenance_part') {
    const c = record.itinerary.lanternWard.custody, link = c?.clamp;
    return (c.holder === 'maintenance' || c.holder === 'service_face') && link?.active === true;
  }
  if (role !== 'lamp' && role !== 'cradle') return false;
  const custody = record.itinerary.lanternWard.custody, clamp = custody?.clamp;
  return clamp?.active === true;
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

/** Complete live finite-workpiece contract. Keep the cheaper identity predicate
 * above for capture: corrupted originals still need an unavailable durable row.
 * The job separately proves native body ownership and exact live attachment
 * generations; this predicate cannot grant either authority from saved tags. */
export function isLanternWardWorkpieceEligible(entity) {
  if (!isLanternWardHardwareEntity(entity) || entity.alive === false) return false;
  const d = entity.data, role = d.lanternWardRole, recipe = d.itinerary?.lanternWard;
  return (role === 'lamp' || role === 'maintenance_part') && d.lanternWardInvalid !== true
    && d.identityKey === LANTERN_WARD_RECORD_IDS[role] && d.persistenceOwner === 'worldRecords'
    && entity.homeSectorId === LANTERN_WARD_SECTOR && d.homeSectorId === LANTERN_WARD_SECTOR && d.physicalCustodyOnly === true
    && d.itinerary?.kind === 'lantern_ward' && recipe?.version === 1 && recipe.invalid !== true
    && recipe.role === role && recipe.identity === LANTERN_WARD_RECORD_IDS[role]
    && recipe.serial === (role === 'lamp' ? LANTERN_WARD_LAMP_SERIAL : LANTERN_WARD_PART_SERIAL)
    && finitePose(entity) && validVitals(entity, role)
    && validCustody(role, d.lanternWardCustody) && validManifest(role, d.cargoManifest, d.lanternWardCustody);
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
      ...((role === 'lamp' || role === 'maintenance_part') && !isLanternWardWorkpieceEligible(entity)
        ? { invalid: true } : {}),
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
  const dynamic = mobileRoles.has(role);
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
      worldRecordNamed: true, homeSectorId: LANTERN_WARD_SECTOR, sectorId: record?.sectorId || LANTERN_WARD_SECTOR,
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
  // Establish the immutable recipe identity before capture checks the complete
  // live contract. This initial construction is the only fresh-original path.
  spec.data.itinerary = { kind: 'lantern_ward', lanternWard: { version: 1, role,
    identity: LANTERN_WARD_RECORD_IDS[role],
    serial: role === 'lamp' ? LANTERN_WARD_LAMP_SERIAL : role === 'maintenance_part' ? LANTERN_WARD_PART_SERIAL : null,
  } };
  spec.data.itinerary = captureLanternWardHardware(spec);
  return spec;
}
