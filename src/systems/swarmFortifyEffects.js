import { SWARM_FORTIFY_SCHEMA_VERSION, swarmFortifyDevice } from '../data/swarmFortify.js';
import { WEAPONS } from '../data/weapons.js';
import { buildWeaponDamagePacket } from './weapons.js';
import { isHostileToPlayer } from './scanner.js';

const FORTIFY_WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const MAX_TESLA_TARGETS_PER_SWEEP = 4;
const TESLA_BEAM_RADIUS = 4;

/** Runtime effects for physical Swarm Fortify structures, using combat, Brood, and weapon owners. */
export function createSwarmFortifyEffects({ state, bus, helpers, registry } = {}) {
  const nextFireTick = new Map();
  const records = [];
  const sourceRecords = [];
  const turrets = [];
  const teslaPairs = [];
  const timerKeyByEntityId = new Map();
  const serviceLocks = new Set();
  const hostiles = [];
  const hitTargets = new Array(MAX_TESLA_TARGETS_PER_SWEEP).fill(null);
  const hitT = new Float64Array(MAX_TESLA_TARGETS_PER_SWEEP);
  const broodTargetScratch = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const broodQueryScratch = { from: { x: 0, z: 0 }, range: 0 };
  let recordsInitialized = false;
  let topologyCheckChanged = false;
  let topologyCheckIndex = 0;

  function update(_dt, structures = []) {
    if (!state || (!Array.isArray(structures) && !(structures instanceof Map))) return;
    syncStructureTopology(structures);
    if (records.length === 0) return;

    const run = state.run;
    if (!isActiveSwarmWave(state)) return;
    const currentWave = run.wave;
    const player = entityFor(state, state.playerId);
    const playerTeam = Number.isFinite(player && player.team) ? player.team : 0;
    let hostileCount = -1;

    for (const pair of teslaPairs) {
      if (!isOperational(pair.a) || !isOperational(pair.b)) continue;
      const key = pair.key;
      if (!isDue(nextFireTick, key, state.tick)) continue;
      if (hostileCount < 0) hostileCount = collectWaveHostiles(state, playerTeam, currentWave, hostiles);
      fireTeslaSweep({ state, bus, helpers, registry, pair, hostiles, hostileCount, hitTargets, hitT });
      nextFireTick.set(key, state.tick + pair.intervalTicks);
    }

    for (const turret of turrets) {
      if (!isOperational(turret) || serviceLocks.has(turret.entity.id)) continue;
      const mark = turret.mark;
      const effect = turret.effect;
      const key = turret.timerKey;
      if (!isDue(nextFireTick, key, state.tick) || !selectAmmo(mark, effect)) continue;
      if (hostileCount < 0) hostileCount = collectWaveHostiles(state, playerTeam, currentWave, hostiles);
      const entityTarget = nearestTarget(turret.entity, hostiles, hostileCount, effect.range);
      const arena = registry?.get?.('swarmArena');
      let broodTarget = null;
      if (typeof arena?.queryBroodTarget === 'function') {
        broodQueryScratch.from.x = turret.entity.pos.x;
        broodQueryScratch.from.z = turret.entity.pos.z;
        broodQueryScratch.range = effect.range;
        broodTarget = arena.queryBroodTarget(broodQueryScratch, broodTargetScratch);
      }
      const target = chooseNearestTarget(turret.entity, entityTarget, broodTarget);
      if (!target) {
        nextFireTick.set(key, state.tick + turret.intervalTicks);
        continue;
      }
      const projectile = fireKineticTurret({ state, bus, registry, turret: turret.entity, target, effect });
      if (projectile) mark.ammo -= 1;
      nextFireTick.set(key, state.tick + turret.intervalTicks);
    }
  }

  function compareTopologyRecord(record) {
    if (sourceRecords[topologyCheckIndex] !== record) topologyCheckChanged = true;
    topologyCheckIndex++;
  }

  function copyTopologyRecord(record) {
    sourceRecords.push(record);
  }

  function syncStructureTopology(structures) {
    const size = structures instanceof Map ? structures.size : structures.length;
    topologyCheckChanged = !recordsInitialized || size !== sourceRecords.length;
    if (!topologyCheckChanged && structures instanceof Map) {
      topologyCheckIndex = 0;
      structures.forEach(compareTopologyRecord);
    } else if (!topologyCheckChanged) {
      for (let i = 0; i < structures.length; i++) {
        if (sourceRecords[i] !== structures[i]) { topologyCheckChanged = true; break; }
      }
    }
    if (!topologyCheckChanged) return;

    recordsInitialized = true;
    sourceRecords.length = 0;
    if (structures instanceof Map) structures.forEach(copyTopologyRecord);
    else for (const record of structures) sourceRecords.push(record);
    records.length = 0;
    turrets.length = 0;
    teslaPairs.length = 0;
    timerKeyByEntityId.clear();
    const pairByKey = new Map();
    const liveTimerKeys = new Set();

    const topologyRecords = structures instanceof Map ? structures.values() : structures;
    for (const record of topologyRecords) {
      const entity = record?.entity;
      const mark = entity?.data?.swarmFortify;
      if (!entity || !mark || mark.schemaVersion !== SWARM_FORTIFY_SCHEMA_VERSION) continue;
      const row = { record, entity, mark };
      records.push(row);
      if (mark.deviceId === 'kinetic_turret') {
        const effect = effectFor(mark.deviceId);
        const timerKey = `turret:${mark.runToken}:${entity.id}`;
        const turret = { ...row, effect, intervalTicks: positiveInt(effect.intervalTicks, 30), timerKey };
        turrets.push(turret);
        timerKeyByEntityId.set(entity.id, timerKey);
        liveTimerKeys.add(timerKey);
      } else if (mark.deviceId === 'tesla_pair'
        && mark.pairId != null && (mark.endpointIndex === 0 || mark.endpointIndex === 1)) {
        const key = `tesla:${mark.runToken}:${String(mark.pairId)}`;
        let pair = pairByKey.get(key);
        if (!pair) {
          pair = { key, a: null, b: null, effect: effectFor(mark.deviceId) };
          pairByKey.set(key, pair);
        }
        if (mark.endpointIndex === 0) pair.a = row;
        else pair.b = row;
        timerKeyByEntityId.set(entity.id, key);
      }
    }

    for (const pair of pairByKey.values()) {
      if (!pair.a || !pair.b) continue;
      pair.intervalTicks = positiveInt(pair.effect.intervalTicks, 72);
      teslaPairs.push(pair);
      liveTimerKeys.add(pair.key);
    }
    for (const key of nextFireTick.keys()) if (!liveTimerKeys.has(key)) nextFireTick.delete(key);
  }

  function remove(entityId) {
    const key = timerKeyByEntityId.get(entityId);
    if (key) nextFireTick.delete(key);
    timerKeyByEntityId.delete(entityId);
    serviceLocks.delete(entityId);
  }

  function prepareTurretReload(entityId, runToken, amount) {
    const run = state?.run;
    const entity = entityFor(state, entityId);
    const mark = entity?.data?.swarmFortify;
    const effect = effectFor('kinetic_turret');
    const maxAmmo = positiveInt(effect.ammo, 0);
    const currentAmmo = Number.isSafeInteger(mark?.ammo) ? mark.ammo : -1;
    const reloadAmount = Number.isSafeInteger(amount) ? amount : 0;
    if (!run || run.kind !== 'survival' || !['swarm', 'scored'].includes(run.ruleset)
      || !['draft', 'refit'].includes(run.phase) || !Number.isInteger(run.wave) || run.wave < 1) {
      return { ok: false, reason: 'phase_closed' };
    }
    if (!entity || entity.alive !== true || !(entity.hull > 0) || entity.type !== 'beacon'
      || entity.ownerId !== state.playerId || mark?.schemaVersion !== SWARM_FORTIFY_SCHEMA_VERSION
      || mark.deviceId !== 'kinetic_turret' || mark.runToken !== runToken
      || !Number.isInteger(mark.runWave) || mark.runWave < 1 || mark.runWave > run.wave
      || mark.operational !== true || mark.offline === true) return { ok: false, reason: 'invalid_turret' };
    if (serviceLocks.has(entityId)) return { ok: false, reason: 'service_in_progress' };
    if (currentAmmo < 0 || currentAmmo >= maxAmmo || reloadAmount <= 0 || reloadAmount > maxAmmo - currentAmmo) {
      return { ok: false, reason: 'invalid_reload_amount' };
    }

    let phase = 'prepared';
    const committedAmmo = currentAmmo + reloadAmount;
    const currentEntity = () => entityFor(state, entityId) === entity
      && entity.data?.swarmFortify === mark && mark.runToken === runToken;
    const clearLock = () => serviceLocks.delete(entityId);
    return {
      ok: true,
      commit() {
        if (phase !== 'prepared') return { ok: false, reason: 'reload_already_settled' };
        const liveRun = state?.run;
        if (!currentEntity() || liveRun !== run || !['draft', 'refit'].includes(liveRun.phase)
          || mark.ammo !== currentAmmo || entity.alive !== true || !(entity.hull > 0)
          || mark.operational !== true || mark.offline === true) return { ok: false, reason: 'stale_turret' };
        serviceLocks.add(entityId);
        mark.ammo = committedAmmo;
        phase = 'committed';
        return { ok: true, ammo: committedAmmo, maxAmmo };
      },
      rollback() {
        if (phase !== 'committed') return { ok: phase === 'rolled_back', reason: 'reload_not_committed' };
        if (currentEntity() && mark.ammo === committedAmmo) mark.ammo = currentAmmo;
        clearLock();
        phase = 'rolled_back';
        return { ok: true, ammo: currentEntity() ? mark.ammo : null };
      },
      finalize() {
        if (phase === 'finalized') return { ok: true, ammo: currentEntity() ? mark.ammo : null };
        if (phase !== 'committed') return { ok: false, reason: 'reload_not_committed' };
        clearLock();
        phase = 'finalized';
        return { ok: true, ammo: currentEntity() ? mark.ammo : null, maxAmmo };
      },
    };
  }

  return Object.freeze({ update, remove, prepareTurretReload });
}

function effectFor(deviceId) {
  return swarmFortifyDevice(deviceId)?.effect || {};
}

function isActiveSwarmWave(state) {
  const run = state && state.run;
  return state.mode === 'flight' && run && run.kind === 'survival'
    && (run.ruleset === 'swarm' || run.ruleset === 'scored')
    && run.phase === 'active' && Number.isInteger(run.wave) && run.wave > 0;
}

function entityFor(state, id) {
  return state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null;
}

function isOperational(row) {
  const mark = row?.mark;
  return row?.entity?.alive !== false && row.entity.hull > 0 && mark?.operational === true && mark?.offline !== true;
}

function collectWaveHostiles(state, playerTeam, wave, out) {
  out.length = 0;
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || (entity.type !== 'ship' && entity.type !== 'drone')
      || entity.hull <= 0 || !entity.pos || !entity.data
      || entity.data.runCohort !== 'survival' || entity.data.runWave !== wave
      || !isHostileToPlayer(entity, playerTeam, state)) continue;
    out.push(entity);
  }
  return out.length;
}

function fireTeslaSweep({ state, bus, helpers, registry, pair, hostiles, hostileCount, hitTargets, hitT }) {
  const a = pair.a.entity, b = pair.b.entity;
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const lengthSq = dx * dx + dz * dz;
  const length = Math.sqrt(lengthSq);
  const range = positive(pair.effect.range, 220);
  if (!(lengthSq > 1e-8) || length > range) return;

  let hitCount = 0;
  for (let i = 0; i < hostileCount; i++) {
    const target = hostiles[i];
    const t = Math.max(0, Math.min(1, ((target.pos.x - a.pos.x) * dx + (target.pos.z - a.pos.z) * dz) / lengthSq));
    const x = a.pos.x + dx * t;
    const z = a.pos.z + dz * t;
    const radius = positive(target.radius, 0) + TESLA_BEAM_RADIUS;
    const ex = target.pos.x - x;
    const ez = target.pos.z - z;
    if (ex * ex + ez * ez > radius * radius) continue;
    insertTeslaHit(hitTargets, hitT, target, t, hitCount++);
    if (hitCount > MAX_TESLA_TARGETS_PER_SWEEP) hitCount = MAX_TESLA_TARGETS_PER_SWEEP;
  }

  const damage = positive(pair.effect.damage, 7);
  const weaponId = 'swarm_tesla_pair';
  const weapon = { defId: weaponId, dmg: damage, damageType: 'energy' };
  const definition = { id: weaponId, dmg: damage, damageType: 'energy' };
  let appliedHits = 0;
  for (let i = 0; i < hitCount; i++) {
    const target = hitTargets[i];
    const t = hitT[i];
    const packet = buildWeaponDamagePacket(weapon, definition, damage, 'energy', {
      x: a.pos.x + dx * t, z: a.pos.z + dz * t,
    });
    const result = helpers?.routeCombatDamage?.({
      attackerId: a.id, targetId: target.id, packet,
      origin: { kind: 'weapon', id: weaponId },
    });
    if (result?.ok === true) appliedHits += 1;
  }
  const arena = registry?.get?.('swarmArena');
  if (arena && typeof arena.damageBroodSegment === 'function') {
    const result = arena.damageBroodSegment({
      from: a.pos, to: b.pos, radius: TESLA_BEAM_RADIUS, damage,
      ownerId: a.id, sourceId: weaponId, maxTargets: MAX_TESLA_TARGETS_PER_SWEEP,
    });
    appliedHits += Number.isInteger(result?.hits) ? result.hits : 0;
  }
  if (bus && typeof bus.emit === 'function') {
    const beamKey = `${pair.key}:pulse:${Number.isSafeInteger(state.tick) ? state.tick : 0}`;
    const beam = {
      ownerId: a.id, weaponId: 'wpn_beam_laser_m', hardpointIdx: 0, beamKey,
      origin: { x: a.pos.x, z: a.pos.z }, from: { x: a.pos.x, z: a.pos.z },
      to: { x: b.pos.x, z: b.pos.z }, dir: Math.atan2(dz, dx), range: length,
      continuous: true, phase: 'start', fortifyDeviceId: 'tesla_pair',
      fortifyPairId: pair.a.mark.pairId, targetCount: appliedHits,
    };
    bus.emit('combat:fire', beam);
    // The shared persistent-beam pool owns the short cooling tail; the actual damage above has
    // already been committed exactly once by combat/Brood.
    bus.emit('combat:beamStop', { ownerId: a.id, weaponId: beam.weaponId, hardpointIdx: 0,
      beamKey, continuous: true, phase: 'end', fortifyDeviceId: 'tesla_pair' });
  }
}

function insertTeslaHit(targets, tValues, target, t, count) {
  let insertAt = Math.min(count, MAX_TESLA_TARGETS_PER_SWEEP - 1);
  if (count >= MAX_TESLA_TARGETS_PER_SWEEP) {
    const last = MAX_TESLA_TARGETS_PER_SWEEP - 1;
    if (!hitBefore(t, target, tValues[last], targets[last])) return;
  }
  while (insertAt > 0 && hitBefore(t, target, tValues[insertAt - 1], targets[insertAt - 1])) {
    if (insertAt < MAX_TESLA_TARGETS_PER_SWEEP) {
      targets[insertAt] = targets[insertAt - 1];
      tValues[insertAt] = tValues[insertAt - 1];
    }
    insertAt -= 1;
  }
  targets[insertAt] = target;
  tValues[insertAt] = t;
}

function hitBefore(t, target, otherT, otherTarget) {
  return t < otherT || (t === otherT && compareId(target.id, otherTarget.id) < 0);
}

function selectAmmo(mark, effect) {
  return Number.isSafeInteger(mark.ammo) && mark.ammo > 0
    && Number.isSafeInteger(effect.ammo) && effect.ammo > 0;
}

function nearestTarget(turret, hostiles, count, range) {
  const limit = positive(range, 420) ** 2;
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < count; i++) {
    const target = hostiles[i];
    const dx = target.pos.x - turret.pos.x;
    const dz = target.pos.z - turret.pos.z;
    const distance = dx * dx + dz * dz;
    if (distance > limit) continue;
    if (distance < bestDistance || (distance === bestDistance && compareId(target.id, best.id) < 0)) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

function chooseNearestTarget(origin, entityTarget, broodTarget) {
  if (!broodTarget) return entityTarget;
  if (!entityTarget) return broodTarget;
  const dx = broodTarget.pos.x - origin.pos.x;
  const dz = broodTarget.pos.z - origin.pos.z;
  const distanceSq = dx * dx + dz * dz;
  const entityDx = entityTarget.pos.x - origin.pos.x;
  const entityDz = entityTarget.pos.z - origin.pos.z;
  const entityDistanceSq = entityDx * entityDx + entityDz * entityDz;
  if (distanceSq < entityDistanceSq) return broodTarget;
  if (distanceSq > entityDistanceSq) return entityTarget;
  return compareId(broodTarget.id, entityTarget.id) < 0 ? broodTarget : entityTarget;
}

function fireKineticTurret({ state, bus, registry, turret, target, effect }) {
  const weaponId = effect.weaponId || 'wpn_autocannon_s';
  const definition = FORTIFY_WEAPON_BY_ID.get(weaponId);
  const weaponOwner = registry?.get?.('weapons');
  if (!definition || definition.damageType !== 'kinetic' || typeof weaponOwner?._spawnProjectile !== 'function') return null;
  const mount = {
    defId: weaponId, slotIndex: 0,
    dmg: positive(effect.damage, 8), damageType: 'kinetic',
    projSpeed: positive(definition.projSpeed, 320), range: positive(effect.range, 420),
  };
  const angle = interceptAngle(turret, target, mount.projSpeed);
  let projectile = null;
  const projectiles = state.entityIndex?.projectiles;
  const projectileCountBefore = projectiles?.length || 0;
  const unsubscribe = bus?.on?.('entity:spawned', (payload) => {
    const spawned = payload?.entity || entityFor(state, payload?.id);
    if (spawned?.type === 'projectile' && spawned.ownerId === turret.id
      && spawned.data?.weaponId === weaponId) projectile = spawned;
  });
  try {
    weaponOwner._spawnProjectile(turret, mount, definition, angle, target, false, state, {});
  } finally {
    if (typeof unsubscribe === 'function') unsubscribe();
  }
  if (!projectile) {
    // Some test and worker buses do not expose entity payloads; read the newest canonical round.
    for (let i = (projectiles?.length || 0) - 1; i >= projectileCountBefore; i--) {
      const candidate = projectiles[i];
      if (candidate?.ownerId === turret.id && candidate.data?.weaponId === weaponId) {
        projectile = candidate;
        break;
      }
    }
  }
  if (!projectile) return null;
  // The presentation reads this aim without rotating the fixed collision body.
  turret.data.swarmFortify.aimHeading = angle;
  if (bus && typeof bus.emit === 'function') {
    bus.emit('combat:fire', {
      ownerId: turret.id, weaponId, hardpointIdx: mount.slotIndex,
      origin: { x: projectile.pos.x, z: projectile.pos.z }, dir: angle,
      fortifyDeviceId: 'kinetic_turret', ammoRemaining: Math.max(0, (turret.data?.swarmFortify?.ammo || 0) - 1),
    });
  }
  return projectile;
}

function interceptAngle(shooter, target, speed) {
  const rx = target.pos.x - shooter.pos.x;
  const rz = target.pos.z - shooter.pos.z;
  const vx = Number.isFinite(target.vel?.x) ? target.vel.x : 0;
  const vz = Number.isFinite(target.vel?.z) ? target.vel.z : 0;
  const a = vx * vx + vz * vz - speed * speed;
  const b = 2 * (rx * vx + rz * vz);
  const c = rx * rx + rz * rz;
  let time = null;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) { const root = -c / b; if (root > 0) time = root; }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((value) => value > 0);
      if (candidates.length) time = Math.min(...candidates);
    }
  }
  const aimX = rx + vx * (time || Math.sqrt(c) / speed);
  const aimZ = rz + vz * (time || Math.sqrt(c) / speed);
  return Math.atan2(aimZ, aimX);
}

function isDue(timers, key, tick) {
  return Number.isInteger(tick) && (!timers.has(key) || tick >= timers.get(key));
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInt(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function compareId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}
