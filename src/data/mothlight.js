// SF20-10: four original lamps, two visible at once, one ordinary true gun.
export const MOTHLIGHT = Object.freeze({ enemyId: 'mothlight', encounterId: 'mothlight_intro',
  persistenceOwner: 'mothlight', sectorId: 'sector_io_reach', earliestSeconds: 240,
  encounterSeconds: 180, deployTicks: 48, observeTicks: 66, chargeTicks: 66,
  reloadTicks: 180, repositionTicks: 48, lampLifetimeS: 45, range: 1100,
  weaponId: 'wpn_railgun_m', lampMass: 2, dryMass: 52 });
export const MOTHLIGHT_LAMP_IDS = Object.freeze(['lamp_1', 'lamp_2', 'lamp_3', 'lamp_4']);
export const MOTH_ENEMY = Object.freeze({ id: MOTHLIGHT.enemyId, name: 'Mothlight', shipId: 'ship_wasp',
  silhouette: 'mothlight', factionId: 'faction_reach', aiArchetype: 'sniper',
  combatDoctrineId: 'ranged_disengager', levelRange: [5, 8], hull: 95, armor: 10,
  armorFlat: 0, shield: 40, shieldRegen: 1.5, cap: 70, capRegen: 8,
  maxSpeed: 85, accel: 35, turnRate: 1.9, collisionRadius: 16, mass: 60,
  weapons: [{ id: MOTHLIGHT.weaponId }], rareSpecialist: true, physicalClass: 'specialist', shipClass: 'fighter',
  aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 460, leashRadius: 1400 },
  bountyCr: 340, loot: null,
  telegraph: { bark: 'warn', line: 'The six-petal iris is the real gun. The little lights only drift.', cue: 'mothlight_iris' },
  counterHint: 'physical_decoys_true_iris', behavior: 'finite ballistic decoy tender; a visible iris warns before one true shot' });

export function mothlightFlightModel(body, base = {}) {
  return { ...base, mass: body.mass, inertia: body.inertiaY, mainAccel: MOTH_ENEMY.accel,
    reverseAccel: MOTH_ENEMY.accel * .4, strafeAccel: MOTH_ENEMY.accel * .6,
    maxSpeed: MOTH_ENEMY.maxSpeed, maxYawRate: MOTH_ENEMY.turnRate,
    angularAccel: MOTH_ENEMY.turnRate * 3, angularBrake: MOTH_ENEMY.turnRate * 5,
    normalMaxSpeedMult: 1, boostMult: 1, boostMaxSpeedMult: 1 };
}

const owners = new WeakMap();
export function registerMothlightOwner(state, owner) { if (owner) owners.set(state, owner); else owners.delete(state); }
// All ordinary NPCs retain the weapons owner's authorization. A Mothlight source can only
// expose its one already-authenticated action; this predicate spends no cap or weapon state.
export function mothlightAllowsFire(state, entity) {
  if (entity?.data?.lootTableId !== MOTHLIGHT.enemyId) return true;
  return owners.get(state)?.allowsFire(entity) === true;
}
export function mothlightScannerReading(state, entity) { return owners.get(state)?.scannerReading(entity) || null; }
export function freshMothlightActor(key, tick = 0) {
  return { key, phase: 'approach', phaseStartTick: tick, nextAttackTick: null, attack: 0,
    acceptedAttack: null, targetId: null, targetLife: null, bodyRevision: 0,
    localRngState: 0x6d6f7468, learnedDecoy: false, lastVoiceAt: -90,
    milestones: [], lamps: Object.fromEntries(MOTHLIGHT_LAMP_IDS.map(id => [id,
      { status: 'stowed', pose: null, expiresAt: null, scanned: false, hull: 1 }])) };
}
const phases = new Set(['approach', 'deploy', 'observe', 'false_charge', 'true_charge', 'reload', 'reposition', 'retreat', 'lost']);
const fates = new Set(['stowed', 'releasing', 'drifting', 'destroyed', 'expired']);
export function normalizeMothlightActor(raw, key, tick = 0) {
  const row = freshMothlightActor(key, tick); if (!raw || raw.key !== key) return row;
  row.phase = phases.has(raw.phase) ? raw.phase : 'approach';
  for (const field of ['phaseStartTick', 'attack', 'bodyRevision'])
    row[field] = Number.isSafeInteger(raw[field]) && raw[field] >= 0 ? raw[field] : 0;
  row.localRngState = (raw.localRngState >>> 0) || row.localRngState;
  row.learnedDecoy = raw.learnedDecoy === true;
  row.lastVoiceAt = Number.isFinite(raw.lastVoiceAt) ? raw.lastVoiceAt : -90;
  row.milestones = [...new Set((raw.milestones || []).filter(v => ['deployed', 'identified', 'true_shot', 'empty'].includes(v)))];
  row.targetId = raw.targetId ?? null;
  for (const id of MOTHLIGHT_LAMP_IDS) {
    const v = raw.lamps?.[id]; if (!v) continue;
    const lamp = row.lamps[id]; lamp.status = fates.has(v.status) ? v.status : 'destroyed';
    lamp.scanned = v.scanned === true; lamp.hull = Math.max(0, Math.min(1, Number(v.hull) || 0));
    lamp.expiresAt = Number.isFinite(v.expiresAt) && v.expiresAt >= 0 ? v.expiresAt : null;
    if (['x', 'z', 'vx', 'vz', 'rot', 'spin'].every(k => Number.isFinite(v.pose?.[k]))) lamp.pose = { ...v.pose };
  }
  // Malformed saves cannot create a third visible original. Excess records remain spent,
  // and afterContinue retires any corresponding body instead of returning it to stock.
  for (const id of mothlightActiveLampIds(row).slice(2)) row.lamps[id].status = 'destroyed';
  // A restored warning is cold. The original stock/fates survive, but no old or future
  // attack tick can turn loading the game into an untelegraphed shot.
  if (!['lost', 'retreat'].includes(row.phase)) { row.phase = 'reload'; row.phaseStartTick = tick; }
  return row;
}
export function mothlightStock(row) { return MOTHLIGHT_LAMP_IDS.filter(id => row.lamps[id].status === 'stowed').length; }
export function mothlightActiveLampIds(row) { return MOTHLIGHT_LAMP_IDS.filter(id => ['releasing', 'drifting'].includes(row.lamps[id].status)); }
export function mothlightPointPose(e, socket, body = null) {
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
  const dx = socket.x * c - socket.z * s, dz = socket.x * s + socket.z * c;
  const x = e.pos.x + dx, z = e.pos.z + dz;
  const v = body?.velocityAtPoint?.({ x, y: 0, z });
  return { x, z, vx: v?.x ?? ((e.vel?.x || 0) - (e.angVel || 0) * dz),
    vz: v?.z ?? ((e.vel?.z || 0) + (e.angVel || 0) * dx), rot: e.rot || 0, spin: e.angVel || 0 };
}
