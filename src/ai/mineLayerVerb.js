// The mine-layer's area-denial verb (combat-variety vertical). Policy only: the doctrine owns
// WHEN (the `mine_drop` phase, after the `wake_mines` telegraph); this module owns the release
// geometry and cadence, and goes through the mines system's `helpers.placeMine` — the same owner
// the minefield_wake encounter uses. It never writes entities, physics, or damage directly.

import { isSwarmSpecialistRun, swarmMineWakeSalvoLayout, SWARM_SPECIALIST_TUNING } from '../data/swarmSpecialists.js';

const MINE_DROP_INTERVAL_TICKS = 42; // ~0.7 s between seeds across the drop line
const MINE_RELEASE_STANDOFF_WU = 10; // clear of the hull, inside the wake

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function activeSpecialistMineCount(state, ownerId) {
  const entities = Array.isArray(state.entityList) ? state.entityList
    : Array.isArray(state.entityIndex?.mines) ? state.entityIndex.mines : [];
  let count = 0;
  for (const item of entities) {
    if (item?.alive === true && item.type === 'mine' && item.ownerId === ownerId
      && item.data?.swarmSpecialistMine === true) count++;
  }
  return count;
}

/** The wake point: behind the hull along its motion (nose heading when barely moving). */
export function mineLayerWakePoint(entity) {
  if (!entity || !entity.pos) return null;
  const vx = finite(entity.vel && entity.vel.x);
  const vz = finite(entity.vel && entity.vel.z);
  const speed = Math.hypot(vx, vz);
  let dx;
  let dz;
  if (speed > 8) {
    dx = -vx / speed;
    dz = -vz / speed;
  } else {
    const rot = finite(entity.rot);
    dx = -Math.cos(rot);
    dz = -Math.sin(rot);
  }
  const standoff = MINE_RELEASE_STANDOFF_WU + finite(entity.radius, 8);
  return {
    x: finite(entity.pos.x) + dx * standoff,
    z: finite(entity.pos.z) + dz * standoff,
  };
}

export function applyMineLayerVerb({ state, entity, doctrinePhase, tick, doctrineStartedTick = tick, placeMine }) {
  if (!state || !entity || entity.alive === false) return null;
  if (typeof placeMine !== 'function') return null;
  const data = entity.data || (entity.data = {});
  const enemyId = data.lootTableId || data.enemyTypeId;
  if (isSwarmSpecialistRun(state) && data.runCohort === 'survival' && enemyId === 'mine_layer_jackal') {
    const tuning = SWARM_SPECIALIST_TUNING.jackal;
    let specialist = data.swarmSpecialist;
    if (!specialist || specialist.kind !== 'jackal') {
      specialist = data.swarmSpecialist = { kind: 'jackal', phase: 'idle', phaseStartedAt: tick,
        salvoPoints: null, salvoCursor: 0, nextSalvoTick: 0 };
    }
    if (doctrinePhase === 'wake_cue') {
      if (!specialist.salvoPoints && tick >= (specialist.nextSalvoTick || 0)
        && activeSpecialistMineCount(state, entity.id) < tuning.mineCap) {
        specialist.salvoPoints = swarmMineWakeSalvoLayout(entity, tuning.salvoCount);
        specialist.salvoCursor = 0;
        specialist.salvoStartedAt = doctrineStartedTick;
        specialist.phase = 'windup';
        specialist.phaseStartedAt = doctrineStartedTick;
        specialist.phaseEndsAt = doctrineStartedTick + tuning.windupTicks;
      }
      return null;
    }
    if (doctrinePhase !== 'mine_drop' || !Array.isArray(specialist.salvoPoints)) return null;
    const index = specialist.salvoCursor | 0;
    const dueTick = specialist.salvoStartedAt + index * tuning.salvoSpacingTicks;
    if (index >= specialist.salvoPoints.length || tick < dueTick) return null;
    specialist.phase = 'active';
    const position = specialist.salvoPoints[index];
    const mine = placeMine({
      ownerId: entity.id,
      pos: { x: position.x, z: position.z },
      team: entity.team,
      factionId: entity.factionId || null,
      telegraph: index === 0,
      swarmSpecialistMine: true,
      swarmWave: data.runWave,
      armDelayS: tuning.armDelayTicks / 60,
      triggerRadius: tuning.triggerRadius,
      blastDamage: tuning.blastDamage,
      hull: tuning.mineHull,
      lifetimeS: tuning.lifetimeTicks / 60,
    });
    if (mine) {
      specialist.salvoCursor = index + 1;
      if (specialist.salvoCursor >= specialist.salvoPoints.length) {
        specialist.salvoPoints = null;
        specialist.phase = 'recovery';
        specialist.phaseStartedAt = tick;
        specialist.phaseEndsAt = tick + tuning.recoveryTicks;
        specialist.nextSalvoTick = tick + tuning.cooldownTicks;
      }
    }
    return mine;
  }
  if (doctrinePhase !== 'mine_drop') return null;
  const last = Number.isFinite(data._mineLayerLastDropTick) ? data._mineLayerLastDropTick : -Infinity;
  if (tick - last < MINE_DROP_INTERVAL_TICKS) return null;
  const pos = mineLayerWakePoint(entity);
  if (!pos) return null;
  const mine = placeMine({
    ownerId: entity.id,
    pos,
    team: entity.team,
    factionId: entity.factionId || null,
    telegraph: true,
  });
  if (mine) data._mineLayerLastDropTick = tick;
  return mine;
}
