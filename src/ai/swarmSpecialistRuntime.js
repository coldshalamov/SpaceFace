// Phase state for the existing specialist verb owner. No entity, damage, or field writer here.
import { SWARM_SPECIALIST_TUNING } from '../data/swarmSpecialists.js';

function phase(view, name, started, ends = null) {
  if (view.phase !== name) { view.phase = name; view.phaseStartedAt = started; }
  view.phaseEndsAt = ends;
  return view;
}

function viewFor(entity, kind, tick) {
  const data = entity.data || (entity.data = {});
  if (data.swarmSpecialist?.kind !== kind) {
    data.swarmSpecialist = { kind, phase: 'idle', phaseStartedAt: tick, phaseEndsAt: null };
  }
  return data.swarmSpecialist;
}

/** A broken screen cannot silently choose another ward or restart its recovery every tick. */
export function breakSwarmGuard(entity, tick) {
  const view = entity?.data?.swarmSpecialist;
  if (view?.kind !== 'warden') return;
  if (view.phase !== 'recovery' || view.linkReadyAt == null) {
    view.phase = 'recovery';
    view.phaseStartedAt = tick;
    view.linkReadyAt = tick + SWARM_SPECIALIST_TUNING.warden.recoveryTicks;
    view.phaseEndsAt = view.linkReadyAt;
  }
  view.targetId = null;
  delete view.targetX;
  delete view.targetZ;
  view.linkEnergy = 0;
  view.linkHp = 0;
  view.relinkWindupStarted = false;
}

function validWard(ward, guard, state) {
  return ward && ward.alive !== false && ward.type === 'ship' && ward.pos
    && ward.id !== guard.id && ward.id !== state.playerId
    && ward.team === guard.team && ward.data?.runCohort === 'survival'
    && ward.data.runWave === guard.data.runWave
    && (ward.data.lootTableId || ward.data.enemyTypeId) !== 'warden_escort';
}

/**
 * One custody choice for both the flight doctrine and the guard link. Sensors read this pure
 * resolver before the first approach frame; the verb stores the choice without revealing a link
 * until its tell completes. A live link never silently jumps to a replacement ward.
 */
export function swarmWardCandidateId(state, entity) {
  const view = entity.data?.swarmSpecialist;
  const boundId = view?.phase === 'active' ? view.targetId : view?.wardCandidateId;
  const inRange = (ward) => validWard(ward, entity, state)
    && Math.hypot(ward.pos.x - entity.pos.x, ward.pos.z - entity.pos.z)
      <= SWARM_SPECIALIST_TUNING.warden.linkRange;
  const bound = boundId != null ? state.entities?.get(boundId) : null;
  if (inRange(bound)) return bound.id;
  if (view?.phase === 'active' && view.targetId != null) return null;
  const roster = state.entityIndex?.shipLike || state.entityList || state.entities?.values() || [];
  let selected = null, best = Infinity;
  for (const candidate of roster) {
    if (!inRange(candidate)) continue;
    const distance = Math.hypot(candidate.pos.x - entity.pos.x, candidate.pos.z - entity.pos.z);
    if (distance > best
      || (distance === best && selected && String(candidate.id) >= String(selected.id))) continue;
    selected = candidate; best = distance;
  }
  return selected?.id ?? null;
}

export function updateSwarmWarden(state, entity, doctrinePhase, started, tick, disabled) {
  const tuning = SWARM_SPECIALIST_TUNING.warden;
  const view = viewFor(entity, 'warden', tick);
  const ward = view.targetId != null ? state.entities?.get(view.targetId) : null;
  // Read the prior phase before any in-place stamp: disable must buy a full recovery too.
  const wasActive = view.phase === 'active';
  if (wasActive && (disabled || doctrinePhase !== 'screen_hold'
    || tick - view.phaseStartedAt >= tuning.activeTicks
    || (view.targetId != null && (!validWard(ward, entity, state)
      || Math.hypot(ward.pos.x - entity.pos.x, ward.pos.z - entity.pos.z) > tuning.linkRange)))) {
    breakSwarmGuard(entity, tick);
  } else if (disabled && view.phase === 'windup') breakSwarmGuard(entity, tick);
  view.wardCandidateId = swarmWardCandidateId(state, entity);

  if (view.linkReadyAt != null) {
    if (tick < view.linkReadyAt || disabled) {
      phase(view, 'recovery', view.linkReadyAt - tuning.recoveryTicks, view.linkReadyAt);
      return null;
    }
    if (doctrinePhase !== 'screen_hold') {
      view.relinkWindupStarted = false;
      phase(view, doctrinePhase === 'screen_deploy' ? 'windup' : 'idle', started,
        doctrinePhase === 'screen_deploy' ? started + tuning.windupTicks : null);
      return null;
    }
    if (!view.relinkWindupStarted) {
      view.phase = 'windup'; view.phaseStartedAt = tick;
      view.phaseEndsAt = tick + tuning.windupTicks;
      view.relinkWindupStarted = true;
      return null;
    }
    if (tick < view.phaseEndsAt) return null;
    view.linkReadyAt = null;
    view.relinkWindupStarted = false;
    phase(view, 'active', tick, tick + tuning.activeTicks);
  } else if (disabled) {
    phase(view, 'idle', tick);
    return null;
  } else if (doctrinePhase !== 'screen_hold') {
    if (doctrinePhase === 'shield_dart') {
      breakSwarmGuard(entity, tick);
    } else {
      phase(view, doctrinePhase === 'screen_deploy' ? 'windup' : 'idle', started,
        doctrinePhase === 'screen_deploy' ? started + tuning.windupTicks : null);
    }
    return null;
  } else if (view.phase !== 'active') {
    phase(view, 'active', started, started + tuning.activeTicks);
  }

  if (view.targetId == null) {
    const selected = view.wardCandidateId != null ? state.entities?.get(view.wardCandidateId) : null;
    view.targetId = selected?.id ?? null;
    view.linkEnergy = selected ? tuning.linkMaxEnergy : 0;
    view.linkHp = view.linkEnergy;
    view.linkMaxHp = tuning.linkMaxEnergy;
    view.linkMaxEnergy = tuning.linkMaxEnergy;
    view.linkRange = tuning.linkRange;
  }
  const currentWard = view.targetId != null ? state.entities?.get(view.targetId) : null;
  if (!currentWard?.pos) return null;
  view.targetX = currentWard.pos.x; view.targetZ = currentWard.pos.z;
  return { verb: 'ward_screen', ok: true, targetId: currentWard.id };
}

export function updateSwarmAnchor(state, entity, doctrinePhase, started, tick, disabled, fields) {
  const tuning = SWARM_SPECIALIST_TUNING.anchor;
  const view = viewFor(entity, 'anchor', tick);
  if (doctrinePhase === 'approach') {
    delete view.windupSourceX; delete view.windupSourceZ;
    delete view.interrupted; delete view.interruptedAt;
  }
  const committing = doctrinePhase === 'field_spool' || doctrinePhase === 'anchor_hold';
  if (committing && view.windupSourceX == null) {
    view.windupSourceX = entity.pos.x; view.windupSourceZ = entity.pos.z;
  }
  if (committing && !view.interrupted && (disabled
    || Math.hypot(entity.pos.x - view.windupSourceX, entity.pos.z - view.windupSourceZ)
      >= tuning.interruptDisplacement)) {
    view.interrupted = true; view.interruptedAt = tick;
  }
  if (view.interrupted && committing) {
    phase(view, 'recovery', view.interruptedAt, view.interruptedAt + tuning.recoveryTicks);
  } else {
    const name = doctrinePhase === 'field_spool' ? 'windup' : doctrinePhase === 'anchor_hold' ? 'active'
      : doctrinePhase === 'recover' ? 'recovery' : 'idle';
    phase(view, name, started, name === 'windup' ? started + tuning.windupTicks
      : name === 'active' ? started + tuning.activeTicks
        : name === 'recovery' ? started + tuning.recoveryTicks : null);
  }
  const result = fields.setAnchorArmed(state, entity.id,
    doctrinePhase === 'anchor_hold' && !disabled && !view.interrupted, tick);
  if (!result) { view.anchorActive = false; return null; }
  view.anchorActive = result.armed === true && tick >= result.activateTick;
  view.anchorRadius = result.radius;
  view.anchorStrength = tuning.activeStrength;
  return { verb: 'snare_field', ok: true, armed: result.armed === true,
    active: view.anchorActive, activateTick: result.activateTick, radius: result.radius };
}
