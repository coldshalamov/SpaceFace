// The mine-layer's area-denial verb (combat-variety vertical). Policy only: the doctrine owns
// WHEN (the `mine_drop` phase, after the `wake_mines` telegraph); this module owns the release
// geometry and cadence, and goes through the mines system's `helpers.placeMine` — the same owner
// the minefield_wake encounter uses. It never writes entities, physics, or damage directly.

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
 * { points, vels } — vels[i] is the rock's velocity for a rock-anchored point, null for a
 * wake point (the ordinary deploy law keeps those). No writes; the caller stores both.
 */
export function anchorSalvoToDriftingDebris(state, entity, wakePoints, count) {
  const points = Array.isArray(wakePoints) ? wakePoints.map((point) => ({ ...point })) : [];
  const wants = Number.isInteger(count) && count > 0 ? Math.min(count, points.length) : 0;
  const anchors = new Array(points.length).fill(null);
  if (!state || !entity || !entity.pos || wants <= 0) return { points, anchors };
  const candidates = [];
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const e of list) {
    if (!isDriftingDebris(e) || e === entity) continue;
    const speed = Math.hypot(e.vel.x, e.vel.z);
    if (speed < SALVO_DEBRIS_MIN_SPEED) continue;
    const dx = e.pos.x - entity.pos.x;
    const dz = e.pos.z - entity.pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > SALVO_DEBRIS_BAND_WU * SALVO_DEBRIS_BAND_WU) continue;
    candidates.push({ rock: e, speed, distSq, id: e.id });
  }
  if (!candidates.length) return { points, anchors };
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
  }
  return { points, anchors };
}

function pointOnDebrisSkin(rock, owner) {
  const ox = owner.pos.x - rock.pos.x;
  const oz = owner.pos.z - rock.pos.z;
  const len = Math.hypot(ox, oz) || 1;
  const off = rock.radius + SALVO_DEBRIS_SKIN_PAD_WU;
  return { x: rock.pos.x + (ox / len) * off, z: rock.pos.z + (oz / len) * off };
}

function liveDriftingDebris(state, id) {
  if (id == null) return null;
  const mapped = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id) : null;
  if (isDriftingDebris(mapped)) return mapped;
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  return list.find((entity) => entity?.id === id && isDriftingDebris(entity)) || null;
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
        salvoPoints: null, salvoAnchors: null, salvoCursor: 0, nextSalvoTick: 0 };
    }
    if (doctrinePhase === 'wake_cue') {
      if (!specialist.salvoPoints && tick >= (specialist.nextSalvoTick || 0)
        && activeSpecialistMineCount(state, entity.id) < tuning.mineCap) {
        const anchored = anchorSalvoToDriftingDebris(
          state, entity,
          swarmMineWakeSalvoLayout(entity, tuning.salvoCount),
          tuning.salvoCount,
        );
        specialist.salvoPoints = anchored.points;
        specialist.salvoAnchors = anchored.anchors;
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
    let position = specialist.salvoPoints[index];
    let carriedVel = null;
    const anchorId = Array.isArray(specialist.salvoAnchors) ? specialist.salvoAnchors[index] : null;
    const anchor = liveDriftingDebris(state, anchorId);
    if (anchor) {
      // The wake cue is a 30-tick warning: a selected rock may travel far from the preview
      // point before the first mine is actually laid. Re-sample its live skin and velocity at
      // the ordinary mine-drop owner boundary so the seed appears in the moving debris field.
      position = pointOnDebrisSkin(anchor, entity);
      specialist.salvoPoints[index] = position;
      carriedVel = { x: anchor.vel.x, z: anchor.vel.z };
    }
    const mine = placeMine({
      ownerId: entity.id,
      pos: { x: position.x, z: position.z },
      // A rock-anchored seed rides that rock's drift (VERB-32's explicit-vel override); a
      // wake seed passes no vel, so the ordinary owner-velocity deploy law stays.
      ...(carriedVel ? { vel: { x: carriedVel.x, z: carriedVel.z } } : {}),
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
        specialist.salvoAnchors = null;
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
