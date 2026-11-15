// Detached capital plates are finite physical salvage, not new boss spawns. The live
// entity envelope carries exact bodies through Continue; world records carry them while
// their campaign sector is retired. Neither route replays a tear or refills the pool.
const clone = value => JSON.parse(JSON.stringify(value));
const BODY_KEYS = ['radius', 'mass', 'collides', 'collisionProxy', 'physicsBody', 'ttl'];
const DATA_KEYS = ['kind', 'label', 'scanLabel', 'name', 'masslineTetherable', 'capitalPlate',
  'fractureVisual', 'fractureVictimRadius', 'loot', 'salvagePool', 'salvageTimeLeft', '_carry', 'identityKey'];

export function isDetachedCapitalPlate(entity) {
  const plate = entity?.data?.capitalPlate;
  return entity?.type === 'wreck' && !!plate
    && typeof plate.fightId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,159}$/.test(plate.fightId)
    && !['constructor', 'prototype', '__proto__'].includes(plate.fightId)
    && typeof plate.plateId === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(plate.plateId);
}

export function isCapitalPlateRecord(record) {
  return (record?.extra != null && Object.hasOwn(record.extra, 'capitalPlateSource'))
    || (typeof record?.identityKey === 'string' && record.identityKey.startsWith('capital_plate:'));
}

export function captureCapitalPlateSource(entity, recordId) {
  if (!isDetachedCapitalPlate(entity) || entity.data.capitalPlate.fightId.startsWith('swarm:')) return null;
  const source = { version: 1, recordId, body: {}, data: {} };
  for (const key of BODY_KEYS) {
    if (entity[key] !== undefined && !(key === 'ttl' && !Number.isFinite(entity[key]))) source.body[key] = clone(entity[key]);
  }
  for (const key of DATA_KEYS) if (entity.data[key] !== undefined) source.data[key] = clone(entity.data[key]);
  return source;
}

export function capitalPlateSpecFromRecord(record) {
  const source = record?.extra?.capitalPlateSource;
  const plate = source?.data?.capitalPlate;
  const identityKey = plate ? `capital_plate:${plate.fightId}/${plate.plateId}` : null;
  if (!source || source.version !== 1 || source.recordId !== record.recordId
    || record.kind !== 'wreck' || record.type !== 'wreck' || record.markerId || record.missionId
    || record.enemyTypeId != null || record.isBoss === true
    || !isDetachedCapitalPlate({ type: 'wreck', data: source.data })
    || source.data.capitalPlate.fightId.startsWith('swarm:')
    || record.identityKey !== identityKey || source.data.identityKey !== identityKey
    || !Number.isFinite(source.data.salvageTimeLeft) || source.data.salvageTimeLeft < 0
    || (source.data._carry != null && (!Number.isFinite(source.data._carry) || source.data._carry < 0))
    || !Number.isFinite(source.body?.mass) || source.body.mass <= 0
    || !Number.isFinite(source.body?.radius) || source.body.radius <= 0
    || source.body.collides !== true || source.body.physicsBody?.dynamic !== true
    || !Number.isFinite(source.body.physicsBody.radius) || source.body.physicsBody.radius <= 0
    || !source.data.salvagePool || typeof source.data.salvagePool !== 'object'
    || Array.isArray(source.data.salvagePool)
    || !Object.entries(source.data.salvagePool).every(([id, qty]) => /^cmdty_[a-z0-9_]+$/.test(id)
      && Number.isFinite(qty) && qty >= 0)) return null;
  return { ...clone(source.body), type: 'wreck', factionId: record.factionId, team: record.team,
    pos: { ...record.pos }, vel: { ...record.vel }, rot: record.rot, angVel: record.angVel,
    hull: record.hull, hullMax: record.hullMax, flags: { noInterp: true },
    data: { ...clone(source.data), worldRecordId: record.recordId,
      homeSectorId: record.homeSectorId, sectorId: record.sectorId, durable: true } };
}
