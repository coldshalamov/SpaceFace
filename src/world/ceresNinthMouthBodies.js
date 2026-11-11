// Pure finite-original recipes. World records, not the rescue job, own bodies.
import { CERES_NINTH_MOUTH as CUT, ninthMouthSpecs, worldPoint } from '../data/ceresNinthMouth.js';
import { makeShipEntitySpec } from '../systems/ships.js';
import { ensurePhysicsBodySpec } from '../core/physicsAuthority.js';
import { SECTORS } from '../data/sectors.js';
export const NINTH_MOUTH_ROLES = Object.freeze([...CUT.definitions.map(d => d.role), 'barge']);
const identity = role => `${CUT.id}:${role}`;
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const point = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const pose = r => point(r.pos) && point(r.vel) && Number.isFinite(r.rot) && Number.isFinite(r.angVel);
const passive = () => ({ passive: true, allowPassiveManeuver: false, roe: 'hold_fire', spawnContext: 'convoy_civilian' });
const rolesByIdentity = new Map(NINTH_MOUTH_ROLES.map(role => [identity(role), role]));
const roleOf = id => rolesByIdentity.get(id) || null;
const fixed = role => role === 'receiver' || role.startsWith('shoulder_');
export function isNinthMouthRecordIdentity(record) {
  return typeof record?.recordId === 'string' && record.recordId.startsWith(`${CUT.id}:`);
}
export function isNinthMouthBody(entity) {
  const d = entity?.data;
  return !!roleOf(d?.worldRecordId) && d.ninthMouthIdentity === d.worldRecordId
    && d.ninthMouthRole === roleOf(d.worldRecordId);
}
function template(role) {
  if (role !== 'barge') return ninthMouthSpecs().find(s => s.data.ninthMouthRole === role) || null;
  const spec = makeShipEntitySpec(CUT.barge.defId, { team: 2, factionId: 'faction_free',
    pos: worldPoint(CUT.barge.local), rot: CUT.barge.rot, ai: passive() });
  spec.homeSectorId = CUT.sectorId;
  spec.flags = { ...spec.flags, persistent: true };
  spec.vel = { x: 0, z: 0 }; spec.angVel = 0;
  spec.data.name = 'Ninth Mouth · Last Barge';
  ensurePhysicsBodySpec(spec);
  return spec;
}
const canonicalBodies = new Map();
const canonicalSpecs = new Map();
function contractFor(role) {
  if (!canonicalSpecs.has(role)) {
    const spec = template(role);
    canonicalSpecs.set(role, spec);
    canonicalBodies.set(role, copy(spec.physicsBody));
  }
  return canonicalSpecs.get(role);
}
function validVitals(entity, role) {
  const canonical = contractFor(role);
  for (const [value, maximum] of [['hull','hullMax'], ['shield','shieldMax'], ['armorHp','armorMax']]) {
    const max = canonical[maximum] ?? 0, actualMax = entity[maximum] ?? 0, actual = entity[value] ?? 0;
    if (!Number.isFinite(actualMax) || actualMax !== max
      || !Number.isFinite(actual) || actual < 0 || actual > actualMax) return false;
  }
  return entity.hull > 0;
}
// Admission checks are stronger than the cheap capture identity. They do not
// confer native attachment authority or prove occupant generation continuity.
export function isNinthMouthBodyEligible(entity) {
  if (!isNinthMouthBody(entity) || entity.alive === false) return false;
  const d = entity.data, role = d.ninthMouthRole, canonical = contractFor(role);
  if (entity.type !== canonical.type || entity.radius !== canonical.radius || entity.mass !== canonical.mass
    || d.persistenceOwner !== 'worldRecords' || d.identityKey !== d.worldRecordId
    || entity.homeSectorId !== CUT.sectorId || d.homeSectorId !== CUT.sectorId
    || (role === 'barge' ? d.defId !== CUT.barge.defId : d.defId != null)
    || !pose(entity) || !validVitals(entity, role)
    || typeof d.ninthMouthInstalled !== 'boolean' || typeof d.ninthMouthLight !== 'boolean'
    || (!role.startsWith('lamp:') && (d.ninthMouthInstalled || d.ninthMouthLight))
    || d.itinerary?.ninthMouth?.invalid === true
    || !validBody(entity.physicsBody, role, d.ninthMouthInstalled)) return false;
  return true;
}
function validBody(body, role, installed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  contractFor(role);
  const canonical = canonicalBodies.get(role);
  if (canonical && (body.radius !== canonical.radius || body.mass !== canonical.mass
    || body.shape !== canonical.shape
    || JSON.stringify(body.collisionProxyManifest) !== JSON.stringify(canonical.collisionProxyManifest))) return false;
  const dynamic = fixed(role) ? false : role.startsWith('lamp:') ? !installed : true;
  return body.dynamic === dynamic;
}
export function ninthMouthRoleForRecord(record) {
  const role = roleOf(record?.recordId), saved = record?.itinerary?.ninthMouth;
  if (!role || record.kind !== 'npc' || record.extra?.ninthMouthInvalid || record.enemyTypeId != null
    || record.identityKey !== record.recordId || record.homeSectorId !== CUT.sectorId
    || !SECTORS.some(s => s.id === record.sectorId) || !pose(record)
    || record.type !== (role === 'barge' ? 'ship' : 'payload')
    || (role === 'barge' ? record.shipDefId !== CUT.barge.defId : record.shipDefId != null)
    || record.itinerary?.kind !== 'ninth_mouth' || saved?.version !== 1
    || saved.identity !== record.recordId || saved.role !== role || saved.invalid
    || typeof saved.installed !== 'boolean' || typeof saved.light !== 'boolean'
    || (!role.startsWith('lamp:') && (saved.installed || saved.light))
    || !Number.isFinite(record.hull) || !Number.isFinite(record.hullMax)
    || record.hullMax <= 0 || record.hull < 0 || record.hull > record.hullMax
    || !validBody(saved.physicsBody, role, saved.installed)) return null;
  return role;
}
export function captureNinthMouthBody(entity) {
  if (!isNinthMouthBody(entity)) return null;
  const d = entity.data, role = d.ninthMouthRole;
  const installed = d.ninthMouthInstalled === true, light = d.ninthMouthLight === true;
  return { kind: 'ninth_mouth', ninthMouth: { version: 1, role, identity: d.worldRecordId,
    installed, light, tag: d.ninthMouthTag === true, physicsBody: copy(entity.physicsBody),
    invalid: !isNinthMouthBodyEligible(entity),
  } };
}
export function ninthMouthRecordHasCustody(record) {
  const role = ninthMouthRoleForRecord(record);
  return !!role && (fixed(role) || record.itinerary.ninthMouth.installed);
}
export function ninthMouthBodySpec(role, record = null) {
  if (!NINTH_MOUTH_ROLES.includes(role) || (record && ninthMouthRoleForRecord(record) !== role)) return null;
  const spec = template(role), saved = record?.itinerary?.ninthMouth;
  Object.assign(spec.data, { ninthMouthRole: role, ninthMouthIdentity: identity(role),
    worldRecordId: identity(role), identityKey: identity(role), persistenceOwner: 'worldRecords',
    homeSectorId: CUT.sectorId, sectorId: record?.sectorId || CUT.sectorId,
    durable: true, worldRecordNamed: true, transientSector: false,
    ninthMouthInstalled: saved?.installed === true, ninthMouthLight: record ? saved.light : spec.data.ninthMouthLight === true,
    ninthMouthTag: saved?.tag === true });
  if (role === 'barge') {
    spec.data.ai = passive(); spec.ai = passive();
  }
  if (record) {
    spec.pos = copy(record.pos); spec.vel = copy(record.vel); spec.rot = record.rot; spec.angVel = record.angVel;
    spec.physicsBody = copy(saved.physicsBody);
    for (const key of ['hull', 'hullMax', 'shield', 'shieldMax', 'armorHp', 'armorMax'])
      if (Number.isFinite(record[key])) spec[key] = record[key];
    spec.data.cargoManifest = copy(record.cargoManifest);
    spec.playerOwned = spec.data.playerOwned = record.playerOwned === true;
    spec.data.playerCreated = record.playerCreated === true;
  }
  spec.alive = true;
  spec.data.itinerary = captureNinthMouthBody(spec);
  return spec;
}
