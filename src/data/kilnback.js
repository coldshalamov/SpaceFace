// SF20-08: a finite furnace tug. These clocks describe actual source phases, not VFX timers.
export const KILNBACK = Object.freeze({
  enemyId: 'kilnback', encounterId: 'kilnback_intro', persistenceOwner: 'kilnback',
  sectorId: 'sector_ceres_belt', preheatTicks: 72, burnTicks: 108, ventTicks: 150,
  pulseTicks: 18, pulseSeconds: 0.45, range: 160, halfAngle: 25 * Math.PI / 180,
  damagePerSecond: 32, heatPerSecond: 18, coolantPerCask: 3,
  coolantRadius: 90, coolantSeconds: 4, collarHull: 20, caskHull: 35,
  acquireRange: 245, sightRange: 600, earliestSeconds: 240, encounterSeconds: 105,
});
export const KILNBACK_CASK_IDS = Object.freeze(['cask_port', 'cask_starboard']);
// Retained checkpoint recipe. Add to the live roster only with its runtime/art integration.
export const KILNBACK_ENEMY = Object.freeze({
  id: 'kilnback', name: 'Kilnback', shipId: 'ship_hawser',
  silhouette: 'kilnback', factionId: 'faction_reach', aiArchetype: 'brawler',
  combatDoctrineId: 'brawler_commit', levelRange: [2, 4],
  hull: 220, armor: 24, armorFlat: 1, shield: 0, shieldRegen: 0,
  cap: 80, capRegen: 0, maxSpeed: 45, accel: 18, turnRate: 0.55,
  collisionRadius: 23, mass: 180, weapons: [],
  aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 140, leashRadius: 1000 },
  rareSpecialist: true, physicalClass: 'specialist', shipClass: 'freighter', bountyCr: 240,
  telegraph: { bark: 'warn', line: 'Furnace charging. Cross its nose, break a cask, or tow it into its own heat.', cue: 'furnace_preheat' },
  counterHint: 'finite_coolant_directional_heat',
  behavior: 'finite furnace tug; committed heat lanes, vulnerable coolant casks and a long vent window',
  loot: { creditsRange: [70, 130], drops: [] },
});
const phases = new Set(['approach', 'preheat', 'burn', 'vent', 'retreat', 'lost']);
const caskStates = new Set(['attached', 'releasing', 'drifting', 'spent', 'destroyed']);
const bounded = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
export function freshKilnbackActor(key, tick = 0) {
  return { key, phase: 'approach', phaseStartTick: tick, attack: 0, pulse: 0,
    aimAngle: 0, aimPoint: null, targetId: null, bodyRevision: 0, ventUntilTick: 0,
    casks: Object.fromEntries(KILNBACK_CASK_IDS.map(id => [id,
      { status: 'attached', coolant: KILNBACK.coolantPerCask, collar: KILNBACK.collarHull,
        hull: KILNBACK.caskHull, pose: null, fieldCreated: false }])),
  };
}
export function normalizeKilnbackActor(raw, key, tick = 0) {
  const row = freshKilnbackActor(key, tick);
  if (!raw || raw.key !== key) return row;
  row.phase = phases.has(raw.phase) ? raw.phase : 'approach';
  for (const field of ['phaseStartTick', 'attack', 'pulse', 'bodyRevision', 'ventUntilTick'])
    row[field] = Math.floor(bounded(raw[field], 0, Number.MAX_SAFE_INTEGER, row[field]));
  row.pulse = Math.min(6, row.pulse);
  row.aimAngle = bounded(raw.aimAngle, -Math.PI * 2, Math.PI * 2, 0);
  row.targetId = raw.targetId ?? null;
  row.targetLife = Number.isSafeInteger(raw.targetLife) ? raw.targetLife : null;
  if (Number.isFinite(raw.aimPoint?.x) && Number.isFinite(raw.aimPoint?.z)) row.aimPoint = { ...raw.aimPoint };
  for (const id of KILNBACK_CASK_IDS) {
    const v = raw.casks?.[id]; if (!v) continue;
    const c = row.casks[id]; c.status = caskStates.has(v.status) ? v.status : 'attached';
    c.coolant = bounded(v.coolant, 0, KILNBACK.coolantPerCask, 0);
    c.collar = bounded(v.collar, 0, KILNBACK.collarHull, 0);
    c.hull = bounded(v.hull, 0, KILNBACK.caskHull, 0); c.fieldCreated = v.fieldCreated === true;
    if (['x', 'z', 'vx', 'vz', 'rot', 'spin'].every(k => Number.isFinite(v.pose?.[k]))) c.pose = { ...v.pose };
  }
  return row;
}
export function kilnbackCoolant(row) {
  return KILNBACK_CASK_IDS.reduce((sum, id) => sum + (row.casks[id].status === 'attached' ? row.casks[id].coolant : 0), 0);
}
export function normalizeKilnbackThermalRecipe(raw) {
  if (raw?.family !== 'kilnback' || !['burn', 'coolant'].includes(raw.kind)
    || typeof raw.sourceKey !== 'string' || !raw.sourceKey || raw.sourceKey.length > 180) return null;
  return { family: 'kilnback', kind: raw.kind, sourceKey: raw.sourceKey,
    attackId: typeof raw.attackId === 'string' ? raw.attackId.slice(0, 180) : raw.sourceKey,
    ownerLife: Number.isSafeInteger(raw.ownerLife) ? raw.ownerLife : null,
    damagePerSecond: raw.kind === 'burn' ? Math.max(0, Math.min(64, Number(raw.damagePerSecond) || 0)) : 0,
    heatPerSecond: raw.kind === 'burn' ? Math.max(0, Math.min(36, Number(raw.heatPerSecond) || 0)) : 0 };
}
// Native point velocity is captured before the part leaves the parent's compound.
export function kilnbackPointPose(entity, socket, nativeBody = null) {
  const rot = entity.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
  const dx = socket.x * c - socket.z * s, dz = socket.x * s + socket.z * c;
  const x = entity.pos.x + dx, z = entity.pos.z + dz;
  let vx = (entity.vel?.x || 0) - (entity.angVel || 0) * dz;
  let vz = (entity.vel?.z || 0) + (entity.angVel || 0) * dx;
  if (nativeBody?.velocityAtPoint) { const v = nativeBody.velocityAtPoint({ x, y: 0, z }); vx = v.x; vz = v.z; }
  return { x, z, vx, vz, rot, spin: entity.angVel || 0 };
}
