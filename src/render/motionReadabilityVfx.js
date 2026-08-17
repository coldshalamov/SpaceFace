// Plan 35 motion-readability ribbons. Cosmetic only: pooled XZ ribbons for
// Newtonian skid-glow and tumbling helix smoke. Never a camera-facing card.
import { createRibbonTrail } from './engineTrailSurfaces.js';
import { shipPitchCandidates } from './shipPitchPresentation.js';
import { shipDriftTell } from './driftTell.js';

export const DRIFT_TELL_CAP = 8;
export const TUMBLE_RIBBON_CAP = 8;

const DRIFT_COLOR = '#ffc878';
const TUMBLE_COLOR = '#ff8a6a';
const DRIFT_SEGMENTS = 12;
const TUMBLE_SEGMENTS = 18;
const DRIFT_WIDTH = 0.9;
const TUMBLE_WIDTH = 1.05;
const SAMPLE_SPACING_WU = 2.1;
const DISCONTINUITY_WU = 80;

export function createMotionReadabilityVfx(scene) {
  return {
    scene,
    driftMap: new Map(),
    driftPool: [],
    driftFree: [],
    tumbleMap: new Map(),
    tumblePool: [],
    tumbleFree: [],
    seenDrift: new Set(),
    seenTumble: new Set(),
    tellScratch: { active: false, intensity: 0, trailX: 0, trailZ: 0, heading: 0 },
    local: { x: 0, z: 0 },
  };
}

function acquire(host, map, pool, free, cap, color, width, segs, id) {
  let slot = map.get(id);
  if (slot) return slot;
  if (map.size >= cap) return null;
  slot = free.pop() || null;
  if (!slot) {
    if (pool.length >= cap || !host.scene) return null;
    slot = { trail: createRibbonTrail(host.scene, color, segs, width), owner: null };
    pool.push(slot);
  }
  slot.trail.clear();
  slot.owner = null;
  map.set(id, slot);
  return slot;
}

function release(map, free, id) {
  const slot = map.get(id);
  if (!slot) return;
  map.delete(id);
  slot.owner = null;
  slot.trail.clear();
  free.push(slot);
}

function toLocal(vfx, x, z, out) {
  if (vfx && typeof vfx._toLocalXZ === 'function') return vfx._toLocalXZ(x, z, out);
  out.x = x;
  out.z = z;
  return out;
}

function followAndPaint(slot, x, z, heading, dt, owner, opacity, radiance, time) {
  slot.trail.follow(x, z, heading, dt, owner, SAMPLE_SPACING_WU, DISCONTINUITY_WU, 1 / 30);
  slot.owner = owner;
  slot.trail.rebuild(opacity, (time * 0.35) % 1, time, radiance);
}

export function updateMotionReadabilityVfx(vfx, dt) {
  const host = vfx && vfx._motionReadability;
  if (!host || !vfx || !vfx.state) return 0;
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
  const time = Number.isFinite(vfx._t) ? vfx._t : 0;
  const list = shipPitchCandidates(vfx.state);
  const seenDrift = host.seenDrift;
  const seenTumble = host.seenTumble;
  seenDrift.clear();
  seenTumble.clear();
  const local = host.local;
  const tell = host.tellScratch;
  let drawn = 0;

  for (const entity of list) {
    if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) continue;
    if (!entity.alive || !entity.pos || (entity.flags && entity.flags.docked)) continue;
    const tumble = entity.presentation && entity.presentation.tumble;
    const tumbling = !!(tumble && tumble.mode === 'tumbling' && (tumble.spinRibbon || 0) > 0.08);
    const authoredDrift = entity.presentation && entity.presentation.drift;
    const tellNow = authoredDrift && authoredDrift.active
      ? authoredDrift
      : shipDriftTell(entity, tell);

    if (!tumbling && tellNow && tellNow.active) {
      const slot = acquire(
        host, host.driftMap, host.driftPool, host.driftFree,
        DRIFT_TELL_CAP, DRIFT_COLOR, DRIFT_WIDTH, DRIFT_SEGMENTS, entity.id,
      );
      if (slot) {
        seenDrift.add(entity.id);
        const p = toLocal(vfx, tellNow.trailX, tellNow.trailZ, local);
        const intensity = Math.max(0, Math.min(1, tellNow.intensity || 0));
        followAndPaint(
          slot, p.x, p.z, tellNow.heading || 0, step, entity,
          0.28 + intensity * 0.42, 1.1 + intensity * 0.6, time,
        );
        drawn++;
      }
    }

    if (tumbling) {
      const slot = acquire(
        host, host.tumbleMap, host.tumblePool, host.tumbleFree,
        TUMBLE_RIBBON_CAP, TUMBLE_COLOR, TUMBLE_WIDTH, TUMBLE_SEGMENTS, entity.id,
      );
      if (slot) {
        seenTumble.add(entity.id);
        const spin = Math.max(0.08, Math.min(1, tumble.spinRibbon || 0.4));
        const ang = (entity.rot || 0) + (entity.angVel || 0) * 0.12 + time * (2.4 + spin * 3.2);
        const radius = Math.max(3, entity.radius || 6) * (1.05 + spin * 0.25);
        const hx = entity.pos.x + Math.cos(ang) * radius;
        const hz = entity.pos.z + Math.sin(ang) * radius;
        const p = toLocal(vfx, hx, hz, local);
        followAndPaint(
          slot, p.x, p.z, ang + Math.PI * 0.5, step, entity,
          0.32 + spin * 0.38, 1.15 + spin * 0.7, time,
        );
        drawn++;
      }
    }
  }

  for (const id of [...host.driftMap.keys()]) {
    if (!seenDrift.has(id)) release(host.driftMap, host.driftFree, id);
  }
  for (const id of [...host.tumbleMap.keys()]) {
    if (!seenTumble.has(id)) release(host.tumbleMap, host.tumbleFree, id);
  }
  return drawn;
}

export function disposeMotionReadabilityVfx(host) {
  if (!host) return;
  for (const slot of host.driftPool) slot.trail?.dispose?.();
  for (const slot of host.tumblePool) slot.trail?.dispose?.();
  host.driftMap.clear();
  host.tumbleMap.clear();
  host.driftPool.length = 0;
  host.tumblePool.length = 0;
  host.driftFree.length = 0;
  host.tumbleFree.length = 0;
}
