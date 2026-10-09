// Veil Step. Flight V3 calls this instead of the thruster boost when the fitted
// utility says so (derived.phaseBlink). Hold Shift: a shadow is published on
// entity._phaseBlink for the renderer. Release: the hull is written to that
// shadow and physics adopts the pose on its noInterp resync. This is a pose
// snap, not an integration — flight still does not write velocity.

import { queryNearbyEntities } from '../core/spatialQuery.js';
import {
  PHASE_BLINK,
  phaseBlinkCharge,
  phaseBlinkCommitCost,
  phaseBlinkRange,
} from '../data/phaseBlink.js';

const NEARBY = [];
const SOLIDS = new Set(['asteroid', 'station']);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function runtime(entity) {
  return entity._phaseBlink || (entity._phaseBlink = {
    active: false,
    aiming: false,
    holdT: 0,
    x: 0,
    z: 0,
    rot: 0,
    charge: 0,
    dist: 0,
    readyAt: 0,
    suppressUntilRelease: false,
    emptyTold: false,
    blockedTold: false,
  });
}

function toast(bus, text) {
  if (bus && typeof bus.emit === 'function') {
    bus.emit('toast', { text, kind: 'warn', ttl: 1.6 });
  }
}

/** True when a station or a rock owns this point. Ships are phased through. */
export function phaseBlinkBlocked(state, entity, x, z) {
  if (!state) return false;
  const nearby = queryNearbyEntities(state, { x, z }, 96, NEARBY) || NEARBY;
  const selfR = finite(entity && entity.radius, 14) * 0.55;
  for (let i = 0; i < nearby.length; i += 1) {
    const other = nearby[i];
    if (!other || other === entity || other.alive === false) continue;
    if (!SOLIDS.has(other.type)) continue;
    const ox = finite(other.pos && other.pos.x);
    const oz = finite(other.pos && other.pos.z);
    const rad = finite(other.radius, other.type === 'station' ? 70 : 16) + selfR;
    const dx = ox - x;
    const dz = oz - z;
    if (dx * dx + dz * dz < rad * rad) return true;
  }
  return false;
}

/**
 * Walk the heading and stop at the last clear sample. Returns the distance
 * the shadow is allowed to sit, which may be 0 when the hull is against a wall.
 */
export function phaseBlinkClearDistance(state, entity, heading, want) {
  const fromX = finite(entity && entity.pos && entity.pos.x);
  const fromZ = finite(entity && entity.pos && entity.pos.z);
  const fx = Math.cos(heading);
  const fz = Math.sin(heading);
  const steps = 8;
  let clear = 0;
  for (let i = 1; i <= steps; i += 1) {
    const d = want * (i / steps);
    const x = fromX + fx * d;
    const z = fromZ + fz * d;
    if (phaseBlinkBlocked(state, entity, x, z)) break;
    clear = d;
  }
  return clear;
}

function publishAim(rt, entity, state) {
  const heading = finite(entity.rot);
  const want = phaseBlinkRange(rt.holdT);
  const dist = phaseBlinkClearDistance(state, entity, heading, want);
  const fx = Math.cos(heading);
  const fz = Math.sin(heading);
  rt.active = dist >= 8;
  rt.aiming = true;
  rt.rot = heading;
  rt.dist = dist;
  rt.charge = phaseBlinkCharge(rt.holdT);
  rt.x = finite(entity.pos && entity.pos.x) + fx * dist;
  rt.z = finite(entity.pos && entity.pos.z) + fz * dist;
}

function adoptPose(entity, x, z) {
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.pos.y == null || !Number.isFinite(entity.pos.y)) entity.pos.y = 0;
  if (entity.prevPos && typeof entity.prevPos.copy === 'function') entity.prevPos.copy(entity.pos);
  else if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.y = entity.pos.y || 0;
    entity.prevPos.z = z;
  } else {
    entity.prevPos = { x, y: entity.pos.y || 0, z };
  }
  entity.flags = entity.flags || {};
  // Physics owner copies this pose onto the body at the start of its step.
  entity.flags.noInterp = true;
}

/**
 * One player tick. `held` is the raw Shift key, not the autopilot's boost.
 * Returns { busy } — true while the shadow is out, so the boost capacitor
 * does not refill the same energy this tick is spending.
 */
export function stepPhaseBlink({ entity, held, dt, state, bus, now }) {
  const rt = runtime(entity);
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const time = Number.isFinite(now) ? now : 0;
  const key = held === true;
  if (!key) {
    rt.suppressUntilRelease = false;
    rt.emptyTold = false;
  }
  const boost = entity && entity.boost;
  const cooling = time < finite(rt.readyAt);

  if (rt.aiming && (!key || rt.suppressUntilRelease || cooling)) {
    const committed = key ? false : tryCommit(rt, entity, state, bus, time, boost);
    rt.aiming = false;
    rt.active = false;
    rt.holdT = 0;
    return { busy: false, committed };
  }

  if (!key || rt.suppressUntilRelease || cooling || !boost || !(boost.max > 0)) {
    rt.aiming = false;
    rt.active = false;
    return { busy: false, committed: false };
  }

  if (!rt.aiming) {
    if (finite(boost.energy) < PHASE_BLINK.minEnergy) {
      if (!rt.emptyTold) {
        rt.emptyTold = true;
        toast(bus, 'Veil empty');
      }
      rt.active = false;
      return { busy: false, committed: false };
    }
    rt.aiming = true;
    rt.holdT = 0;
    rt.blockedTold = false;
  }

  rt.holdT += step;
  boost.energy = Math.max(0, finite(boost.energy) - PHASE_BLINK.aimDrain * step);
  publishAim(rt, entity, state);
  return { busy: true, committed: false };
}

function tryCommit(rt, entity, state, bus, time, boost) {
  if (!rt.active || rt.dist < PHASE_BLINK.minCommit) {
    if (!rt.blockedTold && rt.holdT > 0.04) {
      rt.blockedTold = true;
      toast(bus, 'No room to step');
    }
    return false;
  }
  if (!boost) return false;
  const cost = phaseBlinkCommitCost(rt.dist);
  const from = {
    x: finite(entity.pos && entity.pos.x),
    z: finite(entity.pos && entity.pos.z),
  };
  const to = { x: rt.x, z: rt.z };
  boost.energy = Math.max(0, finite(boost.energy) - cost);
  adoptPose(entity, to.x, to.z);
  rt.readyAt = time + PHASE_BLINK.cooldownS;
  rt.active = false;
  if (bus && typeof bus.emit === 'function') {
    bus.emit('ship:phaseBlink', {
      shipId: entity.id,
      from,
      to,
      rot: finite(entity.rot),
      dist: rt.dist,
    });
    bus.emit('audio:cue', { id: 'sfx_phase_rift', gain: 0.9 });
  }
  return true;
}

/** Menu, dock, or a lost ship. Drops the shadow and does not commit it. */
export function cancelPhaseBlink(entity) {
  if (!entity) return;
  const rt = entity._phaseBlink;
  if (!rt) return;
  if (rt.aiming || rt.active) rt.suppressUntilRelease = true;
  rt.aiming = false;
  rt.active = false;
  rt.holdT = 0;
}
