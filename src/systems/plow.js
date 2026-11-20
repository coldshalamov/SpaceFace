// src/systems/plow.js — power 5, the Plow (03_COMBAT.md §4; ruling R17).
//
// The owner's sentence: "bull doze with this cone straight through it and now you're flying at the
// enemies and their station or carrier with 25 big-ass asteroids barreling towards them."
//
// While the Plow is on, a wedge at the bow CAPTURES loose bodies (rocks, wrecks, debris, payloads)
// up to the capacity. Each captured body keeps the slot it was caught in, in the ship's own frame,
// and a critically damped spring (through the physics membrane, capped acceleration) holds it
// there: the pack moves with you, turns with you, and does not pinball — every body sits in its
// own slot ahead of the hull, so none strikes the player. Bodies over the mass budget are pushed
// aside, not captured. Press 5 again with a load aboard: every captured body leaves at the ship's
// velocity plus the launch speed along the nose, stamped as the player's kick (the energised
// provenance the collision law reads), and the Plow closes. Press 5 with nothing aboard: it closes.
//
// Owned by the fields system (its runtime subtree `state.fields.plow`); pure helpers, no DOM, no
// Three.js. Deterministic: entity-list order, state.simTime, no rng.

import { FIELD_DEFS } from '../data/fields.js';
import { queuePhysicsImpulse, isDynamicPhysicsBodyEntity, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { queryPhysicalBodies } from '../combat/physicalEffects.js';
import { recordImpulseProvenance } from '../combat/impulseKernel.js';

const SHIP_TYPES = new Set(['ship', 'station', 'turret']);
const NEVER_TYPES = new Set(['projectile', 'pickup', 'massSeed', 'charge', 'bomb', 'mine', 'beacon', 'fx', 'planet', 'field_emitter']);

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
/** The mass the solver uses (the authored body spec), so an impulse buys the velocity we asked for. */
function bodyMass(e) {
  const spec = resolvePhysicsBodySpec(e);
  return Math.max(0.1, finite(spec && spec.mass, finite(e.mass, 1)));
}

export function ensurePlow(rt) {
  const p = rt.plow;
  if (p && Array.isArray(p.held)) return p;
  rt.plow = { held: [], lastScanTick: -1, launchedAt: null, launchedCount: 0 };
  return rt.plow;
}

/** A body the Plow may take: loose physical mass, never a ship or a device. */
export function plowCapturable(entity, playerId) {
  if (!entity || entity.alive === false || !entity.pos || entity.id === playerId) return false;
  if (SHIP_TYPES.has(entity.type) || NEVER_TYPES.has(entity.type)) return false;
  return isDynamicPhysicsBodyEntity(entity);
}

function toLocal(player, x, z) {
  const c = Math.cos(finite(player.rot));
  const s = Math.sin(finite(player.rot));
  const dx = x - player.pos.x;
  const dz = z - player.pos.z;
  return { f: dx * c + dz * s, l: -dx * s + dz * c };
}

/**
 * One Plow tick: scan the wedge for new bodies, hold the pocket, push the over-budget. Returns the
 * number of bodies held after the tick.
 */
export function tickPlow({ state, rt, player, dt, helpers, bus }) {
  const def = FIELD_DEFS.cone;
  const k = def.plow;
  const plow = ensurePlow(rt);
  if (!player || !player.pos) return plow.held.length;
  const step = dt > 0 ? dt : 1 / 60;
  const now = finite(state.simTime, (state.tick | 0) / 60);
  const rot = finite(player.rot);
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  const pr = finite(player.radius, 12);
  const minF = pr + k.pocketGap;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);

  // 1. Hold what is aboard. A body that died, or was knocked far out of its slot, leaves the pack.
  for (let i = plow.held.length - 1; i >= 0; i--) {
    const rec = plow.held[i];
    const body = state.entities && state.entities.get ? state.entities.get(rec.id) : null;
    if (!body || body.alive === false || !body.pos) { plow.held.splice(i, 1); continue; }
    const tx = player.pos.x + fx * rec.f - fz * rec.l;
    const tz = player.pos.z + fz * rec.f + fx * rec.l;
    const ex = tx - body.pos.x;
    const ez = tz - body.pos.z;
    if (ex * ex + ez * ez > k.dropDistance * k.dropDistance) {
      plow.held.splice(i, 1);
      if (bus) bus.emit('fields:plowDropped', { id: rec.id, reason: 'knocked_loose' });
      continue;
    }
    const w = k.omega;
    let ax = w * w * ex + 2 * w * (pvx - finite(body.vel && body.vel.x));
    let az = w * w * ez + 2 * w * (pvz - finite(body.vel && body.vel.z));
    const a = Math.hypot(ax, az);
    if (a > k.maxAccel) { ax *= k.maxAccel / a; az *= k.maxAccel / a; }
    const m = bodyMass(body);
    queuePhysicsImpulse(body, { x: ax * step * m, z: az * step * m }, { tick: state.tick, provenance: 'plow_hold' });
  }

  // 2. Scan the wedge (every scanEveryTicks) for loose bodies to take or push.
  const tick = state.tick | 0;
  if (tick - plow.lastScanTick < k.scanEveryTicks) return plow.held.length;
  plow.lastScanTick = tick;
  const center = { x: player.pos.x + fx * (def.originGap + def.radius * 0.5), z: player.pos.z + fz * (def.originGap + def.radius * 0.5) };
  const found = queryPhysicalBodies(state, center, def.radius * 0.5 + 40, helpers, [], { includeAnchored: false });
  const heldIds = new Set(plow.held.map((r) => r.id));
  const tanHalf = Math.tan(def.halfAngleRad);
  let captured = 0;
  for (const body of found) {
    if (!plowCapturable(body, state.playerId) || heldIds.has(body.id)) continue;
    const loc = toLocal(player, body.pos.x, body.pos.z);
    const br = finite(body.radius, 8);
    if (loc.f < pr || loc.f > def.originGap + def.radius) continue;
    if (Math.abs(loc.l) > (loc.f + def.originGap) * tanHalf + br) continue;
    const mass = bodyMass(body);
    if (mass > k.maxMass || plow.held.length >= k.capacity) {
      // Over the budget (or the pocket is full): the wedge shoves it aside, it is not taken.
      const side = loc.l >= 0 ? 1 : -1;
      const push = k.pushAccel * step * k.scanEveryTicks * Math.max(0.1, mass);
      queuePhysicsImpulse(body, { x: (-fz * side * 0.8 + fx * 0.6) * push, z: (fx * side * 0.8 + fz * 0.6) * push },
        { tick, provenance: 'plow_push' });
      continue;
    }
    // Its slot: where it was caught, pulled into the pocket (never inside the hull, never wider
    // than the wedge), so the pack forms a wall ahead of the bow.
    const f = Math.max(minF + br, Math.min(def.originGap + def.radius * k.pocketDepth, loc.f));
    const lMax = Math.max(0, (f + def.originGap) * tanHalf * 0.9 - br * 0.5);
    const l = Math.max(-lMax, Math.min(lMax, loc.l));
    plow.held.push({ id: body.id, f, l, at: now, mass });
    heldIds.add(body.id);
    captured += 1;
  }
  if (captured > 0 && bus) bus.emit('fields:plowCaptured', { count: captured, held: plow.held.length, capacity: k.capacity });
  return plow.held.length;
}

/** Launch everything aboard along the nose. Returns how many bodies left. */
export function launchPlow({ state, rt, player, bus }) {
  const k = FIELD_DEFS.cone.plow;
  const plow = ensurePlow(rt);
  if (!player || !player.pos || plow.held.length === 0) { plow.held.length = 0; return 0; }
  const rot = finite(player.rot);
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  const now = finite(state.simTime, (state.tick | 0) / 60);
  let n = 0;
  const ids = [];
  for (const rec of plow.held) {
    const body = state.entities && state.entities.get ? state.entities.get(rec.id) : null;
    if (!body || body.alive === false) continue;
    const m = bodyMass(body);
    const vx = pvx + fx * k.launchSpeed;
    const vz = pvz + fz * k.launchSpeed;
    const impulse = { x: (vx - finite(body.vel && body.vel.x)) * m, z: (vz - finite(body.vel && body.vel.z)) * m };
    queuePhysicsImpulse(body, impulse, { tick: state.tick, provenance: 'plow_launch' });
    // The player's kick: what this body hits in the next seconds is the player's doing.
    recordImpulseProvenance(body, {
      tag: 'plow_launch', actorId: player.id, appliedTick: state.tick | 0,
      magnitude: Math.hypot(impulse.x, impulse.z), by: player.id, at: now, impulse, kickHops: 0,
    });
    body.data = body.data || {};
    body.data.energisedUntil = now + k.energisedS;
    body.data.energisedBy = player.id;
    ids.push(body.id);
    n += 1;
  }
  plow.held.length = 0;
  plow.launchedAt = now;
  plow.launchedCount = n;
  if (bus) {
    bus.emit('fields:plowLaunched', {
      count: n, ids, dir: { x: fx, z: fz }, speed: k.launchSpeed,
      shipVel: { x: pvx, z: pvz }, energisedUntil: now + k.energisedS,
    });
  }
  return n;
}
