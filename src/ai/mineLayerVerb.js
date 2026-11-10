// The mine-layer's area-denial verb (combat-variety vertical). Policy only: the doctrine owns
// WHEN (the `mine_drop` phase, after the `wake_mines` telegraph); this module owns the release
// geometry and cadence, and goes through the mines system's `helpers.placeMine` — the same owner
// the minefield_wake encounter uses. It never writes entities, physics, or damage directly.

import { occupantGenerationOf } from '../core/entity.js';
import { isSwarmSpecialistRun, swarmMineWakeSalvoLayout, SWARM_SPECIALIST_TUNING } from '../data/swarmSpecialists.js';

const MINE_DROP_INTERVAL_TICKS = 42; // ~0.7 s between seeds across the drop line
const MINE_RELEASE_STANDOFF_WU = 10; // clear of the hull, inside the wake

// ── The salvo uses the room's own drift ─────────────────────────────────────
// A wake salvo drops mines into open space behind the hull — the debris field the fight is
// standing in is invisible to it. The rare, memorable version: the specialist seeds its mines
// INTO the drifting rocks, each mine riding that rock's velocity, so the field itself ferries
// the mines along the chase lanes. Deterministic pick: fastest drift first (score), then
// nearest, then id — never insertion order, never a roll. Fewer live rocks than salvo count
// leaves the remaining points on the ordinary wake line.
const SALVO_DEBRIS_BAND_WU = 620;
/** A rock only carries mines when its drift is visible — the room's own settle floor. */
const SALVO_DEBRIS_MIN_SPEED = 6;
/** Mines sit just off the rock's skin, on the face toward the jackal — never buried inside it. */
const SALVO_DEBRIS_SKIN_PAD_WU = 6;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function isDriftingDebris(e) {
  return !!e && e.alive !== false && (e.type === 'asteroid' || e.type === 'wreck')
    && e.pos && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z)
    && Number.isFinite(e.radius) && e.radius > 0
    && e.vel && Number.isFinite(e.vel.x) && Number.isFinite(e.vel.z);
}

/**
 * Pure: re-point a planned salvo onto the room's drifting rocks. Returns
 * { points, anchors, anchorGenerations } — each selected rock is bound to its current
 * occupant, or null for a wake point. Both identity arrays describe occupants in the current run.
 * The verb refreshes live drift forecasts and samples velocity at deployment. No entity writes.
 */
export function anchorSalvoToDriftingDebris(state, entity, wakePoints, count) {
  const points = Array.isArray(wakePoints) ? wakePoints.map((point) => ({ ...point })) : [];
  const wants = Number.isInteger(count) && count > 0 ? Math.min(count, points.length) : 0;
  const anchors = new Array(points.length).fill(null);
  const anchorGenerations = new Array(points.length).fill(null);
  if (!state || !entity || !entity.pos || wants <= 0) return { points, anchors, anchorGenerations };
  const candidates = [];
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const e of list) {
    if (!isDriftingDebris(e) || e === entity || occupantGenerationOf(e) == null
      || state.entities?.get?.(e.id) !== e) continue;
    const speed = Math.hypot(e.vel.x, e.vel.z);
    if (speed < SALVO_DEBRIS_MIN_SPEED) continue;
    const dx = e.pos.x - entity.pos.x;
    const dz = e.pos.z - entity.pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > SALVO_DEBRIS_BAND_WU * SALVO_DEBRIS_BAND_WU) continue;
    candidates.push({ rock: e, speed, distSq, id: e.id });
  }
  if (!candidates.length) return { points, anchors, anchorGenerations };
  // Score, then distance, then id — the same ordering discipline as the chain selectors.
  candidates.sort((a, b) => (b.speed - a.speed)
    || (a.distSq - b.distSq)
    || ((a.id < b.id) ? -1 : (a.id > b.id) ? 1 : 0));
  for (let i = 0; i < candidates.length && i < wants; i++) {
    const rock = candidates[i].rock;
    // The mine rides the skin the jackal can see: offset from the rock's center toward the
    // hull, just clear of the collider, so it is visible, shootable and never inside the rock.
    points[i] = pointOnDebrisSkin(rock, entity);
    anchors[i] = rock.id;
    anchorGenerations[i] = occupantGenerationOf(rock);
  }
  return { points, anchors, anchorGenerations };
}

function pointOnDebrisSkin(rock, owner) {
  const ox = owner.pos.x - rock.pos.x;
  const oz = owner.pos.z - rock.pos.z;
  const len = Math.hypot(ox, oz) || 1;
  const off = rock.radius + SALVO_DEBRIS_SKIN_PAD_WU;
  return { x: rock.pos.x + (ox / len) * off, z: rock.pos.z + (oz / len) * off };
}

function liveDriftingDebris(state, id, generation) {
  if (id == null || generation == null) return null;
  const mapped = state.entities?.get?.(id);
  // Numeric IDs recycle, and entityList can briefly retain a departed occupant.
  // Missing/legacy identity keeps the last warned point; it never adopts a new rock.
  return isDriftingDebris(mapped) && occupantGenerationOf(mapped) === generation ? mapped : null;
}

function activeSpecialistMineCount(state, ownerId) {
  const entities = Array.isArray(state.entityList) ? state.entityList
    : state.entities?.values() || state.entityIndex?.mines || [];
  let count = 0;
  for (const item of entities) {
    if (item?.alive === true && item.type === 'mine' && (item.ownerId === ownerId || item.data?.ownerId === ownerId)
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

function endSwarmJackalSalvo(view, tick) {
  if (view.phase !== 'windup' && view.phase !== 'active' && !view.salvoPoints) return;
  view.salvoPoints = null;
  view.salvoAnchors = null;
  view.salvoAnchorGenerations = null;
  view.salvoNextReleaseTick = null;
  view.salvoWave = null;
  view.phase = 'recovery';
  view.phaseStartedAt = tick;
  view.phaseEndsAt = tick + SWARM_SPECIALIST_TUNING.jackal.recoveryTicks;
  view.nextSalvoTick = tick + SWARM_SPECIALIST_TUNING.jackal.cooldownTicks;
}

// The same live points reach the worker projection throughout the warning and the release.
// A drifting carrier cannot move the eventual mine somewhere the forecast never followed.
function refreshJackalForecast(state, entity, view) {
  for (let index = view.salvoCursor; index < view.salvoPoints.length; index++) {
    const anchorId = view.salvoAnchors?.[index];
    if (anchorId == null) continue;
    const anchor = liveDriftingDebris(state, anchorId, view.salvoAnchorGenerations?.[index]);
    if (anchor) view.salvoPoints[index] = pointOnDebrisSkin(anchor, entity);
    else {
      view.salvoAnchors[index] = null; // Keep the last visible point, not a new target.
      if (view.salvoAnchorGenerations) view.salvoAnchorGenerations[index] = null;
    }
  }
}

function applySwarmJackalSalvo({ state, entity, doctrinePhase, tick, placeMine }) {
  const tuning = SWARM_SPECIALIST_TUNING.jackal;
  const data = entity.data;
  let view = data.swarmSpecialist;
  if (!view || view.kind !== 'jackal') {
    view = data.swarmSpecialist = { kind: 'jackal', phase: 'idle', phaseStartedAt: tick,
      phaseEndsAt: null, salvoPoints: null, salvoAnchors: null, salvoAnchorGenerations: null, salvoCursor: 0, nextSalvoTick: 0 };
  }
  if (view.phase === 'recovery' && tick >= view.phaseEndsAt) {
    view.phase = 'idle'; view.phaseStartedAt = tick; view.phaseEndsAt = null;
  }
  const outsideWave = Number.isInteger(state.run?.wave) && Number.isInteger(data.runWave)
    && state.run.wave !== data.runWave;
  const oldCommitment = Number.isInteger(view.salvoWave) && Number.isInteger(data.runWave)
    && view.salvoWave !== data.runWave;
  if (!isSwarmSpecialistRun(state) || state.run.phase !== 'active' || outsideWave || oldCommitment
    || data.disabled === true || data.stunned === true) {
    endSwarmJackalSalvo(view, tick);
    return null;
  }
  if (doctrinePhase !== 'wake_cue' && doctrinePhase !== 'mine_drop') {
    endSwarmJackalSalvo(view, tick);
    return null;
  }
  if (doctrinePhase === 'wake_cue') {
    // Returning to a new cue after an interrupted drop never resumes the old payload.
    if (view.phase === 'active') endSwarmJackalSalvo(view, tick);
    if (!view.salvoPoints && tick >= (view.nextSalvoTick || 0)
      && activeSpecialistMineCount(state, entity.id) < tuning.mineCap) {
      const planned = anchorSalvoToDriftingDebris(state, entity,
        swarmMineWakeSalvoLayout(entity, tuning.salvoCount), tuning.salvoCount);
      view.salvoPoints = planned.points;
      view.salvoAnchors = planned.anchors;
      view.salvoAnchorGenerations = planned.anchorGenerations;
      view.salvoCursor = 0;
      view.salvoWave = data.runWave;
      // Start when this geometry is first published. A stale doctrine timestamp cannot
      // backdate the warning after a cooldown, skipped AI update, or restored phase.
      view.salvoStartedAt = tick;
      view.salvoNextReleaseTick = tick + tuning.windupTicks;
      view.phase = 'windup';
      view.phaseStartedAt = tick;
      view.phaseEndsAt = tick + tuning.windupTicks;
    }
    if (Array.isArray(view.salvoPoints)) refreshJackalForecast(state, entity, view);
    return null;
  }
  if (!Array.isArray(view.salvoPoints)) return null;
  // Older data shapes used remaining-count or cue-relative cadence. Adopt their unspent slots,
  // but never compress an unknown release interval into an immediate burst when adopting them.
  if (!Number.isInteger(view.salvoCursor)) view.salvoCursor = Number.isInteger(view.salvoRemaining)
    ? Math.max(0, view.salvoPoints.length - view.salvoRemaining) : 0;
  if (!Number.isFinite(view.salvoNextReleaseTick)) {
    if (view.phase === 'active') {
      view.salvoNextReleaseTick = tick + tuning.salvoSpacingTicks;
      view.phaseStartedAt = tick;
      view.phaseEndsAt = tick + tuning.activeTicks;
    } else view.salvoNextReleaseTick = Number.isFinite(view.phaseEndsAt)
      ? view.phaseEndsAt : tick + tuning.windupTicks;
  }
  refreshJackalForecast(state, entity, view);
  if (view.phase === 'windup') {
    if (tick < view.salvoNextReleaseTick) return null;
    view.phase = 'active'; view.phaseStartedAt = tick; view.phaseEndsAt = tick + tuning.activeTicks;
  }
  if (view.phase !== 'active') return null;
  if (tick >= view.phaseEndsAt || view.salvoCursor >= view.salvoPoints.length
    || activeSpecialistMineCount(state, entity.id) >= tuning.mineCap) {
    endSwarmJackalSalvo(view, tick);
    return null;
  }
  if (typeof placeMine !== 'function' || tick < view.salvoNextReleaseTick) return null;
  const index = view.salvoCursor;
  const position = view.salvoPoints[index];
  const anchor = liveDriftingDebris(state, view.salvoAnchors?.[index], view.salvoAnchorGenerations?.[index]);
  const mine = placeMine({
    ownerId: entity.id,
    pos: { x: position.x, z: position.z },
    // A rock-carried seed uses its carrier's current drift. Ordinary wake seeds retain
    // the existing owner-velocity law; the canonical mine owner still handles physics.
    ...(anchor ? { vel: { x: anchor.vel.x, z: anchor.vel.z } } : {}),
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
    view.salvoCursor = index + 1;
    view.salvoNextReleaseTick = tick + tuning.salvoSpacingTicks;
    if (view.salvoCursor >= view.salvoPoints.length) endSwarmJackalSalvo(view, tick);
  }
  return mine;
}

export function applyMineLayerVerb({ state, entity, doctrinePhase, tick, placeMine }) {
  if (!state || !entity || entity.alive === false) return null;
  const data = entity.data || (entity.data = {});
  const enemyId = data.lootTableId || data.enemyTypeId;
  if (state.run?.kind === 'survival' && state.run.ruleset === 'swarm'
    && data.runCohort === 'survival' && enemyId === 'mine_layer_jackal') {
    return applySwarmJackalSalvo({ state, entity, doctrinePhase, tick, placeMine });
  }
  if (typeof placeMine !== 'function') return null;
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
