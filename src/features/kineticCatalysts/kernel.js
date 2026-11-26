// Pure, bounded XZ effect kernel. This module never moves an entity, creates loot, or
// writes a capacitor. Its adapter pays capCost and submits impulses to physicsAuthority.
import { KINETIC_LIMITS as L, resolveCatalyst } from './catalog.js';

const DEBRIS = new Set(['debris', 'wreck', 'wreckage', 'cargo', 'pickup', 'pod', 'salvage', 'asteroidChunk', 'fragment']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const length = (v) => Math.hypot(v.x, v.z);
const validId = (id) => (Number.isSafeInteger(id) && id >= 0) || (typeof id === 'string' && id.length > 0 && id.length <= 128);
const generationOf = (body) => {
  const value = body?.generation ?? body?.occupantGeneration ?? null;
  return value == null || Number.isSafeInteger(value) || (typeof value === 'string' && value.length <= 128) ? value : null;
};
const identity = (body) => ({ id: body.id, generation: generationOf(body) });
const matches = (ref, body) => !!ref && !!body && ref.id === body.id && ref.generation === generationOf(body);
const compareId = (a, b) => typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : String(a.id).localeCompare(String(b.id), 'en');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function point(raw) {
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)
    || Math.abs(raw.x) > L.maxCoordinate || Math.abs(raw.z) > L.maxCoordinate) return null;
  return { x: raw.x, z: raw.z };
}

function bodyView(raw) {
  if (!raw || !validId(raw.id) || raw.alive === false || raw.dynamic === false || raw.kinematic === true) return null;
  const pos = point(raw.pos || raw);
  const velocity = raw.vel || { x: raw.vx, z: raw.vz };
  if (!pos || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.z)
    || Math.abs(velocity.x) > L.maxVelocity || Math.abs(velocity.z) > L.maxVelocity) return null;
  const mass = finite(raw.mass, finite(raw.physicsBody?.mass, 1));
  if (mass < L.minMass || mass > L.maxMass) return null;
  return {
    id: raw.id, generation: generationOf(raw), pos, vel: { x: velocity.x, z: velocity.z },
    mass, baseMass: clamp(finite(raw.baseMass, mass), L.minMass, L.maxMass),
    radius: clamp(finite(raw.radius, 4), 0.1, 1000), kind: raw.kind || raw.type || 'debris',
    pinned: raw.pinned === true, hitched: typeof raw.hitched === 'boolean' ? raw.hitched : raw.pinned === true,
    dynamic: true, alive: true,
    ownPullAcceleration: point(raw.ownPullAcceleration) || { x: 0, z: 0 },
    cap: clamp(finite(raw.cap), 0, 1e6), rot: finite(raw.rot),
  };
}

function frameView(frame = {}) {
  const player = bodyView(frame.player);
  const bodies = [], index = new Map();
  // The adapter sends a deterministic bounded neighbourhood, with referenced bodies first.
  for (const raw of (Array.isArray(frame.bodies) ? frame.bodies : []).slice(0, L.maxBodies)) {
    const body = bodyView(raw);
    if (!body || index.has(body.id)) continue;
    bodies.push(body); index.set(body.id, body);
  }
  if (player) index.set(player.id, player);
  return { now: clamp(finite(frame.now), 0, 1e12), tick: clamp(Math.trunc(finite(frame.tick)), 0, Number.MAX_SAFE_INTEGER),
    dt: clamp(finite(frame.dt, 1 / 60), 0, L.maxStep), player, bodies, index };
}

function empty(seed = 1) {
  return { schemaVersion: 1, seed: seed >>> 0, fittedId: null, ownerId: null, ownerGeneration: null,
    sequence: 0, orbit: [], echo: null, bridge: null, bridgeAnchor: null,
    cooldowns: { echoUntil: 0 }, rigActive: false, seen: [], lastStepTick: -1,
    bridgeTransferTick: -1, bridgeTransferCount: 0 };
}

function result() { return { impulses: [], capCost: 0, cues: [], changed: false }; }
function addCue(out, catalystId, kind, detail = {}) {
  if (out.cues.length < 24) out.cues.push({ kind, catalystId, ...detail });
  out.changed = true;
}
function pay(out, frame, amount) {
  amount = Math.max(0, finite(amount));
  if (!frame.player || out.capCost + amount > frame.player.cap + 1e-9) return false;
  out.capCost += amount; return true;
}
function limitedVector(x, z, limit) {
  const size = Math.hypot(x, z), scale = size > limit && size > 0 ? limit / size : 1;
  return { x: x * scale, z: z * scale };
}
function virtualVelocity(body, velocities) {
  if (!velocities.has(body.id)) velocities.set(body.id, { ...body.vel });
  return velocities.get(body.id);
}

/** Largest multiplier in [0,1] whose kinetic work a*s²+b*s does not exceed work. */
function workScale(a, b, work) {
  if (!(a > 0)) return 0;
  if (a + b <= work + 1e-9) return 1;
  const root = Math.sqrt(Math.max(0, b * b + 4 * a * work));
  // Stable positive root: avoid catastrophic subtraction when b is large and positive.
  const scale = b >= 0 ? (work > 0 ? 2 * work / (b + root) : 0) : (root - b) / (2 * a);
  return clamp(finite(scale), 0, 1);
}

function pushImpulse(state, out, body, impulse, reason, chainId = null) {
  if (out.impulses.length >= L.maxEffects || !(Math.hypot(impulse.x, impulse.z) > 1e-9)) return false;
  out.impulses.push({ bodyId: body.id, generation: body.generation,
    x: impulse.x, z: impulse.z, reason, origin: 'kineticCatalysts', depth: 1,
    chainId: chainId || `kinetic:${++state.sequence}` });
  out.changed = true; return true;
}

// Equal-and-opposite impulses with an explicit capacitor work budget. No position/velocity
// writes, no hidden steering authority, and no energy from a second stale velocity sample.
function pairImpulse(state, out, a, b, x, z, work, reason, velocities = new Map()) {
  const vA = virtualVelocity(a, velocities), vB = virtualVelocity(b, velocities);
  let j = limitedVector(x, z, Math.min(L.maxImpulse, L.maxDeltaV * a.mass, L.maxDeltaV * b.mass));
  const quadratic = 0.5 * (j.x * j.x + j.z * j.z) * (1 / a.mass + 1 / b.mass);
  const linear = j.x * (vA.x - vB.x) + j.z * (vA.z - vB.z);
  const scale = workScale(quadratic, linear, Math.max(0, work));
  j = { x: j.x * scale, z: j.z * scale };
  if (length(j) <= 1e-9 || out.impulses.length + 2 > L.maxEffects) return { x: 0, z: 0, work: 0 };
  const chainId = `kinetic:${++state.sequence}`;
  pushImpulse(state, out, a, j, reason, chainId);
  pushImpulse(state, out, b, { x: -j.x, z: -j.z }, `${reason}:reaction`, chainId);
  vA.x += j.x / a.mass; vA.z += j.z / a.mass;
  vB.x -= j.x / b.mass; vB.z -= j.z / b.mass;
  return { ...j, work: quadratic * scale * scale + linear * scale };
}

function eventKey(event, frame) {
  if (typeof event.eventId === 'string' || Number.isSafeInteger(event.eventId)) return String(event.eventId).slice(0, 180);
  return `${event.power}:${frame.tick}:${event.bodyId ?? ''}:${event.seedId ?? ''}:${event.sourceId ?? ''}:${event.active ?? ''}`;
}
function remember(state, key) {
  if (state.seen.includes(key)) return false;
  state.seen.push(key); if (state.seen.length > L.maxEventHistory) state.seen.shift();
  return true;
}
function orbitalEligible(body, player) {
  return body.id !== player.id && DEBRIS.has(body.kind) && !body.hitched
    && body.baseMass <= L.orbit.maxBodyMass && body.radius <= L.orbit.maxBodyRadius;
}
function bridgeEligible(body, player) {
  return !!body && body.id !== player.id && body.kind !== 'fieldEmitter' && body.kind !== 'massSeed'
    && body.kind !== 'station' && body.kind !== 'gate';
}

/**
 * Public pure runtime. Each operation returns an atomic command bundle; capCost has already
 * been checked against the frame's available capacitor. The adapter must pay it synchronously
 * before submitting the bundle. A failed/foreign fitting resolves to no catalyst.
 */
export function createKineticCatalystKernel({ seed = 1 } = {}) {
  let state = empty(seed);

  function clearTransient(reason, out) {
    if (state.orbit.length) addCue(out, state.fittedId, 'orbit_lost', { bodyIds: state.orbit.map(r => r.id), reason });
    if (state.echo) addCue(out, state.fittedId, 'echo_cancelled', { ...echoTell(state.echo), reason });
    if (state.bridge) addCue(out, state.fittedId, 'bridge_broken', { bodyIds: [state.bridge.a.id, state.bridge.b.id], reason });
    state.orbit = []; state.echo = null; state.bridge = null; state.bridgeAnchor = null;
    state.rigActive = false; state.lastStepTick = -1;
  }

  function owner(frame, out) {
    if (!frame.player) { clearTransient('owner_missing', out); return false; }
    if (state.ownerId !== frame.player.id || state.ownerGeneration !== frame.player.generation) {
      clearTransient('owner_changed', out);
      state.ownerId = frame.player.id; state.ownerGeneration = frame.player.generation;
    }
    return !!state.fittedId;
  }

  function echoTell(echo) {
    return { center: { ...echo.center }, radius: echo.radius, createdAt: echo.createdAt,
      dueAt: echo.dueAt, strength: echo.strength, bodyIds: [] };
  }

  function prune(frame, out) {
    state.orbit = state.orbit.filter(ref => {
      const body = frame.index.get(ref.id);
      const ok = matches(ref, body) && orbitalEligible(body, frame.player)
        && distance(body.pos, frame.player.pos) <= L.orbit.maxDistance
        && frame.now - ref.acquiredAt < L.orbit.maxLifetime;
      if (!ok) addCue(out, state.fittedId, 'orbit_lost', { bodyIds: [ref.id], reason: body?.hitched ? 'pinned' : 'body_lost_or_out_of_range' });
      return ok;
    });
    const anchor = state.bridgeAnchor && frame.index.get(state.bridgeAnchor.id);
    if (state.bridgeAnchor && (!matches(state.bridgeAnchor, anchor) || !anchor.pinned)) state.bridgeAnchor = null;
    if (state.bridge) {
      const a = frame.index.get(state.bridge.a.id), b = frame.index.get(state.bridge.b.id);
      if (!matches(state.bridge.a, a) || !matches(state.bridge.b, b) || !a.pinned
        || distance(a.pos, b.pos) > L.bridge.maxDistance || frame.now >= state.bridge.expiresAt) {
        addCue(out, state.fittedId, 'bridge_broken', { bodyIds: [state.bridge.a.id, state.bridge.b.id], reason: 'pin_body_range_or_lifetime' });
        state.bridge = null;
      }
    }
  }

  function capture(event, frame, out) {
    if (state.rigActive || state.orbit.length >= L.orbit.capacity) return;
    const center = point(event.center) || frame.player.pos;
    const radius = clamp(finite(event.radius, 190), 1, 520);
    const already = new Set(state.orbit.map(r => r.id));
    let mass = state.orbit.reduce((sum, ref) => sum + (frame.index.get(ref.id)?.baseMass || 0), 0);
    const candidates = frame.bodies.filter(body => !already.has(body.id) && orbitalEligible(body, frame.player)
      && distance(body.pos, frame.player.pos) <= L.orbit.captureDistance
      && distance(body.pos, center) <= radius);
    candidates.sort((a, b) => Number(b.id === event.targetId) - Number(a.id === event.targetId)
      || distance(a.pos, frame.player.pos) - distance(b.pos, frame.player.pos) || compareId(a, b));
    for (const body of candidates) {
      if (state.orbit.length >= L.orbit.capacity) break;
      if (mass + body.baseMass > L.orbit.maxTotalMass || !pay(out, frame, L.orbit.captureCost)) continue;
      const dx = body.pos.x - frame.player.pos.x, dz = body.pos.z - frame.player.pos.z;
      const spin = dx * (body.vel.z - frame.player.vel.z) - dz * (body.vel.x - frame.player.vel.x);
      const sign = Math.abs(spin) > 1e-6 ? Math.sign(spin) : ((state.seed + state.sequence + state.orbit.length) & 1 ? 1 : -1);
      const radius = Math.max(L.orbit.radius + state.orbit.length * L.orbit.ringSpacing,
        frame.player.radius + body.radius + 14);
      state.orbit.push({ ...identity(body), radius, sign, acquiredAt: frame.now });
      mass += body.baseMass;
      addCue(out, state.fittedId, 'orbit_capture', { bodyIds: [body.id], radius, mass: body.mass });
    }
  }

  function releaseOrbit(frame, out, count = L.orbit.capacity, reason = 'shove') {
    const released = state.orbit.splice(0, count), velocities = new Map(), positions = [], bodyIds = [];
    let energyBefore = 0, energyAfter = 0;
    for (const ref of released) {
      const body = frame.index.get(ref.id);
      if (!matches(ref, body)) continue;
      const vp = virtualVelocity(frame.player, velocities), vb = virtualVelocity(body, velocities);
      const dx = body.pos.x - frame.player.pos.x, dz = body.pos.z - frame.player.pos.z;
      const r = Math.max(1e-6, Math.hypot(dx, dz)), nx = dx / r, nz = dz / r;
      const vx = vb.x - vp.x, vz = vb.z - vp.z;
      const radial = vx * nx + vz * nz, tangential = vx * -nz + vz * nx;
      const retention = L.orbit.releaseRetention;
      const targetX = (-nz * tangential + nx * Math.max(0, radial)) * retention;
      const targetZ = (nx * tangential + nz * Math.max(0, radial)) * retention;
      const reducedMass = 1 / (1 / body.mass + 1 / frame.player.mass);
      energyBefore += 0.5 * reducedMass * (vx * vx + vz * vz);
      const impulse = pairImpulse(state, out, body, frame.player,
        reducedMass * (targetX - vx), reducedMass * (targetZ - vz), 0, `orbit_release:${reason}`, velocities);
      const rx = vx + impulse.x / reducedMass, rz = vz + impulse.z / reducedMass;
      energyAfter += 0.5 * reducedMass * (rx * rx + rz * rz);
      positions.push({ id: body.id, x: body.pos.x, z: body.pos.z, vx: vb.x, vz: vb.z }); bodyIds.push(body.id);
    }
    if (bodyIds.length) addCue(out, state.fittedId, 'orbit_release', { bodyIds, positions, reason, energyBefore, energyAfter });
  }

  function orbitStep(frame, out) {
    if (!state.orbit.length) return;
    const cost = state.orbit.length * L.orbit.drainPerBody * frame.dt * (state.rigActive ? L.orbit.rigDrainMultiplier : 1);
    if (!pay(out, frame, cost)) {
      addCue(out, state.fittedId, 'orbit_starved', { bodyIds: state.orbit.map(r => r.id), reason: 'capacitor_empty' });
      state.orbit = []; return;
    }
    const plans = []; let totalMass = 0, weightedX = 0, weightedZ = 0;
    for (const ref of state.orbit) {
      const body = frame.index.get(ref.id), vb = body.vel, vp = frame.player.vel;
      const dx = body.pos.x - frame.player.pos.x, dz = body.pos.z - frame.player.pos.z;
      const r = Math.max(1, Math.hypot(dx, dz)), nx = dx / r, nz = dz / r;
      const tx = -nz * ref.sign, tz = nx * ref.sign;
      const rvx = vb.x - vp.x, rvz = vb.z - vp.z;
      const vr = rvx * nx + rvz * nz, vt = rvx * tx + rvz * tz;
      const speed = state.rigActive ? 0 : L.orbit.speed / (1 + body.baseMass / L.orbit.maxBodyMass);
      const radialA = -vt * vt / Math.max(ref.radius, r) - L.orbit.spring * (r - ref.radius) - L.orbit.radialDamping * vr;
      const tangentA = (speed - vt) * L.orbit.tangentialDamping;
      // Only the adapter's proved, accepted own-Pull acceleration is compensated. Mixed or
      // hostile fields remain a disturbance. The field's net momentum goes into the pair's
      // centre of mass: the magazine is a load on the carrier, never a free fixed anchor.
      const ownPull = limitedVector(body.ownPullAcceleration.x, body.ownPullAcceleration.z, 820);
      const ax = nx * radialA + tx * tangentA - ownPull.x;
      const az = nz * radialA + tz * tangentA - ownPull.z;
      plans.push({ body, x: body.mass * ax * frame.dt, z: body.mass * az * frame.dt });
      totalMass += body.mass; weightedX += body.mass * ax * frame.dt; weightedZ += body.mass * az * frame.dt;
    }
    // Solve all satellite/carrier reactions together. For each load, J_i/m_i + ΣJ/m_p
    // is its relative delta-V. Independent pair solves let one heavy load drag the carrier
    // through a previously solved orbit. This is the exact inverse of that small mass matrix.
    const sumX = weightedX / (1 + totalMass / frame.player.mass);
    const sumZ = weightedZ / (1 + totalMass / frame.player.mass);
    let scale = 1, recoilX = 0, recoilZ = 0;
    for (const plan of plans) {
      plan.x -= plan.body.mass / frame.player.mass * sumX;
      plan.z -= plan.body.mass / frame.player.mass * sumZ;
      const limit = Math.min(L.maxImpulse, L.orbit.maxForce * frame.dt, L.maxDeltaV * plan.body.mass);
      const magnitude = Math.hypot(plan.x, plan.z);
      if (magnitude > limit) scale = Math.min(scale, limit / magnitude);
      recoilX -= plan.x; recoilZ -= plan.z;
    }
    const recoilSize = Math.hypot(recoilX, recoilZ);
    const recoilLimit = Math.min(L.maxImpulse, L.maxDeltaV * frame.player.mass);
    if (recoilSize > recoilLimit) scale = Math.min(scale, recoilLimit / recoilSize);
    let quadratic = (recoilX * recoilX + recoilZ * recoilZ) / (2 * frame.player.mass);
    let linear = recoilX * frame.player.vel.x + recoilZ * frame.player.vel.z;
    for (const plan of plans) {
      quadratic += (plan.x * plan.x + plan.z * plan.z) / (2 * plan.body.mass);
      linear += plan.x * plan.body.vel.x + plan.z * plan.body.vel.z;
    }
    scale *= workScale(quadratic * scale * scale, linear * scale, cost * L.workPerCap);
    const chainId = `kinetic:orbit:${++state.sequence}`;
    for (const plan of plans) pushImpulse(state, out, plan.body,
      { x: plan.x * scale, z: plan.z * scale }, 'orbit_hold', chainId);
    pushImpulse(state, out, frame.player, { x: recoilX * scale, z: recoilZ * scale }, 'orbit_hold:reaction', chainId);
  }

  function armEcho(event, frame, out) {
    if (state.echo || frame.now < state.cooldowns.echoUntil || !pay(out, frame, L.echo.cost)) return;
    const center = point(event.center) || { ...frame.player.pos };
    state.echo = { id: ++state.sequence, center, radius: Math.min(L.echo.radius,
      clamp(finite(event.radius, 170), 1, 520) * L.echo.radiusScale),
    createdAt: frame.now, dueAt: frame.now + L.echo.delay, strength: L.echo.impulse,
    extended: false, grounded: false, payloadBled: false, vented: false };
    state.cooldowns.echoUntil = frame.now + L.echo.cooldown;
    addCue(out, state.fittedId, 'echo_armed', echoTell(state.echo));
  }

  function echoPower(event, frame, out) {
    if (event.power === 'shove') { armEcho(event, frame, out); return; }
    const echo = state.echo;
    if (!echo) return;
    if (event.power === 'pull' && !echo.extended && !echo.vented && pay(out, frame, L.echo.pullCost)) {
      echo.extended = true; echo.dueAt += L.echo.pullDelay; echo.strength *= 0.92;
      addCue(out, state.fittedId, 'echo_delayed', echoTell(echo));
    } else if (event.power === 'pin' && !echo.grounded && validId(event.seedId)
      && point(event.center) && distance(event.center, echo.center) <= echo.radius) {
      echo.grounded = true; echo.radius *= L.echo.pinRadiusScale; echo.strength *= 0.85;
      addCue(out, state.fittedId, 'echo_grounded', echoTell(echo));
    } else if (event.power === 'bomb' && !echo.payloadBled) {
      const body = frame.index.get(event.bodyId);
      if (!body || body.id === frame.player.id || distance(body.pos, echo.center) > echo.radius
        || !pay(out, frame, L.echo.payloadCost)) return;
      const dx = body.pos.x - echo.center.x, dz = body.pos.z - echo.center.z;
      const r = Math.hypot(dx, dz), nx = r > 1e-6 ? dx / r : Math.cos(frame.player.rot), nz = r > 1e-6 ? dz / r : Math.sin(frame.player.rot);
      const j = echo.strength * L.echo.payloadFraction;
      pairImpulse(state, out, body, frame.player, nx * j, nz * j, L.echo.payloadCost * L.workPerCap, 'echo_payload');
      echo.payloadBled = true; echo.strength *= 1 - L.echo.payloadFraction;
      addCue(out, state.fittedId, 'echo_payload', { ...echoTell(echo), bodyIds: [body.id] });
    } else if (event.power === 'rig' && event.active === true && !echo.vented) {
      echo.vented = true; echo.strength *= 0.35;
      echo.dueAt = Math.min(echo.dueAt, Math.max(echo.createdAt + L.echo.ventDelay, frame.now + 0.1));
      addCue(out, state.fittedId, 'echo_vented', echoTell(echo));
    }
  }

  function echoStep(frame, out) {
    const echo = state.echo;
    if (!echo || frame.now + 1e-9 < echo.dueAt) return;
    state.echo = null; // retire before effects: a synchronous callback cannot echo the echo.
    const candidates = [...frame.bodies.filter(b => b.id !== frame.player.id), frame.player]
      .filter(body => distance(body.pos, echo.center) < echo.radius)
      .sort((a, b) => distance(a.pos, echo.center) - distance(b.pos, echo.center) || compareId(a, b))
      .slice(0, L.echo.maxTargets);
    let remainingImpulse = L.echo.maxTotalImpulse;
    let remainingWork = L.echo.cost * L.workPerCap * Math.pow(echo.strength / L.echo.impulse, 2);
    let work = 0, totalImpulse = 0; const bodyIds = [];
    for (const body of candidates) {
      const dx = body.pos.x - echo.center.x, dz = body.pos.z - echo.center.z, r = Math.hypot(dx, dz);
      // Coincident bodies have a deterministic direction; no NaN and no shared RNG consumption.
      const angle = (state.seed % 997 + (typeof body.id === 'number' ? body.id : body.id.length)) * 2.399963229728653;
      const nx = r > 1e-6 ? dx / r : Math.cos(angle), nz = r > 1e-6 ? dz / r : Math.sin(angle);
      const magnitude = Math.min(echo.strength * Math.pow(1 - r / echo.radius, 1.3),
        body.mass * L.echo.maxDeltaV, remainingImpulse, L.maxImpulse);
      const a = magnitude * magnitude / (2 * body.mass);
      const b = magnitude * (nx * body.vel.x + nz * body.vel.z);
      const scale = workScale(a, b, remainingWork), j = magnitude * scale;
      if (!(j > 1e-9)) continue;
      const deltaWork = a * scale * scale + b * scale;
      if (pushImpulse(state, out, body, { x: nx * j, z: nz * j }, 'aftershock_echo', `kinetic:echo:${echo.id}`)) {
        remainingImpulse -= j; remainingWork -= Math.max(0, deltaWork);
        totalImpulse += j; work += deltaWork; bodyIds.push(body.id);
      }
    }
    addCue(out, state.fittedId, 'echo_hit', { ...echoTell(echo), bodyIds, totalImpulse, work,
      paidWorkBudget: L.echo.cost * L.workPerCap * Math.pow(echo.strength / L.echo.impulse, 2) });
  }

  function linkBridge(event, frame, out, thrown = false) {
    const a = state.bridgeAnchor && frame.index.get(state.bridgeAnchor.id);
    if (!matches(state.bridgeAnchor, a) || !a.pinned) return;
    const wantedId = thrown ? event.bodyId : event.targetId;
    let b = frame.index.get(wantedId);
    if (!b && !thrown) {
      const center = point(event.center) || frame.player.pos;
      b = frame.bodies.filter(body => body.id !== a.id && bridgeEligible(body, frame.player)
        && distance(body.pos, a.pos) <= L.bridge.maxDistance
        && distance(body.pos, center) <= clamp(finite(event.radius, 190), 1, 520))
        .sort((x, y) => distance(x.pos, center) - distance(y.pos, center) || compareId(x, y))[0];
    }
    if (!b || b.id === a.id || !bridgeEligible(b, frame.player)
      || distance(a.pos, b.pos) > L.bridge.maxDistance
      || (state.bridge && matches(state.bridge.b, b)) || !pay(out, frame, L.bridge.linkCost)) return;
    state.bridge = { a: identity(a), b: identity(b), seedId: state.bridgeAnchor.seedId ?? null,
      restLength: Math.max(a.radius + b.radius + 4, distance(a.pos, b.pos)),
      createdAt: frame.now, expiresAt: frame.now + L.bridge.maxLifetime,
      braced: state.rigActive, lastTransferAt: -1, lastSourceId: null };
    addCue(out, state.fittedId, 'bridge_linked', { bodyIds: [a.id, b.id], restLength: state.bridge.restLength,
      fromBomb: thrown, expiresAt: state.bridge.expiresAt });
  }

  function bridgePower(event, frame, out) {
    if (event.power === 'pin') {
      const body = frame.index.get(event.bodyId ?? event.targetId);
      if (!body || !body.pinned || !bridgeEligible(body, frame.player)) return;
      if (state.bridge && !matches(state.bridge.a, body)) {
        addCue(out, state.fittedId, 'bridge_broken', { bodyIds: [state.bridge.a.id, state.bridge.b.id], reason: 'anchor_replaced' });
        state.bridge = null;
      }
      state.bridgeAnchor = { ...identity(body), seedId: validId(event.seedId) ? event.seedId : null };
      addCue(out, state.fittedId, 'bridge_anchor', { bodyIds: [body.id] });
    } else if (event.power === 'pull') linkBridge(event, frame, out);
    else if (event.power === 'bomb') linkBridge(event, frame, out, true);
    else if (event.power === 'rig' && state.bridge) {
      state.bridge.braced = event.active === true;
      addCue(out, state.fittedId, 'bridge_braced', { bodyIds: [state.bridge.a.id, state.bridge.b.id], active: state.bridge.braced });
    }
  }

  function bridgeStep(frame, out) {
    const bridge = state.bridge;
    if (!bridge) return;
    const cost = frame.dt * (bridge.braced ? L.bridge.bracedDrain : L.bridge.drain);
    if (!pay(out, frame, cost)) {
      addCue(out, state.fittedId, 'bridge_broken', { bodyIds: [bridge.a.id, bridge.b.id], reason: 'capacitor_empty' });
      state.bridge = null; return;
    }
    const a = frame.index.get(bridge.a.id), b = frame.index.get(bridge.b.id);
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
    const rest = bridge.restLength * (bridge.braced ? 0.82 : 1);
    if (dist <= rest || dist <= 1e-6) return;
    const nx = dx / dist, nz = dz / dist;
    const separating = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
    const force = clamp((dist - rest) * L.bridge.spring + separating * L.bridge.damping, 0, L.bridge.maxForce);
    pairImpulse(state, out, a, b, nx * force * frame.dt, nz * force * frame.dt,
      cost * L.workPerCap, 'bridge_tension');
  }

  function setFitted(id, rawFrame = {}) {
    const out = result(), frame = frameView(rawFrame), next = resolveCatalyst(id)?.id || null;
    if (state.fittedId !== next) {
      clearTransient('fitting_changed', out); state.fittedId = next; state.seen = [];
      out.changed = true;
    }
    if (frame.player) owner(frame, out);
    return out;
  }

  function handlePower(event = {}, rawFrame = {}) {
    const out = result(), frame = frameView(rawFrame);
    if (!owner(frame, out) || event.origin === 'kineticCatalysts' || finite(event.depth) > 0
      || (event.ownerId != null && event.ownerId !== frame.player.id)
      || (event.sourceId != null && event.sourceId !== frame.player.id)
      || !['pull', 'shove', 'pin', 'bomb', 'rig'].includes(event.power)) return out;
    prune(frame, out);
    if (!remember(state, eventKey(event, frame))) return out;
    if (event.power === 'rig') state.rigActive = event.active === true;
    if (state.fittedId === 'orbital_magazine') {
      if (event.power === 'pull') capture(event, frame, out);
      else if (event.power === 'shove') releaseOrbit(frame, out);
      else if (event.power === 'bomb') releaseOrbit(frame, out, 1, 'bomb_screen');
      else if (event.power === 'rig') addCue(out, state.fittedId, 'orbit_brake', { active: state.rigActive, bodyIds: state.orbit.map(r => r.id) });
      // PIN is observed by prune: genuinely hitched/pinned bodies cannot be held twice.
    } else if (state.fittedId === 'aftershock_core') echoPower(event, frame, out);
    else if (state.fittedId === 'load_bridge') bridgePower(event, frame, out);
    return out;
  }

  function step(rawFrame = {}) {
    const out = result(), frame = frameView(rawFrame);
    if (!owner(frame, out) || state.lastStepTick === frame.tick) return out;
    state.lastStepTick = frame.tick;
    prune(frame, out);
    if (state.fittedId === 'orbital_magazine') orbitStep(frame, out);
    else if (state.fittedId === 'aftershock_core') echoStep(frame, out);
    else if (state.fittedId === 'load_bridge') bridgeStep(frame, out);
    return out;
  }

  /**
   * Split a real external impulse before application, or compensate a real impact afterwards.
   * For alreadyApplied, the adapter queues (result.impulse - input.impulse) at the source.
   * Both paths reduce the prospective pair's kinetic energy and preserve total momentum.
   */
  function transferImpulse(input = {}, rawFrame = {}) {
    const out = result(), frame = frameView(rawFrame);
    const incoming = { x: finite(input.impulse?.x), z: finite(input.impulse?.z) };
    Object.assign(out, { accepted: false, impulse: { ...incoming }, partnerImpulse: null });
    if (!owner(frame, out) || state.fittedId !== 'load_bridge') return out;
    prune(frame, out);
    const bridge = state.bridge;
    if (!bridge || input.origin === 'kineticCatalysts' || input.source === 'kineticCatalysts'
      || input.provenance?.source === 'kineticCatalysts'
      || input.evidence?.origin === 'kineticCatalysts' || input.evidence?.source === 'kineticCatalysts'
      || input.evidence?.provenance?.source === 'kineticCatalysts'
      || finite(input.depth ?? input.evidence?.depth) > 0 || String(input.chainId || '').startsWith('kinetic:')
      || String(input.reason || '').startsWith('bridge_')) return out;
    const sourceRef = bridge.a.id === input.bodyId ? bridge.a : bridge.b.id === input.bodyId ? bridge.b : null;
    if (!sourceRef) return out;
    const partnerRef = sourceRef === bridge.a ? bridge.b : bridge.a;
    const a = frame.index.get(sourceRef.id), b = frame.index.get(partnerRef.id);
    if (!matches(sourceRef, a) || !matches(partnerRef, b)) return out;
    if (input.generation != null && input.generation !== a.generation) return out;
    const magnitude = length(incoming);
    if (!(magnitude > 1e-6) || magnitude > 1e12) return out;
    const key = `impulse:${input.eventId ?? input.chainId ?? `${frame.tick}:${a.id}:${incoming.x}:${incoming.z}`}`.slice(0, 180);
    if (state.seen.includes(key)) return out;
    if (state.bridgeTransferTick !== frame.tick) { state.bridgeTransferTick = frame.tick; state.bridgeTransferCount = 0; }
    if (state.bridgeTransferCount >= L.bridge.maxTransfersPerTick) return out;
    // The transfer follows the incoming impulse direction. It can only proceed while that
    // direction tends to equalize velocities; a partner already running faster is not boosted.
    const postX = a.vel.x + (input.alreadyApplied ? 0 : incoming.x / a.mass);
    const postZ = a.vel.z + (input.alreadyApplied ? 0 : incoming.z / a.mass);
    const linear = incoming.x * (b.vel.x - postX) + incoming.z * (b.vel.z - postZ);
    const quadratic = 0.5 * magnitude * magnitude * (1 / a.mass + 1 / b.mass);
    const energyFraction = linear < 0 ? -linear / quadratic : 0;
    const fraction = Math.min(bridge.braced ? L.bridge.bracedFraction : L.bridge.fraction,
      2 * b.mass / (a.mass + b.mass), energyFraction,
      L.bridge.maxTransferImpulse / magnitude, L.bridge.maxTransferDeltaV * b.mass / magnitude,
      L.bridge.maxTransferDeltaV * a.mass / magnitude);
    if (!(fraction > 1e-9)) return out;
    const transfer = { x: incoming.x * fraction, z: incoming.z * fraction };
    const capCost = L.bridge.transferCost + length(transfer) / 400;
    if (!pay(out, frame, capCost)) return out;
    remember(state, key); state.bridgeTransferCount++; bridge.lastTransferAt = frame.now; bridge.lastSourceId = a.id;
    out.accepted = true;
    out.impulse = { x: incoming.x - transfer.x, z: incoming.z - transfer.z };
    out.partnerImpulse = { bodyId: b.id, generation: b.generation, ...transfer };
    pushImpulse(state, out, b, transfer, 'bridge_transfer', `kinetic:bridge:${++state.sequence}`);
    addCue(out, state.fittedId, 'bridge_transfer', { bodyIds: [a.id, b.id], fraction,
      impulse: length(transfer), work: linear * fraction + quadratic * fraction * fraction,
      from: { ...a.pos }, to: { ...b.pos }, alreadyApplied: input.alreadyApplied === true });
    return out;
  }

  function serialize() { return JSON.parse(JSON.stringify(state)); }

  function restore(raw, rawFrame = {}) {
    const out = result(), frame = frameView(rawFrame), oldFit = state.fittedId;
    state = empty(raw?.seed ?? state.seed);
    if (!raw || raw.schemaVersion !== 1) { state.fittedId = oldFit; owner(frame, out); return out; }
    state.fittedId = resolveCatalyst(raw.fittedId)?.id || null;
    state.sequence = clamp(Math.trunc(finite(raw.sequence)), 0, 1e12);
    state.ownerId = validId(raw.ownerId) ? raw.ownerId : null;
    state.ownerGeneration = raw.ownerGeneration ?? null;
    state.cooldowns.echoUntil = clamp(finite(raw.cooldowns?.echoUntil), 0, frame.now + L.echo.cooldown);
    state.seen = (Array.isArray(raw.seen) ? raw.seen : []).filter(k => typeof k === 'string' && k.length <= 180).slice(-L.maxEventHistory);
    state.rigActive = raw.rigActive === true;
    if (!frame.player || state.ownerId !== frame.player.id || state.ownerGeneration !== frame.player.generation) {
      owner(frame, out); return out;
    }
    if (state.fittedId === 'orbital_magazine') {
      const seen = new Set(); let mass = 0;
      for (const ref of (Array.isArray(raw.orbit) ? raw.orbit : []).slice(0, L.orbit.capacity)) {
        const body = frame.index.get(ref?.id);
        if (seen.has(ref?.id) || !matches(ref, body) || !orbitalEligible(body, frame.player)
          || mass + body.baseMass > L.orbit.maxTotalMass) continue;
        seen.add(body.id); mass += body.baseMass;
        state.orbit.push({ ...identity(body), radius: clamp(finite(ref.radius, L.orbit.radius), 16, 160),
          sign: ref.sign === -1 ? -1 : 1, acquiredAt: clamp(finite(ref.acquiredAt, frame.now), Math.max(0, frame.now - L.orbit.maxLifetime), frame.now) });
      }
    } else if (state.fittedId === 'aftershock_core' && raw.echo) {
      const echo = raw.echo, center = point(echo.center);
      if (center && Number.isFinite(echo.dueAt) && echo.dueAt >= frame.now
        && echo.dueAt <= frame.now + L.echo.delay + L.echo.pullDelay
        && Number.isFinite(echo.createdAt) && echo.createdAt <= frame.now && echo.createdAt >= frame.now - L.echo.delay - L.echo.pullDelay) {
        state.echo = { id: clamp(Math.trunc(finite(echo.id)), 0, 1e12), center,
          radius: clamp(finite(echo.radius), 1, L.echo.radius), strength: clamp(finite(echo.strength), 0, L.echo.impulse),
          createdAt: echo.createdAt, dueAt: echo.dueAt, extended: echo.extended === true,
          grounded: echo.grounded === true, payloadBled: echo.payloadBled === true, vented: echo.vented === true };
      }
    } else if (state.fittedId === 'load_bridge') {
      const anchor = frame.index.get(raw.bridgeAnchor?.id);
      if (matches(raw.bridgeAnchor, anchor) && anchor.pinned) state.bridgeAnchor = { ...identity(anchor),
        seedId: validId(raw.bridgeAnchor.seedId) ? raw.bridgeAnchor.seedId : null };
      const bridge = raw.bridge, a = frame.index.get(bridge?.a?.id), b = frame.index.get(bridge?.b?.id);
      if (bridge && matches(bridge.a, a) && matches(bridge.b, b) && a.id !== b.id && a.pinned
        && bridgeEligible(a, frame.player) && bridgeEligible(b, frame.player)
        && Number.isFinite(bridge.expiresAt) && bridge.expiresAt > frame.now && bridge.expiresAt <= frame.now + L.bridge.maxLifetime) {
        state.bridge = { a: identity(a), b: identity(b), seedId: validId(bridge.seedId) ? bridge.seedId : null,
          restLength: clamp(finite(bridge.restLength), a.radius + b.radius + 4, L.bridge.maxDistance),
          createdAt: clamp(finite(bridge.createdAt), Math.max(0, frame.now - L.bridge.maxLifetime), frame.now),
          expiresAt: bridge.expiresAt, braced: bridge.braced === true, lastTransferAt: finite(bridge.lastTransferAt, -1),
          lastSourceId: validId(bridge.lastSourceId) ? bridge.lastSourceId : null };
      }
    }
    prune(frame, out); out.changed = true; return out;
  }

  function snapshot(rawFrame = null) {
    // A no-frame snapshot is the adapter's lookup plan. It must keep referenced IDs even
    // before the adapter has gathered the world bodies needed for an enriched snapshot.
    if (!rawFrame) return {
      catalystId: state.fittedId, ownerId: state.ownerId, rigActive: state.rigActive,
      orbit: state.orbit.map(ref => ({ ...ref, bodyId: ref.id, orbitRadius: ref.radius })),
      echo: state.echo ? { ...echoTell(state.echo), x: state.echo.center.x, z: state.echo.center.z,
        id: state.echo.id, grounded: state.echo.grounded, vented: state.echo.vented } : null,
      bridge: state.bridge ? { ...state.bridge, a: { ...state.bridge.a }, b: { ...state.bridge.b },
        aId: state.bridge.a.id, bId: state.bridge.b.id, pinnedId: state.bridge.a.id,
        fraction: state.bridge.braced ? L.bridge.bracedFraction : L.bridge.fraction,
        lastImpulseAt: state.bridge.lastTransferAt } : null,
      bridgeAnchor: state.bridgeAnchor ? { ...state.bridgeAnchor } : null,
      pinnedId: state.bridgeAnchor?.id ?? null,
      cooldowns: { ...state.cooldowns }, stored: state.orbit.length,
    };
    const frame = frameView(rawFrame), p = frame.player;
    const describe = body => body && ({ id: body.id, x: body.pos.x, z: body.pos.z, vx: body.vel.x, vz: body.vel.z, radius: body.radius, mass: body.mass });
    return { catalystId: state.fittedId, owner: describe(p), rigActive: state.rigActive,
      orbit: state.orbit.map(ref => { const body = frame.index.get(ref.id); return matches(ref, body) ? { ...describe(body),
        bodyId: body.id, bodyRadius: body.radius, orbitRadius: ref.radius, sign: ref.sign, acquiredAt: ref.acquiredAt } : null; }).filter(Boolean),
      echo: state.echo ? { ...echoTell(state.echo), x: state.echo.center.x, z: state.echo.center.z,
        id: state.echo.id, grounded: state.echo.grounded, vented: state.echo.vented } : null,
      bridge: state.bridge ? { a: describe(frame.index.get(state.bridge.a.id)), b: describe(frame.index.get(state.bridge.b.id)),
        aId: state.bridge.a.id, bId: state.bridge.b.id, pinnedId: state.bridge.a.id,
        fraction: state.bridge.braced ? L.bridge.bracedFraction : L.bridge.fraction,
        braced: state.bridge.braced, restLength: state.bridge.restLength, lastImpulseAt: state.bridge.lastTransferAt,
        lastSourceId: state.bridge.lastSourceId, createdAt: state.bridge.createdAt, expiresAt: state.bridge.expiresAt } : null,
      cooldowns: { ...state.cooldowns }, stored: state.orbit.length,
    };
  }

  function clear(reason = 'cleanup') { const out = result(); clearTransient(reason, out); return out; }

  return { setFitted, handlePower, step, transferImpulse, serialize, restore, snapshot, clear };
}
