import { isSwarmSpecialistRun, SWARM_SPECIALIST_TUNING } from '../data/swarmSpecialists.js';
import { countOwnerMines, mineWakeSalvoLayout } from '../systems/mines.js';

// The mine-layer's area-denial verb (combat-variety vertical). Policy only: the doctrine owns
// WHEN (the `mine_drop` phase, after the `wake_mines` telegraph); this module owns the release
// geometry and cadence, and goes through the mines system's `helpers.placeMine` — the same owner
// the minefield_wake encounter uses. It never writes entities, physics, or damage directly.

const MINE_DROP_INTERVAL_TICKS = 42; // ~0.7 s between seeds across the drop line
const MINE_RELEASE_STANDOFF_WU = 10; // clear of the hull, inside the wake

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
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

export function applyMineLayerVerb({ state, entity, doctrinePhase, tick, placeMine }) {
  if (!state || !entity || entity.alive === false) return null;
  if (isSwarmSpecialistRun(state) && entity.data?.runCohort === 'survival'
    && entity.data?.lootTableId === 'mine_layer_jackal') {
    return applySwarmJackalSalvo({ state, entity, doctrinePhase, tick, placeMine });
  }
  if (doctrinePhase !== 'mine_drop') return null;
  if (typeof placeMine !== 'function') return null;
  const data = entity.data || (entity.data = {});
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

function applySwarmJackalSalvo({ state, entity, doctrinePhase, tick, placeMine }) {
  const tuning = SWARM_SPECIALIST_TUNING.jackal;
  const data = entity.data;
  let view = data.swarmSpecialist;
  if (view?.kind !== 'jackal') {
    view = data.swarmSpecialist = { kind: 'jackal', phase: 'idle', phaseStartedAt: tick,
      phaseEndsAt: null, salvoRemaining: 0, nextSalvoTick: 0 };
  }
  if (data.disabled === true || data.stunned === true) {
    if (view.phase === 'active' || view.phase === 'windup') {
      view.phase = 'recovery'; view.phaseStartedAt = tick;
      view.phaseEndsAt = tick + tuning.recoveryTicks;
      view.nextSalvoTick = tick + tuning.cooldownTicks; view.salvoRemaining = 0;
    }
    return null;
  }
  if (doctrinePhase === 'wake_cue') {
    if (tick < view.nextSalvoTick) return null;
    if (view.phase !== 'windup') {
      view.phase = 'windup'; view.phaseStartedAt = tick; view.phaseEndsAt = tick + tuning.windupTicks;
      view.salvoRemaining = tuning.salvoCount;
      // Freeze the forecast at the warning. Later motion cannot silently move the danger lane.
      view.salvoPoints = mineWakeSalvoLayout(entity, tuning.salvoCount, tuning.salvoSpacingTicks);
    }
    return null;
  }
  if (doctrinePhase !== 'mine_drop') {
    if (view.phase === 'windup' || view.phase === 'active') {
      view.phase = 'recovery'; view.phaseStartedAt = tick;
      view.phaseEndsAt = tick + tuning.recoveryTicks; view.salvoRemaining = 0;
    } else if (view.phase === 'recovery' && tick >= view.phaseEndsAt) {
      view.phase = 'idle'; view.phaseStartedAt = tick; view.phaseEndsAt = null;
    }
    return null;
  }
  if (typeof placeMine !== 'function' || tick < view.nextSalvoTick) return null;
  if (view.phase !== 'active') {
    // The production doctrine always supplies the tell; a skipped/canceled tell cannot fire.
    if (view.phase !== 'windup' || tick < view.phaseEndsAt) return null;
    view.phase = 'active'; view.phaseStartedAt = tick; view.phaseEndsAt = tick + tuning.activeTicks;
  }
  if (!(view.salvoRemaining > 0) || countOwnerMines(state, entity.id) >= tuning.mineCap) return null;
  const point = view.salvoPoints?.[tuning.salvoCount - view.salvoRemaining];
  if (!point) return null;
  const mine = placeMine({ ownerId: entity.id, pos: point, vel: { x: 0, z: 0 },
    team: entity.team, factionId: entity.factionId || null,
    armDelayS: tuning.armDelayTicks / 60, triggerRadius: tuning.triggerRadius,
    hull: tuning.mineHull, blastDamage: tuning.blastDamage, telegraph: true,
    swarmSpecialistMine: true, lifetimeS: tuning.lifetimeTicks / 60 });
  if (mine) {
    view.salvoRemaining--;
    view.nextSalvoTick = tick + tuning.salvoSpacingTicks;
    if (view.salvoRemaining === 0) {
      view.phase = 'recovery'; view.phaseStartedAt = tick; view.phaseEndsAt = tick + tuning.recoveryTicks;
      view.nextSalvoTick = tick + tuning.cooldownTicks; data._mineLayerLastDropTick = tick;
    }
  }
  return mine;
}
